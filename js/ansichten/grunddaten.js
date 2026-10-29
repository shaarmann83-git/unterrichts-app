import { K } from '../kontext.js';
import { h, leeren, bestaetigen, fuege, inhaltDialog, avatar, spaltenDialog, meldung, toast } from '../ui.js';
import { neuerSchueler, sortiereSchueler, heuteIso, buchHatFotos, datumDeutsch } from '../modell.js';
import { istVolljaehrig, zahlLesen } from '../rechnen.js';
import { passwortSetzen, passwortEntfernen, speichern, passwortFuerFotosSicherstellen } from '../aktionen.js';
import { kannDirektSpeichern, dateiAlsBytes } from '../speicher.js';
import { tabelleAusDatei } from '../tabelle-datei.js';
import { listeAnlegenDialog } from './listen.js';
import { schuelerSpaltenRaten, schuelerAusZeilen, schuelerVergleichen, schuelerUebernehmen, SCHUELER_FELDER } from '../schuelerliste.js';

/** Schülerliste aus Excel/CSV importieren (SPEC 8.12): Zuordnung, Vorschau, Bestätigung. */
export async function schuelerlisteImportieren(klasse) {
  const d = await dateiAlsBytes('.xlsx,.xls,.csv,.txt');
  if (!d) return false;
  let tabelle;
  try {
    tabelle = tabelleAusDatei(d.text, d.name);
  } catch (e) {
    await meldung('Import nicht möglich', e.message);
    return false;
  }
  if (tabelle.length < 2) {
    await meldung('Import nicht möglich', 'Die Datei enthält keine Zeilen mit Daten.');
    return false;
  }
  const kopf = tabelle[0].map((t) => String(t ?? ''));
  let zuordnung = schuelerSpaltenRaten(kopf);
  const hatName = (z) => z.name !== undefined || z.namevorname !== undefined;
  if (!hatName(zuordnung)) {
    zuordnung = await spaltenDialog({ titel: 'Spalten zuordnen', kopf, felder: SCHUELER_FELDER, zuordnung, beispielZeilen: tabelle.slice(1, 4) });
    if (!zuordnung) return false;
    if (!hatName(zuordnung)) {
      await meldung('Zuordnung fehlt', 'Bitte mindestens die Spalte „Name“ oder „Name, Vorname“ zuordnen.');
      return false;
    }
  }
  const entwuerfe = schuelerAusZeilen(tabelle.slice(1), zuordnung);
  const vergleich = schuelerVergleichen(klasse, entwuerfe);
  const neu = vergleich.filter((v) => !v.vorhanden).length;
  const tab = h(
    'div',
    { class: 'tabelle-rahmen' },
    h('table', { class: 'tabelle' }, h('thead', {}, h('tr', {}, ['', 'Name', 'Vorname', 'Geburtstag'].map((t) => h('th', {}, t)))), h('tbody', {}, vergleich.map((v) => h('tr', { class: v.vorhanden ? 'zeile-grau' : 'zeile-gruen' }, h('td', {}, v.vorhanden ? 'vorhanden' : 'neu'), h('td', { class: 'links' }, v.name), h('td', { class: 'links' }, v.vorname), h('td', {}, datumDeutsch(v.geburtstag)))))),
  );
  const ok = await inhaltDialog('Schülerliste importieren: Vorschau', [h('p', {}, `${neu} neue Person(en), ${vergleich.length - neu} bereits vorhanden (grau, werden nicht doppelt angelegt). Nichts wird ohne Bestätigung übernommen.`), tab], [
    { text: 'Abbrechen', wert: false, abbruch: true },
    neu > 0 && { text: `${neu} Person(en) übernehmen`, wert: true, klasse: 'knopf primaer' },
  ].filter(Boolean));
  if (!ok) return false;
  schuelerUebernehmen(klasse, vergleich);
  K.aenderung();
  toast(`${neu} Person(en) übernommen.`);
  return true;
}

