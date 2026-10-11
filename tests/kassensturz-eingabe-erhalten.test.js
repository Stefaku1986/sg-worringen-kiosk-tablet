// Runde 61: Auf dem Tablet liess sich im Reiter "Kassensturz" kein Betrag mehr
// eintippen - die Eingabe verschwand alle paar Sekunden wieder.
//
// Ursache war eine Endlosschleife: renderKassensturz() synchronisiert zwingend
// (syncJetzt), jeder erfolgreiche Sync meldet sich ueber onSynchronisiert
// zurueck, das ruft nachSyncAktualisieren() und das baute die Kassensturz-
// Ansicht neu auf - also wieder syncJetzt, wieder Neuaufbau. Am Ende jedes
// Aufbaus stand ksGezaehltFeld.value = "".
//
// Diese Tests sichern beides ab: der Sync im Kassensturz-Ablauf laeuft genau
// einmal, und ein Hintergrund-Neuaufbau loescht den eingetippten Betrag nicht.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const quelltext = readFileSync("js/main.js", "utf-8");

// Schneidet eine Funktion ab "async function <name>(" bis zur schliessenden
// Klammer am Zeilenanfang heraus.
function funktion(name) {
  const start = quelltext.indexOf(`async function ${name}(`);
  assert.ok(start >= 0, `${name}() nicht gefunden`);
  const ende = quelltext.indexOf("\n}\n", start);
  assert.ok(ende > start, `Ende von ${name}() nicht gefunden`);
  return quelltext.slice(start, ende + 3);
}

test("kassensturz-eingabe: renderKassensturz() synchronisiert nur ohne mitgeliefertes Ergebnis", () => {
  const code = funktion("renderKassensturzIntern");
  assert.match(
    code,
    /const syncErgebnis = syncErgebnisVorgegeben \?\? await syncJetzt\(\);/,
    "Der Sync muss uebersprungen werden, wenn schon ein Sync-Ergebnis vorliegt"
  );
  assert.strictEqual(
    (code.match(/syncJetzt\(\)/g) || []).length,
    1,
    "Im Kassensturz-Aufbau darf syncJetzt() nur an einer Stelle stehen"
  );
});

test("kassensturz-eingabe: nachSyncAktualisieren() reicht das Sync-Ergebnis durch", () => {
  const code = funktion("nachSyncAktualisieren");
  assert.match(
    code,
    /async function nachSyncAktualisieren\(syncErgebnis/,
    "nachSyncAktualisieren() muss das Sync-Ergebnis entgegennehmen"
  );
  assert.match(
    code,
    /renderKassensturz\(syncErgebnis\)/,
    "nachSyncAktualisieren() muss das Ergebnis an renderKassensturz() weitergeben"
  );
  assert.doesNotMatch(
    code,
    /renderKassensturz\(\)/,
    "Ein Aufruf ohne Argument wuerde erneut synchronisieren - die Endlosschleife"
  );
});

test("kassensturz-eingabe: der Sync-Rueckruf uebergibt sein Ergebnis", () => {
  const rueckruf = quelltext.slice(
    quelltext.indexOf("onSynchronisiert((ergebnis) =>"),
    quelltext.indexOf("async function syncManuellAusloesen")
  );
  assert.ok(rueckruf.length > 0, "onSynchronisiert-Rueckruf nicht gefunden");
  assert.match(
    rueckruf,
    /nachSyncAktualisieren\(ergebnis\)/,
    "Der Sync-Rueckruf muss sein Ergebnis weiterreichen"
  );
});

test("kassensturz-eingabe: Hintergrund-Neuaufbau loescht das Eingabefeld nicht", () => {
  const code = funktion("renderKassensturzIntern");

  // Das Leeren des Feldes darf nur im Nicht-Hintergrund-Zweig stehen.
  const leerstellen = [...code.matchAll(/ksGezaehltFeld\.value = "";/g)].map((m) => m.index);
  assert.strictEqual(leerstellen.length, 2, "Erwartet: Fehlerzweig und regulaerer Zweig");

  const hintergrundAbbruch = code.indexOf("if (hintergrund) return;");
  assert.ok(
    hintergrundAbbruch >= 0 && hintergrundAbbruch < leerstellen[0],
    "Im Fehlerzweig muss der Hintergrund-Aufbau abbrechen, bevor etwas geleert wird"
  );

  const regulaer = code.slice(code.indexOf("if (hintergrund) {", leerstellen[0]));
  assert.match(
    regulaer,
    /if \(hintergrund\) \{[\s\S]*ksGezaehltGeaendert\(\);[\s\S]*\} else \{[\s\S]*ksGezaehltFeld\.value = "";/,
    "Im regulaeren Zweig darf nur ausserhalb des Hintergrund-Falls geleert werden"
  );
});

test("kassensturz-eingabe: der echte Wiedereintritts-Schutz ueberspringt Hintergrund-Aufbauten", async () => {
  // Nicht nachgebaut, sondern der echte Wrapper aus main.js: die Flagge und
  // renderKassensturz() werden herausgeloest und mit einem Platzhalter fuer
  // renderKassensturzIntern() ausgefuehrt.
  const flagge = "let kassensturzRenderLaeuft = false;";
  assert.ok(quelltext.includes(flagge), "Flagge kassensturzRenderLaeuft nicht gefunden");
  const code = flagge + "\n" + funktion("renderKassensturz");

  const aufrufe = [];
  let freigeben;
  const bauen = new Function(
    "renderKassensturzIntern",
    `${code}; return renderKassensturz;`
  )((vorgegeben, hintergrund) => {
    aufrufe.push({ hintergrund });
    return new Promise((r) => {
      freigeben = r;
    });
  });

  // Benutzer oeffnet den Reiter: Aufbau laeuft noch.
  const laufend = bauen();
  assert.deepStrictEqual(aufrufe, [{ hintergrund: false }]);

  // Zwei Hintergrund-Syncs melden sich waehrenddessen - beide werden verworfen.
  await bauen({ zeitpunkt: "jetzt" });
  await bauen({ zeitpunkt: "jetzt" });
  assert.strictEqual(aufrufe.length, 1, "Hintergrund-Aufbauten muessen uebersprungen werden");

  // Nach dem Ende laeuft ein Hintergrund-Aufbau wieder durch.
  freigeben();
  await laufend;
  const zweiter = bauen({ zeitpunkt: "jetzt" });
  assert.deepStrictEqual(aufrufe[1], { hintergrund: true });
  freigeben();
  await zweiter;
});
