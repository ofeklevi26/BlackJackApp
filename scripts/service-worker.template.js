/* Generated at export time. Keep this template independent of the app bundle. */
"use strict";

const BUILD_VERSION = __ACEWISE_BUILD_VERSION__;
const PRECACHE_ASSETS = __ACEWISE_PRECACHE_ASSETS__;
const SCOPE = new URL(self.registration.scope);
const CACHE_PREFIX = `acewise-static-v1:${SCOPE.pathname}:`;
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_VERSION}`;
const ASSET_URLS = PRECACHE_ASSETS.map(
  (asset) => new URL(asset.path, SCOPE).href,
);
function canonicalAssetKey(url) {
  try {
    // Expo emits literal @/+ in pnpm asset paths. URL-equivalent encodings must
    // find the same exact file, without ignoring queries or decoding separators.
    const pathname = url.pathname
      .split("/")
      .map((part) => encodeURIComponent(decodeURIComponent(part)))
      .join("/");
    return `${url.origin}${pathname}${url.search}`;
  } catch {
    return null;
  }
}
const ASSETS = new Map(
  ASSET_URLS.map((url) => [canonicalAssetKey(new URL(url)), url]),
);
const INDEX_URL = new URL("index.html", SCOPE).href;

async function installOfflineFiles({ preserveExisting = false } = {}) {
  const cache = await caches.open(CACHE_NAME);
  try {
    // Waiting for all requests also ensures rollback cannot race a pending put.
    const results = await Promise.allSettled(
      ASSET_URLS.map(async (url, index) => {
        // Explicit repair fills missing entries without risking the working
        // shell/assets if another download fails or the device is still offline.
        if (preserveExisting && (await cache.match(url))?.status === 200)
          return;
        const response = await fetch(
          new Request(url, {
            cache: "reload",
            credentials: "same-origin",
            redirect: "error",
          }),
        );
        if (
          !response.ok ||
          response.status !== 200 ||
          response.type === "opaque"
        )
          throw new Error(
            `Cannot save offline file: ${url} (${response.status}).`,
          );
        const digest = await crypto.subtle.digest(
          "SHA-256",
          await response.clone().arrayBuffer(),
        );
        const checksum = Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
        if (checksum !== PRECACHE_ASSETS[index].sha256)
          throw new Error(`Offline file does not match this build: ${url}.`);
        await cache.put(url, response);
      }),
    );
    const failure = results.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
  } catch (error) {
    if (!preserveExisting) await caches.delete(CACHE_NAME);
    throw error;
  }
}

self.addEventListener("install", (event) => {
  // A failed HTTP request or cache write fails installation. No partially saved
  // worker activates, and an existing working version remains in control.
  event.waitUntil(installOfflineFiles());
  // Deliberately no skipWaiting: updated builds wait until old clients close.
});

async function offlineFilesReady() {
  // Checking an evicted cache must not create it or silently start downloads.
  if (!(await caches.keys()).includes(CACHE_NAME)) return false;
  const cache = await caches.open(CACHE_NAME);
  const files = await Promise.all(ASSET_URLS.map((url) => cache.match(url)));
  return files.every((response) => response?.status === 200);
}

self.addEventListener("message", (event) => {
  const type = event.data?.type;
  const port = event.ports?.[0];
  if (
    !port ||
    !["ACEWISE_OFFLINE_STATUS", "ACEWISE_REPAIR_OFFLINE"].includes(type)
  )
    return;
  event.waitUntil(
    (async () => {
      try {
        if (type === "ACEWISE_REPAIR_OFFLINE")
          await installOfflineFiles({ preserveExisting: true });
        port.postMessage({ ready: await offlineFilesReady() });
      } catch (error) {
        port.postMessage({
          ready: false,
          error:
            error instanceof Error
              ? error.message
              : "Offline files could not be checked or repaired.",
        });
      }
    })(),
  );
  // Cache repair never activates a waiting update or changes saved progress.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME,
          )
          .map((name) => caches.delete(name)),
      );
      // First installation can control the page which installed it immediately.
      // On updates the browser runs activation only after old clients are gone.
      await self.clients.claim();
    })(),
  );
});

async function rangeResponse(request, response) {
  const range = request.headers.get("range");
  if (!range) return response;
  const ifRange = request.headers.get("if-range");
  if (
    ifRange &&
    ifRange !== response.headers.get("etag") &&
    ifRange !== response.headers.get("last-modified")
  )
    return response;
  // A single byte range covers Safari's audio probes and normal media playback.
  // Unsupported multi-range or malformed requests may legally receive full 200.
  const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
  if (!match || (!match[1] && !match[2])) return response;
  const bytes = await response.arrayBuffer();
  const length = bytes.byteLength;
  const first = match[1] ? Number(match[1]) : undefined;
  const last = match[2] ? Number(match[2]) : undefined;
  let start = first ?? Math.max(0, length - (last ?? 0));
  let end =
    first === undefined ? length - 1 : Math.min(last ?? length - 1, length - 1);
  const headers = new Headers(response.headers);
  headers.delete("content-encoding");
  headers.set("accept-ranges", "bytes");
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= length ||
    end < start ||
    (first === undefined && last === 0)
  ) {
    headers.set("content-range", `bytes */${length}`);
    headers.set("content-length", "0");
    return new Response(null, { status: 416, headers });
  }
  headers.set("content-range", `bytes ${start}-${end}/${length}`);
  headers.set("content-length", String(end - start + 1));
  return new Response(bytes.slice(start, end + 1), { status: 206, headers });
}

async function cachedAsset(request, assetURL) {
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match(assetURL);
  // If the OS removed cached files, preserve normal online behavior without
  // storing an unverified new response under this build's cache version.
  return response ? rangeResponse(request, response) : fetch(request);
}

async function appShell(request) {
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match(INDEX_URL);
  // Serve the shell belonging to this worker to avoid mixing old JS with a
  // newly deployed page. Queries and deep SPA routes share that same shell.
  return response || fetch(request);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== SCOPE.origin ||
    !url.pathname.startsWith(SCOPE.pathname)
  )
    return;
  const relativePath = url.pathname.slice(SCOPE.pathname.length);
  if (relativePath === "api" || relativePath.startsWith("api/")) return;
  // Exact URLs only: query-modified assets and unknown URLs go to the network.
  const assetURL = ASSETS.get(canonicalAssetKey(url));
  if (assetURL) event.respondWith(cachedAsset(request, assetURL));
  else if (request.mode === "navigate") event.respondWith(appShell(request));
});
