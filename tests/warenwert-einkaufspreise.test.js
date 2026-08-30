// Test fuer Runde 5 Schritt 5.5 (Prüfbericht B6): Warenwert benutzt tatsaechliche Einkaufspreise
// statt Stammdatenpreise.
//
// Problem: Die Warenwert-Anzeigen in renderWarenwirtschaft() und bestandDrucken() verwendeten
// p.einkaufspreis (Stammdatenpreis), nicht die mengengewichteten Durchschnitte der
// tatsaechlich bei Lieferungen gezahlten Preise. Seit Runde 46 ist der Stammdatenpreis nur noch
// Rueckfallwert fuer Produkte ohne Lieferhistorie.
//
// Loesung: Beide Stellen verwenden jetzt einkaufspreiseJeProdukt() aus repo.js, die bereits
// den korrekten gewichteten Durchschnitt berechnet (mit Rueckfall auf Stammdatenpreis).

import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openDb, put, neueId, geraetId } from "../js/db.js";
import {
  listeProdukte,
  lieferantenPfandErfassen,
  einkaufspreiseJeProdukt,
  lagerwertGesamt,
} from "../js/repo.js";

test("warenwert-einkaufspreise: einkaufspreiseJeProdukt nutzt Lieferpreis statt Stammdatenpreis", async () => {
  await openDb();

  // Produkt mit Stammdatenpreis 1.00 EUR anlegen
  const produktId = neueId();
  const stammdatenpreis = 1.00;
  const lieferpreis = 0.50; // Abweichender Lieferpreis

  await put("produkte", {
    id: produktId,
    name: "TestCola_Preis",
    kategorie: "Getraenke",
    mwst_satz: 19,
    einkaufspreis: stammdatenpreis,
    verkaufspreis: 2.00,
    helferpreis: 2.00,
    pfand_betrag: 0.08,
    datum: "2026-08-30T10:00:00Z",
    benutzer: "test",
    geraet_id: await geraetId(),
    synced: false,
    synced_at: null,
  });

  // Ohne Wareneingang: einkaufspreiseJeProdukt sollte Stammdatenpreis zurueckgeben
  let preise = await einkaufspreiseJeProdukt();
  assert.strictEqual(
    preise[produktId],
    stammdatenpreis,
    `Ohne Wareneingang sollte Stammdatenpreis ${stammdatenpreis} verwendet werden, erhielt ${preise[produktId]}`
  );

  // Wareneingang: 10 Stueck zu 0,50 EUR (abweichend vom Stammdatenpreis)
  await lieferantenPfandErfassen(
    0, // bezahlt
    0, // erhalten
    null, // kommentar
    "test", // benutzerName
    [
      {
        produktId,
        menge: 10,
        einzelpreis: lieferpreis, // 0.50 EUR statt Stammdatenpreis 1.00 EUR
        mwstSatz: 19,
        pfandBezahlt: null,
        pfandErhalten: null,
      },
    ]
  );

  // Nach Wareneingang: einkaufspreiseJeProdukt sollte Lieferpreis zurueckgeben, NICHT Stammdatenpreis
  preise = await einkaufspreiseJeProdukt();
  assert.strictEqual(
    preise[produktId],
    lieferpreis,
    `Nach Wareneingang sollte Lieferpreis ${lieferpreis} verwendet werden, erhielt ${preise[produktId]}`
  );

  // Verifikation: Der Unterschied ist deutlich (50 % Abweichung)
  assert.ok(
    preise[produktId] < stammdatenpreis,
    `Lieferpreis sollte unter Stammdatenpreis liegen`
  );
});

