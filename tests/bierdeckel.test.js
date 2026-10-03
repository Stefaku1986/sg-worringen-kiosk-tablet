// Tests fuer Runde 59: Bierdeckel (anschreiben, spaeter bezahlen).
//
// Alle Tests dieser Datei teilen sich EINE fake-indexeddb (node --test trennt
// nur je Datei, nicht je Test). Deshalb ruft jeder Test als Erstes
// frischeDb() auf, leert alle beteiligten Stores und legt selbst an, was er
// braucht. Es wird nie gegen fest verdrahtete Daten verglichen, weil
// Buchungen mit jetzt() (also der echten Uhrzeit) geschrieben werden - die
// Soll-Vergleiche sind daher immer RELATIV zum Soll vor der Buchung.

import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb, put, ersetzeAlle, getAll } from "../js/db.js";
import {
  kassiervorgangAbschliessen,
  vorgangStornieren,
  kassensturzGesamtVorschau,
  bestand,
  deckelIdFuerName,
  deckelAnlegen,
  deckelOffen,
  deckelUebersicht,
  deckelZahlungErfassen,
  deckelZahlungStornieren,
  deckelVerlauf,
  offeneDeckelGesamt,
  offenePfandmarkenJeKasse,
} from "../js/repo.js";

const STORES = [
  "kassenstuerze",
  "kassiervorgaenge",
  "positionen",
  "lagerbewegungen",
  "produkte",
  "schiedsrichter_auszahlungen",
  "sonstige_ausgaben",
  "bargeld_einzahlungen",
  "bargeld_entnahmen",
  "nachbestellung_positionen",
  "lieferanten_pfand",
  "deckel",
  "deckel_zahlungen",
];

async function frischeDb() {
  await openDb();
  for (const store of STORES) await ersetzeAlle(store, []);
  await put("produkte", {
    id: "p-cola",
    name: "Cola",
    kategorie: "Getraenk",
    preis: 2.5,
    aktiv: 1,
  });
}

// 2 x Cola a 2,50 = 5,00
function warenkorb(menge = 2) {
  return [
    {
      produktId: "p-cola",
      menge,
      einzelpreis: 2.5,
      einkaufspreis: 1.0,
      mwstSatz: 19,
      pfandBetrag: 0,
      istHelferpreis: false,
      istPfandrueckgabe: false,
      pfandErlassen: false,
    },
  ];
}

async function soll() {
  return (await kassensturzGesamtVorschau()).soll;
}

async function aufDeckelBuchen(name = "Stefan", menge = 2) {
  const id = await deckelAnlegen(name, "test");
  const r = await kassiervorgangAbschliessen("Jugend", warenkorb(menge), 0, "test", id);
  return { deckelId: id, vorgangId: r.vorgangId, gesamt: r.gesamtbetrag };
}

function nahe(a, b, text) {
  assert.ok(Math.abs(a - b) < 0.005, `${text}: ${a} != ${b}`);
}

test("bierdeckel: gleiche ID fuer 'Stefan', ' stefan ' und 'STEFAN' und gleiche UUIDv5 wie Python", async () => {
  // Erwartungswert aus Python:
  // uuid.uuid5(uuid.UUID('b7e1c2a4-5d3f-4e8a-9c61-2f0d4a7b8e19'), 'stefan')
  const PYTHON_WERT = "9bee4c61-98f2-5436-915c-1b45c682e20d";
  assert.strictEqual(await deckelIdFuerName("Stefan"), PYTHON_WERT);
  assert.strictEqual(await deckelIdFuerName("  stefan "), PYTHON_WERT);
  assert.strictEqual(await deckelIdFuerName("STEFAN"), PYTHON_WERT);
  // Mehrfache Leerzeichen innen werden zu einem (" ".join(name.split())).
  assert.strictEqual(
    await deckelIdFuerName("Max   Mustermann"),
    await deckelIdFuerName("max mustermann")
  );
  assert.notStrictEqual(await deckelIdFuerName("Stefan K"), PYTHON_WERT);
});

test("bierdeckel: deckelAnlegen legt nur an, wenn die ID fehlt (Anzeigename = normalisierter Name)", async () => {
  await frischeDb();
  const id1 = await deckelAnlegen("  Stefan   Kuehl ", "test");
  const id2 = await deckelAnlegen("stefan kuehl", "test");
  assert.strictEqual(id1, id2);
  const alle = await getAll("deckel");
  assert.strictEqual(alle.length, 1);
  assert.strictEqual(alle[0].name, "Stefan Kuehl");
  assert.strictEqual(alle[0].id, id1);
  await assert.rejects(() => deckelAnlegen("   ", "test"));
});

