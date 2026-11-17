"""Browserprüfung der Notenverwaltung (ergänzt `npm test`, das nur die Rechen- und Speicherlogik prüft).

Aufruf:  python3 tests/browser/pruefung.py
Braucht: Python mit dem Paket „playwright“, Google Chrome (Pfad in CHROME anpassbar) und Node.js.
Es werden nur erfundene Namen verwendet. Die App läuft dabei über den eigenen Server (server/server.mjs)
mit einem leeren Datenordner, der danach gelöscht wird.

Geprüft wird: Prüffall aus SPEC Abschnitt 4, alle Ansichten ohne Fehler und ohne seitliches Überlaufen
(Handy, Tablet, Rechner), aufklappbares Menü, Synchronisation mit nachgebautem OneDrive
(gleichzeitige Uploads, Änderung während des Hochladens, Sicherungskopien) und die Server-Variante mit zwei Geräten.
"""
import json, os, shutil, subprocess, sys, tempfile, time
from playwright.sync_api import sync_playwright

WURZEL = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
PORT = int(os.environ.get('PORT', '8770'))
SCHLUESSEL = 'pruef-schluessel-0123456789'
ADRESSE = f'http://127.0.0.1:{PORT}/index.html'
fehler, ok = [], []

def pruefe(bedingung, text):
    (ok if bedingung else fehler).append(text)
    print(('  ok   ' if bedingung else '  FEHLT ') + text)

LADEN = '''async () => {
  const m = await import('./js/modell.js'); const a = await import('./js/aktionen.js');
  const d = m.neueKlasse({ klasse: 'TEST-A', lernfeldNr: '1', lernfeldBez: 'Testfeld', schuljahr: '2026/27' });
  const namen = [['Muster','Erika'],['Beispiel','Max'],['Probe','Sam'],['Vorlage','Kim'],['Entwurf','Toni'],['Platzhalter','Alex']];
  d.schueler = d.schueler.slice(0, namen.length); namen.forEach(([n,v],i)=>{d.schueler[i].name=n;d.schueler[i].vorname=v;});
  const p = d.schueler[0];
  const ka1 = m.neueKlassenarbeit(3); ka1.aufgaben=[15,15,15]; ka1.datum='2026-10-05'; ka1.ergebnisse[p.id]={punkte:[11,11,11],sonstiges:''};
  const ka2 = m.neueKlassenarbeit(2); ka2.aufgaben=[25,25]; ka2.ergebnisse[p.id]={punkte:[23,23],sonstiges:''};
  d.klassenarbeiten=[ka1,ka2];
  const t1=m.neuerTermin('2026-10-01','Gruppenarbeit'); t1.eintraege[p.id]={note:2.0,notiz:''};
  const t2=m.neuerTermin('2026-10-08','Vortrag'); t2.eintraege[p.id]={note:3.3,notiz:''};
  d.sonstige=[t1,t2];
  const buch = m.pruefeBuch(m.neuesBuch(d));
  a.setzeDokument(buch, { klasseId: buch.klassen[0].id, ziel: 'gesamt', name: 'Pruefung_2026-27.noten', pruefen: false });
  await new Promise(r=>setTimeout(r,300));
  const reg = await import('./js/registry.js');
  return { zeile: [...document.querySelectorAll('#ansicht tr')].map(t=>t.innerText.replace(/\\s+/g,' ')).find(t=>t.includes('Muster')) || '', ansichten: Object.keys(reg.ANSICHTEN) };
}'''

UEBERLAUF = '''(W) => { if (document.documentElement.scrollWidth <= W + 1) return null;
  const aus = []; for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (r.right > W + 1 && r.width > 0) {
    let p = el.parentElement, innen = false; while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { innen = true; break; } p = p.parentElement; }
    if (!innen && !aus.some(x => x.contains(el))) aus.push(el); } }
  return aus.slice(0,4).map(e => e.tagName.toLowerCase() + (e.id ? '#'+e.id : '') + (e.className ? '.'+String(e.className).split(' ').join('.') : '')).join(', ') || 'unbekannt'; }'''

