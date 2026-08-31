/**
 * Runde 53 Etappe 5.2 (Tablet-Nachzug): Anzeige offener Pfandmarken
 *
 * Der Reiter "Verkauf" soll anzeigen, wie viele Pfandmarken für die aktive
 * Kasse noch im Umlauf sind, genauso wie die Windows-App. Die Rechenregel
 * muss identisch sein: Pfandbetrag / Pfandwert pro Marke, gerundet auf ganze
 * Stückzahlen. Bei mehreren verschiedenen Pfandbeträgen unter den aktiven
 * Produkten ist menge = null (nur Euro-Betrag anzeigen, um keine falschen
 * Stückzahlen zu erfinden).
 *
 * Tests:
 * - Verhaltenstests der neuen Funktion offenePfandmarkenJeKasse() mit echten
 *   Datenbanken (via fake-indexeddb)
 * - Strukturtests für die Anzeige in index.html und main.js
 */

import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openDb, put, neueId, geraetId } from "../js/db.js";
import {
  offenePfandmarkenJeKasse,
  kassiervorgangAbschliessen,
  listeProdukte,
} from "../js/repo.js";
import { VERANSTALTUNGEN } from "../js/config.js";

// ===== VERHALTENSTESTS =====

test("pfandmarken-zaehler: Ein Pfandbetrag, offenes Pfand 26,00 € bei 2,00 € pro Marke = 13 Marken", async () => {
  await openDb();

  // Produkt mit Pfand 2,00 EUR
  const produktId = neueId();
  await put("produkte", {
    id: produktId,
    name: "TestCola",
    kategorie: "Getraenke",
    mwst_satz: 19,
    einkaufspreis: 0.50,
    verkaufspreis: 2.50,
    helferpreis: 2.50,
    pfand_betrag: 2.00, // Ein einziger Pfandbetrag
    aktiv: 1, // Aktiv!
    aktualisiert_am: "2026-08-30T10:00:00Z",
    geraet_id: await geraetId(),
    synced: false,
    synced_at: null,
  });

  // 13 Verkäufe mit je 2,00 EUR Pfand = 26,00 EUR offenes Pfand
  const warenkorb = [
    {
      produktId,
      name: "TestCola",
      menge: 13,
      einzelpreis: 2.50,
      einkaufspreis: 0.50,
      mwstSatz: 19,
      istHelferpreis: false,
      pfandBetrag: 2.00,
      istPfandrueckgabe: false,
    },
  ];

  // Gesamtbetrag: 13 * (2.50 + 2.00) = 13 * 4.50 = 58.50 EUR
  await kassiervorgangAbschliessen("Jugend", warenkorb, 60.00, "test");

  // Jetzt die Funktion aufrufen
  const ergebnis = await offenePfandmarkenJeKasse();
  const daten = ergebnis["Jugend"];

  assert.ok(daten, "Jugend sollte in den Ergebnissen sein");
  assert.strictEqual(daten.betrag, 26.00, "Betrag sollte 26,00 EUR sein");
  assert.strictEqual(daten.menge, 13, "Menge sollte 13 Marken sein");
});

test("pfandmarken-zaehler: Zwei verschiedene Pfandbeträge => menge = null, aber betrag korrekt", async () => {
  await openDb();

  // Zwei Produkte mit unterschiedlichen Pfandbeträgen
  const produktId1 = neueId();
  const produktId2 = neueId();

  await put("produkte", {
    id: produktId1,
    name: "TestCola",
    kategorie: "Getraenke",
    mwst_satz: 19,
    einkaufspreis: 0.50,
    verkaufspreis: 2.50,
    helferpreis: 2.50,
    pfand_betrag: 2.00, // Pfandbetrag A
    aktiv: 1,
    aktualisiert_am: "2026-08-30T10:00:00Z",
    geraet_id: await geraetId(),
    synced: false,
    synced_at: null,
  });

  await put("produkte", {
    id: produktId2,
    name: "TestBier",
    kategorie: "Getraenke",
    mwst_satz: 19,
    einkaufspreis: 1.00,
    verkaufspreis: 4.00,
    helferpreis: 4.00,
    pfand_betrag: 0.50, // Anderer Pfandbetrag B
    aktiv: 1,
    aktualisiert_am: "2026-08-30T10:00:00Z",
    geraet_id: await geraetId(),
    synced: false,
    synced_at: null,
  });

  // Verkauf: 10x Cola (2,00 EUR) + 5x Bier (0,50 EUR) = 20,00 + 2,50 = 22,50 EUR Pfand
  const warenkorb = [
    {
      produktId: produktId1,
      name: "TestCola",
      menge: 10,
      einzelpreis: 2.50,
      einkaufspreis: 0.50,
      mwstSatz: 19,
      istHelferpreis: false,
      pfandBetrag: 2.00,
      istPfandrueckgabe: false,
    },
    {
      produktId: produktId2,
      name: "TestBier",
      menge: 5,
      einzelpreis: 4.00,
      einkaufspreis: 1.00,
      mwstSatz: 19,
      istHelferpreis: false,
      pfandBetrag: 0.50,
      istPfandrueckgabe: false,
    },
  ];

  // Gesamtbetrag: (10 * (2.50 + 2.00)) + (5 * (4.00 + 0.50)) = 45.00 + 22.50 = 67.50 EUR
  await kassiervorgangAbschliessen("Senioren", warenkorb, 70.00, "test");

  const ergebnis = await offenePfandmarkenJeKasse();
  const daten = ergebnis["Senioren"];

  assert.ok(daten, "Senioren sollte in den Ergebnissen sein");
  assert.strictEqual(daten.betrag, 22.50, "Betrag sollte 22,50 EUR sein");
  assert.strictEqual(
    daten.menge,
    null,
    "Menge sollte null sein (mehrere verschiedene Pfandbeträge)"
  );
});

