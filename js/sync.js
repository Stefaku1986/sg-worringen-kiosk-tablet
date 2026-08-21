// Synchronisation zwischen dem lokalen Offline-Speicher (IndexedDB) und der
// zentralen Supabase-Datenbank - Pendant zu kiosk/sync.py.
//
// Ablauf bei jedem Sync-Versuch (identisch zur Windows-App):
//   1. Push: alle lokal noch nicht synchronisierten Datensaetze der
//      schreibbaren Tabellen werden per Upsert (nach id) hochgeladen.
//   2. Pull: anschliessend werden die reinen Lesekopien (Produkte,
//      Benutzer, Trainingszeiten) komplett neu heruntergeladen, und alle
//      schreibbaren Tabellen ebenfalls neu geholt (inkl. Aenderungen
//      anderer Geraete/Rechner).
//
// Kassiervorgaenge/Positionen/Lagerbewegungen/Kassenstuerze/
// Schiedsrichter-Auszahlungen/Bargeld-Einzahlungen/Heimspiele sind rein
// anfuegende (append-only) Datensaetze - es kann daher zu keinen
// Merge-Konflikten kommen. Ohne Internet schlaegt der Versuch einfach fehl
// und wird beim naechsten Mal wiederholt; das Kassieren selbst ist davon
// nie betroffen.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { getAll, putAll, ersetzeAlle } from "./db.js";

// Der Supabase-Client wird bewusst per dynamischem import() erst beim
// ersten tatsaechlichen Sync-Versuch nachgeladen, statt als statischer
// Import ganz oben in der Datei: ein statischer Import wuerde das Laden
// des GESAMTEN Modul-Graphen (also der ganzen App inkl. main.js) blockieren
// bzw. zum Scheitern bringen, wenn beim allerersten Aufruf gerade kein
// Internet verfuegbar ist. So funktioniert die App inkl. Kassieren immer
// offline - nur der eigentliche Sync-Versuch schlaegt dann fehl (und wird
// unten sauber abgefangen).

const NUR_LESEN_TABELLEN = ["produkte", "benutzer", "trainingszeiten"];
const SCHREIBBARE_TABELLEN = [
  "kassiervorgaenge",
  "positionen",
  "lagerbewegungen",
  "kassenstuerze",
  "schiedsrichter_auszahlungen",
  "bargeld_einzahlungen",
  "heimspiele",
];
const ALLE_TABELLEN = [...NUR_LESEN_TABELLEN, ...SCHREIBBARE_TABELLEN];

// Spalten, die lokal als 0/1 (SQLite-Konvention, siehe kiosk/db.py) bzw.
// hier als JS-Boolean gefuehrt werden, remote aber als echtes boolean.
const BOOL_SPALTEN = {
  produkte: ["aktiv"],
  trainingszeiten: ["aktiv"],
  positionen: ["ist_helferpreis"],
  benutzer: ["ist_admin", "aktiv"],
};

let client = null;
async function supabase() {
  if (!client) {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.112.3");
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;
}

let synchronisiertCallback = null;
export function onSynchronisiert(fn) {
  synchronisiertCallback = fn;
}

function zeileFuerPush(tabelle, zeile) {
  const daten = { ...zeile };
  delete daten.synced;
  for (const spalte of BOOL_SPALTEN[tabelle] ?? []) {
    if (spalte in daten) daten[spalte] = !!daten[spalte];
  }
  return daten;
}

async function pushTabelle(tabelle) {
  const alle = await getAll(tabelle);
  const unsynced = alle.filter((z) => !z.synced);
  if (!unsynced.length) return 0;
  const jetzt = new Date().toISOString();
  const payload = unsynced.map((z) => ({ ...zeileFuerPush(tabelle, z), synced_at: jetzt }));
  const sb = await supabase();
  const { error } = await sb.from(tabelle).upsert(payload);
  if (error) throw error;
  await putAll(
    tabelle,
    unsynced.map((z) => ({ ...z, synced: true, synced_at: jetzt }))
  );
  return unsynced.length;
}

function zeileNachPull(tabelle, zeile) {
  const daten = { ...zeile };
  for (const spalte of BOOL_SPALTEN[tabelle] ?? []) {
    if (spalte in daten && daten[spalte] !== null) daten[spalte] = daten[spalte] ? 1 : 0;
  }
  daten.synced = true;
  return daten;
}

async function pullTabelle(tabelle) {
  const sb = await supabase();
  const { data, error } = await sb.from(tabelle).select("*");
  if (error) throw error;
  const zeilen = (data ?? []).map((z) => zeileNachPull(tabelle, z));
  if (NUR_LESEN_TABELLEN.includes(tabelle)) {
    if (zeilen.length === 0 && (await getAll(tabelle)).length > 0) {
      // Sicherheitsnetz: eine leere Antwort (z.B. durch einen kurzzeitigen
      // Netzwerk-/Server-Haenger, oder falls der Pull mitten in einem
      // Datenbank-Reset landet) darf niemals den kompletten lokalen
      // Bestand loeschen - sonst kann sich z.B. bei "benutzer" plötzlich
      // niemand mehr am Tablet anmelden. Ein echtes "es gibt jetzt wirklich
      // 0 Benutzer/Produkte" ist in der Praxis so unwahrscheinlich, dass
      // dieses Sicherheitsnetz das deutlich wahrscheinlichere Problem
      // (leere/unvollstaendige Antwort) abfaengt, ohne die eigentliche
      // Absicht von ersetzeAlle() (Loeschungen/Deaktivierungen korrekt
      // uebernehmen) fuer den Normalfall zu beeintraechtigen.
      console.warn(
        `Sync: "${tabelle}" lieferte 0 Zeilen, obwohl lokal noch Daten vorhanden sind - ` +
          "lokaler Bestand bleibt unveraendert, um ihn nicht faelschlich zu leeren."
      );
      return 0;
    }
    await ersetzeAlle(tabelle, zeilen);
  } else {
    await putAll(tabelle, zeilen);
  }
  return zeilen.length;
}

export async function syncJetzt() {
  const ergebnis = { gepusht: 0, geholt: 0, zeitpunkt: null, fehler: null };
  try {
    for (const tabelle of SCHREIBBARE_TABELLEN) {
      ergebnis.gepusht += await pushTabelle(tabelle);
    }
    for (const tabelle of ALLE_TABELLEN) {
      ergebnis.geholt += await pullTabelle(tabelle);
    }
    ergebnis.zeitpunkt = new Date().toISOString();
    synchronisiertCallback?.(ergebnis);
  } catch (exc) {
    ergebnis.fehler = exc?.message ?? String(exc);
  }
  return ergebnis;
}

// Startet den wiederkehrenden Hintergrund-Sync (Intervall) sowie einen
// sofortigen Versuch bei jedem "online"-Ereignis des Browsers (z.B. wenn
// der Hotspot wieder verfuegbar wird).
export function syncAutomatikStarten(intervallSekunden) {
  window.addEventListener("online", () => syncJetzt());
  setInterval(() => syncJetzt(), intervallSekunden * 1000);
}
