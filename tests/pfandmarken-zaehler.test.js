/**
 * Anzeige offener Pfandmarken im Reiter "Verkauf" (Runde 53, neu gefasst in
 * Runde 57).
 *
 * Runde 53 rechnete die Stueckzahl aus dem offenen Pfandbetrag zurueck
 * (Betrag / Pfandwert pro Marke) und lieferte null, sobald es mehr als einen
 * Pfandbetrag unter den aktiven Produkten gab. Genau das ist bei der SG der
 * Fall (1,00 € und 2,00 €), die Anzeige zeigte also nie eine Stueckzahl -
 * daher das Feedback "Pfandmarken Zaehler" (Miriam Kuehl, 08.09.2026).
 *
 * Runde 57 zaehlt die Marken stattdessen ueber die Positionen, getrennt je
 * Markenwert. Aus dem Euro-Betrag allein waere die Stueckzahl auch gar nicht
 * ermittelbar: 2,00 € offen koennen eine 2-€-Marke oder zwei 1-€-Marken sein.
 *
 * Tests:
 * - Verhaltenstests von offenePfandmarkenJeKasse() gegen eine echte Datenbank
 *   (fake-indexeddb)
 * - Strukturtests fuer die Anzeige in index.html und main.js
 */

import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openDb, put, neueId, geraetId, ersetzeAlle } from "../js/db.js";
import {
  offenePfandmarkenJeKasse,
  kassiervorgangAbschliessen,
  pfandGewinnVerbuchen,
  pfandGewinnStornieren,
} from "../js/repo.js";

// Alle Tests einer Datei teilen sich EINE fake-indexeddb (node --test trennt
// nur je Datei). Die Zaehlung laeuft ueber ALLE Positionen der Datenbank, also
// muss jeder Test mit leerem Stand beginnen - sonst zaehlt er die Verkaeufe
// der Vortests mit. (Dieselbe Falle wie in kassensturz-umbau.test.js.)
async function frischeDb() {
  await openDb();
  for (const store of [
    "positionen",
    "kassiervorgaenge",
    "produkte",
    "lagerbewegungen",
    "pfand_gewinn_verbuchungen",
  ]) {
    await ersetzeAlle(store, []);
  }
}

async function produktAnlegen(name, pfandBetrag, aktiv = true) {
  const id = neueId();
  await put("produkte", {
    id,
    name,
    kategorie: "Getraenk",
    mwst_satz: 19,
    einkaufspreis: 0.5,
    verkaufspreis: 2.0,
    helferpreis: 2.0,
    pfand_betrag: pfandBetrag,
    aktiv,
    datum: "2026-09-01T10:00:00Z",
    benutzer: "test",
    geraet_id: await geraetId(),
    synced: false,
    synced_at: null,
  });
  return id;
}

// ===== VERHALTENSTESTS =====

test("pfandmarken-zaehler: zaehlt Marken je Wert, auch bei zwei Pfandbetraegen", async () => {
  await frischeDb();
  const gross = await produktAnlegen("Cola 0,33", 2.0);
  const klein = await produktAnlegen("Wasser", 1.0);

  await kassiervorgangAbschliessen(
    "Jugend",
    [
      { produktId: gross, menge: 3, einzelpreis: 2.0, einkaufspreis: 0.5, mwstSatz: 19, pfandBetrag: 2.0 },
      { produktId: klein, menge: 1, einzelpreis: 1.5, einkaufspreis: 0.3, mwstSatz: 19, pfandBetrag: 1.0 },
    ],
    20.0,
    "test"
  );

  const daten = (await offenePfandmarkenJeKasse()).Jugend;
  // Frueher waere menge hier null gewesen (zwei verschiedene Pfandbetraege).
  assert.deepStrictEqual(daten.jeWert, [[1.0, 1], [2.0, 3]]);
  assert.strictEqual(daten.menge, 4);
  assert.strictEqual(daten.betrag, 7.0);
});

