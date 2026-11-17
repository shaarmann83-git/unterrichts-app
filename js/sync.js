// Synchronisation (SPEC 8.8): Logik mit Konfliktprüfung über den eTag. Der Speicherort steckt hinter einer Schnittstelle:
//   ort.name                                         Dateiname am Speicherort
//   ort.laden()      -> Promise<{ text, etag } | null>   (null: Datei existiert nicht)
//   ort.speichern(text, erwarteterEtag) -> Promise<{ etag }>   wirft SyncKonflikt, wenn sich die Datei inzwischen geändert hat
// So laufen Tests ohne echtes Konto (siehe speicherOrt unten); OneDrive steckt in onedrive.js.

export class SyncKonflikt extends Error {
  constructor(text = 'Die Datei wurde auf einem anderen Gerät geändert.') {
    super(text);
    this.konflikt = true;
  }
}

/** Neuer Sync-Zustand für ein geöffnetes Dokument. */
export function syncStarten(ort, etag = null) {
  return { ort, etag, zuletzt: null, ausstehend: false, schlange: null, unbestaetigt: null };
}

export async function syncLaden(sync) {
  const r = await sync.ort.laden();
  if (r) {
    sync.etag = r.etag;
    sync.zuletzt = new Date();
  }
  return r;
}

/**
 * Lädt hoch. Bei Konflikt wird NICHT überschrieben: es wird SyncKonflikt geworfen.
 * Bei Netzfehler bleibt `ausstehend` gesetzt, damit beim nächsten Online-Sein erneut hochgeladen wird.
 *
 * Uploads desselben Dokuments laufen nacheinander. Sonst schickt ein zweiter Upload (z. B. „Speichern“ während
 * der automatischen Sicherung) noch den alten eTag mit und sieht den eigenen ersten Upload als fremde Änderung.
 */
export function syncHochladen(sync, text) {
  const lauf = (sync.schlange || Promise.resolve()).catch(() => {}).then(() => hochladenEinmal(sync, text));
  sync.schlange = lauf;
  return lauf;
}

async function hochladenEinmal(sync, text) {
  try {
    let r;
    try {
      r = await sync.ort.speichern(text, sync.etag);
    } catch (e) {
      if (!e.konflikt || !(await eigenerUploadErkannt(sync))) throw e;
      r = await sync.ort.speichern(text, sync.etag);
    }
    sync.etag = r.etag;
    sync.zuletzt = new Date();
    sync.ausstehend = false;
    sync.unbestaetigt = null;
    return r;
  } catch (e) {
    if (e.konflikt) throw e;
    // Ob der Upload noch angekommen ist, ist unklar (Verbindung weg, App im Hintergrund): Text merken.
    sync.unbestaetigt = text;
    sync.ausstehend = true;
    throw e;
  }
}

/**
 * Konflikt nach einem Upload ohne Antwort: Liegt am Speicherort genau der Text, den dieses Gerät zuletzt
 * geschickt hat, war es der eigene Upload und keine fremde Änderung. Dann gilt dessen eTag.
 */
async function eigenerUploadErkannt(sync) {
  if (!sync.unbestaetigt) return false;
  try {
    const r = await sync.ort.laden();
    if (!r || r.text !== sync.unbestaetigt) return false;
    sync.etag = r.etag;
    return true;
  } catch {
    return false;
  }
}

/**
 * Hat ein anderes Gerät die Datei geändert? Vergleicht nur den eTag (keine Datei wird geladen).
 * Wartet einen laufenden eigenen Upload ab. Bei Netzfehler oder unbekanntem Stand: false.
 */
export async function syncFremdGeaendert(sync) {
  if (!sync?.ort.stand) return false;
  try {
    await (sync.schlange || Promise.resolve()).catch(() => {});
    if (sync.etag === null) return false;
    const etag = await sync.ort.stand();
    return etag !== null && etag !== sync.etag;
  } catch {
    return false;
  }
}

// ---------- Tägliche Sicherungskopien ----------

export const SICHERUNG_ORDNER = 'Sicherungen';
export const SICHERUNGEN_BEHALTEN = 10;

const basisVon = (dateiname) => String(dateiname || 'Notenbuch').replace(/\.noten$/i, '');

/** Name der Sicherungskopie eines Tages, z. B. „Notenbuch_2026-27_2026-11-17.noten“. */
export function sicherungsName(dateiname, tag) {
  return `${basisVon(dateiname)}_${tag}.noten`;
}

/** Sicherungen dieses Notenbuchs aus einer Namensliste, neueste zuerst: [{name, tag}]. */
export function sicherungenVon(namen, dateiname) {
  const basis = `${basisVon(dateiname)}_`;
  return namen
    .filter((n) => n.startsWith(basis) && /^\d{4}-\d{2}-\d{2}\.noten$/i.test(n.slice(basis.length)))
    .map((n) => ({ name: n, tag: n.slice(basis.length, basis.length + 10) }))
    .sort((a, b) => (a.tag < b.tag ? 1 : -1));
}

/** Welche Sicherungen können weg? Die neuesten `behalten` bleiben. */
export function ueberzaehligeSicherungen(namen, dateiname, behalten = SICHERUNGEN_BEHALTEN) {
  return sicherungenVon(namen, dateiname).slice(behalten).map((s) => s.name);
}

/** Text „zuletzt synchronisiert um …“ für die Anzeige. */
export function syncStatusText(sync) {
  if (!sync) return '';
  if (sync.ausstehend) return 'Nicht synchronisiert (offline). Wird beim nächsten Online-Sein hochgeladen.';
  if (!sync.zuletzt) return 'Noch nicht synchronisiert.';
  return `Zuletzt synchronisiert um ${sync.zuletzt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
}

/**
 * Speicherort im Arbeitsspeicher für Tests: kennt eTag-Konflikte und „offline“.
 * `fremdSchreiben(text)` simuliert ein anderes Gerät.
 */
export function speicherOrt(name = 'Test.noten') {
  let inhalt = null;
  let zaehler = 0;
  const ort = {
    name,
    offline: false,
    dauerMs: 0, // so lange braucht ein Upload (langsames Netz)
    antwortVerlieren: false, // Upload kommt an, die Antwort aber nicht
    laeufe: { laden: 0, speichern: 0 },
    get inhalt() {
      return inhalt;
    },
    get etag() {
      return inhalt === null ? null : `"e${zaehler}"`;
    },
    async stand() {
      if (ort.offline) throw new Error('offline');
      return ort.etag;
    },
    async laden() {
      ort.laeufe.laden += 1;
      if (ort.offline) throw new Error('offline');
      return inhalt === null ? null : { text: inhalt, etag: ort.etag };
    },
    async speichern(text, erwartet) {
      ort.laeufe.speichern += 1;
      if (ort.offline) throw new Error('offline');
      if (ort.dauerMs) await new Promise((fertig) => setTimeout(fertig, ort.dauerMs));
      if (inhalt === null ? erwartet !== null : erwartet !== ort.etag) throw new SyncKonflikt();
      inhalt = text;
      zaehler += 1;
      if (ort.antwortVerlieren) throw new Error('Verbindung unterbrochen');
      return { etag: ort.etag };
    },
    fremdSchreiben(text) {
      inhalt = text;
      zaehler += 1;
    },
  };
  return ort;
}
