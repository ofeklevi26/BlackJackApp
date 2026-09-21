import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { webcrypto } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";

const scope = "https://acewise.example/";
const fixture: Record<string, string | Uint8Array> = {
  "index.html": "<!doctype html><title>Acewise</title><div id='root'></div>",
  "_expo/static/js/web/app-abc.js": "globalThis.acewiseLoaded = true;",
  "_expo/static/css/styles.css": "body{background:#102b25}",
  "assets/card.wav": new Uint8Array([82, 73, 70, 70, 4, 5, 6, 7, 8, 9]),
  "assets/icon.png": new Uint8Array([137, 80, 78, 71, 0]),
  "assets/Ionicons.ttf": "font-bytes",
  "assets/node_modules/.pnpm/@expo+vector-icons@15.0.2/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.hash.ttf":
    "exported-package-font",
  "assets/node_modules/.pnpm/expo-router@57.0.22/node_modules/expo-router/assets/arrow.png":
    "exported-package-image",
  "manifest.webmanifest": '{"name":"Acewise","display":"standalone"}',
  "icons/home screen.png": "home-icon",
};

async function temporaryExport(t: TestContext) {
  const root = path.resolve(os.tmpdir());
  const directory = await mkdtemp(path.join(root, "acewise-worker-test-"));
  t.after(async () => {
    // Only remove the exact temporary child this test created.
    assert.equal(path.dirname(path.resolve(directory)), root);
    assert.ok(path.basename(directory).startsWith("acewise-worker-test-"));
    await rm(directory, { recursive: true, force: true });
  });
  for (const [name, contents] of Object.entries(fixture)) {
    const file = path.join(directory, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, contents);
  }
  return directory;
}

async function generate(directory: string) {
  execFileSync(
    process.execPath,
    [path.resolve("scripts/generate-service-worker.mjs"), directory],
    { encoding: "utf8" },
  );
  return readFile(path.join(directory, "service-worker.js"), "utf8");
}

type StoredCache = Map<string, Response>;
class MemoryCaches {
  stores = new Map<string, StoredCache>();
  failPutFor: string | null = null;
  async open(name: string) {
    const store = this.stores.get(name) ?? new Map<string, Response>();
    this.stores.set(name, store);
    return {
      match: async (key: string) => store.get(key)?.clone(),
      put: async (key: string, response: Response) => {
        if (key === this.failPutFor) throw new Error("Storage quota exhausted");
        store.set(key, response.clone());
      },
    };
  }
  async keys() {
    return [...this.stores.keys()];
  }
  async delete(name: string) {
    return this.stores.delete(name);
  }
}

type WorkerEvent = {
  request?: Request;
  data?: { type: string };
  ports?: {
    postMessage: (reply: { ready: boolean; error?: string }) => void;
  }[];
  waitUntil?: (promise: Promise<unknown>) => void;
  respondWith?: (promise: Promise<Response>) => void;
};

class WorkerHarness {
  caches: MemoryCaches;
  online = true;
  state = "parsed";
  claims = 0;
  skippedWaiting = 0;
  networkRequests: Request[] = [];
  failures = new Map<string, { status: number; body?: string }>();
  events = new Map<string, (event: WorkerEvent) => void>();
  origin: string;
  files: Record<string, string | Uint8Array>;

