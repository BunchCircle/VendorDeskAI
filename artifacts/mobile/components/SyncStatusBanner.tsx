import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text } from "react-native";

interface SyncStatusBannerProps {
  isOffline: boolean;
  isSyncing: boolean;
  topInset?: number;
}

export function SyncStatusBanner({ isOffline, isSyncing, topInset = 0 }: SyncStatusBannerProps) {
  const translateY = useRef(new Animated.Value(-60)).current;
  const visible = isOffline || isSyncing;

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: visible ? 0 : -60,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  const label = isOffline ? "No internet — changes saved locally" : "Syncing…";
  const backgroundColor = isOffline ? "#E53E3E" : "#3182CE";

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor, paddingTop: topInset + 6, transform: [{ translateY }] },
      ]}
      accessibilityLiveRegion="polite"
      accessibilityLabel={visible ? label : undefined}
    >
      <Text style={styles.text}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingBottom: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.2,
  },
});
