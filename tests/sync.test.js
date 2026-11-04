import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SyncKonflikt, syncStarten, syncLaden, syncHochladen, syncStatusText, speicherOrt } from '../js/sync.js';
import { graphClient, onedriveOrt, onedriveEingang, notendateienListen, GRAPH } from '../js/onedrive.js';
import { inDateitext, ausDateitext } from '../js/krypto.js';
import { neueKlasse, neuesBuch } from '../js/modell.js';

// ---------- Attrappe: Laden, Speichern, eTag-Konflikt ----------

test('Erstes Speichern legt die Datei an, danach mit eTag', async () => {
  const ort = speicherOrt();
  const s = syncStarten(ort);
  assert.equal(await syncLaden(s), null);
  await syncHochladen(s, 'v1');
  assert.equal(ort.inhalt, 'v1');
  await syncHochladen(s, 'v2');
  assert.equal(ort.inhalt, 'v2');
  assert.match(syncStatusText(s), /Zuletzt synchronisiert um/);
});

test('Laden merkt sich den eTag, Speichern danach ist erlaubt', async () => {
  const ort = speicherOrt();
  ort.fremdSchreiben('alt');
  const s = syncStarten(ort);
  const r = await syncLaden(s);
  assert.equal(r.text, 'alt');
  await syncHochladen(s, 'neu');
  assert.equal(ort.inhalt, 'neu');
});

test('Konflikt: Änderung auf einem anderen Gerät wird nicht überschrieben', async () => {
  const ort = speicherOrt();
  const s = syncStarten(ort);
  await syncHochladen(s, 'v1');
  ort.fremdSchreiben('von anderem Gerät');
  await assert.rejects(syncHochladen(s, 'meine Fassung'), (e) => e instanceof SyncKonflikt && e.konflikt === true);
  assert.equal(ort.inhalt, 'von anderem Gerät', 'nichts wurde überschrieben');
  // Nach „Andere Fassung laden“ geht Speichern wieder
  const r = await syncLaden(s);
  assert.equal(r.text, 'von anderem Gerät');
  await syncHochladen(s, 'weiter');
  assert.equal(ort.inhalt, 'weiter');
});

test('Konflikt: Datei wurde angelegt, obwohl hier noch keine bekannt war', async () => {
  const ort = speicherOrt();
  const s = syncStarten(ort);
  ort.fremdSchreiben('schon da');
  await assert.rejects(syncHochladen(s, 'neu'), SyncKonflikt);
});

test('Offline: nichts geht verloren, Upload bleibt ausstehend und klappt später mit Konfliktprüfung', async () => {
  const ort = speicherOrt();
  const s = syncStarten(ort);
  await syncHochladen(s, 'v1');
  ort.offline = true;
  await assert.rejects(syncHochladen(s, 'v2'), /offline/);
  assert.equal(s.ausstehend, true);
  assert.match(syncStatusText(s), /offline/);
  ort.offline = false;
  await syncHochladen(s, 'v2');
  assert.equal(s.ausstehend, false);
  assert.equal(ort.inhalt, 'v2');
  // Offline gearbeitet, inzwischen hat ein anderes Gerät geändert: Konflikt statt Überschreiben
  ort.offline = true;
  await assert.rejects(syncHochladen(s, 'v3'), /offline/);
  ort.offline = false;
  ort.fremdSchreiben('fremd');
  await assert.rejects(syncHochladen(s, 'v3'), SyncKonflikt);
  assert.equal(ort.inhalt, 'fremd');
});

test('Zum Ort wird nur verschlüsselter Inhalt übertragen (Microsoft sieht keine Klardaten)', async () => {
  const k = neueKlasse({ klasse: 'TEST-A' });
  k.schueler[0].name = 'Geheimname';
  const buch = neuesBuch(k);
  const ort = speicherOrt();
  const s = syncStarten(ort);
  await syncHochladen(s, await inDateitext(buch, 'pw-123'));
  assert.ok(!ort.inhalt.includes('Geheimname'));
  assert.ok(!ort.inhalt.includes('TEST-A'));
  const zurueck = await ausDateitext(ort.inhalt, 'pw-123');
  assert.equal(zurueck.klassen[0].schueler[0].name, 'Geheimname');
});

// ---------- OneDrive-Client gegen eine nachgebaute Graph-Schnittstelle ----------

