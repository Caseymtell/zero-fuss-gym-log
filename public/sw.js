const CACHE_NAME = "zero-fuss-gym-log-v4";
const APP_SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];

async function cacheIndexAndAssets(indexResponse) {
  const cache = await caches.open(CACHE_NAME);
  const html = await indexResponse.clone().text();
  await cache.put("./index.html", indexResponse.clone());

  const assetUrls = Array.from(
    html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g),
    (match) => match[1],
  );

  await Promise.all(assetUrls.map((url) => cache.add(url).catch(() => undefined)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => fetch("./index.html", { cache: "reload" }))
      .then((response) => cacheIndexAndAssets(response))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          cacheIndexAndAssets(response.clone());
          return response;
        })
        .catch(() => caches.match("./index.html", { ignoreVary: true })),
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreVary: true }).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === "opaque") return response;
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => new Response("", { status: 503, statusText: "Offline" }));
    })
  );
});
