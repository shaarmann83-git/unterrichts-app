import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EINGEBAUTE_VORLAGEN, vorlagenListe, vorlageFinden, reiheAusVorlage, reiheAlsVorlage, personenMitWerten, vorlageUebertragen } from '../js/sport-vorlagen.js';
import { teilHoechstwert, pruefungsprozent, einstellungenAus, reihenErgebnis } from '../js/sport.js';
import { neueKlasse, neuesBuch, pruefeBuch } from '../js/modell.js';

const v = (id) => EINGEBAUTE_VORLAGEN.find((x) => x.id === id);

test('Mitgelieferte Vorlagen: Badminton, Volleyball, Ultimate; leer Basketball, Steppen, Tai-Bo', () => {
  assert.deepEqual(EINGEBAUTE_VORLAGEN.map((x) => x.name), ['Volleyball BBS', 'Badminton BBS', 'Ultimate Frisbee BBS', 'Basketball', 'Steppen', 'Tai-Bo']);
  for (const id of ['basketball', 'steppen', 'tai-bo']) assert.equal(v(id).reihe.teile.length, 0);
});

test('Volleyball BBS: 0,5/0,5/0, drei Teile à 5 Versuche (Höchstwert 15), Ersatzprüfung 40/30/30', () => {
  const r = reiheAusVorlage(v('volleyball'));
  assert.deepEqual(r.gewichte, { pruefung: 0.5, mitarbeit: 0.5, verhalten: 0 });
  assert.deepEqual(r.teile.map((t) => t.name), ['Pritschen', 'Baggern', 'Aufschlag von unten']);
  assert.ok(r.teile.every((t) => t.versuche === 5 && teilHoechstwert(t) === 15));
  assert.deepEqual(r.ersatzTeile.map((t) => [t.name, teilHoechstwert(t)]), [['Regeltest', 40], ['Aufwärmen anleiten', 30], ['Schiedsrichterleistung', 30]]);
  assert.equal(r.teile[0].merkmale[0], 'Hände über der Stirn, Körbchen');
  assert.equal(r.teile[2].stufen.length, 4);
  assert.deepEqual(r.merkmaleTexte, ['bewegt sich zum Ball und ruft ihn an', 'spielt gezielt in freie Räume', 'zählt sicher / leitet als Schiedsrichter']);
  assert.equal(r.vorlage, 'volleyball');
});

test('Badminton BBS: 0,6/0,4/0, fünf Teile à 15; Smash mit eigenen Stufen; Schlägerhaltung als Merkmal', () => {
  const r = reiheAusVorlage(v('badminton'));
  assert.deepEqual(r.gewichte, { pruefung: 0.6, mitarbeit: 0.4, verhalten: 0 });
  assert.deepEqual(r.teile.map((t) => t.name), ['Aufschlag lang', 'Aufschlag kurz', 'Clear', 'Drop', 'Smash']);
  assert.ok(r.teile.every((t) => teilHoechstwert(t) === 15 && t.merkmale[0] === 'Schlägerhaltung'));
  assert.equal(r.teile[4].stufen[2], 'eindeutig abwärts');
  assert.equal(r.merkmaleTexte[2], 'zählt sicher oder leitet ein Spiel ohne Eingreifen');
});

test('Ultimate BBS: Prüfung 1 / Spiel 1 / Mitarbeit 0, Rückhand und Vorhand, Spiel mit sechs Stufen', () => {
  const r = reiheAusVorlage(v('ultimate'));
  assert.deepEqual(r.gewichte, { pruefung: 1, mitarbeit: 0, verhalten: 0 });
  assert.deepEqual(r.teile.map((t) => t.name), ['Rückhand', 'Vorhand']);
  assert.deepEqual(r.teile[0].merkmale, ['Griff', 'seitliche Stellung', 'Scheibe flach und stabil']);
  assert.equal(r.direkte.length, 1);
  assert.equal(r.direkte[0].name, 'Spiel');
  assert.equal(r.direkte[0].stufen.length, 6);
  assert.equal(r.direkte[0].stufen[5], 'verweigert');
  assert.equal(r.halbjahr, 1);
});

