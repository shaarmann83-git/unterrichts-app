// Reihen (Sportarten): Übersicht je Reihe, Einstellungen, Vorlagen (SPEC 9.5, 9.6, 9.7).
import { K } from '../kontext.js';
import { h, leeren, fuege, bestaetigen, inhaltDialog, meldung, toast, avatar } from '../ui.js';
import { anzeigename, neueReihe, neuerPruefteil, neueId, datumDeutsch, STUFEN_STANDARD } from '../modell.js';
import { reihenErgebnis, doppelBewertungHinweis, teilHoechstwert, punkte } from '../sport.js';
import { vorlagenListe, vorlageFinden, reiheAusVorlage, reiheAlsVorlage, personenMitWerten, vorlageUebertragen } from '../sport-vorlagen.js';
import { zahlLesen } from '../rechnen.js';
import { ansichtRegistrieren } from '../registry.js';
import { sportKlasse, sportKontext } from './sport-gemeinsam.js';

const f2 = (x) => (x === null || x === undefined ? '' : String(Math.round(x * 100) / 100).replace('.', ','));
const STATUS_TEXT = {
  auto6: ['6 (unentschuldigt am Prüfungstag)', 'z-rot'],
  'nachpruefung-offen': ['Nachprüfung offen', 'z-orange'],
  offen: ['Prüfung offen', 'z-violett'],
  ersatz: ['Ersatzprüfung', 'z-leise'],
};

function zahlFeld(obj, key, { min = 0, max = Infinity, leerOk = false, breit = false, label = '', nachher = null } = {}) {
  const el = h('input', { type: 'text', inputmode: 'decimal', class: breit ? '' : 'gewicht', 'aria-label': label, value: obj[key] === null || obj[key] === undefined ? '' : String(obj[key]).replace('.', ','),
    oninput: (e) => {
      const z = zahlLesen(e.target.value);
      const ok = z === null ? leerOk : !Number.isNaN(z) && z >= min && z <= max;
      e.target.classList.toggle('fehler', !ok);
      if (ok) { obj[key] = z; K.aenderung(); nachher?.(); }
    } });
  return el;
}
const textFeld = (obj, key, label, { breit = true, mehrzeilig = false } = {}) => mehrzeilig
  ? h('textarea', { rows: 2, 'aria-label': label, oninput: (e) => { obj[key] = e.target.value; K.aenderung(); } }, obj[key] || '')
  : h('input', { type: 'text', class: breit ? 'breit-feld' : '', 'aria-label': label, value: obj[key] || '', oninput: (e) => { obj[key] = e.target.value; K.aenderung(); } });

let aktReihe = null;

export async function reiheAusVorlageAnlegen(d) {
  const liste = vorlagenListe(K.buch);
  const wahl = h('select', { id: 'vorlage-wahl', 'aria-label': 'Vorlage' }, liste.map((v) => h('option', { value: v.id }, v.name)));
  const name = h('input', { type: 'text', id: 'vorlage-name', placeholder: 'Name der Reihe (leer = Name der Vorlage)' });
  const hj = h('select', { id: 'vorlage-halbjahr', 'aria-label': 'Halbjahr' }, [1, 2].map((n) => h('option', { value: n }, `Halbjahr ${n}`)));
  const ok = await inhaltDialog('Neue Reihe', [h('label', {}, 'Vorlage', wahl), h('label', {}, 'Name', name), d.sport.zeitraum === 'jahr' && h('label', {}, 'Halbjahr', hj),
    h('p', { class: 'klein' }, 'Die Reihe speichert eine Kopie der Vorlage. Sie können sie danach frei ändern.')].filter(Boolean), [
    { text: 'Abbrechen', wert: false, abbruch: true },
    { text: 'Anlegen', wert: true, klasse: 'knopf primaer' },
  ]);
  if (!ok) return null;
  const r = reiheAusVorlage(vorlageFinden(K.buch, wahl.value), { name: name.value.trim(), halbjahr: d.sport.zeitraum === 'jahr' ? Number(hj.value) : 1 });
  d.sport.reihen.push(r);
  K.aenderung();
  return r;
}

