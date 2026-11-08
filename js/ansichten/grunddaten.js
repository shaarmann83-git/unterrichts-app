import { K } from '../kontext.js';
import { h, leeren, bestaetigen, fuege, inhaltDialog, avatar, spaltenDialog, meldung, toast, auswahlMitFreitext } from '../ui.js';
import { neuerSchueler, aktiveSchueler, sortiereSchueler, heuteIso, buchHatFotos, datumDeutsch, UNTERSCHRIFTEN_STANDARD, UNTERSCHRIFT_VORLAGEN, BEZEICHNUNGEN, UNTERSCHRIFT_MIT_BETRIEB, UNTERSCHRIFT_OHNE_BETRIEB } from '../modell.js';
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
          // Die Einwilligung wird im Vorfeld geklärt. Beim Einschalten einmal für alle eintragen,
          // statt sie bei jeder Person einzeln anzuklicken.
          const ohne = aktiveSchueler(d).filter((s) => !s.fotoEinwilligung);
          if (ohne.length > 0 && await bestaetigen('Einwilligung eintragen',
            `Liegt die Einwilligung für alle ${ohne.length} Personen dieser Klasse vor? Dann trage ich sie mit dem heutigen Datum ein. Wer kein Foto möchte, bekommt einfach keines.`,
            'Ja, für alle eintragen')) {
            for (const s of ohne) s.fotoEinwilligung = { datum: heuteIso() };
          }
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
      d.bereiche.fotos && h('button', { type: 'button', class: 'knopf klein', title: 'Nützlich nach dem Import einer Schülerliste', onclick: async () => {
        const ohne = aktiveSchueler(d).filter((s) => !s.fotoEinwilligung);
        if (ohne.length === 0) return meldung('Nichts zu tun', 'Bei allen Personen dieser Klasse ist die Einwilligung bereits eingetragen.');
        if (!(await bestaetigen('Einwilligung eintragen', `Bei ${ohne.length} Person(en) fehlt die Einwilligung. Mit dem heutigen Datum eintragen?`, 'Eintragen'))) return;
        for (const s of ohne) s.fotoEinwilligung = { datum: heuteIso() };
        K.aenderung();
        K.neuZeichnen();
      } }, 'Einwilligung für alle eintragen'),
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
    d.fachtyp === 'sport' && h('h2', {}, 'Sport'),
    d.fachtyp === 'sport' && sportFelder(),
    d.fachtyp === 'sport' && h('p', { class: 'klein' }, 'Reihen, Termine und die Bewertung finden Sie in den Sport-Ansichten. Prüfungsschlüssel und Tabellen gelten für alle Sport-Klassen (Einstellungen → Sport-Einstellungen).'),
    d.fachtyp !== 'sport' && h('p', { class: 'klein' }, h('a', { href: '#/einstellungen' }, 'Notensystem, Notenschlüssel, Punkteschlüssel und Unterschriftszeilen finden Sie jetzt unter Einstellungen.')),
    d.fachtyp !== 'sport' && h('h2', {}, 'Gewichtung'),
    d.fachtyp !== 'sport' && h('div', { class: 'formular' }, h('label', {}, 'Schriftlich in % (0 bis 100)', schriftlich), h('p', {}, 'Sonstige Leistung: ', sonstige)),
    h('h2', {}, 'Bereiche dieser Klasse'),
    h('p', { class: 'klein' }, 'Ausgeschaltete Bereiche sind in dieser Klasse unsichtbar.'),
    bereiche,
    h('div', { class: 'knopfreihe' },
      h('button', { type: 'button', class: 'knopf', id: 'liste-anlegen', onclick: async () => { const l = await listeAnlegenDialog(d); if (l) K.navigiere('listen'); } }, '+ Eigene Liste anlegen (Strich-, Abhak-, Betragsliste)'),
      d.listen.length > 0 && h('a', { class: 'knopf', href: '#/listen' }, `Eigene Listen (${d.listen.length})`)),
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
