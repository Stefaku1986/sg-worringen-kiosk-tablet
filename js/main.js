// Verdrahtung der Tablet-Oberflaeche - verbindet index.html mit
// session.js/repo.js/sync.js/auth.js/db.js. Kein Framework, kein Build-
// Schritt: einfaches DOM-Handling, wie es fuer eine kleine Kiosk-App
// voellig ausreicht.

import {
  APP_VERSION,
  SYNC_INTERVAL_SECONDS,
  TEAMS,
  FEEDBACK_STATUS_LABEL,
  SCHIEDSRICHTER_WASSER_STILL_PRODUKT_ID,
  SCHIEDSRICHTER_WASSER_MEDIUM_PRODUKT_ID,
  KAFFEE_TRAINER_PRODUKT_ID,
  VERANSTALTUNGEN,
  MWST_SAETZE,
} from "./config.js";
import { euro, deZahl, nettoPreis, nettoPreisGenau, rund2 } from "./format.js";
import * as repo from "./repo.js";
import * as session from "./session.js";
import { syncJetzt, syncAutomatikStarten, onSynchronisiert, belegHochladen } from "./sync.js";
import { geraetId } from "./db.js";

// ---------------------------------------------------------------------
// DOM-Referenzen
// ---------------------------------------------------------------------

const el = (id) => document.getElementById(id);

const appVersionEl = el("app-version");
const kasseAuswahlBereich = el("kasse-auswahl-bereich");
const kasseAuswahl = el("kasse-auswahl");
const syncStatusEl = el("sync-status");
const syncJetztBtn = el("sync-jetzt-btn");
const updateStatusEl = el("update-status");
const updatePruefenBtn = el("update-pruefen-btn");
const benutzerLabel = el("benutzer-label");
const abmeldenBtn = el("abmelden-btn");
const hilfeBtn = el("hilfe-btn");
const beendenBtn = el("beenden-btn");
const tabsEl = el("tabs");
const tabVerkauf = el("tab-verkauf");
const tabStorno = el("tab-storno");
const tabKassensturz = el("tab-kassensturz");
const tabMehr = el("tab-mehr");
const mehrTabsEl = el("mehr-tabs");
const tabSchiedsrichter = el("tab-schiedsrichter");
const tabEinzahlen = el("tab-einzahlen");
const tabAusgaben = el("tab-ausgaben");
const tabEntnahmen = el("tab-entnahmen");
const tabNachbestellung = el("tab-nachbestellung");
const tabTermine = el("tab-termine");
const tabFeedback = el("tab-feedback");
// Runde 43: Warenwirtschaft/Auswertung/Admin (siehe Projekt-Status-
// Dokument, "Tablet um Windows-Funktionen erweitern").
const tabWarenwirtschaft = el("tab-warenwirtschaft");
const tabAuswertung = el("tab-auswertung");
const tabAdmin = el("tab-admin");

// Ansichten, die (Runde 30) unter dem gemeinsamen Reiter "Mehr" gebuendelt
// sind, um die Reiterleiste kuerzer zu machen (analog zum "Admin"-Reiter
// der Windows-App, dort aber nach Admin-Rechten gruppiert - auf dem
// Tablet ist bis auf "nachbestellung"/"auswertung"/"admin" alles hier
// fuer alle Helfer sichtbar, es geht nur um weniger Reiter oben, siehe
// unten). Runde 34: "schiedsrichter" ist auf Nutzerwunsch wieder ein
// eigener, direkt sichtbarer Reiter oben (wie auf der Windows-App) und
// deshalb hier NICHT mehr mit drin.
const MEHR_ANSICHTEN = [
  "einzahlen",
  "ausgaben",
  "entnahmen",
  "nachbestellung",
  "termine",
  "feedback",
  "warenwirtschaft",
  "auswertung",
  "admin",
];

const kassenvorschlagBanner = el("kassenvorschlag-banner");
const kassenvorschlagText = el("kassenvorschlag-text");
const kassenvorschlagUebernehmenBtn = el("kassenvorschlag-uebernehmen-btn");
const kassenvorschlagVerwerfenBtn = el("kassenvorschlag-verwerfen-btn");

const loginView = el("login-view");
const verkaufView = el("verkauf-view");
const stornoView = el("storno-view");
const kassensturzView = el("kassensturz-view");
const schiedsrichterView = el("schiedsrichter-view");
const einzahlenView = el("einzahlen-view");
const ausgabenView = el("ausgaben-view");
const entnahmenView = el("entnahmen-view");
const nachbestellungView = el("nachbestellung-view");
const termineView = el("termine-view");
const feedbackView = el("feedback-view");
const warenwirtschaftView = el("warenwirtschaft-view");
const auswertungView = el("auswertung-view");
const adminView = el("admin-view");

const loginNutzerauswahl = el("login-nutzerauswahl");
const nutzerGrid = el("nutzer-grid");
const loginLeerHinweis = el("login-leer-hinweis");
const loginPinEingabe = el("login-pin-eingabe");
const pinNameLabel = el("pin-name-label");
const pinAnzeige = el("pin-anzeige");
const pinFehler = el("pin-fehler");
const tastatur = el("tastatur");
const pinZurueckBtn = el("pin-zurueck-btn");

const produktGrid = el("produkt-grid");
const katBtnGetraenk = el("kat-btn-Getraenk");
const katBtnSpeise = el("kat-btn-Speise");
const helferpreisBtn = el("helferpreis-btn");
const pfandRueckgabeBtn = el("pfand-rueckgabe-btn");
const kaffeeTrainerBtn = el("kaffee-trainer-btn");
const warenkorbListe = el("warenkorb-liste");
const summeEl = el("summe");
const bezahlenBtn = el("bezahlen-btn");

const stornoTabelleBody = document.querySelector("#storno-tabelle tbody");

const ksAnfangsbestandOverridesContainer = el("ks-anfangsbestand-overrides");
const ksAnfangsbestand = el("ks-anfangsbestand");
const ksAnfangsbestandAufteilung = el("ks-anfangsbestand-aufteilung");
const ksEinnahmen = el("ks-einnahmen");
const ksEinnahmenAufteilung = el("ks-einnahmen-aufteilung");
const ksAuszahlungen = el("ks-auszahlungen");
const ksSonstigeAusgaben = el("ks-sonstige-ausgaben");
const ksEinzahlungen = el("ks-einzahlungen");
const ksEntnahmen = el("ks-entnahmen");
const ksSoll = el("ks-soll");
const ksSollAufteilung = el("ks-soll-aufteilung");
const ksGezaehltFeld = el("ks-gezaehlt-feld");
const ksDifferenz = el("ks-differenz");
const ksSpeichernBtn = el("ks-speichern-btn");
const ksHistorieBody = document.querySelector("#ks-historie-tabelle tbody");

const srKasseName = el("sr-kasse-name");
const srMannschaftFeld = el("sr-mannschaft-feld");
const srNameFeld = el("sr-name-feld");
const srBetragFeld = el("sr-betrag-feld");
const srKommentarFeld = el("sr-kommentar-feld");
const srFehler = el("sr-fehler");
const srAuszahlenBtn = el("sr-auszahlen-btn");
const srWasserStillBtn = el("sr-wasser-still-btn");
const srWasserMediumBtn = el("sr-wasser-medium-btn");
const srTabelleBody = document.querySelector("#sr-tabelle tbody");

const ezKasseName = el("ez-kasse-name");
const ezBetragFeld = el("ez-betrag-feld");
const ezKommentarFeld = el("ez-kommentar-feld");
const ezFehler = el("ez-fehler");
const ezEinzahlenBtn = el("ez-einzahlen-btn");
const ezTabelleBody = document.querySelector("#ez-tabelle tbody");

const saKasseName = el("sa-kasse-name");
const saBetragFeld = el("sa-betrag-feld");
const saBeschreibungFeld = el("sa-beschreibung-feld");
const saFehler = el("sa-fehler");
const saErfassenBtn = el("sa-erfassen-btn");
const saTabelleBody = document.querySelector("#sa-tabelle tbody");

const beKasseName = el("be-kasse-name");
const beBetragFeld = el("be-betrag-feld");
const beEmpfaengerFeld = el("be-empfaenger-feld");
const beKommentarFeld = el("be-kommentar-feld");
const beFehler = el("be-fehler");
const beErfassenBtn = el("be-erfassen-btn");
const beTabelleBody = document.querySelector("#be-tabelle tbody");

const ksEntnahmeOverlay = el("ks-entnahme-overlay");
const ksEntnahmeText = el("ks-entnahme-text");
const ksEntnahmeBetragFeld = el("ks-entnahme-betrag-feld");
const ksEntnahmeEmpfaengerFeld = el("ks-entnahme-empfaenger-feld");
const ksEntnahmeFehler = el("ks-entnahme-fehler");
const ksEntnahmeUeberspringenBtn = el("ks-entnahme-ueberspringen-btn");
const ksEntnahmeSpeichernBtn = el("ks-entnahme-speichern-btn");

const npProduktAuswahl = el("np-produkt-auswahl");
const npProduktMengeFeld = el("np-produkt-menge-feld");
const npProduktPreisFeld = el("np-produkt-preis-feld");
const npProduktPreisartAuswahl = el("np-produkt-preisart-auswahl");
const npProduktPfandBezahltFeld = el("np-produkt-pfand-bezahlt-feld");
const npProduktPfandErhaltenFeld = el("np-produkt-pfand-erhalten-feld");
const npPositionHinzufuegenBtn = el("np-position-hinzufuegen-btn");
const npPositionenListe = el("np-positionen-liste");
const npBezahltFeld = el("np-bezahlt-feld");
const npErhaltenFeld = el("np-erhalten-feld");
const npKommentarFeld = el("np-kommentar-feld");
const npFehler = el("np-fehler");
const npErfassenBtn = el("np-erfassen-btn");
const npTabelleBody = document.querySelector("#np-tabelle tbody");

const tsTeamAuswahl = el("ts-team-auswahl");
const tsDatumFeld = el("ts-datum-feld");
const tsStartFeld = el("ts-start-feld");
const tsEndeFeld = el("ts-ende-feld");
const tsGegnerFeld = el("ts-gegner-feld");
const tsFehler = el("ts-fehler");
const tsEintragenBtn = el("ts-eintragen-btn");
const tsHeimspieleBody = document.querySelector("#ts-heimspiele-tabelle tbody");
const tsTrainingsplanBody = document.querySelector("#ts-trainingsplan-tabelle tbody");

const fbKategorieAuswahl = el("fb-kategorie-auswahl");
const fbTextFeld = el("fb-text-feld");
const fbFehler = el("fb-fehler");
const fbEinreichenBtn = el("fb-einreichen-btn");
const fbTabelleBody = document.querySelector("#fb-tabelle tbody");

const feedbackStatusOverlay = el("feedback-status-overlay");
const fbsWunschAnzeige = el("fbs-wunsch-anzeige");
const fbsStatusAuswahl = el("fbs-status-auswahl");
const fbsAntwortFeld = el("fbs-antwort-feld");
const fbsAbbrechenBtn = el("fbs-abbrechen-btn");
const fbsSpeichernBtn = el("fbs-speichern-btn");

// ---------------------------------------------------------------------
// Warenwirtschaft (Runde 43)
// ---------------------------------------------------------------------
const wwInventurBtn = el("ww-inventur-btn");
const wwBestandDruckenBtn = el("ww-bestand-drucken-btn");
const wwBestandTabelleBody = document.querySelector("#ww-bestand-tabelle tbody");

const wwModusEingangBtn = el("ww-modus-eingang-btn");
const wwModusKorrekturBtn = el("ww-modus-korrektur-btn");
const wwProduktAuswahl = el("ww-produkt-auswahl");
const wwMengeLabel = el("ww-menge-label");
const wwMengeFeld = el("ww-menge-feld");
const wwEinzelpreisLabel = el("ww-einzelpreis-label");
const wwEinzelpreisFeld = el("ww-einzelpreis-feld");
const wwMwstLabel = el("ww-mwst-label");
const wwMwstAuswahl = el("ww-mwst-auswahl");
const wwBelegLabel = el("ww-beleg-label");
const wwBelegFeld = el("ww-beleg-feld");
const wwKommentarFeld = el("ww-kommentar-feld");
const wwFehler = el("ww-fehler");
const wwErfassenBtn = el("ww-erfassen-btn");

const wwAbschProduktAuswahl = el("ww-absch-produkt-auswahl");
const wwAbschMengeFeld = el("ww-absch-menge-feld");
const wwAbschGrundAuswahl = el("ww-absch-grund-auswahl");
const wwAbschKommentarFeld = el("ww-absch-kommentar-feld");
const wwAbschFehler = el("ww-absch-fehler");
const wwAbschErfassenBtn = el("ww-absch-erfassen-btn");
const wwAbschTabelleBody = document.querySelector("#ww-absch-tabelle tbody");

const inventurOverlay = el("inventur-overlay");
const inventurListe = el("inventur-liste");
const inventurKommentarFeld = el("inventur-kommentar-feld");
const inventurFehler = el("inventur-fehler");
const inventurAbbrechenBtn = el("inventur-abbrechen-btn");
const inventurSpeichernBtn = el("inventur-speichern-btn");

// ---------------------------------------------------------------------
// Auswertung / Monatsabrechnung (Runde 43)
// ---------------------------------------------------------------------
const auKasseKennzahlen = el("au-kasse-kennzahlen");
const auPfandKasseAuswahl = el("au-pfand-kasse-auswahl");
const auPfandBetragFeld = el("au-pfand-betrag-feld");
const auPfandKommentarFeld = el("au-pfand-kommentar-feld");
const auPfandFehler = el("au-pfand-fehler");
const auPfandVerbuchenBtn = el("au-pfand-verbuchen-btn");
const auPfandTabelleBody = document.querySelector("#au-pfand-tabelle tbody");
const auMonatJahrFeld = el("au-monat-jahr-feld");
const auMonatMonatAuswahl = el("au-monat-monat-auswahl");
const auMonatAnzeigenBtn = el("au-monat-anzeigen-btn");
const auMonatErgebnisKarte = el("au-monat-ergebnis-karte");
const auMonatTitel = el("au-monat-titel");
const auMonatErgebnis = el("au-monat-ergebnis");
const auMonatDruckenBtn = el("au-monat-drucken-btn");

// ---------------------------------------------------------------------
// Admin-Verwaltung: Produkte/Benutzer (Runde 43)
// ---------------------------------------------------------------------
const adSubtabProdukteBtn = el("ad-subtab-produkte-btn");
const adSubtabBenutzerBtn = el("ad-subtab-benutzer-btn");
const adProduktePanel = el("ad-produkte-panel");
const adBenutzerPanel = el("ad-benutzer-panel");

const adPNameFeld = el("ad-p-name-feld");
const adPKategorieAuswahl = el("ad-p-kategorie-auswahl");
const adPMwstAuswahl = el("ad-p-mwst-auswahl");
const adPEinkaufFeld = el("ad-p-einkauf-feld");
const adPVerkaufFeld = el("ad-p-verkauf-feld");
const adPHelferpreisFeld = el("ad-p-helferpreis-feld");
const adPPfandFeld = el("ad-p-pfand-feld");
const adPFehler = el("ad-p-fehler");
const adPAnlegenBtn = el("ad-p-anlegen-btn");
const adPTabelleBody = document.querySelector("#ad-p-tabelle tbody");

const adBNameFeld = el("ad-b-name-feld");
const adBPinFeld = el("ad-b-pin-feld");
const adBAdminCheckbox = el("ad-b-admin-checkbox");
const adBFehler = el("ad-b-fehler");
const adBAnlegenBtn = el("ad-b-anlegen-btn");
const adBTabelleBody = document.querySelector("#ad-b-tabelle tbody");

const produktBearbeitenOverlay = el("produkt-bearbeiten-overlay");
const pbNameFeld = el("pb-name-feld");
const pbKategorieAuswahl = el("pb-kategorie-auswahl");
const pbMwstAuswahl = el("pb-mwst-auswahl");
const pbEinkaufFeld = el("pb-einkauf-feld");
const pbVerkaufFeld = el("pb-verkauf-feld");
const pbHelferpreisFeld = el("pb-helferpreis-feld");
const pbPfandFeld = el("pb-pfand-feld");
const pbFehler = el("pb-fehler");
const pbAbbrechenBtn = el("pb-abbrechen-btn");
const pbSpeichernBtn = el("pb-speichern-btn");

const benutzerBearbeitenOverlay = el("benutzer-bearbeiten-overlay");
const bbNameFeld = el("bb-name-feld");
const bbAdminCheckbox = el("bb-admin-checkbox");
const bbFehler = el("bb-fehler");
const bbAbbrechenBtn = el("bb-abbrechen-btn");
const bbSpeichernBtn = el("bb-speichern-btn");

const bezahlenOverlay = el("bezahlen-overlay");
const bezahlenSumme = el("bezahlen-summe");
const gegebenFeld = el("gegeben-feld");
const rueckgeldAnzeige = el("rueckgeld-anzeige");
const bezahlenAbbrechenBtn = el("bezahlen-abbrechen-btn");
const bezahlenBestaetigenBtn = el("bezahlen-bestaetigen-btn");

const hinweisOverlay = el("hinweis-overlay");
const hinweisTitel = el("hinweis-titel");
const hinweisText = el("hinweis-text");
const hinweisAktionen = el("hinweis-aktionen");

const hilfeOverlay = el("hilfe-overlay");
const hilfeSchliessenBtn = el("hilfe-schliessen-btn");

const KATEGORIE_LABEL = { Getraenk: "Getränke", Speise: "Speisen" };
const KASSE_LABEL = { Jugend: "Jugendkasse", Senioren: "Seniorenkasse" };
const WOCHENTAG_LABEL = { 1: "Montag", 2: "Dienstag", 3: "Mittwoch", 4: "Donnerstag", 5: "Freitag", 6: "Samstag", 7: "Sonntag" };

// ---------------------------------------------------------------------
// Zustand
// ---------------------------------------------------------------------

let produkteCache = [];
let benutzerCache = [];
let warenkorb = []; // {produktId, name, menge, einzelpreis, einkaufspreis, mwstSatz, istHelferpreis, pfandBetrag, istPfandrueckgabe}
let nachbestellungPositionen = []; // {produktId, name, menge, einzelpreis (netto, oder null), mwstSatz (oder null), preisBrutto (nur fuer die Anzeige), pfandBezahlt (pro Stueck, oder null), pfandErhalten (pro Stueck, oder null)}
let helferpreisAktiv = false;
let angemeldeterKandidat = null; // Benutzer, dessen PIN gerade eingegeben wird
let pinEingabe = "";
let aktuelleAnsicht = "login"; // 'login' | 'verkauf' | 'storno' | 'kassensturz' | 'schiedsrichter' | 'einzahlen' | 'ausgaben' | 'entnahmen' | 'nachbestellung' | 'termine'
let letzterKassensturzSoll = 0;
let vorgaengeCache = []; // fuer Storno-Ansicht
let abgelehnteKassenvorschlaege = new Set(); // "schluessel" bereits verworfener Vorschlaege
let letzteMehrAnsicht = null; // zuletzt aktive Unteransicht innerhalb "Mehr", siehe zeigeHauptView

