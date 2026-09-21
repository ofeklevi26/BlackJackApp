import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import { colors } from "./theme";

const celebratedSessions = new Set<string>();
const sparks = [
  { x: -26, y: -23, color: "blue" },
  { x: 0, y: -34, color: "red" },
  { x: 29, y: -22, color: "blue" },
  { x: 34, y: 8, color: "red" },
  { x: -31, y: 12, color: "red" },
] as const;

/** A quiet, once-per-session accent. Historical reviews and reduced motion stay still. */
export default function SessionCelebration({
  sessionId,
  animate,
  reducedMotion,
  label,
  children,
}: React.PropsWithChildren<{
  sessionId: string;
  animate: boolean;
  reducedMotion: boolean;
  label: string;
}>) {
  const entrance = useRef(new Animated.Value(1)).current;
  const burst = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!animate || reducedMotion || celebratedSessions.has(sessionId)) {
      entrance.setValue(1);
      burst.setValue(1);
      return;
    }
    celebratedSessions.add(sessionId);
    entrance.setValue(0);
    burst.setValue(0);
    const motion = Animated.parallel([
      Animated.timing(entrance, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(burst, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.quad),
        useNativeDriver: Platform.OS !== "web",
      }),
    ]);
    motion.start();
    return () => motion.stop();
  }, [animate, reducedMotion, sessionId, entrance, burst]);

  return (
    <Animated.View
      style={[
        s.panel,
        {
          opacity: entrance.interpolate({
            inputRange: [0, 1],
            outputRange: [0.6, 1],
          }),
          transform: [
            {
              translateY: entrance.interpolate({
                inputRange: [0, 1],
                outputRange: [8, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={s.topline}>
        <View
          style={s.emblem}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          {!reducedMotion &&
            sparks.map((spark, index) => (
              <Animated.View
                key={index}
                pointerEvents="none"
                style={[
                  s.spark,
                  {
                    backgroundColor:
                      spark.color === "blue" ? colors.blue : colors.red,
                    opacity: burst.interpolate({
                      inputRange: [0, 0.15, 0.65, 1],
                      outputRange: [0, 0.8, 0.5, 0],
                    }),
                    transform: [
                      {
                        translateX: burst.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, spark.x],
                        }),
                      },
                      {
                        translateY: burst.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, spark.y],
                        }),
                      },
                      { rotate: `${index * 38}deg` },
                    ],
                  },
                ]}
              />
            ))}
          <Text style={s.suit}>♠</Text>
        </View>
        <Text style={s.label}>{label}</Text>
      </View>
      {children}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  panel: {
    padding: 22,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
    gap: 18,
    overflow: "hidden",
  },
  topline: { flexDirection: "row", alignItems: "center", gap: 11 },
  emblem: {
    width: 42,
    height: 42,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  suit: { color: colors.blue, fontSize: 29 },
  label: {
    flex: 1,
    minWidth: 0,
    color: colors.blue,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    lineHeight: 17,
  },
  spark: { position: "absolute", width: 4, height: 8, borderRadius: 2 },
});
