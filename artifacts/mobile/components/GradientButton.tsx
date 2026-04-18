import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Icon, IconName } from "@/components/Icon";

interface GradientButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  iconName?: IconName;
  iconRight?: IconName;
  colors?: readonly [string, string, ...string[]];
  style?: ViewStyle;
  size?: "sm" | "md" | "lg";
  variant?: "gradient" | "outline" | "ghost";
  textColor?: string;
  borderColor?: string;
  backgroundColor?: string;
}

export function GradientButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  iconName,
  iconRight,
  colors: gradColors = ["#4F46E5", "#6D28D9"],
  style,
  size = "md",
  variant = "gradient",
  textColor,
  borderColor,
  backgroundColor,
}: GradientButtonProps) {
  const sizeStyles = {
    sm: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12, fontSize: 14, iconSize: 15 },
    md: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: 14, fontSize: 15, iconSize: 16 },
    lg: { paddingVertical: 17, paddingHorizontal: 28, borderRadius: 16, fontSize: 16, iconSize: 18 },
  }[size];

  const isDisabled = disabled || loading;

  const inner = (
    <View style={styles.inner}>
      {loading ? (
        <ActivityIndicator size="small" color={variant === "gradient" ? "#fff" : (textColor || "#4F46E5")} />
      ) : (
        <>
          {iconName && (
            <Icon
              name={iconName}
              size={sizeStyles.iconSize}
              color={variant === "gradient" ? "#fff" : (textColor || "#4F46E5")}
            />
          )}
          <Text
            style={[
              styles.label,
              {
                fontSize: sizeStyles.fontSize,
                color: variant === "gradient" ? "#fff" : (textColor || "#4F46E5"),
              },
            ]}
          >
            {label}
          </Text>
          {iconRight && (
            <Icon
              name={iconRight}
              size={sizeStyles.iconSize}
              color={variant === "gradient" ? "#fff" : (textColor || "#4F46E5")}
            />
          )}
        </>
      )}
    </View>
  );

  if (variant === "gradient") {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={0.85}
        style={[
          styles.gradientWrapper,
          {
            borderRadius: sizeStyles.borderRadius,
            opacity: isDisabled ? 0.6 : 1,
          },
          style,
        ]}
      >
        <LinearGradient
          colors={isDisabled ? ["#94A3B8", "#94A3B8"] : gradColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.gradientInner,
            {
              paddingVertical: sizeStyles.paddingVertical,
              paddingHorizontal: sizeStyles.paddingHorizontal,
              borderRadius: sizeStyles.borderRadius,
            },
          ]}
        >
          {inner}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      style={[
        styles.btn,
        {
          paddingVertical: sizeStyles.paddingVertical,
          paddingHorizontal: sizeStyles.paddingHorizontal,
          borderRadius: sizeStyles.borderRadius,
          backgroundColor: backgroundColor || "transparent",
          borderWidth: variant === "outline" ? 1.5 : 0,
          borderColor: borderColor || "#4F46E5",
          opacity: isDisabled ? 0.6 : 1,
        },
        style,
      ]}
    >
      {inner}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  gradientWrapper: {
    alignSelf: "stretch",
    borderRadius: 14,
    boxShadow: "0px 4px 12px rgba(79, 70, 229, 0.3)",
  },
  gradientInner: {
    overflow: "hidden",
  },
  btn: {
    overflow: "hidden",
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.1,
  },
});