// Runde 43: Warenwirtschaft/Auswertung/Admin-Verwaltung.
let wwModus = "Wareneingang"; // 'Wareneingang' | 'Korrektur', siehe wwModusUmschalten
let adminSubtab = "produkte"; // 'produkte' | 'benutzer', siehe adminSubtabUmschalten
let bearbeitenProduktId = null; // waehrend #produkt-bearbeiten-overlay offen ist
let bearbeitenBenutzerId = null; // waehrend #benutzer-bearbeiten-overlay offen ist
let bearbeitenBenutzerWarAdmin = false; // Admin-Status beim Oeffnen des Bearbeiten-Dialogs, fuer die "mind. 1 Admin"-Regel
let letzteMonatsabrechnung = null; // fuer den Drucken-Knopf, siehe monatsabrechnungAnzeigen/monatsabrechnungDrucken

// ---------------------------------------------------------------------
// Hinweis-/Bestaetigungs-Dialog
// ---------------------------------------------------------------------

function hinweisSchliessen() {
  hinweisOverlay.classList.add("versteckt");
}

function zeigeHinweis(titel, text) {
  hinweisTitel.textContent = titel;
  hinweisText.textContent = text;
  hinweisAktionen.innerHTML = "";
  const okBtn = document.createElement("button");
  okBtn.id = "hinweis-ok-btn";
  okBtn.className = "btn btn-primaer";
  okBtn.textContent = "OK";
  okBtn.onclick = hinweisSchliessen;
  hinweisAktionen.appendChild(okBtn);
  hinweisOverlay.classList.remove("versteckt");
}

// Runde 42: einfache Text-Eingabe im selben Hinweis-Overlay wie
// zeigeHinweis/zeigeBestaetigung - fuegt dynamisch ein <textarea> ein
// statt ein eigenes Overlay in index.html anzulegen. resolve(null) bei
// Abbrechen, sonst der eingegebene Text (kann leer sein).
function zeigeTextEingabe(titel, text, anfangswert = "") {
  return new Promise((resolve) => {
    hinweisTitel.textContent = titel;
    hinweisText.textContent = text;
    hinweisAktionen.innerHTML = "";

    const feld = document.createElement("textarea");
    feld.id = "hinweis-text-eingabe";
    feld.value = anfangswert || "";
    feld.rows = 3;
    feld.style.width = "100%";
    feld.style.marginTop = "8px";
    feld.style.boxSizing = "border-box";
    hinweisText.after(feld);

    const aufraeumen = () => {
      feld.remove();
    };

    const abbrechenBtn = document.createElement("button");
    abbrechenBtn.className = "btn";
    abbrechenBtn.textContent = "Abbrechen";
    abbrechenBtn.onclick = () => {
      aufraeumen();
      hinweisSchliessen();
      resolve(null);
    };
    const okBtn = document.createElement("button");
    okBtn.className = "btn btn-primaer";
    okBtn.textContent = "Speichern";
    okBtn.onclick = () => {
      const wert = feld.value;
      aufraeumen();
      hinweisSchliessen();
      resolve(wert);
    };
    hinweisAktionen.appendChild(abbrechenBtn);
    hinweisAktionen.appendChild(okBtn);
    hinweisOverlay.classList.remove("versteckt");
  });
}

function zeigeBestaetigung(titel, text, jaText = "Ja") {
  return new Promise((resolve) => {
    hinweisTitel.textContent = titel;
    hinweisText.textContent = text;
    hinweisAktionen.innerHTML = "";
    const abbrechenBtn = document.createElement("button");
    abbrechenBtn.id = "hinweis-abbrechen-btn";
    abbrechenBtn.className = "btn";
    abbrechenBtn.textContent = "Abbrechen";
    abbrechenBtn.onclick = () => {
      hinweisSchliessen();
      resolve(false);
    };
    const jaBtn = document.createElement("button");
    jaBtn.id = "hinweis-ja-btn";
    jaBtn.className = "btn btn-primaer";
    jaBtn.textContent = jaText;
    jaBtn.onclick = () => {
      hinweisSchliessen();
      resolve(true);
    };
    hinweisAktionen.appendChild(abbrechenBtn);
    hinweisAktionen.appendChild(jaBtn);
    hinweisOverlay.classList.remove("versteckt");
  });
}

// ---------------------------------------------------------------------
// Hilfe-Dialog (statische Kurzanleitung, siehe index.html #hilfe-overlay)
// ---------------------------------------------------------------------

function hilfeOeffnen() {
  hilfeOverlay.classList.remove("versteckt");
}

function hilfeSchliessen() {
  hilfeOverlay.classList.add("versteckt");
}

// ---------------------------------------------------------------------
// Ansicht wechseln
// ---------------------------------------------------------------------

function zeigeHauptView(name) {
  aktuelleAnsicht = name;

  if (name === "login") {
    loginView.style.display = "";
    verkaufView.style.display = "none";
    stornoView.style.display = "none";
    kassensturzView.style.display = "none";
    schiedsrichterView.style.display = "none";
    einzahlenView.style.display = "none";
    ausgabenView.style.display = "none";
    entnahmenView.style.display = "none";
    nachbestellungView.style.display = "none";
    termineView.style.display = "none";
    feedbackView.style.display = "none";
    warenwirtschaftView.style.display = "none";
    auswertungView.style.display = "none";
    adminView.style.display = "none";
    kassenvorschlagBanner.classList.add("versteckt");
    tabsEl.style.display = "none";
    mehrTabsEl.style.display = "none";
    kasseAuswahlBereich.style.display = "none";
    benutzerLabel.style.display = "none";
    abmeldenBtn.style.display = "none";
    loginNutzerauswahl.style.display = "";
    loginPinEingabe.style.display = "none";
    return;
  }

  loginView.style.display = "none";
  tabsEl.style.display = "flex";
  kasseAuswahlBereich.style.display = "flex";
  kasseAuswahlBereich.style.alignItems = "center";
  benutzerLabel.style.display = "";
  abmeldenBtn.style.display = "";

  verkaufView.style.display = name === "verkauf" ? "flex" : "none";
  stornoView.style.display = name === "storno" ? "" : "none";
  kassensturzView.style.display = name === "kassensturz" ? "" : "none";
  schiedsrichterView.style.display = name === "schiedsrichter" ? "" : "none";
  einzahlenView.style.display = name === "einzahlen" ? "" : "none";
  ausgabenView.style.display = name === "ausgaben" ? "" : "none";
  entnahmenView.style.display = name === "entnahmen" ? "" : "none";
  nachbestellungView.style.display = name === "nachbestellung" ? "" : "none";
  termineView.style.display = name === "termine" ? "" : "none";
  feedbackView.style.display = name === "feedback" ? "" : "none";
  warenwirtschaftView.style.display = name === "warenwirtschaft" ? "" : "none";
  auswertungView.style.display = name === "auswertung" ? "" : "none";
  adminView.style.display = name === "admin" ? "" : "none";

  // "Mehr"-Buendel (Runde 30): eine der 7 Unteransichten ist aktiv -> der
  // Reiter "Mehr" wird als aktiv markiert und die Unter-Reiterleiste
  // eingeblendet; die zuletzt gewaehlte Unteransicht wird gemerkt, damit
  // ein erneutes Antippen von "Mehr" dort wieder hinspringt.
  const istMehrAnsicht = MEHR_ANSICHTEN.includes(name);
  if (istMehrAnsicht) letzteMehrAnsicht = name;
  mehrTabsEl.style.display = istMehrAnsicht ? "flex" : "none";

  tabVerkauf.classList.toggle("aktiv", name === "verkauf");
  tabStorno.classList.toggle("aktiv", name === "storno");
  tabKassensturz.classList.toggle("aktiv", name === "kassensturz");
  tabMehr.classList.toggle("aktiv", istMehrAnsicht);
  tabSchiedsrichter.classList.toggle("aktiv", name === "schiedsrichter");
  tabEinzahlen.classList.toggle("aktiv", name === "einzahlen");
  tabAusgaben.classList.toggle("aktiv", name === "ausgaben");
  tabEntnahmen.classList.toggle("aktiv", name === "entnahmen");
  tabNachbestellung.classList.toggle("aktiv", name === "nachbestellung");
  tabTermine.classList.toggle("aktiv", name === "termine");
  tabFeedback.classList.toggle("aktiv", name === "feedback");
  tabWarenwirtschaft.classList.toggle("aktiv", name === "warenwirtschaft");
  tabAuswertung.classList.toggle("aktiv", name === "auswertung");
  tabAdmin.classList.toggle("aktiv", name === "admin");

  if (name === "verkauf") renderProduktGrid();
  if (name === "storno") renderStornoListe();
  if (name === "kassensturz") renderKassensturz();
  if (name === "schiedsrichter") renderSchiedsrichter();
  if (name === "einzahlen") renderEinzahlungen();
  if (name === "ausgaben") renderAusgaben();
  if (name === "entnahmen") renderEntnahmen();
  if (name === "nachbestellung") renderNachbestellungen();
  if (name === "termine") renderTermine();
  if (name === "feedback") renderFeedback();
  if (name === "warenwirtschaft") renderWarenwirtschaft();
  if (name === "auswertung") renderAuswertung();
  if (name === "admin") renderAdmin();
}

// ---------------------------------------------------------------------
// Login: Benutzerauswahl + PIN
// ---------------------------------------------------------------------

function renderLoginNutzer() {
  nutzerGrid.innerHTML = "";
  loginLeerHinweis.style.display = benutzerCache.length ? "none" : "";
  for (const benutzer of benutzerCache) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = benutzer.name;
    btn.onclick = () => pinEingabeZeigen(benutzer);
    nutzerGrid.appendChild(btn);
  }
}

function pinEingabeZeigen(benutzer) {
  angemeldeterKandidat = benutzer;
  pinEingabe = "";
  pinNameLabel.textContent = `PIN für ${benutzer.name}`;
  pinFehler.textContent = "";
  aktualisierePinAnzeige();
  loginNutzerauswahl.style.display = "none";
  loginPinEingabe.style.display = "";
}

function pinEingabeVerlassen() {
  angemeldeterKandidat = null;
  pinEingabe = "";
  loginNutzerauswahl.style.display = "";
  loginPinEingabe.style.display = "none";
}

function aktualisierePinAnzeige() {
  pinAnzeige.textContent = pinEingabe.length ? "●".repeat(pinEingabe.length) : "–";
}

// Tastatur-Aufbau (0-9, Loeschen, OK). Wie bei der Windows-App wichtig:
// die Tasten selbst duerfen den Tastatur-Fokus nicht behalten, sonst
// "schluckt" die zuletzt angetippte Taste die Enter-Taste, bevor unser
// globaler keydown-Handler unten sie sieht und den PIN bestaetigt.
function renderTastatur() {
  tastatur.innerHTML = "";
  const tasten = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"];
  for (const taste of tasten) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = taste;
    btn.tabIndex = -1; // kein Tastatur-Fokus - Pendant zu Qt.NoFocus
    if (taste === "OK") btn.classList.add("ok");
    btn.addEventListener("click", () => {
      if (taste === "⌫") {
        pinEingabe = pinEingabe.slice(0, -1);
        aktualisierePinAnzeige();
      } else if (taste === "OK") {
        pinBestaetigen();
      } else if (pinEingabe.length < 8) {
        pinEingabe += taste;
        aktualisierePinAnzeige();
      }
      btn.blur();
    });
    tastatur.appendChild(btn);
  }
}

async function pinBestaetigen() {
  if (!angemeldeterKandidat || !pinEingabe.length) return;
  const benutzer = await repo.benutzerAnmelden(angemeldeterKandidat.id, pinEingabe);
  if (!benutzer) {
    pinFehler.textContent = "Falscher PIN. Bitte erneut versuchen.";
    pinEingabe = "";
    aktualisierePinAnzeige();
    return;
  }
  session.anmelden(benutzer);
  pinEingabe = "";
  angemeldeterKandidat = null;
  // Runde 38: PIN-Eingabefeld muss hier explizit wieder verstecken werden -
  // zeigeHauptView("verkauf") (in nachAnmeldungAnzeigen) versteckt nur den
  // gesamten Login-Bildschirm (loginView), nicht dieses einzelne Kindelement.
  // loginPinEingabe.style.display blieb dadurch bisher auf "" (sichtbar)
  // stehen, obwohl der Ziffernblock laengst nicht mehr zu sehen war - siehe
  // Fix weiter unten beim globalen keydown-Listener fuer den Grund, warum
  // das schwerwiegende Folgen hatte.
  loginPinEingabe.style.display = "none";
  nachAnmeldungAnzeigen();
  kassensturzHinweisPruefenUndAnzeigen();
}

// Runde 39: Erinnerung "Kasse einmal zaehlen", nur beim allerersten Login
// eines Kalendertages auf DIESEM Geraet (nicht bei jedem Login) - Pendant
// zu repository.kassensturz_hinweis_pruefen() auf Windows. localStorage
// statt IndexedDB, weil das rein eine per-Geraet-UX-Kleinigkeit ist und
// keine Synchronisation/Haltbarkeit ueber einen App-Neustart hinaus in
// IndexedDB braucht.
function kassensturzHinweisPruefenUndAnzeigen() {
  const heute = new Date().toISOString().slice(0, 10);
  try {
    if (localStorage.getItem("kassensturz_hinweis_datum") === heute) return;
    localStorage.setItem("kassensturz_hinweis_datum", heute);
  } catch (exc) {
    // localStorage kann in seltenen Faellen (z.B. privater Modus mit
    // Speicherverbot) eine Ausnahme werfen - dann einfach jedes Mal
    // erinnern statt die Anmeldung zu blockieren.
  }
  zeigeHinweis(
    "Kassensturz nicht vergessen",
    "Bitte heute einmal die Kasse zählen (Kassensturz), bevor es losgeht " +
      "– am besten gleich zu Beginn."
  );
}

function nachAnmeldungAnzeigen() {
  const benutzer = session.getAktuellerBenutzer();
  benutzerLabel.textContent = benutzer.name;
  // "Nachbestellungen" (Lieferanten-Pfand) ist bewusst nur fuer
  // Administratoren sichtbar - analog zu den Admin-only-Reitern der
  // Windows-App (siehe main_window.py, _admin_sichtbarkeit_anwenden).
  tabNachbestellung.style.display = benutzer.ist_admin ? "" : "none";
  // Runde 43: Auswertung/Admin-Verwaltung ebenfalls nur fuer
  // Administratoren - Warenwirtschaft bleibt (wie am Rechner) fuer alle
  // Helfer sichtbar.
  tabAuswertung.style.display = benutzer.ist_admin ? "" : "none";
  tabAdmin.style.display = benutzer.ist_admin ? "" : "none";
  kasseAuswahl.value = session.getAktiveKasse();
  warenkorb = [];
  nachbestellungPositionen = [];
  helferpreisAktiv = false;
  abgelehnteKassenvorschlaege = new Set();
  zeigeHauptView("verkauf");
  pruefeKassenvorschlag();
}

function abmelden() {
  session.abmelden();
  warenkorb = [];
  nachbestellungPositionen = [];
  helferpreisAktiv = false;
  letzteMehrAnsicht = null;
  renderLoginNutzer();
  zeigeHauptView("login");
}

// Globale Tastatur-Unterstuetzung fuer die PIN-Eingabe (Ziffernblock,
// Enter zum Bestaetigen, Escape zum Zurueckgehen). WICHTIG: dieser Listener
// haengt am gesamten document und faengt Ziffern-/Backspace-/Enter-Tasten
// ab (inkl. preventDefault!), solange die Bedingung unten nicht zutrifft -
// er MUSS also zuverlaessig "aus" sein, sobald der PIN-Bildschirm nicht
// mehr angezeigt wird. Runde 38: genau das war bis hierhin nicht der Fall
// (siehe Fix in pinBestaetigen()) - loginPinEingabe.style.display blieb
// nach erfolgreichem Login auf "" stehen, wodurch dieser Listener fuer die
// gesamte restliche Sitzung JEDE Zifferntaste app-weit abgefangen und per
// preventDefault() verschluckt hat, bevor sie ein normales Eingabefeld
// (Bezahlen "Gegeben", Kassensturz "Gezaehlt", ...) erreichen konnte -
// exakte Ursache des gemeldeten "Numpad nimmt keine Zahlen an".
document.addEventListener("keydown", (ev) => {
  if (loginPinEingabe.style.display === "none") return;
  if (ev.key >= "0" && ev.key <= "9") {
    if (pinEingabe.length < 8) {
      pinEingabe += ev.key;
      aktualisierePinAnzeige();
    }
    ev.preventDefault();
  } else if (ev.key === "Backspace") {
    pinEingabe = pinEingabe.slice(0, -1);
    aktualisierePinAnzeige();
    ev.preventDefault();
  } else if (ev.key === "Enter") {
    pinBestaetigen();
    ev.preventDefault();
  } else if (ev.key === "Escape") {
    pinEingabeVerlassen();
    ev.preventDefault();
  }
});

// ---------------------------------------------------------------------
// Verkauf
// ---------------------------------------------------------------------

// Runde 39: zeigt immer nur EINE Kategorie gleichzeitig (Umschalt-Knoepfe
// "Getränke"/"Speisen" statt beide Kategorien untereinander mit
// Zwischenueberschrift) - schnellerer Wechsel per Tap. Getraenke zuerst,
// weil das beim Kiosk der haeufigere Fall ist (analog zur Windows-App).
let aktiveProduktKategorie = "Getraenk";

function kategorieUmschalten(kategorie) {
  if (kategorie === aktiveProduktKategorie) return;
  aktiveProduktKategorie = kategorie;
  renderProduktGrid();
}

function renderProduktGrid() {
  katBtnGetraenk.classList.toggle("aktiv", aktiveProduktKategorie === "Getraenk");
  katBtnSpeise.classList.toggle("aktiv", aktiveProduktKategorie === "Speise");

  produktGrid.innerHTML = "";
  const produkte = produkteCache.filter((p) => p.kategorie === aktiveProduktKategorie);
  for (const produkt of produkte) {
    const kachel = document.createElement("button");
    kachel.type = "button";
    kachel.className = "produkt-kachel";
    const name = document.createElement("div");
    name.className = "produkt-kachel-name";
    name.textContent = produkt.name;
    const preis = document.createElement("div");
    preis.className = "produkt-kachel-preis";
    preis.textContent = euro(produkt.verkaufspreis);
    kachel.appendChild(name);
    kachel.appendChild(preis);
    if (produkt.helferpreis != null && produkt.helferpreis !== produkt.verkaufspreis) {
      const helferzeile = document.createElement("div");
      helferzeile.style.fontSize = "12px";
      helferzeile.style.fontWeight = "400";
      helferzeile.style.color = "#666";
      helferzeile.textContent = `Helfer: ${euro(produkt.helferpreis)}`;
      kachel.appendChild(helferzeile);
    }
    if (produkt.pfand_betrag) {
      const pfandzeile = document.createElement("div");
      pfandzeile.style.fontSize = "12px";
      pfandzeile.style.fontWeight = "400";
      pfandzeile.style.color = "#666";
      pfandzeile.textContent = `+${euro(produkt.pfand_betrag)} Pfand`;
      kachel.appendChild(pfandzeile);
    }
    kachel.onclick = () => warenkorbHinzufuegen(produkt);
    produktGrid.appendChild(kachel);
  }
}

