import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  PropsWithChildren,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform, Share, Text, View } from "react-native";
import type { AppData } from "./types";
import {
  createSaveQueue,
  decodeSavedData,
  pauseSavedActivities,
  serializeHistoryExport,
} from "./persistence";
import { colors } from "../ui/theme";
const KEY = "acewise:v1";
// Keep unreadable data available to an explicit history export until the user resets.
let recoveryCopy: { rawSavedData: string; reason: string } | null = null;
export const initialData = (): AppData => ({
  version: 1,
  onboarding: false,
  experience: "New to blackjack",
  goal: "Basic strategy",
  completedLessons: {},
  settings: {
    rules: { hitSoft17: false, surrender: true },
    feedback: "coach",
    assistance: false,
    haptics: true,
    reducedMotion: false,
    sound: false,
  },
  sessions: [],
  bookmarks: [],
  active: null,
  counting: null,
  casino: null,
});
type Context = {
  data: AppData;
  update: (fn: (previous: AppData) => AppData) => void;
  ready: boolean;
  storageError: string | null;
  reset: () => void;
};
const Store = createContext<Context | null>(null);
export function StoreProvider({ children }: PropsWithChildren) {
  const [data, setData] = useState(initialData);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const queue = useRef<ReturnType<typeof createSaveQueue> | null>(null);
  if (!queue.current)
    queue.current = createSaveQueue(
      (serialized) => AsyncStorage.setItem(KEY, serialized),
      () =>
        setStorageError(
          "Progress could not be saved on this device. Please export your history before resetting storage.",
        ),
    );
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!live || !raw) return;
        try {
          const restored = decodeSavedData(raw, initialData());
          recoveryCopy = null;
          setData(restored);
        } catch (error) {
          recoveryCopy = {
            rawSavedData: raw,
            reason:
              error instanceof Error
                ? error.message
                : "The saved data could not be decoded.",
          };
          throw error;
        }
      })
      .catch(() => {
        if (live)
          setStorageError(
            recoveryCopy
              ? "Your saved training could not be loaded. Its stored copy is preserved. Export history to keep a recovery copy before resetting; new changes cannot be saved until then."
              : "Your saved training could not be read. Existing storage has not been overwritten. Try reopening the app; new changes cannot be saved until storage is available or reset.",
          );
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!ready || storageError) return;
    const serialized = JSON.stringify(data);
    void queue.current!.enqueue(serialized);
  }, [data, ready, storageError]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") setData(pauseSavedActivities);
    });
    return () => sub.remove();
  }, []);
  return (
    <Store.Provider
      value={{
        data,
        update: setData,
        ready,
        storageError,
        reset: () => {
          queue.current!.reset();
          recoveryCopy = null;
          setStorageError(null);
          setData({ ...initialData(), onboarding: true });
        },
      }}
    >
      {ready ? (
        children
      ) : (
        <View
          style={{
            flex: 1,
            backgroundColor: colors.bg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: colors.green, fontSize: 24 }}>♠ Acewise</Text>
        </View>
      )}
    </Store.Provider>
  );
}
export function useStore() {
  const store = useContext(Store);
  if (!store) throw new Error("Store provider missing");
  return store;
}
export async function exportHistory(data: AppData) {
  const content = serializeHistoryExport(data, recoveryCopy);
  if (Platform.OS === "web") {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `acewise-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else
    await Share.share({ title: "Acewise training history", message: content });
}