  constructor(
    source: string,
    options: {
      caches?: MemoryCaches;
      scope?: string;
      files?: Record<string, string | Uint8Array>;
    } = {},
  ) {
    this.caches = options.caches ?? new MemoryCaches();
    this.origin = options.scope ?? scope;
    this.files = options.files ?? fixture;
    const self = {
      registration: { scope: this.origin },
      clients: {
        claim: async () => {
          this.claims++;
        },
      },
      skipWaiting: async () => {
        this.skippedWaiting++;
      },
      addEventListener: (type: string, handler: (event: WorkerEvent) => void) =>
        this.events.set(type, handler),
    };
    const context = vm.createContext({
      self,
      caches: this.caches,
      crypto: webcrypto,
      URL,
      Request,
      Response,
      Headers,
      fetch: async (request: Request) => {
        this.networkRequests.push(request);
        if (!this.online) throw new TypeError("Network offline");
        const relativePath = decodeURIComponent(
          request.url.slice(this.origin.length),
        );
        // EAS serves a SPA HTML fallback for encoded @/+ package paths even
        // though the corresponding literal Expo asset path serves the file.
        if (
          relativePath.startsWith("assets/node_modules/.pnpm/") &&
          /%40|%2b/i.test(request.url)
        )
          return new Response(fixture["index.html"] as string, {
            status: 200,
            headers: { "content-type": "text/html" },
          });
        const failure = this.failures.get(relativePath);
        if (failure)
          return new Response(failure.body ?? "Unavailable", {
            status: failure.status,
          });
        const value = this.files[relativePath];
        return new Response(value as BodyInit | undefined, {
          status: value === undefined ? 404 : 200,
          headers: {
            "content-type": relativePath.endsWith(".wav")
              ? "audio/wav"
              : "application/octet-stream",
            etag: '"test-asset"',
          },
        });
      },
    });
    vm.runInContext(source, context, { filename: "service-worker.js" });
  }

  async lifecycle(type: "install" | "activate") {
    const pending: Promise<unknown>[] = [];
    this.state = type === "install" ? "installing" : "activating";
    this.events.get(type)!({ waitUntil: (promise) => pending.push(promise) });
    try {
      await Promise.all(pending);
      this.state = type === "install" ? "installed" : "activated";
    } catch (error) {
      this.state = "redundant";
      throw error;
    }
  }

  async request(
    url: string,
    options: {
      navigate?: boolean;
      method?: string;
      headers?: Record<string, string>;
    } = {},
  ) {
    const request = new Request(new URL(url, this.origin), {
      method: options.method ?? "GET",
      headers: options.headers,
    });
    if (options.navigate)
      Object.defineProperty(request, "mode", { value: "navigate" });
    let response: Promise<Response> | undefined;
    this.events.get("fetch")!({
      request,
      respondWith: (promise) => {
        response = promise;
      },
    });
    return response ? await response : null;
  }

  async message(type: string) {
    const pending: Promise<unknown>[] = [];
    let reply: { ready: boolean; error?: string } | undefined;
    this.events.get("message")!({
      data: { type },
      ports: [
        {
          postMessage: (value) => {
            reply = value;
          },
        },
      ],
      waitUntil: (promise) => pending.push(promise),
    });
    await Promise.all(pending);
    return reply;
  }
}

test("offline status checks all cached keys without downloading and detects partial or complete eviction", async (t) => {
  const directory = await temporaryExport(t);
  const worker = new WorkerHarness(await generate(directory));
  assert.equal((await worker.message("ACEWISE_OFFLINE_STATUS"))!.ready, false);
  assert.equal(worker.networkRequests.length, 0);
  assert.equal(
    worker.caches.stores.size,
    0,
    "a status probe does not create a missing cache",
  );
  await worker.lifecycle("install");
  await worker.lifecycle("activate");
  worker.online = false;
  const downloads = worker.networkRequests.length;
  assert.equal((await worker.message("ACEWISE_OFFLINE_STATUS"))!.ready, true);
  const name = (await worker.caches.keys())[0];
  const cache = worker.caches.stores.get(name)!;
  cache.delete(`${scope}assets/card.wav`);
  assert.equal((await worker.message("ACEWISE_OFFLINE_STATUS"))!.ready, false);
  assert.equal(worker.networkRequests.length, downloads);
  assert.equal(
    worker.state,
    "activated",
    "activation alone cannot promise a cache still exists",
  );
  await worker.caches.delete(name);
  assert.equal((await worker.message("ACEWISE_OFFLINE_STATUS"))!.ready, false);
  assert.equal(worker.caches.stores.size, 0);
  assert.equal(worker.networkRequests.length, downloads);
  assert.equal(await worker.message("SKIP_WAITING"), undefined);
  assert.equal(worker.skippedWaiting, 0);
});

