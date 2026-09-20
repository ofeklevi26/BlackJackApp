import React, { useState } from "react";
import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  Switch,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StoreProvider, useStore, exportHistory } from "../src/state/store";
import { colors, Body, Heading, Button, Panel, Chip, shared } from "../src/ui";

function Settings({ close }: { close: () => void }) {
  const { data, update, reset, storageError } = useStore();
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState("");
  const toggle = (key: "assistance" | "haptics" | "reducedMotion" | "sound") =>
    update((d) => ({
      ...d,
      settings: { ...d.settings, [key]: !d.settings[key] },
    }));
  return (
    <View style={styles.overlay}>
      <ScrollView contentContainerStyle={styles.modal}>
        <View style={shared.between}>
          <Heading>Make it your table</Heading>
          <Button label="Close settings" variant="ghost" onPress={close} />
        </View>
        <Body>
          Changes apply to your next session. Your current table keeps its
          original rules.
        </Body>
        <Panel>
          <Heading>Table rules</Heading>
          <Body>
            6 decks · 3:2 blackjack · dealer peek · double after split · up to 4
            hands · one card to split aces
          </Body>
          <View style={shared.between}>
            <Body>Dealer hits soft 17</Body>
            <Switch
              accessibilityLabel="Dealer hits soft 17"
              value={data.settings.rules.hitSoft17}
              onValueChange={(v) =>
                update((d) => ({
                  ...d,
                  settings: {
                    ...d.settings,
                    rules: { ...d.settings.rules, hitSoft17: v },
                  },
                }))
              }
              trackColor={{ true: "#397B62" }}
            />
          </View>
          <View style={shared.between}>
            <Body>Late surrender available</Body>
            <Switch
              accessibilityLabel="Late surrender available"
              value={data.settings.rules.surrender}
              onValueChange={(v) =>
                update((d) => ({
                  ...d,
                  settings: {
                    ...d.settings,
                    rules: { ...d.settings.rules, surrender: v },
                  },
                }))
              }
              trackColor={{ true: "#397B62" }}
            />
          </View>
        </Panel>
        <Panel>
          <Heading>Your learning preferences</Heading>
          <View style={shared.row}>
            {(["coach", "challenge"] as const).map((mode) => (
              <Chip
                key={mode}
                label={
                  mode === "coach"
                    ? "Coach · instant feedback"
                    : "Challenge · review afterward"
                }
                selected={data.settings.feedback === mode}
                onPress={() =>
                  update((d) => ({
                    ...d,
                    settings: { ...d.settings, feedback: mode },
                  }))
                }
              />
            ))}
          </View>
          {(
            [
              ["assistance", "Show hints and hand totals"],
              ["haptics", "Gentle haptic feedback"],
              ["sound", "Card sounds"],
              ["reducedMotion", "Reduce motion"],
            ] as const
          ).map(([key, label]) => (
            <View key={key} style={shared.between}>
              <Body>{label}</Body>
              <Switch
                accessibilityLabel={label}
                value={data.settings[key]}
                onValueChange={() => toggle(key)}
                trackColor={{ true: "#397B62" }}
              />
            </View>
          ))}
        </Panel>
        <Panel>
          <Heading>Saved on this device</Heading>
          <Body>
            Lessons, history, and your active shoe stay here and work offline.
          </Body>
          {storageError && (
            <Body style={{ color: colors.red }}>{storageError}</Body>
          )}
          <Button
            label="Export training history"
            variant="secondary"
            onPress={() => {
              exportHistory(data)
                .then(() => setNotice("History export ready."))
                .catch(() =>
                  setNotice("Export was unavailable. Please try again."),
                );
            }}
          />
          {!!notice && <Body>{notice}</Body>}
          {confirm ? (
            <>
              <Body style={{ color: colors.red }}>
                Reset lessons, history, bookmarks, casino chips, and your active
                session on this device?
              </Body>
              <View style={shared.row}>
                <Button
                  label="Keep my progress"
                  variant="secondary"
                  onPress={() => setConfirm(false)}
                />
                <Button
                  label="Reset all progress"
                  onPress={() => {
                    reset();
                    setConfirm(false);
                    setNotice("Progress reset.");
                  }}
                />
              </View>
            </>
          ) : (
            <Button
              label="Reset progress…"
              variant="ghost"
              onPress={() => setConfirm(true)}
            />
          )}
        </Panel>
        <Body>
          Acewise 1.0 · Practice with virtual units. Skill is measured by
          decisions, not the result of a single hand.
        </Body>
      </ScrollView>
    </View>
  );
}
function Navigation() {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState(false);
  const { data, update } = useStore();
  return (
    <>
      <StatusBar style="light" />
      <Tabs
        screenOptions={{
          sceneStyle: { backgroundColor: colors.bg },
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerTitle: () => (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 9 }}
            >
              <Text style={{ color: colors.green, fontSize: 27 }}>♠</Text>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 22,
                  fontWeight: "600",
                  letterSpacing: -0.7,
                }}
              >
                acewise<Text style={{ color: colors.green }}>.</Text>
              </Text>
            </View>
          ),
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open settings"
              onPress={() => {
                update((d) => ({
                  ...d,
                  active: d.active ? { ...d.active, paused: true } : null,
                  counting: d.counting ? { ...d.counting, paused: true } : null,
                }));
                setSettings(true);
              }}
              style={{ padding: 16, marginRight: 8 }}
            >
              <Ionicons name="options-outline" size={22} color={colors.muted} />
            </Pressable>
          ),
          tabBarStyle: {
            backgroundColor: colors.bg,
            borderTopColor: colors.border,
            height: 64 + Math.max(insets.bottom, 12),
            paddingTop: 10,
            paddingBottom: Math.max(insets.bottom, 12),
          },
          tabBarActiveTintColor: colors.green,
          tabBarInactiveTintColor: colors.muted,
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600", marginTop: 4 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="grid-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="learn"
          options={{
            title: "Learn",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="book-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="practice"
          options={{
            title: "Practice",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="layers-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="progress"
          options={{
            title: "Progress",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="stats-chart-outline" color={color} size={size} />
            ),
          }}
        />
      </Tabs>
      <Modal
        visible={settings}
        transparent
        animationType={data.settings.reducedMotion ? "none" : "fade"}
        onRequestClose={() => setSettings(false)}
      >
        <Settings close={() => setSettings(false)} />
      </Modal>
    </>
  );
}
export default function Layout() {
  return (
    <StoreProvider>
      <Navigation />
    </StoreProvider>
  );
}
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "#02090DF2", alignItems: "center" },
  modal: {
    padding: 24,
    paddingTop: 50,
    paddingBottom: 50,
    width: "100%",
    maxWidth: 700,
    gap: 22,
  },
});
