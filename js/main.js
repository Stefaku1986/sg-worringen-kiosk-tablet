// Verdrahtung der Tablet-Oberflaeche - verbindet index.html mit
// session.js/repo.js/sync.js/auth.js/db.js. Kein Framework, kein Build-
// Schritt: einfaches DOM-Handling, wie es fuer eine kleine Kiosk-App
// voellig ausreicht.

import { APP_VERSION, SYNC_INTERVAL_SECONDS, TEAMS } from "./config.js";
import { euro, deZahl } from "./format.js";
import * as repo from "./repo.js";
import * as session from "./session.js";
import { syncJetzt, syncAutomatikStarten, onSynchronisiert } from "./sync.js";

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
const beendenBtn = el("beenden-btn");
const tabsEl = el("tabs");
const tabVerkauf = el("tab-verkauf");
const tabStorno = el("tab-storno");
const tabKassensturz = el("tab-kassensturz");
const tabSchiedsrichter = el("tab-schiedsrichter");
const tabEinzahlen = el("tab-einzahlen");
const tabTermine = el("tab-termine");

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
const termineView = el("termine-view");

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
const helferpreisBtn = el("helferpreis-btn");
const warenkorbListe = el("warenkorb-liste");
const summeEl = el("summe");
const bezahlenBtn = el("bezahlen-btn");

const stornoTabelleBody = document.querySelector("#storno-tabelle tbody");

const ksKasseName = el("ks-kasse-name");
const ksAnfangsbestand = el("ks-anfangsbestand");
const ksEinnahmen = el("ks-einnahmen");
const ksAuszahlungen = el("ks-auszahlungen");
const ksEinzahlungen = el("ks-einzahlungen");
const ksSoll = el("ks-soll");
const ksGezaehltFeld = el("ks-gezaehlt-feld");
const ksDifferenz = el("ks-differenz");
const ksNaechsterStartFeld = el("ks-naechster-start-feld");
const ksSpeichernBtn = el("ks-speichern-btn");
const ksHistorieBody = document.querySelector("#ks-historie-tabelle tbody");

const srKasseName = el("sr-kasse-name");
const srMannschaftFeld = el("sr-mannschaft-feld");
const srNameFeld = el("sr-name-feld");
const srBetragFeld = el("sr-betrag-feld");
const srKommentarFeld = el("sr-kommentar-feld");
const srFehler = el("sr-fehler");
const srAuszahlenBtn = el("sr-auszahlen-btn");
const srTabelleBody = document.querySelector("#sr-tabelle tbody");

const ezKasseName = el("ez-kasse-name");
const ezBetragFeld = el("ez-betrag-feld");
const ezKommentarFeld = el("ez-kommentar-feld");
const ezFehler = el("ez-fehler");
const ezEinzahlenBtn = el("ez-einzahlen-btn");
const ezTabelleBody = document.querySelector("#ez-tabelle tbody");

const tsTeamAuswahl = el("ts-team-auswahl");
const tsDatumFeld = el("ts-datum-feld");
const tsStartFeld = el("ts-start-feld");
const tsEndeFeld = el("ts-ende-feld");
const tsGegnerFeld = el("ts-gegner-feld");
const tsFehler = el("ts-fehler");
const tsEintragenBtn = el("ts-eintragen-btn");
const tsHeimspieleBody = document.querySelector("#ts-heimspiele-tabelle tbody");
const tsTrainingsplanBody = document.querySelector("#ts-trainingsplan-tabelle tbody");

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

const KATEGORIE_LABEL = { Getraenk: "Getränke", Speise: "Speisen" };
const KASSE_LABEL = { Jugend: "Jugendkasse", Senioren: "Seniorenkasse" };
const WOCHENTAG_LABEL = { 1: "Montag", 2: "Dienstag", 3: "Mittwoch", 4: "Donnerstag", 5: "Freitag", 6: "Samstag", 7: "Sonntag" };

// ---------------------------------------------------------------------
// Zustand
// ---------------------------------------------------------------------