NACHBAU = '''async () => {
  const { K } = await import('./js/kontext.js'); const ui = await import('./js/sync-ui.js');
  const s = await import('./js/sync.js'); const od = await import('./js/onedrive.js');
  const dateien = new Map(); let z = 0; const warte = (ms) => new Promise(r => setTimeout(r, ms));
  const client = {
    async meta(p) { const d = dateien.get(p); return d ? { eTag: d.etag } : null; },
    async lesen(p) { const d = dateien.get(p); return d ? { text: async () => d.text } : null; },
    async liste(o) { const vor = o ? o + '/' : ''; return [...dateien.keys()].filter(n => n.startsWith(vor) && !n.slice(vor.length).includes('/')).map(n => ({ name: n.slice(vor.length), geaendert: 0 })); },
    async hochladen(p, bytes, erw) { await warte(300); const d = dateien.get(p); if (d ? erw !== d.etag : !!erw) throw new s.SyncKonflikt(); dateien.set(p, { text: new TextDecoder().decode(bytes), etag: `"e${++z}"` }); return { eTag: dateien.get(p).etag }; },
    async ordnerSicherstellen() { return {}; },
    async loeschen(p) { dateien.delete(p); },
  };
  for (let t = 1; t <= 11; t++) dateien.set(`Sicherungen/Pruefung_2026-27_2026-10-${String(t).padStart(2,'0')}.noten`, { text: 'alt', etag: '"a"' });
  ui.onedriveClientSetzen(client); K.passwort = 'geheim-123'; K.sync = s.syncStarten(od.onedriveOrt(client, 'Pruefung_2026-27.noten'));
  const aus = {};
  await ui.syncSpeichern({ still: true });
  aus.gleichzeitig = await Promise.all([ui.syncSpeichern({ still: true }), ui.syncSpeichern({ still: true })]);
  aus.dialoge = document.querySelectorAll('dialog[open]').length;
  const lauf = ui.syncSpeichern({ still: true }); await warte(80); K.buch.klassen[0].kopf.lernfeldBez = 'geändert'; K.aenderung(); await lauf;
  aus.geaendertNachUpload = K.geaendert;
  await warte(5800); aus.geaendertAmEnde = K.geaendert;
  const sich = [...dateien.keys()].filter(n => n.startsWith('Sicherungen/')).sort();
  aus.sicherungen = sich.length; aus.aeltesteWeg = !sich.includes('Sicherungen/Pruefung_2026-27_2026-10-01.noten') && !sich.includes('Sicherungen/Pruefung_2026-27_2026-10-02.noten');
  aus.heuteDa = sich.some(n => !n.includes('_2026-10-'));
  // anderes Gerät ändert, hier ist nichts offen: Fassung wird beim Zurückkehren still geladen, Ansicht und Klasse bleiben
  const kr = await import('./js/krypto.js');
  const fremd = JSON.parse(JSON.stringify(K.buch)); fremd.klassen[0].kopf.lernfeldBez = 'vom anderen Gerät'; fremd.gespeichertAm = new Date().toISOString();
  dateien.set('Pruefung_2026-27.noten', { text: await kr.inDateitext(fremd, 'geheim-123'), etag: '"fremd1"' });
  location.hash = '#/ka'; await warte(200); const klasse = K.klasseId;
  await ui.fremdeAenderungPruefen(); await warte(200);
  aus.stillGeladen = K.buch.klassen[0].kopf.lernfeldBez === 'vom anderen Gerät' && K.klasseId === klasse && location.hash === '#/ka' && !K.geaendert;
  // beide Seiten geändert: Konfliktabfrage statt Überschreiben
  K.buch.klassen[0].kopf.lernfeldBez = 'meine Änderung'; K.aenderung();
  dateien.set('Pruefung_2026-27.noten', { text: await kr.inDateitext(fremd, 'geheim-123'), etag: '"fremd2"' });
  ui.fremdeAenderungPruefen(); await warte(900);
  aus.konfliktGefragt = [...document.querySelectorAll('dialog[open] h2')].some(h => /anderen Gerät/.test(h.textContent));
  aus.nichtUeberschrieben = dateien.get('Pruefung_2026-27.noten').etag === '"fremd2"';
  document.querySelector('dialog[open] .dialog-knoepfe button')?.click(); await warte(100);
  return aus;
}'''