function warenkorbHinzufuegen(produkt) {
  const istHelfer = helferpreisAktiv;
  const einzelpreis = istHelfer ? produkt.helferpreis ?? produkt.verkaufspreis : produkt.verkaufspreis;
  // Runde 38 (Feedback #2): eine Zeile mit bereits erlassenem Pfand (Kunde
  // hat schon eine bezahlte Marke) darf beim erneuten Antippen des Produkts
  // NICHT einfach mit hochgezaehlt werden - sonst wuerde ein zweites,
  // eigentlich normal zu bezahlendes Getraenk versehentlich auch pfandfrei
  // werden. Ein neuer Klick landet deshalb immer in einer eigenen (oder
  // neuen) Nicht-Erlass-Zeile, analog zur bestehenden istHelferpreis-
  // Trennung.
  const bestehend = warenkorb.find(
    (z) => z.produktId === produkt.id && z.istHelferpreis === istHelfer
      && !z.istPfandrueckgabe && !z.pfandErlassen
  );
  if (bestehend) {
    bestehend.menge += 1;
  } else {
    warenkorb.push({
      produktId: produkt.id,
      name: produkt.name + (istHelfer ? " (Helferpreis)" : ""),
      menge: 1,
      einzelpreis,
      einkaufspreis: produkt.einkaufspreis,
      mwstSatz: produkt.mwst_satz,
      istHelferpreis: istHelfer,
      // Runde 29: Helferpreis bedeutet kein Pfand - Helfer im Dienst
      // zahlen fuer ihr eigenes Getraenk keinen Pfandbetrag, unabhaengig
      // davon, ob das Produkt normalerweise pfandpflichtig ist.
      pfandBetrag: istHelfer ? 0 : produkt.pfand_betrag || 0,
      // Runde 38: urspruenglicher Pfandbetrag des Produkts, unabhaengig von
      // Helferpreis/Erlass - wird gebraucht, um "Pfandmarke vorhanden"
      // wieder abzuwaehlen und pfandBetrag korrekt zurueckzusetzen.
      pfandBetragOhneErlass: produkt.pfand_betrag || 0,
      pfandErlassen: false,
      istPfandrueckgabe: false,
    });
  }
  helferpreisAktiv = false;
  helferpreisBtn.classList.remove("aktiv");
  renderWarenkorb();
}

// Feedback #2 (Runde 38): Kunde haelt bereits eine bezahlte, unretournierte
// Pfandmarke - das Pfand fuer diese Warenkorb-Zeile wird dadurch erlassen.
// Setzt pfandBetrag direkt auf 0 (bzw. beim Abwaehlen zurueck auf den
// urspruenglichen Produkt-Pfandbetrag) - genau das gleiche Prinzip wie beim
// bestehenden Helferpreis. Dadurch muessen weder warenkorbSumme() noch
// repo.kassiervorgangAbschliessen() etwas von diesem neuen Zustand wissen -
// sie lesen wie bisher einfach pfandBetrag.
function warenkorbPfandErlassUmschalten(zeile, erlassen) {
  zeile.pfandErlassen = erlassen;
  zeile.pfandBetrag = erlassen ? 0 : zeile.pfandBetragOhneErlass || 0;
  renderWarenkorb();
}

// "Pfand zurueckgeben": mit einem einzigen Antippen wird sofort eine
// pauschale Rueckgabe (immer 2,00 EUR, unabhaengig von der Flasche) als
// eigenstaendige Warenkorb-Position mit einzelpreis 0 und negativem
// Pfandbetrag gebucht - ueber das feste Pseudo-Produkt
// PFAND_RUECKGABE_PRODUKT_ID (siehe config.js), damit keine Flasche mehr
// ausgewaehlt werden muss (siehe repo.js kassiervorgangAbschliessen:
// mindert den Gesamtbetrag automatisch und bucht bewusst keinen
// Warenausgang). Erneutes Antippen erhoeht einfach die Menge.
async function pfandRueckgabeKlick() {
  const produkt = await repo.pfandPauschalProdukt();
  if (!produkt) {
    zeigeHinweis(
      "Noch nicht synchronisiert",
      "Das Pfandrückgabe-Pseudo-Produkt ist auf diesem Tablet noch nicht vorhanden. Bitte einmal synchronisieren und erneut versuchen."
    );
    return;
  }
  if (!produkt.pfand_betrag) {
    zeigeHinweis("Kein Pfandbetrag hinterlegt", "Für die Pfandrückgabe ist aktuell kein Betrag hinterlegt.");
    return;
  }
  const bestehend = warenkorb.find((z) => z.produktId === produkt.id && z.istPfandrueckgabe);
  if (bestehend) {
    bestehend.menge += 1;
  } else {
    warenkorb.push({
      produktId: produkt.id,
      name: produkt.name,
      menge: 1,
      einzelpreis: 0,
      einkaufspreis: 0,
      mwstSatz: 0,
      istHelferpreis: false,
      pfandBetrag: -produkt.pfand_betrag,
      istPfandrueckgabe: true,
    });
  }
  renderWarenkorb();
}

// Runde 44: "Kaffee für Trainer" - Ein-Klick-Knopf im Reiter "Verkauf",
// fuer ALLE Benutzer sichtbar (kein Admin-Recht noetig). Analog zu den
// SCHIEDSRICHTER_WASSER_*-Knoepfen (siehe schiedsrichterWasserAusgeben)
// wird KEIN Warenkorb/Bezahlen-Ablauf durchlaufen und KEIN Kassiervorgang
// erzeugt - nur eine reine Korrektur-Lagerbewegung ueber die bereits
// vorhandene repo.lagerbewegungErfassen(), die den Bestand um 1 senkt.
// Anders als bei den Schiedsrichter-Wasser-Knoepfen gibt es hier keine
// eigene Auszahlungs-Tabelle (kein Bargeld-Bezug), daher direkter Aufruf
// von lagerbewegungErfassen() statt ueber schiedsrichterAuszahlungErfassen.
async function kaffeeFuerTrainerAusgeben() {
  const bestaetigt = await zeigeBestaetigung(
    "Kaffee kostenlos ausgeben?",
    "1x Kaffee kostenlos an einen Trainer ausgeben?"
  );
  if (!bestaetigt) return;

  const benutzer = session.getAktuellerBenutzer();
  const gid = await geraetId();
  try {
    await repo.lagerbewegungErfassen(
      KAFFEE_TRAINER_PRODUKT_ID,
      "Korrektur",
      -1,
      "Kostenlose Ausgabe an Trainer",
      benutzer.name,
      gid
    );
  } catch (exc) {
    zeigeHinweis("Fehler beim Buchen", exc.message ?? String(exc));
    return;
  }
  zeigeHinweis("Kaffee ausgegeben", "1x Kaffee wurde kostenlos an einen Trainer ausgegeben.");
  if (aktuelleAnsicht === "warenwirtschaft") renderWarenwirtschaft();
}

function renderWarenkorb() {
  warenkorbListe.innerHTML = "";
  for (const zeile of warenkorb) {
    const div = document.createElement("div");
    div.className = "warenkorb-zeile";

    const name = document.createElement("span");
    name.className = "name";
    if (zeile.istPfandrueckgabe) {
      name.textContent = `Pfand zurückgegeben (${euro(zeile.pfandBetrag)})`;
      name.style.color = "var(--rot)";
    } else {
      const pfandHinweis = zeile.pfandBetrag ? ` +${euro(zeile.pfandBetrag)} Pfand` : "";
      const erlassHinweis = zeile.pfandErlassen ? " (Pfandmarke vorhanden)" : "";
      name.textContent = `${zeile.name} (${euro(zeile.einzelpreis)}${pfandHinweis})${erlassHinweis}`;
    }

    // Feedback #2 (Runde 38): Checkbox zum Erlassen des Pfands, nur bei
    // pfandpflichtigen Artikeln, die weder Helferpreis noch Pfandrueckgabe
    // sind (genau wie im Windows-Pendant _baue_pfand_widget).
    let pfandMarkeLabel = null;
    if (zeile.pfandBetragOhneErlass && !zeile.istHelferpreis && !zeile.istPfandrueckgabe) {
      pfandMarkeLabel = document.createElement("label");
      pfandMarkeLabel.className = "pfand-erlass-feld";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!zeile.pfandErlassen;
      checkbox.title =
        `Kunde hat bereits eine bezahlte Pfandmarke (${euro(zeile.pfandBetragOhneErlass)}) - `
        + "kein Pfand für diese Zeile berechnen.";
      checkbox.onchange = () => warenkorbPfandErlassUmschalten(zeile, checkbox.checked);
      pfandMarkeLabel.appendChild(checkbox);
      pfandMarkeLabel.appendChild(document.createTextNode(" Marke vorhanden"));
    }

    const minus = document.createElement("button");
    minus.type = "button";
    minus.className = "btn mini";
    minus.textContent = "–";
    minus.onclick = () => {
      zeile.menge -= 1;
      if (zeile.menge <= 0) {
        warenkorb = warenkorb.filter((z) => z !== zeile);
      }
      renderWarenkorb();
    };

    const menge = document.createElement("span");
    menge.textContent = zeile.menge;

    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "btn mini";
    plus.textContent = "+";
    plus.onclick = () => {
      zeile.menge += 1;
      renderWarenkorb();
    };

    const entfernen = document.createElement("button");
    entfernen.type = "button";
    entfernen.className = "btn mini";
    entfernen.textContent = "✕";
    entfernen.onclick = () => {
      warenkorb = warenkorb.filter((z) => z !== zeile);
      renderWarenkorb();
    };

    div.appendChild(name);
    if (pfandMarkeLabel) {
      div.appendChild(pfandMarkeLabel);
    }
    div.appendChild(minus);
    div.appendChild(menge);
    div.appendChild(plus);
    div.appendChild(entfernen);
    warenkorbListe.appendChild(div);
  }

  const summe = warenkorbSumme();
  summeEl.textContent = `Summe: ${euro(summe)}`;
  bezahlenBtn.disabled = warenkorb.length === 0;
}

function warenkorbSumme() {
  return warenkorb.reduce((s, z) => s + z.menge * (z.einzelpreis + (z.pfandBetrag || 0)), 0);
}

function bezahlenOeffnen() {
  if (!warenkorb.length) return;
  bezahlenSumme.textContent = euro(warenkorbSumme());
  gegebenFeld.value = "";
  rueckgeldAnzeige.textContent = "";
  bezahlenBestaetigenBtn.disabled = true;
  bezahlenOverlay.classList.remove("versteckt");
  gegebenFeld.focus();
}

function bezahlenSchliessen() {
  bezahlenOverlay.classList.add("versteckt");
}

function bezahlenGegebenGeaendert() {
  const gegeben = parseFloat(gegebenFeld.value);
  if (isNaN(gegeben)) {
    rueckgeldAnzeige.textContent = "";
    bezahlenBestaetigenBtn.disabled = true;
    return;
  }
  const rueckgeld = gegeben - warenkorbSumme();
  rueckgeldAnzeige.textContent = `Rückgeld: ${euro(rueckgeld)}`;
  rueckgeldAnzeige.style.color = rueckgeld < 0 ? "var(--rot)" : "var(--gruen)";
  bezahlenBestaetigenBtn.disabled = rueckgeld < 0;
}

async function bezahlenBestaetigen() {
  const gegeben = parseFloat(gegebenFeld.value);
  if (isNaN(gegeben)) return;
  const benutzer = session.getAktuellerBenutzer();
  try {
    await repo.kassiervorgangAbschliessen(session.getAktiveKasse(), warenkorb, gegeben, benutzer.name);
  } catch (exc) {
    zeigeHinweis("Fehler beim Bezahlen", exc.message ?? String(exc));
    return;
  }
  warenkorb = [];
  helferpreisAktiv = false;
  helferpreisBtn.classList.remove("aktiv");
  renderWarenkorb();
  bezahlenSchliessen();
}

// ---------------------------------------------------------------------
// Storno
// ---------------------------------------------------------------------

async function renderStornoListe() {
  const alle = await repo.letzteVorgaenge(500);
  vorgaengeCache = alle;
  const stornierteIds = new Set(alle.filter((v) => v.storno_von).map((v) => v.storno_von));
  const aktiveKasse = session.getAktiveKasse();
  const anzeige = alle.filter((v) => v.veranstaltung === aktiveKasse).slice(0, 50);

  stornoTabelleBody.innerHTML = "";
  for (const vorgang of anzeige) {
    const tr = document.createElement("tr");
    let status = "Aktiv";
    if (vorgang.storno_von) status = "Storno";
    else if (stornierteIds.has(vorgang.id)) status = "Storniert";
    if (status !== "Aktiv") tr.classList.add("storniert");

    const tdDatum = document.createElement("td");
    tdDatum.textContent = formatDatumUhrzeit(vorgang.datum);
    const tdKasse = document.createElement("td");
    tdKasse.textContent = KASSE_LABEL[vorgang.veranstaltung] ?? vorgang.veranstaltung;
    const tdBetrag = document.createElement("td");
    tdBetrag.textContent = euro(vorgang.gesamtbetrag, true);
    const tdStatus = document.createElement("td");
    tdStatus.textContent = status;
    const tdAktion = document.createElement("td");

    if (status === "Aktiv") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      btn.textContent = "Stornieren";
      btn.onclick = async () => {
        const ok = await zeigeBestaetigung(
          "Vorgang stornieren?",
          `Der Vorgang vom ${formatDatumUhrzeit(vorgang.datum)} über ${euro(vorgang.gesamtbetrag)} wird storniert. Das kann nicht rückgängig gemacht werden.`,
          "Stornieren"
        );
        if (!ok) return;
        const benutzer = session.getAktuellerBenutzer();
        try {
          await repo.vorgangStornieren(vorgang.id, benutzer.name);
        } catch (exc) {
          zeigeHinweis("Fehler beim Stornieren", exc.message ?? String(exc));
          return;
        }
        renderStornoListe();
      };
      tdAktion.appendChild(btn);
    }

    tr.appendChild(tdDatum);
    tr.appendChild(tdKasse);
    tr.appendChild(tdBetrag);
    tr.appendChild(tdStatus);
    tr.appendChild(tdAktion);
    stornoTabelleBody.appendChild(tr);
  }
}

// ---------------------------------------------------------------------
// Kassensturz
// ---------------------------------------------------------------------

// Zwischenspeicher der zuletzt geladenen Gesamt-Vorschau (siehe
// renderKassensturz) - wird gebraucht, um beim Tippen in ein
// Anfangsbestand-Override-Feld (nur bei einer Kasse, die gerade ihren
// allerersten Kassensturz hat) das angezeigte Soll live nachzuziehen, ohne
// alles neu aus der Datenbank zu laden.
let ksLetzteVorschauGesamt = null;
// {veranstaltung: <input>} - nur fuer Kassen mit istErsterKassensturz.
let ksAnfangsbestandOverrideFelder = {};

async function renderKassensturz() {
  const vorschau = await repo.kassensturzGesamtVorschau();
  ksLetzteVorschauGesamt = vorschau;
  letzterKassensturzSoll = vorschau.soll;

  const aufteilungsText = (feld, vorzeichen) =>
    vorschau.kassen
      .map((k) => `${KASSE_LABEL[k.veranstaltung] ?? k.veranstaltung}: ${euro(k[feld], vorzeichen)}`)
      .join(" · ");

  ksAnfangsbestand.textContent = euro(vorschau.anfangsbestand);
  ksAnfangsbestandAufteilung.textContent = aufteilungsText("anfangsbestand");
  ksEinnahmen.textContent = euro(vorschau.einnahmen, true);
  ksEinnahmenAufteilung.textContent = aufteilungsText("einnahmen", true);
  ksAuszahlungen.textContent = euro(vorschau.auszahlungen);
  ksSonstigeAusgaben.textContent = euro(vorschau.sonstigeAusgaben);
  ksEinzahlungen.textContent = euro(vorschau.einzahlungen);
  ksEntnahmen.textContent = euro(vorschau.entnahmen);
  ksSoll.textContent = euro(vorschau.soll);
  ksSollAufteilung.textContent = aufteilungsText("soll");

  ksGezaehltFeld.value = "";
  ksDifferenz.textContent = "";

  // Anfangsbestand-Override nur fuer Kassen, die gerade ihren allerersten
  // Kassensturz haben (analog zum Windows-Dialog) - im Normalfall (beide
  // Kassen schon mindestens einmal gezaehlt) bleibt dieser Abschnitt leer.
  ksAnfangsbestandOverridesContainer.innerHTML = "";
  ksAnfangsbestandOverrideFelder = {};
  for (const k of vorschau.kassen) {
    if (!k.istErsterKassensturz) continue;
    const label = document.createElement("label");
    label.innerHTML = `<b>Anfangsbestand (Wechselgeld) – ${KASSE_LABEL[k.veranstaltung] ?? k.veranstaltung}:</b>`;
    const input = document.createElement("input");
    input.type = "number";
    input.inputMode = "decimal";
    input.step = "0.01";
    input.className = "betrag";
    input.value = "0.00";
    input.oninput = ksAnfangsbestandOverrideGeaendert;
    ksAnfangsbestandOverrideFelder[k.veranstaltung] = input;
    ksAnfangsbestandOverridesContainer.appendChild(label);
    ksAnfangsbestandOverridesContainer.appendChild(input);
  }

  await renderKassensturzHistorie();
}

function ksAktuellesSollGesamt() {
  if (!ksLetzteVorschauGesamt) return 0;
  let soll = 0;
  for (const k of ksLetzteVorschauGesamt.kassen) {
    const feld = ksAnfangsbestandOverrideFelder[k.veranstaltung];
    const anfangsbestand = feld ? parseFloat(feld.value) || 0 : k.anfangsbestand;
    soll += anfangsbestand + k.einnahmen - k.auszahlungen - k.sonstigeAusgaben
      + k.einzahlungen - k.entnahmen;
  }
  return Math.round(soll * 100) / 100;
}

function ksAnfangsbestandOverrideGeaendert() {
  letzterKassensturzSoll = ksAktuellesSollGesamt();
  ksSoll.textContent = euro(letzterKassensturzSoll);
  ksGezaehltGeaendert();
}

function ksGezaehltGeaendert() {
  const gezaehlt = parseFloat(ksGezaehltFeld.value);
  if (isNaN(gezaehlt)) {
    ksDifferenz.textContent = "";
    return;
  }
  const differenz = gezaehlt - letzterKassensturzSoll;
  ksDifferenz.textContent = `Differenz: ${euro(differenz, true)}`;
  ksDifferenz.style.color = differenz === 0 ? "" : differenz < 0 ? "var(--rot)" : "var(--gruen)";
}