let produkteCache = [];
let benutzerCache = [];
let warenkorb = []; // {produktId, name, menge, einzelpreis, einkaufspreis, mwstSatz, istHelferpreis}
let helferpreisAktiv = false;
let angemeldeterKandidat = null; // Benutzer, dessen PIN gerade eingegeben wird
let pinEingabe = "";
let aktuelleAnsicht = "login"; // 'login' | 'verkauf' | 'storno' | 'kassensturz' | 'schiedsrichter' | 'einzahlen' | 'termine'
let letzterKassensturzSoll = 0;
let vorgaengeCache = []; // fuer Storno-Ansicht
let abgelehnteKassenvorschlaege = new Set(); // "schluessel" bereits verworfener Vorschlaege

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
    termineView.style.display = "none";
    kassenvorschlagBanner.classList.add("versteckt");
    tabsEl.style.display = "none";
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
  termineView.style.display = name === "termine" ? "" : "none";

  tabVerkauf.classList.toggle("aktiv", name === "verkauf");
  tabStorno.classList.toggle("aktiv", name === "storno");
  tabKassensturz.classList.toggle("aktiv", name === "kassensturz");
  tabSchiedsrichter.classList.toggle("aktiv", name === "schiedsrichter");
  tabEinzahlen.classList.toggle("aktiv", name === "einzahlen");
  tabTermine.classList.toggle("aktiv", name === "termine");

  if (name === "verkauf") renderProduktGrid();
  if (name === "storno") renderStornoListe();
  if (name === "kassensturz") renderKassensturz();
  if (name === "schiedsrichter") renderSchiedsrichter();
  if (name === "einzahlen") renderEinzahlungen();
  if (name === "termine") renderTermine();
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
  nachAnmeldungAnzeigen();
}

function nachAnmeldungAnzeigen() {
  const benutzer = session.getAktuellerBenutzer();
  benutzerLabel.textContent = benutzer.name;
  kasseAuswahl.value = session.getAktiveKasse();
  warenkorb = [];
  helferpreisAktiv = false;
  abgelehnteKassenvorschlaege = new Set();
  zeigeHauptView("verkauf");
  pruefeKassenvorschlag();
}

function abmelden() {
  session.abmelden();
  warenkorb = [];
  helferpreisAktiv = false;
  renderLoginNutzer();
  zeigeHauptView("login");
}

// Globale Tastatur-Unterstuetzung fuer die PIN-Eingabe (Ziffernblock,
// Enter zum Bestaetigen, Escape zum Zurueckgehen).
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

function renderProduktGrid() {
  produktGrid.innerHTML = "";
  const gruppen = new Map();
  for (const p of produkteCache) {
    if (!gruppen.has(p.kategorie)) gruppen.set(p.kategorie, []);
    gruppen.get(p.kategorie).push(p);
  }
  const reihenfolge = ["Getraenk", "Speise", ...[...gruppen.keys()].filter((k) => k !== "Getraenk" && k !== "Speise")];
  for (const kategorie of reihenfolge) {
    const produkte = gruppen.get(kategorie);
    if (!produkte || !produkte.length) continue;
    const titel = document.createElement("div");
    titel.className = "kategorie-titel";
    titel.textContent = KATEGORIE_LABEL[kategorie] ?? kategorie;
    produktGrid.appendChild(titel);
    for (const produkt of produkte) {
      const kachel = document.createElement("button");
      kachel.type = "button";
      kachel.className = "produkt-kachel";
      const name = document.createElement("div");
      name.textContent = produkt.name;
      const preis = document.createElement("div");
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
      kachel.onclick = () => warenkorbHinzufuegen(produkt);
      produktGrid.appendChild(kachel);
    }
  }
}

function warenkorbHinzufuegen(produkt) {
  const istHelfer = helferpreisAktiv;
  const einzelpreis = istHelfer ? produkt.helferpreis ?? produkt.verkaufspreis : produkt.verkaufspreis;
  const bestehend = warenkorb.find((z) => z.produktId === produkt.id && z.istHelferpreis === istHelfer);
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
    });
  }
  helferpreisAktiv = false;
  helferpreisBtn.classList.remove("aktiv");
  renderWarenkorb();
}

function renderWarenkorb() {
  warenkorbListe.innerHTML = "";
  for (const zeile of warenkorb) {
    const div = document.createElement("div");
    div.className = "warenkorb-zeile";

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = `${zeile.name} (${euro(zeile.einzelpreis)})`;

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
    div.appendChild(minus);
    div.appendChild(menge);
    div.appendChild(plus);
    div.appendChild(entfernen);
    warenkorbListe.appendChild(div);
  }

  const summe = warenkorb.reduce((s, z) => s + z.menge * z.einzelpreis, 0);
  summeEl.textContent = `Summe: ${euro(summe)}`;
  bezahlenBtn.disabled = warenkorb.length === 0;
}

