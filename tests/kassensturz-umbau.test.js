// Test fuer Runde 52 Schritt 3: Kassensturz-Umbau auf eine einzige physische Kasse.
//
// Problem: Bisher wurde der Betrag proportional auf Jugend/Senioren aufgeteilt,
// was zu unmöglichen negativen Beträgen führte. Dies war physisch unmöglich.
//
// Lösung: Nur noch eine "Gesamt"-Zeile ab dem Stichtag, mit getrennten Quellen
// für anfangsbestand (letzte "Gesamt"-Zeile oder Grundbestand) und seit
// (letzter Zeitpunkt überhaupt, damit keine Einnahmen verloren gehen).

import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb, put, neueId, geraetId, ersetzeAlle } from "../js/db.js";
import {
  kassensturzGesamtVorschau,
  kassensturzGesamtDurchfuehren,
  kassensturzHistorie,
} from "../js/repo.js";

// 12.09.2026: Alle Tests dieser Datei teilen sich EINE fake-indexeddb (node
// --test trennt nur je Datei, nicht je Test). Das hat eine Zeitbombe erzeugt:
// kassensturzGesamtDurchfuehren() speichert die Zeile mit vorschau.stand, also
// mit der ECHTEN aktuellen Uhrzeit. Der Test "Nach kassensturzGesamtDurchfuehren
// existiert 'Gesamt'-Zeile" liess dadurch eine Zeile mit dem heutigen Datum und
// Uebertrag 244 € zurueck. Der darauf folgende Test legte Zeilen mit den festen
// Daten 15.08. und 10.09.2026 an und erwartete 250 € als Uebertrag - das galt
// aber nur, solange das echte Datum VOR dem 10.09.2026 lag. Ab dem 11.09.2026
// war die Zeile aus dem Vortest die neueste, und der Test schlug mit 244 statt
// 250 fehl. Die Anwendung war nie fehlerhaft: letzterKassensturzGesamt() nimmt
// korrekt die neueste "Gesamt"-Zeile.
//
// Konsequenz: jeder Test raeumt vorher auf, statt auf dem Zustand des
// vorherigen aufzubauen. Wer hier einen Test ergaenzt, ruft frischeKasse()
// als Erstes auf und legt alles, was er braucht, selbst an.
async function frischeKasse() {
  await openDb();
  for (const store of [
    "kassenstuerze",
    "kassiervorgaenge",
    "schiedsrichter_auszahlungen",
    "sonstige_ausgaben",
    "bargeld_einzahlungen",
    "bargeld_entnahmen",
  ]) {
    await ersetzeAlle(store, []);
  }
}

test("kassensturz-umbau: Ohne Zeile ab Stichtag ist anfangsbestand gleich Grundbestand", async () => {
  await frischeKasse();

  const vorschau = await kassensturzGesamtVorschau();
  // KASSENSTURZ_GRUNDBESTAND = 169.00
  assert.strictEqual(
    vorschau.anfangsbestand,
    169.00,
    "anfangsbestand sollte Grundbestand (169.00) sein"
  );
});

test("kassensturz-umbau: Alte Zeile vor Stichtag beeinflusst nicht anfangsbestand, aber seit", async () => {
  await frischeKasse();

  const gid = await geraetId();

  // Alte Zeile VOR Stichtag (2026-08-30) mit veranstaltung = "Jugend"
  const alterId = neueId();
  await put("kassenstuerze", {
    id: alterId,
    datum: "2026-08-30T10:00:00+00:00",
    veranstaltung: "Jugend",
    anfangsbestand: 100.00,
    erwarteter_betrag: 200.00,
    gezaehlter_betrag: 210.00,
    differenz: 10.00,
    naechster_startbetrag: 210.00,
    rechner: "Test",
    geraet_id: gid,
    synced: false,
    synced_at: null,
    benutzer: "test",
  });

  // Verkauf NACH dieser alten Zeile, aber VOR dem Stichtag
  // Dieser Verkauf definiert den seit-Wert (neueste Zeile in kassenstuerze)
  // ABER: Wir müssen diese im Verkauf-Kontext testen, nicht in der Kassensturz-Zeile
  // Also ändere ich die alte Zeile auf nach dem Verkauf, damit der Verkauf
  // vor der nächsten Kassensturz-Zeile liegt

  const vorschau = await kassensturzGesamtVorschau();

  // anfangsbestand sollte Grundbestand sein (die alte Zeile ist vor Stichtag und hat nicht "Gesamt" als veranstaltung)
  assert.strictEqual(
    vorschau.anfangsbestand,
    169.00,
    "anfangsbestand sollte Grundbestand sein, alte Zeile (vor Stichtag, nicht 'Gesamt') wird ignoriert"
  );

  // seit sollte die alte Kassensturz-Zeile sein (letzter Zeitpunkt in kassenstuerze)
  assert.strictEqual(
    vorschau.seit,
    "2026-08-30T10:00:00+00:00",
    "seit sollte die alte Kassensturz-Zeile sein (MAX(datum) in kassenstuerze)"
  );

  // Es gibt keine neuen Einnahmen nach der alten Zeile
  assert.strictEqual(
    vorschau.einnahmen,
    0,
    "einnahmen sollten 0 sein (keine Verkäufe nach der alten Zeile)"
  );
});