async function ksSpeichern() {
  const gezaehlt = parseFloat(ksGezaehltFeld.value);
  if (isNaN(gezaehlt)) {
    zeigeHinweis("Fehlende Angabe", "Bitte den tatsächlich gezählten Betrag eingeben.");
    return;
  }
  // Runde 39: kein eigenes "Startbetrag naechste Runde"-Feld mehr - der
  // komplette gezaehlte Betrag bleibt automatisch als Wechselgeld in der
  // Kasse (siehe Windows-Pendant KombinierterKassensturzDialog.
  // naechster_startbetrag()).
  const naechsterStart = gezaehlt;
  const benutzer = session.getAktuellerBenutzer();
  const overrides = {};
  for (const [veranstaltung, feld] of Object.entries(ksAnfangsbestandOverrideFelder)) {
    const wert = parseFloat(feld.value);
    overrides[veranstaltung] = isNaN(wert) ? 0 : wert;
  }
  const ergebnis = await repo.kassensturzGesamtDurchfuehren(
    gezaehlt,
    naechsterStart,
    overrides,
    benutzer.name
  );
  const aufteilungText = ergebnis.kassen
    .map(
      (k) =>
        `${KASSE_LABEL[k.veranstaltung] ?? k.veranstaltung}: Soll ${euro(k.soll)}, ` +
        `Gezählt ${euro(k.gezaehlterBetrag)}, Differenz ${euro(k.differenz, true)}`
    )
    .join("\n");
  zeigeHinweis(
    "Kassensturz gespeichert",
    `Soll (gesamt): ${euro(ergebnis.soll)}\nGezählt (gesamt): ${euro(gezaehlt)}\n` +
      `Differenz (gesamt): ${euro(ergebnis.differenz, true)}\n\nAufteilung nach Kasse:\n${aufteilungText}`
  );
  renderKassensturz();
  renderEntnahmen();
  // Runde 39: die fruehere Ueberschuss-Entnahme-Nachfrage entfaellt hier
  // bewusst - seit dem Wegfall des separaten "Startbetrag naechste
  // Runde"-Felds ist der Ueberschuss (gezaehlt - naechster Start) immer 0.
  // Wer tatsaechlich Bargeld aus der Kasse entnimmt, bucht das weiterhin
  // ganz normal ueber den eigenen Reiter "Entnahmen".
}

// Zwischenspeicher fuer den Dialog "Bargeld-Entnahme dokumentieren" (siehe
// ksSpeichern oben und die Knopf-Handler weiter unten) - wird bei jedem
// Kassensturz mit Ueberschuss neu gesetzt.
let ksEntnahmeUeberschussKasse = null;
let ksEntnahmeUeberschussKassensturzId = null;

function ksEntnahmeUeberspringen() {
  ksEntnahmeOverlay.classList.add("versteckt");
  ksEntnahmeUeberschussKasse = null;
  ksEntnahmeUeberschussKassensturzId = null;
}

async function ksEntnahmeSpeichern() {
  const betrag = parseFloat(ksEntnahmeBetragFeld.value);
  if (isNaN(betrag) || betrag <= 0) {
    ksEntnahmeFehler.textContent = "Bitte einen gültigen Betrag größer als 0 eingeben.";
    return;
  }
  const empfaenger = ksEntnahmeEmpfaengerFeld.value.trim();
  const benutzer = session.getAktuellerBenutzer();
  try {
    await repo.bargeldEntnahmeErfassen(
      ksEntnahmeUeberschussKasse,
      betrag,
      empfaenger,
      null,
      benutzer.name,
      ksEntnahmeUeberschussKassensturzId
    );
  } catch (exc) {
    ksEntnahmeFehler.textContent = exc.message ?? String(exc);
    return;
  }
  ksEntnahmeOverlay.classList.add("versteckt");
  ksEntnahmeUeberschussKasse = null;
  ksEntnahmeUeberschussKassensturzId = null;
  renderEntnahmen();
}

async function renderKassensturzHistorie() {
  // Runde 37: nicht mehr nach aktiver Kasse gefiltert, da der Kassensturz
  // jetzt kombiniert (fuer alle Kassen zusammen) durchgefuehrt wird - die
  // "Kasse"-Spalte zeigt weiterhin, wie sich die einzelnen Eintraege auf
  // Jugend/Senioren aufteilen.
  const anzeige = (await repo.kassensturzHistorie(200)).slice(0, 20);
  ksHistorieBody.innerHTML = "";
  for (const k of anzeige) {
    const tr = document.createElement("tr");
    const zellen = [
      formatDatumUhrzeit(k.datum),
      KASSE_LABEL[k.veranstaltung] ?? k.veranstaltung,
      euro(k.erwarteter_betrag),
      euro(k.gezaehlter_betrag),
      euro(k.differenz, true),
    ];
    for (const wert of zellen) {
      const td = document.createElement("td");
      td.textContent = wert;
      tr.appendChild(td);
    }
    ksHistorieBody.appendChild(tr);
  }
}

// ---------------------------------------------------------------------
// Schiedsrichter-Auszahlungen
// ---------------------------------------------------------------------

async function renderSchiedsrichter() {
  const aktiveKasse = session.getAktiveKasse();
  srKasseName.textContent = KASSE_LABEL[aktiveKasse] ?? aktiveKasse;
  srFehler.textContent = "";

  const alle = await repo.letzteSchiedsrichterAuszahlungen(500);
  const stornierteIds = new Set(alle.filter((a) => a.storno_von).map((a) => a.storno_von));
  const anzeige = alle.filter((a) => a.veranstaltung === aktiveKasse).slice(0, 50);
  const produktNamen = new Map((await repo.listeProdukte(false)).map((p) => [p.id, p.name]));

  srTabelleBody.innerHTML = "";
  for (const auszahlung of anzeige) {
    const tr = document.createElement("tr");
    let status = "Aktiv";
    if (auszahlung.storno_von) status = "Storno";
    else if (stornierteIds.has(auszahlung.id)) status = "Storniert";
    if (status !== "Aktiv") tr.classList.add("storniert");

    let kostenlosText = "–";
    if (auszahlung.kostenlos_produkt_id && auszahlung.kostenlos_menge) {
      const name = produktNamen.get(auszahlung.kostenlos_produkt_id) ?? "?";
      kostenlosText = `${name} x${auszahlung.kostenlos_menge}`;
    }

    const zellen = [
      formatDatumUhrzeit(auszahlung.datum),
      auszahlung.mannschaft || "–",
      auszahlung.schiedsrichter_name || "–",
      euro(auszahlung.betrag, true),
      kostenlosText,
      auszahlung.kommentar || "–",
      status,
    ];
    for (const wert of zellen) {
      const td = document.createElement("td");
      td.textContent = wert;
      tr.appendChild(td);
    }

    const tdAktion = document.createElement("td");
    if (status === "Aktiv") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      btn.textContent = "Stornieren";
      btn.onclick = async () => {
        const ok = await zeigeBestaetigung(
          "Auszahlung stornieren?",
          `Die Auszahlung vom ${formatDatumUhrzeit(auszahlung.datum)} über ${euro(auszahlung.betrag)} wird storniert. Das kann nicht rückgängig gemacht werden.`,
          "Stornieren"
        );
        if (!ok) return;
        const benutzer = session.getAktuellerBenutzer();
        try {
          await repo.schiedsrichterAuszahlungStornieren(auszahlung.id, benutzer.name);
        } catch (exc) {
          zeigeHinweis("Fehler beim Stornieren", exc.message ?? String(exc));
          return;
        }
        renderSchiedsrichter();
      };
      tdAktion.appendChild(btn);
    }
    // Runde 42: Kommentar laesst sich unabhaengig vom Storno-Status
    // bearbeiten - reine Anmerkung, kein Geldbetrag.
    const kommentarBtn = document.createElement("button");
    kommentarBtn.type = "button";
    kommentarBtn.className = "btn";
    kommentarBtn.textContent = "Kommentar bearbeiten";
    kommentarBtn.onclick = async () => {
      const neuerText = await zeigeTextEingabe(
        "Kommentar bearbeiten",
        `Kommentar zur Auszahlung vom ${formatDatumUhrzeit(auszahlung.datum)} über ${euro(auszahlung.betrag)}:`,
        auszahlung.kommentar || ""
      );
      if (neuerText === null) return;
      try {
        await repo.schiedsrichterAuszahlungKommentarSetzen(auszahlung.id, neuerText);
      } catch (exc) {
        zeigeHinweis("Fehler beim Speichern", exc.message ?? String(exc));
        return;
      }
      renderSchiedsrichter();
    };
    tdAktion.appendChild(kommentarBtn);
    tr.appendChild(tdAktion);
    srTabelleBody.appendChild(tr);
  }
}

async function schiedsrichterAuszahlen() {
  const betrag = parseFloat(srBetragFeld.value);
  if (isNaN(betrag) || betrag <= 0) {
    srFehler.textContent = "Bitte einen gültigen Betrag größer als 0 eingeben.";
    return;
  }
  const benutzer = session.getAktuellerBenutzer();
  try {
    await repo.schiedsrichterAuszahlungErfassen(
      session.getAktiveKasse(),
      betrag,
      srMannschaftFeld.value.trim(),
      srNameFeld.value.trim(),
      srKommentarFeld.value.trim(),
      benutzer.name
    );
  } catch (exc) {
    srFehler.textContent = exc.message ?? String(exc);
    return;
  }
  srMannschaftFeld.value = "";
  srNameFeld.value = "";
  srBetragFeld.value = "";
  srKommentarFeld.value = "";
  srFehler.textContent = "";
  renderSchiedsrichter();
}

// Runde 33: Ein-Klick-Ausgabe einer Flasche Wasser (still oder medium) an
// einen Schiedsrichter - kein Formular, sofort gebucht (analog zum
// "Pfand zurückgeben"-Knopf im Reiter "Verkauf"). Bucht eine kostenlose
// Auszahlung (Betrag 0, ein Stück) inkl. automatischer Bestandskorrektur;
// ueber die Uebersichtstabelle wie gewohnt stornierbar.
async function schiedsrichterWasserAusgeben(produktId) {
  srFehler.textContent = "";
  const benutzer = session.getAktuellerBenutzer();
  try {
    await repo.schiedsrichterAuszahlungErfassen(
      session.getAktiveKasse(),
      0,
      "",
      "",
      "",
      benutzer.name,
      produktId,
      1
    );
  } catch (exc) {
    srFehler.textContent = exc.message ?? String(exc);
    return;
  }
  renderSchiedsrichter();
}

// ---------------------------------------------------------------------
// Bargeld-Einzahlungen
// ---------------------------------------------------------------------

async function renderEinzahlungen() {
  const aktiveKasse = session.getAktiveKasse();
  ezKasseName.textContent = KASSE_LABEL[aktiveKasse] ?? aktiveKasse;
  ezFehler.textContent = "";

  const alle = await repo.letzteBargeldEinzahlungen(500);
  const stornierteIds = new Set(alle.filter((e) => e.storno_von).map((e) => e.storno_von));
  const anzeige = alle.filter((e) => e.veranstaltung === aktiveKasse).slice(0, 50);

  ezTabelleBody.innerHTML = "";
  for (const einzahlung of anzeige) {
    const tr = document.createElement("tr");
    let status = "Aktiv";
    if (einzahlung.storno_von) status = "Storno";
    else if (stornierteIds.has(einzahlung.id)) status = "Storniert";
    if (status !== "Aktiv") tr.classList.add("storniert");

    const zellen = [
      formatDatumUhrzeit(einzahlung.datum),
      euro(einzahlung.betrag, true),
      einzahlung.kommentar || "–",
      status,
    ];
    for (const wert of zellen) {
      const td = document.createElement("td");
      td.textContent = wert;
      tr.appendChild(td);
    }

    const tdAktion = document.createElement("td");
    if (status === "Aktiv") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      btn.textContent = "Stornieren";
      btn.onclick = async () => {
        const ok = await zeigeBestaetigung(
          "Einzahlung stornieren?",
          `Die Einzahlung vom ${formatDatumUhrzeit(einzahlung.datum)} über ${euro(einzahlung.betrag)} wird storniert. Das kann nicht rückgängig gemacht werden.`,
          "Stornieren"
        );
        if (!ok) return;
        const benutzer = session.getAktuellerBenutzer();
        try {
          await repo.bargeldEinzahlungStornieren(einzahlung.id, benutzer.name);
        } catch (exc) {
          zeigeHinweis("Fehler beim Stornieren", exc.message ?? String(exc));
          return;
        }
        renderEinzahlungen();
      };
      tdAktion.appendChild(btn);
    }
    tr.appendChild(tdAktion);
    ezTabelleBody.appendChild(tr);
  }
}

async function bargeldEinzahlen() {
  const betrag = parseFloat(ezBetragFeld.value);
  if (isNaN(betrag) || betrag <= 0) {
    ezFehler.textContent = "Bitte einen gültigen Betrag größer als 0 eingeben.";
    return;
  }
  const benutzer = session.getAktuellerBenutzer();
  try {
    await repo.bargeldEinzahlungErfassen(
      session.getAktiveKasse(),
      betrag,
      ezKommentarFeld.value.trim(),
      benutzer.name
    );
  } catch (exc) {
    ezFehler.textContent = exc.message ?? String(exc);
    return;
  }
  ezBetragFeld.value = "";
  ezKommentarFeld.value = "";
  ezFehler.textContent = "";
  renderEinzahlungen();
}

// ---------------------------------------------------------------------
// Sonstige Ausgaben (Runde 27)
// ---------------------------------------------------------------------

async function renderAusgaben() {
  const aktiveKasse = session.getAktiveKasse();
  saKasseName.textContent = KASSE_LABEL[aktiveKasse] ?? aktiveKasse;
  saFehler.textContent = "";

  const alle = await repo.letzteSonstigeAusgaben(500);
  const stornierteIds = new Set(alle.filter((a) => a.storno_von).map((a) => a.storno_von));
  const anzeige = alle.filter((a) => a.veranstaltung === aktiveKasse).slice(0, 50);

  saTabelleBody.innerHTML = "";
  for (const ausgabe of anzeige) {
    const tr = document.createElement("tr");
    let status = "Aktiv";
    if (ausgabe.storno_von) status = "Storno";
    else if (stornierteIds.has(ausgabe.id)) status = "Storniert";
    if (status !== "Aktiv") tr.classList.add("storniert");

    const zellen = [
      formatDatumUhrzeit(ausgabe.datum),
      ausgabe.beschreibung || "–",
      euro(ausgabe.betrag, true),
      status,
    ];
    for (const wert of zellen) {
      const td = document.createElement("td");
      td.textContent = wert;
      tr.appendChild(td);
    }

    const tdAktion = document.createElement("td");
    if (status === "Aktiv") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      btn.textContent = "Stornieren";
      btn.onclick = async () => {
        const ok = await zeigeBestaetigung(
          "Ausgabe stornieren?",
          `Die Ausgabe vom ${formatDatumUhrzeit(ausgabe.datum)} über ${euro(ausgabe.betrag)} wird storniert. Das kann nicht rückgängig gemacht werden.`,
          "Stornieren"
        );
        if (!ok) return;
        const benutzer = session.getAktuellerBenutzer();
        try {
          await repo.sonstigeAusgabeStornieren(ausgabe.id, benutzer.name);
        } catch (exc) {
          zeigeHinweis("Fehler beim Stornieren", exc.message ?? String(exc));
          return;
        }
        renderAusgaben();
      };
      tdAktion.appendChild(btn);
    }
    tr.appendChild(tdAktion);
    saTabelleBody.appendChild(tr);
  }
}

async function ausgabeErfassen() {
  const betrag = parseFloat(saBetragFeld.value);
  if (isNaN(betrag) || betrag <= 0) {
    saFehler.textContent = "Bitte einen gültigen Betrag größer als 0 eingeben.";
    return;
  }
  const benutzer = session.getAktuellerBenutzer();
  try {
    await repo.sonstigeAusgabeErfassen(
      session.getAktiveKasse(),
      betrag,
      saBeschreibungFeld.value.trim(),
      benutzer.name
    );
  } catch (exc) {
    saFehler.textContent = exc.message ?? String(exc);
    return;
  }
  saBetragFeld.value = "";
  saBeschreibungFeld.value = "";
  saFehler.textContent = "";
  renderAusgaben();
}

// ---------------------------------------------------------------------
// Bargeld-Entnahmen (Runde 27)
// ---------------------------------------------------------------------

async function renderEntnahmen() {
  const aktiveKasse = session.getAktiveKasse();
  beKasseName.textContent = KASSE_LABEL[aktiveKasse] ?? aktiveKasse;
  beFehler.textContent = "";

  const alle = await repo.letzteBargeldEntnahmen(500);
  const stornierteIds = new Set(alle.filter((e) => e.storno_von).map((e) => e.storno_von));
  const anzeige = alle.filter((e) => e.veranstaltung === aktiveKasse).slice(0, 50);

  beTabelleBody.innerHTML = "";
  for (const entnahme of anzeige) {
    const tr = document.createElement("tr");
    let status = "Aktiv";
    if (entnahme.storno_von) status = "Storno";
    else if (stornierteIds.has(entnahme.id)) status = "Storniert";
    if (status !== "Aktiv") tr.classList.add("storniert");

    let empfaengerAnzeige = entnahme.empfaenger || "–";
    if (entnahme.kassensturz_id) empfaengerAnzeige += " (aus Kassensturz)";

    const zellen = [
      formatDatumUhrzeit(entnahme.datum),
      empfaengerAnzeige,
      euro(entnahme.betrag, true),
      status,
    ];
    for (const wert of zellen) {
      const td = document.createElement("td");
      td.textContent = wert;
      tr.appendChild(td);
    }

    const tdAktion = document.createElement("td");
    if (status === "Aktiv") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      btn.textContent = "Stornieren";
      btn.onclick = async () => {
        const ok = await zeigeBestaetigung(
          "Entnahme stornieren?",
          `Die Entnahme vom ${formatDatumUhrzeit(entnahme.datum)} über ${euro(entnahme.betrag)} an ${entnahme.empfaenger} wird storniert. Das kann nicht rückgängig gemacht werden.`,
          "Stornieren"
        );
        if (!ok) return;
        const benutzer = session.getAktuellerBenutzer();
        try {
          await repo.bargeldEntnahmeStornieren(entnahme.id, benutzer.name);
        } catch (exc) {
          zeigeHinweis("Fehler beim Stornieren", exc.message ?? String(exc));
          return;
        }
        renderEntnahmen();
      };
      tdAktion.appendChild(btn);
    }
    tr.appendChild(tdAktion);
    beTabelleBody.appendChild(tr);
  }
}

async function entnahmeErfassen() {
  const betrag = parseFloat(beBetragFeld.value);
  if (isNaN(betrag) || betrag <= 0) {
    beFehler.textContent = "Bitte einen gültigen Betrag größer als 0 eingeben.";
    return;
  }
  const benutzer = session.getAktuellerBenutzer();
  try {
    await repo.bargeldEntnahmeErfassen(
      session.getAktiveKasse(),
      betrag,
      beEmpfaengerFeld.value.trim(),
      beKommentarFeld.value.trim(),
      benutzer.name
    );
  } catch (exc) {
    beFehler.textContent = exc.message ?? String(exc);
    return;
  }
  beBetragFeld.value = "";
  beEmpfaengerFeld.value = "";
  beKommentarFeld.value = "";
  beFehler.textContent = "";
  renderEntnahmen();
}