test("bierdeckel: Deckel-Buchung zaehlt nicht ins Soll, aber in Erloes und Bestand", async () => {
  await frischeDb();
  const soll0 = await soll();
  const bestand0 = await bestand("p-cola");

  const { deckelId, vorgangId, gesamt } = await aufDeckelBuchen("Stefan");
  nahe(gesamt, 5, "Gesamtbetrag");

  const v = (await getAll("kassiervorgaenge")).find((x) => x.id === vorgangId);
  assert.strictEqual(v.deckel_id, deckelId);
  assert.strictEqual(v.gegeben, 0);
  assert.strictEqual(v.rueckgeld, 0);
  assert.strictEqual(v.gesamtbetrag, 5);

  const vorschau = await kassensturzGesamtVorschau();
  nahe(vorschau.soll, soll0, "Soll unveraendert");
  nahe(vorschau.einnahmen, 0, "keine Bar-Einnahmen");
  nahe(vorschau.offeneDeckel, 5, "offene Deckel");
  nahe(vorschau.deckelZahlungen, 0, "noch keine Deckel-Zahlung");

  // Lager sofort gebucht, Positionen vorhanden (Erloes/MwSt. stehen im Vorgang).
  assert.strictEqual(await bestand("p-cola"), bestand0 - 2);
  const pos = (await getAll("positionen")).filter((p) => p.vorgang_id === vorgangId);
  assert.strictEqual(pos.length, 1);
  assert.strictEqual(pos[0].mwst_satz, 19);

  // Zum Vergleich: ein normaler Barverkauf zaehlt im Soll.
  await kassiervorgangAbschliessen("Jugend", warenkorb(2), 5, "test");
  nahe(await soll(), soll0 + 5, "Barverkauf im Soll");
});

test("bierdeckel: Buchung auf unbekannten Deckel wird abgelehnt", async () => {
  await frischeDb();
  await assert.rejects(
    () => kassiervorgangAbschliessen("Jugend", warenkorb(), 0, "test", "gibt-es-nicht"),
    /Deckel nicht gefunden/
  );
  assert.strictEqual((await getAll("kassiervorgaenge")).length, 0);
});

test("bierdeckel: Bar-Zahlung erhoeht das Soll, Ueberweisung und Ausbuchung nicht", async () => {
  await frischeDb();
  const soll0 = await soll();
  const { deckelId } = await aufDeckelBuchen("Stefan"); // 5,00 offen

  await deckelZahlungErfassen(deckelId, 2, "ueberweisung", null, "test");
  nahe(await soll(), soll0, "Ueberweisung aendert das Soll nicht");
  nahe(await deckelOffen(deckelId), 3, "offen nach Ueberweisung");

  await deckelZahlungErfassen(deckelId, 1, "ausbuchung", null, "test");
  nahe(await soll(), soll0, "Ausbuchung aendert das Soll nicht");
  nahe(await deckelOffen(deckelId), 2, "offen nach Ausbuchung");

  await deckelZahlungErfassen(deckelId, 2, "bar", null, "test");
  const vorschau = await kassensturzGesamtVorschau();
  nahe(vorschau.soll, soll0 + 2, "Bar-Zahlung im Soll");
  nahe(vorschau.deckelZahlungen, 2, "bezahlte Deckel (bar)");
  nahe(vorschau.offeneDeckel, 0, "nichts mehr offen");
  assert.strictEqual(await deckelOffen(deckelId), 0);
});

test("bierdeckel: Teilzahlung bar - Rest bleibt offen, Zahlung ohne Kasse (veranstaltung null)", async () => {
  await frischeDb();
  const soll0 = await soll();
  const { deckelId } = await aufDeckelBuchen("Stefan");
  const zid = await deckelZahlungErfassen(deckelId, 1.5, "bar", "Anzahlung", "test");

  nahe(await deckelOffen(deckelId), 3.5, "Rest offen");
  nahe(await soll(), soll0 + 1.5, "Teilzahlung im Soll");
  nahe(await offeneDeckelGesamt(), 3.5, "offeneDeckelGesamt");

  const z = (await getAll("deckel_zahlungen")).find((x) => x.id === zid);
  assert.strictEqual(z.veranstaltung, null);
  assert.strictEqual(z.art, "bar");
  assert.strictEqual(z.storno_von, null);
  assert.strictEqual(z.kommentar, "Anzahlung");
});