export function zeigeReihen(params) {
  const { d, ein, personen } = sportKontext();
  const wurzel = h('section', { class: 'seite' });
  if (params[0] && d.sport.reihen.some((r) => r.id === params[0])) aktReihe = params[0];
  if (!d.sport.reihen.some((r) => r.id === aktReihe)) aktReihe = d.sport.reihen[0]?.id || null;
  const reihe = d.sport.reihen.find((r) => r.id === aktReihe);
  const einstellung = params[1] === 'einstellung';

  fuege(wurzel, h('h1', {}, 'Reihen'),
    h('div', { class: 'reiter' },
      d.sport.reihen.map((r) => h('a', { href: `#/reihen/${r.id}`, 'data-reihe': r.id, class: `reiter-punkt${r.id === aktReihe ? ' aktiv' : ''}` }, r.name || 'ohne Namen')),
      h('button', { type: 'button', class: 'knopf primaer', id: 'reihe-neu', onclick: async () => { const r = await reiheAusVorlageAnlegen(d); if (r) { aktReihe = r.id; K.navigiere(`reihen/${r.id}`); K.neuZeichnen(); } } }, '+ Reihe aus Vorlage')));
  if (!reihe) {
    wurzel.append(h('p', { class: 'hinweis' }, 'Noch keine Reihe. Mit „+ Reihe aus Vorlage“ legen Sie z. B. Badminton, Volleyball oder Ultimate an.'));
    return { el: wurzel };
  }
  wurzel.append(h('div', { class: 'reiter' },
    h('a', { href: `#/reihen/${reihe.id}`, class: `reiter-punkt${!einstellung ? ' aktiv' : ''}` }, 'Übersicht'),
    h('a', { href: `#/reihen/${reihe.id}/einstellung`, id: 'reihe-einstellung', class: `reiter-punkt${einstellung ? ' aktiv' : ''}` }, 'Reihe bearbeiten')));
  wurzel.append(einstellung ? einstellungen(d, reihe) : uebersicht(d, reihe, ein, personen));
  return { el: wurzel };
}

// ---------- Übersicht ----------

