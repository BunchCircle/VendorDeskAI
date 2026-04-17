import { useFonts } from "expo-font";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SyncStatusBanner } from "@/components/SyncStatusBanner";
import { AppProvider, useApp } from "@/context/AppContext";

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient();

function AuthGate() {
  const { session, isLoading, onboarded } = useApp();
  const router = useRouter();
  const segments = useSegments();
  const [forceProceed, setForceProceed] = useState(false);

  // Hard safety net: if isLoading never resolves (network/Supabase hang on
  // Android or any device), force navigation after 6 seconds so the splash
  // screen never stays stuck indefinitely.
  useEffect(() => {
    const t = setTimeout(() => setForceProceed(true), 6000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (isLoading && !forceProceed) return;

    const inAuthGroup = segments[0] === "auth";
    const inOnboarding = segments[0] === "onboarding";
    const inTabs = segments[0] === "(tabs)";
    // lead/* screens are valid stack destinations for authenticated users —
    // do NOT redirect away from them.
    const inLeadStack = segments[0] === "lead";

    if (!session) {
      if (!inAuthGroup) {
        router.replace("/auth");
      }
    } else if (!onboarded) {
      if (!inOnboarding) {
        router.replace("/onboarding");
      }
    } else {
      // Only redirect to tabs from the initial loading index screen.
      // Never redirect from lead/* stack screens.
      if (!inTabs && !inLeadStack) {
        router.replace("/(tabs)");
      }
    }
  }, [session, isLoading, onboarded, segments, forceProceed]);

  return null;
}

function SyncOverlay() {
  const { isOffline, isSyncing } = useApp();
  const insets = useSafeAreaInsets();
  return (
    <SyncStatusBanner
      isOffline={isOffline}
      isSyncing={isSyncing}
      topInset={insets.top}
    />
  );
}

function RootLayoutNav() {
  return (
    <>
      <AuthGate />
      <SyncOverlay />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="lead/new" options={{ headerShown: false }} />
        <Stack.Screen name="lead/[id]/edit" options={{ headerShown: false }} />
        <Stack.Screen name="lead/[id]/quotation" options={{ headerShown: false }} />
        <Stack.Screen name="lead/[id]/preview" options={{ headerShown: false }} />
        <Stack.Screen name="lead/[id]/pdf" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular: require("../assets/fonts/Inter_400Regular.ttf"),
    Inter_500Medium: require("../assets/fonts/Inter_500Medium.ttf"),
    Inter_600SemiBold: require("../assets/fonts/Inter_600SemiBold.ttf"),
    Inter_700Bold: require("../assets/fonts/Inter_700Bold.ttf"),
  });
  const [timedOut, setTimedOut] = useState(false);

  // Safety net: if useFonts hangs (common in web proxy environments),
  // force-proceed after 3 seconds so the app never stays stuck.
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 3000);
    return () => clearTimeout(t);
  }, []);

  const appReady = fontsLoaded || !!fontError || timedOut;

  useEffect(() => {
    if (appReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [appReady]);

  if (!appReady) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AppProvider>
            <GestureHandlerRootView>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </AppProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
