/**
 * Etappe 6, Schritte 6.1 und 6.2 (Prüfbericht B2):
 * Fehlerhafte Tabellen dürfen andere nicht mitreißen.
 *
 * Dies ist eine Struktur- und keine Verhaltensprüfung:
 * js/sync.js spricht mit Supabase über das Netz und lässt sich nicht ohne
 * Weiteres im Test ausführen. Diese Tests analysieren stattdessen den Quelltext
 * mit regulären Ausdrücken und einfacher Textanalyse, ob der Aufbau die
 * folgenden Eigenschaften erfüllt:
 * - Innerhalb der Push-Schleife steht ein eigenes try/catch pro Tabelle
 * - Innerhalb der Pull-Schleife steht ein eigenes try/catch pro Tabelle
 * - Es gibt eine Sammelstruktur für fehlgeschlagene Tabellen
 * - Das Rückgabeobjekt hat ein Feld "fehlgeschlageneTabellen"
 * Diese Tests schützen vor Regression, wenn jemand den Aufbau wieder zu
 * einem einzigen umschließenden try/catch zurückbaut.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "fs";
import { resolve } from "path";

const syncJs = readFileSync(resolve("js/sync.js"), "utf-8");

test("Push-Schleife enthält ein try/catch für jede Tabelle (nicht ein umschließendes)", () => {
  // Finde die Push-Schleife (for SCHREIBBARE_TABELLEN)
  const pushMatch = syncJs.match(
    /for\s*\(\s*const\s+tabelle\s+of\s+SCHREIBBARE_TABELLEN\s*\)\s*{[\s\S]*?(?=\s*for\s*\(\s*const\s+tabelle\s+of\s+ALLE_TABELLEN)/
  );

  assert.ok(
    pushMatch,
    "Push-Schleife sollte gefunden werden (for ... SCHREIBBARE_TABELLEN)"
  );

  const pushBody = pushMatch[0];

  // Prüfe: es gibt ein try direkt in der Schleife (nicht nur außen)
  assert.ok(
    /{\s*try\s*{[\s\S]*?await\s+pushTabelle/.test(pushBody),
    "Push-Schleife sollte ein try-Block enthalten, der die pushTabelle()-Aufrufe umhüllt"
  );

  // Prüfe: das try wird in einem catch beendet
  assert.ok(
    /try\s*{[\s\S]*?await\s+pushTabelle[\s\S]*?}\s*catch\s*\(/.test(pushBody),
    "Push-Schleife sollte ein catch nach dem try haben"
  );

  // Prüfe: der catch behandelt Fehler (log, sammlung, o.ä.)
  assert.ok(
    /catch\s*\(\s*exc\s*\)[\s\S]*?{[\s\S]*?(console\.error|fehlgeschlagen|Fehler)/i.test(pushBody),
    "Push-catch sollte Fehler behandeln (z.B. console.error, Fehlerflag)"
  );
});

test("Pull-Schleife enthält ein try/catch für jede Tabelle (nicht ein umschließendes)", () => {
  // Finde die Pull-Schleife (for ALLE_TABELLEN, zweite Schleife)
  // Strategie: suche ab dem Ende der Push-Schleife nach ALLE_TABELLEN
  const afterPush = syncJs.indexOf("for (const tabelle of ALLE_TABELLEN");
  assert.ok(afterPush > 0, "Pull-Schleife (for ALLE_TABELLEN) sollte existieren");

  const pullMatch = syncJs.substring(afterPush).match(
    /for\s*\(\s*const\s+tabelle\s+of\s+ALLE_TABELLEN\s*\)\s*{[\s\S]*?(?=}\s*\);)/
  );

  assert.ok(
    pullMatch,
    "Pull-Schleife sollte gefunden werden (for ... ALLE_TABELLEN)"
  );

  const pullBody = pullMatch[0];

  // Prüfe: es gibt ein try direkt in der Schleife
  assert.ok(
    /{\s*try\s*{[\s\S]*?await\s+pullTabelle/.test(pullBody),
    "Pull-Schleife sollte ein try-Block enthalten, der die pullTabelle()-Aufrufe umhüllt"
  );

  // Prüfe: das try wird in einem catch beendet
  assert.ok(
    /try\s*{[\s\S]*?await\s+pullTabelle[\s\S]*?}\s*catch\s*\(/.test(pullBody),
    "Pull-Schleife sollte ein catch nach dem try haben"
  );

  // Prüfe: der catch behandelt Fehler
  assert.ok(
    /catch\s*\(\s*exc\s*\)[\s\S]*?{[\s\S]*?(console\.error|fehlgeschlagen|Fehler)/i.test(pullBody),
    "Pull-catch sollte Fehler behandeln (z.B. console.error, Fehlerflag)"
  );
});

test("Es gibt eine Sammelstruktur für fehlgeschlagene Tabellen", () => {
  // Prüfe auf Deklaration einer Sammelstruktur (Set oder Array)
  assert.ok(
    /const\s+fehlgeschlangen|new\s+Set\(\)|fehlgeschlagenen/.test(syncJs),
    "syncJetzt() sollte eine Variable zur Sammlung fehlgeschlagener Tabellen haben"
  );

  // Prüfe: die Sammlung wird mit .add() oder .push() gefüllt
  assert.ok(
    /fehlgeschlagen\S*\.add\(|fehlgeschlagen\S*\.push\(/.test(syncJs),
    "Die Sammelstruktur sollte mit .add() oder .push() gefüllt werden"
  );
});

test("Rückgabeobjekt von syncJetzt() hat fehlgeschlageneTabellen-Feld", () => {
  // Prüfe auf fehlgeschlageneTabellen im Rückgabeobjekt
  assert.ok(
    /fehlgeschlageneTabellen\s*:/.test(syncJs),
    "Das Rückgabeobjekt sollte ein Feld 'fehlgeschlageneTabellen' haben"
  );

  // Prüfe: das Feld wird initialisiert (z.B. = [] oder = new Set())
  assert.ok(
    /fehlgeschlageneTabellen\s*:\s*\[\]|fehlgeschlageneTabellen\s*=/.test(syncJs),
    "fehlgeschlageneTabellen sollte initialisiert werden"
  );
});

test("Fehlerbericht nennt Tabellennamen bei Teilfehlern", () => {
  // Prüfe: die Fehlermeldung wird konstruiert und enthält Tabellennamen
  assert.ok(
    /ergebnis\.fehler\s*=|ergebnis\.fehler\s*:|fehlgeschlageneTabellen\.join/.test(syncJs),
    "Die Fehlermeldung sollte Tabellennamen aus fehlgeschlageneTabellen enthalten"
  );

  // Prüfe: es gibt einen Hinweis auf "von X Tabellen" (z.B. "3 von 16")
  assert.ok(
    /von\s*\$\{ALLE_TABELLEN\.length\}|von.*Tabellen|Tabellen.*konnten|:.*fehlgeschlageneTabellen/i.test(syncJs),
    "Der Fehlerbericht sollte die Anzahl fehlgeschlagener Tabellen angeben"
  );
});

test("Zeitstempel wird auch bei Teilfehlern gesetzt", () => {
  // Prüfe: zeitpunkt wird gesetzt, auch wenn fehlgeschlageneTabellen nicht leer ist
  // (das zeitpunkt sollte NACH dem Fehlercheck gesetzt werden, ist aber noch im
  // erfolgreichen Block, nicht im catch)
  const successPath = syncJs.match(
    /ergebnis\.zeitpunkt\s*=\s*new\s+Date\(\)\.toISOString\(\);[\s\S]*?synchronisiertCallback/
  );

  assert.ok(
    successPath,
    "zeitpunkt sollte vor dem synchronisiertCallback() gesetzt werden (im Erfolgsfall)"
  );
});

test("Verbindungsaufbau-Fehler behalten das alte Format bei (keine fehlgeschlageneTabellen)", () => {
  // Prüfe: außerhalb des Erfolgs-Blocks gibt es einen catch für Verbindungsfehler
  assert.ok(
    /catch\s*\(\s*exc\s*\)\s*{[\s\S]*?ergebnis\.fehler\s*=/.test(syncJs),
    "Es sollte einen äußeren catch für Verbindungsfehler geben"
  );

  // Der äußere catch setzt fehler, aber nicht zeitpunkt oder fehlgeschlageneTabellen
  // Das ist eine Konvention - schwer als Regex zu prüfen. Stattdessen prüfen wir,
  // dass der äußere catch NICHT zeitpunkt setzt:
  const catchBlocks = syncJs.match(/catch\s*\([^)]*\)\s*{[\s\S]*?}/g) || [];
  const outerCatch = catchBlocks[catchBlocks.length - 1]; // der letzte catch

  assert.ok(
    outerCatch && !outerCatch.includes("ergebnis.zeitpunkt"),
    "Der äußere catch (Verbindungsfehler) sollte zeitpunkt NICHT setzen"
  );
});