test("pfandmarken-zaehler: Kein pfandpflichtiges aktives Produkt => menge === null", async () => {
  await openDb();

  // Die Datenbank ist geteilt zwischen Tests. Die Kassiervorgänge aus Test 1 und 2
  // haben bereits Pfand in der Datenbank. Um zu prüfen, dass OHNE aktive
  // Pfandprodukte menge === null ist, nutzen wir einen anderen Weg: Wir setzen
  // ALLE Produkte auf inaktiv und überprüfen, dass menge === null.
  const alleProdukte = await listeProdukte(false); // inkl. inaktiver
  for (const p of alleProdukte) {
    if (p.aktiv) {
      // Deaktiviere alle aktiven Produkte
      await put("produkte", { ...p, aktiv: 0 });
    }
  }

  // Rufe die Funktion auf: es gibt keine AKTIVEN Produkte mit Pfand,
  // also muss menge === null sein, egal wie viel betrag existiert.
  const ergebnis = await offenePfandmarkenJeKasse();

  // Prüfe auf eine Kasse mit existierendem Pfand (von frühen Tests)
  for (const kasse of Object.values(ergebnis)) {
    if (kasse.betrag > 0) {
      // Es existiert Pfand aus früheren Tests, aber da alle Produkte inaktiv sind,
      // muss menge === null sein
      assert.strictEqual(
        kasse.menge,
        null,
        "menge sollte null sein, wenn es keine AKTIVEN Pfand-Produkte gibt"
      );
    }
  }

  // Stelle Produkte wieder her: Aktiviere das erste deaktivierte Produkt wieder
  for (const p of alleProdukte) {
    if (!p.aktiv) {
      await put("produkte", { ...p, aktiv: 1 });
      break; // Nur eins reaktivieren, damit andere Tests nicht gestört werden
    }
  }
});

test("pfandmarken-zaehler: Deaktiviertes Produkt mit Pfand wird nicht berücksichtigt", async () => {
  await openDb();

  // Die Datenbank ist geteilt: Um einen bekannten Ausgangszustand herzustellen,
  // neutralisieren wir alle bestehenden Produkte (pfand_betrag = 0).
  const alleProdukte = await listeProdukte(false); // inkl. inaktiver
  for (const p of alleProdukte) {
    await put("produkte", { ...p, pfand_betrag: 0 });
  }

  // Anlegen: genau 1 aktives Produkt mit 2,00 EUR Pfand
  const aktivProdId = neueId();
  await put("produkte", {
    id: aktivProdId,
    name: "TestColaAktivOnly",
    kategorie: "Getraenke",
    mwst_satz: 19,
    einkaufspreis: 0.50,
    verkaufspreis: 2.50,
    helferpreis: 2.50,
    pfand_betrag: 2.00,
    aktiv: 1,
    aktualisiert_am: "2026-08-30T10:00:00Z",
    geraet_id: await geraetId(),
    synced: false,
    synced_at: null,
  });

  // Anlegen: genau 1 deaktiviertes Produkt mit abweichendem 0,80 EUR Pfand
  const inaktivProdId = neueId();
  await put("produkte", {
    id: inaktivProdId,
    name: "TestBierInaktivOnly",
    kategorie: "Getraenke",
    mwst_satz: 19,
    einkaufspreis: 0.80,
    verkaufspreis: 3.50,
    helferpreis: 3.50,
    pfand_betrag: 0.80,
    aktiv: 0, // DEAKTIVIERT
    aktualisiert_am: "2026-08-30T10:00:00Z",
    geraet_id: await geraetId(),
    synced: false,
    synced_at: null,
  });

  // Verkauf mit dem aktiven Produkt
  const warenkorb = [
    {
      produktId: aktivProdId,
      name: "TestColaAktivOnly",
      menge: 10,
      einzelpreis: 2.50,
      einkaufspreis: 0.50,
      mwstSatz: 19,
      istHelferpreis: false,
      pfandBetrag: 2.00,
      istPfandrueckgabe: false,
    },
  ];

  await kassiervorgangAbschliessen("Senioren", warenkorb, 50.00, "test");

  const ergebnis = await offenePfandmarkenJeKasse();
  const daten = ergebnis["Senioren"];

  assert.ok(daten, "Senioren sollte in den Ergebnissen sein");
  // menge sollte NICHT null sein: es gibt nur einen eindeutigen aktiven Pfandbetrag (2,00 EUR)
  assert.ok(daten.menge !== null, "menge sollte nicht null sein (nur 1 aktiver Pfandbetrag: 2,00 EUR)");
  // Das Verhältnis menge = betrag / 2.00 muss passen
  const erwartete_menge = Math.round(daten.betrag / 2.00);
  assert.strictEqual(daten.menge, erwartete_menge, `menge sollte ${erwartete_menge} sein (betrag / 2,00)`);
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
