// Schnelleingabe nach der Stunde (SPEC 9.3): Termin wählen, Anwesenheit, Mitarbeit 0–3 und Merkmale M1–M3 mit großen Tasten.
import { K } from '../kontext.js';
import { h, leeren, fuege, toast } from '../ui.js';
import { anzeigename, datumDeutsch, heuteIso } from '../modell.js';
import { ZEICHEN, termineGeordnet, spsNummern, mitarbeitZelle, anwesenheitZeichen, istPruefungstag } from '../sport.js';
import { ansichtRegistrieren } from '../registry.js';
import { sportKlasse, sportKontext, reiheById, zeichenFarbe, mitarbeitFarbe, zelleSetzen, zeichenPalette, terminDialog } from './sport-gemeinsam.js';
import { avatar as avatarUi } from '../ui.js';

const HAEUFIG = ['.', 'V', 'sps', 'k', '|', 'E', 'A', 'U'];
let aktuellerTermin = null;

/** Vom Startvorschlag „Jetzt“ genutzt: diesen Termin vorwählen. */
export function setzeAktuellenTermin(id) {
  aktuellerTermin = id;
}

export function zeigeNachStunde() {
  const { d, ein, personen } = sportKontext();
  const wurzel = h('section', { class: 'seite' });
  const inhalt = h('div', {});
  const termine = () => termineGeordnet(d);
  if (!aktuellerTermin || !d.sport.termine.some((t) => t.id === aktuellerTermin)) {
    aktuellerTermin = (termine().find((t) => t.datum === heuteIso()) || termine().at(-1))?.id || null;
  }

  async function neu() {
    const t = await terminDialog(d, null, { datum: heuteIso() });
    if (t && !t.loeschen) aktuellerTermin = t.id;
    render();
  }

  function render() {
    leeren(inhalt);
    const t = d.sport.termine.find((x) => x.id === aktuellerTermin);
    const auswahl = h('select', { id: 'nach-termin', 'aria-label': 'Termin wählen', onchange: (e) => { aktuellerTermin = e.target.value; render(); } },
      termine().map((x) => h('option', { value: x.id, selected: x.id === aktuellerTermin }, `${datumDeutsch(x.datum)}${x.uhrzeit ? ' ' + x.uhrzeit + (x.ende ? '–' + x.ende : '') : ''} · ${reiheById(d, x.reihe)?.name || 'keine Reihe'}${istPruefungstag(x, ein) ? ' · Prüfungstag' : ''}`)));
    fuege(inhalt, h('div', { class: 'knopfreihe' },
      h('button', { type: 'button', class: 'knopf primaer gross', id: 'termin-neu', onclick: neu }, '+ Neue Einheit (heute)'),
      termine().length > 0 && h('label', { class: 'inline' }, 'Termin: ', auswahl),
      t && h('button', { type: 'button', class: 'knopf', onclick: async () => { await terminDialog(d, t); render(); } }, 'Termin bearbeiten'),
      t && h('button', { type: 'button', class: 'knopf', id: 'alle-uebrigen', onclick: () => {
        let n = 0;
        for (const p of personen) if (!anwesenheitZeichen(d, t.id, p.id)) { (d.sport.anwesenheit[t.id] ||= {})[p.id] = { z: '.', quelle: 'hand' }; n += 1; }
        if (n) K.aenderung();
        render();
        toast(n ? `${n} Person(en) auf „.“ gesetzt.` : 'Keine leeren Zellen.');
      } }, 'Alle übrigen anwesend')));
    if (!t) return inhalt.append(h('p', { class: 'hinweis' }, 'Noch kein Termin. Mit „Neue Einheit“ legen Sie den heutigen Termin an. Reihen legen Sie unter „Reihen“ an (aus Vorlage).'));
    if (personen.length === 0) return inhalt.append(h('p', { class: 'hinweis' }, 'Bitte zuerst unter „Grunddaten“ Schüler:innen eintragen.'));
    const reihe = reiheById(d, t.reihe);
    const sps = new Map(personen.map((p) => [p.id, spsNummern(d, p.id)]));
    fuege(inhalt,
      h('p', { class: 'klein' }, `Reihe: ${reihe?.name || 'keiner Reihe zugeordnet'}${istPruefungstag(t, ein) ? ' · Prüfungstag' : ''}. Mitarbeit ist automatisch ${String(ein.standardwert).replace('.', ',')}; tippen Sie nur Abweichungen.`),
      reihe && reihe.merkmaleTexte.some(Boolean) && h('ul', { class: 'liste-kurz' }, reihe.merkmaleTexte.map((x, i) => x && h('li', {}, h('strong', {}, `M${i + 1}`), ` ${x}`))));
    const liste = h('div', { class: 'schnell-liste' });
    for (const p of personen) {
      const z = anwesenheitZeichen(d, t.id, p.id);
      const c = mitarbeitZelle(d, t, p.id, ein, sps.get(p.id));
      const setze = (zeichen) => {
        const alt = d.sport.anwesenheit[t.id]?.[p.id] || {};
        zelleSetzen(d, t.id, p.id, z === zeichen ? null : { z: zeichen, stern: alt.stern, text: alt.text, min: zeichen === 'V' ? alt.min : undefined });
        render();
      };
      const chips = HAEUFIG.map((zz) => h('button', { type: 'button', class: `knopf taste ${zeichenFarbe(zz, 0)}`, 'data-zeichen': zz, 'aria-pressed': String(z === zz), 'aria-label': `${anzeigename(p)}: ${zz} ${ZEICHEN[zz].text}`, title: ZEICHEN[zz].text, onclick: () => setze(zz) }, zz));
      const mehr = h('button', { type: 'button', class: 'knopf taste', 'aria-label': `${anzeigename(p)}: weitere Zeichen`, onclick: async () => {
        const erg = await zeichenPalette(d, t, p, d.sport.anwesenheit[t.id]?.[p.id] || {});
        if (erg === null || erg === undefined) return;
        zelleSetzen(d, t.id, p.id, erg.z === '' ? null : erg);
        render();
      } }, '…');
      const gesperrt = !c.zaehlt || c.grund === 'auto0';
      const abw = d.sport.mitarbeit[t.id]?.[p.id];
      const mit = [0, 1, 2, 3].map((w) => {
        const aktiv = c.zaehlt && c.wert === w;
        return h('button', { type: 'button', class: `knopf taste ${aktiv ? mitarbeitFarbe(w) : ''}`, 'data-mit': w, disabled: gesperrt, 'aria-pressed': String(aktiv), 'aria-label': `${anzeigename(p)}: Mitarbeit ${w}`, onclick: () => {
          const m = (d.sport.mitarbeit[t.id] ||= {});
          if (w === ein.standardwert) delete m[p.id];
          else m[p.id] = w;
          K.aenderung();
          render();
        } }, String(w));
      });
      const hakenZeile = h('div', { class: 'tasten' }, [0, 1, 2].map((i) => {
        const an = !!d.sport.merkmale[t.id]?.[p.id]?.[i];
        const darf = z !== '' && z !== 'sps' && z !== 'ku' && z !== 'U' && ZEICHEN[z]?.art !== 'ohne';
        return h('button', { type: 'button', class: `knopf taste ${an ? 'm-gruen' : ''}`, 'data-merkmal': i, disabled: !darf && !an, 'aria-pressed': String(an), 'aria-label': `${anzeigename(p)}: M${i + 1}`, title: reihe?.merkmaleTexte[i] || '', onclick: () => {
          const m = (d.sport.merkmale[t.id] ||= {});
          const a = (m[p.id] ||= [false, false, false]);
          a[i] = !a[i];
          if (!a.some(Boolean)) delete m[p.id];
          K.aenderung();
          render();
        } }, `M${i + 1}`);
      }));
      liste.append(h('div', { class: 'schnell-zeile sport-zeile' },
        h('div', { class: 'schnell-name' }, avatarUi(d, p), ' ', anzeigename(p), z === 'sps' && sps.get(p.id)?.get(t.id) >= 2 && h('span', { class: 'klein z-orange', title: 'sps ab dem 2. Mal: Mitarbeit fest 0' }, ' sps ab 2. Mal')),
        h('div', { class: 'tasten tasten-umbruch' }, chips, mehr),
        h('div', { class: 'tasten' }, mit),
        hakenZeile,
        !c.zaehlt && z && h('div', { class: 'klein z-grau' }, 'zählt nicht'),
        c.grund === 'auto0' && h('div', { class: 'klein z-rot' }, 'automatisch 0')));
    }
    inhalt.append(liste);
  }

  fuege(wurzel, h('h1', {}, 'Stunde erfassen'), inhalt);
  render();
  return { el: wurzel, update: () => {} };
}

ansichtRegistrieren('nachstunde', { text: 'Stunde erfassen', bauen: zeigeNachStunde, klasse: true, nurWenn: sportKlasse, reihe: 2.2 });