test("explicit repair preserves good entries on failure, verifies missing downloads and can recover an evicted cache", async (t) => {
  const directory = await temporaryExport(t);
  const worker = new WorkerHarness(await generate(directory));
  await worker.lifecycle("install");
  await worker.lifecycle("activate");
  const name = (await worker.caches.keys())[0];
  const cache = worker.caches.stores.get(name)!;
  cache.delete(`${scope}assets/card.wav`);
  cache.delete(`${scope}assets/Ionicons.ttf`);
  const originalIndex = cache.get(`${scope}index.html`);
  worker.failures.set("assets/card.wav", {
    status: 200,
    body: "incorrect build",
  });
  const beforeRepair = worker.networkRequests.length;
  const failed = await worker.message("ACEWISE_REPAIR_OFFLINE");
  assert.equal(failed!.ready, false);
  assert.ok(failed!.error);
  assert.equal(worker.networkRequests.length - beforeRepair, 2);
  assert.equal(
    cache.get(`${scope}index.html`),
    originalIndex,
    "working entries are never replaced during repair",
  );
  assert.ok(
    cache.has(`${scope}assets/Ionicons.ttf`),
    "successful partial repairs remain saved",
  );
  assert.ok(
    !cache.has(`${scope}assets/card.wav`),
    "unverified contents never enter the cache",
  );
  worker.online = false;
  assert.equal(
    await (await worker.request("/practice", { navigate: true }))!.text(),
    fixture["index.html"],
  );
  assert.equal((await worker.message("ACEWISE_REPAIR_OFFLINE"))!.ready, false);
  assert.equal(cache.get(`${scope}index.html`), originalIndex);
  worker.online = true;
  worker.failures.clear();
  const beforeRetry = worker.networkRequests.length;
  assert.equal((await worker.message("ACEWISE_REPAIR_OFFLINE"))!.ready, true);
  assert.equal(
    worker.networkRequests.length - beforeRetry,
    1,
    "retry only downloads the remaining missing file",
  );
  worker.online = false;
  assert.equal((await worker.message("ACEWISE_OFFLINE_STATUS"))!.ready, true);
  assert.equal((await worker.request("assets/card.wav"))!.status, 200);
  await worker.caches.delete(name);
  worker.online = true;
  assert.equal((await worker.message("ACEWISE_REPAIR_OFFLINE"))!.ready, true);
  worker.online = false;
  assert.equal(
    await (await worker.request("/learn", { navigate: true }))!.text(),
    fixture["index.html"],
  );
  assert.equal(worker.skippedWaiting, 0);
});

test("generated worker precaches all web assets and serves the SPA and assets fully offline", async (t) => {
  const directory = await temporaryExport(t);
  const source = await generate(directory);
  assert.match(
    source,
    /"path": "assets\/node_modules\/\.pnpm\/@expo\+vector-icons@15\.0\.2/,
  );
  assert.match(source, /"path": "icons\/home%20screen\.png"/);
  const worker = new WorkerHarness(source);
  await worker.lifecycle("install");
  assert.equal(worker.state, "installed");
  assert.equal(worker.claims, 0);
  assert.equal(worker.skippedWaiting, 0);
  assert.equal(worker.networkRequests.length, Object.keys(fixture).length);
  assert.ok(
    worker.networkRequests.every(
      (request) => request.cache === "reload" && request.redirect === "error",
    ),
  );
  await worker.lifecycle("activate");
  assert.equal(worker.state, "activated");
  assert.equal(worker.claims, 1);
  worker.online = false;
  const requestsAfterInstall = worker.networkRequests.length;
  for (const route of [
    "/",
    "/practice?topic=casino",
    "/learn",
    "/progress?review=1",
  ])
    assert.equal(
      await (await worker.request(route, { navigate: true }))!.text(),
      fixture["index.html"],
    );
  for (const [name, expected] of Object.entries(fixture)) {
    const response = await worker.request(
      name.split("/").map(encodeURIComponent).join("/"),
    );
    assert.equal(response!.status, 200);
    assert.deepEqual(
      new Uint8Array(await response!.arrayBuffer()),
      typeof expected === "string"
        ? new TextEncoder().encode(expected)
        : expected,
    );
    if (name.includes(".pnpm")) {
      const literalExpoURL = await worker.request(name);
      assert.equal(literalExpoURL!.status, 200);
      assert.equal(
        await literalExpoURL!.text(),
        expected,
        "literal @/+ paths emitted by Expo match their percent-encoded precache URLs",
      );
    }
  }
  assert.equal(
    worker.networkRequests.length,
    requestsAfterInstall,
    "offline requests do not depend on the server",
  );
});

