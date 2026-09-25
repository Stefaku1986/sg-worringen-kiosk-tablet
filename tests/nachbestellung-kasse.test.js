// Runde 58: Nachbestellungen werden bar aus der Kiosk-Kasse bezahlt und
// mindern das Kassensturz-Soll (Ware brutto + Pfand bezahlt - Pfand
// zurueckerhalten). "Korrigieren" = Storno + Neuerfassung.
//
// Die Tests teilen sich eine fake-indexeddb - deshalb wird immer mit der
// Differenz zur Vorschau VOR der jeweiligen Buchung gerechnet.

import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb, put, get, neueId, geraetId } from "../js/db.js";
import {
  lieferantenPfandErfassen,
  lieferantenPfandStornieren,
  lieferantenPfandIstStorniert,
  kassensturzGesamtVorschau,
  nachbestellungBarbetrag,
  nachbestellungKorrekturVorlage,
  nachbestellungKorrigieren,
  bestand,
} from "../js/repo.js";

async function produktAnlegen(name, mwst = 19) {
  const id = neueId();
  await put("produkte", {
    id,
    name,
    kategorie: "Getraenk",
    mwst_satz: mwst,
    einkaufspreis: 0.6,
    verkaufspreis: 2.0,
    helferpreis: 2.0,
    pfand_betrag: 0,
    aktiv: true,
    datum: "2026-09-25T10:00:00Z",
    benutzer: "test",
    geraet_id: await geraetId(),
    synced: false,
    synced_at: null,
  });
  return id;
}

function redBull(produktId, menge = 96) {
  return [{ produktId, menge, einzelpreis: 0.6639, mwstSatz: 19, pfandBezahlt: null, pfandErhalten: null }];
}

test("Barbetrag = Ware brutto + Pfand-Saldo (Red Bull 25.09.)", async () => {
  await openDb();
  const pid = await produktAnlegen("RedBull_Kasse1");
  const bw = await produktAnlegen("Bockwurst_Kasse1", 7);
  const id = await lieferantenPfandErfassen(24, 0, null, "test", [
    ...redBull(pid),
    { produktId: bw, menge: 1, einzelpreis: 6.3178, mwstSatz: 7 },
  ]);
  assert.equal(await nachbestellungBarbetrag(id), 106.6);
});

test("Leergut-Rueckgabe mindert den Barbetrag (HIT 31.08.)", async () => {
  await openDb();
  const pid = await produktAnlegen("Wasser_Kasse2");
  const id = await lieferantenPfandErfassen(40.8, 54.88, null, "test", [
    { produktId: pid, menge: 1, einzelpreis: 114.2185, mwstSatz: 19 },
  ]);
  assert.equal(await nachbestellungBarbetrag(id), 121.84);
});

test("Nachbestellung mindert das Kassensturz-Soll, Storno hebt es wieder auf", async () => {
  await openDb();
  const pid = await produktAnlegen("RedBull_Kasse3");
  const vorher = await kassensturzGesamtVorschau();
  const id = await lieferantenPfandErfassen(24, 0, null, "test", redBull(pid));
  const nachher = await kassensturzGesamtVorschau();
  assert.equal(Math.round((vorher.soll - nachher.soll) * 100) / 100, 99.84);
  assert.equal(
    Math.round((nachher.nachbestellungen - vorher.nachbestellungen) * 100) / 100,
    99.84
  );
  await lieferantenPfandStornieren(id, "test");
  const storniert = await kassensturzGesamtVorschau();
  assert.equal(storniert.soll, vorher.soll);
});

test("Storno einer Nachbestellung vor dem Stichtag erhoeht das Soll nicht", async () => {
  await openDb();
  const pid = await produktAnlegen("RedBull_Kasse4");
  const vorher = await kassensturzGesamtVorschau();
  const id = await lieferantenPfandErfassen(24, 0, null, "test", redBull(pid));
  const eintrag = await get("lieferanten_pfand", id);
  await put("lieferanten_pfand", { ...eintrag, datum: "2026-09-01T10:00:00+00:00" });
  assert.equal((await kassensturzGesamtVorschau()).soll, vorher.soll);
  await lieferantenPfandStornieren(id, "test");
  assert.equal((await kassensturzGesamtVorschau()).soll, vorher.soll);
});

test("Korrigieren storniert die alte Buchung und erfasst die neue", async () => {
  await openDb();
  const pid = await produktAnlegen("RedBull_Kasse5");
  const vorher = await kassensturzGesamtVorschau();
  const id = await lieferantenPfandErfassen(24, 0, "alt", "test", redBull(pid, 96));

  const vorlage = await nachbestellungKorrekturVorlage(id);
  assert.equal(vorlage.sonstigesBezahlt, 24);
  assert.equal(vorlage.positionen[0].menge, 96);
  assert.equal(vorlage.positionen[0].einzelpreis, 0.6639);

  const neuId = await nachbestellungKorrigieren(id, 24, 0, "neu", "test", redBull(pid, 72));
  assert.notEqual(neuId, id);
  assert.ok(await lieferantenPfandIstStorniert(id));
  assert.equal(await bestand(pid), 72);
  const nachher = await kassensturzGesamtVorschau();
  // 72 x 0,6639 x 1,19 = 56,88 + 24,00
  assert.equal(Math.round((vorher.soll - nachher.soll) * 100) / 100, 80.88);
});

test("Korrigieren mit leerer Eingabe laesst die alte Buchung stehen", async () => {
  await openDb();
  const pid = await produktAnlegen("RedBull_Kasse6");
  const id = await lieferantenPfandErfassen(24, 0, null, "test", redBull(pid));
  await assert.rejects(() => nachbestellungKorrigieren(id, 0, 0, "", "test", []));
  assert.equal(await lieferantenPfandIstStorniert(id), false);
  assert.equal(await bestand(pid), 96);
});
