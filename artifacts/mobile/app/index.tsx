import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";

export default function SplashScreen() {
  const colors = useColors();
  const [slowNetwork, setSlowNetwork] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSlowNetwork(true), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.primary }]}>
      <View style={styles.content}>
        <Image
          source={require("../assets/images/logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={styles.textGroup}>
          <Text style={styles.appName}>VendorDesk.ai</Text>
          <Text style={styles.tagline}>Smart Quotation Maker</Text>
        </View>
      </View>
      <View style={styles.loaderWrap}>
        <ActivityIndicator color="rgba(255,255,255,0.7)" size="large" />
        {slowNetwork && (
          <Text style={styles.slowText}>
            Slow connection — loading from cache…
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: Platform.OS === "web" ? 67 : 0,
  },
  content: {
    alignItems: "center",
    gap: 28,
  },
  logo: {
    width: 120,
    height: 120,
  },
  textGroup: {
    alignItems: "center",
    gap: 6,
  },
  appName: {
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  tagline: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 0.1,
  },
  loaderWrap: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 80 : 64,
    alignItems: "center",
    gap: 12,
  },
  slowText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.65)",
    textAlign: "center",
  },
});