test("API, external, modified-query assets and non-GET requests are neither cached nor intercepted", async (t) => {
  const directory = await temporaryExport(t);
  await mkdir(path.join(directory, "api"));
  await writeFile(
    path.join(directory, "api", "state.json"),
    "private response",
  );
  const worker = new WorkerHarness(await generate(directory));
  await worker.lifecycle("install");
  worker.online = false;
  for (const [url, options] of [
    ["https://other.example/assets/card.wav", {}],
    ["/api", { navigate: true }],
    ["/api/state.json", {}],
    ["/api/unknown?query=1", { navigate: true }],
    ["/assets/card.wav?v=unrecognized", {}],
    ["/assets/card.wav", { method: "POST" }],
    ["/unlisted-file.json", {}],
  ] as const)
    assert.equal(await worker.request(url, options), null);
  const cachedKeys = [...worker.caches.stores.values()].flatMap((store) => [
    ...store.keys(),
  ]);
  assert.ok(
    cachedKeys.every((url) => url.startsWith(scope) && !url.includes("/api/")),
  );
});

test("HTTP, content-integrity and cache-write failures reject install and remove partial new caches", async (t) => {
  const directory = await temporaryExport(t);
  const source = await generate(directory);
  for (const failure of [
    "http",
    "wrong-content",
    "quota",
    "offline",
  ] as const) {
    const caches = new MemoryCaches();
    const oldCache = await caches.open("acewise-static-v1:/:previous-build");
    await oldCache.put(
      `${scope}index.html`,
      new Response("previous working app"),
    );
    const worker = new WorkerHarness(source, { caches });
    if (failure === "http")
      worker.failures.set("assets/card.wav", { status: 503 });
    if (failure === "wrong-content")
      worker.failures.set("assets/card.wav", {
        status: 200,
        body: "wrong build or SPA fallback HTML",
      });
    if (failure === "quota") caches.failPutFor = `${scope}assets/card.wav`;
    if (failure === "offline") worker.online = false;
    await assert.rejects(worker.lifecycle("install"));
    assert.equal(worker.state, "redundant");
    assert.equal(worker.claims, 0);
    assert.equal(worker.skippedWaiting, 0);
    assert.deepEqual(await caches.keys(), [
      "acewise-static-v1:/:previous-build",
    ]);
    assert.equal(
      await (await oldCache.match(`${scope}index.html`))!.text(),
      "previous working app",
    );
  }
});

test("content changes produce a waiting update while activation removes only old same-scope Acewise caches", async (t) => {
  const directory = await temporaryExport(t);
  const firstSource = await generate(directory);
  assert.equal(
    await generate(directory),
    firstSource,
    "generated file and filesystem timestamps do not change the content version",
  );
  const caches = new MemoryCaches();
  const original = new WorkerHarness(firstSource, { caches });
  await original.lifecycle("install");
  await original.lifecycle("activate");
  const oldName = (await caches.keys())[0];
  await (
    await caches.open("unrelated-static-cache")
  ).put("https://other.example/file", new Response("unrelated"));
  await caches.open("acewise-static-v1:/another-app/:another-version");
  const newHTML = "<!doctype html><title>Acewise updated</title>";
  await writeFile(path.join(directory, "index.html"), newHTML);
  const updatedSource = await generate(directory);
  assert.notEqual(updatedSource, firstSource);
  const update = new WorkerHarness(updatedSource, {
    caches,
    files: { ...fixture, "index.html": newHTML },
  });
  await update.lifecycle("install");
  assert.equal(update.state, "installed");
  assert.equal(
    update.skippedWaiting,
    0,
    "the worker never asks to replace an open app",
  );
  assert.equal(update.claims, 0);
  assert.ok((await caches.keys()).includes(oldName));
  original.online = false;
  assert.equal(
    await (await original.request("/practice", { navigate: true }))!.text(),
    fixture["index.html"],
    "the open app keeps its original coherent build",
  );
  // The browser dispatches activate only after every old controlled window closes.
  await update.lifecycle("activate");
  const names = await caches.keys();
  assert.ok(!names.includes(oldName));
  assert.ok(names.includes("unrelated-static-cache"));
  assert.ok(names.includes("acewise-static-v1:/another-app/:another-version"));
  update.online = false;
  assert.equal(
    await (await update.request("/practice?topic=casino", {
      navigate: true,
    }))!.text(),
    newHTML,
  );
  assert.equal(update.claims, 1);
});

