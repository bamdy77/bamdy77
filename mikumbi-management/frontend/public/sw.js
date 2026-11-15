// Minimal service worker: it only makes the site installable as an app.
// It deliberately caches nothing, so staff always see live data.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
