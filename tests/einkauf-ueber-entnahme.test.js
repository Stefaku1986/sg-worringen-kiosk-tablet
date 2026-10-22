// Runde 62: Einkaeufe nur noch ueber eine Bargeld-Entnahme mit Kassenbon
// (Haendler, Bonnummer, Kaufdatum). Nachbestellungen buchen nur Mengen und
// mindern das Kassensturz-Soll nicht mehr. Pendant zu
// tests/test_runde62_einkauf_ueber_entnahme.py der Windows-App.

import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb, put, get, neueId, geraetId } from "../js/db.js";
import {
  bargeldEntnahmeErfassen,
  bargeldEntnahmeStornieren,
  einkaufAngabenPruefen,
  lieferantenPfandErfassen,
  kassensturzGesamtVorschau,
  nachbestellungBarbetrag,
  bestand,
} from "../js/repo.js";

function heute() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

test("Einkaufs-Entnahme speichert Haendler, Bonnummer und Kaufdatum", async () => {
  await openDb();
  const id = await bargeldEntnahmeErfassen("Jugend", 121.84, "Stefan Kühl", null, "test", null, {
    haendler: " HIT Dormagen ",
    bonNr: " 532 ",
    kaufdatum: "2026-08-31",
  });
  const e = await get("bargeld_entnahmen", id);
  assert.equal(e.haendler, "HIT Dormagen");
  assert.equal(e.bon_nr, "532");
  assert.equal(e.kaufdatum, "2026-08-31");

  const sid = await bargeldEntnahmeStornieren(id, "test");
  const s = await get("bargeld_entnahmen", sid);
  assert.equal(s.betrag, -121.84);
  assert.equal(s.bon_nr, "532");
});

test("Pflichtangaben eines Einkaufs", () => {
  const ok = { haendler: "trinkgut", bonNr: "5665", kaufdatum: "2026-08-31" };
  assert.throws(() => einkaufAngabenPruefen({ ...ok, haendler: " " }), /Händler/);
  assert.throws(() => einkaufAngabenPruefen({ ...ok, bonNr: "" }), /Bonnummer/);
  assert.throws(() => einkaufAngabenPruefen({ ...ok, kaufdatum: "31.08.2026" }), /Kaufdatum/);
  assert.throws(() => einkaufAngabenPruefen({ ...ok, kaufdatum: "2026-02-30" }), /Kaufdatum/);
  assert.throws(() => einkaufAngabenPruefen({ ...ok, kaufdatum: "2999-01-01" }), /Zukunft/);
  assert.deepEqual(einkaufAngabenPruefen(null), { haendler: null, bon_nr: null, kaufdatum: null });
});

test("Sonstige Entnahme ohne Bon-Angaben", async () => {
  await openDb();
  const id = await bargeldEntnahmeErfassen("Senioren", 50, "Vereinskasse", "", "test");
  const e = await get("bargeld_entnahmen", id);
  assert.equal(e.bon_nr, null);
  assert.equal(e.haendler, null);
});

test("Nachbestellung nur mit Mengen mindert das Soll nicht, die Entnahme schon", async () => {
  await openDb();
  const pid = neueId();
  await put("produkte", {
    id: pid, name: "RedBull_R62", kategorie: "Getraenk", mwst_satz: 19, einkaufspreis: 0.9,
    verkaufspreis: 2.5, helferpreis: 2.5, pfand_betrag: 0, aktiv: true,
    geraet_id: await geraetId(), synced: false, synced_at: null,
  });
  const vorher = await kassensturzGesamtVorschau();
  const nid = await lieferantenPfandErfassen(0, 0, "", "test", [
    { produktId: pid, menge: 24, einzelpreis: null, mwstSatz: null, pfandBezahlt: null, pfandErhalten: null },
  ]);
  assert.equal(await bestand(pid), 24);
  assert.equal(await nachbestellungBarbetrag(nid), 0);
  const nachher = await kassensturzGesamtVorschau();
  assert.equal(nachher.soll, vorher.soll);

  await bargeldEntnahmeErfassen("Jugend", 30, "Stefan", null, "test", null, {
    haendler: "trinkgut", bonNr: "1", kaufdatum: heute(),
  });
  const mitEntnahme = await kassensturzGesamtVorschau();
  assert.equal(Math.round(mitEntnahme.soll * 100), Math.round((vorher.soll - 30) * 100));
});
