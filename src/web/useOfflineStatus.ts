import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { checkOfflineFiles } from "./offlineWorker";

export function useOfflineStatus() {
  const [status, setStatus] = useState<
    "preparing" | "ready" | "error" | "unsupported" | "development"
  >("preparing");
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    // Development previews must always load fresh code from Metro.
    if (__DEV__) {
      setStatus("development");
      return;
    }
    if (!window.isSecureContext || !("serviceWorker" in navigator)) {
      setStatus("unsupported");
      return;
    }
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let checking = false;
    let repairRequested = attempt > 0;
    const cleanups: (() => void)[] = [];
    setStatus("preparing");
    setUpdateAvailable(false);
    const refresh = () => {
      if (disposed || !registration) return;
      setUpdateAvailable(!!registration.waiting && !!registration.active);
      const worker = registration.active;
      if (worker?.state === "activated" && !checking) {
        checking = true;
        const repair = repairRequested;
        repairRequested = false;
        void checkOfflineFiles(worker, repair).then((ready) => {
          checking = false;
          if (!disposed) setStatus(ready ? "ready" : "error");
        });
      }
    };
    const watchInstalling = () => {
      const worker = registration?.installing;
      if (!worker) return;
      const changed = () => {
        refresh();
        if (
          !disposed &&
          worker.state === "redundant" &&
          !registration?.active
        ) {
          setStatus("error");
        }
      };
      worker.addEventListener("statechange", changed);
      cleanups.push(() => worker.removeEventListener("statechange", changed));
      changed();
    };
    navigator.serviceWorker.addEventListener("controllerchange", refresh);
    const timeout = window.setTimeout(() => {
      if (!disposed && registration?.active?.state !== "activated") {
        setStatus("error");
      }
    }, 45_000);
    navigator.serviceWorker
      .register("/service-worker.js", { scope: "/", updateViaCache: "none" })
      .then((result) => {
        if (disposed) return;
        registration = result;
        registration.addEventListener("updatefound", watchInstalling);
        cleanups.push(() =>
          result.removeEventListener("updatefound", watchInstalling),
        );
        watchInstalling();
        refresh();
      })
      .catch(() => {
        if (!disposed) setStatus("error");
      });
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener("controllerchange", refresh);
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [attempt]);

  return {
    status,
    updateAvailable,
    retry: () => setAttempt((value) => value + 1),
  };
}
