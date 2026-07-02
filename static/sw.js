// Service worker: caches the app shell (fast launch + offline), but always
// tries the network first so a fresh deploy is picked up. %%VERSION%% is
// stamped in by server.py — it changes on every deploy, so the browser sees
// this file as new and installs the update; the page then prompts to refresh.
const VERSION = "%%VERSION%%";
const CACHE = "spelling-" + VERSION;
const SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  // Cache the shell, but do NOT skipWaiting — we wait so the page can show
  // an "Update" button; it messages us SKIP_WAITING when the user taps it.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Pushes arrive EMPTY on purpose (payload encryption needs crypto the
// stdlib server doesn't have) — the tickle wakes us, we pull the actual
// message(s) from the server using our own subscription endpoint as the key.
self.addEventListener("push", (e) => {
  e.waitUntil((async () => {
    let messages = [];
    try {
      const sub = await self.registration.pushManager.getSubscription();
      if (sub) {
        const r = await fetch("/api/push/pull", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        messages = (await r.json()).messages || [];
      }
    } catch (_) { /* offline or racing — show the generic note below */ }
    if (!messages.length) {
      messages = [{ title: "Spelling Practice", body: "Something new is waiting! ✨" }];
    }
    // iOS requires every push to show a notification — never skip this
    await Promise.all(messages.map((m) =>
      self.registration.showNotification(m.title || "Spelling Practice", {
        body: m.body || "",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
      })));
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (wins.length) return wins[0].focus();
    return self.clients.openWindow("/");
  })());
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Never cache API traffic — progress and the version check must be live.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/.hub/")) {
    return; // fall through to network
  }
  // App shell: network-first, fall back to cache when offline.
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        // never let a 404/500 during a server restart overwrite a good copy
        if (resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(e.request).then((m) => m || caches.match("/index.html")))
  );
});
