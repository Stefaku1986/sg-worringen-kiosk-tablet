/**
 * Runde 54: Zwei Pfandrückgabe-Knöpfe für zwei unterschiedliche Beträge.
 *
 * Im Sortiment gibt es zwei Pfandwerte: 2,00 EUR (Flaschen) und 1,00 EUR
 * (Wasser, Red Bull). Ein einzelner Knopf mit festem Betrag reicht nicht mehr.
 * Es gibt deshalb zwei Knöpfe nebeneinander.
 *
 * STRUKTUR- UND NICHT VERHALTENSPRÜFUNG: main.js lässt sich nicht importieren
 * (DOM-Abhängigkeiten in el(), session, repo). Geprüft wird deshalb der
 * Quelltext - genau wie in wasser-rueckfrage.test.js.
 *
 * WICHTIGSTER PUNKT (Regressionsprüfung): Die find-Bedingung muss auch nach
 * dem Betrag filtern (z.pfandBetrag === -betrag), sonst werden ein Tipp auf
 * "1,00 EUR" und eine bestehende 2,00-EUR-Zeile zusammenzählt - der Kunde
 * bekäme 2,00 statt 1,00 EUR ausgezahlt (Geldfehler!).
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "fs";
import { resolve } from "path";

const mainJs = readFileSync(resolve("js/main.js"), "utf-8");
const indexHtml = readFileSync(resolve("index.html"), "utf-8");

test("beide Knopf-Ids existieren in index.html", () => {
  assert.match(indexHtml, /id="pfand-rueckgabe-btn"/);
  assert.match(indexHtml, /id="pfand-rueckgabe-1-btn"/);
});

test("beide Knöpfe werden in main.js per el() geholt", () => {
  assert.match(mainJs, /const pfandRueckgabeBtn = el\("pfand-rueckgabe-btn"\)/);
  assert.match(mainJs, /const pfandRueckgabe1Btn = el\("pfand-rueckgabe-1-btn"\)/);
});

test("pfandRueckgabeKlick nimmt einen Parameter entgegen", () => {
  assert.match(mainJs, /async function pfandRueckgabeKlick\(betrag\)/);
});

test("der 2,00-EUR-Knopf ist verdrahtet", () => {
  assert.match(mainJs, /pfandRueckgabeBtn\.onclick = \(\) => pfandRueckgabeKlick\(2\)/);
});

test("der 1,00-EUR-Knopf ist verdrahtet", () => {
  assert.match(mainJs, /pfandRueckgabe1Btn\.onclick = \(\) => pfandRueckgabeKlick\(1\)/);
});

test("die find-Bedingung filtert nach dem Betrag - REGRESSIONSPRÜFUNG", () => {
  // Ohne diesen Betrag-Filter würden beide Knöpfe dieselbe Warenkorb-Position
  // finden und erhöhen - ein Geldfehler! Die 1,00-EUR-Zeile würde mit der
  // 2,00-EUR-Zeile vermischt.
  assert.match(
    mainJs,
    /z\.produktId === produkt\.id && z\.istPfandrueckgabe && z\.pfandBetrag === -betrag/
  );
});

test("die Warenkorb-Zeile setzt pfandBetrag mit dem Parameter", () => {
  assert.match(mainJs, /pfandBetrag: -betrag/);
});
