// Testhilfen: erfundene iCal-Dateien (kein echter Stundenplan).
const CRLF = '\r\n';

/** Faltet eine Zeile nach RFC 5545 (höchstens 75 Zeichen je Zeile, Fortsetzung mit Leerzeichen). */
export function falten(zeile, breite = 75) {
  if (zeile.length <= breite) return zeile;
  const teile = [zeile.slice(0, breite)];
  for (let i = breite; i < zeile.length; i += breite - 1) teile.push(' ' + zeile.slice(i, i + breite - 1));
  return teile.join(CRLF);
}

export function esc(t) {
  return String(t).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** start/ende: '20261025T100000' lokal mit TZID, mit Z als UTC, 8 Ziffern als Datum. */
export function vevent({ uid, summary, start, ende, tz = 'Europe/Berlin', status = '', location = '', description = '', alarm = false, ohneEnde = false, dauer = '' }) {
  const zeit = (name, wert) => (/Z$/.test(wert) || /^\d{8}$/.test(wert) ? `${name}${/^\d{8}$/.test(wert) ? ';VALUE=DATE' : ''}:${wert}` : `${name};TZID=${tz}:${wert}`);
  const zeilen = ['BEGIN:VEVENT', `UID:${uid}`, zeit('DTSTART', start)];
  if (ende && !ohneEnde) zeilen.push(zeit('DTEND', ende));
  if (dauer) zeilen.push(`DURATION:${dauer}`);
  zeilen.push(`SUMMARY:${esc(summary)}`);
  if (location) zeilen.push(`LOCATION:${esc(location)}`);
  if (description) zeilen.push(`DESCRIPTION:${esc(description)}`);
  if (status) zeilen.push(`STATUS:${status}`);
  if (alarm) zeilen.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT15M', 'DESCRIPTION:Erinnerung', 'END:VALARM');
  zeilen.push('END:VEVENT');
  return zeilen.map((z) => falten(z)).join(CRLF);
}

export function kalender(events, { zeilenende = CRLF } = {}) {
  const kopf = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//Stundenplan//DE', 'CALSCALE:GREGORIAN',
    'BEGIN:VTIMEZONE', 'TZID:Europe/Berlin', 'BEGIN:STANDARD', 'DTSTART:19701025T030000', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'END:STANDARD', 'BEGIN:DAYLIGHT', 'DTSTART:19700329T020000', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'END:DAYLIGHT', 'END:VTIMEZONE'];
  return [...kopf, ...events, 'END:VCALENDAR'].join(CRLF).replace(/\r\n/g, zeilenende) + zeilenende;
}
