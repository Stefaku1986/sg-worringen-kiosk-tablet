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

import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_BELEGE_BUCKET } from "./config.js";
import { getAll, putAll, ersetzeAlle } from "./db.js";

// Der Supabase-Client wird bewusst per dynamischem import() erst beim
// ersten tatsaechlichen Sync-Versuch nachgeladen, statt als statischer
// Import ganz oben in der Datei: ein statischer Import wuerde das Laden
// des GESAMTEN Modul-Graphen (also der ganzen App inkl. main.js) blockieren
// bzw. zum Scheitern bringen, wenn beim allerersten Aufruf gerade kein
// Internet verfuegbar ist. So funktioniert die App inkl. Kassieren immer
// offline - nur der eigentliche Sync-Versuch schlaegt dann fehl (und wird
// unten sauber abgefangen).

// Runde 43: "produkte" und "benutzer" sind jetzt auf dem Tablet ebenfalls
// beschreibbar (Produkt-/Benutzerverwaltung, siehe repo.js) - vorher reine
// Lesekopien, siehe Projekt-Status-Dokument "Runde 43". "push vor pull"
// (wie beim Feedback-Reiter) sorgt dafuer, dass eine hier vorgenommene
// Aenderung nicht durch den direkt anschliessenden Pull ueberschrieben
// wird; bei gleichzeitiger Bearbeitung auf zwei Geraeten gewinnt (wie am
// Rechner) der zuletzt synchronisierte Stand ("Last-Write-Wins").
const NUR_LESEN_TABELLEN = ["trainingszeiten"];
const SCHREIBBARE_TABELLEN = [
  "produkte",
  "benutzer",
  "kassiervorgaenge",
  "positionen",
  "lagerbewegungen",
  "kassenstuerze",
  "schiedsrichter_auszahlungen",
  "bargeld_einzahlungen",
  "lieferanten_pfand",
  "nachbestellung_positionen",
  "heimspiele",
  // Feedback-Reiter (Funktions-/Produktwuensche): anders als die meisten
  // anderen Tabellen hier eine mutable Zeile (status/antwort werden
  // nachtraeglich veraendert, siehe repo.js feedbackStatusSetzen) - "push
  // vor pull" sorgt wie bei "benutzer" dafuer, dass keine Merge-Konflikte
  // entstehen.
  "feedback",
  // Runde 27 (Buchhaltungs-Erweiterung): sonstige Kiosk-Ausgaben und
  // dokumentierte Bargeld-Entnahmen - beide wie schiedsrichter_auszahlungen
  // unveraenderliche Ereignisse mit Storno.
  "sonstige_ausgaben",
  "bargeld_entnahmen",
  // Runde 43: Pfand-Gewinn-Verbuchungen (Auswertung, siehe repo.js).
  "pfand_gewinn_verbuchungen",
];
const ALLE_TABELLEN = [...NUR_LESEN_TABELLEN, ...SCHREIBBARE_TABELLEN];

