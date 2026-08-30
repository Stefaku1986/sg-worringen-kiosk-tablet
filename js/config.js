// Zentrale Konfiguration der Tablet-Kasse (SG Köln-Worringen).
//
// Der Supabase "publishable" Key ist bewusst fest hinterlegt - genau wie in
// der Windows-App (kiosk/config.py): dieser Key ist dafuer gedacht, in
// Client-Anwendungen eingebettet zu werden, die eigentliche Absicherung der
// Daten passiert ueber Row Level Security (RLS) in der Datenbank.

export const SUPABASE_URL = "https://tmqdaxkwxdzpifqaaqbm.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_UGRAXILrHUkfckecBNXLrQ_6Mgrq_sQ";

// Sichtbare Versionsnummer der Tablet-App, unabhaengig von CACHE_NAME in
// service-worker.js (das ist nur ein technischer Cache-Schluessel, keine
// fuer Nutzer gedachte Versionsnummer). Wird in der Kopfleiste angezeigt,
// analog zur Fenstertitel-Versionsanzeige der Windows-App (kiosk/__version__.py).
// Bei sichtbaren Aenderungen an der Tablet-App bitte erhoehen (z.B. 1.1.0
// fuer neue Funktionen, 1.0.1 fuer reine Bugfixes).
export const APP_VERSION = "1.23.1";

// Kategorien und Vorschlagswert fuer den MwSt.-Satz beim Anlegen eines
// Produkts (Runde 43, Produktverwaltung auf dem Tablet) - identisch zu
// kiosk/config.py MWST_SAETZE. Nur ein Vorschlag, pro Produkt aenderbar.
export const MWST_SAETZE = { Speise: 7, Getraenk: 19 };

// Supabase-Storage-Bucket fuer Beleg-Fotos (Runde 43, Kamera-Beleg-Scan
// auf dem Tablet) - derselbe Bucket "belege" wie am Rechner (siehe
// kiosk/config.py SUPABASE_BELEGE_BUCKET), aber ohne OCR: die Fotos werden
// unbearbeitet direkt beim Erfassen eines Wareneingangs hochgeladen (siehe
// sync.js belegHochladen()).
export const SUPABASE_BELEGE_BUCKET = "belege";

// Feste ID eines einzigen, bewusst deaktivierten Pseudo-Produkts
// "Pfandrückgabe (pauschal)" (pfand_betrag = 2,00 €), einmalig direkt in
// Supabase angelegt und dadurch identisch auf Windows und Tablet vorhanden
// (siehe kiosk/repository.py PFAND_RUECKGABE_PRODUKT_ID). Der
// "Pfand zurückgeben"-Knopf bucht damit ab Version 1.4.0 sofort eine
// pauschale Rückgabe, ohne dass zuvor eine Flasche ausgewaehlt werden muss.
export const PFAND_RUECKGABE_PRODUKT_ID = "381da34f-d563-45f5-ad65-7b4e1b0c6877";

// Runde 33: feste IDs der beiden Wasser-Sorten, die Schiedsrichter
// kostenlos erhalten koennen (siehe kiosk/repository.py
// SCHIEDSRICHTER_WASSER_STILL_PRODUKT_ID/SCHIEDSRICHTER_WASSER_MEDIUM_PRODUKT_ID,
// identisch auf Windows und Tablet). Anders als PFAND_RUECKGABE_PRODUKT_ID
// sind das ganz normale, aktive, lagergeführte Produkte. Die Knöpfe
// "Wasser (still)/(medium) für Schiedsrichter" im Reiter "Schiedsrichter"
// buchen damit sofort eine kostenlose Auszahlung (Betrag 0, ein Stück),
// ohne Dialog.
export const SCHIEDSRICHTER_WASSER_STILL_PRODUKT_ID = "1804076f-009f-46e4-a93c-3e647dfcc391";
export const SCHIEDSRICHTER_WASSER_MEDIUM_PRODUKT_ID = "a018c117-f967-44b0-955a-e5d0bbaa0f24";

// Runde 44: feste ID des bereits bestehenden, aktiven Produkts
// "Kaffee (Nespresso)" (Kategorie Getraenk, VK 1,50 €, MwSt 19%, kein
// Pfand), fuer den kostenlosen "Kaffee für Trainer"-Knopf im Reiter
// "Verkauf" (siehe kiosk/repository.py KAFFEE_TRAINER_PRODUKT_ID, identisch
// auf Windows und Tablet). Anders als bei den SCHIEDSRICHTER_WASSER_*-
// Knöpfen (Reiter "Schiedsrichter") gibt es dafuer keine eigene
// Auszahlungs-Tabelle - es wird direkt eine Korrektur-Lagerbewegung
// gebucht, ganz ohne Kassiervorgang.
export const KAFFEE_TRAINER_PRODUKT_ID = "e6f29dd2-2c17-4ca1-a418-bb36365bd703";

// Wie am Rechner: die Kassen, zwischen denen umgeschaltet werden kann.
export const VERANSTALTUNGEN = ["Jugend", "Senioren"];

// Sync-Intervall in Sekunden (automatischer Hintergrund-Sync, siehe sync.js).
export const SYNC_INTERVAL_SECONDS = 60;

// Anzeigename dieses Geraets fuer den Audit-Trail (Spalte "rechner", analog
// zu RECHNER_NAME in kiosk/config.py). Es gibt auf einem Tablet keinen
// verlaesslichen Hostnamen - deshalb ein fester, gut erkennbarer Name.
export const GERAET_NAME = "Tablet";

// Mannschaften des Vereins mit Zuordnung zur jeweiligen Kasse, fuer die
// Team-Auswahl beim Eintragen eines Heimspiels (siehe "Termine"-Ansicht).
// Stand: Trainingsplan der Vereins-Website, Sommerfahrplan 2026/2027.
export const TEAMS = [
  { team: "U5", kasse: "Jugend" },
  { team: "U6", kasse: "Jugend" },
  { team: "U7", kasse: "Jugend" },
  { team: "U8", kasse: "Jugend" },
  { team: "U9", kasse: "Jugend" },
  { team: "U10", kasse: "Jugend" },
  { team: "U12", kasse: "Jugend" },
  { team: "U14", kasse: "Jugend" },
  { team: "U16", kasse: "Jugend" },
  { team: "1. Mannschaft", kasse: "Senioren" },
  { team: "Alte Herren", kasse: "Senioren" },
];

// Kategorien und Status fuer den Reiter "Feedback" (Funktions-/
// Produktwuensche). Identisch zu kiosk/config.py.
export const FEEDBACK_KATEGORIEN = ["Funktionswunsch", "Produktwunsch", "Sonstiges"];
export const FEEDBACK_STATUS_LABEL = {
  offen: "Offen",
  in_bearbeitung: "In Bearbeitung",
  erledigt: "Erledigt",
  abgelehnt: "Abgelehnt",
};
