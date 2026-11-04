// Reihen-Vorlagen Sport (SPEC 9.7). Die Texte sind Vorschläge und in der App je Reihe änderbar.
import { neueReihe, neuerPruefteil, neueId, STUFEN_STANDARD } from './modell.js';

const BEARBEITEN = '(Merkmal bitte eintragen)';

function teil(id, name, { zone = '', merkmale = [BEARBEITEN, BEARBEITEN, BEARBEITEN], stufen = null, versuche = 5, hoechst = null, gewicht = 1 } = {}) {
  return { ...neuerPruefteil(name), id, name, zone, merkmale, stufen, versuche, hoechst, gewicht };
}

/** Eingebaute Vorlagen. `reihe` enthält nur Definitionen, keine Werte. */
export const EINGEBAUTE_VORLAGEN = [
  {
    id: 'volleyball',
    name: 'Volleyball BBS',
    reihe: {
      gewichte: { pruefung: 0.5, mitarbeit: 0.5, verhalten: 0 },
      teile: [
        teil('vb-pritschen', 'Pritschen', {
          zone: 'Zuwurf hoch aus ca. 4 m; Ziel: Reifen/Klebebandquadrat beim Zuwerfer',
          merkmale: ['Hände über der Stirn, Körbchen', 'kleines und großes Dreieck', 'aus gebeugten Knien mit Ganzkörperstreckung'],
        }),
        teil('vb-baggern', 'Baggern', {
          zone: 'gleicher Ablauf wie Pritschen; Ziel: Reifen/Klebebandquadrat beim Zuwerfer',
          merkmale: ['Spielbrett gestreckt und geschlossen', 'Kontakt an den Unterarmen', 'Impuls aus den Beinen'],
        }),
        teil('vb-aufschlag', 'Aufschlag von unten', {
          zone: 'hinter der 3-m-Linie in der angesagten Hälfte',
          merkmale: [BEARBEITEN, BEARBEITEN, BEARBEITEN],
          stufen: ['Netz/Aus', 'im Feld vor der 3-m-Linie', 'hinter der 3-m-Linie', 'hinter der 3-m-Linie in der angesagten Hälfte'],
        }),
      ],
      direkte: [],
      merkmaleTexte: ['bewegt sich zum Ball und ruft ihn an', 'spielt gezielt in freie Räume', 'zählt sicher / leitet als Schiedsrichter'],
      ersatzTeile: [
        teil('vb-e-regeltest', 'Regeltest', { versuche: 0, hoechst: 40 }),
        teil('vb-e-aufwaermen', 'Aufwärmen anleiten', { versuche: 0, hoechst: 30 }),
        teil('vb-e-schiri', 'Schiedsrichterleistung', { versuche: 0, hoechst: 30 }),
      ],
    },
  },
  {
    id: 'badminton',
    name: 'Badminton BBS',
    reihe: {
      gewichte: { pruefung: 0.6, mitarbeit: 0.4, verhalten: 0 },
      teile: [
        teil('bm-lang', 'Aufschlag lang', { zone: 'Zone zwischen hinterer Doppel-Aufschlaglinie und Grundlinie', merkmale: ['Schlägerhaltung', BEARBEITEN, BEARBEITEN] }),
        teil('bm-kurz', 'Aufschlag kurz', { zone: 'direkt hinter der vorderen Aufschlaglinie, ca. 1 m tief (Klebelinie)', merkmale: ['Schlägerhaltung', BEARBEITEN, BEARBEITEN] }),
        teil('bm-clear', 'Clear', { zone: 'hinteres Feld bis ca. 1 m hinter der Grundlinie; 0 nur bei Netz, Halbfeld, Seitenaus', merkmale: ['Schlägerhaltung', BEARBEITEN, BEARBEITEN] }),
        teil('bm-drop', 'Drop', { zone: 'zwischen Netz und vorderer Aufschlaglinie', merkmale: ['Schlägerhaltung', BEARBEITEN, BEARBEITEN] }),
        teil('bm-smash', 'Smash', {
          zone: 'Bewertung über die Flugkurve',
          merkmale: ['Schlägerhaltung', BEARBEITEN, BEARBEITEN],
          stufen: ['Netz/Aus', 'im Feld mit Bogen', 'eindeutig abwärts', 'eindeutig abwärts und zusätzlich die Merkmale sauber'],
        }),
      ],
      direkte: [],
      merkmaleTexte: ['bewegt sich aktiv zum Ball, statt zu warten', 'spielt oder stellt sich taktisch sinnvoll', 'zählt sicher oder leitet ein Spiel ohne Eingreifen'],
      ersatzTeile: [],
    },
  },
  {
    id: 'ultimate',
    name: 'Ultimate Frisbee BBS',
    reihe: {
      gewichte: { pruefung: 1, mitarbeit: 0, verhalten: 0 },
      teile: [
        teil('ul-rueckhand', 'Rückhand', {
          zone: 'Zuspiel zu zweit auf ca. 8 m (Abwurfmarken); bewertet wird die werfende Person, der Partner fängt mit Sandwich-Fang (wird mitbewertet)',
          merkmale: ['Griff', 'seitliche Stellung', 'Scheibe flach und stabil'],
          stufen: ['kein Merkmal sauber', 'ein Merkmal sauber', 'zwei Merkmale sauber', 'alle drei Merkmale sauber'],
        }),
        teil('ul-vorhand', 'Vorhand', {
          zone: 'Zuspiel zu zweit auf ca. 8 m (Abwurfmarken); Fangart frei',
          merkmale: [BEARBEITEN, BEARBEITEN, BEARBEITEN],
          stufen: ['kein Merkmal sauber', 'ein Merkmal sauber', 'zwei Merkmale sauber', 'alle drei Merkmale sauber'],
        }),
      ],
      direkte: [{
        id: 'ul-spiel',
        name: 'Spiel',
        gewicht: 1,
        stufen: [
          'bietet sich ständig an, läuft in freie Räume, verteidigt aktiv',
          'meist in Bewegung',
          'beteiligt sich, wenn das Spiel in der Nähe ist',
          'bewegt sich nur in kleinem Radius',
          'steht überwiegend',
          'verweigert',
        ],
      }],
      merkmaleTexte: ['zählt beim Markieren korrekt', 'sagt Fouls und Scheibenwechsel fair und richtig an', 'bietet sich an und läuft frei'],
      ersatzTeile: [],
      ersatzHinweis: 'Regelplakat führen, Feld auf Regelverstöße beobachten, kurzer Regeltest',
    },
  },
  { id: 'basketball', name: 'Basketball', reihe: { gewichte: { pruefung: 0.5, mitarbeit: 0.5, verhalten: 0 }, teile: [], direkte: [], merkmaleTexte: ['', '', ''], ersatzTeile: [] } },
  { id: 'steppen', name: 'Steppen', reihe: { gewichte: { pruefung: 0.5, mitarbeit: 0.5, verhalten: 0 }, teile: [], direkte: [], merkmaleTexte: ['', '', ''], ersatzTeile: [] } },
  { id: 'tai-bo', name: 'Tai-Bo', reihe: { gewichte: { pruefung: 0.5, mitarbeit: 0.5, verhalten: 0 }, teile: [], direkte: [], merkmaleTexte: ['', '', ''], ersatzTeile: [] } },
];

