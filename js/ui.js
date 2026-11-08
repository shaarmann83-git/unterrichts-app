// Kleine Hilfen für die Oberfläche: Elemente bauen, Dialoge, Meldungen.

/** h('div', {class:'x', onclick: fn}, kind1, 'Text', ...) */
export function h(tag, attribute = {}, ...kinder) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attribute || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k === 'disabled' || k === 'selected' || k === 'hidden' || k === 'readOnly') el[k] = !!v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  anhaengen(el, kinder);
  return el;
}

function anhaengen(el, kinder) {
  for (const k of kinder.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

/** Wie el.append, aber ohne „false“/null als Text (für Ausdrücke mit &&). */
export function fuege(el, ...kinder) {
  anhaengen(el, kinder);
  return el;
}

export function leeren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

// ---------- Dialoge ----------

function dialogZeigen(titel, inhalt, knoepfe) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'dialog' });
    const schliessen = (wert) => {
      dlg.close();
      dlg.remove();
      resolve(wert);
    };
    const leiste = h(
      'div',
      { class: 'dialog-knoepfe' },
      knoepfe.map((k) =>
        h(
          'button',
          {
            type: 'button',
            class: k.klasse || 'knopf',
            onclick: () => {
              if (k.vorPruefung && !k.vorPruefung()) return;
              schliessen(k.wert);
            },
          },
          k.text,
        ),
      ),
    );
    // `inhalt` darf eine Funktion sein, die den Dialog selbst schließen kann: inhalt(schliessen)
    const inhaltEl = typeof inhalt === 'function' ? inhalt(schliessen) : inhalt;
    dlg.append(h('h2', {}, titel), h('div', { class: 'dialog-inhalt' }, inhaltEl), leiste);
    // Enter in einem Eingabefeld löst den Hauptknopf aus (z. B. Passwort bestätigen).
    // In mehrzeiligen Feldern bleibt Enter ein Zeilenumbruch.
    dlg.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
      const tag = e.target?.tagName;
      if (tag !== 'INPUT' && tag !== 'SELECT') return;
      const haupt = [...knoepfe].reverse().find((k) => !k.abbruch);
      if (!haupt) return;
      e.preventDefault();
      if (haupt.vorPruefung && !haupt.vorPruefung()) return;
      schliessen(haupt.wert);
    });
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      const abbruch = knoepfe.find((k) => k.abbruch);
      schliessen(abbruch ? abbruch.wert : null);
    });
    document.body.append(dlg);
    dlg.showModal();
    const erstes = dlg.querySelector('input, textarea, select');
    if (erstes) erstes.focus();
    else dlg.querySelector('button')?.focus();
  });
}

export function meldung(titel, text) {
  return dialogZeigen(titel, h('p', {}, text), [{ text: 'OK', wert: true, abbruch: true, klasse: 'knopf primaer' }]);
}

export function bestaetigen(titel, text, jaText = 'Ja', gefahr = false) {
  return dialogZeigen(titel, h('p', {}, text), [
    { text: 'Abbrechen', wert: false, abbruch: true },
    { text: jaText, wert: true, klasse: gefahr ? 'knopf gefahr' : 'knopf primaer' },
  ]);
}

/** Passwort abfragen; bei `neu` mit Wiederholung und Warnung. Gibt Text oder null zurück. */
export async function passwortFrage(titel, { neu = false, hinweis = '' } = {}) {
  const feld = h('input', { type: 'password', autocomplete: 'off', 'aria-label': 'Passwort' });
  const wiederholung = h('input', { type: 'password', autocomplete: 'off', 'aria-label': 'Passwort wiederholen' });
  const fehler = h('p', { class: 'fehlertext', role: 'alert' });
  const inhalt = [
    hinweis && h('p', {}, hinweis),
    h('label', {}, 'Passwort', feld),
    neu && h('label', {}, 'Passwort wiederholen', wiederholung),
    neu &&
      h(
        'p',
        { class: 'warnung' },
        'Achtung: Das Passwort kann nicht wiederhergestellt werden. Wer es vergisst, kann die Notendatei nie wieder öffnen.',
      ),
    fehler,
  ];
  const ergebnis = await dialogZeigen(titel, inhalt, [
    { text: 'Abbrechen', wert: false, abbruch: true },
    {
      text: 'OK',
      wert: true,
      klasse: 'knopf primaer',
      vorPruefung: () => {
        if (!feld.value) {
          fehler.textContent = 'Bitte ein Passwort eingeben.';
          return false;
        }
        if (neu && feld.value !== wiederholung.value) {
          fehler.textContent = 'Die beiden Passwörter sind nicht gleich.';
          return false;
        }
        return true;
      },
    },
  ]);
  return ergebnis ? feld.value : null;
}

/** Freie Auswahl mit mehreren Knöpfen. */
export function auswahl(titel, text, optionen) {
  return dialogZeigen(
    titel,
    h('p', {}, text),
    optionen.map((o) => ({ text: o.text, wert: o.wert, abbruch: o.abbruch, klasse: o.klasse })),
  );
}

/** Wie inhaltDialog; `inhalt` kann eine Funktion sein: inhalt(schliessen) (schliessen(wert) beendet den Dialog). */
export function inhaltDialog(titel, inhalt, knoepfe) {
  return dialogZeigen(titel, inhalt, knoepfe);
}

// ---------- Meldungsleiste ----------

let toastZeit;
export function toast(text, art = '') {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.className = `toast sichtbar ${art}`;
  el.textContent = text;
  clearTimeout(toastZeit);
  toastZeit = setTimeout(() => el.classList.remove('sichtbar'), 3500);
}