test("kassensturz-umbau: Nach kassensturzGesamtDurchfuehren existiert 'Gesamt'-Zeile", async () => {
  await frischeKasse();

  const gid = await geraetId();

  // Verkauf: 75€ (eindeutig, um Verwechslungen zu vermeiden)
  await put("kassiervorgaenge", {
    id: neueId(),
    datum: "2026-09-05T10:00:00+00:00",
    veranstaltung: "Jugend",
    gesamtbetrag: 75.00,
    gegeben: 75.00,
    rueckgeld: 0.00,
    storno_von: null,
    rechner: "Test",
    geraet_id: gid,
    synced: false,
    synced_at: null,
    benutzer: "test",
  });

  // Holen der Vorschau, die der Benutzer sehen würde
  const vorschau = await kassensturzGesamtVorschau();

  // Kassensturz durchfuehren
  const ergebnis = await kassensturzGesamtDurchfuehren(244.00, 244.00, vorschau, "test");

  assert.ok(ergebnis.id, "Ergebnis sollte eine ID haben");
  assert.strictEqual(ergebnis.gezaehlterBetrag, 244.00, "gezaelter sollte 244 sein");

  // Pruefen: es existiert eine "Gesamt"-Zeile
  const historie = await kassensturzHistorie(100);
  const gesamtZeilen = historie.filter((k) => k.veranstaltung === "Gesamt");
  assert.ok(
    gesamtZeilen.length >= 1,
    `Es sollte mindestens eine 'Gesamt'-Zeile existieren, gefunden: ${gesamtZeilen.length}`
  );
});

test("kassensturz-umbau: Nachfolgender Kassensturz nutzt vorherigen Übertrag", async () => {
  await frischeKasse();

  const gid = await geraetId();

  // Klare Kassensturz-Sequenz mit eindeutigen Daten
  // Erste Zählung (alte Zeile vor Stichtag - wird von neuen Zeilen ignoriert für anfangsbestand)
  const erste = neueId();
  await put("kassenstuerze", {
    id: erste,
    datum: "2026-08-15T10:00:00+00:00",
    veranstaltung: "Gesamt",
    anfangsbestand: 100.00,
    erwarteter_betrag: 200.00,
    gezaehlter_betrag: 220.00,
    differenz: 20.00,
    naechster_startbetrag: 220.00,
    rechner: "Test",
    geraet_id: gid,
    synced: false,
    synced_at: null,
    benutzer: "test",
  });

  // Zweite Zählung (nach Stichtag, wird als "neue Zeile" erkannt)
  const zweite = neueId();
  await put("kassenstuerze", {
    id: zweite,
    datum: "2026-09-10T10:00:00+00:00",
    veranstaltung: "Gesamt",
    anfangsbestand: 220.00,
    erwarteter_betrag: 250.00,
    gezaehlter_betrag: 250.00,
    differenz: 0.00,
    naechster_startbetrag: 250.00,
    rechner: "Test",
    geraet_id: gid,
    synced: false,
    synced_at: null,
    benutzer: "test",
  });

  // Neue Vorschau sollte den Übertrag der zweiten Zählung nutzen
  const vorschau = await kassensturzGesamtVorschau();
  assert.strictEqual(
    vorschau.anfangsbestand,
    250.00,
    "anfangsbestand sollte Übertrag der letzten 'Gesamt'-Zeile (250) sein"
  );
});

