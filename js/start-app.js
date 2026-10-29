// Einstiegspunkt: lädt alle Ansichten und startet die App.
import { appStarten } from './app.js';
import './sync-ui.js';
import { untisUeberwachungStarten, untisPruefen } from './dienste.js';
import './ansichten/index.js';
appStarten();
untisUeberwachungStarten();
untisPruefen();