const kopie = (x) => JSON.parse(JSON.stringify(x));

/** Alle Vorlagen des Notenbuchs: eingebaute, überlagert von eigenen gleichen Namens/ID. */
export function vorlagenListe(buch) {
  const eigene = buch?.einstellungen?.sportVorlagen || [];
  const liste = EINGEBAUTE_VORLAGEN.map((v) => eigene.find((e) => e.id === v.id) || v);
  for (const e of eigene) if (!liste.some((v) => v.id === e.id)) liste.push(e);
  return liste;
}

export function vorlageFinden(buch, id) {
  return vorlagenListe(buch).find((v) => v.id === id) || null;
}

/** Neue Reihe aus einer Vorlage. Die Reihe speichert eine Kopie und hält die Vorlagen-ID. */
export function reiheAusVorlage(vorlage, { name = '', halbjahr = 1 } = {}) {
  const r = neueReihe(name || vorlage.name.replace(/ BBS$/, ''));
  const v = kopie(vorlage.reihe);
  r.vorlage = vorlage.id;
  r.halbjahr = halbjahr;
  r.gewichte = { ...r.gewichte, ...v.gewichte };
  r.teile = v.teile;
  r.direkte = v.direkte;
  r.merkmaleTexte = v.merkmaleTexte;
  r.ersatzTeile = v.ersatzTeile;
  if (v.ersatzHinweis) r.ersatzHinweis = v.ersatzHinweis;
  return r;
}

/** Eine bestehende Reihe als eigene Vorlage speichern (ohne Werte). */
export function reiheAlsVorlage(reihe, name) {
  const id = `eigen-${neueId()}`;
  const v = kopie({ gewichte: reihe.gewichte, teile: reihe.teile, direkte: reihe.direkte, merkmaleTexte: reihe.merkmaleTexte, ersatzTeile: reihe.ersatzTeile, ersatzHinweis: reihe.ersatzHinweis });
  return { id, name, reihe: v };
}

/** Wie viele Personen haben in dieser Reihe schon Prüfungswerte? (für die Warnung vor „Änderungen übertragen“) */
export function personenMitWerten(reihe) {
  let n = 0;
  for (const w of Object.values(reihe.werte)) {
    const v = Object.values(w.versuche || {}).some((a) => Array.isArray(a) && a.some((x) => typeof x === 'number'));
    const s = Object.values(w.summen || {}).some((x) => typeof x === 'number');
    if (v || s) n += 1;
  }
  return n;
}

/**
 * „Änderungen übertragen“: ersetzt Definitionen der Reihe durch die der Vorlage.
 * Eingaben bleiben erhalten, soweit die Teile dieselbe ID haben (Werte entfernter Teile werden ignoriert).
 */
export function vorlageUebertragen(reihe, vorlage) {
  const v = kopie(vorlage.reihe);
  reihe.gewichte = { ...reihe.gewichte, ...v.gewichte };
  reihe.teile = v.teile;
  reihe.direkte = v.direkte;
  reihe.merkmaleTexte = v.merkmaleTexte;
  reihe.ersatzTeile = v.ersatzTeile;
  reihe.vorlage = vorlage.id;
}

export { STUFEN_STANDARD };