export function zeigeGrunddaten() {
  const d = K.daten;
  const wurzel = h('section', { class: 'seite' });

  const textFeld = (beschriftung, objekt, schluessel, breit = false) =>
    h(
      'label',
      { class: breit ? 'breit' : '' },
      beschriftung,
      h('input', {
        type: 'text',
        value: objekt[schluessel] ?? '',
        oninput: (e) => {
          objekt[schluessel] = e.target.value;
          K.aenderung();
        },
      }),
    );

  const schriftlich = h('input', {
    type: 'text',
    inputmode: 'decimal',
    value: String(d.gewichtSchriftlich).replace('.', ','),
    'aria-label': 'Gewichtung schriftlich in Prozent',
    oninput: (e) => {
      const z = zahlLesen(e.target.value);
      const ok = z !== null && !Number.isNaN(z) && z >= 0 && z <= 100;
      e.target.classList.toggle('fehler', !ok);
      if (ok) {
        d.gewichtSchriftlich = z;
        sonstige.textContent = `${String(100 - z).replace('.', ',')} %`;
        K.aenderung();
      }
    },
  });
  const sonstige = h('strong', {}, `${String(100 - d.gewichtSchriftlich).replace('.', ',')} %`);

  // ----- Schaltbare Bereiche (SPEC 8.2) -----
  const bereiche = h('div', { class: 'formular' });
  function bereicheZeichnen() {
    leeren(bereiche);
    const daltonWahl = h(
      'select',
      {
        'aria-label': 'Dalton',
        onchange: (e) => {
          d.dalton.modus = e.target.value;
          K.aenderung();
          bereicheZeichnen();
        },
      },
      [['aus', 'aus'], ['doku', 'nur dokumentieren'], ['einrechnen', 'fließt in die sonstige Leistung ein']].map(([w, t]) => h('option', { value: w, selected: d.dalton.modus === w }, t)),
    );
    const anteil = h('input', {
      type: 'text',
      inputmode: 'decimal',
      class: 'gewicht',
      'aria-label': 'Dalton-Anteil in Prozent',
      value: String(d.dalton.anteil).replace('.', ','),
      oninput: (e) => {
        const z = zahlLesen(e.target.value);
        const ok = z !== null && !Number.isNaN(z) && z >= 0 && z <= 100;
        e.target.classList.toggle('fehler', !ok);
        if (ok) {
          d.dalton.anteil = z;
          K.aenderung();
        }
      },
    });
    const duales = h('input', {
      type: 'checkbox',
      id: 'schalter-duales',
      checked: d.bereiche.duales,
      onchange: (e) => {
        d.bereiche.duales = e.target.checked;
        K.aenderung();
        K.neuZeichnen();
      },
    });
    const fotos = h('input', {
      type: 'checkbox',
      id: 'schalter-fotos',
      checked: d.bereiche.fotos,
      onchange: async (e) => {
        if (e.target.checked) {
          // Fotos nur mit Passwort (SPEC 8.9): zuerst ein Passwort setzen lassen.
          if (!K.passwort) {
            await meldung('Passwort nötig', 'Fotos dürfen nur in einer passwortgeschützten Notendatei gespeichert werden. Bitte setzen Sie jetzt ein Passwort.');
            await passwortSetzen();
            if (!K.passwort) {
              e.target.checked = false;
              return;
            }
          }
          d.bereiche.fotos = true;
        } else if (d.schueler.some((s) => s.foto)) {
          const ja = await bestaetigen('Fotos ausschalten', 'Alle Fotos und Einwilligungen dieser Klasse werden gelöscht.', 'Fotos löschen', true);
          if (!ja) {
            e.target.checked = true;
            return;
          }
          for (const s of d.schueler) {
            s.foto = null;
            s.fotoEinwilligung = null;
          }
          d.bereiche.fotos = false;
        } else d.bereiche.fotos = false;
        K.aenderung();
        K.neuZeichnen();
      },
    });
    fuege(
      bereiche,
      h('label', {}, 'Dalton', daltonWahl),
      d.dalton.modus === 'einrechnen' && h('label', {}, 'Anteil an der sonstigen Leistung in %', anteil),
      h('label', { class: 'schalter' }, duales, ' Duales System (Ausbildungsbetrieb je Person)'),
      h('label', { class: 'schalter' }, fotos, ' Fotos'),
    );
  }
  bereicheZeichnen();

  // ----- Schülerliste -----
  const tbody = h('tbody');
  const fotosAn = d.bereiche.fotos;
  function zeilen() {
    leeren(tbody);
    d.schueler.forEach((s, i) => {
      if (s.archiviert) return;
      const vollj = h('span', { class: 'vollj' });
      const manuell = h('input', {
        type: 'checkbox',
        'aria-label': 'Volljährig (manuell)',
        checked: s.volljaehrig,
        onchange: (e) => {
          s.volljaehrig = e.target.checked;
          K.aenderung();
        },
      });
      const volljAnzeige = () => {
        const v = istVolljaehrig(s.geburtstag);
        if (v === null) {
          leeren(vollj);
          vollj.append(manuell);
        } else {
          leeren(vollj);
          vollj.textContent = v ? 'ja' : 'nein';
        }
      };
      volljAnzeige();
      const feld = (schluessel) =>
        h('input', {
          type: 'text',
          value: s[schluessel] ?? '',
          'aria-label': `${schluessel} Zeile ${i + 1}`,
          'data-sp': schluessel,
          oninput: (e) => {
            s[schluessel] = e.target.value;
            K.aenderung();
          },
        });
      const leer = !s.name && !s.vorname;
      tbody.append(
        h(
          'tr',
          {},
          h('td', { class: 'zahl' }, String(i + 1)),
          fotosAn && h('td', {}, avatar(d, s)),
          h('td', {}, feld('name')),
          h('td', {}, feld('vorname')),
          h(
            'td',
            {},
            h(
              'select',
              {
                'aria-label': `Geschlecht Zeile ${i + 1}`,
                onchange: (e) => {
                  s.geschlecht = e.target.value;
                  K.aenderung();
                },
              },
              ['', 'm', 'w', 'd'].map((g) => h('option', { value: g, selected: s.geschlecht === g }, g || '–')),
            ),
          ),
          h(
            'td',
            {},
            h('input', {
              type: 'date',
              value: s.geburtstag || '',
              'aria-label': `Geburtstag Zeile ${i + 1}`,
              onchange: (e) => {
                s.geburtstag = e.target.value;
                volljAnzeige();
                K.aenderung();
              },
            }),
          ),
          h('td', { class: 'mitte' }, vollj),
          h('td', {}, h('input', { type: 'text', class: 'untis-id', value: s.untisId || '', 'aria-label': `Untis-ID Zeile ${i + 1}`, oninput: (e) => { s.untisId = e.target.value.trim(); K.aenderung(); } })),
          h(
            'td',
            { class: 'zeilenknoepfe' },
            h('button', { type: 'button', class: 'knopf klein', title: 'Nach oben', 'aria-label': 'Nach oben', disabled: i === 0, onclick: () => verschieben(i, -1) }, '↑'),
            h('button', { type: 'button', class: 'knopf klein', title: 'Nach unten', 'aria-label': 'Nach unten', disabled: i === d.schueler.length - 1, onclick: () => verschieben(i, 1) }, '↓'),
            !leer && h('a', { class: 'knopf klein', href: `#/person/${s.id}` }, 'Person'),
            leer
              ? h('button', { type: 'button', class: 'knopf klein gefahr', title: 'Leere Zeile löschen', 'aria-label': 'Leere Zeile löschen', onclick: () => leereZeileLoeschen(i) }, '✕')
              : h('button', { type: 'button', class: 'knopf klein', title: 'Archivieren', onclick: () => archivieren(s) }, 'Archivieren'),
          ),
        ),
      );
    });
  }

  function verschieben(i, richtung) {
    const j = i + richtung;
    if (j < 0 || j >= d.schueler.length) return;
    [d.schueler[i], d.schueler[j]] = [d.schueler[j], d.schueler[i]];
    zeilen();
    K.aenderung();
  }

  async function leereZeileLoeschen(i) {
    if (!(await bestaetigen('Zeile löschen', 'Diese leere Zeile wird gelöscht.', 'Löschen', true))) return;
    d.schueler.splice(i, 1);
    zeilen();
    K.aenderung();
  }

  async function archivieren(s) {
    const datum = h('input', { type: 'date', value: heuteIso() });
    const grund = h('input', { type: 'text', placeholder: 'z. B. Ausbildungsabbruch, Klassenwechsel' });
    const ok = await inhaltDialog(`„${[s.vorname, s.name].filter(Boolean).join(' ')}“ archivieren`, [
      h('p', {}, 'Archivierte Personen erscheinen nicht mehr in Eingabelisten, Schnelleingabe, Notenspiegel und Druck. Ihre Daten bleiben erhalten und können im Archiv wiederhergestellt werden.'),
      h('label', {}, 'Datum', datum),
      h('label', {}, 'Grund (optional)', grund),
    ], [
      { text: 'Abbrechen', wert: false, abbruch: true },
      { text: 'Archivieren', wert: true, klasse: 'knopf primaer' },
    ]);
    if (!ok) return;
    s.archiviert = { datum: datum.value || heuteIso(), grund: grund.value.trim() };
    zeilen();
    K.aenderung();
  }

  zeilen();

  const passwortBereich = h('div', { class: 'knopfreihe' });
  function passwortZeichnen() {
    leeren(passwortBereich);
    fuege(
      passwortBereich,
      h('span', {}, K.passwort ? 'Passwortschutz: an (gilt ab dem nächsten Speichern)' : 'Passwortschutz: aus'),
      h('button', { type: 'button', class: 'knopf', onclick: async () => { await passwortSetzen(); passwortZeichnen(); } }, K.passwort ? 'Passwort ändern' : 'Passwort setzen'),
      K.passwort && h('button', { type: 'button', class: 'knopf', onclick: async () => { await passwortEntfernen(); passwortZeichnen(); } }, 'Passwort entfernen'),
    );
  }
  passwortZeichnen();

  wurzel.append(
    h('h1', {}, 'Grunddaten'),
    h(
      'div',
      { class: 'formular' },
      textFeld('Klasse', d.kopf, 'klasse'),
      textFeld('Lernfeld-Nr.', d.kopf, 'lernfeldNr'),
      textFeld('Lernfeld-Bezeichnung', d.kopf, 'lernfeldBez', true),
      textFeld('Schuljahr', d.kopf, 'schuljahr'),
    ),
    h('h2', {}, 'Gewichtung'),
    h('div', { class: 'formular' }, h('label', {}, 'Schriftlich in % (0 bis 100)', schriftlich), h('p', {}, 'Sonstige Leistung: ', sonstige)),
    h('h2', {}, 'Bereiche dieser Klasse'),
    h('p', { class: 'klein' }, 'Ausgeschaltete Bereiche sind in dieser Klasse unsichtbar.'),
    bereiche,
    h('div', { class: 'knopfreihe' },
      h('button', { type: 'button', class: 'knopf', id: 'liste-anlegen', onclick: async () => { const l = await listeAnlegenDialog(d); if (l) K.navigiere('listen'); } }, '+ Eigene Liste anlegen (Strich-, Abhak-, Betragsliste)'),
      d.listen.length > 0 && h('a', { class: 'knopf', href: '#/listen' }, `Eigene Listen (${d.listen.length})`)),
    h('h2', {}, 'Notendatei'),
    h(
      'p',
      { class: 'klein' },
      kannDirektSpeichern()
        ? 'Speichern überschreibt die geöffnete Datei direkt.'
        : 'Dieser Browser kann nicht direkt in die Datei speichern: „Speichern“ lädt die Datei herunter. Legen Sie sie an einem geschützten Ort ab.',
    ),
    h(
      'div',
      { class: 'knopfreihe' },
      h('button', { type: 'button', class: 'knopf primaer', onclick: () => speichern() }, 'Speichern'),
      h('button', { type: 'button', class: 'knopf', onclick: () => speichern({ neuWaehlen: true }) }, 'Speichern unter …'),
    ),
    passwortBereich,
    h('p', { class: 'warnung' }, 'Ein vergessenes Passwort kann nicht wiederhergestellt werden. Ohne Passwort ist die Datei nicht lesbar.'),
    h('h2', {}, 'Schüler:innen'),
    h(
      'div',
      { class: 'knopfreihe' },
      h('button', { type: 'button', class: 'knopf', onclick: () => { d.schueler.push(neuerSchueler()); zeilen(); K.aenderung(); } }, 'Zeile hinzufügen'),
      h('button', { type: 'button', class: 'knopf', onclick: () => { d.schueler = sortiereSchueler(d.schueler); zeilen(); K.aenderung(); } }, 'Alphabetisch sortieren'),
      h('button', { type: 'button', class: 'knopf', onclick: async () => { if (await schuelerlisteImportieren(d)) K.neuZeichnen(); } }, 'Schülerliste importieren'),
      h('a', { class: 'knopf', href: '#/archiv' }, 'Archiv'),
    ),
    h(
      'div',
      { class: 'tabelle-rahmen' },
      h(
        'table',
        { class: 'tabelle' },
        h('thead', {}, h('tr', {}, ['Nr.', fotosAn && '', 'Name', 'Vorname', 'm/w/d', 'Geburtstag', 'Volljährig', 'Untis-ID', ''].filter((t) => t !== false).map((t) => h('th', {}, t)))),
        tbody,
      ),
    ),
  );
  return { el: wurzel };
}
