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
    dlg.append(h('h2', {}, titel), h('div', { class: 'dialog-inhalt' }, inhalt), leiste);
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