function uebersicht(d, reihe, ein, personen) {
  const el = h('div', {});
  const punkteAn = d.sport.notensystem === 'punkte';
  const hinweis = doppelBewertungHinweis(reihe);
  const kopf = ['Nr.', 'Name', 'Prüfung', 'Grundnote', 'M1', 'M2', 'M3', 'Mitarbeit', 'Verhalten', ...reihe.direkte.map((x) => x.name || 'Teilleistung'), 'Reihenwert', 'Reihennote', ...(punkteAn ? ['Punkte'] : []), 'Bemerkung', 'Ersatz'];
  const tbody = h('tbody');
  personen.forEach((p, i) => {
    const e = reihenErgebnis(d, reihe, p.id, ein);
    const w = (reihe.werte[p.id] ||= {});
    const [stText, stKlasse] = STATUS_TEXT[e.pruefung.status] || ['', ''];
    const ersatzKnopf = h('button', { type: 'button', class: `knopf klein ${w.ersatz ? 'primaer' : ''}`, 'data-ersatz': p.id, 'aria-label': `Ersatzprüfung ${anzeigename(p)}`, onclick: async () => {
      const aktiv = h('input', { type: 'checkbox', checked: !!w.ersatz && w.ersatz.aktiv !== false, id: 'ersatz-aktiv' });
      const text = h('textarea', { rows: 3, id: 'ersatz-text', 'aria-label': 'Beschreibung' }, w.ersatz?.beschreibung || '');
      const ok = await inhaltDialog(`Ersatzprüfung: ${anzeigename(p)}`, [
        h('p', { class: 'klein' }, 'Für langfristig nicht sporttaugliche Personen: eigene Teile (unter „Reihe bearbeiten“) mit demselben Schlüssel oder eine direkte Note. Die Beschreibung ist Pflicht und wird überall gekennzeichnet.'),
        h('label', { class: 'schalter' }, aktiv, ' Ersatzprüfung aktiv'),
        h('label', {}, 'Beschreibung (Pflicht)', text)], [
        { text: 'Abbrechen', wert: false, abbruch: true },
        { text: 'Speichern', wert: true, klasse: 'knopf primaer', vorPruefung: () => { const ok = !aktiv.checked || text.value.trim() !== ''; text.classList.toggle('fehler', !ok); return ok; } },
      ]);
      if (!ok) return;
      if (!aktiv.checked) delete w.ersatz;
      else w.ersatz = { ...(w.ersatz || {}), aktiv: true, beschreibung: text.value.trim() };
      K.aenderung();
      K.neuZeichnen();
    } }, w.ersatz ? 'Ersatz ✎' : '–');
    tbody.append(h('tr', { 'data-person': p.id },
      h('td', { class: 'zahl' }, String(i + 1)),
      h('td', { class: 'links name' }, avatar(d, p), ' ', h('a', { href: `#/person/${p.id}` }, anzeigename(p))),
      h('td', { class: `mitte ${stKlasse}`, 'data-feld': 'pruefung', title: stText }, e.pruefung.note === null ? (stText ? h('span', { class: 'klein' }, stText) : '') : h('strong', {}, String(e.pruefung.note)), e.pruefung.note !== null && stText && h('div', { class: 'klein' }, stText),
        e.pruefung.status === 'nachpruefung-offen' && h('input', { type: 'date', class: 'nachschreibtermin', 'aria-label': `Nachprüfung ${anzeigename(p)}`, value: w.nachpruefungTermin || '', onchange: (ev) => { w.nachpruefungTermin = ev.target.value; K.aenderung(); } })),
      h('td', { class: 'zahl' }, e.mitarbeit.grundnote ?? ''),
      [0, 1, 2].map((m) => h('td', { class: `mitte ${e.mitarbeit.gezeigt[m] ? 'm-gruen' : ''}`, title: reihe.merkmaleTexte[m] || '' }, e.mitarbeit.gezeigt[m] ? '✓' : '')),
      h('td', { class: 'zahl', 'data-feld': 'mitarbeit' }, f2(e.mitarbeit.note)),
      h('td', { class: (reihe.gewichte.verhalten ?? 0) === 0 ? 'inaktiv' : '', title: (reihe.gewichte.verhalten ?? 0) === 0 ? 'Gewicht 0: ohne Wirkung' : '' }, h('input', { type: 'text', inputmode: 'decimal', class: 'gewicht', 'aria-label': `Verhalten ${anzeigename(p)}`, value: typeof w.verhalten === 'number' ? String(w.verhalten).replace('.', ',') : '',
        oninput: (ev) => { const z = zahlLesen(ev.target.value); const ok = z === null || (!Number.isNaN(z) && z >= 1 && z <= 6); ev.target.classList.toggle('fehler', !ok); if (!ok) return; if (z === null) delete w.verhalten; else w.verhalten = z; K.aenderung(); }, onchange: () => K.neuZeichnen() })),
      reihe.direkte.map((x) => h('td', { class: (x.gewicht ?? 1) === 0 ? 'inaktiv' : '', title: (x.stufen || []).map((t, k) => `${k + 1}: ${t}`).join('\n') }, h('input', { type: 'text', inputmode: 'decimal', class: 'gewicht', 'aria-label': `${x.name} ${anzeigename(p)}`, value: typeof w.direkt?.[x.id] === 'number' ? String(w.direkt[x.id]).replace('.', ',') : '',
        oninput: (ev) => { const z = zahlLesen(ev.target.value); const ok = z === null || (!Number.isNaN(z) && z >= 1 && z <= 6); ev.target.classList.toggle('fehler', !ok); if (!ok) return; w.direkt ||= {}; if (z === null) delete w.direkt[x.id]; else w.direkt[x.id] = z; K.aenderung(); }, onchange: () => K.neuZeichnen() }))),
      h('td', { class: 'zahl', 'data-feld': 'wert' }, f2(e.wert)),
      h('td', { class: 'mitte', 'data-feld': 'note' }, e.note === null ? '' : h('strong', {}, String(e.note))),
      punkteAn && h('td', { class: 'zahl' }, e.wert === null ? '' : String(punkte(e.note, ein))),
      h('td', {}, h('input', { type: 'text', class: 'bemerkung', 'aria-label': `Bemerkung ${anzeigename(p)}`, placeholder: 'z. B. Begründung bei Abweichung von 2', value: w.bemerkung || '', oninput: (ev) => { w.bemerkung = ev.target.value; K.aenderung(); } })),
      h('td', {}, ersatzKnopf)));
  });
  fuege(el,
    hinweis && h('p', { class: 'warnung' }, hinweis),
    h('p', { class: 'klein' }, `Gewichte: Prüfung ${String(reihe.gewichte.pruefung).replace('.', ',')}, Mitarbeit ${String(reihe.gewichte.mitarbeit).replace('.', ',')}, Verhalten ${String(reihe.gewichte.verhalten).replace('.', ',')}${reihe.direkte.map((x) => `, ${x.name} ${String(x.gewicht ?? 1).replace('.', ',')}`).join('')}. Fehlt eine Teilleistung, verteilt sich ihr Gewicht auf die übrigen. Reihennote: halbe Werte zur besseren Note.`),
    personen.length === 0 ? h('p', { class: 'hinweis' }, 'Bitte zuerst unter „Grunddaten“ Schüler:innen eintragen.') :
    h('div', { class: 'tabelle-rahmen' }, h('table', { class: 'tabelle sport-reihe' }, h('thead', {}, h('tr', {}, kopf.map((t) => h('th', {}, t)))), tbody)));
  return el;
}

