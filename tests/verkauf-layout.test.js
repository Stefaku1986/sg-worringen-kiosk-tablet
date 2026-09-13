// Runde 59 (Nutzerwunsch 13.09.2026): Im Reiter "Verkauf" standen fuenf
// Aktionsknoepfe untereinander ueber dem Warenkorb. Das schob die Warenkorb-
// Liste weit nach unten und verschenkte auf dem Tablet viel Hoehe.
//
// Neu: Warenkorb ganz oben, darunter die Aktionsknoepfe in einem 2er-Raster,
// ganz unten Summe und Bezahlen. Gleiche Anordnung wie am Rechner.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const indexHtml = readFileSync("index.html", "utf-8");
const appCss = readFileSync("css/app.css", "utf-8");

function position(suchtext) {
  const i = indexHtml.indexOf(suchtext);
  assert.ok(i >= 0, `${suchtext} nicht in index.html gefunden`);
  return i;
}

test("verkauf-layout: Warenkorb steht vor den Aktionsknoepfen", () => {
  assert.ok(
    position('id="warenkorb-liste"') < position('id="aktions-raster"'),
    "Die Warenkorb-Liste muss VOR dem Aktions-Raster stehen"
  );
});

test("verkauf-layout: Summe und Bezahlen bleiben ganz unten", () => {
  const raster = position('id="aktions-raster"');
  assert.ok(raster < position('id="summe"'), "Summe muss unter dem Raster stehen");
  assert.ok(position('id="summe"') < position('id="bezahlen-btn"'), "Bezahlen ganz unten");
});

test("verkauf-layout: alle fuenf Aktionsknoepfe liegen im Raster", () => {
  const raster = indexHtml.match(/<div id="aktions-raster">([\s\S]*?)<\/div>/);
  assert.ok(raster, "aktions-raster nicht gefunden");
  for (const id of [
    "helferpreis-btn",
    "pfand-rueckgabe-btn",
    "pfand-rueckgabe-1-btn",
    "kaffee-trainer-btn",
    "tee-trainer-btn",
  ]) {
    assert.ok(raster[1].includes(`id="${id}"`), `${id} gehoert ins Aktions-Raster`);
  }
});

test("verkauf-layout: Raster hat zwei Spalten, Helferpreis ueber die volle Breite", () => {
  assert.match(
    appCss,
    /#aktions-raster\s*\{[^}]*grid-template-columns:\s*1fr 1fr/,
    "Das Raster muss zwei gleich breite Spalten haben"
  );
  assert.match(
    appCss,
    /#aktions-raster \.helferpreis-btn\s*\{[^}]*grid-column:\s*1 \/ -1/,
    "Der Helferpreis-Knopf soll beide Spalten einnehmen"
  );
});