function warenkorbSumme() {
  return warenkorb.reduce((s, z) => s + z.menge * z.einzelpreis, 0);
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

async function renderKassensturz() {
  const aktiveKasse = session.getAktiveKasse();
  ksKasseName.textContent = KASSE_LABEL[aktiveKasse] ?? aktiveKasse;

  const vorschau = await repo.kassensturzVorschau(aktiveKasse);
  letzterKassensturzSoll = vorschau.soll;

  ksAnfangsbestand.textContent = euro(vorschau.anfangsbestand);
  ksEinnahmen.textContent = euro(vorschau.einnahmen, true);
  ksAuszahlungen.textContent = euro(vorschau.auszahlungen);
  ksEinzahlungen.textContent = euro(vorschau.einzahlungen);
  ksSoll.textContent = euro(vorschau.soll);

  ksGezaehltFeld.value = "";
  ksDifferenz.textContent = "";
  ksNaechsterStartFeld.value = vorschau.soll.toFixed(2);

  await renderKassensturzHistorie(aktiveKasse);
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
  const naechsterStart = parseFloat(ksNaechsterStartFeld.value);
  const benutzer = session.getAktuellerBenutzer();
  const aktiveKasse = session.getAktiveKasse();
  const ergebnis = await repo.kassensturzDurchfuehren(
    aktiveKasse,
    gezaehlt,
    isNaN(naechsterStart) ? letzterKassensturzSoll : naechsterStart,
    null,
    benutzer.name
  );
  zeigeHinweis(
    "Kassensturz gespeichert",
    `Soll: ${euro(ergebnis.soll)}\nGezählt: ${euro(gezaehlt)}\nDifferenz: ${euro(ergebnis.differenz, true)}`
  );
  renderKassensturz();
}

async function renderKassensturzHistorie(aktiveKasse) {
  const alle = await repo.kassensturzHistorie(200);
  const anzeige = alle.filter((k) => k.veranstaltung === aktiveKasse).slice(0, 20);
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

  srTabelleBody.innerHTML = "";
  for (const auszahlung of anzeige) {
    const tr = document.createElement("tr");
    let status = "Aktiv";
    if (auszahlung.storno_von) status = "Storno";
    else if (stornierteIds.has(auszahlung.id)) status = "Storniert";
    if (status !== "Aktiv") tr.classList.add("storniert");

    const zellen = [
      formatDatumUhrzeit(auszahlung.datum),
      auszahlung.mannschaft || "–",
      auszahlung.schiedsrichter_name || "–",
      euro(auszahlung.betrag, true),
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
  } else if (aktuelleAnsicht === "termine") {
    renderTermine();
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
    syncStatusEl.textContent = "Sync fehlgeschlagen – ist Internet verfügbar (z.B. Hotspot)?";
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
  tabSchiedsrichter.onclick = () => zeigeHauptView("schiedsrichter");
  tabEinzahlen.onclick = () => zeigeHauptView("einzahlen");
  tabTermine.onclick = () => zeigeHauptView("termine");
  srAuszahlenBtn.onclick = schiedsrichterAuszahlen;
  ezEinzahlenBtn.onclick = bargeldEinzahlen;
  tsEintragenBtn.onclick = heimspielEintragen;

  kassenvorschlagUebernehmenBtn.onclick = kassenvorschlagUebernehmen;
  kassenvorschlagVerwerfenBtn.onclick = kassenvorschlagVerwerfen;

  helferpreisBtn.onclick = () => {
    helferpreisAktiv = !helferpreisAktiv;
    helferpreisBtn.classList.toggle("aktiv", helferpreisAktiv);
  };

  bezahlenBtn.onclick = bezahlenOeffnen;
  bezahlenAbbrechenBtn.onclick = bezahlenSchliessen;
  bezahlenBestaetigenBtn.onclick = bezahlenBestaetigen;
  gegebenFeld.oninput = bezahlenGegebenGeaendert;

  ksGezaehltFeld.oninput = ksGezaehltGeaendert;
  ksSpeichernBtn.onclick = ksSpeichern;

  hinweisOverlay.addEventListener("click", (ev) => {
    if (ev.target === hinweisOverlay) hinweisSchliessen();
  });
  bezahlenOverlay.addEventListener("click", (ev) => {
    if (ev.target === bezahlenOverlay) bezahlenSchliessen();
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
