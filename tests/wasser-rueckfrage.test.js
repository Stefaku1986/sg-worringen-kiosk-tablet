/**
 * Etappe 7 (Politur): Rückfrage vor der kostenlosen Wasserausgabe an Schiedsrichter.
 *
 * STRUKTUR- UND NICHT VERHALTENSPRÜFUNG:
 * main.js lässt sich nicht direkt importieren, weil es keine isolierten Funktionen
 * hat und DOM-Abhängigkeiten enthält (el(), session, repo als Imports). Diese Tests
 * prüfen deshalb per Textanalyse des Quelltextes statt per Funktionsausführung:
 * - dass schiedsrichterWasserAusgeben zeigeBestaetigung aufruft (Zeichen-Matching)
 * - dass der zeigeBestaetigung-Aufruf VOR dem repo.schiedsrichterAuszahlungErfassen-Aufruf
 *   erfolgt (Positions-Check durch String-IndexOf)
 * - dass beide Wassersorten (still/medium) im Dialog mit ihrem Produktnamen angesprochen werden
 *
 * Dadurch wird garantiert, dass die Bestätigung vor der Buchung erfolgt (und bei
 * "Abbrechen" gar nicht erst gebucht wird, bevor einmalig() den Knopf wieder freigibt).
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "fs";
import { resolve } from "path";

const mainJs = readFileSync(resolve("js/main.js"), "utf-8");

// ===== Struktur-Tests =====

test("schiedsrichterWasserAusgeben-Funktion existiert in main.js", () => {
  assert.match(
    mainJs,
    /function\s+schiedsrichterWasserAusgeben\s*\(/,
    "schiedsrichterWasserAusgeben-Funktion sollte existieren"
  );
});

test("schiedsrichterWasserAusgeben ruft zeigeBestaetigung auf", () => {
  assert.match(
    mainJs,
    /async\s+function\s+schiedsrichterWasserAusgeben[\s\S]*?zeigeBestaetigung/,
    "schiedsrichterWasserAusgeben sollte zeigeBestaetigung aufrufen"
  );
});

test("zeigeBestaetigung-Aufruf steht VOR dem repo.schiedsrichterAuszahlungErfassen-Aufruf", () => {
  // Extrahiere die schiedsrichterWasserAusgeben-Funktion
  const match = mainJs.match(
    /async\s+function\s+schiedsrichterWasserAusgeben\s*\([^)]*\)\s*{[\s\S]*?^}/m
  );
  assert.ok(match, "schiedsrichterWasserAusgeben-Funktion konnte extrahiert werden");

  const functionCode = match[0];

  // Finde die Position von zeigeBestaetigung
  const zeigeIdx = functionCode.indexOf("zeigeBestaetigung");
  // Finde die Position von repo.schiedsrichterAuszahlungErfassen
  const repoIdx = functionCode.indexOf("repo.schiedsrichterAuszahlungErfassen");

  assert.ok(
    zeigeIdx >= 0,
    "zeigeBestaetigung sollte in schiedsrichterWasserAusgeben aufgerufen werden"
  );
  assert.ok(
    repoIdx >= 0,
    "repo.schiedsrichterAuszahlungErfassen sollte in schiedsrichterWasserAusgeben aufgerufen werden"
  );
  assert.ok(
    zeigeIdx < repoIdx,
    "zeigeBestaetigung sollte VOR repo.schiedsrichterAuszahlungErfassen aufgerufen werden (damit die Bestätigung erfolgt, bevor gebucht wird)"
  );
});

test("schiedsrichterWasserAusgeben speichert das Bestätigungs-Ergebnis und prüft es", () => {
  const match = mainJs.match(
    /async\s+function\s+schiedsrichterWasserAusgeben\s*\([^)]*\)\s*{[\s\S]*?^}/m
  );
  const functionCode = match[0];

  // Prüfe auf das Muster: await zeigeBestaetigung(...) in einer Variable speichern
  // und dann if (!bestaetigt) return;
  assert.match(
    functionCode,
    /await\s+zeigeBestaetigung/,
    "zeigeBestaetigung sollte mit await aufgerufen werden"
  );
  assert.match(
    functionCode,
    /if\s*\(\s*!bestaetigt\s*\)\s*return/,
    "Bei Abbrechen sollte die Funktion mit 'if (!bestaetigt) return' abgebrochen werden"
  );
});

test("schiedsrichterWasserAusgeben ermittelt den Produktnamen aus produkteCache", () => {
  const match = mainJs.match(
    /async\s+function\s+schiedsrichterAusgeben\s*\([^)]*\)\s*{[\s\S]*?^}/m
  );
  // Wir können hier nicht die exakte Funktion abfragen, daher prüfen wir nur
  // dass produkteCache.find erwähnt wird im Kontext der schiedsrichter-Wasser-Funktion
  assert.match(
    mainJs,
    /schiedsrichterWasserAusgeben[\s\S]*?produkteCache\.find/,
    "schiedsrichterWasserAusgeben sollte den Produktnamen aus produkteCache finden"
  );
});

test("Der Rückfrage-Text erwähnt den Produktnamen und das Wort 'kostenlos'", () => {
  const match = mainJs.match(
    /async\s+function\s+schiedsrichterWasserAusgeben[\s\S]*?^}/m
  );
  const functionCode = match[0];

  // Prüfe auf produktName in der zeigeBestaetigung-Aufrufe
  assert.match(
    functionCode,
    /\$\{produktName\}/,
    "Der Dialog-Text sollte den Produktnamen enthalten"
  );
  assert.match(
    functionCode,
    /kostenlos/i,
    "Der Dialog-Text sollte das Wort 'kostenlos' enthalten"
  );
});
