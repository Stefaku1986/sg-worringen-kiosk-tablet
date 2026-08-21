// Verdrahtung der Tablet-Oberflaeche - verbindet index.html mit
// session.js/repo.js/sync.js/auth.js/db.js. Kein Framework, kein Build-
// Schritt: einfaches DOM-Handling, wie es fuer eine kleine Kiosk-App
// voellig ausreicht.

import { SYNC_INTERVAL_SECONDS } from "./config.js";
import { euro, deZahl } from "./format.js";
import * as repo from "./repo.js";
import * as session from "./session.js";
import { syncJetzt, syncAutomatikStarten, onSynchronisiert } from "./sync.js";

// ---------------------------------------------------------------------
// DOM-Referenzen
// ---------------------------------------------------------------------

const el = (id) => document.getElementById(id);

const kasseAuswahlBereich = el("kasse-auswahl-bereich");
const kasseAuswahl = el("kasse-auswahl");
const syncStatusEl = el("sync-status");
const syncJetztBtn = el("sync-jetzt-btn");
const benutzerLabel = el("benutzer-label");
const abmeldenBtn = el("abmelden-btn");
const tabsEl = el("tabs");
const tabVerkauf = el("tab-verkauf");
const tabStorno = el("tab-storno");
const tabKassensturz = el("tab-kassensturz");

const loginView = el("login-view");
const verkaufView = el("verkauf-view");
const stornoView = el("storno-view");
const kassensturzView = el("kassensturz-view");

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
const ksSoll = el("ks-soll");
const ksGezaehltFeld = el("ks-gezaehlt-feld");
const ksDifferenz = el("ks-differenz");
const ksNaechsterStartFeld = el("ks-naechster-start-feld");
const ksSpeichernBtn = el("ks-speichern-btn");
const ksHistorieBody = document.querySelector("#ks-historie-tabelle tbody");

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

// ---------------------------------------------------------------------
// Zustand
// ---------------------------------------------------------------------

let produkteCache = [];
let benutzerCache = [];
let warenkorb = []; // {produktId, name, menge, einzelpreis, einkaufspreis, mwstSatz, istHelferpreis}
let helferpreisAktiv = false;
let angemeldeterKandidat = null; // Benutzer, dessen PIN gerade eingegeben wird
let pinEingabe = "";
let aktuelleAnsicht = "login"; // 'login' | 'verkauf' | 'storno' | 'kassensturz'
let letzterKassensturzSoll = 0;
let vorgaengeCache = []; // fuer Storno-Ansicht

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

  tabVerkauf.classList.toggle("aktiv", name === "verkauf");
  tabStorno.classList.toggle("aktiv", name === "storno");
  tabKassensturz.classList.toggle("aktiv", name === "kassensturz");

  if (name === "verkauf") renderProduktGrid();
  if (name === "storno") renderStornoListe();
  if (name === "kassensturz") renderKassensturz();
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
  zeigeHauptView("verkauf");
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
  }
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
// Events verdrahten
// ---------------------------------------------------------------------

function wireEvents() {
  pinZurueckBtn.onclick = pinEingabeVerlassen;
  abmeldenBtn.onclick = abmelden;
  syncJetztBtn.onclick = syncManuellAusloesen;

  kasseAuswahl.onchange = () => {
    session.setAktiveKasse(kasseAuswahl.value);
    if (aktuelleAnsicht === "verkauf") renderProduktGrid();
    if (aktuelleAnsicht === "storno") renderStornoListe();
    if (aktuelleAnsicht === "kassensturz") renderKassensturz();
  };

  tabVerkauf.onclick = () => zeigeHauptView("verkauf");
  tabStorno.onclick = () => zeigeHauptView("storno");
  tabKassensturz.onclick = () => zeigeHauptView("kassensturz");

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

function serviceWorkerRegistrieren() {
  if (!("serviceWorker" in navigator)) return;
  // Nicht blockierend - falls das fehlschlaegt (z.B. beim allerersten
  // Aufruf ohne Internet), funktioniert die Seite trotzdem ganz normal,
  // nur eben ohne die zusaetzliche Offline-Absicherung durch den Cache.
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}

async function init() {
  serviceWorkerRegistrieren();
  wireEvents();
  renderTastatur();

  await ladeCaches();
  renderLoginNutzer();
  zeigeHauptView("login");

  zeigeHinweis(
    "Hinweis: Internetverbindung",
    "Diese Kasse funktioniert auch ohne Internetverbindung – Verkäufe, Stornos und der Kassensturz werden lokal auf diesem Tablet gespeichert. Für die Synchronisierung mit der zentralen Datenbank wird zwischenzeitlich eine Internetverbindung benötigt (z.B. über einen Hotspot). Ohne Synchronisierung sind zu Beginn eventuell noch keine Produkte oder Benutzer geladen."
  );

  syncManuellAusloesen();
  syncAutomatikStarten(SYNC_INTERVAL_SECONDS);
}

init();
