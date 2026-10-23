// Palestra OCF — service worker: l'app si apre anche senza rete; la pagina si aggiorna appena c'è connessione.
const CACHE = "palestra-ocf-v46";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.hostname.endsWith("supabase.co") || url.pathname.endsWith("/version.txt")) return; // progressi e numero di versione sempre dalla rete
  if (req.mode === "navigate" || url.pathname.endsWith("/index.html")) {
    // pagina: prima la rete (versione aggiornata), altrimenti la copia salvata; si salva solo la pagina dell'app arrivata bene (niente 404/errori)
    const APP = new URL("./", self.location.href).pathname, isApp = url.pathname === APP || url.pathname === APP + "index.html";
    // con rete lenta o bloccata (iPad in 4G debole) non si resta sulla pagina bianca: dopo 2,5 s si apre la copia salvata
    const cached = () => caches.match(isApp ? "./index.html" : req).then(h => h || caches.match("./index.html"));
    const net = fetch(req).then(r => { if (r.ok && isApp) { const c = r.clone(); caches.open(CACHE).then(k => k.put("./index.html", c)); } return r; });
    const slow = new Promise(res => setTimeout(res, 2500)).then(cached).then(h => h || net);
    e.respondWith(Promise.race([net.catch(cached), slow]).then(r => r || net).catch(cached));
    return;
  }
  // font, icone e altre risorse: copia salvata se c'è, poi aggiornamento in background
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(r => { if (r.ok || r.type === "opaque") { const c = r.clone(); caches.open(CACHE).then(k => k.put(req, c)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