test("pfandmarken-zaehler: Ruecknahme senkt den Zaehler, Ueberhang bleibt sichtbar", async () => {
  await frischeDb();
  const klein = await produktAnlegen("Wasser", 1.0);

  await kassiervorgangAbschliessen(
    "Jugend",
    [{ produktId: klein, menge: 1, einzelpreis: 1.5, einkaufspreis: 0.3, mwstSatz: 19, pfandBetrag: 1.0 }],
    5.0,
    "test"
  );
  // Zwei Marken zurueck, obwohl nur eine ausgegeben wurde: der Zaehler muss -1
  // zeigen statt den Fehler in einer Gesamtsumme verschwinden zu lassen.
  await kassiervorgangAbschliessen(
    "Jugend",
    [{
      produktId: klein, menge: 2, einzelpreis: 0.0, einkaufspreis: 0.0, mwstSatz: 19,
      pfandBetrag: -1.0, istPfandrueckgabe: true,
    }],
    0.0,
    "test"
  );

  const daten = (await offenePfandmarkenJeKasse()).Jugend;
  assert.deepStrictEqual(daten.jeWert, [[1.0, -1]]);
  assert.strictEqual(daten.menge, -1);
  assert.strictEqual(daten.betrag, -1.0);
});

test("pfandmarken-zaehler: erlassenes Pfand gibt keine Marke aus", async () => {
  await frischeDb();
  const gross = await produktAnlegen("Cola 0,33", 2.0);

  // "Marke vorhanden" (Runde 38) setzt den Pfandbetrag der Zeile auf 0 -
  // es wird keine neue Marke ausgegeben, also darf auch nichts gezaehlt werden.
  await kassiervorgangAbschliessen(
    "Jugend",
    [{
      produktId: gross, menge: 1, einzelpreis: 2.0, einkaufspreis: 0.5, mwstSatz: 19,
      pfandBetrag: 0, pfandErlassen: true,
    }],
    5.0,
    "test"
  );

  const daten = (await offenePfandmarkenJeKasse()).Jugend;
  assert.deepStrictEqual(daten.jeWert, []);
  assert.strictEqual(daten.menge, 0);
});

test("pfandmarken-zaehler: ohne pfandpflichtige Verkaeufe sind null Marken offen", async () => {
  await frischeDb();
  const ohne = await produktAnlegen("Kaffee", 0);

  await kassiervorgangAbschliessen(
    "Jugend",
    [{ produktId: ohne, menge: 1, einzelpreis: 1.5, einkaufspreis: 0.3, mwstSatz: 19, pfandBetrag: 0 }],
    2.0,
    "test"
  );

  const daten = (await offenePfandmarkenJeKasse()).Jugend;
  // Frueher war das "unbekannt" (null), jetzt ist es eine richtige Antwort.
  assert.strictEqual(daten.menge, 0);
  assert.deepStrictEqual(daten.jeWert, []);
});

test("pfandmarken-zaehler: deaktiviertes Produkt zaehlt weiter, die Marke ist ja draussen", async () => {
  await frischeDb();
  const alt = await produktAnlegen("Altes Bier", 2.0, false);

  await kassiervorgangAbschliessen(
    "Senioren",
    [{ produktId: alt, menge: 2, einzelpreis: 2.0, einkaufspreis: 0.5, mwstSatz: 19, pfandBetrag: 2.0 }],
    10.0,
    "test"
  );

  // Bewusste Verhaltensaenderung gegenueber Runde 53: dort bestimmten nur
  // AKTIVE Produkte die Rechnung. Eine Marke verschwindet aber nicht, weil das
  // Produkt aus dem Sortiment genommen wurde - der Kunde kann sie weiter
  // einloesen, und genau darum muss sie im Zaehler stehen.
  const daten = (await offenePfandmarkenJeKasse()).Senioren;
  assert.deepStrictEqual(daten.jeWert, [[2.0, 2]]);
  assert.strictEqual(daten.menge, 2);
});

