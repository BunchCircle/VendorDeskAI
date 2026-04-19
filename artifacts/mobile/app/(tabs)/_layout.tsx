import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import * as Haptics from "expo-haptics";
import { Tabs, usePathname } from "expo-router";
import { Icon as TabIcon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { Icon } from "@/components/Icon";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";
import { useColors } from "@/hooks/useColors";

const triggerTabHaptic = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

function TabBarIcon({
  name,
  color,
  focused,
}: {
  name: Parameters<typeof Icon>[0]["name"];
  color: string;
  focused: boolean;
}) {
  return (
    <View style={tabIconStyles.wrapper}>
      <Icon name={name} size={22} color={color} strokeWidth={focused ? 2.5 : 2} />
      {focused && (
        <LinearGradient
          colors={["#4F46E5", "#6D28D9"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={tabIconStyles.indicator}
        />
      )}
    </View>
  );
}

const tabIconStyles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    gap: 4,
  },
  indicator: {
    width: 20,
    height: 3,
    borderRadius: 2,
  },
});

function NativeTabLayout() {
  const pathname = usePathname();
  const prevPathname = useRef(pathname);

  useEffect(() => {
    if (prevPathname.current !== pathname) {
      prevPathname.current = pathname;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [pathname]);

  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <TabIcon sf={{ default: "person.2", selected: "person.2.fill" }} />
        <Label>Leads</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="catalogue">
        <TabIcon sf={{ default: "list.bullet.rectangle", selected: "list.bullet.rectangle.fill" }} />
        <Label>Catalogue</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="dashboard">
        <TabIcon sf={{ default: "chart.bar", selected: "chart.bar.fill" }} />
        <Label>Dashboard</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <TabIcon sf={{ default: "person.circle", selected: "person.circle.fill" }} />
        <Label>Profile</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.tabBarBg,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          boxShadow: `0px -3px 12px rgba(79, 70, 229, ${isDark ? 0.2 : 0.05})`,
          height: isWeb ? 84 : 64,
          paddingBottom: isWeb ? 8 : 6,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={isDark ? 80 : 100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.tabBarBg }]} />
          ) : null,
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: "Inter_600SemiBold",
          marginBottom: 2,
          letterSpacing: 0.2,
        },
        tabBarItemStyle: {
          paddingTop: 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Leads",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="users" color={color} focused={focused} />
          ),
        }}
        listeners={{ tabPress: triggerTabHaptic }}
      />
      <Tabs.Screen
        name="catalogue"
        options={{
          title: "Catalogue",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="package" color={color} focused={focused} />
          ),
        }}
        listeners={{ tabPress: triggerTabHaptic }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="bar-chart-2" color={color} focused={focused} />
          ),
        }}
        listeners={{ tabPress: triggerTabHaptic }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="user" color={color} focused={focused} />
          ),
        }}
        listeners={{ tabPress: triggerTabHaptic }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (Platform.OS === "ios" && isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