// ---------- Einstellungen der Reihe ----------

function einstellungen(d, reihe) {
  const el = h('div', {});
  const g = reihe.gewichte;
  const bewegen = (liste, i, delta) => { const j = i + delta; if (j < 0 || j >= liste.length) return; [liste[i], liste[j]] = [liste[j], liste[i]]; K.aenderung(); K.neuZeichnen(); };

  const teilBlock = (liste, titel, { ersatz = false } = {}) => h('div', {},
    h('h2', {}, titel),
    liste.length === 0 && h('p', { class: 'hinweis' }, 'Noch keine Teile.'),
    liste.map((t, i) => h('div', { class: 'einstellung-block teil-block', 'data-teil': t.id },
      h('div', { class: 'formular' },
        h('label', { class: 'breit' }, 'Name', textFeld(t, 'name', 'Name des Teils')),
        !ersatz && h('label', {}, 'Versuche', zahlFeld(t, 'versuche', { min: 0, max: 100, label: 'Anzahl Versuche', nachher: () => {} })),
        h('label', {}, `Höchstwert${!ersatz ? ` (leer = ${(t.versuche || 0) * 3})` : ''}`, zahlFeld(t, 'hoechst', { min: 0, leerOk: true, label: 'Höchstwert' })),
        h('label', {}, 'Gewicht', zahlFeld(t, 'gewicht', { min: 0, label: 'Gewicht des Teils' }))),
      !ersatz && h('label', {}, 'Zielzone / Bedingung (für das Kriterienblatt)', textFeld(t, 'zone', 'Zielzone')),
      !ersatz && h('div', { class: 'formular' }, [0, 1, 2].map((m) => h('label', { class: 'breit' }, `Merkmal ${m + 1}`, h('input', { type: 'text', class: 'breit-feld', 'aria-label': `Merkmal ${m + 1} von ${t.name}`, value: t.merkmale[m] || '', oninput: (e) => { t.merkmale[m] = e.target.value; K.aenderung(); } })))),
      !ersatz && h('details', {}, h('summary', {}, 'Stufentexte 0–3 (Standard oder eigene)'),
        h('div', { class: 'formular' }, [0, 1, 2, 3].map((n) => h('label', { class: 'breit' }, `Stufe ${n}`, h('input', { type: 'text', class: 'breit-feld', 'aria-label': `Stufe ${n} von ${t.name}`, value: (t.stufen || STUFEN_STANDARD)[n], oninput: (e) => { t.stufen = [...(t.stufen || STUFEN_STANDARD)]; t.stufen[n] = e.target.value; K.aenderung(); } }))))),
      h('div', { class: 'knopfreihe' },
        h('button', { type: 'button', class: 'knopf klein', disabled: i === 0, onclick: () => bewegen(liste, i, -1) }, '↑'),
        h('button', { type: 'button', class: 'knopf klein', disabled: i === liste.length - 1, onclick: () => bewegen(liste, i, 1) }, '↓'),
        h('button', { type: 'button', class: 'knopf klein gefahr', 'aria-label': `Teil ${t.name} löschen`, onclick: async () => {
          if (!(await bestaetigen('Teil löschen', `„${t.name || 'Teil'}“ wird gelöscht. Bereits erfasste Werte dieses Teils gehen verloren.`, 'Löschen', true))) return;
          liste.splice(i, 1);
          K.aenderung();
          K.neuZeichnen();
        } }, 'Löschen')))),
    h('button', { type: 'button', class: 'knopf', id: ersatz ? 'ersatzteil-neu' : 'teil-neu', onclick: () => { const t = neuerPruefteil(''); if (ersatz) { t.versuche = 0; t.hoechst = 30; } liste.push(t); K.aenderung(); K.neuZeichnen(); } }, '+ Teil'));

  fuege(el,
    h('div', { class: 'einstellung-block' },
      h('div', { class: 'formular' },
        h('label', { class: 'breit' }, 'Name der Reihe', textFeld(reihe, 'name', 'Name der Reihe')),
        d.sport.zeitraum === 'jahr' && h('label', {}, 'Halbjahr', h('select', { 'aria-label': 'Halbjahr der Reihe', onchange: (e) => { reihe.halbjahr = Number(e.target.value); K.aenderung(); } }, [1, 2].map((n) => h('option', { value: n, selected: reihe.halbjahr === n }, `Halbjahr ${n}`)))),
        h('label', {}, 'Gewicht der Reihe in der Gesamtnote', zahlFeld(reihe, 'gewichtReihe', { min: 0, label: 'Gewicht der Reihe' }))),
      h('h2', {}, 'Gewichte der Teilleistungen'),
      h('div', { class: 'formular' },
        h('label', {}, 'Prüfung', zahlFeld(g, 'pruefung', { min: 0, label: 'Gewicht Prüfung', nachher: () => hinweisAktualisieren() })),
        h('label', {}, 'Mitarbeit', zahlFeld(g, 'mitarbeit', { min: 0, label: 'Gewicht Mitarbeit', nachher: () => hinweisAktualisieren() })),
        h('label', {}, 'Verhalten (0 = inaktiv)', zahlFeld(g, 'verhalten', { min: 0, label: 'Gewicht Verhalten' }))),
      h('p', { class: 'warnung', id: 'doppel-hinweis', hidden: true })),
    h('h2', {}, 'Aufwertungsmerkmale M1–M3'),
    h('div', { class: 'einstellung-block' }, h('div', { class: 'formular' }, [0, 1, 2].map((m) => h('label', { class: 'breit' }, `M${m + 1}`, h('input', { type: 'text', class: 'breit-feld', 'aria-label': `Merkmal M${m + 1}`, value: reihe.merkmaleTexte[m] || '', oninput: (e) => { reihe.merkmaleTexte[m] = e.target.value; K.aenderung(); } }))))),
    teilBlock(reihe.teile, 'Prüfungsteile'),
    h('h2', {}, 'Weitere direkte Teilleistungen (z. B. Spiel)'),
    reihe.direkte.map((x, i) => h('div', { class: 'einstellung-block', 'data-direkt': x.id },
      h('div', { class: 'formular' }, h('label', { class: 'breit' }, 'Name', textFeld(x, 'name', 'Name der Teilleistung')), h('label', {}, 'Gewicht', zahlFeld(x, 'gewicht', { min: 0, label: 'Gewicht der Teilleistung' }))),
      h('details', {}, h('summary', {}, 'Stufenbeschreibung je Note (1–6)'), h('div', { class: 'formular' }, [0, 1, 2, 3, 4, 5].map((n) => h('label', { class: 'breit' }, `Note ${n + 1}`, h('input', { type: 'text', class: 'breit-feld', value: (x.stufen || [])[n] || '', 'aria-label': `Note ${n + 1} von ${x.name}`, oninput: (e) => { x.stufen = [...(x.stufen || ['', '', '', '', '', ''])]; x.stufen[n] = e.target.value; K.aenderung(); } }))))),
      h('button', { type: 'button', class: 'knopf klein gefahr', onclick: async () => { if (await bestaetigen('Teilleistung löschen', `„${x.name}“ wird mit allen Noten gelöscht.`, 'Löschen', true)) { reihe.direkte.splice(i, 1); K.aenderung(); K.neuZeichnen(); } } }, 'Löschen'))),
    h('button', { type: 'button', class: 'knopf', id: 'direkt-neu', onclick: () => { reihe.direkte.push({ id: neueId(), name: '', gewicht: 1, stufen: ['', '', '', '', '', ''] }); K.aenderung(); K.neuZeichnen(); } }, '+ Teilleistung'),
    teilBlock(reihe.ersatzTeile, 'Ersatzprüfung (Teile)', { ersatz: true }),
    h('div', { class: 'einstellung-block' }, h('label', {}, 'Hinweis zur Ersatzleistung (für das Kriterienblatt)', textFeld(reihe, 'ersatzHinweis', 'Ersatzleistung Hinweis', { mehrzeilig: true }))),
    h('h2', {}, 'Vorlage'),
    vorlagenBereich(d, reihe),
    h('h2', {}, 'Reihe löschen'),
    h('button', { type: 'button', class: 'knopf gefahr', id: 'reihe-loeschen', onclick: async () => {
      if (!(await bestaetigen('Reihe löschen', `Die Reihe „${reihe.name}“ wird mit allen Prüfungswerten, Noten und Bemerkungen gelöscht. Die Termine bleiben, werden aber keiner Reihe mehr zugeordnet.`, 'Löschen', true))) return;
      d.sport.reihen.splice(d.sport.reihen.indexOf(reihe), 1);
      for (const t of d.sport.termine) if (t.reihe === reihe.id) t.reihe = '';
      K.aenderung();
      K.navigiere('reihen');
      K.neuZeichnen();
    } }, 'Reihe löschen'));
  const hinweisEl = el.querySelector('#doppel-hinweis');
  function hinweisAktualisieren() { const t = doppelBewertungHinweis(reihe); hinweisEl.textContent = t; hinweisEl.hidden = !t; }
  hinweisAktualisieren();
  return el;
}