test("bierdeckel: Ueberzahlung, Betrag 0 und ungueltige Art sind Fehler", async () => {
  await frischeDb();
  const { deckelId } = await aufDeckelBuchen("Stefan"); // 5,00 offen

  await assert.rejects(
    () => deckelZahlungErfassen(deckelId, 5.01, "bar", null, "test"),
    (err) => /Auf dem Deckel sind nur 5,00/.test(err.message) && /offen/.test(err.message)
  );
  await assert.rejects(() => deckelZahlungErfassen(deckelId, 0, "bar", null, "test"));
  await assert.rejects(() => deckelZahlungErfassen(deckelId, -1, "bar", null, "test"));
  await assert.rejects(() => deckelZahlungErfassen(deckelId, 1, "bitcoin", null, "test"));
  await assert.rejects(() => deckelZahlungErfassen("gibt-es-nicht", 1, "bar", null, "test"));

  assert.strictEqual((await getAll("deckel_zahlungen")).length, 0);
  // Genau der offene Betrag ist erlaubt.
  await deckelZahlungErfassen(deckelId, 5, "bar", null, "test");
  assert.strictEqual(await deckelOffen(deckelId), 0);
  // Danach ist nichts mehr offen.
  await assert.rejects(() => deckelZahlungErfassen(deckelId, 0.01, "bar", null, "test"));
});

test("bierdeckel: Zahlungs-Storno ist Gegenbuchung, Doppel-Storno und Storno vom Storno verboten", async () => {
  await frischeDb();
  const soll0 = await soll();
  const { deckelId } = await aufDeckelBuchen("Stefan");
  const zid = await deckelZahlungErfassen(deckelId, 5, "bar", null, "test");
  nahe(await soll(), soll0 + 5, "vor Storno");

  const sid = await deckelZahlungStornieren(zid, "test");
  const alle = await getAll("deckel_zahlungen");
  const storno = alle.find((x) => x.id === sid);
  assert.strictEqual(storno.betrag, -5);
  assert.strictEqual(storno.art, "bar");
  assert.strictEqual(storno.storno_von, zid);
  assert.strictEqual(storno.veranstaltung, null);

  nahe(await soll(), soll0, "Soll nach Storno wieder wie vorher");
  nahe(await deckelOffen(deckelId), 5, "Deckel wieder offen");

  await assert.rejects(() => deckelZahlungStornieren(zid, "test"), /bereits storniert/);
  await assert.rejects(() => deckelZahlungStornieren(sid, "test"), /nicht erneut storniert/);
  await assert.rejects(() => deckelZahlungStornieren("gibt-es-nicht", "test"));
  assert.strictEqual((await getAll("deckel_zahlungen")).length, 2);
});

test("bierdeckel: Storno einer Ueberweisung/Ausbuchung aendert das Soll ebenfalls nicht", async () => {
  await frischeDb();
  const soll0 = await soll();
  const { deckelId } = await aufDeckelBuchen("Stefan");
  const zid = await deckelZahlungErfassen(deckelId, 5, "ueberweisung", null, "test");
  await deckelZahlungStornieren(zid, "test");
  nahe(await soll(), soll0, "Soll unveraendert");
  nahe(await deckelOffen(deckelId), 5, "wieder offen");
});

test("bierdeckel: Storno eines Deckel-Vorgangs behaelt deckel_id, Soll bleibt unveraendert", async () => {
  await frischeDb();
  const soll0 = await soll();
  const { deckelId, vorgangId } = await aufDeckelBuchen("Stefan");
  const stornoId = (await vorgangStornieren(vorgangId, "test")) ?? null;

  const vorgaenge = await getAll("kassiervorgaenge");
  const storno = vorgaenge.find((v) => v.storno_von === vorgangId);
  assert.ok(storno, "Storno-Vorgang vorhanden");
  assert.strictEqual(storno.deckel_id, deckelId);
  assert.strictEqual(storno.gesamtbetrag, -5);
  void stornoId;

  const vorschau = await kassensturzGesamtVorschau();
  nahe(vorschau.soll, soll0, "Soll unveraendert");
  nahe(vorschau.einnahmen, 0, "Einnahmen unveraendert 0");
  nahe(await deckelOffen(deckelId), 0, "Deckel nach Storno ausgeglichen");
});

