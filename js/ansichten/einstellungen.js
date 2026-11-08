// Einstellungen (dieses Gerät): Sperre, Untis-Ordner, OneDrive-Synchronisation.
import { K } from '../kontext.js';
import { h, leeren, toast, meldung, fuege } from '../ui.js';
import { einstellungen, einstellungSetzen, kannOrdnerWaehlen } from '../speicher.js';
import { ordnerWaehlen, ordnerEntfernen, gemerkterOrdner, ordnerErlaubnis, untisPruefen, sperreZuruecksetzen, untisUeberwachungStarten } from '../dienste.js';
import { onedriveAnmelden, onedriveAbmelden, onedriveAngemeldet, syncEinschalten, syncAusschalten, ausOneDriveOeffnen } from '../sync-ui.js';
import { syncStatusText } from '../sync.js';
import { ansichtRegistrieren } from '../registry.js';
import { bewertungBereich } from './bewertung.js';
import { fachZeile } from '../modell.js';

/** Stand der App (bei jeder Auslieferung mit sw.js VERSION erhöhen). */
export const APP_STAND = 'noten-v15';

export function zeigeEinstellungen() {
  const wurzel = h('section', { class: 'seite' });
  const e = einstellungen();

  const schalter = (id, text, wert, bei) =>
    h('label', { class: 'schalter' }, h('input', { type: 'checkbox', id, checked: wert, onchange: (ev) => bei(ev.target.checked) }), ` ${text}`);

  // ----- Sicherheit -----
  const sperre = h('select', { id: 'sperre-minuten', 'aria-label': 'Sperre nach Minuten', onchange: (ev) => { einstellungSetzen('sperreMinuten', Number(ev.target.value)); sperreZuruecksetzen(); } },
    [[0, 'nie'], [1, '1 Minute'], [5, '5 Minuten'], [10, '10 Minuten'], [15, '15 Minuten'], [30, '30 Minuten'], [60, '60 Minuten']].map(([w, t]) => h('option', { value: w, selected: Number(e.sperreMinuten) === w }, t)));

  // ----- Untis-Ordner -----
  const ordnerStatus = h('p', { class: 'klein', id: 'ordner-status' }, 'Kein Ordner gewählt.');
  const ordnerKnoepfe = h('div', { class: 'knopfreihe' });
  async function ordnerZeichnen() {
    leeren(ordnerKnoepfe);
    const handle = await gemerkterOrdner();
    if (!kannOrdnerWaehlen()) {
      ordnerStatus.textContent = 'Dieser Browser kann keinen Ordner überwachen (nur Chrome und Edge am PC). Nutzen Sie „Untis-Liste laden“, Ziehen-und-Ablegen oder den OneDrive-Eingang.';
      return;
    }
    if (!handle) {
      ordnerStatus.textContent = 'Kein Ordner gewählt.';
      fuege(ordnerKnoepfe, h('button', { type: 'button', class: 'knopf', id: 'ordner-waehlen', onclick: async () => { try { await ordnerWaehlen(); } catch (err) { if (err.name !== 'AbortError') await meldung('Ordner nicht möglich', err.message); } ordnerZeichnen(); } }, 'Untis-Ordner wählen …'));
      return;
    }
    const erlaubt = await ordnerErlaubnis(handle, e.untisLoeschen);
    ordnerStatus.textContent = `Überwachter Ordner: ${handle.name}${erlaubt ? '' : ' (Zugriff muss erneuert werden)'}`;
    fuege(ordnerKnoepfe,
      !erlaubt && h('button', { type: 'button', class: 'knopf primaer', onclick: async () => { await handle.requestPermission({ mode: e.untisLoeschen ? 'readwrite' : 'read' }); ordnerZeichnen(); } }, 'Zugriff erneuern'),
      h('button', { type: 'button', class: 'knopf', onclick: async () => { await ordnerEntfernen(); ordnerZeichnen(); } }, 'Ordner entfernen'),
      h('button', { type: 'button', class: 'knopf', id: 'untis-suchen', disabled: !K.buch, onclick: () => untisPruefen() }, 'Jetzt nach neuen Dateien suchen'));
  }
  ordnerZeichnen();

  // ----- OneDrive -----
  const clientId = h('input', { type: 'text', id: 'od-client', value: e.onedriveClientId, autocomplete: 'off', placeholder: 'Anwendungs-(Client-)ID', oninput: (ev) => einstellungSetzen('onedriveClientId', ev.target.value.trim()) });
  const tenantId = h('input', { type: 'text', id: 'od-tenant', value: e.onedriveTenantId, autocomplete: 'off', placeholder: 'Verzeichnis-(Mandanten-)ID', oninput: (ev) => einstellungSetzen('onedriveTenantId', ev.target.value.trim()) });
  const odStatus = h('p', { class: 'klein', id: 'od-status' });
  const odKnoepfe = h('div', { class: 'knopfreihe' });
  function odZeichnen() {
    leeren(odKnoepfe);
    odStatus.textContent = onedriveAngemeldet() ? 'Angemeldet.' : 'Nicht angemeldet.';
    if (K.buch) odStatus.textContent += K.sync ? ` Dieses Notenbuch wird synchronisiert. ${syncStatusText(K.sync)}` : ' Dieses Notenbuch wird nicht synchronisiert.';
    fuege(odKnoepfe,
      !onedriveAngemeldet() && h('button', { type: 'button', class: 'knopf primaer', id: 'od-anmelden', onclick: async () => { try { await onedriveAnmelden(); } catch (err) { await meldung('Anmeldung nicht möglich', err.message); } odZeichnen(); } }, 'Bei OneDrive anmelden'),
      onedriveAngemeldet() && h('button', { type: 'button', class: 'knopf', onclick: () => { onedriveAbmelden(); odZeichnen(); } }, 'Abmelden'),
      h('button', { type: 'button', class: 'knopf', id: 'od-oeffnen', onclick: () => ausOneDriveOeffnen() }, 'Aus OneDrive öffnen …'),
      K.buch && !K.sync && h('button', { type: 'button', class: 'knopf primaer', id: 'sync-an', onclick: async () => { await syncEinschalten(); odZeichnen(); } }, 'Synchronisation für dieses Notenbuch einschalten'),
      K.buch && K.sync && h('button', { type: 'button', class: 'knopf', onclick: () => { syncAusschalten(); odZeichnen(); } }, 'Synchronisation ausschalten'));
  }
  odZeichnen();

  // ----- Bewertung und Unterschriften je Klasse (stehen im Notenbuch, nicht nur auf diesem Gerät) -----
  const bewertungKlassen = (K.buch?.klassen || []).filter((k) => k.fachtyp !== 'sport');
  const bewertungKasten = h('div', { class: 'einstellung-block', id: 'bewertung-block' });
  function bewertungZeichnen(klassenId) {
    leeren(bewertungKasten);
    const d = bewertungKlassen.find((k) => k.id === klassenId) || bewertungKlassen[0];
    fuege(bewertungKasten,
      h('h2', {}, 'Bewertung und Unterschriften je Klasse'),
      h('p', { class: 'klein' }, 'Diese Einstellungen gehören zur gewählten Klasse und werden im Notenbuch gespeichert.'),
      h('label', {}, 'Klasse', h('select', { id: 'bewertung-klasse', 'aria-label': 'Klasse', onchange: (ev) => bewertungZeichnen(ev.target.value) },
        bewertungKlassen.map((k) => h('option', { value: k.id, selected: k.id === d.id }, `${k.kopf.klasse || 'Klasse'} ${fachZeile(k.kopf) ? '· ' + fachZeile(k.kopf) : ''}`)))),
      ...bewertungBereich(d));
  }
  if (bewertungKlassen.length) bewertungZeichnen(K.klasseId);

  fuege(wurzel,
    h('h1', {}, 'Einstellungen'),
    h('p', { class: 'klein' }, 'Die Einstellungen zu Sperre, Untis und OneDrive gelten nur für diesen Browser auf diesem Gerät.'),
    h('div', { class: 'einstellung-block' },
      h('h2', {}, 'Sperre'),
      h('label', {}, 'App nach Untätigkeit sperren (Passwort erneut eingeben). Nur wirksam, wenn die Notendatei ein Passwort hat.', sperre)),
    h('div', { class: 'einstellung-block' },
      h('h2', {}, 'Untis-Fehlzeiten automatisch abgleichen'),
      h('p', { class: 'klein' }, 'Wählen Sie einmalig den Ordner, in dem Ihr Browser Untis-Listen speichert (z. B. Downloads oder ein OneDrive-Ordner „Untis“). Die App prüft ihn beim Öffnen und danach jede Minute, solange sie sichtbar ist (Untis-Berichte und Stundenplan-Dateien `.ics`). Dateien nicht dauerhaft im Downloads-Ordner liegen lassen.'),
      ordnerStatus, ordnerKnoepfe,
      schalter('untis-loeschen', 'Datei nach dem Import löschen (braucht Schreibrecht für den Ordner)', e.untisLoeschen, (v) => { einstellungSetzen('untisLoeschen', v); ordnerZeichnen(); }),
      K.buch && schalter('untis-auto', 'Ohne Rückfrage abgleichen und direkt die Vorschlagsliste zeigen (für dieses Notenbuch)', !!K.buch.einstellungen.untisOrdnerAutomatisch, (v) => { K.buch.einstellungen.untisOrdnerAutomatisch = v; K.aenderung(); }),
      h('p', { class: 'klein' }, 'Android: Als installierte App erscheint „Notenverwaltung“ im Teilen-Menü. Untis-Datei teilen, dann startet der Abgleich. iPad: Knopf „Untis-Liste laden“ in der Klassenarbeits- und Nachschreib-Ansicht.')),
    bewertungKlassen.length > 0 && bewertungKasten,
    h('div', { class: 'einstellung-block' },
      h('h2', {}, 'OneDrive-Synchronisation (optional)'),
      h('p', { class: 'klein' }, 'Ohne Einrichtung arbeitet die App ausschließlich mit Dateien und sendet nichts ins Netz. Die Synchronisation lädt nur verschlüsselte Dateien in den eigenen App-Ordner Ihres dienstlichen OneDrive hoch (Ordner „Apps/<Name der App-Registrierung>“, kein Zugriff auf andere Dateien). Dafür muss die Schul-IT die App in Microsoft Entra ID registrieren (siehe README).'),
      h('div', { class: 'formular' }, h('label', {}, 'Client-ID', clientId), h('label', {}, 'Tenant-ID', tenantId)),
      h('p', { class: 'klein' }, 'Redirect-URI (so in der App-Registrierung eintragen): ', h('code', {}, location.origin + location.pathname)),
      schalter('od-autosave', 'Nach Änderungen automatisch hochladen', e.onedriveAutosave, (v) => einstellungSetzen('onedriveAutosave', v)),
      schalter('od-eingang', 'OneDrive-Ordner „Untis-Eingang“ nach neuen Untis-Dateien prüfen', e.onedriveEingang, (v) => { einstellungSetzen('onedriveEingang', v); untisUeberwachungStarten(); }),
      odStatus, odKnoepfe),
    h('p', { class: 'klein', id: 'app-stand' }, `App-Stand: ${APP_STAND}`),
  );
  return { el: wurzel };
}

ansichtRegistrieren('einstellungen', { text: 'Einstellungen', bauen: zeigeEinstellungen, klasse: false, reihe: 11, ohneBuch: true });