test("warenwert-einkaufspreise: Lagerwert nutzt Lieferpreis nicht Stammdatenpreis", async () => {
  await openDb();

  // Produkt mit Stammdatenpreis 2.00 EUR
  const produktId = neueId();
  const stammdatenpreis = 2.00;
  const lieferpreis = 0.80; // 60% guenstiger als Stammdatenpreis
  const menge = 25;

  await put("produkte", {
    id: produktId,
    name: "TestWasser_Lagerwert",
    kategorie: "Getraenke",
    mwst_satz: 19,
    einkaufspreis: stammdatenpreis,
    verkaufspreis: 1.50,
    helferpreis: 1.50,
    pfand_betrag: 0.08,
    datum: "2026-08-30T10:00:00Z",
    benutzer: "test",
    geraet_id: await geraetId(),
    synced: false,
    synced_at: null,
  });

  // Lagerwert vorher
  const lagerwertVorher = await lagerwertGesamt();

  // Wareneingang: 25 Stueck zu 0,80 EUR
  // Mit Stammdatenpreis: 25 * 2.00 = 50,00 EUR
  // Mit Lieferpreis: 25 * 0.80 = 20,00 EUR
  // Unterschied: 30,00 EUR (60 % Abweichung)
  await lieferantenPfandErfassen(
    0,
    0,
    null,
    "test",
    [
      {
        produktId,
        menge,
        einzelpreis: lieferpreis,
        mwstSatz: 19,
        pfandBezahlt: null,
        pfandErhalten: null,
      },
    ]
  );

  // Lagerwert nachher
  const lagerwertNachher = await lagerwertGesamt();
  const lagerwertSteigerung = lagerwertNachher - lagerwertVorher;

  // Wenn die falsche Implementierung (Stammdatenpreis) benutzt wuerde,
  // waere die Steigerung: 25 * 2.00 = 50.00 EUR
  // Mit korrekter Implementierung (Lieferpreis): 25 * 0.80 = 20.00 EUR
  const erwarteteMindestSteigerung = menge * lieferpreis; // 20.00
  const erwartetMaximalSteigerung = menge * lieferpreis + 0.01; // Mit Rounding-Toleranz

  assert.ok(
    lagerwertSteigerung >= erwarteteMindestSteigerung && lagerwertSteigerung <= erwartetMaximalSteigerung,
    `Lagerwert sollte um etwa ${erwarteteMindestSteigerung} steigen (mit Lieferpreis), erhielt ${lagerwertSteigerung}. ` +
    `Bei falscher Verwendung von Stammdatenpreis waere es ${menge * stammdatenpreis}.`
  );

  // Verifikation: Steigerung ist NICHT der Wert mit Stammdatenpreis
  const falscheSteigerung = menge * stammdatenpreis; // Das waere FALSCH
  assert.ok(
    Math.abs(lagerwertSteigerung - falscheSteigerung) > 20, // Deutlicher Unterschied
    `Lagerwert-Steigerung sollte NOT ${falscheSteigerung} sein (Stammdatenpreis), erhielt ${lagerwertSteigerung}`
  );
});

test("warenwert-einkaufspreise: Mit mehreren Liefervorgaengen wird Durchschnittspreis verwendet", async () => {
  await openDb();

  // Produkt mit Stammdatenpreis 1.50 EUR
  const produktId = neueId();
  const stammdatenpreis = 1.50;

  await put("produkte", {
    id: produktId,
    name: "TestBier_Durchschnitt",
    kategorie: "Getraenke",
    mwst_satz: 19,
    einkaufspreis: stammdatenpreis,
    verkaufspreis: 3.00,
    helferpreis: 3.00,
    pfand_betrag: 0.08,
    datum: "2026-08-30T10:00:00Z",
    benutzer: "test",
    geraet_id: await geraetId(),
    synced: false,
    synced_at: null,
  });

  // 1. Lieferung: 10 Stueck zu 1.00 EUR
  await lieferantenPfandErfassen(0, 0, null, "test", [
    {
      produktId,
      menge: 10,
      einzelpreis: 1.00,
      mwstSatz: 19,
      pfandBezahlt: null,
      pfandErhalten: null,
    },
  ]);

  // Nach 1. Lieferung: Durchschnittspreis sollte 1.00 EUR sein
  let preise = await einkaufspreiseJeProdukt();
  assert.strictEqual(
    preise[produktId],
    1.00,
    `Nach 1. Lieferung sollte Durchschnittspreis 1.00 sein, erhielt ${preise[produktId]}`
  );

  // 2. Lieferung: 10 Stueck zu 0.80 EUR
  await lieferantenPfandErfassen(0, 0, null, "test", [
    {
      produktId,
      menge: 10,
      einzelpreis: 0.80,
      mwstSatz: 19,
      pfandBezahlt: null,
      pfandErhalten: null,
    },
  ]);

  // Nach 2. Lieferung: Durchschnittspreis sollte (10*1.00 + 10*0.80) / 20 = 0.90 EUR sein
  preise = await einkaufspreiseJeProdukt();
  const erwarteterDurchschnitt = 0.90;
  assert.strictEqual(
    preise[produktId],
    erwarteterDurchschnitt,
    `Nach 2. Lieferung sollte Durchschnittspreis ${erwarteterDurchschnitt} sein, erhielt ${preise[produktId]}`
  );

  // Verifikation: Der Durchschnittspreis ist NICHT der Stammdatenpreis
  assert.ok(
    preise[produktId] !== stammdatenpreis,
    `Durchschnittspreis sollte NOT ${stammdatenpreis} sein`
  );
});

