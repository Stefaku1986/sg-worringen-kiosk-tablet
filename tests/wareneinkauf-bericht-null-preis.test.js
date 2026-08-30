// Test fuer Runde 46: Einkaufspreis von 0,00 EUR wird wie "kein Preis erfasst" behandelt.
// Testet wareneinkaufBericht() mit Fallback auf Produkt-einkaufspreis.
// Python-Pendant: tests/test_repository.py - test_wareneinkauf_bericht_*

import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb, put, neueId, geraetId } from "../js/db.js";
import { wareneinkaufBericht } from "../js/repo.js";

test("wareneinkaufBericht: Null-Preis fuehrt zu geschaetzt=true mit Produkt-einkaufspreis", async () => {
  // Vorbereitung: Datenbank oeffnen
  await openDb();

  // Produkt "Cola" anlegen
  const produktId = neueId();
  await put("produkte", {
    id: produktId,
    name: "Cola",
    kategorie: "Getraenke",
    mwst_satz: 19,
    einkaufspreis: 0.40,
    verkaufspreis: 1.50,
    helferpreis: 1.50,
    pfand_betrag: 0.08,
    datum: "2026-08-30T10:00:00Z",
    benutzer: "test",
    geraet_id: await geraetId(),
    synced: false,
    synced_at: null,
  });

  // Wareneingang: 20 Stueck zu 0,00 EUR (wird ignoriert, Runde 46)
  // -> Fallback auf Produkt-einkaufspreis 0,40 EUR
  // -> geschaetzt: true
  // -> netto: 20 * 0,40 = 8,00 EUR (aus dem Produkt-einkaufspreis)
  const monatStr = "2026-08";
  await put("lagerbewegungen", {
    id: neueId(),
    produkt_id: produktId,
    typ: "Wareneingang",
    menge: 20,
    datum: `${monatStr}-27T14:30:00Z`,
    kommentar: "Nachbestellung ohne Preis",
    beleg_pfad: null,
    rechner: "tablet",
    geraet_id: await geraetId(),
    synced: false,
    synced_at: null,
    einzelpreis: 0,
    mwst_satz: 0,
    benutzer: "test",
    ist_abschreibung: false,
    abschreibung_grund: null,
    storno_von: null,
  });

  const ergebnis = await wareneinkaufBericht(2026, 8);

  assert.strictEqual(ergebnis.length, 1, "genau einen Eintrag erwartet");

  const eintrag = ergebnis[0];
  assert.strictEqual(eintrag.produkt_id, produktId);
  assert.strictEqual(eintrag.name, "Cola");
  assert.strictEqual(eintrag.menge, 20, `menge sollte 20 sein, erhielt ${eintrag.menge}`);
  assert.strictEqual(
    eintrag.netto,
    8.00,
    `netto sollte 8.00 sein (20 * 0.40 aus Produkt-einkaufspreis), erhielt ${eintrag.netto}`
  );
  assert.strictEqual(
    eintrag.geschaetzt,
    true,
    `geschaetzt sollte true sein, erhielt ${eintrag.geschaetzt}`
  );
});
