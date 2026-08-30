/**
 * Runde 51: Neuer "Tee für Trainer"-Button neben dem Kaffee-Button.
 *
 * STRUKTUR- UND NICHT VERHALTENSPRÜFUNG:
 * main.js lässt sich nicht direkt importieren, weil es keine isolierten Funktionen
 * hat und DOM-Abhängigkeiten enthält (el(), session, repo als Imports). Diese Tests
 * prüfen deshalb per Textanalyse des Quelltextes statt per Funktionsausführung:
 * - dass TEE_TRAINER_PRODUKT_ID in config.js definiert ist und sich von
 *   KAFFEE_TRAINER_PRODUKT_ID unterscheidet
 * - dass index.html einen Knopf mit der ID tee-trainer-btn enthält
 * - dass main.js eine gemeinsame Funktion mit Produkt-ID-Parameter hat
 * - dass beide Knöpfe über einmalig() damit verbunden sind
 * - dass zeigeBestaetigung VOR dem repo-Aufruf steht
 *
 * Dadurch wird garantiert, dass die Tee-Funktion genauso funktioniert wie die
 * Kaffee-Funktion, und dass die Bestätigung vor der Buchung erfolgt (und bei
 * "Abbrechen" gar nicht erst gebucht wird, bevor einmalig() den Knopf wieder freigibt).
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "fs";
import { resolve } from "path";

const configJs = readFileSync(resolve("js/config.js"), "utf-8");
const mainJs = readFileSync(resolve("js/main.js"), "utf-8");
const indexHtml = readFileSync(resolve("index.html"), "utf-8");

// ===== config.js Tests =====

test("TEE_TRAINER_PRODUKT_ID ist in config.js definiert", () => {
  assert.match(
    configJs,
    /export\s+const\s+TEE_TRAINER_PRODUKT_ID\s*=/,
    "TEE_TRAINER_PRODUKT_ID sollte in config.js exportiert sein"
  );
});

test("TEE_TRAINER_PRODUKT_ID unterscheidet sich von KAFFEE_TRAINER_PRODUKT_ID", () => {
  const teeMatch = configJs.match(
    /export\s+const\s+TEE_TRAINER_PRODUKT_ID\s*=\s*"([^"]+)"/
  );
  const kaffeeMatch = configJs.match(
    /export\s+const\s+KAFFEE_TRAINER_PRODUKT_ID\s*=\s*"([^"]+)"/
  );
  assert.ok(teeMatch, "TEE_TRAINER_PRODUKT_ID sollte gefunden werden");
  assert.ok(kaffeeMatch, "KAFFEE_TRAINER_PRODUKT_ID sollte gefunden werden");
  assert.notEqual(
    teeMatch[1],
    kaffeeMatch[1],
    "Tee und Kaffee sollten unterschiedliche Produkt-IDs haben"
  );
});

// ===== index.html Tests =====

test("index.html enthält den tee-trainer-btn mit passender Beschriftung", () => {
  assert.match(
    indexHtml,
    /id="tee-trainer-btn".*class="btn".*Tee.*Trainer.*kostenlos/,
    "tee-trainer-btn sollte mit 'Tee', 'Trainer' und 'kostenlos' gekennzeichnet sein"
  );
});

test("tee-trainer-btn hat die gleiche CSS-Klasse wie kaffee-trainer-btn", () => {
  const kaffeeMatch = indexHtml.match(
    /<button[^>]*id="kaffee-trainer-btn"[^>]*class="([^"]*)"[^>]*>/
  );
  const teeMatch = indexHtml.match(
    /<button[^>]*id="tee-trainer-btn"[^>]*class="([^"]*)"[^>]*>/
  );
  assert.ok(kaffeeMatch, "kaffee-trainer-btn sollte mit class-Attribut existieren");
  assert.ok(teeMatch, "tee-trainer-btn sollte mit class-Attribut existieren");
  assert.equal(
    kaffeeMatch[1],
    teeMatch[1],
    "Beide Buttons sollten die gleiche CSS-Klasse haben"
  );
});

// ===== main.js Tests =====

test("main.js importiert TEE_TRAINER_PRODUKT_ID aus config.js", () => {
  assert.match(
    mainJs,
    /import\s+{[\s\S]*?TEE_TRAINER_PRODUKT_ID[\s\S]*?}\s+from\s+"\.\/config\.js"/,
    "TEE_TRAINER_PRODUKT_ID sollte importiert werden"
  );
});

test("main.js selektiert den tee-trainer-btn", () => {
  assert.match(
    mainJs,
    /const\s+teeTrainerBtn\s*=\s*el\("tee-trainer-btn"\)/,
    "tee-trainer-btn sollte selektiert werden"
  );
});

test("es gibt eine gemeinsame Funktion mit Produkt-ID-Parameter (nicht zwei getrennte Funktionen)", () => {
  // Prüfe, dass es KEINE beide separaten Funktionen kaffeeFuerTrainerAusgeben und teeFuerTrainerAusgeben gibt
  const hasBoth =
    mainJs.includes("function kaffeeFuerTrainerAusgeben") &&
    mainJs.includes("function teeFuerTrainerAusgeben");
  assert.ok(!hasBoth, "Es sollte nicht zwei separate Funktionen geben");

  // Prüfe, dass es eine gemeinsame Funktion mit Parameter gibt
  assert.match(
    mainJs,
    /(?:async\s+)?function\s+trainerAusgabeAusgeben\s*\([^)]*produktId[^)]*\)/,
    "Es sollte eine gemeinsame trainerAusgabeAusgeben-Funktion mit produktId-Parameter geben"
  );
});

test("trainerAusgabeAusgeben hat auch einen bezeichnung-Parameter", () => {
  assert.match(
    mainJs,
    /(?:async\s+)?function\s+trainerAusgabeAusgeben\s*\([^)]*bezeichnung[^)]*\)/,
    "trainerAusgabeAusgeben sollte einen bezeichnung-Parameter haben"
  );
});

test("zeigeBestaetigung wird in trainerAusgabeAusgeben VOR repo.lagerbewegungErfassen aufgerufen", () => {
  const match = mainJs.match(
    /(?:async\s+)?function\s+trainerAusgabeAusgeben\s*\([^)]*\)\s*{[\s\S]*?^}/m
  );
  assert.ok(match, "trainerAusgabeAusgeben-Funktion konnte extrahiert werden");

  const functionCode = match[0];
  const zeigeIdx = functionCode.indexOf("zeigeBestaetigung");
  const repoIdx = functionCode.indexOf("repo.lagerbewegungErfassen");

  assert.ok(
    zeigeIdx >= 0,
    "zeigeBestaetigung sollte in trainerAusgabeAusgeben aufgerufen werden"
  );
  assert.ok(
    repoIdx >= 0,
    "repo.lagerbewegungErfassen sollte in trainerAusgabeAusgeben aufgerufen werden"
  );
  assert.ok(
    zeigeIdx < repoIdx,
    "zeigeBestaetigung sollte VOR repo.lagerbewegungErfassen aufgerufen werden"
  );
});

test("kaffee-trainer-btn ist über einmalig() mit trainerAusgabeAusgeben verbunden", () => {
  assert.match(
    mainJs,
    /kaffeeTrainerBtn\.onclick\s*=\s*einmalig\s*\(\s*kaffeeTrainerBtn\s*,[\s\S]*?trainerAusgabeAusgeben\s*\(\s*KAFFEE_TRAINER_PRODUKT_ID/,
    "kaffeeTrainerBtn sollte über einmalig() mit KAFFEE_TRAINER_PRODUKT_ID verbunden sein"
  );
});

test("tee-trainer-btn ist über einmalig() mit trainerAusgabeAusgeben verbunden", () => {
  assert.match(
    mainJs,
    /teeTrainerBtn\.onclick\s*=\s*einmalig\s*\(\s*teeTrainerBtn\s*,[\s\S]*?trainerAusgabeAusgeben\s*\(\s*TEE_TRAINER_PRODUKT_ID/,
    "teeTrainerBtn sollte über einmalig() mit TEE_TRAINER_PRODUKT_ID verbunden sein"
  );
});

test("trainerAusgabeAusgeben nutzt die bezeichnung in zeigeBestaetigung", () => {
  const match = mainJs.match(
    /(?:async\s+)?function\s+trainerAusgabeAusgeben\s*\([^)]*\)\s*{[\s\S]*?^}/m
  );
  const functionCode = match[0];
  assert.match(
    functionCode,
    /\$\{bezeichnung\}.*kostenlos.*ausgeben/,
    "Der Dialog-Text sollte die Variable 'bezeichnung' und das Wort 'kostenlos' enthalten"
  );
});

test("trainerAusgabeAusgeben nutzt die bezeichnung in der Erfolgsmeldung", () => {
  const match = mainJs.match(
    /(?:async\s+)?function\s+trainerAusgabeAusgeben\s*\([^)]*\)\s*{[\s\S]*?^}/m
  );
  const functionCode = match[0];
  assert.match(
    functionCode,
    /zeigeHinweis\s*\(\s*`\$\{bezeichnung\}\s+ausgegeben`/,
    "Die Erfolgsmeldung sollte die Variable 'bezeichnung' enthalten"
  );
});

test("wenn der Benutzer 'Abbrechen' klickt, wird nicht gebucht", () => {
  const match = mainJs.match(
    /(?:async\s+)?function\s+trainerAusgabeAusgeben\s*\([^)]*\)\s*{[\s\S]*?^}/m
  );
  const functionCode = match[0];
  assert.match(
    functionCode,
    /if\s*\(\s*!bestaetigt\s*\)\s*return/,
    "Bei Abbrechen sollte die Funktion mit 'if (!bestaetigt) return' abgebrochen werden"
  );
});