// ---------------------------------------------------------------------
// Nachbestellungen (Produkte + Lieferanten-Pfand) - nur fuer
// Administratoren. Anders als Bargeld-Einzahlungen nicht an eine Kasse
// gebunden (siehe repo.js). Die Produkt-Positionen (nachbestellungPositionen,
// Zustand oben) werden client-seitig gesammelt - genau wie der Warenkorb
// beim Verkauf - und erst beim Bestaetigen (nachbestellungErfassen) auf
// einmal an repo.lieferantenPfandErfassen uebergeben.
// ---------------------------------------------------------------------

function renderNachbestellungProduktAuswahl() {
  const bisherigeAuswahl = npProduktAuswahl.value;
  npProduktAuswahl.innerHTML = "";
  for (const p of produkteCache) {
    const option = document.createElement("option");
    option.value = p.id;
    option.textContent = `${KATEGORIE_LABEL[p.kategorie] ?? p.kategorie}: ${p.name}`;
    npProduktAuswahl.appendChild(option);
  }
  if ([...npProduktAuswahl.options].some((o) => o.value === bisherigeAuswahl)) {
    npProduktAuswahl.value = bisherigeAuswahl;
  }
}

function renderNachbestellungPositionenListe() {
  npPositionenListe.innerHTML = "";
  for (const position of nachbestellungPositionen) {
    const div = document.createElement("div");
    div.className = "warenkorb-zeile";

    const pfandTeile = [];
    if (position.pfandBezahlt) {
      pfandTeile.push(`${euro(position.pfandBezahlt * position.menge)} Pfand bezahlt`);
    }
    if (position.pfandErhalten) {
      pfandTeile.push(`${euro(position.pfandErhalten * position.menge)} Pfand zurückerhalten`);
    }
    const name = document.createElement("div");
    name.className = "name";
    name.textContent =
      `${position.name} × ${position.menge}` +
      (position.einzelpreis != null
        ? ` (${euro(position.preisBrutto)}/Stück = ${euro(position.preisBrutto * position.menge)})`
        : "") +
      (pfandTeile.length ? ` (${pfandTeile.join(", ")})` : "");
    div.appendChild(name);

    const entfernenBtn = document.createElement("button");
    entfernenBtn.type = "button";
    entfernenBtn.className = "mini";
    entfernenBtn.textContent = "✕";
    entfernenBtn.onclick = () => {
      nachbestellungPositionen = nachbestellungPositionen.filter((p) => p !== position);
      renderNachbestellungPositionenListe();
    };
    div.appendChild(entfernenBtn);

    npPositionenListe.appendChild(div);
  }

  // Runde 45: Gesamtsumme als Kontrollzeile - macht einen als "pro Stück"
  // eingetippten Rechnungsbetrag sofort sichtbar, statt ihn erst Wochen
  // spaeter in der Auswertung auffallen zu lassen.
  if (nachbestellungPositionen.length) {
    const summe = nachbestellungPositionen.reduce(
      (s, p) => s + (p.preisBrutto || 0) * p.menge,
      0
    );
    const summeZeile = document.createElement("p");
    summeZeile.className = "hinweis";
    summeZeile.innerHTML = `<b>Warenwert gesamt: ${euro(summe)}</b> (inkl. MwSt., ohne Pfand)`;
    npPositionenListe.appendChild(summeZeile);
  }
}

function nachbestellungPositionHinzufuegen() {
  const produktId = npProduktAuswahl.value;
  const produkt = produkteCache.find((p) => p.id === produktId);
  if (!produkt) return;
  const menge = Math.max(1, Math.round(parseFloat(npProduktMengeFeld.value) || 1));
  // Runde 45: der eingegebene Betrag kann laut Auswahl entweder pro Stueck
  // oder fuer die gesamte Position gemeint sein - gespeichert wird immer
  // der Preis pro Stueck. Ohne diese Umschaltung wurde ein eingetippter
  // Rechnungsbetrag mit der Menge multipliziert (120 Flaschen x 90,34 € =
  // 10.840,80 € statt 107,50 €).
  const eingabeBetrag = parseFloat(npProduktPreisFeld.value) || 0;
  const preisBrutto =
    npProduktPreisartAuswahl.value === "gesamt" && eingabeBetrag > 0
      ? eingabeBetrag / menge
      : eingabeBetrag;
  const einzelpreis = preisBrutto > 0 ? nettoPreisGenau(preisBrutto, produkt.mwst_satz) : null;
  const mwstSatz = preisBrutto > 0 ? produkt.mwst_satz : null;
  // Pfand pro Stueck (Runde 32) - wie beim Preis wird nur der Wert pro
  // Stueck gespeichert, die Hochrechnung mit der Menge passiert erst beim
  // Anzeigen bzw. beim Speichern (siehe nachbestellungErfassen).
  const pfandBezahlt = parseFloat(npProduktPfandBezahltFeld.value) || 0;
  const pfandErhalten = parseFloat(npProduktPfandErhaltenFeld.value) || 0;
  nachbestellungPositionen.push({
    produktId,
    name: produkt.name,
    menge,
    einzelpreis,
    mwstSatz,
    preisBrutto,
    pfandBezahlt: pfandBezahlt || null,
    pfandErhalten: pfandErhalten || null,
  });
  npProduktMengeFeld.value = "1";
  npProduktPreisFeld.value = "";
  npProduktPfandBezahltFeld.value = "";
  npProduktPfandErhaltenFeld.value = "";
  renderNachbestellungPositionenListe();
}

// Kurztext einer Nachbestellung-Produktposition fuer die Uebersichtstabelle,
// z.B. "Fassbrause Zitrone 0,33l × 5 (2,00 € Pfand bezahlt)" - zeigt das
// Pfand je Produkt an, statt nur den Gesamtbetrag in den Spalten
// "Pfand bezahlt"/"Pfand zurückerhalten" (Runde 32).
function nachbestellungPositionText(p) {
  const produkt = produkteCache.find((pr) => pr.id === p.produkt_id);
  let text = `${produkt ? produkt.name : "?"} × ${p.menge}`;
  const pfandTeile = [];
  const pfandBezahlt = (p.pfand_bezahlt || 0) * p.menge;
  const pfandErhalten = (p.pfand_erhalten || 0) * p.menge;
  if (pfandBezahlt) pfandTeile.push(`${euro(pfandBezahlt)} Pfand bezahlt`);
  if (pfandErhalten) pfandTeile.push(`${euro(pfandErhalten)} Pfand zurückerhalten`);
  if (pfandTeile.length) text += ` (${pfandTeile.join(", ")})`;
  return text;
}

async function renderNachbestellungen() {
  npFehler.textContent = "";
  renderNachbestellungProduktAuswahl();
  renderNachbestellungPositionenListe();

  const alle = await repo.letzteLieferantenPfandEintraege(500);
  const stornierteIds = new Set(alle.filter((e) => e.storno_von).map((e) => e.storno_von));
  const anzeige = alle.slice(0, 50);

  npTabelleBody.innerHTML = "";
  for (const eintrag of anzeige) {
    const tr = document.createElement("tr");
    let status = "Aktiv";
    if (eintrag.storno_von) status = "Storno";
    else if (stornierteIds.has(eintrag.id)) status = "Storniert";
    if (status !== "Aktiv") tr.classList.add("storniert");

    const positionen = await repo.nachbestellungPositionen(eintrag.id);
    const produkteText = positionen.length
      ? positionen.map((p) => nachbestellungPositionText(p)).join(", ")
      : "—";

    const zellen = [
      formatDatumUhrzeit(eintrag.datum),
      produkteText,
      euro(eintrag.bezahlt),
      euro(eintrag.erhalten),
      status,
    ];
    for (const wert of zellen) {
      const td = document.createElement("td");
      td.textContent = wert;
      tr.appendChild(td);
    }

    const tdAktion = document.createElement("td");
    if (status === "Aktiv") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      btn.textContent = "Stornieren";
      btn.onclick = async () => {
        const ok = await zeigeBestaetigung(
          "Nachbestellung stornieren?",
          `Die Nachbestellung vom ${formatDatumUhrzeit(eintrag.datum)} (bezahlt: ${euro(eintrag.bezahlt)}, ` +
            `zurückerhalten: ${euro(eintrag.erhalten)}) wird storniert, etwaige Produkt-Positionen werden ` +
            "automatisch zurückgebucht. Das kann nicht rückgängig gemacht werden.",
          "Stornieren"
        );
        if (!ok) return;
        const benutzer = session.getAktuellerBenutzer();
        try {
          await repo.lieferantenPfandStornieren(eintrag.id, benutzer.name);
        } catch (exc) {
          zeigeHinweis("Fehler beim Stornieren", exc.message ?? String(exc));
          return;
        }
        renderNachbestellungen();
      };
      tdAktion.appendChild(btn);
    }
    tr.appendChild(tdAktion);
    npTabelleBody.appendChild(tr);
  }
}

async function nachbestellungErfassen() {
  // bezahlt/erhalten = "Sonstiges Pfand" (ohne Produktbezug) PLUS die Summe
  // des Pfands aller Produkt-Positionen (Pfand/Stück * Menge) - der an
  // repo.lieferantenPfandErfassen uebergebene Gesamtbetrag bleibt dadurch
  // vollstaendig, unabhaengig davon, ob das Pfand pro Produkt oder als ein
  // Gesamtbetrag erfasst wurde (Runde 32, analog zur Windows-App).
  let bezahlt = parseFloat(npBezahltFeld.value) || 0;
  let erhalten = parseFloat(npErhaltenFeld.value) || 0;
  for (const p of nachbestellungPositionen) {
    bezahlt += (p.pfandBezahlt || 0) * p.menge;
    erhalten += (p.pfandErhalten || 0) * p.menge;
  }
  const benutzer = session.getAktuellerBenutzer();
  try {
    await repo.lieferantenPfandErfassen(
      bezahlt,
      erhalten,
      npKommentarFeld.value.trim(),
      benutzer.name,
      nachbestellungPositionen.map((p) => ({
        produktId: p.produktId,
        menge: p.menge,
        einzelpreis: p.einzelpreis,
        mwstSatz: p.mwstSatz,
        pfandBezahlt: p.pfandBezahlt,
        pfandErhalten: p.pfandErhalten,
      }))
    );
  } catch (exc) {
    npFehler.textContent = exc.message ?? String(exc);
    return;
  }
  npBezahltFeld.value = "";
  npErhaltenFeld.value = "";
  npKommentarFeld.value = "";
  npFehler.textContent = "";
  nachbestellungPositionen = [];
  renderNachbestellungen();
}

// ---------------------------------------------------------------------
// Termine (Heimspiele eintragen + Trainingsplan anzeigen)
// ---------------------------------------------------------------------

function fuelleTeamAuswahl() {
  tsTeamAuswahl.innerHTML = "";
  for (const eintrag of TEAMS) {
    const option = document.createElement("option");
    option.value = eintrag.team;
    option.dataset.kasse = eintrag.kasse;
    option.textContent = `${eintrag.team} (${KASSE_LABEL[eintrag.kasse]})`;
    tsTeamAuswahl.appendChild(option);
  }
}

async function renderTermine() {
  tsFehler.textContent = "";

  const heimspiele = await repo.listeKommendeHeimspiele(60);
  tsHeimspieleBody.innerHTML = "";
  for (const spiel of heimspiele) {
    const tr = document.createElement("tr");
    const zellen = [
      spiel.datum.split("-").reverse().join("."),
      spiel.start_uhrzeit,
      spiel.team,
      KASSE_LABEL[spiel.kasse] ?? spiel.kasse,
      spiel.gegner || "–",
    ];
    for (const wert of zellen) {
      const td = document.createElement("td");
      td.textContent = wert;
      tr.appendChild(td);
    }
    tsHeimspieleBody.appendChild(tr);
  }

  const trainingszeiten = await repo.listeTrainingszeiten();
  tsTrainingsplanBody.innerHTML = "";
  for (const training of trainingszeiten) {
    const tr = document.createElement("tr");
    const zellen = [
      WOCHENTAG_LABEL[training.wochentag] ?? training.wochentag,
      `${training.start_uhrzeit}–${training.ende_uhrzeit}`,
      training.team,
      KASSE_LABEL[training.kasse] ?? training.kasse,
    ];
    for (const wert of zellen) {
      const td = document.createElement("td");
      td.textContent = wert;
      tr.appendChild(td);
    }
    tsTrainingsplanBody.appendChild(tr);
  }
}

async function heimspielEintragen() {
  const option = tsTeamAuswahl.selectedOptions[0];
  if (!option || !tsDatumFeld.value || !tsStartFeld.value) {
    tsFehler.textContent = "Bitte Team, Datum und Anstoßzeit angeben.";
    return;
  }
  const benutzer = session.getAktuellerBenutzer();
  try {
    await repo.heimspielEintragen(
      option.value,
      option.dataset.kasse,
      tsDatumFeld.value,
      tsStartFeld.value,
      tsEndeFeld.value || null,
      tsGegnerFeld.value.trim(),
      null,
      benutzer.name
    );
  } catch (exc) {
    tsFehler.textContent = exc.message ?? String(exc);
    return;
  }
  tsDatumFeld.value = "";
  tsStartFeld.value = "";
  tsEndeFeld.value = "";
  tsGegnerFeld.value = "";
  tsFehler.textContent = "";
  renderTermine();
  pruefeKassenvorschlag();
}

// ---------------------------------------------------------------------
// Feedback (Funktions-/Produktwuensche) - offenes Ideen-Board, alle sehen
// alle Eintraege. Nur Administrator:innen sehen den "Bearbeiten"-Knopf je
// Zeile (siehe FeedbackStatusDialog in der Windows-App, Pendant hier ist
// #feedback-status-overlay).
// ---------------------------------------------------------------------

let feedbackBearbeitenId = null;

async function renderFeedback() {
  const benutzer = session.getAktuellerBenutzer();
  const eintraege = await repo.listeFeedback();
  fbTabelleBody.innerHTML = "";
  for (const eintrag of eintraege) {
    const tr = document.createElement("tr");
    const zellen = [
      (eintrag.erstellt_am || "").slice(0, 10).split("-").reverse().join("."),
      eintrag.kategorie,
      eintrag.text,
      eintrag.ersteller || "–",
      FEEDBACK_STATUS_LABEL[eintrag.status] ?? eintrag.status,
      eintrag.antwort || "–",
    ];
    zellen.forEach((wert, index) => {
      const td = document.createElement("td");
      td.textContent = wert;
      if (index === 4) td.className = `fb-status-${eintrag.status}`;
      tr.appendChild(td);
    });
    const aktionTd = document.createElement("td");
    if (benutzer?.ist_admin) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      btn.textContent = "Bearbeiten";
      btn.onclick = () => feedbackStatusOeffnen(eintrag);
      aktionTd.appendChild(btn);
    }
    tr.appendChild(aktionTd);
    fbTabelleBody.appendChild(tr);
  }
}

async function feedbackEinreichen() {
  const benutzer = session.getAktuellerBenutzer();
  try {
    await repo.feedbackEinreichen(fbKategorieAuswahl.value, fbTextFeld.value, benutzer.name);
  } catch (exc) {
    fbFehler.textContent = exc.message ?? String(exc);
    return;
  }
  fbTextFeld.value = "";
  fbFehler.textContent = "";
  renderFeedback();
}

function feedbackStatusOeffnen(eintrag) {
  feedbackBearbeitenId = eintrag.id;
  fbsWunschAnzeige.textContent = `${eintrag.kategorie} von ${eintrag.ersteller || "–"}: ${eintrag.text}`;
  fbsStatusAuswahl.value = eintrag.status;
  fbsAntwortFeld.value = eintrag.antwort || "";
  feedbackStatusOverlay.classList.remove("versteckt");
}

function feedbackStatusSchliessen() {
  feedbackStatusOverlay.classList.add("versteckt");
  feedbackBearbeitenId = null;
}

async function feedbackStatusSpeichern() {
  if (!feedbackBearbeitenId) return;
  const benutzer = session.getAktuellerBenutzer();
  await repo.feedbackStatusSetzen(
    feedbackBearbeitenId,
    fbsStatusAuswahl.value,
    fbsAntwortFeld.value,
    benutzer.name
  );
  feedbackStatusSchliessen();
  renderFeedback();
}

// ---------------------------------------------------------------------
// Kassenvorschlag - schlaegt anhand von Trainingsplan/Heimspielen die
// vermutlich richtige Kasse vor, schaltet aber NIE selbststaendig um
// (siehe repo.empfohleneKasse). Wird beim Anmelden sowie periodisch
// waehrend der Nutzung erneut geprueft, damit auch ein Wechsel mitten in
// der Anmeldung (z.B. Anstoss) zeitnah bemerkt wird.
// ---------------------------------------------------------------------

async function pruefeKassenvorschlag() {
  if (!session.istAngemeldet()) return;
  const vorschlag = await repo.empfohleneKasse();
  if (!vorschlag || vorschlag.kasse === session.getAktiveKasse() || abgelehnteKassenvorschlaege.has(vorschlag.schluessel)) {
    kassenvorschlagBanner.classList.add("versteckt");
    return;
  }
  kassenvorschlagText.textContent = `Jetzt vermutlich: ${KASSE_LABEL[vorschlag.kasse] ?? vorschlag.kasse} (${vorschlag.grund}) – übernehmen?`;
  kassenvorschlagBanner.dataset.kasse = vorschlag.kasse;
  kassenvorschlagBanner.dataset.schluessel = vorschlag.schluessel;
  kassenvorschlagBanner.classList.remove("versteckt");
}

function kassenvorschlagUebernehmen() {
  const kasse = kassenvorschlagBanner.dataset.kasse;
  session.setAktiveKasse(kasse);
  kasseAuswahl.value = kasse;
  kassenvorschlagBanner.classList.add("versteckt");
  aktualisiereAktuelleAnsichtNachKassenwechsel();
}

function kassenvorschlagVerwerfen() {
  abgelehnteKassenvorschlaege.add(kassenvorschlagBanner.dataset.schluessel);
  kassenvorschlagBanner.classList.add("versteckt");
}

function aktualisiereAktuelleAnsichtNachKassenwechsel() {
  if (aktuelleAnsicht === "verkauf") renderProduktGrid();
  if (aktuelleAnsicht === "storno") renderStornoListe();
  if (aktuelleAnsicht === "kassensturz") renderKassensturz();
  if (aktuelleAnsicht === "schiedsrichter") renderSchiedsrichter();
  if (aktuelleAnsicht === "einzahlen") renderEinzahlungen();
  if (aktuelleAnsicht === "ausgaben") renderAusgaben();
  if (aktuelleAnsicht === "entnahmen") renderEntnahmen();
}

// ---------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------