test('Prüfffall Ultimate mit der Vorlage: Rückhand 15, Vorhand 6 → 70 % → 2; Spiel 3 → Reihenwert 2,5', () => {
  const k = neueKlasse({ klasse: 'S', fachtyp: 'sport' });
  k.schueler = k.schueler.slice(0, 1);
  k.schueler[0].name = 'Muster';
  const r = reiheAusVorlage(v('ultimate'));
  k.sport.reihen.push(r);
  r.werte[k.schueler[0].id] = { summen: { [r.teile[0].id]: 15, [r.teile[1].id]: 6 }, direkt: { [r.direkte[0].id]: 3 } };
  assert.equal(pruefungsprozent(r.teile, r.werte[k.schueler[0].id]).prozent, 70);
  assert.equal(reihenErgebnis(k, r, k.schueler[0].id, einstellungenAus(neuesBuch(k))).wert, 2.5);
});

test('Reihe speichert eine Kopie: Änderungen an der Reihe verändern die Vorlage nicht, zwei Reihen sind unabhängig', () => {
  const a = reiheAusVorlage(v('volleyball'));
  const b = reiheAusVorlage(v('volleyball'));
  a.teile[0].name = 'Pritschen (geändert)';
  a.gewichte.pruefung = 0.8;
  assert.equal(v('volleyball').reihe.teile[0].name, 'Pritschen');
  assert.equal(b.teile[0].name, 'Pritschen');
  assert.notEqual(a.id, b.id);
});

test('Eigene Vorlage aus einer Reihe; Liste des Notenbuchs überlagert eingebaute', () => {
  const buch = neuesBuch(neueKlasse({ fachtyp: 'sport' }));
  const r = reiheAusVorlage(v('basketball'), { name: 'Basketball 10b' });
  r.teile = [Object.assign({ id: 't1', name: 'Freiwurf', versuche: 10, hoechst: null, gewicht: 1, zone: '', merkmale: ['', '', ''], stufen: null })];
  r.werte.x = { summen: { t1: 5 } };
  const eigene = reiheAlsVorlage(r, 'Basketball Standard');
  assert.equal(JSON.stringify(eigene).includes('"werte"'), false, 'Vorlage enthält keine Werte');
  buch.einstellungen.sportVorlagen = [eigene, { ...v('basketball'), reihe: eigene.reihe }];
  const liste = vorlagenListe(buch);
  assert.equal(liste.length, 7);
  assert.equal(vorlageFinden(buch, 'basketball').reihe.teile.length, 1, 'überlagert');
  assert.equal(vorlageFinden(buch, eigene.id).name, 'Basketball Standard');
});

test('Änderungen übertragen: Werte bleiben bei gleicher Teil-ID erhalten, Warnung zählt Personen mit Werten', () => {
  const r = reiheAusVorlage(v('volleyball'));
  r.werte.p1 = { summen: { 'vb-pritschen': 12 } };
  r.werte.p2 = { versuche: { 'vb-baggern': [2, 2, 3, 1, 2] } };
  r.werte.p3 = { bemerkung: 'nur Text' };
  assert.equal(personenMitWerten(r), 2);
  const neu = JSON.parse(JSON.stringify(v('volleyball')));
  neu.reihe.teile[0].name = 'Pritschen neu';
  neu.reihe.gewichte = { pruefung: 0.7, mitarbeit: 0.3, verhalten: 0 };
  vorlageUebertragen(r, neu);
  assert.equal(r.teile[0].name, 'Pritschen neu');
  assert.equal(r.gewichte.pruefung, 0.7);
  assert.equal(r.werte.p1.summen['vb-pritschen'], 12);
  assert.equal(pruefungsprozent(r.teile, r.werte.p1).prozent, 80);
});

test('Reihen mit Vorlagen überstehen pruefeBuch unverändert', () => {
  const k = neueKlasse({ fachtyp: 'sport' });
  k.sport.reihen.push(reiheAusVorlage(v('badminton')));
  const buch = neuesBuch(k);
  const zurueck = pruefeBuch(JSON.parse(JSON.stringify(buch)));
  assert.deepEqual(zurueck.klassen[0].sport.reihen[0].teile, buch.klassen[0].sport.reihen[0].teile);
});
