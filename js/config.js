// Zentrale Konfiguration der Tablet-Kasse (SG Köln-Worringen).
//
// Der Supabase "publishable" Key ist bewusst fest hinterlegt - genau wie in
// der Windows-App (kiosk/config.py): dieser Key ist dafuer gedacht, in
// Client-Anwendungen eingebettet zu werden, die eigentliche Absicherung der
// Daten passiert ueber Row Level Security (RLS) in der Datenbank.

export const SUPABASE_URL = "https://tmqdaxkwxdzpifqaaqbm.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_UGRAXILrHUkfckecBNXLrQ_6Mgrq_sQ";

// Wie am Rechner: die Kassen, zwischen denen umgeschaltet werden kann.
export const VERANSTALTUNGEN = ["Jugend", "Senioren"];

// Sync-Intervall in Sekunden (automatischer Hintergrund-Sync, siehe sync.js).
export const SYNC_INTERVAL_SECONDS = 60;

// Anzeigename dieses Geraets fuer den Audit-Trail (Spalte "rechner", analog
// zu RECHNER_NAME in kiosk/config.py). Es gibt auf einem Tablet keinen
// verlaesslichen Hostnamen - deshalb ein fester, gut erkennbarer Name.
export const GERAET_NAME = "Tablet";
