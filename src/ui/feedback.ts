import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
export function tapFeedback(enabled: boolean, correct: boolean) {
  if (enabled && Platform.OS !== "web")
    void Haptics.notificationAsync(
      correct
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning,
    ).catch(() => {});
}
