import React from "react";
import { Platform, View } from "react-native";
import { Body, Button, Heading, Panel, colors } from "../ui";
import { useOfflineStatus } from "./useOfflineStatus";

export function OfflinePanel({
  offline,
}: {
  offline: ReturnType<typeof useOfflineStatus>;
}) {
  if (Platform.OS !== "web") return null;
  const messages = {
    preparing:
      "Preparing for offline use… Keep Acewise open and connected while it downloads.",
    ready: "Ready to use offline",
    error:
      "Offline setup did not finish. Connect to the internet and try again.",
    unsupported:
      "Offline installation needs Safari or another browser with offline storage, over a secure connection.",
    development:
      "This is a development preview. Use the published Acewise link to install the offline app.",
  };
  return (
    <Panel>
      <Heading>Acewise on your iPhone</Heading>
      <View accessibilityLiveRegion="polite">
        <Body
          style={
            offline.status === "ready" ? { color: colors.green } : undefined
          }
        >
          {messages[offline.status]}
        </Body>
      </View>
      {offline.status === "error" && (
        <Button
          label="Retry offline setup"
          variant="secondary"
          onPress={offline.retry}
        />
      )}
      <Body>
        In Safari, tap Share → Add to Home Screen → Add. Open the Acewise icon
        once while online, then check here for “Ready to use offline.” Your PC
        can stay off afterward.
      </Body>
      {offline.updateAvailable && (
        <Body>
          A new version is downloaded. Close all Acewise windows and reopen the
          app to use it. Your saved progress stays here.
        </Body>
      )}
      <Body>
        Lessons, practice, and casino play are saved on this device. Expo Go has
        separate progress. Clearing website data removes this app’s saved
        progress and offline download.
      </Body>
    </Panel>
  );
}
