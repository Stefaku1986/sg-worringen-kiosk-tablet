// Test fuer Runde 55: Kassensturz-Korrektionen
//
// Teil 1: Soll und Zeitpunkt einfrieren
// - kassensturzGesamtVorschau() liefert einen Zeitpunkt
// - kassensturzGesamtDurchfuehren() speichert mit diesem Zeitpunkt, nicht mit jetzt()
// - nachraeglicheBuchungen werden berechnet
//
// Teil 2: Vor dem Kassensturz zwingend synchronisieren
// - Sync-Fehler sperren das Eingabefeld und den Speichern-Button
// - Pflicht-Tabellen sind definiert

import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb, put, get, getAll, neueId, geraetId, jetzt } from "../js/db.js";
import {
  kassensturzGesamtVorschau,
  kassensturzGesamtDurchfuehren,
} from "../js/repo.js";
import { readFileSync } from "fs";

test("kassensturz-sync-pflicht: kassensturzGesamtVorschau() liefert stand", async () => {
  await openDb();

  const vorschau = await kassensturzGesamtVorschau();

  assert.ok(vorschau.stand, "Vorschau sollte ein 'stand'-Feld haben");
  assert.ok(
    typeof vorschau.stand === "string",
    `stand sollte ein ISO-String sein, erhalten: ${typeof vorschau.stand}`
  );
  // Der stand sollte ein gültiger ISO-String sein
  assert.doesNotThrow(() => new Date(vorschau.stand), "stand sollte ein gültiger ISO-String sein");
});

test("kassensturz-sync-pflicht: Gespeicherte Kassensturz-Zeile trägt datum === vorschau.stand", async () => {
  await openDb();

  const gid = await geraetId();

  // Hole Vorschau
  const vorschau = await kassensturzGesamtVorschau();

  // Warte 5ms, damit zwischen Vorschau und Speichern nachweislich Zeit vergeht
  // (sonst hängt der Unterschied vom Zufall ab, wenn beide in derselben ms landen)
  await new Promise(r => setTimeout(r, 5));

  // Speichere mit dieser Vorschau
  const ergebnis = await kassensturzGesamtDurchfuehren(244.00, 244.00, vorschau, "test");

  // Hole die gespeicherte Zeile
  const ksZeile = await get("kassenstuerze", ergebnis.id);

  assert.ok(ksZeile, "Gespeicherte Kassensturz-Zeile sollte existieren");
  assert.strictEqual(
    ksZeile.datum,
    vorschau.stand,
    `Zeile sollte datum === vorschau.stand haben, aber: zeile.datum=${ksZeile.datum}, vorschau.stand=${vorschau.stand}`
  );
});

test("kassensturz-sync-pflicht: Kernbeweis gegen Lücke - nachträgliche Buchungen", async () => {
  await openDb();

  const gid = await geraetId();

  // 1. Hole Vorschau (Moment-Aufnahme) und Einnahmen vorher
  const vorschau1 = await kassensturzGesamtVorschau();
  const soll1 = vorschau1.soll;
  const einnahmen1 = vorschau1.einnahmen;

  // 2. Buche einen Kassiervorgang (das würde der Benutzer verpassen, wenn er zählt)
  // Zeitpunkt: kurz nach der Vorschau, damit es garantiert in den Zeitraum fällt
  const vorgangDatum = new Date(Date.parse(vorschau1.stand) + 1000).toISOString();
  const neuerVorgang = neueId();
  await put("kassiervorgaenge", {
    id: neuerVorgang,
    datum: vorgangDatum,
    veranstaltung: "Jugend",
    gesamtbetrag: 50.00,
    gegeben: 50.00,
    rueckgeld: 0.00,
    storno_von: null,
    rechner: "Test",
    geraet_id: gid,
    synced: false,
    synced_at: null,
    benutzer: "test",
  });

  // 3. Speichere Kassensturz mit der ALTEN Vorschau (was der Benutzer sah)
  const ergebnis = await kassensturzGesamtDurchfuehren(
    soll1 + 50.00,  // Der Benutzer zählt: Soll + die neue Buchung
    soll1 + 50.00,
    vorschau1,
    "test"
  );

  // Prüfpunkte:
  // (a) Gespeicherter erwarteter_betrag ist Soll der alten Vorschau
  assert.strictEqual(
    ergebnis.soll,
    soll1,
    `(a) Rückgabe sollte den alten Soll haben (${soll1}), erhalten: ${ergebnis.soll}`
  );

  // (b) nachtraeglicheBuchungen sollte GENAU 50.00 sein (die gerade hinzugefügte Buchung)
  // Beide Vorschauen (original und vor dem Speichern) haben dieselbe Grundlage:
  // anfangsbestand und seit sind identisch, also ist die Differenz exakt der eine Vorgang.
  // (Nicht >= weil das zu weich ist und Fehler durchlässt)
  assert.strictEqual(
    ergebnis.nachtraeglicheBuchungen,
    50.00,
    `(b) nachtraeglicheBuchungen sollte exakt 50.00 sein (die neue Buchung), erhalten: ${ergebnis.nachtraeglicheBuchungen}`
  );

  // (c) Die NÄCHSTE Vorschau enthält diese Buchung in einnahmen
  const vorschau2 = await kassensturzGesamtVorschau();
  // Die Einnahmen sollten um exakt 50€ gestiegen sein
  const einnahmen2 = vorschau2.einnahmen;
  assert.strictEqual(
    einnahmen2 - einnahmen1,
    50.00,
    `(c) Einnahmen sollten um 50.00 gestiegen sein (von ${einnahmen1} auf ${einnahmen2}), Differenz: ${einnahmen2 - einnahmen1}`
  );
});