function vorlagenBereich(d, reihe) {
  const liste = vorlagenListe(K.buch);
  const wahl = h('select', { id: 'uebertragen-wahl', 'aria-label': 'Vorlage' }, liste.map((v) => h('option', { value: v.id, selected: v.id === reihe.vorlage }, v.name)));
  return h('div', { class: 'einstellung-block' },
    h('p', { class: 'klein' }, reihe.vorlage ? `Diese Reihe stammt aus der Vorlage „${vorlageFinden(K.buch, reihe.vorlage)?.name || reihe.vorlage}“ und speichert eine eigene Kopie.` : 'Diese Reihe hat keine Vorlage.'),
    h('div', { class: 'knopfreihe' },
      h('button', { type: 'button', class: 'knopf', id: 'als-vorlage', onclick: async () => {
        const name = h('input', { type: 'text', id: 'vorlage-neu-name', value: reihe.name });
        const ok = await inhaltDialog('Als Vorlage speichern', [h('p', { class: 'klein' }, 'Die Vorlage gilt für das ganze Notenbuch (alle Klassen). Eingaben der Klasse werden nicht mitgespeichert.'), h('label', {}, 'Name der Vorlage', name)], [
          { text: 'Abbrechen', wert: false, abbruch: true },
          { text: 'Speichern', wert: true, klasse: 'knopf primaer', vorPruefung: () => name.value.trim() !== '' },
        ]);
        if (!ok) return;
        const v = reiheAlsVorlage(reihe, name.value.trim());
        (K.buch.einstellungen.sportVorlagen ||= []).push(v);
        K.aenderung();
        toast(`Vorlage „${v.name}“ gespeichert.`);
        K.neuZeichnen();
      } }, 'Als Vorlage speichern'),
      h('label', { class: 'inline' }, 'Änderungen aus Vorlage übertragen: ', wahl),
      h('button', { type: 'button', class: 'knopf', id: 'uebertragen', onclick: async () => {
        const v = vorlageFinden(K.buch, wahl.value);
        if (!v) return;
        const n = personenMitWerten(reihe);
        const ok = await bestaetigen('Änderungen übertragen', `Teile, Gewichte und Texte dieser Reihe werden durch die der Vorlage „${v.name}“ ersetzt.${n ? ` Achtung: ${n} Person(en) haben in dieser Reihe schon Prüfungswerte. Werte bleiben nur bei Teilen mit gleicher Kennung erhalten.` : ''}`, 'Übertragen', n > 0);
        if (!ok) return;
        vorlageUebertragen(reihe, v);
        K.aenderung();
        K.neuZeichnen();
      } }, 'Übertragen')));
}

ansichtRegistrieren('reihen', { text: 'Reihen', bauen: zeigeReihen, klasse: true, nurWenn: sportKlasse, reihe: 2.5 });
