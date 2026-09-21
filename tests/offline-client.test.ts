import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { checkOfflineFiles } from "../src/web/offlineWorker";

class FakePort {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  closed = false;
  close() {
    this.closed = true;
  }
  receive(data: unknown) {
    if (!this.closed) this.onmessage?.({ data });
  }
  messageError() {
    if (!this.closed) this.onmessageerror?.();
  }
}

function environment(t: TestContext) {
  const channels: { port1: FakePort; port2: FakePort }[] = [];
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let timerId = 0;
  const replacements = {
    MessageChannel: class {
      port1 = new FakePort();
      port2 = new FakePort();
      constructor() {
        channels.push(this);
      }
    },
    setTimeout: (callback: () => void, delay: number) => {
      const id = ++timerId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id: number) => {
      timers.delete(id);
    },
  };
  for (const [name, value] of Object.entries(replacements)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  const requests: { message: unknown; ports: Transferable[] }[] = [];
  const worker = {
    postMessage(message: unknown, ports: Transferable[]) {
      requests.push({ message, ports });
    },
  } as unknown as ServiceWorker;
  function cleanedUp() {
    assert.equal(timers.size, 0, "response or failure cancels its deadline");
    for (const channel of channels) {
      assert.equal(channel.port1.closed, true, "reply port closes");
      assert.equal(
        channel.port2.closed,
        true,
        "transferred port reference closes",
      );
    }
  }
  return { channels, timers, requests, worker, cleanedUp };
}

test("offline status transfers a dedicated reply port and accepts only explicit ready=true", async (t) => {
  const harness = environment(t);
  const pending = checkOfflineFiles(harness.worker);
  assert.deepEqual(harness.requests[0].message, {
    type: "ACEWISE_OFFLINE_STATUS",
  });
  assert.equal(harness.requests[0].ports.length, 1);
  assert.equal(harness.requests[0].ports[0], harness.channels[0].port2);
  assert.equal([...harness.timers.values()][0].delay, 12_000);
  harness.channels[0].port1.receive({ ready: true, version: "saved-build" });
  assert.equal(await pending, true);
  harness.cleanedUp();
});

test("explicit repair uses its own request type and longer bounded deadline", async (t) => {
  const harness = environment(t);
  const pending = checkOfflineFiles(harness.worker, true);
  assert.deepEqual(harness.requests[0].message, {
    type: "ACEWISE_REPAIR_OFFLINE",
  });
  assert.equal([...harness.timers.values()][0].delay, 45_000);
  harness.channels[0].port1.receive({ ready: true });
  assert.equal(await pending, true);
  harness.cleanedUp();
});

test("missing files and malformed protocol replies never report offline readiness", async (t) => {
  const harness = environment(t);
  for (const reply of [
    { ready: false },
    { ready: false, error: "Cache was evicted" },
    { ready: "true" },
    { ready: 1 },
    {},
    null,
    undefined,
    true,
    "ready",
    [{ ready: true }],
  ]) {
    const pending = checkOfflineFiles(harness.worker);
    harness.channels.at(-1)!.port1.receive(reply);
    assert.equal(await pending, false);
    harness.cleanedUp();
  }
});

test("a worker postMessage failure resolves false and releases the channel and timer", async (t) => {
  const harness = environment(t);
  const worker = {
    postMessage() {
      throw new Error("Worker became redundant");
    },
  } as unknown as ServiceWorker;
  assert.equal(await checkOfflineFiles(worker), false);
  harness.cleanedUp();
});

test("an unreadable reply resolves false without waiting for the deadline", async (t) => {
  const harness = environment(t);
  const pending = checkOfflineFiles(harness.worker);
  harness.channels[0].port1.messageError();
  assert.equal(await pending, false);
  harness.cleanedUp();
});

test("unresponsive status and repair requests time out, close ports, and ignore late replies", async (t) => {
  const harness = environment(t);
  for (const repair of [false, true]) {
    const pending = checkOfflineFiles(harness.worker, repair);
    const channel = harness.channels.at(-1)!;
    [...harness.timers.values()][0].callback();
    assert.equal(await pending, false);
    harness.cleanedUp();
    channel.port1.receive({ ready: true });
    assert.equal(
      await pending,
      false,
      "late readiness does not revive a timed-out request",
    );
  }
});

test("concurrent health requests keep responses and cleanup isolated", async (t) => {
  const harness = environment(t);
  const first = checkOfflineFiles(harness.worker);
  const second = checkOfflineFiles(harness.worker, true);
  assert.equal(harness.channels.length, 2);
  assert.equal(harness.timers.size, 2);
  harness.channels[1].port1.receive({ ready: true });
  assert.equal(await second, true);
  assert.equal(harness.channels[0].port1.closed, false);
  assert.equal(harness.timers.size, 1);
  harness.channels[0].port1.receive({ ready: false });
  assert.equal(await first, false);
  harness.cleanedUp();
});