test("pfandmarken-zaehler: Kassen werden getrennt gezaehlt", async () => {
  await frischeDb();
  const gross = await produktAnlegen("Cola 0,33", 2.0);

  await kassiervorgangAbschliessen(
    "Jugend",
    [{ produktId: gross, menge: 1, einzelpreis: 2.0, einkaufspreis: 0.5, mwstSatz: 19, pfandBetrag: 2.0 }],
    5.0,
    "test"
  );
  await kassiervorgangAbschliessen(
    "Senioren",
    [{ produktId: gross, menge: 4, einzelpreis: 2.0, einkaufspreis: 0.5, mwstSatz: 19, pfandBetrag: 2.0 }],
    20.0,
    "test"
  );

  const alle = await offenePfandmarkenJeKasse();
  assert.deepStrictEqual(alle.Jugend.jeWert, [[2.0, 1]]);
  assert.deepStrictEqual(alle.Senioren.jeWert, [[2.0, 4]]);
});

test("pfandmarken-zaehler: volle Gewinn-Verbuchung setzt den Zaehler zurueck", async () => {
  await frischeDb();
  const gross = await produktAnlegen("Cola 0,33", 2.0);
  const klein = await produktAnlegen("Wasser", 1.0);

  await kassiervorgangAbschliessen(
    "Jugend",
    [
      { produktId: gross, menge: 3, einzelpreis: 2.0, einkaufspreis: 0.5, mwstSatz: 19, pfandBetrag: 2.0 },
      { produktId: klein, menge: 1, einzelpreis: 1.5, einkaufspreis: 0.3, mwstSatz: 19, pfandBetrag: 1.0 },
    ],
    20.0,
    "test"
  );
  const vorher = (await offenePfandmarkenJeKasse()).Jugend;
  assert.strictEqual(vorher.betrag, 7.0);

  const id = await pfandGewinnVerbuchen("Jugend", 7.0, "Saisonabschluss", "test");

  const nachher = (await offenePfandmarkenJeKasse()).Jugend;
  assert.deepStrictEqual(nachher.jeWert, []);
  assert.strictEqual(nachher.menge, 0);
  assert.strictEqual(nachher.betrag, 0);

  // Storno stellt Marken UND Betrag wieder her
  await pfandGewinnStornieren(id, "test");
  const zurueck = (await offenePfandmarkenJeKasse()).Jugend;
  assert.deepStrictEqual(zurueck.jeWert, [[1.0, 1], [2.0, 3]]);
  assert.strictEqual(zurueck.betrag, 7.0);
});

test("pfandmarken-zaehler: volle Verbuchung raeumt auch einen negativen Stand ab", async () => {
  await frischeDb();
  const gross = await produktAnlegen("Cola 0,33", 2.0);
  const klein = await produktAnlegen("Wasser", 1.0);

  await kassiervorgangAbschliessen(
    "Jugend",
    [{ produktId: gross, menge: 2, einzelpreis: 2.0, einkaufspreis: 0.5, mwstSatz: 19, pfandBetrag: 2.0 }],
    10.0,
    "test"
  );
  await kassiervorgangAbschliessen(
    "Jugend",
    [{
      produktId: klein, menge: 2, einzelpreis: 0.0, einkaufspreis: 0.0, mwstSatz: 19,
      pfandBetrag: -1.0, istPfandrueckgabe: true,
    }],
    0.0,
    "test"
  );
  const vorher = (await offenePfandmarkenJeKasse()).Jugend;
  assert.deepStrictEqual(vorher.jeWert, [[1.0, -2], [2.0, 2]]);
  assert.strictEqual(vorher.betrag, 2.0);

  await pfandGewinnVerbuchen("Jugend", 2.0, null, "test");
  const nachher = (await offenePfandmarkenJeKasse()).Jugend;
  assert.deepStrictEqual(nachher.jeWert, []);
  assert.strictEqual(nachher.betrag, 0);
});

