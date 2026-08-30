/**
 * Runde 50, Etappe 7: Komma-Eingabe bei Beträgen (deutsche Tastatur).
 *
 * Tests prüfen:
 * 1. Die betragLesen-Hilfsfunktion existiert und ersetzt Kommas durch Punkte
 * 2. Es gibt keine direkten parseFloat(...Feld.value)-Aufrufe mehr in main.js
 * 3. index.html enthält kein type="number" bei class="betrag"-Feldern
 * 4. abmelden() ruft zeigeBestaetigung auf
 * 5. Verhaltensprüfung: Parsingregeln (1,50 → 1.5, 1.50 → 1.5, "" → NaN, " 2,25 " → 2.25)
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "fs";
import { resolve } from "path";

const mainJs = readFileSync(resolve("js/main.js"), "utf-8");
const indexHtml = readFileSync(resolve("index.html"), "utf-8");

// ===== Struktur-Tests =====

test("betragLesen-Funktion existiert in main.js", () => {
  assert.match(
    mainJs,
    /function\s+betragLesen\s*\(/,
    "betragLesen-Funktion sollte existieren"
  );
});

test("betragLesen ersetzt Komma durch Punkt", () => {
  // Prüfe auf das replace-Pattern für Komma
  assert.match(
    mainJs,
    /replace\s*\(\s*[",]\s*,\s*["\.]/,
    "betragLesen sollte Komma durch Punkt ersetzen"
  );
});

test("betragLesen gibt NaN für leere Eingabe zurück", () => {
  // Prüfe auf Behandlung von leerem String -> NaN
  assert.match(
    mainJs,
    /betragLesen[\s\S]*?roh\s*===\s*""\s*[\?\s]*NaN|betragLesen[\s\S]*?"".*?NaN/,
    "betragLesen sollte NaN für leere Eingabe zurückgeben"
  );
});

test("Es gibt keinen direkten parseFloat(...value)-Aufruf auf Eingabefelder mehr", () => {
  // Suche nach parseFloat(xxx.value) - sollte es nicht mehr geben
  const lines = mainJs.split("\n");
  const problematicLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Suche nach parseFloat(...Feldname.value)
    // Ignoriere Kommentare und die betragLesen-Funktion selbst
    if (line.includes("parseFloat") && line.includes(".value")) {
      // Ignoriere Kommentare
      const codeOnly = line.split("//")[0];
      // Ignoriere Zeilen mit mwstWert (das kommt von select mit Integern)
      if (codeOnly.includes("parseFloat") && codeOnly.includes(".value") &&
          !codeOnly.includes("mwstWert") && !codeOnly.includes("parseFloat(mwstWert)")) {
        problematicLines.push({ line: i + 1, content: line.trim() });
      }
    }
  }
  assert.equal(
    problematicLines.length,
    0,
    `Es sollte keine direkten parseFloat(...field.value)-Aufrufe mehr geben, gefunden: ${
      problematicLines.map(x => `Zeile ${x.line}: ${x.content}`).join("; ")
    }`
  );
});

test("index.html enthält kein type=\"number\" bei class=\"betrag\"-Feldern", () => {
  // Suche nach type="number" UND class="betrag" in der gleichen Zeile oder nah beieinander
  const lines = indexHtml.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('class="betrag"') || line.includes("class='betrag'")) {
      // Prüfe diese Zeile und die nächste (für mehrzeilige inputs)
      const context = (lines[i] + " " + (lines[i + 1] || "")).toLowerCase();
      if (context.includes('type="number"') || context.includes("type='number'")) {
        assert.fail(
          `Zeile ${i + 1}: Feld mit class="betrag" sollte nicht type="number" sein: ${line}`
        );
      }
    }
  }
});

test("abmelden-Funktion ruft zeigeBestaetigung auf", () => {
  // Prüfe, dass abmelden die zeigeBestaetigung-Funktion aufruft
  assert.match(
    mainJs,
    /async\s+function\s+abmelden[\s\S]*?zeigeBestaetigung/,
    "abmelden sollte zeigeBestaetigung aufrufen"
  );
});

test("abmelden warnt vor Warenkorb-Verlust wenn Warenkorb nicht leer ist", () => {
  // Prüfe, dass abmelden auf warenkorb.length prüft
  assert.match(
    mainJs,
    /abmelden[\s\S]*?warenkorb\.length/,
    "abmelden sollte auf warenkorb.length prüfen"
  );
});

// ===== Verhaltensprüfung: Hilfsfunktion extrahieren und testen =====

test("betragLesen-Verhalten: '1,50' → 1.5", () => {
  const betragLesen = extractBetragLesenFunction();
  const feld = { value: "1,50" };
  const result = betragLesen(feld);
  assert.equal(result, 1.5, "betragLesen('1,50') sollte 1.5 ergeben");
});

test("betragLesen-Verhalten: '1.50' → 1.5", () => {
  const betragLesen = extractBetragLesenFunction();
  const feld = { value: "1.50" };
  const result = betragLesen(feld);
  assert.equal(result, 1.5, "betragLesen('1.50') sollte 1.5 ergeben");
});

test("betragLesen-Verhalten: '' → NaN", () => {
  const betragLesen = extractBetragLesenFunction();
  const feld = { value: "" };
  const result = betragLesen(feld);
  assert.ok(Number.isNaN(result), "betragLesen('') sollte NaN ergeben");
});

test("betragLesen-Verhalten: ' 2,25 ' → 2.25", () => {
  const betragLesen = extractBetragLesenFunction();
  const feld = { value: " 2,25 " };
  const result = betragLesen(feld);
  assert.equal(result, 2.25, "betragLesen(' 2,25 ') sollte 2.25 ergeben");
});

test("betragLesen-Verhalten: null-coalescing bei null feld", () => {
  const betragLesen = extractBetragLesenFunction();
  const feld = null;
  const result = betragLesen(feld);
  assert.ok(Number.isNaN(result), "betragLesen(null) sollte NaN ergeben");
});

test("betragLesen-Verhalten: '2,5' → 2.5", () => {
  const betragLesen = extractBetragLesenFunction();
  const feld = { value: "2,5" };
  const result = betragLesen(feld);
  assert.equal(result, 2.5, "betragLesen('2,5') sollte 2.5 ergeben");
});

test("betragLesen-Verhalten: '100,00' → 100", () => {
  const betragLesen = extractBetragLesenFunction();
  const feld = { value: "100,00" };
  const result = betragLesen(feld);
  assert.equal(result, 100, "betragLesen('100,00') sollte 100 ergeben");
});

test("betragLesen-Verhalten: 'abc' → NaN", () => {
  const betragLesen = extractBetragLesenFunction();
  const feld = { value: "abc" };
  const result = betragLesen(feld);
  assert.ok(Number.isNaN(result), "betragLesen('abc') sollte NaN ergeben");
});

test("betragLesen-Verhalten: '1.234,56' → 1234.56 (Tausenderpunkt)", () => {
  const betragLesen = extractBetragLesenFunction();
  const feld = { value: "1.234,56" };
  const result = betragLesen(feld);
  assert.equal(result, 1234.56, "betragLesen('1.234,56') sollte 1234.56 ergeben");
});

test("betragLesen-Verhalten: '1.234.567,89' → 1234567.89 (mehrere Tausenderpunkte)", () => {
  const betragLesen = extractBetragLesenFunction();
  const feld = { value: "1.234.567,89" };
  const result = betragLesen(feld);
  assert.equal(result, 1234567.89, "betragLesen('1.234.567,89') sollte 1234567.89 ergeben");
});

test("betragLesen-Verhalten: '1234,56' → 1234.56 (ohne Tausenderpunkt)", () => {
  const betragLesen = extractBetragLesenFunction();
  const feld = { value: "1234,56" };
  const result = betragLesen(feld);
  assert.equal(result, 1234.56, "betragLesen('1234,56') sollte 1234.56 ergeben");
});

test("betragLesen-Verhalten: '1.50' → 1.5 (ohne Komma bleibt Punkt)", () => {
  const betragLesen = extractBetragLesenFunction();
  const feld = { value: "1.50" };
  const result = betragLesen(feld);
  assert.equal(result, 1.5, "betragLesen('1.50') sollte 1.5 ergeben (Punkt bleibt Dezimalpunkt)");
});

test("betragLesen-Verhalten: '1.234' → 1.234 (ohne Komma wird Punkt nicht entfernt)", () => {
  const betragLesen = extractBetragLesenFunction();
  const feld = { value: "1.234" };
  const result = betragLesen(feld);
  assert.equal(result, 1.234, "betragLesen('1.234') sollte 1.234 ergeben (Punkt als Dezimalpunkt)");
});

// ===== Hilfsfunktion zum Extrahieren und Testen von betragLesen =====

function extractBetragLesenFunction() {
  // Extrahiere die betragLesen-Funktion aus main.js
  const match = mainJs.match(
    /function\s+betragLesen\s*\([^)]*\)\s*{[\s\S]*?^}/m
  );
  if (!match) {
    throw new Error("betragLesen-Funktion konnte nicht extrahiert werden");
  }

  const functionCode = match[0];
  // Erstelle eine neue Funktion aus dem Code (mit eval oder Function-Konstruktor)
  // Hier verwenden wir einen sicheren Ansatz: per eval in isoliertem Scope
  const fn = eval(`(${functionCode})`);
  return fn;
}