test("bierdeckel: Uebersicht - offene zuerst, dann nach Name; nurOffene filtert", async () => {
  await frischeDb();
  const zoe = await aufDeckelBuchen("Zoe", 1); // 2,50 offen
  const anna = await aufDeckelBuchen("anna", 2); // 5,00 offen
  const berta = await aufDeckelBuchen("Berta", 1);
  await deckelZahlungErfassen(berta.deckelId, 2.5, "bar", null, "test"); // bezahlt
  await deckelAnlegen("Aaron", "test"); // nie gebucht -> 0, zaehlt als nicht offen

  const alle = await deckelUebersicht();
  assert.deepStrictEqual(
    alle.map((e) => e.name),
    ["anna", "Zoe", "Aaron", "Berta"]
  );
  const a = alle.find((e) => e.id === anna.deckelId);
  nahe(a.offen, 5, "anna offen");
  nahe(a.gebucht, 5, "anna gebucht");
  nahe(a.bezahlt, 0, "anna bezahlt");
  assert.ok(a.letzteBuchung, "letzteBuchung gesetzt");
  const b = alle.find((e) => e.id === berta.deckelId);
  nahe(b.offen, 0, "berta offen");
  nahe(b.bezahlt, 2.5, "berta bezahlt");
  void zoe;

  const nurOffene = await deckelUebersicht({ nurOffene: true });
  assert.deepStrictEqual(
    nurOffene.map((e) => e.name),
    ["anna", "Zoe"]
  );
  nahe(await offeneDeckelGesamt(), 7.5, "Summe offen");
});

test("bierdeckel: Verlauf zeigt Buchungen mit Positionstext und Zahlungen je Art", async () => {
  await frischeDb();
  const { deckelId, vorgangId } = await aufDeckelBuchen("Stefan");
  const zBar = await deckelZahlungErfassen(deckelId, 1, "bar", null, "test");
  await deckelZahlungErfassen(deckelId, 1, "ueberweisung", null, "test");
  await deckelZahlungErfassen(deckelId, 1, "ausbuchung", null, "test");
  await deckelZahlungStornieren(zBar, "test");

  const verlauf = await deckelVerlauf(deckelId);
  assert.strictEqual(verlauf.length, 5);

  const buchung = verlauf.find((e) => e.id === vorgangId);
  assert.strictEqual(buchung.typ, "Buchung");
  assert.match(buchung.text, /2× Cola/);
  nahe(buchung.betrag, 5, "Buchungsbetrag");

  const texte = verlauf.filter((e) => e.typ === "Zahlung").map((e) => e.text);
  assert.ok(texte.includes("Bar bezahlt"));
  assert.ok(texte.includes("Überweisung"));
  assert.ok(texte.includes("Ausgebucht"));
  assert.ok(texte.some((t) => t.startsWith("Storno")));

  const bar = verlauf.find((e) => e.id === zBar);
  assert.strictEqual(bar.storniert, true);
  const stornoZeile = verlauf.find((e) => e.storno_von === zBar);
  assert.strictEqual(stornoZeile.betrag, -1);

  // neueste zuerst
  for (let i = 1; i < verlauf.length; i++) {
    assert.ok(verlauf[i - 1].datum >= verlauf[i].datum, "absteigend sortiert");
  }
});

test("bierdeckel: Buchung und Zahlung ueber mehrere Kassen - Bar-Zahlung zaehlt einmal im Gesamt-Soll", async () => {
  await frischeDb();
  const soll0 = await soll();
  const id = await deckelAnlegen("Stefan", "test");
  await kassiervorgangAbschliessen("Jugend", warenkorb(1), 0, "test", id); // 2,50
  await kassiervorgangAbschliessen("Senioren", warenkorb(1), 0, "test", id); // 2,50
  nahe(await soll(), soll0, "Soll nach beiden Buchungen unveraendert");
  nahe(await deckelOffen(id), 5, "offen ueber beide Kassen");
  await deckelZahlungErfassen(id, 5, "bar", null, "test");
  nahe(await soll(), soll0 + 5, "einmal +5");
});

// ---------------------------------------------------------------------
// Runde 60: pfandfrei auf Deckel, Pfandrueckgabe nur bar, nur Barzahlung
// ---------------------------------------------------------------------

