// Runde 46: Der Monatsbericht wird nach Speisen und Getraenken aufgeteilt.
//
// Entscheidend ist die Invariante: die Werte je Kasse muessen exakt die
// Summe ihrer beiden Warengruppen-Zeilen sein - sonst wuerde die gedruckte
// Tabelle nicht aufgehen. Pendant zu
// tests/test_repository.py::test_monatsabrechnung_teilt_nach_getraenken_und_speisen
// in der Windows-App.

import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb, put, neueId, geraetId } from "../js/db.js";
import { kassiervorgangAbschliessen, lagerbewegungErfassen, monatsabrechnung } from "../js/repo.js";

const FELDER = ["erloes", "mwst_7", "mwst_19", "gewinn", "pfand", "wareneinsatz"];

async function produkt(name, kategorie, mwst, einkauf, verkauf) {
  const id = neueId();
  await put("produkte", {
    id,
    name,
    kategorie,
    mwst_satz: mwst,
    einkaufspreis: einkauf,
    verkaufspreis: verkauf,
    helferpreis: verkauf,
    pfand_betrag: 0,
    aktiv: 1,
    datum: "2026-08-30T10:00:00Z",
    benutzer: "test",
    geraet_id: await geraetId(),
    synced: false,
    synced_at: null,
  });
  return id;
}

test("monatsbericht: Kasse ist exakt die Summe von Getraenken und Speisen", async () => {
  await openDb();
  const gid = await geraetId();

  const cola = await produkt("TestCola_WG", "Getraenk", 19, 0.5, 1.5);
  const wurst = await produkt("TestWurst_WG", "Speise", 7, 0.8, 2.5);
  await lagerbewegungErfassen(cola, "Wareneingang", 20, "Lieferung", "test", gid, 0.6, 19);
  await lagerbewegungErfassen(wurst, "Wareneingang", 20, "Lieferung", "test", gid, 1.0, 7);

  await kassiervorgangAbschliessen(
    "Jugend",
    [
      { produktId: cola, menge: 4, einzelpreis: 1.5, einkaufspreis: 0.5, mwstSatz: 19 },
      { produktId: wurst, menge: 2, einzelpreis: 2.5, einkaufspreis: 0.8, mwstSatz: 7 },
    ],
    20.0,
    "test"
  );
  await kassiervorgangAbschliessen(
    "Senioren",
    [{ produktId: wurst, menge: 3, einzelpreis: 2.5, einkaufspreis: 0.8, mwstSatz: 7 }],
    10.0,
    "test"
  );

  const jetzt = new Date();
  const m = await monatsabrechnung(jetzt.getFullYear(), jetzt.getMonth() + 1);
  const jeKat = m.je_kasse_kategorie;

  // Erloes landet in der richtigen Warengruppe
  assert.strictEqual(jeKat.Jugend.Getraenk.erloes, 6.0);
  assert.strictEqual(jeKat.Jugend.Speise.erloes, 5.0);
  assert.strictEqual(jeKat.Senioren.Getraenk.erloes, 0);
  assert.strictEqual(jeKat.Senioren.Speise.erloes, 7.5);

  // MwSt. folgt dem Produkt: Getraenke 19 %, Speisen 7 %
  assert.ok(jeKat.Jugend.Getraenk.mwst_19 > 0);
  assert.strictEqual(jeKat.Jugend.Getraenk.mwst_7, 0);
  assert.ok(jeKat.Jugend.Speise.mwst_7 > 0);
  assert.strictEqual(jeKat.Jugend.Speise.mwst_19, 0);

  // Wareneinsatz je Warengruppe (Menge x tatsaechlichem Netto-Einkaufspreis),
  // identisch zur Windows-App
  assert.strictEqual(jeKat.Jugend.Getraenk.wareneinsatz, 2.4);
  assert.strictEqual(jeKat.Senioren.Speise.wareneinsatz, 3.0);

  // Kernbedingung: Kasse = Summe ihrer Warengruppen, fuer JEDE Kennzahl
  for (const kasse of ["Jugend", "Senioren"]) {
    for (const feld of FELDER) {
      assert.strictEqual(
        m.je_kasse[kasse][feld],
        Math.round((jeKat[kasse].Getraenk[feld] + jeKat[kasse].Speise[feld]) * 100) / 100,
        `${kasse}/${feld} geht nicht auf`
      );
    }
  }

  // Gesamtspalte je Warengruppe = Summe ueber beide Kassen
  for (const kategorie of ["Getraenk", "Speise"]) {
    for (const feld of FELDER) {
      assert.strictEqual(
        m.gesamt_je_kategorie[kategorie][feld],
        Math.round((jeKat.Jugend[kategorie][feld] + jeKat.Senioren[kategorie][feld]) * 100) / 100
      );
    }
  }

  assert.strictEqual(m.gesamt_erloes, 18.5);
  assert.strictEqual(
    m.gesamt_gewinn,
    Math.round(
      (m.gesamt_je_kategorie.Getraenk.gewinn + m.gesamt_je_kategorie.Speise.gewinn) * 100
    ) / 100
  );
});
