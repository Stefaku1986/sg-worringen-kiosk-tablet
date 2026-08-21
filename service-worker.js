// App-Shell-Caching fuers Offline-Arbeiten. Es wird bewusst NUR die
// App-Shell (HTML/CSS/JS/Icons dieser Anwendung, alles vom eigenen
// Ursprung) gecacht - Anfragen an esm.sh oder *.supabase.co (also die
// eigentliche Synchronisation) laufen unveraendert durchs Netzwerk und
// werden hier NICHT abgefangen. Das Kassieren funktioniert dadurch immer
// offline (App-Shell aus dem Cache + Daten aus IndexedDB), waehrend der
// Sync-Versuch bei fehlendem Internet ganz normal fehlschlaegt und beim
// naechsten Mal automatisch nachgeholt wird (siehe sync.js).

const CACHE_NAME = "sg-worringen-kiosk-tablet-v8";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/app.css",
  "./js/main.js",
  "./js/config.js",
  "./js/format.js",
  "./js/auth.js",
  "./js/db.js",
  "./js/sync.js",
  "./js/repo.js",
  "./js/session.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/logo.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Fremde Ursprünge (esm.sh, *.supabase.co, ...) unangetastet lassen -
  // die Synchronisation soll niemals veraltete/gecachte Antworten sehen.
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((treffer) => {
      if (treffer) return treffer;
      return fetch(event.request)
        .then((antwort) => {
          if (antwort.ok) {
            const kopie = antwort.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, kopie));
          }
          return antwort;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