function falschesGraph() {
  const dateien = new Map(); // pfad -> {inhalt(Uint8Array), etag, id}
  const ordner = new Map(); // pfad -> id
  const protokoll = [];
  let nr = 0;
  const neuerEtag = () => `"tag${++nr}"`;
  const antwort = (status, body, bytes) => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => (bytes ? new TextDecoder().decode(bytes) : ''),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });
  const sessions = new Map();
  async function fetchFn(url, opt = {}) {
    const methode = opt.method || 'GET';
    protokoll.push({ url, methode, headers: opt.headers || {}, laenge: opt.body?.length });
    if (url.startsWith('https://upload.example/')) {
      const s = sessions.get(url);
      const m = opt.headers['Content-Range'].match(/bytes (\d+)-(\d+)\/(\d+)/);
      s.teile.push(opt.body);
      if (Number(m[2]) + 1 === Number(m[3])) {
        const gesamt = new Uint8Array(Number(m[3]));
        let o = 0;
        for (const t of s.teile) { gesamt.set(t, o); o += t.length; }
        dateien.set(s.pfad, { inhalt: gesamt, etag: neuerEtag(), id: `id${++nr}` });
        return antwort(201, { eTag: dateien.get(s.pfad).etag });
      }
      return antwort(202, {});
    }
    assert.ok(url.startsWith(GRAPH), 'nur Microsoft Graph wird angesprochen');
    assert.match(opt.headers.Authorization, /^Bearer TOKEN$/);
    const m = url.slice(GRAPH.length).match(/^\/me\/drive\/special\/approot(?::\/([^:?]*))?(?::(\/[a-zA-Z]+))?(?:\?(.*))?$/);
    assert.ok(m, `unbekannte URL ${url}`);
    const pfad = m[1] ? decodeURIComponent(m[1]).replace(/\/$/, '') : '';
    const teil = m[2] || '';
    const abfrage = m[3] || '';
    const url2 = url.slice(GRAPH.length);
    if (url2.startsWith('/me/drive/special/approot/children') && methode === 'POST') {
      const b = JSON.parse(opt.body);
      ordner.set(b.name, `fid${++nr}`);
      return antwort(201, { id: ordner.get(b.name), name: b.name });
    }
    if (teil === '/children' && methode === 'POST') {
      const b = JSON.parse(opt.body);
      const p = `${pfad}/${b.name}`;
      if (ordner.has(p)) return antwort(409, { error: { message: 'exists' } });
      ordner.set(p, `fid${++nr}`);
      return antwort(201, { id: ordner.get(p), name: b.name });
    }
    if (teil === '/children') {
      const kinder = [...dateien].filter(([p]) => p.startsWith(pfad ? `${pfad}/` : '') && !p.slice(pfad ? pfad.length + 1 : 0).includes('/'));
      return antwort(200, { value: kinder.map(([p, d]) => ({ name: p.split('/').pop(), id: d.id, size: d.inhalt.length, file: {}, lastModifiedDateTime: '2025-10-20T09:30:00Z', eTag: d.etag })) });
    }
    if (teil === '/content' && methode === 'GET') {
      const d = dateien.get(pfad);
      return d ? antwort(200, {}, d.inhalt) : antwort(404, { error: { message: 'nf' } });
    }
    if (teil === '/content' && methode === 'PUT') {
      const d = dateien.get(pfad);
      if (opt.headers['If-Match']) {
        if (!d || d.etag !== opt.headers['If-Match']) return antwort(412, { error: { message: 'etag' } });
      } else if (d && abfrage.includes('conflictBehavior=fail')) return antwort(409, { error: { message: 'nameAlreadyExists' } });
      dateien.set(pfad, { inhalt: opt.body, etag: neuerEtag(), id: d?.id || `id${++nr}` });
      return antwort(d ? 200 : 201, { eTag: dateien.get(pfad).etag });
    }
    if (teil === '/createUploadSession') {
      const d = dateien.get(pfad);
      if (opt.headers['If-Match'] && (!d || d.etag !== opt.headers['If-Match'])) return antwort(412, { error: { message: 'etag' } });
      const u = `https://upload.example/${++nr}`;
      sessions.set(u, { pfad, teile: [] });
      return antwort(200, { uploadUrl: u });
    }
    if (!teil && methode === 'GET') {
      if (dateien.has(pfad)) return antwort(200, { id: dateien.get(pfad).id, eTag: dateien.get(pfad).etag, name: pfad.split('/').pop() });
      if (ordner.has(pfad)) return antwort(200, { id: ordner.get(pfad), name: pfad });
      return antwort(404, { error: { message: 'nf' } });
    }
    if (!teil && methode === 'PATCH') {
      const b = JSON.parse(opt.body);
      const d = dateien.get(pfad);
      dateien.delete(pfad);
      dateien.set(`${[...ordner].find(([, id]) => id === b.parentReference.id)[0]}/${pfad.split('/').pop()}`, d);
      return antwort(200, {});
    }
    if (!teil && methode === 'DELETE') {
      dateien.delete(pfad);
      return antwort(204, {});
    }
    throw new Error(`nicht nachgebaut: ${methode} ${url}`);
  }
  return { fetchFn, dateien, ordner, protokoll };
}

const client = (g) => graphClient({ tokenHolen: async () => 'TOKEN', fetchFn: g.fetchFn });

