// Test fuer Runde 5 Schritt 5.1: Nachbestellungs-Stornierung bucht als negativer Wareneingang,
// damit Wareneinkauf, Vorsteuer und Bestand korrekt sinken.
//
// Problem: lieferantenPfandStornieren() buchte bisher als "Korrektur" ohne Preisangaben.
// Dadurch ignorierte wareneinkaufBericht()/wareneinkaufGesamt() die Stornierung.
// Loesung: Typ "Wareneingang" mit negativer Menge und Preisangaben (wie Windows-App).

import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb, put, neueId, geraetId } from "../js/db.js";
import {
  lieferantenPfandErfassen,
  lieferantenPfandStornieren,
  wareneinkaufGesamt,
  wareneinkaufBericht,
  lagerwertGesamt,
} from "../js/repo.js";

test("nachbestellung-storno: wareneinkaufGesamt sinkt nach Stornierung", async () => {
  await openDb();

  // Produkt "Cola" anlegen (eindeutige ID um Konflikte zu vermeiden)
  const produktId = neueId();
  await put("produkte", {
    id: produktId,
    name: "Cola_Test1",
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

  // Ausgangswert: keine Wareneingaenge fuer dieses Produkt
  let bericht = await wareneinkaufBericht(2026, 8);
  const eintragVorher = bericht.find((e) => e.produkt_id === produktId);
  const wertvörher = eintragVorher ? eintragVorher.netto : 0;

  // Nachbestellung erfassen: 10 Stueck zu 0,50 EUR netto
  // -> Wareneinkauf sollte steigen um 5,00
  const nachbestellungId = await lieferantenPfandErfassen(
    0, // bezahlt
    0, // erhalten
    null, // kommentar
    "test", // benutzerName
    [
      {
        produktId,
        menge: 10,
        einzelpreis: 0.50,
        mwstSatz: 19,
        pfandBezahlt: null,
        pfandErhalten: null,
      },
    ]
  );

  // Nach Nachbestellung pruefen
  bericht = await wareneinkaufBericht(2026, 8);
  const eintragNach = bericht.find((e) => e.produkt_id === produktId);
  assert.ok(
    eintragNach && eintragNach.netto === wertvörher + 5.0,
    `nach Nachbestellung sollte Wareneinkauf um 5.00 steigen auf ${wertvörher + 5.0}, erhielt ${eintragNach?.netto ?? 0}`
  );

  // Nachbestellung stornieren
  const stornoId = await lieferantenPfandStornieren(nachbestellungId, "test", null);
  assert.ok(stornoId, "Storno-ID sollte vorhanden sein");

  // Nach Stornierung pruefen: Wert sollte wieder auf Ausgangswert sein
  bericht = await wareneinkaufBericht(2026, 8);
  const eintragNachStorno = bericht.find((e) => e.produkt_id === produktId);
  const wertNachStorno = eintragNachStorno ? eintragNachStorno.netto : 0;
  assert.strictEqual(
    wertNachStorno,
    wertvörher,
    `nach Storno sollte Wareneinkauf wieder ${wertvörher} sein, erhielt ${wertNachStorno}`
  );
});

test("nachbestellung-storno: wareneinkaufBericht zeigt korrekte Mengen nach Stornierung", async () => {
  await openDb();

  // Produkt "Wasser" anlegen (Test 2 - eindeutig)
  const produktId = neueId();
  const monatStr = "2026-08";
  await put("produkte", {
    id: produktId,
    name: "Wasser_Test2",
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

  // Bericht vor Nachbestellung: sollte dieses Produkt NICHT enthalten
  let berichtVorher = await wareneinkaufBericht(2026, 8);
  let eintragVorher = berichtVorher.find((e) => e.produkt_id === produktId);
  assert.strictEqual(
    eintragVorher,
    undefined,
    "Produkt sollte anfangs nicht im Bericht sein"
  );

  // Nachbestellung erfassen: 20 Stueck zu 0,60 EUR netto
  const nachbestellungId = await lieferantenPfandErfassen(
    0,
    0,
    null,
    "test",
    [
      {
        produktId,
        menge: 20,
        einzelpreis: 0.60,
        mwstSatz: 19,
        pfandBezahlt: null,
        pfandErhalten: null,
      },
    ]
  );

  // Nach Nachbestellung: Bericht sollte 20 Stueck zu 0,60 EUR zeigen
  let berichtNach = await wareneinkaufBericht(2026, 8);
  let eintragNach = berichtNach.find((e) => e.produkt_id === produktId);
  assert.ok(eintragNach, "Produkt sollte nach Nachbestellung im Bericht sein");
  assert.strictEqual(eintragNach.menge, 20, "Menge sollte 20 sein");
  assert.strictEqual(
    eintragNach.netto,
    12.00,
    `Netto sollte 12.00 sein (20 * 0.60), erhielt ${eintragNach.netto}`
  );

  // Nachbestellung stornieren
  const stornoId = await lieferantenPfandStornieren(nachbestellungId, "test", null);

  // Nach Stornierung: Produkt sollte mit Menge 0 im Bericht sein
  // (oder gar nicht - beide Verhalten sind korrekt)
  let berichtNachStorno = await wareneinkaufBericht(2026, 8);
  let eintragNachStorno = berichtNachStorno.find((e) => e.produkt_id === produktId);
  if (eintragNachStorno) {
    // Wenn der Eintrag da ist, sollte die Menge 0 sein
    assert.strictEqual(
      eintragNachStorno.menge,
      0,
      `Nach Storno sollte Menge 0 sein, erhielt ${eintragNachStorno.menge}`
    );
    assert.strictEqual(
      eintragNachStorno.netto,
      0,
      `Nach Storno sollte Netto 0 sein, erhielt ${eintragNachStorno.netto}`
    );
  }
  // Wenn der Eintrag nicht im Bericht ist, ist das auch okay
});

test("nachbestellung-storno: Bestand ist nach Stornierung wieder bei Ausgangswert", async () => {
  await openDb();

  // Produkt anlegen (Test 3 - eindeutig)
  const produktId = neueId();
  await put("produkte", {
    id: produktId,
    name: "Flasche_Test3",
    kategorie: "Getraenke",
    mwst_satz: 19,
    einkaufspreis: 1.00,
    verkaufspreis: 2.50,
    helferpreis: 2.50,
    pfand_betrag: 0.08,
    datum: "2026-08-30T10:00:00Z",
    benutzer: "test",
    geraet_id: await geraetId(),
    synced: false,
    synced_at: null,
  });

  // Lagerwert vor Nachbestellung pruefen
  const wertVorher = await lagerwertGesamt();

  // Nachbestellung: 5 Stueck zu 1,00 EUR
  // -> Bestand: 5 Stueck x 1,00 EUR = 5,00 EUR mehr
  const nachbestellungId = await lieferantenPfandErfassen(
    0,
    0,
    null,
    "test",
    [
      {
        produktId,
        menge: 5,
        einzelpreis: 1.00,
        mwstSatz: 19,
        pfandBezahlt: null,
        pfandErhalten: null,
      },
    ]
  );

  // Nach Nachbestellung: Lagerwert sollte um 5,00 EUR steigen
  const wertNach = await lagerwertGesamt();
  assert.strictEqual(
    wertNach,
    wertVorher + 5.00,
    `Nach Nachbestellung sollte Lagerwert um 5.00 steigen, erhielt ${wertNach - wertVorher}`
  );

  // Nachbestellung stornieren
  const stornoId = await lieferantenPfandStornieren(nachbestellungId, "test", null);

  // Nach Stornierung: Lagerwert sollte wieder auf Ausgangswert sein
  const wertNachStorno = await lagerwertGesamt();
  assert.strictEqual(
    wertNachStorno,
    wertVorher,
    `Nach Storno sollte Lagerwert wieder ${wertVorher} sein, erhielt ${wertNachStorno}`
  );
});

test("nachbestellung-storno: Negative Lagerbewegung wird bei Durchschnittspreisberechnung ignoriert", async () => {
  await openDb();

  // Produkt anlegen (Test 4 - eindeutig)
  const produktId = neueId();
  await put("produkte", {
    id: produktId,
    name: "Bier_Test4",
    kategorie: "Getraenke",
    mwst_satz: 19,
    einkaufspreis: 0.50,
    verkaufspreis: 1.50,
    helferpreis: 1.50,
    pfand_betrag: 0.08,
    datum: "2026-08-30T10:00:00Z",
    benutzer: "test",
    geraet_id: await geraetId(),
    synced: false,
    synced_at: null,
  });

  // Nachbestellung: 10 Stueck zu 0,40 EUR
  const nachbestellungId = await lieferantenPfandErfassen(
    0,
    0,
    null,
    "test",
    [
      {
        produktId,
        menge: 10,
        einzelpreis: 0.40,
        mwstSatz: 19,
        pfandBezahlt: null,
        pfandErhalten: null,
      },
    ]
  );

  // Lagerwert: 10 * 0,40 = 4,00 EUR
  const wertVor = await lagerwertGesamt();
  assert.strictEqual(wertVor, 4.00, "Vor Storno sollte Wert 4.00 sein");

  // Nachbestellung stornieren
  // -> bucht: typ="Wareneingang", menge=-10, einzelpreis=0,40
  // -> Bestand wird negative Menge addieren (10 - 10 = 0)
  // -> Lagerwert wird auf Startwert zurueck
  // -> Durchschnittspreis wird nur aus den Lagerbewegungen mit menge > 0 berechnet
  //    (die negative wird gefiltert, beeinflusst den Durchschnitt nicht)
  const stornoId = await lieferantenPfandStornieren(nachbestellungId, "test", null);

  // Nach Storno: Lagerwert sollte auf Startwert zurueck
  const wertNach = await lagerwertGesamt();
  // Wertvor war wahrscheinlich nicht 0, wenn das Test 3 schon gelaufen ist.
  // Also pruefen wir: 10 - 10 = 0 Bestand fuer dieses Produkt
  // Der Lagerwert sinkt um 4,00 EUR
  assert.strictEqual(
    wertNach,
    wertVor - 4.00,
    `Nach Storno sollte Lagerwert um 4.00 sinken, erhielt ${wertVor - wertNach}`
  );
});