function formatDatumUhrzeit(iso) {
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatUhrzeit(iso) {
  try {
    return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "?";
  }
}

// ---------------------------------------------------------------------
// Drucken ueber den Browser (Runde 43) - ersetzt Qt's
// QPrintPreviewDialog vom Rechner (siehe kiosk/ui/druck.py): oeffnet ein
// neues Fenster/Tab mit dem uebergebenen HTML-Inhalt (Klasse "druck-seite",
// siehe css/app.css) und ruft sofort den Browser-eigenen Druckdialog auf.
// Wird das Popup vom Browser blockiert, bleibt zumindest ein Hinweis statt
// eines stillen Fehlschlags.
// ---------------------------------------------------------------------

function druckenOeffnen(titel, innerHtml) {
  const fenster = window.open("", "_blank");
  if (!fenster) {
    zeigeHinweis(
      "Drucken nicht möglich",
      "Das Druckfenster wurde vom Browser blockiert. Bitte Popups für diese Seite erlauben und erneut versuchen."
    );
    return;
  }
  fenster.document.write(
    `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${titel}</title>` +
      `<link rel="stylesheet" href="css/app.css"></head>` +
      `<body class="druck-seite">${innerHtml}</body></html>`
  );
  fenster.document.close();
  fenster.focus();
  // Kurze Verzoegerung, damit das Stylesheet sicher geladen ist, bevor der
  // Druckdialog erscheint - ohne diese kann der erste Ausdruck ungestylt sein.
  setTimeout(() => fenster.print(), 300);
}

// ---------------------------------------------------------------------
// Warenwirtschaft: Bestand, Wareneingang/Korrektur, Abschreibungen,
// Inventur (Runde 43) - Pendant zu den entsprechenden Bereichen der
// Windows-App (kiosk/ui/main_window.py, Reiter "Lager"). Fuer alle Helfer
// sichtbar (siehe nachAnmeldungAnzeigen), wie am Rechner.
// ---------------------------------------------------------------------

function wwProduktAuswahlFuellen(select) {
  const aktuellerWert = select.value;
  select.innerHTML = "";
  for (const produkt of produkteCache) {
    const option = document.createElement("option");
    option.value = produkt.id;
    option.textContent = `${produkt.name} (${KATEGORIE_LABEL[produkt.kategorie] ?? produkt.kategorie})`;
    select.appendChild(option);
  }
  if (aktuellerWert && produkteCache.some((p) => p.id === aktuellerWert)) {
    select.value = aktuellerWert;
  }
}

function wwModusUmschalten(modus) {
  wwModus = modus;
  wwModusEingangBtn.classList.toggle("aktiv", modus === "Wareneingang");
  wwModusKorrekturBtn.classList.toggle("aktiv", modus === "Korrektur");
  wwMengeLabel.innerHTML = modus === "Wareneingang"
    ? "<b>Menge (Stück, z.B. 24 für einen Kasten):</b>"
    : "<b>Menge (positiv = Bestand erhöhen, negativ = senken):</b>";
  const zeigePreisfelder = modus === "Wareneingang";
  wwEinzelpreisLabel.style.display = zeigePreisfelder ? "" : "none";
  wwEinzelpreisFeld.style.display = zeigePreisfelder ? "" : "none";
  wwMwstLabel.style.display = zeigePreisfelder ? "" : "none";
  wwMwstAuswahl.style.display = zeigePreisfelder ? "" : "none";
  wwBelegLabel.style.display = zeigePreisfelder ? "" : "none";
  wwBelegFeld.style.display = zeigePreisfelder ? "" : "none";
}

async function renderWarenwirtschaft() {
  wwProduktAuswahlFuellen(wwProduktAuswahl);
  wwProduktAuswahlFuellen(wwAbschProduktAuswahl);

  if (!wwAbschGrundAuswahl.options.length) {
    for (const grund of repo.ABSCHREIBUNG_GRUENDE) {
      const option = document.createElement("option");
      option.value = grund;
      option.textContent = grund;
      wwAbschGrundAuswahl.appendChild(option);
    }
  }

  const bericht = await repo.warenbestandBericht();
  const alleProdukte = await repo.listeProdukte(false);
  const preisJeId = Object.fromEntries(alleProdukte.map((p) => [p.id, p.einkaufspreis || 0]));

  wwBestandTabelleBody.innerHTML = "";
  for (const zeile of bericht) {
    const warenwert = rund2(zeile.bestand * (preisJeId[zeile.produkt_id] || 0));
    const tr = document.createElement("tr");
    for (const wert of [
      zeile.name,
      KATEGORIE_LABEL[zeile.kategorie] ?? zeile.kategorie,
      String(zeile.bestand),
      euro(warenwert),
    ]) {
      const td = document.createElement("td");
      td.textContent = wert;
      tr.appendChild(td);
    }
    wwBestandTabelleBody.appendChild(tr);
  }

  await renderAbschreibungen();
}

async function bestandDrucken() {
  const bericht = await repo.warenbestandBericht();
  const alleProdukte = await repo.listeProdukte(false);
  const preisJeId = Object.fromEntries(alleProdukte.map((p) => [p.id, p.einkaufspreis || 0]));
  let gesamtwert = 0;
  const zeilenHtml = bericht
    .map((z) => {
      const wert = rund2(z.bestand * (preisJeId[z.produkt_id] || 0));
      gesamtwert = rund2(gesamtwert + wert);
      return `<tr><td>${z.name}</td><td>${KATEGORIE_LABEL[z.kategorie] ?? z.kategorie}</td><td>${z.bestand}</td><td>${euro(wert)}</td></tr>`;
    })
    .join("");
  const html = `
    <h1>SG Köln-Worringen – Warenbestand</h1>
    <p>Stand: ${formatDatumUhrzeit(new Date().toISOString())}</p>
    <table>
      <thead><tr><th>Produkt</th><th>Kategorie</th><th>Bestand</th><th>Warenwert</th></tr></thead>
      <tbody>${zeilenHtml}
      <tr class="gesamt-zeile"><td colspan="3">Gesamt</td><td>${euro(gesamtwert)}</td></tr>
      </tbody>
    </table>`;
  druckenOeffnen("Warenbestand", html);
}

async function renderAbschreibungen() {
  const alle = await repo.letzteAbschreibungen(100);
  const stornierteIds = new Set(alle.filter((a) => a.storno_von).map((a) => a.storno_von));
  wwAbschTabelleBody.innerHTML = "";
  for (const absch of alle) {
    const tr = document.createElement("tr");
    let status = "Aktiv";
    if (absch.storno_von) status = "Storno";
    else if (stornierteIds.has(absch.id)) status = "Storniert";
    if (status !== "Aktiv") tr.classList.add("storniert");

    for (const wert of [
      formatDatumUhrzeit(absch.datum),
      absch.produkt_name,
      String(Math.abs(absch.menge)),
      absch.abschreibung_grund || "–",
      absch.kommentar || "–",
      status,
    ]) {
      const td = document.createElement("td");
      td.textContent = wert;
      tr.appendChild(td);
    }

    const tdAktion = document.createElement("td");
    if (status === "Aktiv") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      btn.textContent = "Stornieren";
      btn.onclick = async () => {
        const ok = await zeigeBestaetigung(
          "Abschreibung stornieren?",
          `Die Abschreibung von ${Math.abs(absch.menge)} × „${absch.produkt_name}“ (${absch.abschreibung_grund}) wird storniert. Das kann nicht rückgängig gemacht werden.`,
          "Stornieren"
        );
        if (!ok) return;
        const benutzer = session.getAktuellerBenutzer();
        try {
          await repo.abschreibungStornieren(absch.id, benutzer.name);
        } catch (exc) {
          zeigeHinweis("Fehler beim Stornieren", exc.message ?? String(exc));
          return;
        }
        renderWarenwirtschaft();
      };
      tdAktion.appendChild(btn);
    }
    tr.appendChild(tdAktion);
    wwAbschTabelleBody.appendChild(tr);
  }
}

async function wareneingangErfassen() {
  wwFehler.textContent = "";
  const produktId = wwProduktAuswahl.value;
  const menge = parseInt(wwMengeFeld.value, 10);
  if (!produktId) {
    wwFehler.textContent = "Bitte ein Produkt auswählen.";
    return;
  }
  if (isNaN(menge) || menge === 0) {
    wwFehler.textContent = "Bitte eine gültige Menge ungleich 0 eingeben.";
    return;
  }
  if (wwModus === "Wareneingang" && menge < 0) {
    wwFehler.textContent = "Beim Wareneingang muss die Menge größer als 0 sein.";
    return;
  }
  const einzelpreisWert = wwEinzelpreisFeld.value.trim();
  const einzelpreis = wwModus === "Wareneingang" && einzelpreisWert !== "" ? parseFloat(einzelpreisWert) : null;
  const mwstWert = wwMwstAuswahl.value;
  const mwstSatz = wwModus === "Wareneingang" && mwstWert !== "" ? parseFloat(mwstWert) : null;

  let belegPfad = null;
  const belegDatei = wwModus === "Wareneingang" ? wwBelegFeld.files[0] : null;
  if (belegDatei) {
    try {
      belegPfad = await belegHochladen(belegDatei);
    } catch (exc) {
      zeigeHinweis(
        "Beleg-Foto nicht hochgeladen",
        "Der Wareneingang wird trotzdem gebucht, aber ohne Beleg-Foto (vermutlich fehlt gerade eine Internetverbindung): " +
          (exc.message ?? String(exc))
      );
    }
  }

  const benutzer = session.getAktuellerBenutzer();
  const gid = await geraetId();
  try {
    await repo.lagerbewegungErfassen(
      produktId,
      wwModus,
      wwModus === "Wareneingang" ? Math.abs(menge) : menge,
      wwKommentarFeld.value.trim() || null,
      benutzer.name,
      gid,
      einzelpreis,
      mwstSatz,
      belegPfad
    );
  } catch (exc) {
    wwFehler.textContent = exc.message ?? String(exc);
    return;
  }
  wwMengeFeld.value = "";
  wwEinzelpreisFeld.value = "";
  wwMwstAuswahl.value = "";
  wwBelegFeld.value = "";
  wwKommentarFeld.value = "";
  renderWarenwirtschaft();
}

async function abschreibungErfassenHandler() {
  wwAbschFehler.textContent = "";
  const produktId = wwAbschProduktAuswahl.value;
  const menge = parseInt(wwAbschMengeFeld.value, 10);
  const grund = wwAbschGrundAuswahl.value;
  if (!produktId) {
    wwAbschFehler.textContent = "Bitte ein Produkt auswählen.";
    return;
  }
  if (isNaN(menge) || menge <= 0) {
    wwAbschFehler.textContent = "Bitte eine Menge größer als 0 eingeben.";
    return;
  }
  const benutzer = session.getAktuellerBenutzer();
  try {
    await repo.abschreibungErfassen(
      produktId, menge, grund, wwAbschKommentarFeld.value.trim() || null, benutzer.name
    );
  } catch (exc) {
    wwAbschFehler.textContent = exc.message ?? String(exc);
    return;
  }
  wwAbschMengeFeld.value = "";
  wwAbschKommentarFeld.value = "";
  renderWarenwirtschaft();
}

function inventurOeffnen() {
  inventurFehler.textContent = "";
  inventurKommentarFeld.value = "";
  inventurListe.innerHTML = "";
  for (const produkt of produkteCache) {
    const zeile = document.createElement("div");
    zeile.style.display = "flex";
    zeile.style.alignItems = "center";
    zeile.style.gap = "8px";
    zeile.style.marginBottom = "6px";
    const label = document.createElement("span");
    label.style.flex = "1";
    label.textContent = produkt.name;
    const feld = document.createElement("input");
    feld.type = "number";
    feld.inputMode = "numeric";
    feld.step = "1";
    feld.className = "betrag";
    feld.style.width = "100px";
    feld.style.margin = "0";
    feld.placeholder = "unverändert";
    feld.dataset.produktId = produkt.id;
    zeile.appendChild(label);
    zeile.appendChild(feld);
    inventurListe.appendChild(zeile);
  }
  inventurOverlay.classList.remove("versteckt");
}

function inventurSchliessen() {
  inventurOverlay.classList.add("versteckt");
}

async function inventurSpeichern() {
  inventurFehler.textContent = "";
  const zaehlungen = {};
  for (const feld of inventurListe.querySelectorAll("input")) {
    if (feld.value.trim() === "") continue;
    const wert = parseInt(feld.value, 10);
    if (isNaN(wert)) continue;
    zaehlungen[feld.dataset.produktId] = wert;
  }
  if (!Object.keys(zaehlungen).length) {
    inventurFehler.textContent = "Bitte mindestens ein Produkt zählen.";
    return;
  }
  const benutzer = session.getAktuellerBenutzer();
  let ergebnis;
  try {
    ergebnis = await repo.inventurDurchfuehren(zaehlungen, inventurKommentarFeld.value.trim(), benutzer.name);
  } catch (exc) {
    inventurFehler.textContent = exc.message ?? String(exc);
    return;
  }
  inventurSchliessen();
  const abweichungen = ergebnis.filter((e) => e.differenz !== 0);
  zeigeHinweis(
    "Inventur gespeichert",
    abweichungen.length
      ? `${abweichungen.length} Produkt(e) mit Abweichung wurden korrigiert.`
      : "Keine Abweichungen gefunden – alle gezählten Bestände stimmten bereits."
  );
  renderWarenwirtschaft();
}

// ---------------------------------------------------------------------
// Auswertung / Monatsabrechnung (Runde 43, Gewinn-Berechnung ab Runde 44
// ueber anteiligen Wareneinkauf - siehe js/repo.js auswertungJeKasse()/
// monatsabrechnung()) - Pendant zu repository.auswertung_je_kasse/
// monatsabrechnung. Nur fuer Administratoren sichtbar (siehe
// nachAnmeldungAnzeigen).
// ---------------------------------------------------------------------

async function renderAuswertung() {
  const kennzahlen = await repo.auswertungJeKasse();
  auKasseKennzahlen.innerHTML = "";
  for (const kasse of VERANSTALTUNGEN) {
    const k = kennzahlen[kasse];
    const karte = document.createElement("div");
    karte.className = "karte";
    karte.innerHTML = `
      <h2 style="margin-top:0; color:var(--blau-dunkel);">${KASSE_LABEL[kasse] ?? kasse}</h2>
      <div class="kennzahl-zeile"><span>Umsatz (brutto)</span><span>${euro(k.erloes)}</span></div>
      <div class="kennzahl-zeile"><span>MwSt. 7 %</span><span>${euro(k.mwst_7)}</span></div>
      <div class="kennzahl-zeile"><span>MwSt. 19 %</span><span>${euro(k.mwst_19)}</span></div>
      <div class="kennzahl-zeile"><span>Offenes Pfand</span><span>${euro(k.pfand)}</span></div>
      <div class="kennzahl-zeile gesamt"><span>Gewinn</span><span>${euro(k.gewinn)}</span></div>
      <div class="kennzahl-zeile" title="Einkaufswert der tatsächlich verkauften Ware (verkaufte Menge × tatsächlich gezahltem Einkaufspreis pro Stück). Ist bereits im Gewinn oben abgezogen. Noch nicht verkaufte Ware zählt hier nicht mit."><span>Wareneinsatz (verkaufte Ware)</span><span>${euro(k.wareneinsatz)}</span></div>
    `;
    auKasseKennzahlen.appendChild(karte);
  }

  // Runde 45: Geldfluss-Sicht als Ergaenzung zum Gewinn - was insgesamt
  // fuer Ware bezahlt wurde und wie viel davon noch als Ware im Kiosk
  // liegt. Ohne diese beiden Zahlen wirkt eine grosse Nachbestellung wie
  // ein Verlust (genau die Rueckmeldung, die zu dieser Umstellung gefuehrt
  // hat).
  const wareneinkaufGesamtBetrag = await repo.wareneinkaufGesamt();
  const lagerwert = await repo.lagerwertGesamt();
  const lagerKarte = document.createElement("div");
  lagerKarte.className = "karte";
  lagerKarte.innerHTML = `
      <h2 style="margin-top:0; color:var(--blau-dunkel);">Wareneinkauf &amp; Lager</h2>
      <div class="kennzahl-zeile"><span>Wareneinkauf gesamt (bezahlt, netto)</span><span>${euro(wareneinkaufGesamtBetrag)}</span></div>
      <div class="kennzahl-zeile"><span>davon noch als Ware im Lager</span><span>${euro(lagerwert)}</span></div>
      <p class="hinweis">Der Lagerwert mindert den Gewinn erst, wenn die Ware verkauft ist – eine große Nachbestellung ist deshalb kein Verlust.</p>
    `;
  auKasseKennzahlen.appendChild(lagerKarte);

  if (!auMonatMonatAuswahl.options.length) {
    for (let m = 1; m <= 12; m++) {
      const option = document.createElement("option");
      option.value = String(m);
      option.textContent = String(m).padStart(2, "0");
      auMonatMonatAuswahl.appendChild(option);
    }
    const heute = new Date();
    auMonatJahrFeld.value = String(heute.getFullYear());
    auMonatMonatAuswahl.value = String(heute.getMonth() + 1);
  }

  await renderPfandGewinnVerbuchungen();
}

async function renderPfandGewinnVerbuchungen() {
  const alle = await repo.letztePfandGewinnVerbuchungen(50);
  const stornierteIds = new Set(alle.filter((v) => v.storno_von).map((v) => v.storno_von));
  auPfandTabelleBody.innerHTML = "";
  for (const verbuchung of alle) {
    const tr = document.createElement("tr");
    let status = "Aktiv";
    if (verbuchung.storno_von) status = "Storno";
    else if (stornierteIds.has(verbuchung.id)) status = "Storniert";
    if (status !== "Aktiv") tr.classList.add("storniert");

    for (const wert of [
      formatDatumUhrzeit(verbuchung.datum),
      KASSE_LABEL[verbuchung.veranstaltung] ?? verbuchung.veranstaltung,
      euro(verbuchung.betrag, true),
      verbuchung.kommentar || "–",
      status,
    ]) {
      const td = document.createElement("td");
      td.textContent = wert;
      tr.appendChild(td);
    }

    const tdAktion = document.createElement("td");
    if (status === "Aktiv") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      btn.textContent = "Stornieren";
      btn.onclick = async () => {
        const ok = await zeigeBestaetigung(
          "Verbuchung stornieren?",
          `Die Pfand-Gewinn-Verbuchung über ${euro(verbuchung.betrag)} wird storniert.`,
          "Stornieren"
        );
        if (!ok) return;
        const benutzer = session.getAktuellerBenutzer();
        try {
          await repo.pfandGewinnStornieren(verbuchung.id, benutzer.name);
        } catch (exc) {
          zeigeHinweis("Fehler beim Stornieren", exc.message ?? String(exc));
          return;
        }
        renderAuswertung();
      };
      tdAktion.appendChild(btn);
    }
    tr.appendChild(tdAktion);
    auPfandTabelleBody.appendChild(tr);
  }
}

async function pfandVerbuchen() {
  auPfandFehler.textContent = "";
  const betrag = parseFloat(auPfandBetragFeld.value);
  if (isNaN(betrag) || betrag <= 0) {
    auPfandFehler.textContent = "Bitte einen gültigen Betrag größer als 0 eingeben.";
    return;
  }
  const benutzer = session.getAktuellerBenutzer();
  try {
    await repo.pfandGewinnVerbuchen(
      auPfandKasseAuswahl.value, betrag, auPfandKommentarFeld.value.trim(), benutzer.name
    );
  } catch (exc) {
    auPfandFehler.textContent = exc.message ?? String(exc);
    return;
  }
  auPfandBetragFeld.value = "";
  auPfandKommentarFeld.value = "";
  renderAuswertung();
}

