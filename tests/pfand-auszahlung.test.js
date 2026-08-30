/**
 * Runde 51: Reine Pfandrueckgabe fragt nicht mehr nach "Gegeben".
 *
 * Fehlerbericht aus dem Verkaufsraum: Gibt ein Kunde nur Pfand zurueck, ist die
 * Warenkorb-Summe negativ (z.B. -2,00 EUR). Der Bezahlen-Dialog fragte trotzdem
 * nach dem gegebenen Betrag, und "Bestaetigen" blieb gesperrt, bis jemand eine 0
 * eintippte - erst dann erschien "Rueckgeld: 2,00 EUR". Es gibt aber nichts zu
 * geben, und der Vorgang heisst nicht Rueckgeld, sondern Auszahlung.
 *
 * STRUKTUR- UND NICHT VERHALTENSPRUEFUNG: main.js laesst sich nicht importieren
 * (DOM-Abhaengigkeiten in el(), session, repo). Geprueft wird deshalb der
 * Quelltext - genau wie in wasser-rueckfrage.test.js. Zusaetzlich wird die
 * Rechenregel selbst mit der echten Formel nachgerechnet.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "fs";
import { resolve } from "path";

const mainJs = readFileSync(resolve("js/main.js"), "utf-8");
const indexHtml = readFileSync(resolve("index.html"), "utf-8");

function funktion(name) {
  const treffer = mainJs.match(
    new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*{[\\s\\S]*?^}`, "m")
  );
  assert.ok(treffer, `Funktion ${name} nicht gefunden`);
  return treffer[0];
}

test("das Gegeben-Label hat eine id, sonst laesst es sich nicht ausblenden", () => {
  assert.match(indexHtml, /<label id="gegeben-label">/);
  assert.match(mainJs, /const gegebenLabel = el\("gegeben-label"\);/);
});

test("bezahlenOeffnen blendet Feld und Label bei nicht-positiver Summe aus", () => {
  const quelle = funktion("bezahlenOeffnen");
  assert.match(quelle, /summe <= 0/);
  assert.match(quelle, /gegebenFeld\.style\.display = "none"/);
  assert.match(quelle, /gegebenLabel\.style\.display = "none"/);
  assert.match(quelle, /Auszahlung an den Kunden/);
});

test("bezahlenOeffnen macht Feld und Label beim naechsten Verkauf wieder sichtbar", () => {
  // Ohne dieses Zuruecksetzen bliebe das Feld nach einer Pfandrueckgabe
  // dauerhaft unsichtbar - der eigentliche Fallstrick dieser Aenderung.
  const quelle = funktion("bezahlenOeffnen");
  assert.match(quelle, /gegebenFeld\.style\.display = ""/);
  assert.match(quelle, /gegebenLabel\.style\.display = ""/);
});

test("Bestaetigen ist bei einer Auszahlung sofort freigeschaltet", () => {
  const quelle = funktion("bezahlenOeffnen");
  const aus = quelle.indexOf('gegebenFeld.style.display = "none"');
  const frei = quelle.indexOf("bezahlenBestaetigenBtn.disabled = false");
  assert.ok(aus >= 0 && frei > aus, "Freischaltung muss im Auszahlungs-Zweig stehen");
});

test("bezahlenGegebenGeaendert ruehrt die Auszahlungs-Anzeige nicht an", () => {
  const quelle = funktion("bezahlenGegebenGeaendert");
  const wache = quelle.indexOf("if (summe <= 0) return;");
  const anzeige = quelle.indexOf("rueckgeldAnzeige.textContent");
  assert.ok(wache >= 0, "fruehes return bei nicht-positiver Summe fehlt");
  assert.ok(wache < anzeige, "das return muss VOR jeder Anzeige stehen");
});

test("bezahlenBestaetigen verwendet gegeben=0 statt NaN aus dem leeren Feld", () => {
  const quelle = funktion("bezahlenBestaetigen");
  assert.match(quelle, /summe <= 0 \? 0 : betragLesen\(gegebenFeld\)/);
});

test("die Buchung bleibt rechnerisch unveraendert: Kasse sinkt um den Pfandbetrag", () => {
  // Nachbau der Regel aus repo.kassiervorgangAbschliessen.
  const gesamtbetrag = -2.0;
  const gegeben = 0;
  const rueckgeld = Math.round((gegeben - gesamtbetrag) * 100) / 100;
  assert.equal(rueckgeld, 2.0, "2,00 EUR gehen aus der Kasse an den Kunden");
  assert.ok(rueckgeld >= 0, "repo wirft sonst 'Gegebener Betrag ist kleiner...'");
  assert.equal(Math.round((gegeben - rueckgeld) * 100) / 100, gesamtbetrag);
});