test("kassensturz-sync-pflicht: kassensturzGesamtDurchfuehren() ohne vorschau wirft Fehler", async () => {
  await openDb();

  try {
    await kassensturzGesamtDurchfuehren(100.00, 100.00, null, "test");
    assert.fail("Sollte einen Fehler werfen");
  } catch (exc) {
    assert.ok(
      exc.message.includes("Vorschau"),
      `Fehlermeldung sollte 'Vorschau' erwähnen, erhalten: ${exc.message}`
    );
  }
});

test("kassensturz-sync-pflicht: kassensturzGesamtDurchfuehren() mit unvollständiger vorschau wirft Fehler", async () => {
  await openDb();

  // Unvollständige Vorschau: fehlt anfangsbestand
  const unvollstaendig = {
    soll: 100.00,
    stand: jetzt(),
    // anfangsbestand fehlt
  };

  try {
    await kassensturzGesamtDurchfuehren(100.00, 100.00, unvollstaendig, "test");
    assert.fail("Sollte einen Fehler werfen");
  } catch (exc) {
    assert.ok(
      exc.message.includes("unvollständig"),
      `Fehlermeldung sollte 'unvollständig' erwähnen, erhalten: ${exc.message}`
    );
  }
});

test("kassensturz-sync-pflicht: renderKassensturz() ruft syncJetzt() VOR kassensturzGesamtVorschau() auf", async () => {
  // Strukturtest: Prüfe die Reihenfolge im Quelltext
  const quelltext = readFileSync("js/main.js", "utf-8");

  // Finde beide Aufrufe
  const syncJetztIndex = quelltext.indexOf("await syncJetzt()");
  const vorschauIndex = quelltext.indexOf("await repo.kassensturzGesamtVorschau()");

  assert.ok(
    syncJetztIndex > 0,
    "renderKassensturz() sollte syncJetzt() aufrufen"
  );
  assert.ok(
    vorschauIndex > 0,
    "renderKassensturz() sollte repo.kassensturzGesamtVorschau() aufrufen"
  );
  assert.ok(
    syncJetztIndex < vorschauIndex,
    "syncJetzt() sollte VOR kassensturzGesamtVorschau() aufgerufen werden"
  );
});

test("kassensturz-sync-pflicht: KASSENSTURZ_PFLICHT_TABELLEN ist definiert und vollständig", async () => {
  // Strukturtest: Prüfe, dass alle 6 Tabellen in der Konstante stehen
  const quelltext = readFileSync("js/main.js", "utf-8");

  const pflichtTabellen = [
    "kassenstuerze",
    "kassiervorgaenge",
    "schiedsrichter_auszahlungen",
    "sonstige_ausgaben",
    "bargeld_einzahlungen",
    "bargeld_entnahmen",
  ];

  for (const tabelle of pflichtTabellen) {
    assert.ok(
      quelltext.includes(`"${tabelle}"`),
      `KASSENSTURZ_PFLICHT_TABELLEN sollte "${tabelle}" enthalten`
    );
  }
});

test("kassensturz-sync-pflicht: Bei Sync-Fehler wird ksGezaehltFeld deaktiviert", async () => {
  // Strukturtest: Prüfe dass ksGezaehltFeld.disabled gesetzt wird bei Fehler
  const quelltext = readFileSync("js/main.js", "utf-8");

  // Suche nach dem Muster, dass bei Fehler (istVollausfall || pflichtTabelleFehlt) das Feld deaktiviert wird
  assert.ok(
    quelltext.includes("ksGezaehltFeld.disabled = true"),
    "Code sollte ksGezaehltFeld.disabled = true setzen"
  );
  assert.ok(
    quelltext.includes("ksSpeichernBtn.disabled = true"),
    "Code sollte ksSpeichernBtn.disabled = true setzen"
  );
});
