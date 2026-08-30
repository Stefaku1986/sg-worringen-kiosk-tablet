/**
 * Etappe 5.6: Monatsfilter in Ortszeit statt UTC (B7 aus Prüfbericht).
 *
 * Ein Monat ist ein Begriff der ORTSZEIT, nicht UTC. Ein Verkauf am
 * 31.08. um 22:30 UTC ist lokal (UTC+2) bereits der 1. September und
 * sollte in der September-Abrechnung auftauchen, nicht in der August.
 *
 * Tests prüfen:
 * 1. Die lokalerMonat-Hilfsfunktion existiert und ist exportiert
 * 2. Es gibt keine direkten .slice(0, 7)-Aufrufe mehr für Monatsvergleiche
 * 3. lokalerMonat rechnet korrekt in die lokale Zeitzone um
 * 4. Grenzfälle werden korrekt behandelt (ungültige Eingaben, leere Strings)
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "fs";
import { resolve } from "path";

// ===== Zeitzone VOR dem ersten Test setzen =====
// Wichtig: process.env.TZ muss VOR dem ersten new Date()-Aufruf
// gesetzt werden, damit Node.js alle Zeitzonen-Berechnungen mit
// dieser Einstellung macht. Nach dem ersten Date-Objekt hat es
// keine Wirkung mehr auf bereits erstellte Date-Objekte, darum
// hier am Anfang der Testdatei.
process.env.TZ = "Europe/Berlin";

// Testdatei lädt die lokalerMonat-Funktion aus format.js
// Das ist eine Standard-ES6-Import-Lösung, kann aber in Tests
// nur funktionieren, wenn die Funktion exportiert ist.
import { lokalerMonat } from "../js/format.js";

const repoJs = readFileSync(resolve("js/repo.js"), "utf-8");
const formatJs = readFileSync(resolve("js/format.js"), "utf-8");

// ===== Struktur-Tests =====

test("lokalerMonat-Funktion ist in format.js definiert", () => {
  assert.match(
    formatJs,
    /export\s+function\s+lokalerMonat\s*\(/,
    "lokalerMonat sollte als export function definiert sein"
  );
});

test("lokalerMonat ist in repo.js importiert", () => {
  assert.match(
    repoJs,
    /import\s+{[\s\S]*?lokalerMonat[\s\S]*?}\s+from\s+["']\.\/format\.js["']/,
    "lokalerMonat sollte aus format.js importiert sein"
  );
});

test("Es gibt keine direkten .slice(0, 7)-Aufrufe mehr für Monatsvergleiche in repo.js", () => {
  // Diese Prüfung ist eine Struktur-Heuristik: wenn nach slice(0,7) ein
  // Vergleich (=== oder !==) kommt oder filter verwendet wird, ist es
  // wahrscheinlich ein Monatsfilter
  const lines = repoJs.split("\n");
  const problematicLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Ignoriere datumLokal (das ist eine andere Funktion, die slice(0,16) nutzt)
    if (line.includes("datumLokal")) continue;

    // Suche nach .slice(0, 7) gefolgt von einem Vergleich
    if (line.match(/\.slice\s*\(\s*0\s*,\s*7\s*\)/) &&
        (line.includes("===") || line.includes("!==") || line.includes("filter"))) {
      problematicLines.push({ line: i + 1, content: line.trim() });
    }
  }

  assert.equal(
    problematicLines.length,
    0,
    `Es sollte keine .slice(0, 7)-Aufrufe für Monatsvergleiche mehr geben, gefunden: ${
      problematicLines.map(x => `Zeile ${x.line}: ${x.content}`).join("; ")
    }`
  );
});

// ===== Verhaltensprüfung: lokalerMonat-Funktion testen =====

test("lokalerMonat: '2026-08-31T22:30:00+00:00' (31.Aug 22:30 UTC) → '2026-09' (1.Sep 00:30 Berlin)", () => {
  // Am 31. August um 22:30 UTC ist es in Berlin (UTC+2 im August -> MESZ)
  // bereits 31.Aug 00:30+02:00, also noch der 31. August lokal.
  // Aber warte: 22:30 UTC + 2 Stunden = 00:30 des NÄCHSTEN Tages = 1. September!
  // Das ist das Kernproblem aus dem Auftrag.
  const result = lokalerMonat("2026-08-31T22:30:00+00:00");
  assert.equal(result, "2026-09", "Verkauf am 31.Aug 22:30 UTC sollte zu September gehören");
});

test("lokalerMonat: '2026-09-01T10:00:00+00:00' (1.Sep 10:00 UTC) → '2026-09'", () => {
  // 1. September 10:00 UTC = 12:00 MESZ = 1. September lokal
  const result = lokalerMonat("2026-09-01T10:00:00+00:00");
  assert.equal(result, "2026-09", "Verkauf am 1.Sep 10:00 UTC sollte zu September gehören");
});

test("lokalerMonat: '2026-08-31T20:00:00+00:00' (31.Aug 20:00 UTC) → '2026-08' (noch im August lokal)", () => {
  // 31. August 20:00 UTC = 22:00 MESZ = noch 31. August lokal
  const result = lokalerMonat("2026-08-31T20:00:00+00:00");
  assert.equal(result, "2026-08", "Verkauf am 31.Aug 20:00 UTC sollte zu August gehören");
});

test("lokalerMonat: '' (leerer String) → ''", () => {
  const result = lokalerMonat("");
  assert.equal(result, "", "Leerer String sollte leeren String zurückgeben");
});

test("lokalerMonat: null → ''", () => {
  const result = lokalerMonat(null);
  assert.equal(result, "", "null sollte leeren String zurückgeben");
});

test("lokalerMonat: undefined → ''", () => {
  const result = lokalerMonat(undefined);
  assert.equal(result, "", "undefined sollte leeren String zurückgeben");
});

test("lokalerMonat: ungültiges Datum 'invalid' → ''", () => {
  const result = lokalerMonat("invalid");
  assert.equal(result, "", "Ungültiges Datum sollte leeren String zurückgeben");
});

test("lokalerMonat: '2026-01-01T00:00:00+00:00' (Jahreswechsel) → '2026-01' (Januar UTC)", () => {
  // 1. Januar 00:00 UTC = 01:00 CET = 1. Januar lokal
  const result = lokalerMonat("2026-01-01T00:00:00+00:00");
  assert.equal(result, "2026-01", "Jahreswechsel sollte korrekt berechnet werden");
});

test("lokalerMonat: '2025-12-31T23:00:00+00:00' (31.Dez 23:00 UTC) → '2026-01' (nächstes Jahr lokal)", () => {
  // 31. Dezember 23:00 UTC = 1. Januar 00:00 CET = nächstes Jahr!
  const result = lokalerMonat("2025-12-31T23:00:00+00:00");
  assert.equal(result, "2026-01", "31.Dez 23:00 UTC sollte zum nächsten Jahr gehören");
});

test("lokalerMonat: Rückgabeformat ist 'YYYY-MM'", () => {
  const result = lokalerMonat("2026-03-15T12:00:00+00:00");
  assert.match(result, /^\d{4}-\d{2}$/, "Format sollte YYYY-MM sein");
  assert.equal(result, "2026-03", "März sollte als 03 formatiert sein");
});

test("lokalerMonat: führende Nullen bei Monat", () => {
  const resultJan = lokalerMonat("2026-01-15T12:00:00+00:00");
  assert.equal(resultJan, "2026-01", "Januar sollte als 01 formatiert sein, nicht 1");

  const resultDez = lokalerMonat("2026-12-15T12:00:00+00:00");
  assert.equal(resultDez, "2026-12", "Dezember sollte als 12 formatiert sein");
});