test('OneDrive: Neue Datei wird nur angelegt, wenn sie noch nicht existiert (conflictBehavior=fail)', async () => {
  const g = falschesGraph();
  const ort = onedriveOrt(client(g), 'FIA-25_2025-26.noten');
  const s = syncStarten(ort);
  assert.equal(await syncLaden(s), null);
  await syncHochladen(s, 'erste Fassung');
  const put = g.protokoll.find((p) => p.methode === 'PUT');
  assert.match(put.url, /FIA-25_2025-26\.noten:\/content\?@microsoft\.graph\.conflictBehavior=fail/);
  assert.equal(put.headers['If-Match'], undefined);
  assert.equal(new TextDecoder().decode(g.dateien.get('FIA-25_2025-26.noten').inhalt), 'erste Fassung');
  // Ein zweites Gerät, das ebenfalls „neu“ anlegen will, bekommt einen Konflikt
  await assert.rejects(syncHochladen(syncStarten(onedriveOrt(client(g), 'FIA-25_2025-26.noten')), 'zweites Gerät'), SyncKonflikt);
});

test('OneDrive: Hochladen mit If-Match, 412 wird zum Konflikt, nichts wird überschrieben', async () => {
  const g = falschesGraph();
  const o1 = onedriveOrt(client(g), 'a.noten');
  const o2 = onedriveOrt(client(g), 'a.noten');
  const s1 = syncStarten(o1);
  const s2 = syncStarten(o2);
  await syncHochladen(s1, 'v1');
  await syncLaden(s2);
  await syncHochladen(s1, 'v2 von Gerät 1');
  const put = g.protokoll.filter((p) => p.methode === 'PUT').at(-1);
  assert.ok(put.headers['If-Match'].startsWith('"tag'));
  await assert.rejects(syncHochladen(s2, 'v2 von Gerät 2'), SyncKonflikt);
  assert.equal(new TextDecoder().decode(g.dateien.get('a.noten').inhalt), 'v2 von Gerät 1');
  const r = await syncLaden(s2);
  assert.equal(r.text, 'v2 von Gerät 1');
  await syncHochladen(s2, 'v3 von Gerät 2');
  assert.equal(new TextDecoder().decode(g.dateien.get('a.noten').inhalt), 'v3 von Gerät 2');
});

test('OneDrive: Umlaute und Leerzeichen im Dateinamen werden kodiert', async () => {
  const g = falschesGraph();
  const ort = onedriveOrt(client(g), 'Klasse Ä 25.noten');
  await syncHochladen(syncStarten(ort), 'x');
  assert.match(g.protokoll.find((p) => p.methode === 'PUT').url, /Klasse%20%C3%84%2025\.noten/);
});

test('OneDrive: große Dateien gehen über eine Upload-Sitzung in Blöcken', async () => {
  const g = falschesGraph();
  const ort = onedriveOrt(client(g), 'gross.noten');
  const s = syncStarten(ort);
  const text = 'x'.repeat(9 * 1024 * 1024);
  await syncHochladen(s, text);
  const blocke = g.protokoll.filter((p) => p.url.startsWith('https://upload.example/'));
  assert.equal(blocke.length, 3, '9 MB in Blöcken zu 3,125 MB');
  assert.ok(blocke.every((b) => b.headers.Authorization === undefined), 'vorab autorisierte URL ohne Token');
  assert.match(blocke[0].headers['Content-Range'], /^bytes 0-3276799\/9437184$/);
  assert.equal(g.dateien.get('gross.noten').inhalt.length, text.length);
  // zweite Fassung mit bekanntem eTag: Sitzung mit If-Match
  await syncHochladen(s, text + 'y');
  const sitzung = g.protokoll.filter((p) => p.url.endsWith(':/createUploadSession')).at(-1);
  assert.ok(sitzung.headers['If-Match']);
  // Konflikt bei großen Dateien
  g.dateien.get('gross.noten').etag = '"fremd"';
  await assert.rejects(syncHochladen(s, text), SyncKonflikt);
});

test('OneDrive: Notendateien auflisten, Untis-Eingang lesen und nach „verarbeitet“ verschieben', async () => {
  const g = falschesGraph();
  const c = client(g);
  await c.hochladen('A.noten', new TextEncoder().encode('a'));
  await c.hochladen('notiz.txt', new TextEncoder().encode('n'));
  await c.hochladen('Untis-Eingang/AbsenceList_20251020_0930.xls', new Uint8Array([1, 2, 3]));
  const noten = await notendateienListen(c);
  assert.deepEqual(noten.map((d) => d.name), ['A.noten']);
  const eingang = onedriveEingang(c);
  const liste = await eingang.liste();
  assert.deepEqual(liste.map((d) => d.name), ['AbsenceList_20251020_0930.xls']);
  assert.deepEqual([...new Uint8Array(await liste[0].lesen())], [1, 2, 3]);
  await eingang.verarbeitet('AbsenceList_20251020_0930.xls');
  assert.equal((await eingang.liste()).length, 0);
  assert.ok(g.dateien.has('Untis-Eingang/verarbeitet/AbsenceList_20251020_0930.xls'));
});

test('OneDrive: Fehlerantworten werden verständlich gemeldet', async () => {
  const c = graphClient({ tokenHolen: async () => 'T', fetchFn: async () => ({ status: 403, ok: false, json: async () => ({ error: { message: 'Zugriff verweigert' } }) }) });
  await assert.rejects(c.meta('x'), /403.*Zugriff verweigert/);
});