test("pfandmarken-zaehler: Teilverbuchung schreibt den hoechsten Markenwert zuerst ab", async () => {
  await frischeDb();
  const gross = await produktAnlegen("Cola 0,33", 2.0);
  const klein = await produktAnlegen("Wasser", 1.0);

  await kassiervorgangAbschliessen(
    "Senioren",
    [
      { produktId: gross, menge: 3, einzelpreis: 2.0, einkaufspreis: 0.5, mwstSatz: 19, pfandBetrag: 2.0 },
      { produktId: klein, menge: 2, einzelpreis: 1.5, einkaufspreis: 0.3, mwstSatz: 19, pfandBetrag: 1.0 },
    ],
    20.0,
    "test"
  );
  await pfandGewinnVerbuchen("Senioren", 4.0, "Teilbetrag", "test");

  const daten = (await offenePfandmarkenJeKasse()).Senioren;
  assert.deepStrictEqual(daten.jeWert, [[1.0, 2], [2.0, 1]]);
  assert.strictEqual(daten.betrag, 4.0);
});

// ===== STRUKTURTESTS =====

test("pfandmarken-zaehler: index.html enthält ein Element mit ID 'pfandmarken-anzeige'", () => {
  const indexHtml = readFileSync("index.html", "utf-8");
  assert.match(
    indexHtml,
    /id="pfandmarken-anzeige"/,
    "index.html sollte ein Element mit id='pfandmarken-anzeige' enthalten"
  );
});

test("pfandmarken-zaehler: pfandmarken-anzeige ist im Kopfbereich der Kassenauswahl", () => {
  const indexHtml = readFileSync("index.html", "utf-8");
  // Das Element sollte relativ nah an kasse-auswahl-bereich sein (in der Kopfleiste)
  const kopfbereich = indexHtml.match(/<header[^>]*>[\s\S]*?<\/header>/)[0];
  assert.match(
    kopfbereich,
    /kasse-auswahl-bereich[\s\S]*pfandmarken-anzeige/,
    "pfandmarken-anzeige sollte nach kasse-auswahl-bereich in der Kopfleiste sein"
  );
});

test("pfandmarken-zaehler: main.js definiert aktualisierePfandmarkenAnzeige() Funktion", () => {
  const mainJs = readFileSync("js/main.js", "utf-8");
  assert.match(
    mainJs,
    /async\s+function\s+aktualisierePfandmarkenAnzeige\s*\(\)/,
    "main.js sollte eine async Funktion 'aktualisierePfandmarkenAnzeige' definieren"
  );
});