/** Enter springt in der Tabelle zur gleichen Spalte der nächsten Zeile (wie in Excel). */
/**
 * Auswahlliste mit zusätzlichem Eintrag „Anderes …“, der ein Textfeld einblendet.
 * Rückgabe: { el, lesen }. `beiAenderung` wird bei jeder Änderung mit dem Wert gerufen.
 */
export function auswahlMitFreitext({ werte, wert = '', bezeichnung = 'Auswahl', beiAenderung = () => {} }) {
  const eigen = wert !== '' && !werte.includes(wert);
  const feld = h('input', {
    type: 'text',
    value: eigen ? wert : '',
    placeholder: 'Eigener Text',
    'aria-label': `${bezeichnung}: eigener Text`,
    class: eigen ? '' : 'versteckt',
    oninput: (e) => beiAenderung(e.target.value.trim()),
  });
  const liste = h('select', { 'aria-label': bezeichnung, onchange: (e) => {
    if (e.target.value === '__eigen') {
      feld.classList.remove('versteckt');
      feld.focus();
      beiAenderung(feld.value.trim());
      return;
    }
    feld.classList.add('versteckt');
    beiAenderung(e.target.value);
  } }, [
    ...werte.map((w) => h('option', { value: w, selected: !eigen && wert === w }, w)),
    h('option', { value: '__eigen', selected: eigen }, 'Anderes …'),
  ]);
  return {
    el: h('div', { class: 'wahl-mit-text' }, liste, feld),
    lesen: () => (liste.value === '__eigen' ? feld.value.trim() : liste.value),
  };
}

export function enterNachUnten(tabelle) {
  tabelle.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    const sp = e.target.dataset.sp;
    if (!sp) return;
    e.preventDefault();
    const felder = [...tabelle.querySelectorAll(`input[data-sp="${CSS.escape(sp)}"]`)];
    const i = felder.indexOf(e.target);
    const naechstes = felder[i + 1] || felder[0];
    naechstes.focus();
    naechstes.select?.();
  });
}

// ---------- Personenbild und Spaltenzuordnung ----------

/** Kleines Rundbild einer Person (nur wenn Fotos in der Klasse eingeschaltet sind und ein Foto da ist). */
/** Name als Link zur Übersicht der Person (aktuelle Klasse). */
export function personLink(person, text) {
  return h('a', { class: 'personlink', href: `#/person/${person.id}`, title: 'Übersicht dieser Person öffnen' }, text);
}

export function avatar(klasse, person, art = 'klein') {
  if (!klasse?.bereiche?.fotos || !person?.foto?.daten) return null;
  return h('img', { class: `avatar ${art}`, src: person.foto.daten, alt: '', width: art === 'gross' ? 160 : 32, height: art === 'gross' ? 160 : 32 });
}

/**
 * Dialog „Spalten zuordnen“. `felder`: [{id, text}], `kopf`: Spaltenüberschriften, `zuordnung`: {feld: index}.
 * Gibt die Zuordnung ({feld: index}) oder null zurück.
 */
export async function spaltenDialog({ titel, kopf, felder, zuordnung, beispielZeilen = [] }) {
  const selects = felder.map((f) =>
    h(
      'label',
      {},
      f.text,
      h(
        'select',
        { 'data-feld': f.id },
        h('option', { value: '' }, '– nicht verwenden –'),
        kopf.map((k, i) => h('option', { value: i, selected: zuordnung[f.id] === i }, `${i + 1}: ${k || '(ohne Überschrift)'}`)),
      ),
    ),
  );
  const vorschau = beispielZeilen.length
    ? h(
        'div',
        { class: 'tabelle-rahmen' },
        h('table', { class: 'tabelle klein-tabelle' }, h('thead', {}, h('tr', {}, kopf.map((k) => h('th', {}, k)))), h('tbody', {}, beispielZeilen.map((z) => h('tr', {}, kopf.map((_, i) => h('td', { class: 'links' }, String(z[i] ?? ''))))))),
      )
    : null;
  const ok = await dialogZeigen(titel, [h('p', {}, 'Die Spalten konnten nicht eindeutig erkannt werden oder Sie möchten sie selbst festlegen.'), vorschau, ...selects], [
    { text: 'Abbrechen', wert: false, abbruch: true },
    { text: 'Weiter', wert: true, klasse: 'knopf primaer' },
  ]);
  if (!ok) return null;
  const ergebnis = {};
  for (const sel of selects) {
    const el = sel.querySelector('select');
    if (el.value !== '') ergebnis[el.dataset.feld] = Number(el.value);
  }
  return ergebnis;
}

/**
 * Kopfzeilen und die ersten beiden Spalten (Nr., Name) einer großen Tabelle beim Scrollen festhalten.
 * Jede Kopfzeile bekommt als Abstand nach oben die Höhe der Zeilen darüber. Wird nach dem Einfügen aufgerufen.
 */
export function tabelleFixieren(tabelle) {
  const ausfuehren = () => {
    if (!tabelle.isConnected) return;
    let oben = 0;
    for (const zeile of tabelle.tHead?.rows || []) {
      for (const th of zeile.cells) th.style.top = `${oben}px`;
      oben += zeile.offsetHeight;
    }
    const ersteZelle = tabelle.tHead?.rows[0]?.cells[0];
    tabelle.style.setProperty('--nr-breite', `${ersteZelle ? ersteZelle.offsetWidth : 0}px`);
    ersteZelle?.classList.add('nr-spalte');
    for (const zeile of tabelle.tBodies[0]?.rows || []) zeile.cells[0]?.classList.add('nr-spalte');
  };
  requestAnimationFrame(ausfuehren);
  window.addEventListener('resize', ausfuehren, { once: true });
}
