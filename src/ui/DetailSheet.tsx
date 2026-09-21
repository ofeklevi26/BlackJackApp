import React, { PropsWithChildren } from "react";
import { Modal, View, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Heading } from "./components";
import { colors } from "./theme";

export function DetailSheet({
  visible,
  title,
  onClose,
  children,
  reducedMotion = false,
}: PropsWithChildren<{
  visible: boolean;
  title: string;
  onClose: () => void;
  reducedMotion?: boolean;
}>) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? "none" : "fade"}
      onRequestClose={onClose}
    >
      <View
        style={[
          s.overlay,
          {
            paddingTop: Math.max(insets.top, 20),
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <View accessibilityViewIsModal style={s.sheet}>
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Heading>{title}</Heading>
            </View>
            <Button label="Close" variant="ghost" onPress={onClose} />
          </View>
          <ScrollView
            style={{ minHeight: 0 }}
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: "#060C1CDD",
  },
  sheet: {
    width: "100%",
    maxWidth: 760,
    maxHeight: "94%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    paddingLeft: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  content: { padding: 20, paddingBottom: 28, gap: 18 },
});
