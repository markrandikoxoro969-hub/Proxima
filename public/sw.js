/*
 * PROXIMA service worker. Deliberately tiny and safe:
 *  - It caches ONE thing: the offline page (/offline.html).
 *  - When you open a page with no internet, you see that page instead of the
 *    browser's error screen. Everything else goes straight to the network as
 *    usual, so chats, login and the API are never served stale.
 * Change CACHE (v1 → v2) if you edit offline.html, so phones fetch the new copy.
 */
const CACHE = "proxima-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" }))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  // Only full page loads. Images, scripts, API calls etc. are untouched.
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse;
        if (preloaded) return preloaded;
        return await fetch(event.request);
      } catch {
        const cached = await caches.match(OFFLINE_URL);
        return cached ?? Response.error();
      }
    })(),
  );
});
