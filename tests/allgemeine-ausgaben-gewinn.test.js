// Runde 61/62: Allgemeine ("sonstige") Ausgaben gehoeren in die
// Gewinnberechnung - verteilt nach dem UMSATZANTEIL der Kassen (Runde 62,
// Nutzerwunsch 23.10.2026; vorher 50/50), EGAL auf welcher Kasse sie gebucht
// wurden.
//
// Pendant zu den Runde-61/62-Tests in tests/test_repository.py der Windows-App.

import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb, put, neueId, geraetId, ersetzeAlle } from "../js/db.js";
import {
  auswertungJeKasse,
  monatsabrechnung,
  kassiervorgangAbschliessen,
  lagerbewegungErfassen,
  sonstigeAusgabeErfassen,
  allgemeineAusgabenNachUmsatz,
} from "../js/repo.js";

async function frischeDb() {
  await openDb();
  for (const store of [
    "positionen",
    "kassiervorgaenge",
    "produkte",
    "lagerbewegungen",
    "sonstige_ausgaben",
    "schiedsrichter_auszahlungen",
    "pfand_gewinn_verbuchungen",
  ]) {
    await ersetzeAlle(store, []);
  }
}

async function verkaufMitGewinn(kasse, menge = 10) {
  const id = neueId();
  await put("produkte", {
    id,
    name: "Cola " + id.slice(0, 6),
    kategorie: "Getraenk",
    mwst_satz: 19,
    einkaufspreis: 0.5,
    verkaufspreis: 2.0,
    helferpreis: 2.0,
    pfand_betrag: 0,
    aktiv: true,
    datum: "2026-10-01T10:00:00Z",
    benutzer: "test",
    geraet_id: await geraetId(),
    synced: false,
    synced_at: null,
  });
  await lagerbewegungErfassen(id, "Wareneingang", 100, "Start", "test", await geraetId(), 0.5, 19);
  await kassiervorgangAbschliessen(
    kasse,
    [{ produktId: id, menge, einzelpreis: 2.0, einkaufspreis: 0.5, mwstSatz: 19, pfandBetrag: 0 }],
    menge * 2.0,
    "test"
  );
  return id;
}

test("allgemeine Ausgaben mindern den Gewinn nach Umsatzanteil", async () => {
  await frischeDb();
  await verkaufMitGewinn("Jugend", 15); // 30 € Umsatz -> 60 %
  await verkaufMitGewinn("Senioren", 10); // 20 € Umsatz -> 40 %

  const vorher = await auswertungJeKasse();
  const jugendVorher = vorher.Jugend.gewinn;
  const seniorenVorher = vorher.Senioren.gewinn;

  // Komplett auf der Seniorenkasse gebucht - trotzdem nach Umsatz verteilt
  await sonstigeAusgabeErfassen("Senioren", 40.0, "Reinigungsmittel", "test");

  const nachher = await auswertungJeKasse();
  assert.strictEqual(nachher.Jugend.sonstige_ausgaben_anteil, 24.0);
  assert.strictEqual(nachher.Senioren.sonstige_ausgaben_anteil, 16.0);
  assert.strictEqual(nachher.Jugend.gewinn, Math.round((jugendVorher - 24) * 100) / 100);
  assert.strictEqual(nachher.Senioren.gewinn, Math.round((seniorenVorher - 16) * 100) / 100);
});

test("ungerader Cent geht exakt auf und stimmt mit Windows ueberein", async () => {
  await frischeDb();
  await verkaufMitGewinn("Jugend");
  await verkaufMitGewinn("Senioren");
  await sonstigeAusgabeErfassen("Jugend", 41.33, "Material", "test");

  const daten = await auswertungJeKasse();
  // Identisch zu repository._allgemeine_ausgaben_nach_umsatz (rundet .5 auf)
  assert.strictEqual(daten.Senioren.sonstige_ausgaben_anteil, 20.67);
  assert.strictEqual(daten.Jugend.sonstige_ausgaben_anteil, 20.66);
  assert.strictEqual(
    Math.round((daten.Jugend.sonstige_ausgaben_anteil + daten.Senioren.sonstige_ausgaben_anteil) * 100) / 100,
    41.33
  );
});

test("Monatsabrechnung: genau einmal abgezogen, Warengruppen bleiben Warengewinn", async () => {
  await frischeDb();
  await verkaufMitGewinn("Jugend", 20);
  await verkaufMitGewinn("Senioren", 20);
  await sonstigeAusgabeErfassen("Senioren", 30.0, "Reparatur", "test");

  const jetzt = new Date();
  const m = await monatsabrechnung(jetzt.getFullYear(), jetzt.getMonth() + 1);

  assert.strictEqual(m.je_kasse.Jugend.sonstige_ausgaben_anteil, 15.0);
  assert.strictEqual(m.je_kasse.Senioren.sonstige_ausgaben_anteil, 15.0);

  for (const kasse of ["Jugend", "Senioren"]) {
    const warengewinn =
      Math.round(
        (m.je_kasse_kategorie[kasse].Getraenk.gewinn + m.je_kasse_kategorie[kasse].Speise.gewinn) * 100
      ) / 100;
    assert.strictEqual(
      m.je_kasse[kasse].gewinn,
      Math.round((warengewinn - m.je_kasse[kasse].sonstige_ausgaben_anteil) * 100) / 100,
      `${kasse}: Gewinn geht nicht auf`
    );
  }

  // Keine Doppelzaehlung im Endergebnis
  assert.strictEqual(
    m.gesamt_ergebnis_nach_ausgaben,
    Math.round((m.gesamt_gewinn - m.gesamt_schiedsrichter) * 100) / 100
  );
  assert.strictEqual(m.gesamt_sonstige_ausgaben, 30.0);
});

test("ohne Umsatz wird 50/50 verteilt", () => {
  assert.deepStrictEqual(allgemeineAusgabenNachUmsatz(10, { Jugend: 0, Senioren: 0 }), {
    Jugend: 5,
    Senioren: 5,
  });
});
