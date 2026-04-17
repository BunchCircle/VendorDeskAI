import React from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Icon, IconName } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";

interface AppHeaderProps {
  showBack?: boolean;
  onBack?: () => void;
  /** Screen-level title shown as a secondary line below the brand on stack screens */
  title?: string;
  /** Optional tappable subtitle (e.g. phone number for tap-to-call) */
  subtitle?: string;
  onSubtitlePress?: () => void;
  rightElement?: React.ReactNode;
  compact?: boolean;
}

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <LinearGradient
      colors={["#4F46E5", "#6D28D9"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.logoMark, { width: size, height: size, borderRadius: size * 0.28 }]}
    >
      <Text style={[styles.logoMarkText, { fontSize: size * 0.38 }]}>VD</Text>
    </LinearGradient>
  );
}

export function BrandWordmark({ size = "full" }: { size?: "full" | "compact" }) {
  const colors = useColors();
  const isCompact = size === "compact";
  return (
    <View style={styles.wordmark}>
      <Text style={[styles.wordmarkText, isCompact && styles.wordmarkTextCompact, { color: colors.foreground }]}>
        VendorDesk
      </Text>
      <LinearGradient
        colors={["#4F46E5", "#0891B2"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.aiPill, isCompact && styles.aiPillCompact]}
      >
        <Text style={[styles.aiText, isCompact && styles.aiTextCompact]}>.AI</Text>
      </LinearGradient>
    </View>
  );
}

/**
 * AppHeader — brand lockup (logo + wordmark) is always visible on every screen.
 *
 * Tab screens  : [Logo 32] [Wordmark]     ← left aligned          [rightElement]
 * Stack screens: [Back btn] [Logo 24] [Wordmark compact] [spacer] [rightElement]
 *                [title / subtitle] ← shown below brand row when provided
 */
export function AppHeader({
  showBack = false,
  onBack,
  title,
  subtitle,
  onSubtitlePress,
  rightElement,
  compact = false,
}: AppHeaderProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const paddingTop = insets.top + (Platform.OS === "web" ? 67 : compact ? 8 : 10);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderBottomColor: colors.border,
          paddingTop,
        },
      ]}
    >
      {/* ── Brand row ──────────────────────────────────────────────────────── */}
      <View style={styles.brandRow}>
        {showBack && (
          <TouchableOpacity
            onPress={onBack}
            activeOpacity={0.7}
            style={[styles.backBtn, { backgroundColor: colors.muted }]}
          >
            <Icon name="arrow-left" size={20} color={colors.foreground} />
          </TouchableOpacity>
        )}

        <View style={[styles.lockup, showBack && styles.lockupBack]}>
          <LogoMark size={showBack ? 24 : 32} />
          <BrandWordmark size={showBack ? "compact" : "full"} />
        </View>

        <View style={{ flex: 1 }} />

        {rightElement && (
          <View style={styles.rightSlot}>{rightElement}</View>
        )}
      </View>

      {/* ── Screen title row (stack screens only) ──────────────────────────── */}
      {(title || subtitle) && (
        <View style={styles.titleRow}>
          {title && (
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
              {title}
            </Text>
          )}
          {subtitle && (
            onSubtitlePress ? (
              <TouchableOpacity onPress={onSubtitlePress} activeOpacity={0.7}>
                <Text
                  style={[styles.subtitle, styles.subtitleLink, { color: colors.primary }]}
                  numberOfLines={1}
                >
                  {subtitle}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
                {subtitle}
              </Text>
            )
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 40,
    gap: 8,
  },
  lockup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  lockupBack: {
    gap: 6,
  },
  logoMark: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  logoMarkText: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  wordmark: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  wordmarkText: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  wordmarkTextCompact: {
    fontSize: 14,
  },
  aiPill: {
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  aiPillCompact: {
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  aiText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  aiTextCompact: {
    fontSize: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rightSlot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 4,
  },
  titleRow: {
    paddingTop: 4,
    gap: 1,
  },
  title: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  subtitleLink: {
    fontFamily: "Inter_600SemiBold",
    textDecorationLine: "underline",
  },
});