// 1 x Cola a 2,00 mit 2,00 Pfand; erlassen = Haekchen "Pfandmarke vorhanden".
function colaMitPfand(erlassen) {
  return [
    {
      produktId: "p-cola",
      menge: 1,
      einzelpreis: 2.0,
      einkaufspreis: 1.0,
      mwstSatz: 19,
      pfandBetrag: erlassen ? 0 : 2.0,
      pfandBetragOhneErlass: 2.0,
      istHelferpreis: false,
      istPfandrueckgabe: false,
      pfandErlassen: erlassen,
    },
  ];
}

test("bierdeckel R60: Cola mit Pfand 2 geht pfandfrei auf den Deckel - mit und ohne Haekchen gleich", async () => {
  for (const erlassen of [false, true]) {
    await frischeDb();
    const id = await deckelAnlegen("Stefan", "test");
    const korb = colaMitPfand(erlassen);
    const kopie = JSON.parse(JSON.stringify(korb));
    const r = await kassiervorgangAbschliessen("Jugend", korb, 0, "test", id);
    nahe(r.gesamtbetrag, 2, `Gesamtbetrag (erlassen=${erlassen})`);
    const v = (await getAll("kassiervorgaenge")).find((x) => x.id === r.vorgangId);
    nahe(v.gesamtbetrag, 2, "Vorgang 2,00");
    const pos = (await getAll("positionen")).filter((p) => p.vorgang_id === r.vorgangId);
    assert.strictEqual(pos.length, 1);
    assert.strictEqual(pos[0].pfand_betrag, 0);
    assert.strictEqual(pos[0].pfand_erlassen, 1);
    nahe(await deckelOffen(id), 2, "offen 2,00");
    // Warenkorb des Aufrufers bleibt unveraendert.
    assert.deepStrictEqual(korb, kopie);
  }
});

test("bierdeckel R60: Pfandrueckgabe + Deckel wirft Fehler und bucht nichts", async () => {
  await frischeDb();
  const id = await deckelAnlegen("Stefan", "test");
  const vorher = {
    v: (await getAll("kassiervorgaenge")).length,
    p: (await getAll("positionen")).length,
    l: (await getAll("lagerbewegungen")).length,
  };
  const korb = [
    ...colaMitPfand(false),
    {
      produktId: "p-pfand",
      menge: 1,
      einzelpreis: 0,
      einkaufspreis: 0,
      mwstSatz: 0,
      pfandBetrag: -2.0,
      istHelferpreis: false,
      istPfandrueckgabe: true,
      pfandErlassen: false,
    },
  ];
  await assert.rejects(
    () => kassiervorgangAbschliessen("Jugend", korb, 0, "test", id),
    /Pfandrückgaben bitte separat bar über „Bezahlen“ abwickeln\./
  );
  assert.strictEqual((await getAll("kassiervorgaenge")).length, vorher.v);
  assert.strictEqual((await getAll("positionen")).length, vorher.p);
  assert.strictEqual((await getAll("lagerbewegungen")).length, vorher.l);
});

test("bierdeckel R60: Pfandmarken-Zaehler vor und nach der Deckel-Buchung gleich", async () => {
  await frischeDb();
  const vorher = JSON.stringify(await offenePfandmarkenJeKasse());
  const id = await deckelAnlegen("Stefan", "test");
  await kassiervorgangAbschliessen("Jugend", colaMitPfand(false), 0, "test", id);
  assert.strictEqual(JSON.stringify(await offenePfandmarkenJeKasse()), vorher);
});

test("bierdeckel R60: Komplettzahlung bar -> offen 0, Soll + Betrag; Teilzahlung laesst Rest offen", async () => {
  await frischeDb();
  const soll0 = await soll();
  const id = await deckelAnlegen("Stefan", "test");
  await kassiervorgangAbschliessen("Jugend", colaMitPfand(false), 0, "test", id); // 2,00
  await kassiervorgangAbschliessen("Jugend", colaMitPfand(true), 0, "test", id); // 2,00
  nahe(await deckelOffen(id), 4, "offen 4,00");

  await deckelZahlungErfassen(id, 1.5, "bar", null, "test");
  nahe(await deckelOffen(id), 2.5, "Rest offen nach Teilzahlung");
  nahe(await soll(), soll0 + 1.5, "Soll + Teilbetrag");

  await deckelZahlungErfassen(id, await deckelOffen(id), "bar", null, "test");
  nahe(await deckelOffen(id), 0, "offen 0 nach Komplettzahlung");
  nahe(await soll(), soll0 + 4, "Soll + Gesamtbetrag");
});
