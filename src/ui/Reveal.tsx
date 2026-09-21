import React, { PropsWithChildren, useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleProp, ViewStyle } from "react-native";

/** A short arrival cue, never a repeating attention animation. */
export function Reveal({
  children,
  reducedMotion,
  resetKey,
  style,
}: PropsWithChildren<{
  reducedMotion: boolean;
  resetKey?: string;
  style?: StyleProp<ViewStyle>;
}>) {
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    progress.stopAnimation();
    if (reducedMotion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => {
      animation.stop();
      progress.setValue(1);
    };
  }, [progress, reducedMotion, resetKey]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0.55, 1],
          }),
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [8, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
