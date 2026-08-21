// Lokaler Offline-Speicher (IndexedDB) - Pendant zu kiosk/db.py.
//
// Jedes Tablet hat seinen eigenen lokalen Speicher, der komplett ohne
// Internet funktioniert. Die Tabellen "produkte", "benutzer" und
// "schiedsrichter_auszahlungen" sind reine Lesekopien (werden nur
// heruntergeladen, nie von hier aus veraendert - Produktverwaltung,
// Benutzerverwaltung und Schiedsrichter-Auszahlungen bleiben Aufgaben der
// Windows-App). Die uebrigen Tabellen sind schreibbar und werden per
// sync.js mit der zentralen Supabase-Datenbank abgeglichen (gleiches
// Push-dann-Pull-Prinzip wie kiosk/sync.py).

const DB_NAME = "sg-worringen-kiosk-tablet";
const DB_VERSION = 1;

// Bewusst ohne zusaetzliche Indizes: bei den ueberschaubaren Datenmengen
// eines Vereins-Kiosks ist ein einfaches getAll() + Filtern in JavaScript
// schnell genug und deutlich weniger fehleranfaellig als IndexedDB-Indizes
// zu pflegen.
const STORES = {
  produkte: { keyPath: "id" },
  benutzer: { keyPath: "id" },
  schiedsrichter_auszahlungen: { keyPath: "id" },
  kassiervorgaenge: { keyPath: "id" },
  positionen: { keyPath: "id" },
  lagerbewegungen: { keyPath: "id" },
  kassenstuerze: { keyPath: "id" },
  meta: { keyPath: "schluessel" },
};

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, def] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, { keyPath: def.keyPath });
        for (const idx of def.indexes ?? []) {
          store.createIndex(idx, idx);
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, storeNames, mode) {
  return db.transaction(storeNames, mode);
}

export async function getAll(storeName) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = tx(db, storeName, "readonly").objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function get(storeName, key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = tx(db, storeName, "readonly").objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function put(storeName, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = tx(db, storeName, "readwrite");
    t.objectStore(storeName).put(value);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function putAll(storeName, values) {
  if (!values.length) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = tx(db, storeName, "readwrite");
    const store = t.objectStore(storeName);
    for (const v of values) store.put(v);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// Ersetzt den gesamten Inhalt einer reinen Lesekopie-Tabelle durch die
// angegebenen Zeilen (fuer produkte/benutzer/schiedsrichter_auszahlungen -
// so verschwinden z.B. inzwischen deaktivierte/geloeschte Zeilen auch
// lokal wieder korrekt).
export async function ersetzeAlle(storeName, values) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = tx(db, storeName, "readwrite");
    const store = t.objectStore(storeName);
    store.clear();
    for (const v of values) store.put(v);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function metaGet(schluessel) {
  const zeile = await get("meta", schluessel);
  return zeile ? zeile.wert : null;
}

export async function metaSet(schluessel, wert) {
  await put("meta", { schluessel, wert });
}

// ---------------------------------------------------------------------
// Geraete-Identitaet (analog zu repository.geraet_id())
// ---------------------------------------------------------------------

export async function geraetId() {
  let id = await metaGet("geraet_id");
  if (!id) {
    id = crypto.randomUUID();
    await metaSet("geraet_id", id);
  }
  return id;
}

// ---------------------------------------------------------------------
// Monotoner Zeitstempel (analog zu repository._now()) - garantiert
// innerhalb dieser Browser-Sitzung streng aufsteigende Zeitstempel, auch
// bei mehreren Buchungen innerhalb derselben Millisekunde.
// ---------------------------------------------------------------------

let letzterZeitstempel = null;

export function jetzt() {
  let t = new Date();
  if (letzterZeitstempel && t.getTime() <= letzterZeitstempel.getTime()) {
    t = new Date(letzterZeitstempel.getTime() + 1);
  }
  letzterZeitstempel = t;
  return t.toISOString();
}

export function neueId() {
  return crypto.randomUUID();
}