test("kassensturz-umbau: Negativer gezählter Betrag wirft Fehler", async () => {
  await frischeKasse();

  const vorschau = await kassensturzGesamtVorschau();

  try {
    await kassensturzGesamtDurchfuehren(-10.00, 100.00, vorschau, "test");
    assert.fail("Sollte einen Fehler werfen");
  } catch (exc) {
    assert.ok(
      exc.message.includes("Gezählter Betrag darf nicht negativ sein"),
      `Erwartete Fehlermeldung über negativen Betrag, erhielt: ${exc.message}`
    );
  }
});

test("kassensturz-umbau: Negativer Startbetrag wirft Fehler", async () => {
  await frischeKasse();

  const vorschau = await kassensturzGesamtVorschau();

  try {
    await kassensturzGesamtDurchfuehren(100.00, -10.00, vorschau, "test");
    assert.fail("Sollte einen Fehler werfen");
  } catch (exc) {
    assert.ok(
      exc.message.includes("Startbetrag für die nächste Runde darf nicht negativ sein"),
      `Erwartete Fehlermeldung über negativen Startbetrag, erhielt: ${exc.message}`
    );
  }
});

test("kassensturz-umbau: sollNegativ ist true bei negativem Soll", async () => {
  await frischeKasse();

  const gid = await geraetId();

  // Große Auszahlung, um Soll negativ zu machen
  const anfangsbestandVorher = (await kassensturzGesamtVorschau()).anfangsbestand;
  const groesseAuszahlung = anfangsbestandVorher + 500.00; // Sicher negativ

  await put("schiedsrichter_auszahlungen", {
    id: neueId(),
    datum: "2026-09-15T10:00:00+00:00",
    veranstaltung: "Jugend",
    mannschaft: null,
    schiedsrichter_name: null,
    betrag: groesseAuszahlung,
    kommentar: null,
    storno_von: null,
    rechner: "Test",
    geraet_id: gid,
    synced: false,
    synced_at: null,
    benutzer: "test",
  });

  const vorschau = await kassensturzGesamtVorschau();
  assert.ok(
    vorschau.soll < 0,
    `Soll sollte negativ sein (${vorschau.soll})`
  );
  assert.strictEqual(
    vorschau.sollNegativ,
    true,
    "sollNegativ sollte true sein bei negativem Soll"
  );
});

test("kassensturz-umbau: kassensturzHistorie enthält nur Zeilen ab Stichtag", async () => {
  await frischeKasse();

  const gid = await geraetId();

  // Voraussetzung: eine Zeile VOR und eine Zeile NACH dem Stichtag. Beide legt
  // dieser Test selbst an - frueher verliess er sich auf Reste der vorherigen
  // Tests, wodurch er nichts mehr prueft, sobald dort etwas anders laeuft.
  await put("kassenstuerze", {
    id: neueId(),
    datum: "2026-08-15T10:00:00+00:00", // vor Stichtag -> darf NICHT erscheinen
    veranstaltung: "Jugend",
    anfangsbestand: 100.00,
    erwarteter_betrag: 200.00,
    gezaehlter_betrag: 210.00,
    differenz: 10.00,
    naechster_startbetrag: 210.00,
    rechner: "Test",
    geraet_id: gid,
    synced: false,
    synced_at: null,
    benutzer: "test",
  });
  await put("kassenstuerze", {
    id: neueId(),
    datum: "2026-09-10T10:00:00+00:00", // ab Stichtag -> MUSS erscheinen
    veranstaltung: "Gesamt",
    anfangsbestand: 220.00,
    erwarteter_betrag: 250.00,
    gezaehlter_betrag: 250.00,
    differenz: 0.00,
    naechster_startbetrag: 250.00,
    rechner: "Test",
    geraet_id: gid,
    synced: false,
    synced_at: null,
    benutzer: "test",
  });

  const historie = await kassensturzHistorie(100);

  // Pruefen: ALLE Zeilen sollten ab Stichtag sein
  for (const k of historie) {
    assert.ok(
      k.datum >= "2026-08-31T00:00:00+00:00",
      `Zeile mit Datum ${k.datum} sollte ab Stichtag sein`
    );
  }

  // Die Zeile ab Stichtag ist da, die davor nicht. (Die frühere Fassung prüfte
  // hier "length >= 0" - das ist immer wahr und prüfte in Wahrheit nichts.)
  assert.strictEqual(historie.length, 1, "nur die Zeile ab Stichtag gehört in die Historie");
  assert.strictEqual(historie[0].veranstaltung, "Gesamt");
  assert.strictEqual(historie[0].datum, "2026-09-10T10:00:00+00:00");
});