def geraet(b, breite, hoehe, mobil):
    ctx = b.new_context(viewport={'width': breite, 'height': hoehe}, service_workers='block', has_touch=mobil, is_mobile=mobil)
    page = ctx.new_page()
    page.on('console', lambda m: fehler.append(f'[{breite}] Konsole: {m.text}') if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    page.on('pageerror', lambda e: fehler.append(f'[{breite}] Skriptfehler: {e}'))
    page.goto(ADRESSE); page.wait_for_timeout(400)
    return ctx, page

daten = tempfile.mkdtemp(prefix='notenpruefung-')
umgebung = dict(os.environ, NOTEN_SCHLUESSEL=SCHLUESSEL, NOTEN_DATEN=daten, PORT=str(PORT))
srv = subprocess.Popen(['node', os.path.join(WURZEL, 'server', 'server.mjs')], env=umgebung, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
time.sleep(1.2)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        for name, breite, hoehe, mobil in [('Rechner', 1280, 900, False), ('Tablet', 820, 1100, True), ('Handy', 390, 800, True)]:
            print(f'{name} ({breite} px)')
            ctx, page = geraet(b, breite, hoehe, mobil)
            erg = page.evaluate(LADEN)
            pruefe('79,83' in erg['zeile'] and ' 3 73,3 92,0 82,65 2 77,00' in erg['zeile'], f'Prüffall SPEC 4: {erg["zeile"]}')
            ueber = []
            for a in erg['ansichten']:
                page.evaluate(f"location.hash = '#/{a}'"); page.wait_for_timeout(220)
                u = page.evaluate(UEBERLAUF, breite)
                if u: ueber.append(f'{a} ({u})')
                if page.evaluate("document.querySelectorAll('dialog[open]').length"): fehler.append(f'[{breite}] Dialog offen in {a}')
            pruefe(not ueber, f'{len(erg["ansichten"])} Ansichten ohne seitliches Überlaufen' + (': ' + '; '.join(ueber) if ueber else ''))
            if mobil:
                page.evaluate("location.hash = '#/gesamt'"); page.wait_for_timeout(200)
                pruefe(page.evaluate("getComputedStyle(document.getElementById('navigation')).display") == 'none', 'Menü ist zugeklappt')
                page.click('#knopf-menue'); page.wait_for_timeout(150)
                pruefe(page.evaluate("getComputedStyle(document.getElementById('navigation')).display") == 'flex', 'Menü klappt auf')
                page.screenshot(path=os.path.join(tempfile.gettempdir(), f'noten-menue-{breite}.png'))
                page.click('#navigation a[href="#/sl"]'); page.wait_for_timeout(250)
                pruefe(page.evaluate("location.hash") == '#/sl' and page.evaluate("getComputedStyle(document.getElementById('navigation')).display") == 'none', 'Menüpunkt öffnet die Ansicht und schließt das Menü')
                pruefe(page.evaluate("document.getElementById('kopf').getBoundingClientRect().height") < 80, 'Kopfzeile ist einzeilig')
                page.screenshot(path=os.path.join(tempfile.gettempdir(), f'noten-sl-{breite}.png'))
            if not mobil:
                r = page.evaluate(NACHBAU)
                pruefe(r['gleichzeitig'] == [True, True] and r['dialoge'] == 0, 'Zwei Speichervorgänge gleichzeitig: kein falscher Konflikt')
                pruefe(r['geaendertNachUpload'] and not r['geaendertAmEnde'], 'Änderung während des Hochladens bleibt ungespeichert und wird nachgeladen')
                pruefe(r['heuteDa'] and r['sicherungen'] == 10 and r['aeltesteWeg'], f'Sicherungskopie des Tages angelegt, auf 10 aufgeräumt ({r["sicherungen"]})')
                pruefe(r['stillGeladen'], 'Änderung vom anderen Gerät wird beim Zurückkehren geladen, Klasse und Ansicht bleiben')
                pruefe(r['konfliktGefragt'] and r['nichtUeberschrieben'], 'Beide Seiten geändert: Konfliktabfrage, nichts überschrieben')
            ctx.close()

        print('Server-Variante (zwei Geräte)')
        EIN = f"""async () => {{ const sp = await import('./js/speicher.js'); sp.einstellungSetzen('serverAn', true); sp.einstellungSetzen('serverSchluessel', '{SCHLUESSEL}'); }}"""
        ctxA, a = geraet(b, 1280, 900, False); a.evaluate(LADEN); a.evaluate(EIN)
        a.evaluate("""async () => { const { K } = await import('./js/kontext.js'); const ui = await import('./js/sync-ui.js'); K.passwort = 'geheim-123'; await ui.syncEinschalten(); }""")
        a.wait_for_timeout(1500)
        pruefe(os.path.exists(os.path.join(daten, 'Pruefung_2026-27.noten')), 'Gerät A: Notenbuch liegt auf dem Server')
        roh = open(os.path.join(daten, 'Pruefung_2026-27.noten'), encoding='utf-8').read()
        pruefe('Muster' not in roh and 'TEST-A' not in roh, 'Die Datei auf dem Server ist verschlüsselt (keine Namen lesbar)')
        pruefe(len(os.listdir(os.path.join(daten, 'Sicherungen'))) == 1 if os.path.isdir(os.path.join(daten, 'Sicherungen')) else False, 'Sicherungskopie des Tages liegt auf dem Server')
        ctxB, bb = geraet(b, 820, 1100, True); bb.evaluate(EIN)
        bb.evaluate("import('./js/sync-ui.js').then(ui => { ui.ausOneDriveOeffnen(); })"); bb.wait_for_timeout(700)
        bb.click('dialog[open] .dialog-knoepfe button:has-text("Öffnen"):not(:has-text("Sicherung"))'); bb.wait_for_timeout(400)
        bb.fill('dialog[open] input[type=password]', 'geheim-123'); bb.keyboard.press('Enter'); bb.wait_for_timeout(1500)
        pruefe(bb.evaluate("import('./js/kontext.js').then(m => m.K.buch?.klassen[0].schueler[0].name)") == 'Muster', 'Gerät B: öffnet das Notenbuch vom Server')
        bb.evaluate("""async () => { const { K } = await import('./js/kontext.js'); const ui = await import('./js/sync-ui.js'); K.buch.klassen[0].kopf.lernfeldBez = 'von Gerät B'; K.aenderung(); await ui.syncSpeichern({ still: true }); }""")
        a.evaluate("import('./js/sync-ui.js').then(ui => ui.fremdeAenderungPruefen())"); a.wait_for_timeout(1200)
        pruefe(a.evaluate("import('./js/kontext.js').then(m => m.K.buch.klassen[0].kopf.lernfeldBez)") == 'von Gerät B', 'Gerät A: übernimmt die Änderung von Gerät B beim Zurückkehren')
        falsch = a.evaluate("""async () => { const s = await import('./js/server-ort.js'); try { await s.serverClient({ schluessel: 'falscher-schluessel-000000' }).anmelden(); return 'ok'; } catch (e) { return e.message; } }""")
        pruefe('Zugangsschlüssel' in falsch, 'Falscher Zugangsschlüssel wird abgewiesen')
        ctxA.close(); ctxB.close(); b.close()
finally:
    srv.terminate()
    shutil.rmtree(daten, ignore_errors=True)

print(f'\n{len(ok)} Prüfungen bestanden, {len(fehler)} Fehler')
for f in fehler: print('  FEHLER:', f)
sys.exit(1 if fehler else 0)
