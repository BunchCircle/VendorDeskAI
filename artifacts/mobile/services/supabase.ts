import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

const envUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const envKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Gracefully handle swapped credentials (URL should start with https://)
const supabaseUrl = envUrl.startsWith("https://") ? envUrl : envKey;
const supabaseAnonKey = envUrl.startsWith("https://") ? envKey : envUrl;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresh the session token when the app comes back to the foreground.
// Without this, the access token (valid for 1 hour) can expire while the app
// is backgrounded, causing Supabase to treat the user as logged out.
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