test("cached audio supports Safari byte-range probes, open ranges, suffixes and unsatisfiable ranges offline", async (t) => {
  const directory = await temporaryExport(t);
  const worker = new WorkerHarness(await generate(directory));
  await worker.lifecycle("install");
  worker.online = false;
  for (const [range, expected, contentRange] of [
    ["bytes=0-1", [82, 73], "bytes 0-1/10"],
    ["bytes=7-", [7, 8, 9], "bytes 7-9/10"],
    ["bytes=-3", [7, 8, 9], "bytes 7-9/10"],
    ["bytes=8-100", [8, 9], "bytes 8-9/10"],
  ] as const) {
    const response = await worker.request("assets/card.wav", {
      headers: { range },
    });
    assert.equal(response!.status, 206);
    assert.equal(response!.headers.get("content-range"), contentRange);
    assert.equal(
      response!.headers.get("content-length"),
      String(expected.length),
    );
    assert.equal(response!.headers.get("content-type"), "audio/wav");
    assert.deepEqual(
      [...new Uint8Array(await response!.arrayBuffer())],
      expected,
    );
  }
  for (const range of ["bytes=10-", "bytes=3-1", "bytes=-0"])
    assert.equal(
      (await worker.request("assets/card.wav", { headers: { range } }))!.status,
      416,
    );
  assert.equal(
    (await worker.request("assets/card.wav", {
      headers: { range: "bytes=0-1,3-4" },
    }))!.status,
    200,
  );
  assert.equal(
    (await worker.request("assets/card.wav", {
      headers: { range: "bytes=0-1", "if-range": '"another-asset"' },
    }))!.status,
    200,
  );
});

test("generation excludes native outputs and source maps, hashes every public file, and refuses missing HTML", async (t) => {
  const directory = await temporaryExport(t);
  for (const name of [
    "_expo/static/js/ios/native.js",
    "_expo/static/js/android/native.js",
    "ios/main.js",
    "android/main.js",
    "app.js.map",
    ".env",
    "_redirects",
    "_headers",
  ]) {
    await mkdir(path.dirname(path.join(directory, name)), { recursive: true });
    await writeFile(path.join(directory, name), "not a web precache asset");
  }
  const initial = await generate(directory);
  const worker = new WorkerHarness(initial);
  await worker.lifecycle("install");
  assert.equal(worker.networkRequests.length, Object.keys(fixture).length);
  await writeFile(path.join(directory, "app.js.map"), "changed sourcemap");
  assert.equal(await generate(directory), initial);
  await writeFile(
    path.join(directory, "assets/card.wav"),
    new Uint8Array([1, 2, 3]),
  );
  assert.notEqual(
    await generate(directory),
    initial,
    "a same-named audio change invalidates the cache version",
  );
  await rm(path.join(directory, "index.html"));
  assert.throws(() =>
    execFileSync(
      process.execPath,
      [path.resolve("scripts/generate-service-worker.mjs"), directory],
      { stdio: "pipe" },
    ),
  );
});

test("a worker scoped beneath a path serves its SPA without intercepting the rest of the origin", async (t) => {
  const directory = await temporaryExport(t);
  const worker = new WorkerHarness(await generate(directory), {
    scope: `${scope}app/`,
  });
  await worker.lifecycle("install");
  await worker.lifecycle("activate");
  worker.online = false;
  assert.equal(
    await (await worker.request("/app/practice?topic=casino", {
      navigate: true,
    }))!.text(),
    fixture["index.html"],
  );
  assert.equal(await worker.request("/elsewhere", { navigate: true }), null);
  assert.equal(
    await worker.request("/app/api/profile", { navigate: true }),
    null,
  );
});
