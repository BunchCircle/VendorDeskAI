import * as Haptics from "expo-haptics";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { GradientButton } from "@/components/GradientButton";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/services/supabase";
import { useApp } from "@/context/AppContext";
import { LogoMark } from "@/components/AppHeader";

type Step = "email" | "otp";

export default function AuthScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { refreshAll } = useApp();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);

  const otpRefs = useRef<(TextInput | null)[]>([]);

  const sendOtp = async () => {
    if (!email.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert("Enter your email", "Please enter a valid email address.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert("Error", error.message);
      return;
    }
    setStep("otp");
  };

  const verifyOtp = async () => {
    const token = otp.join("");
    if (token.length !== 8) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert("Enter the code", "Please enter the 8-digit code from your email.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: "email",
    });
    setLoading(false);
    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert("Invalid code", "The code you entered is incorrect or has expired. Please try again.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await refreshAll();
  };

  const handleOtpChange = (val: string, idx: number) => {
    const digits = val.replace(/\D/g, "");
    if (digits.length > 1) {
      const filled = digits.slice(0, 8).split("");
      const next = [...otp];
      filled.forEach((d, i) => {
        if (idx + i < 8) next[idx + i] = d;
      });
      setOtp(next);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const focusIdx = Math.min(idx + filled.length, 7);
      otpRefs.current[focusIdx]?.focus();
      return;
    }
    const next = [...otp];
    next[idx] = digits;
    setOtp(next);
    if (digits) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (idx < 7) {
        otpRefs.current[idx + 1]?.focus();
      }
    }
  };

  const handleOtpKeyPress = (e: { nativeEvent: { key: string } }, idx: number) => {
    if (e.nativeEvent.key === "Backspace" && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={["#4F46E5", "#6D28D9", colors.background]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.55 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[
            styles.container,
            {
              paddingTop: insets.top + (Platform.OS === "web" ? 80 : 56),
              paddingBottom: insets.bottom + 40,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerSection}>
            <View style={styles.logoWrap}>
              <LogoMark size={64} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.appName}>VendorDesk.AI</Text>
              <Text style={styles.tagline}>AI-Powered Quotations in Seconds</Text>
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.stepHeader}>
              <Text style={[styles.stepTitle, { color: colors.foreground }]}>
                {step === "email" ? "Welcome back" : "Check your inbox"}
              </Text>
              <Text style={[styles.stepSubtitle, { color: colors.mutedForeground }]}>
                {step === "email"
                  ? "Sign in or create your account"
                  : `We sent an 8-digit code to\n${email}`}
              </Text>
            </View>

            {step === "email" ? (
              <View style={styles.inputWrapper}>
                <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Email Address</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.mutedForeground}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoFocus
                  onSubmitEditing={sendOtp}
                  returnKeyType="send"
                />
              </View>
            ) : (
              <View style={styles.otpSection}>
                <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Enter 8-digit code</Text>
                <View style={styles.otpRow}>
                  {otp.map((digit, idx) => (
                    <TextInput
                      key={idx}
                      ref={(r) => { otpRefs.current[idx] = r; }}
                      style={[
                        styles.otpBox,
                        {
                          backgroundColor: colors.muted,
                          borderColor: digit ? colors.primary : colors.border,
                          color: colors.foreground,
                        },
                      ]}
                      value={digit}
                      onChangeText={(v) => handleOtpChange(v, idx)}
                      onKeyPress={(e) => handleOtpKeyPress(e, idx)}
                      keyboardType="number-pad"
                      maxLength={1}
                      textAlign="center"
                      autoFocus={idx === 0}
                    />
                  ))}
                </View>
                <TouchableOpacity onPress={() => { setStep("email"); setOtp(["","","","","","","",""]); }}>
                  <Text style={[styles.backLink, { color: colors.primary }]}>← Change email</Text>
                </TouchableOpacity>
              </View>
            )}

            <GradientButton
              label={step === "email" ? "Send Code →" : "Verify & Sign In →"}
              onPress={step === "email" ? sendOtp : verifyOtp}
              disabled={loading}
              loading={loading}
              size="lg"
              style={styles.button}
            />

            {step === "otp" && (
              <TouchableOpacity onPress={sendOtp} disabled={loading} style={styles.resendRow}>
                <Text style={[styles.resend, { color: colors.mutedForeground }]}>
                  Didn't receive it?{" "}
                  <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Resend code</Text>
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={[styles.footer, { color: "rgba(255,255,255,0.6)" }]}>
            By continuing you agree to our Terms of Service
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, gap: 24, alignItems: "stretch" },
  headerSection: { alignItems: "center", gap: 16 },
  logoWrap: {
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  appName: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
  },
  headerText: { alignItems: "center", gap: 6 },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    gap: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 6,
  },
  stepHeader: { gap: 6 },
  stepTitle: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  stepSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  inputWrapper: { gap: 8 },
  inputLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, textTransform: "uppercase" },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  otpSection: { gap: 12, alignItems: "flex-start" },
  otpRow: { flexDirection: "row", gap: 7, alignSelf: "stretch", justifyContent: "space-between" },
  otpBox: {
    flex: 1,
    height: 52,
    borderWidth: 2,
    borderRadius: 12,
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    minWidth: 36,
  },
  backLink: { fontSize: 14, fontFamily: "Inter_500Medium" },
  button: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 5,
  },
  buttonText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
  resendRow: { alignItems: "center" },
  resend: { textAlign: "center", fontSize: 14, fontFamily: "Inter_400Regular" },
  footer: { textAlign: "center", fontSize: 12, fontFamily: "Inter_400Regular" },
});
