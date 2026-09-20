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
import { decodeSavedData } from "./persistence";
import { colors } from "../ui/theme";
const KEY = "acewise:v1";
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
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!live || !raw) return;
        setData(decodeSavedData(raw, initialData()));
      })
      .catch(() =>
        setStorageError(
          "Your saved training could not be loaded. Its stored copy has been preserved; new changes cannot be saved until storage is reset.",
        ),
      )
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
    queue.current = queue.current
      .then(() => AsyncStorage.setItem(KEY, serialized))
      .catch(() =>
        setStorageError(
          "Progress could not be saved on this device. Please export your history.",
        ),
      );
  }, [data, ready, storageError]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active")
        setData((p) =>
          p.active ? { ...p, active: { ...p.active, paused: true } } : p,
        );
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
  const content = JSON.stringify(
    { exportedAt: new Date().toISOString(), ...data },
    null,
    2,
  );
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
