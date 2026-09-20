import React, { PropsWithChildren } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ViewStyle,
  TextStyle,
  StyleProp,
  Platform,
} from "react-native";
import { colors } from "./theme";
import type { Card } from "../engine/types";

export function Page({
  children,
  footer,
  compact = false,
}: PropsWithChildren<{ footer?: React.ReactNode; compact?: boolean }>) {
  return (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.bg }}>
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={[
          s.page,
          compact && { padding: 12, paddingBottom: 12 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[s.pageInner, compact && { gap: 12 }]}>{children}</View>
      </ScrollView>
      {footer != null && (
        <View style={s.footerDock}>
          <View style={s.footerInner}>{footer}</View>
        </View>
      )}
    </View>
  );
}
export function Panel({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[s.panel, style]}>{children}</View>;
}
export function Heading({ children }: PropsWithChildren) {
  return (
    <Text accessibilityRole="header" style={s.heading}>
      {children}
    </Text>
  );
}
export function Body({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return <Text style={[s.body, style]}>{children}</Text>;
}
export function Eyebrow({ children }: PropsWithChildren) {
  return <Text style={s.eyebrow}>{children}</Text>;
}
export function Title({ children }: PropsWithChildren) {
  return (
    <Text accessibilityRole="header" style={s.title}>
      {children}
    </Text>
  );
}
export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        variant === "primary"
          ? s.primary
          : variant === "secondary"
            ? s.secondary
            : s.ghost,
        { opacity: disabled ? 0.38 : pressed ? 0.75 : 1 },
        style,
      ]}
    >
      <Text
        style={[
          s.buttonText,
          { color: variant === "primary" ? colors.bg : colors.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityState={{ selected: !!selected }}
      style={[s.chip, selected && s.chipSelected]}
    >
      <Text
        style={{
          color: selected ? colors.green : colors.muted,
          fontSize: 13,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function PlayingCard({
  card,
  hidden,
  small,
}: {
  card?: Card;
  hidden?: boolean;
  small?: boolean;
}) {
  const red = card?.suit === "♥" || card?.suit === "♦";
  return (
    <View
      accessibilityLabel={
        hidden
          ? "Face down card"
          : card
            ? `${card.rank} ${card.suit === "♥" ? "hearts" : card.suit === "♦" ? "diamonds" : card.suit === "♠" ? "spades" : "clubs"}`
            : "Card"
      }
      style={[s.card, small && s.smallCard, hidden && s.cardBack]}
    >
      {hidden ? (
        <>
          <View style={s.cardBackLine} />
          <Text style={{ color: colors.green, fontSize: small ? 27 : 40 }}>
            ♠
          </Text>
          <View style={s.cardBackLine} />
        </>
      ) : (
        <>
          <Text
            style={[
              s.cardRank,
              { color: red ? "#B3444C" : "#153A36", fontSize: small ? 16 : 22 },
            ]}
          >
            {card?.rank}
          </Text>
          <Text
            style={{
              color: red ? "#B3444C" : "#153A36",
              fontSize: small ? 24 : 37,
              textAlign: "center",
            }}
          >
            {card?.suit}
          </Text>
          <Text
            style={[
              s.cardRank,
              {
                color: red ? "#B3444C" : "#153A36",
                alignSelf: "flex-end",
                transform: [{ rotate: "180deg" }],
                fontSize: small ? 16 : 22,
              },
            ]}
          >
            {card?.rank}
          </Text>
        </>
      )}
    </View>
  );
}
export function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <View style={{ flex: 1, minWidth: 110, gap: 5 }}>
      <Text
        style={{
          color: colors.text,
          fontSize: 29,
          fontWeight: "700",
          fontVariant: ["tabular-nums"],
        }}
      >
        {value}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{label}</Text>
      {!!detail && (
        <Text style={{ color: colors.muted, fontSize: 11 }}>{detail}</Text>
      )}
    </View>
  );
}
export const shared = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    borderRadius: 12,
    color: colors.text,
    padding: 14,
    minHeight: 48,
    fontSize: 16,
  },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
});
const s = StyleSheet.create({
  footerDock: {
    padding: 12,
    paddingTop: 10,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: "center",
  },
  footerInner: { width: "100%", maxWidth: 760, gap: 8 },
  page: { padding: 22, paddingBottom: 42, alignItems: "center" },
  pageInner: { width: "100%", maxWidth: 1050, gap: 24 },
  panel: {
    padding: 22,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 16,
  },
  heading: {
    fontSize: 22,
    fontWeight: "600",
    color: colors.text,
    letterSpacing: -0.4,
  },
  body: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  title: {
    fontSize: 36,
    fontWeight: "600",
    color: colors.text,
    letterSpacing: -1.2,
    lineHeight: 43,
  },
  eyebrow: {
    color: colors.green,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
  },
  button: {
    minHeight: 49,
    borderRadius: 12,
    paddingHorizontal: 19,
    paddingVertical: 13,
    justifyContent: "center",
    alignItems: "center",
  },
  primary: { backgroundColor: colors.green },
  secondary: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghost: { backgroundColor: "transparent" },
  buttonText: { fontSize: 14, fontWeight: "700", textAlign: "center" },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { backgroundColor: "#1C3E36", borderColor: "#4A9B7F" },
  card: {
    width: 78,
    minHeight: 113,
    padding: 9,
    borderRadius: 10,
    backgroundColor: colors.ivory,
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 9,
    elevation: 3,
  },
  smallCard: { width: 55, minHeight: 80, padding: 6 },
  cardRank: { fontWeight: "700", lineHeight: 23 },
  cardBack: {
    borderWidth: 2,
    borderColor: "#42665F",
    backgroundColor: "#1C4943",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  cardBackLine: { height: 1, width: "60%", backgroundColor: "#4E7A6E" },
});
