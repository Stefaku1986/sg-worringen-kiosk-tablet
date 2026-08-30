/**
 * Etappe 4, Schritt 4.6: Wartezeit nach 5 falschen PIN-Eingaben.
 *
 * Dies ist eine Struktur- und keine Verhaltensprüfung:
 * js/main.js benötigt das DOM und lässt sich nicht einfach als ES6-Modul
 * importieren. Stattdessen analysieren diese Tests den Quelltext mit
 * regulären Ausdrücken und einfacher Textanalyse, ob die Wartezeit-Logik
 * vorhanden ist (Zähler, Vergleich gegen 5, 30-Sekunden-Timeout,
 * setInterval/clearInterval). Sie schützen vor Regression, wenn jemand
 * die PIN-Sperre aus Versehen wieder entfernt.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "fs";
import { resolve } from "path";

const mainJs = readFileSync(resolve("js/main.js"), "utf-8");

test("js/main.js enthält Zähler für Fehlversuche", () => {
  // Prüfe auf Variable für Fehlversuch-Zähler
  // Erwartet: pinFehlverstucheCounter oder ähnliche Variable
  assert.match(
    mainJs,
    /pinFehlversuche|pinFehlverstucheCounter|pin.*[Cc]ounter|let\s+\w*[Cc]ounter.*=.*{}/,
    "js/main.js sollte eine Variable für Fehlversuch-Zähler enthalten"
  );
});

test("js/main.js enthält Vergleich gegen 5 (Schwelle für Sperre)", () => {
  // Prüfe auf die Zahl 5 im Kontext von PIN/Fehler
  assert.match(
    mainJs,
    /[>=<\s]5[,;)\s]|>= *5|== *5|!= *5/,
    "js/main.js sollte einen Vergleich gegen 5 enthalten"
  );

  // Zusätzlich: Prüfe, dass 5 zusammen mit Fehlversuch-Zähler vorkommt
  const lines = mainJs.split("\n");
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      (line.includes("Fehlversuche") || line.includes("fehlversuche") ||
       line.includes("Counter") || line.includes("counter")) &&
      /[>=<\s]5[,;)\s]|>= *5|== *5|!= *5/.test(line)
    ) {
      found = true;
      break;
    }
  }
  assert.ok(
    found,
    "Vergleich gegen 5 sollte zusammen mit Fehlversuch-Zähler vorkommen"
  );
});

test("js/main.js enthält 30-Sekunden-Timeout", () => {
  // Prüfe auf die Zahl 30 (Sekunden)
  assert.match(
    mainJs,
    /30|timeout|Timeout/i,
    "js/main.js sollte 30 oder 'timeout' enthalten"
  );

  // Zusätzlich: Prüfe, dass 30 zusammen mit setTimeout/setInterval vorkommt
  const lines = mainJs.split("\n");
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      (line.includes("30") || line.includes("timeout") || line.includes("Timeout")) &&
      (line.includes("setInterval") || line.includes("clearInterval") ||
       line.includes("setTimeout") || line.includes("clearTimeout"))
    ) {
      found = true;
      break;
    }
  }
  assert.ok(
    found,
    "30-Sekunden-Wert sollte zusammen mit setTimeout/setInterval/clear*Interval vorkommen"
  );
});

test("js/main.js verwendet setInterval oder clearInterval", () => {
  // Prüfe auf setInterval und clearInterval
  const hasSetInterval = mainJs.includes("setInterval");
  const hasClearInterval = mainJs.includes("clearInterval");

  assert.ok(
    hasSetInterval || hasClearInterval,
    "js/main.js sollte setInterval oder clearInterval verwenden"
  );

  // Idealerweise beides - Start und Stop des Timers
  if (hasSetInterval) {
    assert.ok(
      hasClearInterval,
      "Wenn setInterval verwendet wird, sollte auch clearInterval vorhanden sein"
    );
  }
});

test("pinBestaetigen Funktion existiert und enthält Fehlversuche-Logik", () => {
  // Prüfe auf die pinBestaetigen-Funktion
  assert.match(
    mainJs,
    /async\s+function\s+pinBestaetigen|function\s+pinBestaetigen|const\s+pinBestaetigen\s*=/,
    "pinBestaetigen-Funktion sollte existieren"
  );

  // Extrahiere die pinBestaetigen-Funktion
  const match = mainJs.match(
    /(?:async\s+)?(?:function\s+)?pinBestaetigen\s*\([^)]*\)\s*{[\s\S]*?^}/m
  );

  if (match) {
    const pinBestaetigenBody = match[0];

    // Prüfe, dass in dieser Funktion ein Fehlversuch-Zähler erhöht wird
    assert.ok(
      /\+\+|[+]=|counter|fehlversuche|Fehlversuche/i.test(pinBestaetigenBody),
      "pinBestaetigen sollte einen Zähler erhöhen"
    );
  }
});
