// Test fuer Runde 46: Einkaufspreis von 0,00 EUR wird wie "kein Preis erfasst" behandelt.
// Testet indirekt einkaufspreiseJeProdukt() ueber lagerwertGesamt().
// Python-Pendant: tests/test_repository.py - test_einkaufspreise_je_produkt_*

import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb, put, neueId, geraetId } from "../js/db.js";
import { lagerwertGesamt } from "../js/repo.js";

test("lagerwertGesamt: Null-Preis ignorieren beim Durchschnitt", async () => {
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

  // Wareneingang 1: 10 Stueck zu 0,50 EUR (realistisch erfasster Preis)
  await put("lagerbewegungen", {
    id: neueId(),
    produkt_id: produktId,
    typ: "Wareneingang",
    menge: 10,
    datum: "2026-08-25T09:00:00Z",
    kommentar: "Nachbestellung mit Preis",
    beleg_pfad: null,
    rechner: "tablet",
    geraet_id: await geraetId(),
    synced: false,
    synced_at: null,
    einzelpreis: 0.50,
    mwst_satz: 19,
    benutzer: "test",
    ist_abschreibung: false,
    abschreibung_grund: null,
    storno_von: null,
  });

  // Wareneingang 2: 30 Stueck zu 0,00 EUR (wird ignoriert, Runde 46)
  await put("lagerbewegungen", {
    id: neueId(),
    produkt_id: produktId,
    typ: "Wareneingang",
    menge: 30,
    datum: "2026-08-26T10:00:00Z",
    kommentar: "Nachbestellung ohne Preis",
    beleg_pfad: null,
    rechner: "tablet",
    geraet_id: await geraetId(),
    synced: false,
    synced_at: null,
    einzelpreis: 0,
    mwst_satz: 19,
    benutzer: "test",
    ist_abschreibung: false,
    abschreibung_grund: null,
    storno_von: null,
  });

  // Bestand: 10 + 30 = 40 Stueck
  // Einkaufspreise: nur der erste Wareneingang zaehlt -> 10 * 0,50 / 10 = 0,50 pro Stueck
  // Lagerwert: 40 * 0,50 = 20,00
  const ergebnis = await lagerwertGesamt();

  assert.strictEqual(
    ergebnis,
    20.00,
    `lagerwertGesamt sollte 20.00 sein (40 * 0.50), erhielt ${ergebnis}`
  );
});