// Spalten, die lokal als 0/1 (SQLite-Konvention, siehe kiosk/db.py) bzw.
// hier als JS-Boolean gefuehrt werden, remote aber als echtes boolean.
const BOOL_SPALTEN = {
  produkte: ["aktiv"],
  trainingszeiten: ["aktiv"],
  positionen: ["ist_helferpreis", "ist_pfandrueckgabe", "pfand_erlassen"],
  benutzer: ["ist_admin", "aktiv"],
  // Runde 43: Abschreibungen (siehe repo.js).
  lagerbewegungen: ["ist_abschreibung"],
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

// Maximale Dauer eines Sync-Versuchs. Ohne dieses Zeitlimit kann der Sync-
// Knopf theoretisch fuer immer bei "Synchronisiere..." haengen bleiben, ohne
// jede Rueckmeldung - das ist tatsaechlich vorgekommen (21.08.2026), als auf
// einem Android-Tablet noch eine alte App-Instanz (z.B. ein zweiter Tab) im
// Hintergrund offen war und dadurch die lokale Datenbank-Aktualisierung
// (siehe db.js, openDb()) blockiert hat, ohne dass Supabase oder das
// nachgeladene esm.sh-Skript selbst das Problem waren - beide waren fuer
// sich genommen einwandfrei erreichbar. Ein hartes Zeitlimit sorgt dafuer,
// dass die App in so einem Fall spaetestens nach dieser Zeit eine konkrete,
// hilfreiche Fehlermeldung zeigt statt endlos stumm zu haengen.
const SYNC_TIMEOUT_MS = 20_000;

function verzoegerung(ms, wert) {
  return new Promise((resolve) => setTimeout(() => resolve(wert), ms));
}

export async function syncJetzt() {
  const ergebnis = { gepusht: 0, geholt: 0, zeitpunkt: null, fehler: null, fehlgeschlageneTabellen: [] };
  const ZEITUEBERSCHREITUNG = Symbol("zeitueberschreitung");
  const fehlgeschlageneMit = new Set(); // sammelt Tabellennamen (nur unique)

  try {
    // Laeuft bewusst als eigenstaendiges Promise weiter, auch wenn das
    // Zeitlimit unten zuerst greift: die einzelnen Tabellen-Operationen
    // schreiben ihre Teilergebnisse direkt in "ergebnis" (per Referenz),
    // ein evtl. verspaeteter Erfolg geht also nicht verloren, auch wenn
    // schon eine Zeitueberschreitung gemeldet wurde.
    const lauf = (async () => {
      // Push: mit eigenem try/catch pro Tabelle, damit eine Fehler
      // die uebrigen nicht unterbricht.
      for (const tabelle of SCHREIBBARE_TABELLEN) {
        try {
          ergebnis.gepusht += await pushTabelle(tabelle);
        } catch (exc) {
          fehlgeschlageneMit.add(tabelle);
          console.error(`Sync Push fehlgeschlagen für "${tabelle}":`, exc?.message ?? String(exc));
        }
      }
      // Pull: eigenstaendige Schleife mit eigenem try/catch pro Tabelle.
      for (const tabelle of ALLE_TABELLEN) {
        try {
          ergebnis.geholt += await pullTabelle(tabelle);
        } catch (exc) {
          fehlgeschlageneMit.add(tabelle);
          console.error(`Sync Pull fehlgeschlagen für "${tabelle}":`, exc?.message ?? String(exc));
        }
      }
    })();
    const wettlaufErgebnis = await Promise.race([
      lauf.then(() => null),
      verzoegerung(SYNC_TIMEOUT_MS, ZEITUEBERSCHREITUNG),
    ]);
    if (wettlaufErgebnis === ZEITUEBERSCHREITUNG) {
      throw new Error(
        `Zeitüberschreitung nach ${SYNC_TIMEOUT_MS / 1000}s – läuft die App ` +
          "evtl. noch in einem anderen Tab/Fenster? Bitte alle Tabs schließen " +
          "und die App neu öffnen."
      );
    }

    // Fehlgeschlagene Tabellen im stabiler Reihenfolge sammeln.
    if (fehlgeschlageneMit.size > 0) {
      ergebnis.fehlgeschlageneTabellen = ALLE_TABELLEN.filter((t) => fehlgeschlageneMit.has(t));
      const tabellennamen = ergebnis.fehlgeschlageneTabellen.join(", ");
      const anzahl = ergebnis.fehlgeschlageneTabellen.length;
      ergebnis.fehler = `${anzahl} von ${ALLE_TABELLEN.length} Tabellen konnten nicht synchronisiert werden: ${tabellennamen}`;
    }

    ergebnis.zeitpunkt = new Date().toISOString();
    synchronisiertCallback?.(ergebnis);
  } catch (exc) {
    ergebnis.fehler = exc?.message ?? String(exc);
    // Bei Fehler beim Verbindungsaufbau: fehlgeschlageneTabellen bleibt leer,
    // zeitpunkt wird nicht gesetzt.
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

// ---------------------------------------------------------------------
// Beleg-Foto-Upload (Runde 43) - Pendant zur Beleg-Upload-Logik in
// kiosk/sync.py (_belege_hochladen), aber ohne den Umweg ueber einen
// lokalen Ordner: das Tablet hat keinen Dateisystem-Ordner zum Scannen,
// stattdessen wird ein per Kamera aufgenommenes Foto SOFORT beim Erfassen
// eines Wareneingangs direkt in denselben Supabase-Storage-Bucket
// "belege" hochgeladen (kein OCR, reine Bild-Ablage). Objektname = neue
// UUID + Original-Dateiendung, damit Kollisionen zwischen Geraeten
// praktisch ausgeschlossen sind (identisches Prinzip wie am Rechner).
// Wirft bei einem Fehler (z.B. kein Internet) eine Exception - der
// Aufrufer (main.js) faengt das ab und erfasst den Wareneingang trotzdem,
// nur ohne Beleg-Foto (Offline-Faehigkeit hat Vorrang).
// ---------------------------------------------------------------------

function belegContentType(dateiname) {
  const endung = dateiname.slice(dateiname.lastIndexOf(".")).toLowerCase();
  const typen = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".pdf": "application/pdf",
    ".heic": "image/heic",
  };
  return typen[endung] || "application/octet-stream";
}

export async function belegHochladen(datei) {
  const endung = datei.name && datei.name.includes(".")
    ? datei.name.slice(datei.name.lastIndexOf("."))
    : ".jpg";
  const objektname = `${crypto.randomUUID()}${endung}`;
  const sb = await supabase();
  const { error } = await sb.storage
    .from(SUPABASE_BELEGE_BUCKET)
    .upload(objektname, datei, { contentType: belegContentType(objektname), upsert: true });
  if (error) throw error;
  return objektname;
}