async function monatsabrechnungAnzeigen() {
  const jahr = parseInt(auMonatJahrFeld.value, 10);
  const monat = parseInt(auMonatMonatAuswahl.value, 10);
  if (isNaN(jahr) || isNaN(monat)) return;
  letzteMonatsabrechnung = await repo.monatsabrechnung(jahr, monat);
  auMonatTitel.textContent = `${String(monat).padStart(2, "0")}/${jahr}`;
  auMonatErgebnis.innerHTML = monatsabrechnungHtml(letzteMonatsabrechnung);
  auMonatErgebnisKarte.style.display = "";
}

function monatsabrechnungHtml(m) {
  const jeKasseZeilen = VERANSTALTUNGEN.map((v) => {
    const k = m.je_kasse[v];
    return `<tr><td>${KASSE_LABEL[v] ?? v}</td><td>${euro(k.erloes)}</td><td>${euro(k.mwst_7)}</td><td>${euro(k.mwst_19)}</td><td>${euro(k.gewinn)}</td><td>${euro(k.wareneinsatz)}</td><td>${euro(k.pfand)}</td></tr>`;
  }).join("");

  const verkaeufeZeilen =
    m.verkaeufe_je_produkt
      .map(
        (v) =>
          `<tr><td>${KASSE_LABEL[v.veranstaltung] ?? v.veranstaltung}</td><td>${v.produkt_name}</td><td>${v.anzahl}</td><td>${euro(v.betrag)}</td></tr>`
      )
      .join("") || `<tr><td colspan="4">Keine Verkäufe in diesem Monat.</td></tr>`;

  const wareneinkaufZeilen =
    m.wareneinkauf
      .map(
        (w) =>
          `<tr><td>${w.name}${w.geschaetzt ? " (geschätzt)" : ""}</td><td>${w.menge}</td><td>${euro(w.netto)}</td><td>${euro(w.mwst)}</td><td>${euro(w.brutto)}</td></tr>`
      )
      .join("") || `<tr><td colspan="5">Kein Wareneinkauf in diesem Monat.</td></tr>`;

  const abschreibungZeilen =
    m.abschreibungen
      .map((a) => `<tr><td>${a.name}</td><td>${a.grund}</td><td>${a.menge}</td><td>${euro(a.wert)}</td></tr>`)
      .join("") || `<tr><td colspan="4">Keine Abschreibungen in diesem Monat.</td></tr>`;

  return `
    <h2>Je Kasse</h2>
    <table><thead><tr><th>Kasse</th><th>Umsatz</th><th>MwSt. 7%</th><th>MwSt. 19%</th><th>Gewinn</th><th>Wareneinsatz (verkaufte Ware)</th><th>Offenes Pfand</th></tr></thead><tbody>${jeKasseZeilen}</tbody></table>
    <p class="hinweis">„Wareneinsatz“ ist der Einkaufswert der in diesem Monat tatsächlich verkauften Stücke und im Gewinn bereits abgezogen – nicht der gesamte Wareneinkauf des Monats (siehe unten). Eingekaufte, aber noch nicht verkaufte Ware liegt als Warenwert im Kiosk.</p>
    <div class="kennzahl-zeile"><span>Gesamt-Umsatz</span><span>${euro(m.gesamt_erloes)}</span></div>
    <div class="kennzahl-zeile"><span>Gesamt-Gewinn</span><span>${euro(m.gesamt_gewinn)}</span></div>
    <div class="kennzahl-zeile"><span>Wareneinsatz (verkaufte Ware)</span><span>${euro(m.gesamt_wareneinsatz)}</span></div>
    <div class="kennzahl-zeile"><span>Wareneinkauf netto (bezahlt)</span><span>${euro(m.gesamt_wareneinkauf_netto)}</span></div>
    <div class="kennzahl-zeile"><span>Schiedsrichter-Auszahlungen</span><span>${euro(m.gesamt_schiedsrichter)}</span></div>
    <div class="kennzahl-zeile"><span>Ergebnis nach Schiedsrichtern</span><span>${euro(m.gesamt_ergebnis_nach_schiedsrichter)}</span></div>
    <div class="kennzahl-zeile"><span>Sonstige Ausgaben</span><span>${euro(m.gesamt_sonstige_ausgaben)}</span></div>
    <div class="kennzahl-zeile gesamt"><span>Ergebnis nach Ausgaben</span><span>${euro(m.gesamt_ergebnis_nach_ausgaben)}</span></div>
    <div class="kennzahl-zeile"><span>Umsatzsteuer</span><span>${euro(m.gesamt_umsatzsteuer)}</span></div>
    <div class="kennzahl-zeile"><span>Vorsteuer (Wareneinkauf)</span><span>${euro(m.gesamt_vorsteuer)}</span></div>
    <div class="kennzahl-zeile"><span>MwSt.-Zahllast</span><span>${euro(m.mwst_zahllast)}</span></div>
    <div class="kennzahl-zeile"><span>Lieferanten-Pfand (Saldo)</span><span>${euro(m.lieferanten_pfand.saldo)}</span></div>
    <div class="kennzahl-zeile"><span>Abschreibungen (Wert)</span><span>${euro(m.gesamt_abschreibungen_wert)}</span></div>

    <h2>Verkäufe je Produkt</h2>
    <table><thead><tr><th>Kasse</th><th>Produkt</th><th>Anzahl</th><th>Erlös</th></tr></thead><tbody>${verkaeufeZeilen}</tbody></table>

    <h2>Wareneinkauf</h2>
    ${m.wareneinkauf_teilweise_geschaetzt ? '<p class="hinweis">„geschätzt“ = kein Einzelpreis erfasst, es wurde der aktuelle Einkaufspreis des Produkts verwendet.</p>' : ""}
    <table><thead><tr><th>Produkt</th><th>Menge</th><th>Netto</th><th>MwSt.</th><th>Brutto</th></tr></thead><tbody>${wareneinkaufZeilen}</tbody></table>

    <h2>Abschreibungen</h2>
    <table><thead><tr><th>Produkt</th><th>Grund</th><th>Menge</th><th>Wert</th></tr></thead><tbody>${abschreibungZeilen}</tbody></table>
  `;
}

function monatsabrechnungDrucken() {
  if (!letzteMonatsabrechnung) return;
  const titel = `Monatsabrechnung ${auMonatTitel.textContent}`;
  druckenOeffnen(titel, `<h1>SG Köln-Worringen – ${titel}</h1>${monatsabrechnungHtml(letzteMonatsabrechnung)}`);
}

// ---------------------------------------------------------------------
// Admin-Verwaltung: Produkte/Benutzer (Runde 43) - Pendant zu
// repository.produkt_*/benutzer_*. Nur fuer Administratoren sichtbar
// (siehe nachAnmeldungAnzeigen). Rein UI-seitig geschuetzt, nicht per
// Datenbank-Regel - wie am Rechner (siehe repo.js).
// ---------------------------------------------------------------------

function adminSubtabUmschalten(tab) {
  adminSubtab = tab;
  adSubtabProdukteBtn.classList.toggle("aktiv", tab === "produkte");
  adSubtabBenutzerBtn.classList.toggle("aktiv", tab === "benutzer");
  adProduktePanel.style.display = tab === "produkte" ? "" : "none";
  adBenutzerPanel.style.display = tab === "benutzer" ? "" : "none";
}

async function renderAdmin() {
  await renderAdminProdukte();
  await renderAdminBenutzer();
}

async function renderAdminProdukte() {
  const alle = await repo.listeProdukte(false);
  adPTabelleBody.innerHTML = "";
  for (const produkt of alle) {
    const tr = document.createElement("tr");
    if (!produkt.aktiv) tr.classList.add("storniert");
    for (const wert of [
      produkt.name,
      KATEGORIE_LABEL[produkt.kategorie] ?? produkt.kategorie,
      `${produkt.mwst_satz} %`,
      euro(produkt.einkaufspreis),
      euro(produkt.verkaufspreis),
      euro(produkt.helferpreis),
      euro(produkt.pfand_betrag),
      produkt.aktiv ? "Aktiv" : "Deaktiviert",
    ]) {
      const td = document.createElement("td");
      td.textContent = wert;
      tr.appendChild(td);
    }

    const tdAktionen = document.createElement("td");
    tdAktionen.style.whiteSpace = "nowrap";
    const bearbeitenBtn = document.createElement("button");
    bearbeitenBtn.type = "button";
    bearbeitenBtn.className = "btn";
    bearbeitenBtn.textContent = "Bearbeiten";
    bearbeitenBtn.style.marginRight = "6px";
    bearbeitenBtn.onclick = () => produktBearbeitenOeffnen(produkt);
    tdAktionen.appendChild(bearbeitenBtn);
    if (produkt.aktiv) {
      const deaktivierenBtn = document.createElement("button");
      deaktivierenBtn.type = "button";
      deaktivierenBtn.className = "btn";
      deaktivierenBtn.textContent = "Deaktivieren";
      deaktivierenBtn.onclick = async () => {
        const ok = await zeigeBestaetigung(
          "Produkt deaktivieren?",
          `„${produkt.name}“ wird deaktiviert und ist danach nicht mehr im Verkauf wählbar. Bereits gebuchte Verkäufe/Bewegungen bleiben unverändert.`,
          "Deaktivieren"
        );
        if (!ok) return;
        try {
          await repo.produktDeaktivieren(produkt.id);
        } catch (exc) {
          zeigeHinweis("Fehler", exc.message ?? String(exc));
          return;
        }
        syncJetzt();
        await ladeCaches();
        renderAdminProdukte();
      };
      tdAktionen.appendChild(deaktivierenBtn);
    }
    tr.appendChild(tdAktionen);
    adPTabelleBody.appendChild(tr);
  }
}

async function produktAnlegenHandler() {
  adPFehler.textContent = "";
  const name = adPNameFeld.value.trim();
  if (!name) {
    adPFehler.textContent = "Bitte einen Namen eingeben.";
    return;
  }
  const verkaufspreis = parseFloat(adPVerkaufFeld.value);
  if (isNaN(verkaufspreis) || verkaufspreis < 0) {
    adPFehler.textContent = "Bitte einen gültigen Verkaufspreis eingeben.";
    return;
  }
  const einkaufspreis = parseFloat(adPEinkaufFeld.value) || 0;
  const helferpreisWert = adPHelferpreisFeld.value.trim();
  const helferpreis = helferpreisWert === "" ? null : parseFloat(helferpreisWert);
  const pfandBetrag = parseFloat(adPPfandFeld.value) || 0;
  const benutzer = session.getAktuellerBenutzer();
  try {
    await repo.produktAnlegen(
      name,
      adPKategorieAuswahl.value,
      parseInt(adPMwstAuswahl.value, 10),
      einkaufspreis,
      verkaufspreis,
      helferpreis,
      pfandBetrag,
      benutzer.name
    );
  } catch (exc) {
    adPFehler.textContent = exc.message ?? String(exc);
    return;
  }
  adPNameFeld.value = "";
  adPEinkaufFeld.value = "";
  adPVerkaufFeld.value = "";
  adPHelferpreisFeld.value = "";
  adPPfandFeld.value = "";
  syncJetzt();
  await ladeCaches();
  renderAdminProdukte();
}

function produktBearbeitenOeffnen(produkt) {
  bearbeitenProduktId = produkt.id;
  pbFehler.textContent = "";
  pbNameFeld.value = produkt.name;
  pbKategorieAuswahl.value = produkt.kategorie;
  pbMwstAuswahl.value = String(produkt.mwst_satz);
  pbEinkaufFeld.value = produkt.einkaufspreis;
  pbVerkaufFeld.value = produkt.verkaufspreis;
  pbHelferpreisFeld.value = produkt.helferpreis;
  pbPfandFeld.value = produkt.pfand_betrag;
  produktBearbeitenOverlay.classList.remove("versteckt");
}

function produktBearbeitenSchliessen() {
  produktBearbeitenOverlay.classList.add("versteckt");
  bearbeitenProduktId = null;
}

async function produktBearbeitenSpeichern() {
  if (!bearbeitenProduktId) return;
  pbFehler.textContent = "";
  const name = pbNameFeld.value.trim();
  if (!name) {
    pbFehler.textContent = "Bitte einen Namen eingeben.";
    return;
  }
  const verkaufspreis = parseFloat(pbVerkaufFeld.value);
  if (isNaN(verkaufspreis) || verkaufspreis < 0) {
    pbFehler.textContent = "Bitte einen gültigen Verkaufspreis eingeben.";
    return;
  }
  const einkaufspreis = parseFloat(pbEinkaufFeld.value) || 0;
  const helferpreisWert = pbHelferpreisFeld.value.trim();
  const helferpreis = helferpreisWert === "" ? null : parseFloat(helferpreisWert);
  const pfandBetrag = parseFloat(pbPfandFeld.value) || 0;
  try {
    await repo.produktAktualisieren(
      bearbeitenProduktId,
      name,
      pbKategorieAuswahl.value,
      parseInt(pbMwstAuswahl.value, 10),
      einkaufspreis,
      verkaufspreis,
      helferpreis,
      pfandBetrag
    );
  } catch (exc) {
    pbFehler.textContent = exc.message ?? String(exc);
    return;
  }
  produktBearbeitenSchliessen();
  syncJetzt();
  await ladeCaches();
  renderAdminProdukte();
  if (aktuelleAnsicht === "verkauf") renderProduktGrid();
}

async function renderAdminBenutzer() {
  const alle = await repo.listeBenutzer(false);
  adBTabelleBody.innerHTML = "";
  for (const benutzer of alle) {
    const tr = document.createElement("tr");
    if (!benutzer.aktiv) tr.classList.add("storniert");
    for (const wert of [benutzer.name, benutzer.ist_admin ? "Ja" : "Nein", benutzer.aktiv ? "Aktiv" : "Deaktiviert"]) {
      const td = document.createElement("td");
      td.textContent = wert;
      tr.appendChild(td);
    }

    const tdAktionen = document.createElement("td");
    tdAktionen.style.whiteSpace = "nowrap";

    const bearbeitenBtn = document.createElement("button");
    bearbeitenBtn.type = "button";
    bearbeitenBtn.className = "btn";
    bearbeitenBtn.textContent = "Bearbeiten";
    bearbeitenBtn.style.marginRight = "6px";
    bearbeitenBtn.onclick = () => benutzerBearbeitenOeffnen(benutzer);
    tdAktionen.appendChild(bearbeitenBtn);

    const pinBtn = document.createElement("button");
    pinBtn.type = "button";
    pinBtn.className = "btn";
    pinBtn.textContent = "PIN setzen";
    pinBtn.style.marginRight = "6px";
    pinBtn.onclick = async () => {
      const neuerPin = await zeigeTextEingabe(
        "Neuen PIN setzen",
        `Neuer PIN für „${benutzer.name}“ (4–8 Ziffern):`
      );
      if (neuerPin === null) return;
      const pinTrim = neuerPin.trim();
      if (!/^\d{4,8}$/.test(pinTrim)) {
        zeigeHinweis("Ungültiger PIN", "Der PIN muss aus 4 bis 8 Ziffern bestehen.");
        return;
      }
      try {
        await repo.benutzerPinSetzen(benutzer.id, pinTrim);
      } catch (exc) {
        zeigeHinweis("Fehler", exc.message ?? String(exc));
        return;
      }
      syncJetzt();
      zeigeHinweis("PIN gesetzt", `Der PIN für „${benutzer.name}“ wurde geändert.`);
    };
    tdAktionen.appendChild(pinBtn);

    if (benutzer.aktiv) {
      const deaktivierenBtn = document.createElement("button");
      deaktivierenBtn.type = "button";
      deaktivierenBtn.className = "btn";
      deaktivierenBtn.textContent = "Deaktivieren";
      deaktivierenBtn.onclick = async () => {
        if (benutzer.ist_admin && (await repo.anzahlAktiveAdmins(benutzer.id)) === 0) {
          zeigeHinweis(
            "Nicht möglich",
            "Es muss mindestens ein aktiver Administrator bestehen bleiben – bitte zuerst einen weiteren Administrator anlegen oder festlegen."
          );
          return;
        }
        const ok = await zeigeBestaetigung(
          "Benutzer deaktivieren?",
          `„${benutzer.name}“ kann sich danach nicht mehr anmelden.`,
          "Deaktivieren"
        );
        if (!ok) return;
        try {
          await repo.benutzerDeaktivieren(benutzer.id);
        } catch (exc) {
          zeigeHinweis("Fehler", exc.message ?? String(exc));
          return;
        }
        syncJetzt();
        await ladeCaches();
        renderAdminBenutzer();
      };
      tdAktionen.appendChild(deaktivierenBtn);
    } else {
      const aktivierenBtn = document.createElement("button");
      aktivierenBtn.type = "button";
      aktivierenBtn.className = "btn";
      aktivierenBtn.textContent = "Aktivieren";
      aktivierenBtn.onclick = async () => {
        try {
          await repo.benutzerAktivieren(benutzer.id);
        } catch (exc) {
          zeigeHinweis("Fehler", exc.message ?? String(exc));
          return;
        }
        syncJetzt();
        await ladeCaches();
        renderAdminBenutzer();
      };
      tdAktionen.appendChild(aktivierenBtn);
    }
    tr.appendChild(tdAktionen);
    adBTabelleBody.appendChild(tr);
  }
}

async function benutzerAnlegenHandler() {
  adBFehler.textContent = "";
  const name = adBNameFeld.value.trim();
  if (!name) {
    adBFehler.textContent = "Bitte einen Namen eingeben.";
    return;
  }
  const pin = adBPinFeld.value.trim();
  if (!/^\d{4,8}$/.test(pin)) {
    adBFehler.textContent = "Der PIN muss aus 4 bis 8 Ziffern bestehen.";
    return;
  }
  try {
    await repo.benutzerAnlegen(name, pin, adBAdminCheckbox.checked);
  } catch (exc) {
    adBFehler.textContent = exc.message ?? String(exc);
    return;
  }
  adBNameFeld.value = "";
  adBPinFeld.value = "";
  adBAdminCheckbox.checked = false;
  syncJetzt();
  await ladeCaches();
  renderAdminBenutzer();
}

function benutzerBearbeitenOeffnen(benutzer) {
  bearbeitenBenutzerId = benutzer.id;
  bearbeitenBenutzerWarAdmin = !!benutzer.ist_admin;
  bbFehler.textContent = "";
  bbNameFeld.value = benutzer.name;
  bbAdminCheckbox.checked = !!benutzer.ist_admin;
  benutzerBearbeitenOverlay.classList.remove("versteckt");
}

function benutzerBearbeitenSchliessen() {
  benutzerBearbeitenOverlay.classList.add("versteckt");
  bearbeitenBenutzerId = null;
}

