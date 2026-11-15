"use strict";

const CACHE_NAME = "gather-shell-v116";
const APP_BASE = new URL("./", self.registration.scope);
const SHELL_URLS = [
  "./",
  "./index.html",
  "./app.css?v=20261114-group-avatar-left-8",
  "./games.css?v=20261114-uno-card-count-strip-1",
  "./party.css?v=20261114-party-hub-2",
  "./ludo.css?v=20261114-neon-board-1",
  "./dominoes.css?v=20261114-dominoes-draw-fix-1",
  "./uno.css?v=20261114-adaptive-table-1",
  "./design-system.css?v=20261114-interface-sync-5",
  "./games.js?v=20261114-shared-board-pilot-1",
  "./games/core/index.mjs",
  "./games/core/game-registry.mjs",
  "./games/core/match-contract.mjs",
  "./games/core/match-sync.mjs",
  "./games/core/action-dispatcher.mjs",
  "./games/core/game-module-contract.mjs",
  "./games/core/lobby-service.mjs",
  "./games/core/supabase-adapters.mjs",
  "./games/modules/legacy-board-modules.mjs",
  "./games/modules/dominoes/index.mjs",
  "./games/modules/uno/index.mjs",
  "./games/modules/ludo/index.mjs",
  "./game-people-picker.js?v=20261114-selection-limit-1",
  "./party.js?v=20261114-uno-ready-3",
  "./game-chat.js?v=20261114-gather-chat-icon-2",
  "./uno.js?v=20261114-shared-engine-1",
  "./ludo.js?v=20261114-shared-engine-1",
  "./dominoes.js?v=20261114-shared-engine-1",
  "./app.js?v=20261114-dominoes-live-hub-2",
  "./favicon.svg?v=20261111-1",
  "./manifest.webmanifest?v=20261111-pwa",
  "./icons/gather-180.png",
  "./icons/gather-192.png",
  "./icons/gather-512.png"
].map(path => new URL(path, APP_BASE).href);

const STATIC_PATHS = new Set([
  "./index.html",
  "./app.css",
  "./app.js",
  "./games.css",
  "./party.css",
  "./ludo.css",
  "./dominoes.css",
  "./uno.css",
  "./design-system.css",
  "./games.js",
  "./games/core/index.mjs",
  "./games/core/game-registry.mjs",
  "./games/core/match-contract.mjs",
  "./games/core/match-sync.mjs",
  "./games/core/action-dispatcher.mjs",
  "./games/core/game-module-contract.mjs",
  "./games/core/lobby-service.mjs",
  "./games/core/supabase-adapters.mjs",
  "./games/modules/legacy-board-modules.mjs",
  "./games/modules/dominoes/index.mjs",
  "./games/modules/uno/index.mjs",
  "./games/modules/ludo/index.mjs",
  "./game-people-picker.js",
  "./party.js",
  "./game-chat.js",
  "./uno.js",
  "./ludo.js",
  "./dominoes.js",
  "./favicon.svg",
  "./manifest.webmanifest",
  "./icons/gather-180.png",
  "./icons/gather-192.png",
  "./icons/gather-512.png"
].map(path => new URL(path, APP_BASE).pathname));

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("gather-shell-") && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" && url.pathname.startsWith(APP_BASE.pathname)) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok && response.type === "basic") {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(new URL("./index.html", APP_BASE), response.clone());
        }
        return response;
      } catch (error) {
        const cached = await caches.match(new URL("./index.html", APP_BASE));
        return cached || new Response("Gather is offline. Reconnect to the internet to sign in and load conversations.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }
    })());
    return;
  }

  if (!STATIC_PATHS.has(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: true });
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === "basic") await cache.put(request, response.clone());
      return response;
    } catch (error) {
      return cached || Response.error();
    }
  })());
});
