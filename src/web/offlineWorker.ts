/** Ask the worker to verify its saved files; activation alone is not proof that
 * browser storage has survived eviction since the last visit. */
export function checkOfflineFiles(
  worker: ServiceWorker,
  repair = false,
): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (ready: boolean) => {
      clearTimeout(timeout);
      channel.port1.close();
      channel.port2.close();
      resolve(ready);
    };
    const timeout = setTimeout(() => finish(false), repair ? 45_000 : 12_000);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      const message = event.data;
      finish(
        !!message &&
          typeof message === "object" &&
          "ready" in message &&
          message.ready === true,
      );
    };
    channel.port1.onmessageerror = () => finish(false);
    try {
      worker.postMessage(
        { type: repair ? "ACEWISE_REPAIR_OFFLINE" : "ACEWISE_OFFLINE_STATUS" },
        [channel.port2],
      );
    } catch {
      finish(false);
    }
  });
}