async function benutzerBearbeitenSpeichern() {
  if (!bearbeitenBenutzerId) return;
  bbFehler.textContent = "";
  const name = bbNameFeld.value.trim();
  if (!name) {
    bbFehler.textContent = "Bitte einen Namen eingeben.";
    return;
  }
  if (bearbeitenBenutzerWarAdmin && !bbAdminCheckbox.checked) {
    if ((await repo.anzahlAktiveAdmins(bearbeitenBenutzerId)) === 0) {
      bbFehler.textContent = "Es muss mindestens ein aktiver Administrator bestehen bleiben.";
      return;
    }
  }
  try {
    await repo.benutzerAktualisieren(bearbeitenBenutzerId, name, bbAdminCheckbox.checked);
  } catch (exc) {
    bbFehler.textContent = exc.message ?? String(exc);
    return;
  }
  benutzerBearbeitenSchliessen();
  syncJetzt();
  await ladeCaches();
  renderAdminBenutzer();
}

// ---------------------------------------------------------------------
// Caches laden / nach Sync aktualisieren
// ---------------------------------------------------------------------

async function ladeCaches() {
  benutzerCache = await repo.listeBenutzer();
  produkteCache = await repo.listeProdukte();
}

async function nachSyncAktualisieren() {
  await ladeCaches();
  if (aktuelleAnsicht === "login") {
    renderLoginNutzer();
  } else if (aktuelleAnsicht === "verkauf") {
    renderProduktGrid();
  } else if (aktuelleAnsicht === "storno") {
    renderStornoListe();
  } else if (aktuelleAnsicht === "kassensturz") {
    renderKassensturz();
  } else if (aktuelleAnsicht === "schiedsrichter") {
    renderSchiedsrichter();
  } else if (aktuelleAnsicht === "einzahlen") {
    renderEinzahlungen();
  } else if (aktuelleAnsicht === "ausgaben") {
    renderAusgaben();
  } else if (aktuelleAnsicht === "entnahmen") {
    renderEntnahmen();
  } else if (aktuelleAnsicht === "nachbestellung") {
    renderNachbestellungen();
  } else if (aktuelleAnsicht === "termine") {
    renderTermine();
  } else if (aktuelleAnsicht === "feedback") {
    renderFeedback();
  } else if (aktuelleAnsicht === "warenwirtschaft") {
    renderWarenwirtschaft();
  } else if (aktuelleAnsicht === "auswertung") {
    renderAuswertung();
  } else if (aktuelleAnsicht === "admin") {
    renderAdmin();
  }
  pruefeKassenvorschlag();
}

// ---------------------------------------------------------------------
// Sync-Status
// ---------------------------------------------------------------------

onSynchronisiert((ergebnis) => {
  syncStatusEl.textContent = `Zuletzt synchronisiert: ${formatUhrzeit(ergebnis.zeitpunkt)} (↑${ergebnis.gepusht} ↓${ergebnis.geholt})`;
  nachSyncAktualisieren();
});

async function syncManuellAusloesen() {
  syncJetztBtn.disabled = true;
  syncStatusEl.textContent = "Synchronisiere…";
  const ergebnis = await syncJetzt();
  if (ergebnis.fehler) {
    syncStatusEl.textContent = `Sync fehlgeschlagen: ${ergebnis.fehler}`;
  }
  syncJetztBtn.disabled = false;
}

// ---------------------------------------------------------------------
// App beenden
// ---------------------------------------------------------------------
// Gleiches Prinzip wie closeEvent() am Windows-Rechner: erst ein Hinweis,
// dass fuers Beenden noch einmal synchronisiert wird (Internet noetig),
// dann der eigentliche Sync-Versuch - und erst DANACH wird die App
// tatsaechlich geschlossen. Zwei Unterschiede zum Windows-Rechner, die
// sich aus dem Browser/PWA-Kontext ergeben: (1) es gibt keinen nativen
// "X"-Knopf, den man abfangen koennte, daher der eigene "Beenden"-Knopf;
// (2) window.close() darf ein Browser aus Sicherheitsgruenden verweigern
// (z.B. wenn das Fenster nicht per Skript geoeffnet wurde) - das laesst
// sich von hier aus nicht zuverlaessig erkennen, daher zusaetzlich immer
// ein Hinweis, dass die App danach manuell geschlossen werden kann.

// Wie am Windows-Rechner (dort per 5-Sekunden-QTimer): das Beenden darf
// niemals haengen bleiben, auch nicht ganz ohne Internet.
const APP_BEENDEN_TIMEOUT_MS = 5000;

function appBeenden() {
  hinweisTitel.textContent = "App beenden";
  hinweisText.textContent =
    "Vor dem Beenden wird noch einmal versucht zu synchronisieren. Dafür wird eine Internetverbindung benötigt (z.B. über einen Hotspot) - bitte sicherstellen, dass diese aktiv ist.";
  hinweisAktionen.innerHTML = "";
  const okBtn = document.createElement("button");
  okBtn.id = "hinweis-ok-btn";
  okBtn.className = "btn btn-primaer";
  okBtn.textContent = "OK";
  okBtn.onclick = () => {
    hinweisSchliessen();
    appBeendenSyncUndSchliessen();
  };
  hinweisAktionen.appendChild(okBtn);
  hinweisOverlay.classList.remove("versteckt");
}

async function appBeendenSyncUndSchliessen() {
  beendenBtn.disabled = true;
  syncStatusEl.textContent = "Synchronisiere vor dem Beenden…";
  await Promise.race([
    syncJetzt(),
    new Promise((resolve) => setTimeout(resolve, APP_BEENDEN_TIMEOUT_MS)),
  ]);
  beendenAusfuehren();
}

function beendenAusfuehren() {
  // Funktioniert nur, wenn der Browser das erlaubt - klappt es, ist die
  // Seite ab hier weg und der Code danach laeuft gar nicht mehr weiter.
  window.close();
  // Klappt es nicht (z.B. weil das Fenster nicht per Skript geoeffnet
  // wurde, auf Android/Chrome bei eigenstaendig gestarteten PWAs
  // durchaus ueblich), bleibt die Seite bestehen - dann diesen Hinweis
  // zeigen, statt die Kassiererin/den Kassierer im Unklaren zu lassen.
  setTimeout(() => {
    beendenBtn.disabled = false;
    zeigeHinweis(
      "Synchronisierung abgeschlossen",
      "Die App konnte nicht automatisch geschlossen werden. Sie können sie jetzt manuell schließen (z.B. über die zuletzt genutzten Apps oder den Zurück-Knopf des Tablets)."
    );
  }, 300);
}

// ---------------------------------------------------------------------
// Events verdrahten
// ---------------------------------------------------------------------

function wireEvents() {
  pinZurueckBtn.onclick = pinEingabeVerlassen;
  abmeldenBtn.onclick = abmelden;
  hilfeBtn.onclick = hilfeOeffnen;
  hilfeSchliessenBtn.onclick = hilfeSchliessen;
  syncJetztBtn.onclick = syncManuellAusloesen;
  updatePruefenBtn.onclick = updateButtonGeklickt;
  beendenBtn.onclick = appBeenden;

  kasseAuswahl.onchange = () => {
    session.setAktiveKasse(kasseAuswahl.value);
    aktualisiereAktuelleAnsichtNachKassenwechsel();
    pruefeKassenvorschlag();
  };

  tabVerkauf.onclick = () => zeigeHauptView("verkauf");
  tabStorno.onclick = () => zeigeHauptView("storno");
  tabKassensturz.onclick = () => zeigeHauptView("kassensturz");
  tabMehr.onclick = () => {
    // Nicht-Administratoren duerfen "nachbestellung"/"auswertung"/"admin"
    // nicht sehen - falls das (aus einer vorherigen Admin-Anmeldung in
    // derselben Sitzung) die zuletzt gewaehlte Unteransicht war,
    // stattdessen die erste sichtbare Unteransicht oeffnen.
    // "schiedsrichter" ist seit Runde 34 kein Teil von "Mehr" mehr, daher
    // hier nicht mehr als Ziel moeglich.
    const benutzer = session.getAktuellerBenutzer();
    const nurAdmin = ["nachbestellung", "auswertung", "admin"];
    let ziel = letzteMehrAnsicht || "einzahlen";
    if (nurAdmin.includes(ziel) && !benutzer?.ist_admin) ziel = "einzahlen";
    zeigeHauptView(ziel);
  };
  tabSchiedsrichter.onclick = () => zeigeHauptView("schiedsrichter");
  tabEinzahlen.onclick = () => zeigeHauptView("einzahlen");
  tabAusgaben.onclick = () => zeigeHauptView("ausgaben");
  tabEntnahmen.onclick = () => zeigeHauptView("entnahmen");
  tabNachbestellung.onclick = () => zeigeHauptView("nachbestellung");
  tabTermine.onclick = () => zeigeHauptView("termine");
  tabFeedback.onclick = () => zeigeHauptView("feedback");
  tabWarenwirtschaft.onclick = () => zeigeHauptView("warenwirtschaft");
  tabAuswertung.onclick = () => zeigeHauptView("auswertung");
  tabAdmin.onclick = () => zeigeHauptView("admin");
  srAuszahlenBtn.onclick = schiedsrichterAuszahlen;
  srWasserStillBtn.onclick = () => schiedsrichterWasserAusgeben(SCHIEDSRICHTER_WASSER_STILL_PRODUKT_ID);
  srWasserMediumBtn.onclick = () => schiedsrichterWasserAusgeben(SCHIEDSRICHTER_WASSER_MEDIUM_PRODUKT_ID);
  ezEinzahlenBtn.onclick = bargeldEinzahlen;
  saErfassenBtn.onclick = ausgabeErfassen;
  beErfassenBtn.onclick = entnahmeErfassen;
  ksEntnahmeUeberspringenBtn.onclick = ksEntnahmeUeberspringen;
  ksEntnahmeSpeichernBtn.onclick = ksEntnahmeSpeichern;
  npPositionHinzufuegenBtn.onclick = nachbestellungPositionHinzufuegen;
  npErfassenBtn.onclick = nachbestellungErfassen;
  tsEintragenBtn.onclick = heimspielEintragen;
  fbEinreichenBtn.onclick = feedbackEinreichen;
  fbsAbbrechenBtn.onclick = feedbackStatusSchliessen;
  fbsSpeichernBtn.onclick = feedbackStatusSpeichern;

  kassenvorschlagUebernehmenBtn.onclick = kassenvorschlagUebernehmen;
  kassenvorschlagVerwerfenBtn.onclick = kassenvorschlagVerwerfen;

  katBtnGetraenk.onclick = () => kategorieUmschalten("Getraenk");
  katBtnSpeise.onclick = () => kategorieUmschalten("Speise");

  helferpreisBtn.onclick = () => {
    helferpreisAktiv = !helferpreisAktiv;
    helferpreisBtn.classList.toggle("aktiv", helferpreisAktiv);
  };

  // Kein Umschalter mehr: ein Antippen bucht sofort eine pauschale
  // Pfandrückgabe (siehe pfandRueckgabeKlick).
  pfandRueckgabeBtn.onclick = () => pfandRueckgabeKlick();

  // Runde 44: "Kaffee für Trainer" - siehe kaffeeFuerTrainerAusgeben().
  kaffeeTrainerBtn.onclick = () => kaffeeFuerTrainerAusgeben();

  bezahlenBtn.onclick = bezahlenOeffnen;
  bezahlenAbbrechenBtn.onclick = bezahlenSchliessen;
  bezahlenBestaetigenBtn.onclick = bezahlenBestaetigen;
  gegebenFeld.oninput = bezahlenGegebenGeaendert;

  ksGezaehltFeld.oninput = ksGezaehltGeaendert;
  ksSpeichernBtn.onclick = ksSpeichern;

  // Runde 43: Warenwirtschaft
  wwInventurBtn.onclick = inventurOeffnen;
  wwBestandDruckenBtn.onclick = bestandDrucken;
  wwModusEingangBtn.onclick = () => wwModusUmschalten("Wareneingang");
  wwModusKorrekturBtn.onclick = () => wwModusUmschalten("Korrektur");
  wwErfassenBtn.onclick = wareneingangErfassen;
  wwAbschErfassenBtn.onclick = abschreibungErfassenHandler;
  inventurAbbrechenBtn.onclick = inventurSchliessen;
  inventurSpeichernBtn.onclick = inventurSpeichern;

  // Runde 43: Auswertung / Monatsabrechnung
  auPfandVerbuchenBtn.onclick = pfandVerbuchen;
  auMonatAnzeigenBtn.onclick = monatsabrechnungAnzeigen;
  auMonatDruckenBtn.onclick = monatsabrechnungDrucken;

  // Runde 43: Admin-Verwaltung
  adSubtabProdukteBtn.onclick = () => adminSubtabUmschalten("produkte");
  adSubtabBenutzerBtn.onclick = () => adminSubtabUmschalten("benutzer");
  adPKategorieAuswahl.onchange = () => {
    const vorschlag = MWST_SAETZE[adPKategorieAuswahl.value];
    if (vorschlag != null) adPMwstAuswahl.value = String(vorschlag);
  };
  adPAnlegenBtn.onclick = produktAnlegenHandler;
  adBAnlegenBtn.onclick = benutzerAnlegenHandler;
  pbAbbrechenBtn.onclick = produktBearbeitenSchliessen;
  pbSpeichernBtn.onclick = produktBearbeitenSpeichern;
  bbAbbrechenBtn.onclick = benutzerBearbeitenSchliessen;
  bbSpeichernBtn.onclick = benutzerBearbeitenSpeichern;

  hinweisOverlay.addEventListener("click", (ev) => {
    if (ev.target === hinweisOverlay) hinweisSchliessen();
  });
  bezahlenOverlay.addEventListener("click", (ev) => {
    if (ev.target === bezahlenOverlay) bezahlenSchliessen();
  });
  hilfeOverlay.addEventListener("click", (ev) => {
    if (ev.target === hilfeOverlay) hilfeSchliessen();
  });
  feedbackStatusOverlay.addEventListener("click", (ev) => {
    if (ev.target === feedbackStatusOverlay) feedbackStatusSchliessen();
  });
  inventurOverlay.addEventListener("click", (ev) => {
    if (ev.target === inventurOverlay) inventurSchliessen();
  });
  produktBearbeitenOverlay.addEventListener("click", (ev) => {
    if (ev.target === produktBearbeitenOverlay) produktBearbeitenSchliessen();
  });
  benutzerBearbeitenOverlay.addEventListener("click", (ev) => {
    if (ev.target === benutzerBearbeitenOverlay) benutzerBearbeitenSchliessen();
  });
}

// ---------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// Updates (Service Worker)
// ---------------------------------------------------------------------
// Der Service Worker cacht die App-Shell fuers Offline-Arbeiten (siehe
// service-worker.js). Damit auf dem Tablet auch tatsaechlich sichtbar
// ist, ob/wann eine neue Version vorliegt, merken wir uns die
// Registrierung, bieten eine manuelle Pruefung per Knopf an, und
// zeigen an, wenn eine neue Version installiert wurde - statt sie
// einfach mitten in der Nutzung "unter dem Cursor" auszutauschen,
// muss die Kassiererin/der Kassierer bewusst auf "Neu laden" tippen
// (gleiches Grundprinzip wie beim Kassenvorschlag: vorschlagen statt
// automatisch handeln).

let serviceWorkerRegistration = null;
let updateBereitZumLaden = false;

function serviceWorkerRegistrieren() {
  if (!("serviceWorker" in navigator)) {
    updateStatusEl.textContent = "Updates auf diesem Gerät nicht unterstützt";
    updatePruefenBtn.disabled = true;
    return;
  }
  // Nicht blockierend - falls das fehlschlaegt (z.B. beim allerersten
  // Aufruf ohne Internet), funktioniert die Seite trotzdem ganz normal,
  // nur eben ohne die zusaetzliche Offline-Absicherung durch den Cache.
  navigator.serviceWorker
    .register("service-worker.js")
    .then((reg) => {
      serviceWorkerRegistration = reg;
      reg.addEventListener("updatefound", () => {
        const neuerWorker = reg.installing;
        if (!neuerWorker) return;
        neuerWorker.addEventListener("statechange", () => {
          if (neuerWorker.state === "installed" && navigator.serviceWorker.controller) {
            updateAlsBereitAnzeigen();
          }
        });
      });
    })
    .catch(() => {
      updateStatusEl.textContent = "Updates momentan nicht verfügbar";
    });
}

function updateAlsBereitAnzeigen() {
  updateBereitZumLaden = true;
  updateStatusEl.textContent = "Neue Version installiert";
  updatePruefenBtn.textContent = "Update verfügbar – Neu laden";
  updatePruefenBtn.classList.add("btn-update-verfuegbar");
  updatePruefenBtn.disabled = false;
}

function updateButtonGeklickt() {
  if (updateBereitZumLaden) {
    window.location.reload();
    return;
  }
  updatePruefen();
}

async function updatePruefen() {
  if (!serviceWorkerRegistration) {
    zeigeHinweis(
      "Updates",
      "Auf diesem Gerät konnte kein Service Worker registriert werden – eine Update-Prüfung ist daher nicht möglich. Bitte die Seite manuell neu laden."
    );
    return;
  }
  updatePruefenBtn.disabled = true;
  updateStatusEl.textContent = "Prüfe auf Updates…";
  try {
    // registration.update() erzwingt einen Byte-Vergleich der
    // service-worker.js mit der Version auf dem Server (umgeht dabei
    // laut Spezifikation den HTTP-Cache) - genau das manuelle
    // "nach Updates suchen", das bisher komplett gefehlt hat.
    await serviceWorkerRegistration.update();
    setTimeout(() => {
      if (!updateBereitZumLaden) {
        updateStatusEl.textContent = `Aktuell (geprüft ${formatUhrzeit(new Date().toISOString())})`;
      }
    }, 1500);
  } catch (e) {
    updateStatusEl.textContent = "Update-Prüfung fehlgeschlagen – ist Internet verfügbar?";
  }
  if (!updateBereitZumLaden) updatePruefenBtn.disabled = false;
}

// Wie oft waehrend der laufenden Nutzung erneut geprueft wird, ob sich
// die vermutlich richtige Kasse geaendert hat (z.B. weil ein Training
// oder Heimspiel gerade angefangen hat). Bewusst kein Vollautomatik-
// Wechsel, siehe pruefeKassenvorschlag().
const KASSENVORSCHLAG_INTERVALL_MS = 2 * 60 * 1000;

async function init() {
  appVersionEl.textContent = `v${APP_VERSION}`;
  serviceWorkerRegistrieren();
  wireEvents();
  renderTastatur();
  fuelleTeamAuswahl();

  await ladeCaches();
  renderLoginNutzer();
  zeigeHauptView("login");

  zeigeHinweis(
    "Hinweis: Internetverbindung",
    "Diese Kasse funktioniert auch ohne Internetverbindung – Verkäufe, Stornos und der Kassensturz werden lokal auf diesem Tablet gespeichert. Für die Synchronisierung mit der zentralen Datenbank wird zwischenzeitlich eine Internetverbindung benötigt (z.B. über einen Hotspot). Ohne Synchronisierung sind zu Beginn eventuell noch keine Produkte oder Benutzer geladen."
  );

  syncManuellAusloesen();
  syncAutomatikStarten(SYNC_INTERVAL_SECONDS);
  setInterval(pruefeKassenvorschlag, KASSENVORSCHLAG_INTERVALL_MS);
}

init();
