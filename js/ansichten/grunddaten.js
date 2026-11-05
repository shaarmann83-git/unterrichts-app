import { K } from '../kontext.js';
import { h, leeren, bestaetigen, fuege, inhaltDialog, avatar, spaltenDialog, meldung, toast, auswahlMitFreitext } from '../ui.js';
import { neuerSchueler, sortiereSchueler, heuteIso, buchHatFotos, datumDeutsch, UNTERSCHRIFTEN_STANDARD, UNTERSCHRIFT_VORLAGEN, BEZEICHNUNGEN } from '../modell.js';
import { istVolljaehrig, zahlLesen, NOTENGRENZEN_STANDARD, PUNKTEGRENZEN_STANDARD } from '../rechnen.js';
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
      d.fachtyp !== 'sport' && h('label', {}, 'Dalton', daltonWahl),
      d.fachtyp !== 'sport' && d.dalton.modus === 'einrechnen' && h('label', {}, 'Anteil an der sonstigen Leistung in %', anteil),
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

  // Sport: Fachtyp, Notensystem, Zeitraum, Endnote (SPEC 9.1, 9.5)
  const sportFelder = () => {
    const wahl = (id, text, optionen, aktuell, bei) => h('label', {}, text, h('select', { id, 'aria-label': text, onchange: (e) => bei(e.target.value) }, optionen.map(([w, t]) => h('option', { value: w, selected: aktuell === w }, t))));
    return h('div', { class: 'formular' },
      wahl('sport-notensystem', 'Notensystem', [['noten', 'Noten 1,0–6,0'], ['punkte', 'Punkte 0–15']], d.sport.notensystem, (v) => { d.sport.notensystem = v; K.aenderung(); }),
      wahl('sport-zeitraum', 'Zeitraum', [['halbjahr', 'ein Halbjahr'], ['jahr', 'ganzes Schuljahr']], d.sport.zeitraum, (v) => { d.sport.zeitraum = v; K.aenderung(); K.neuZeichnen(); }),
      wahl('sport-endnote', 'Endnote berechnen aus', [['besser', 'der für die Klasse insgesamt besseren Variante'], ['wert', 'immer Ø Wert'], ['note', 'immer Ø Note']], d.sport.endnoteVariante, (v) => { d.sport.endnoteVariante = v; K.aenderung(); }));
  };
  const fachtypWahl = h('label', {}, 'Fachtyp', h('select', { id: 'grund-fachtyp', 'aria-label': 'Fachtyp', onchange: async (e) => {
    const neu = e.target.value;
    if (neu === d.fachtyp) return;
    const hatDaten = d.klassenarbeiten.some((ka) => Object.keys(ka.ergebnisse).length) || d.sonstige.length || d.sport.reihen.length;
    if (hatDaten && !(await bestaetigen('Fachtyp wechseln', 'Die vorhandenen Eingaben bleiben gespeichert, sind aber in dieser Klasse nur unter dem jeweils anderen Fachtyp sichtbar. Fachtyp wirklich wechseln?', 'Wechseln', true))) {
      e.target.value = d.fachtyp;
      return;
    }
    d.fachtyp = neu;
    K.aenderung();
    K.navigiere(neu === 'sport' ? 'nachstunde' : 'gesamt');
    K.neuZeichnen();
  } }, [['lernfeld', 'Lernfeld/Fach'], ['sport', 'Sport']].map(([w, t]) => h('option', { value: w, selected: d.fachtyp === w }, t))));
  fuege(wurzel,
    h('h1', {}, 'Grunddaten'),
    h(
      'div',
      { class: 'formular' },
      textFeld('Klasse', d.kopf, 'klasse'),
      h('label', {}, 'Bezeichnung', auswahlMitFreitext({
        werte: BEZEICHNUNGEN,
        wert: d.kopf.fachLabel || 'Lernfeld',
        bezeichnung: 'Bezeichnung',
        beiAenderung: (v) => { d.kopf.fachLabel = v || 'Lernfeld'; K.aenderung(); },
      }).el),
      textFeld(`${d.kopf.fachLabel || 'Lernfeld'}-Nr.`, d.kopf, 'lernfeldNr'),
      textFeld(`${d.kopf.fachLabel || 'Lernfeld'}-Bezeichnung`, d.kopf, 'lernfeldBez', true),
      textFeld('Schuljahr', d.kopf, 'schuljahr'),
      fachtypWahl,
    ),
    d.fachtyp !== 'sport' && h('h2', {}, 'Notensystem'),
    d.fachtyp !== 'sport' && h('div', { class: 'formular' },
      h('label', {}, 'Ausgabe', h('select', { id: 'notensystem', 'aria-label': 'Notensystem', onchange: (e) => { d.notensystem = e.target.value; K.aenderung(); K.neuZeichnen(); } },
        [['noten', 'Noten 1 bis 6 (IHK-Schema)'], ['punkte', 'Notenpunkte 0 bis 15']].map(([w, t]) => h('option', { value: w, selected: (d.notensystem || 'noten') === w }, t))))),
    d.fachtyp !== 'sport' && h('p', { class: 'klein' }, d.notensystem === 'punkte'
      ? 'Gerechnet wird wie bisher über Prozent. Erst am Schluss wird der Prozentwert über den Punkteschlüssel in Notenpunkte umgesetzt. Die sonstige Leistung wird als Punktwert 0 bis 15 eingetragen.'
      : 'Gerechnet wird über Prozent. Die sonstige Leistung wird als Note 1,0 bis 6,0 eingetragen und über das IHK-Schema in Prozent umgesetzt.'),
    d.fachtyp !== 'sport' && h('h2', {}, 'Notenschlüssel'),
    d.fachtyp !== 'sport' && h('p', { class: 'klein' }, 'Ab wie viel Prozent gilt welche Note? Die Werte sind Untergrenzen: Steht bei Note 1 der Wert 91,5, gibt es ab 91,5 % eine 1. Unter der letzten Grenze gilt die Note 6. Gilt nur für diese Klasse.'),
    d.fachtyp !== 'sport' && h('div', { class: 'formular' },
      [1, 2, 3, 4, 5].map((note, i) => h('label', {}, `Note ${note} ab %`,
        h('input', {
          type: 'text', inputmode: 'decimal', class: 'gewicht',
          'aria-label': `Note ${note} ab Prozent`,
          value: String(d.notengrenzen[i]).replace('.', ','),
          oninput: (e) => {
            const z = zahlLesen(e.target.value);
            const ok = z !== null && !Number.isNaN(z) && z >= 0 && z <= 100;
            e.target.classList.toggle('fehler', !ok);
            if (ok) { d.notengrenzen[i] = z; K.aenderung(); }
          },
        }))),
      h('div', { class: 'knopfreihe' },
        h('button', { type: 'button', class: 'knopf klein', onclick: () => { d.notengrenzen = [...NOTENGRENZEN_STANDARD]; K.aenderung(); K.neuZeichnen(); } }, 'Standard wiederherstellen')),
    ),
    d.fachtyp !== 'sport' && h('h2', {}, 'Punkteschlüssel (0 bis 15)'),
    d.fachtyp !== 'sport' && h('p', { class: 'klein' }, 'Nur für Klassen mit Punktsystem. Auch hier sind die Werte Untergrenzen. Voreingestellt ist das Bewertungsschema BG 11, 12 und 13 der BBS Lingen Wirtschaft. Die Umstellung einer Klasse auf Punkte ist noch in Arbeit.'),
    d.fachtyp !== 'sport' && h('div', { class: 'formular' },
      [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((pkt, i) => h('label', {}, `${String(pkt).padStart(2, '0')} Punkte ab %`,
        h('input', {
          type: 'text', inputmode: 'decimal', class: 'gewicht',
          'aria-label': `${pkt} Punkte ab Prozent`,
          value: String(d.punktegrenzen[i]).replace('.', ','),
          oninput: (e) => {
            const z = zahlLesen(e.target.value);
            const ok = z !== null && !Number.isNaN(z) && z >= 0 && z <= 100;
            e.target.classList.toggle('fehler', !ok);
            if (ok) { d.punktegrenzen[i] = z; K.aenderung(); }
          },
        }))),
      h('div', { class: 'knopfreihe' },
        h('button', { type: 'button', class: 'knopf klein', onclick: () => { d.punktegrenzen = [...PUNKTEGRENZEN_STANDARD]; K.aenderung(); K.neuZeichnen(); } }, 'Standard wiederherstellen')),
    ),
    d.fachtyp !== 'sport' && h('h2', {}, 'Unterschriftszeilen im Ausdruck'),
    d.fachtyp !== 'sport' && h('p', { class: 'klein' }, 'Diese Zeilen stehen unter dem Protokoll zur Klassenarbeit. Leere Zeilen werden nicht gedruckt. Beispiel für Schüler:innen ohne Ausbildung: „Unterschrift Erziehungsberechtigte(r) (unter 18)“.'),
    d.fachtyp !== 'sport' && h('div', { class: 'formular' },
      (d.unterschriften || []).map((t, i) => {
        const feld = h('input', { type: 'text', value: t, 'aria-label': `Unterschriftszeile ${i + 1}`, oninput: (e) => { d.unterschriften[i] = e.target.value; K.aenderung(); } });
        // Vorlage wählen füllt das Textfeld; danach lässt es sich weiter ändern.
        const vorlage = h('select', { 'aria-label': `Vorlage für Zeile ${i + 1}`, onchange: (e) => {
          if (!e.target.value) return;
          feld.value = e.target.value;
          d.unterschriften[i] = e.target.value;
          K.aenderung();
          e.target.value = '';
        } }, [h('option', { value: '' }, 'Vorlage wählen …'), ...UNTERSCHRIFT_VORLAGEN.map((v) => h('option', { value: v }, v))]);
        return h('label', { class: 'breit' }, `Zeile ${i + 1}`, h('div', { class: 'zeile-mit-vorlage' }, feld, vorlage));
      }),
      h('div', { class: 'knopfreihe' },
        h('button', { type: 'button', class: 'knopf klein', onclick: () => { (d.unterschriften ||= []).push(''); K.aenderung(); K.neuZeichnen(); } }, '+ Zeile'),
        (d.unterschriften || []).length > 0 && h('button', { type: 'button', class: 'knopf klein', onclick: () => { d.unterschriften.pop(); K.aenderung(); K.neuZeichnen(); } }, 'Letzte Zeile entfernen'),
        h('button', { type: 'button', class: 'knopf klein', onclick: () => { d.unterschriften = [...UNTERSCHRIFTEN_STANDARD]; K.aenderung(); K.neuZeichnen(); } }, 'Standard wiederherstellen')),
    ),
    d.fachtyp === 'sport' && h('h2', {}, 'Sport'),
    d.fachtyp === 'sport' && sportFelder(),
    d.fachtyp === 'sport' && h('p', { class: 'klein' }, 'Reihen, Termine und die Bewertung finden Sie in den Sport-Ansichten. Prüfungsschlüssel und Tabellen gelten für alle Sport-Klassen (Einstellungen → Sport-Einstellungen).'),
    d.fachtyp !== 'sport' && h('h2', {}, 'Gewichtung'),
    d.fachtyp !== 'sport' && h('div', { class: 'formular' }, h('label', {}, 'Schriftlich in % (0 bis 100)', schriftlich), h('p', {}, 'Sonstige Leistung: ', sonstige)),
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