test("pfandmarken-zaehler: aktualisierePfandmarkenAnzeige ruft repo.offenePfandmarkenJeKasse auf", () => {
  const mainJs = readFileSync("js/main.js", "utf-8");
  const match = mainJs.match(
    /async\s+function\s+aktualisierePfandmarkenAnzeige\s*\(\)[^{]*\{[\s\S]*?\n\}/
  );
  assert.ok(match, "aktualisierePfandmarkenAnzeige() konnte nicht extrahiert werden");
  const functionCode = match[0];
  assert.ok(
    functionCode.includes("repo.offenePfandmarkenJeKasse"),
    "aktualisierePfandmarkenAnzeige sollte repo.offenePfandmarkenJeKasse aufrufen"
  );
});

test("pfandmarken-zaehler: aktualisierePfandmarkenAnzeige wird beim Wechsel der Kasse aufgerufen", () => {
  const mainJs = readFileSync("js/main.js", "utf-8");
  const match = mainJs.match(
    /function\s+aktualisiereAktuelleAnsichtNachKassenwechsel\s*\(\)[^{]*\{[\s\S]*?\n\}/
  );
  assert.ok(
    match,
    "aktualisiereAktuelleAnsichtNachKassenwechsel() konnte nicht extrahiert werden"
  );
  const functionCode = match[0];
  assert.ok(
    functionCode.includes("aktualisierePfandmarkenAnzeige"),
    "aktualisiereAktuelleAnsichtNachKassenwechsel sollte aktualisierePfandmarkenAnzeige aufrufen"
  );
});

test("pfandmarken-zaehler: aktualisierePfandmarkenAnzeige wird beim Anzeigen des Verkauf-Reiters aufgerufen", () => {
  const mainJs = readFileSync("js/main.js", "utf-8");
  // Suche die zeigeHauptView Funktion und prüfe, ob sie aktualisierePfandmarkenAnzeige in der
  // "verkauf" Branche aufruft
  const zeigeMatch = mainJs.match(/function\s+zeigeHauptView\s*\([^)]*\)[^{]*\{[\s\S]*?\n\}/);
  assert.ok(zeigeMatch, "zeigeHauptView() konnte nicht extrahiert werden");
  const functionCode = zeigeMatch[0];
  // Prüfe, dass es in der if (name === "verkauf") Branche aktualisierePfandmarkenAnzeige gibt
  const verkaufMatch = functionCode.match(
    /if\s*\(\s*name\s*===\s*"verkauf"\s*\)\s*\{[\s\S]*?\n\s*\}/
  );
  assert.ok(
    verkaufMatch && verkaufMatch[0].includes("aktualisierePfandmarkenAnzeige"),
    "In zeigeHauptView sollte die verkauf-Branche aktualisierePfandmarkenAnzeige aufrufen"
  );
});

test("pfandmarken-zaehler: aktualisierePfandmarkenAnzeige wird nach einem Verkauf aufgerufen", () => {
  const mainJs = readFileSync("js/main.js", "utf-8");
  // Suche die bezahlenBestaetigen Funktion
  const bezMatch = mainJs.match(
    /async\s+function\s+bezahlenBestaetigen\s*\(\)[^{]*\{[\s\S]*?\n\}/
  );
  assert.ok(bezMatch, "bezahlenBestaetigen() konnte nicht extrahiert werden");
  const functionCode = bezMatch[0];
  // Nach kassiervorgangAbschliessen sollte aktualisierePfandmarkenAnzeige aufgerufen werden
  const kassiIdx = functionCode.indexOf("kassiervorgangAbschliessen");
  const aktualIdx = functionCode.indexOf("aktualisierePfandmarkenAnzeige");
  assert.ok(
    kassiIdx >= 0,
    "kassiervorgangAbschliessen sollte in bezahlenBestaetigen aufgerufen werden"
  );
  assert.ok(
    aktualIdx >= 0,
    "aktualisierePfandmarkenAnzeige sollte in bezahlenBestaetigen aufgerufen werden"
  );
  assert.ok(
    kassiIdx < aktualIdx,
    "aktualisierePfandmarkenAnzeige sollte NACH kassiervorgangAbschliessen aufgerufen werden"
  );
});

test("pfandmarken-zaehler: pfandmarken-anzeige ist nur im Verkauf-Reiter sichtbar", () => {
  const mainJs = readFileSync("js/main.js", "utf-8");
  // Prüfe, dass die Anzeige in zeigeHauptView() nur für "verkauf" sichtbar ist
  const zeigeMatch = mainJs.match(/function\s+zeigeHauptView\s*\([^)]*\)[^{]*\{[\s\S]*?\n\}/);
  assert.ok(zeigeMatch, "zeigeHauptView() konnte nicht extrahiert werden");
  const functionCode = zeigeMatch[0];
  // Prüfe auf das Muster "name === "verkauf"" und "display" in pfandmarkenAnzeige
  assert.match(
    functionCode,
    /pfandmarkenAnzeige\.style\.display\s*=\s*name\s*===\s*"verkauf"/,
    "pfandmarkenAnzeige sollte nur im Verkauf-Reiter sichtbar sein"
  );
});

test("pfandmarken-zaehler: Betragsfeld der Gewinn-Verbuchung wird vorbelegt", () => {
  const mainJs = readFileSync("js/main.js", "utf-8");
  assert.match(
    mainJs,
    /async function pfandVerbuchenVorbelegen\(\)/,
    "main.js sollte pfandVerbuchenVorbelegen() definieren"
  );
  assert.match(
    mainJs,
    /auPfandBetragFeld\.value = daten\.betrag > 0 \? deZahl\(daten\.betrag\)/,
    "Das Betragsfeld sollte mit dem offenen Pfand vorbelegt werden"
  );
  assert.match(
    mainJs,
    /auPfandKasseAuswahl\.onchange = pfandVerbuchenVorbelegen/,
    "Ein Kassenwechsel sollte die Vorbelegung neu berechnen"
  );
  const indexHtml = readFileSync("index.html", "utf-8");
  assert.match(indexHtml, /id="au-pfand-marken-hinweis"/);
});
