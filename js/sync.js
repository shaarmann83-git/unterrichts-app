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
  return { ort, etag, zuletzt: null, ausstehend: false };
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
 */
export async function syncHochladen(sync, text) {
  try {
    const r = await sync.ort.speichern(text, sync.etag);
    sync.etag = r.etag;
    sync.zuletzt = new Date();
    sync.ausstehend = false;
    return r;
  } catch (e) {
    if (e.konflikt) throw e;
    sync.ausstehend = true;
    throw e;
  }
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
    laeufe: { laden: 0, speichern: 0 },
    get inhalt() {
      return inhalt;
    },
    get etag() {
      return inhalt === null ? null : `"e${zaehler}"`;
    },
    async laden() {
      ort.laeufe.laden += 1;
      if (ort.offline) throw new Error('offline');
      return inhalt === null ? null : { text: inhalt, etag: ort.etag };
    },
    async speichern(text, erwartet) {
      ort.laeufe.speichern += 1;
      if (ort.offline) throw new Error('offline');
      if (inhalt === null ? erwartet !== null : erwartet !== ort.etag) throw new SyncKonflikt();
      inhalt = text;
      zaehler += 1;
      return { etag: ort.etag };
    },
    fremdSchreiben(text) {
      inhalt = text;
      zaehler += 1;
    },
  };
  return ort;
}
