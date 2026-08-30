// Test fuer Runde 46: Einkaufspreis von 0,00 EUR wird wie "kein Preis erfasst" behandelt.
// Testet wareneinkaufGesamt() mit mehreren Produkten und Fallback auf Produkt-einkaufspreis.
// Python-Pendant: tests/test_repository.py - test_wareneinkauf_gesamt_*

import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb, put, neueId, geraetId } from "../js/db.js";
import { wareneinkaufGesamt } from "../js/repo.js";

test("wareneinkaufGesamt: Null-Preis wird mit Produkt-einkaufspreis ersetzt", async () => {
  // Vorbereitung: Datenbank oeffnen
  await openDb();

  // Produkt 1: "Cola" mit einkaufspreis 0.60
  const colaId = neueId();
  await put("produkte", {
    id: colaId,
    name: "Cola",
    kategorie: "Getraenke",
    mwst_satz: 19,
    einkaufspreis: 0.60,
    verkaufspreis: 1.50,
    helferpreis: 1.50,
    pfand_betrag: 0.08,
    datum: "2026-08-30T10:00:00Z",
    benutzer: "test",
    geraet_id: await geraetId(),
    synced: false,
    synced_at: null,
  });

  // Produkt 2: "Wasser" mit einkaufspreis 0.30
  const wasserId = neueId();
  await put("produkte", {
    id: wasserId,
    name: "Wasser",
    kategorie: "Getraenke",
    mwst_satz: 19,
    einkaufspreis: 0.30,
    verkaufspreis: 0.80,
    helferpreis: 0.80,
    pfand_betrag: 0.08,
    datum: "2026-08-30T10:00:00Z",
    benutzer: "test",
    geraet_id: await geraetId(),
    synced: false,
    synced_at: null,
  });

  // Wareneingang 1: Cola 10 Stueck zu 0.60 EUR (realistisch erfasst)
  // -> netto: 10 * 0.60 = 6,00 EUR
  await put("lagerbewegungen", {
    id: neueId(),
    produkt_id: colaId,
    typ: "Wareneingang",
    menge: 10,
    datum: "2026-08-25T09:00:00Z",
    kommentar: "Cola mit erfasstem Preis",
    beleg_pfad: null,
    rechner: "tablet",
    geraet_id: await geraetId(),
    synced: false,
    synced_at: null,
    einzelpreis: 0.60,
    mwst_satz: 19,
    benutzer: "test",
    ist_abschreibung: false,
    abschreibung_grund: null,
    storno_von: null,
  });

  // Wareneingang 2: Wasser 5 Stueck zu 0,00 EUR (wird ignoriert, Runde 46)
  // -> Fallback auf Produkt-einkaufspreis 0.30 EUR
  // -> netto: 5 * 0.30 = 1,50 EUR
  await put("lagerbewegungen", {
    id: neueId(),
    produkt_id: wasserId,
    typ: "Wareneingang",
    menge: 5,
    datum: "2026-08-26T10:00:00Z",
    kommentar: "Wasser ohne Preis",
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

  // Gesamtnetto: 6,00 + 1,50 = 7,50 EUR
  const ergebnis = await wareneinkaufGesamt();

  assert.strictEqual(
    ergebnis,
    7.50,
    `wareneinkaufGesamt sollte 7.50 sein (6.00 + 1.50), erhielt ${ergebnis}`
  );
});
