// Kurze Erklärungen zu Knöpfen: am PC als Hinweis beim Darüberfahren (title),
// auf Tablet und Handy über den Knopf „Hilfe“ (dann erklärt ein Tippen den Knopf, statt ihn auszulösen).
import { toast } from './ui.js';

/** Erklärungen nach Beschriftung des Knopfes. */
export const HILFE = {
  'Neue Notendatei': 'Legt ein neues, leeres Notenbuch an. Danach wählen Sie, wo es gespeichert wird.',
  'Notendatei öffnen': 'Öffnet eine vorhandene Notendatei (.noten) von diesem Gerät.',
  'Aus OneDrive öffnen': 'Öffnet eine Notendatei aus dem App-Ordner in Ihrem OneDrive.',
  'Fehlzeiten importieren (Untis)': 'Liest eine aus Untis exportierte Fehlzeitenliste ein und zeigt vorher eine Vorschau.',
  'Stundenplan laden (.ics)': 'Liest Ihren Stundenplan aus einer Untis-Kalenderdatei (.ics) ein.',
  'Aktuelle Datei schließen': 'Schließt das geöffnete Notenbuch. Ungespeicherte Änderungen bleiben als lokale Kopie erhalten.',
  'Öffnen': 'Öffnet diese lokale Arbeitskopie.',
  'Löschen': 'Entfernt den Eintrag. Vorher kommt eine Rückfrage.',
  'Speichern': 'Speichert das Notenbuch in der Notendatei.',
  'Speichern unter …': 'Speichert das Notenbuch unter einem neuen Namen oder an einem anderen Ort.',
  'Hell/Dunkel': 'Wechselt zwischen hellem und dunklem Aussehen.',
  '+ Neue Klasse': 'Legt eine neue Klasse im Notenbuch an.',
  'Excel-Vorlage als neue Klasse importieren': 'Liest eine alte Excel-Notenliste (Vorlage Notenliste_Teilzeit) ein und legt daraus eine neue Klasse an. Nur nötig, wenn Sie bisherige Daten übernehmen wollen.',
  'Klasse aus anderer Notendatei übernehmen': 'Kopiert eine Klasse aus einer anderen Notendatei in dieses Notenbuch.',
  'Sicherung exportieren': 'Speichert eine vollständige Kopie der Notendatei als Sicherung.',
  'Sicherung importieren': 'Lädt eine Sicherung und ersetzt damit den aktuellen Stand.',
  'Alles als Excel exportieren': 'Schreibt alle Noten in eine Excel-Datei (ohne Fotos).',
  'Passwort setzen': 'Schützt die Notendatei mit einem Passwort. Ein vergessenes Passwort lässt sich nicht wiederherstellen.',
  'Passwort ändern': 'Setzt ein neues Passwort für die Notendatei.',
  'Passwort entfernen': 'Hebt den Passwortschutz auf.',
  'Notendatei schließen': 'Schließt das Notenbuch.',
  'Untis-Liste laden': 'Liest eine Fehlzeitenliste aus Untis ein und zeigt vorher eine Vorschau.',
  '+ Fehlzeit manuell': 'Trägt eine Fehlzeit von Hand ein.',
  'Alle da': 'Setzt für alle Personen dieses Termins „anwesend“.',
  'Standard wiederherstellen': 'Setzt die Werte auf die voreingestellten zurück.',
  '+ Zeile': 'Fügt eine Unterschriftszeile hinzu.',
  'Letzte Zeile entfernen': 'Entfernt die letzte Unterschriftszeile.',
  '+ Eigene Liste anlegen (Strichliste, Punkte …)': 'Legt eine eigene Liste an, z. B. eine Strichliste.',
  'Drucken': 'Öffnet den Druckdialog des Geräts für diese Seite.',
  'Jetzt nach neuen Dateien suchen': 'Prüft den gewählten Untis-Ordner sofort auf neue Dateien.',
  'Ordner entfernen': 'Vergisst den gewählten Untis-Ordner.',
  'Abmelden': 'Meldet dieses Gerät bei OneDrive ab.',
  'Aus OneDrive öffnen …': 'Öffnet eine Notendatei aus Ihrem OneDrive.',
  'Synchronisation ausschalten': 'Beendet den Abgleich dieses Notenbuchs mit OneDrive.',
  'Hilfe': 'Hilfe-Modus: Tippen Sie einen Knopf an, um ihn erklärt zu bekommen, ohne ihn auszulösen. Zum Beenden „Hilfe“ erneut tippen.',
};

/** Erklärung zu einem Knopf: nach id, dann nach Beschriftung, sonst aus der Beschriftung vor „(“. */
export function hilfeFuer(el) {
  const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
  return HILFE[text] || HILFE[text.replace(/ \(\d+\)$/, '')] || '';
}

function beschriften(wurzel) {
  const ziele = wurzel.matches?.('button, a.knopf') ? [wurzel] : [];
  ziele.push(...(wurzel.querySelectorAll?.('button, a.knopf') || []));
  for (const el of ziele) {
    if (el.getAttribute('title')) continue;
    const t = hilfeFuer(el);
    if (t) el.setAttribute('title', t);
  }
}

let hilfeModus = false;

export function hilfeStarten() {
  beschriften(document.body);
  new MutationObserver((liste) => {
    for (const m of liste) for (const n of m.addedNodes) if (n.nodeType === 1) beschriften(n);
  }).observe(document.body, { childList: true, subtree: true });

  // Hilfe-Knopf nur auf Geräten ohne Maus (Tablet, Handy)
  if (matchMedia('(hover: none)').matches) {
    const kopf = document.querySelector('.kopf-aktionen');
    if (kopf) {
      const k = document.createElement('button');
      k.type = 'button'; k.id = 'knopf-hilfe'; k.className = 'knopf'; k.textContent = 'Hilfe';
      k.setAttribute('aria-pressed', 'false');
      k.addEventListener('click', () => {
        hilfeModus = !hilfeModus;
        k.setAttribute('aria-pressed', String(hilfeModus));
        k.classList.toggle('primaer', hilfeModus);
        document.body.classList.toggle('hilfe-modus', hilfeModus);
        toast(hilfeModus ? 'Hilfe an: Tippen Sie einen Knopf an, um ihn erklärt zu bekommen.' : 'Hilfe aus.');
      });
      kopf.prepend(k);
    }
    document.addEventListener('click', (e) => {
      if (!hilfeModus) return;
      const ziel = e.target.closest('button, a.knopf');
      if (!ziel || ziel.id === 'knopf-hilfe') return;
      e.preventDefault(); e.stopImmediatePropagation();
      toast(ziel.getAttribute('title') || hilfeFuer(ziel) || `„${(ziel.textContent || '').trim()}“: keine Erklärung hinterlegt.`);
    }, true);
  }
}