test("warenwert-einkaufspreise: Null-Preise werden ignoriert (Runde 46)", async () => {
  await openDb();

  // Produkt mit Stammdatenpreis 0.75 EUR
  const produktId = neueId();
  const stammdatenpreis = 0.75;

  await put("produkte", {
    id: produktId,
    name: "TestSaft_NullPreis",
    kategorie: "Getraenke",
    mwst_satz: 19,
    einkaufspreis: stammdatenpreis,
    verkaufspreis: 1.80,
    helferpreis: 1.80,
    pfand_betrag: 0.08,
    datum: "2026-08-30T10:00:00Z",
    benutzer: "test",
    geraet_id: await geraetId(),
    synced: false,
    synced_at: null,
  });

  // Wareneingang mit Null-Preis (sollte ignoriert werden)
  // In Warenkorb kann das passieren, wenn Menge versehentlich nicht eingegeben wurde
  // oder bei Fehlerfällen (seit Runde 46 wird das explizit ignoriert)
  await lieferantenPfandErfassen(0, 0, null, "test", [
    {
      produktId,
      menge: 10,
      einzelpreis: 0.00, // Null-Preis wird ignoriert
      mwstSatz: 19,
      pfandBezahlt: null,
      pfandErhalten: null,
    },
  ]);

  // Preis sollte NOCH IMMER der Stammdatenpreis sein (Null-Preis wird ignoriert)
  let preise = await einkaufspreiseJeProdukt();
  assert.strictEqual(
    preise[produktId],
    stammdatenpreis,
    `Mit Null-Preis sollte Stammdatenpreis ${stammdatenpreis} als Fallback gelten, erhielt ${preise[produktId]}`
  );

  // Nun kommt ein realistischer Wareneingang
  await lieferantenPfandErfassen(0, 0, null, "test", [
    {
      produktId,
      menge: 5,
      einzelpreis: 0.60,
      mwstSatz: 19,
      pfandBezahlt: null,
      pfandErhalten: null,
    },
  ]);

  // Der Null-Preis wird bei der Durchschnittsberechnung ignoriert:
  // Nur die 5 Stueck zu 0.60 EUR zaehlen
  preise = await einkaufspreiseJeProdukt();
  assert.strictEqual(
    preise[produktId],
    0.60,
    `Nach Wareneingang mit realem Preis sollte dieser 0.60 sein (Null-Preis ignoriert), erhielt ${preise[produktId]}`
  );
});

// --- Quelltextprüfungen für main.js ---
// Diese Tests verifizieren, dass renderWarenwirtschaft() und bestandDrucken()
// einkaufspreiseJeProdukt() tatsächlich VERWENDEN und nicht die alte
// Preistabelle aus Stammdatenpreisen.

test("warenwert-einkaufspreise: renderWarenwirtschaft() benutzt einkaufspreiseJeProdukt()", () => {
  const quelltext = readFileSync("js/main.js", "utf-8");

  // Extrahiere die renderWarenwirtschaft() Funktion (von Zeile 2487 bis schließende Klammer)
  const renderMatch = quelltext.match(/async function renderWarenwirtschaft\(\)[^{]*\{[\s\S]*?\n\}/);
  assert.ok(
    renderMatch,
    "renderWarenwirtschaft() Funktion konnte nicht extrahiert werden"
  );

  const renderRumpf = renderMatch[0];
  assert.ok(
    renderRumpf.includes("einkaufspreiseJeProdukt"),
    "renderWarenwirtschaft() muss einkaufspreiseJeProdukt() aufrufen"
  );

  // Prüfe, dass die alte Preistabelle NICHT verwendet wird
  const hatAltePreistabelle = /\.einkaufspreis\s*\|\|\s*0/.test(renderRumpf);
  assert.strictEqual(
    hatAltePreistabelle,
    false,
    "renderWarenwirtschaft() darf nicht Object.fromEntries(alleProdukte.map((p) => [p.id, p.einkaufspreis || 0])) enthalten"
  );
});

test("warenwert-einkaufspreise: bestandDrucken() benutzt einkaufspreiseJeProdukt()", () => {
  const quelltext = readFileSync("js/main.js", "utf-8");

  // Extrahiere die bestandDrucken() Funktion (von Zeile 2523 bis schließende Klammer)
  const bestandMatch = quelltext.match(/async function bestandDrucken\(\)[^{]*\{[\s\S]*?\n\}/);
  assert.ok(
    bestandMatch,
    "bestandDrucken() Funktion konnte nicht extrahiert werden"
  );

  const bestandRumpf = bestandMatch[0];
  assert.ok(
    bestandRumpf.includes("einkaufspreiseJeProdukt"),
    "bestandDrucken() muss einkaufspreiseJeProdukt() aufrufen"
  );

  // Prüfe, dass die alte Preistabelle NICHT verwendet wird
  const hatAltePreistabelle = /\.einkaufspreis\s*\|\|\s*0/.test(bestandRumpf);
  assert.strictEqual(
    hatAltePreistabelle,
    false,
    "bestandDrucken() darf nicht Object.fromEntries(alleProdukte.map((p) => [p.id, p.einkaufspreis || 0])) enthalten"
  );
});
