import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
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
import { GradientButton } from "@/components/GradientButton";
import { Icon } from "@/components/Icon";
import { AppHeader } from "@/components/AppHeader";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import {
  INDIA,
  Country,
  CountryPickerModal,
  PhoneInputField,
  detectCountry,
} from "@/components/CountryPhoneInput";

export default function EditLeadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { leads, updateLead, deleteLead } = useApp();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const lead = leads.find((l) => l.id === id);

  const detectedPhone = detectCountry(lead?.phoneNumber || lead?.whatsappNumber || "");
  const detectedWa = detectCountry(lead?.whatsappNumber || "");

  const [name, setName] = useState(lead?.name || "");
  const [email, setEmail] = useState(lead?.email || "");

  const [phoneCountry, setPhoneCountry] = useState<Country>(detectedPhone.country);
  const [phoneNumber, setPhoneNumber] = useState(detectedPhone.local);
  const [showPhonePicker, setShowPhonePicker] = useState(false);

  const [whatsappSame, setWhatsappSame] = useState(lead?.whatsappSameAsPhone ?? true);
  const [waCountry, setWaCountry] = useState<Country>(detectedWa.country);
  const [waNumber, setWaNumber] = useState(detectedWa.local);
  const [showWaPicker, setShowWaPicker] = useState(false);

  const [saving, setSaving] = useState(false);

  if (!lead) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
        <Icon name="alert-circle" size={40} color={colors.mutedForeground} />
        <Text style={[{ color: colors.mutedForeground, marginTop: 12, fontFamily: "Inter_400Regular" }]}>Lead not found</Text>
      </View>
    );
  }

  const fullPhone = phoneNumber.trim()
    ? `${phoneCountry.dial}${phoneNumber.trim().replace(/^0/, "")}`
    : "";
  const fullWhatsApp = whatsappSame
    ? fullPhone
    : waNumber.trim()
    ? `${waCountry.dial}${waNumber.trim().replace(/^0/, "")}`
    : "";

  const handleSave = async () => {
    if (!name.trim() || !phoneNumber.trim()) {
      Alert.alert("Required", "Lead name and phone number are required.");
      return;
    }
    if (!whatsappSame && !waNumber.trim()) {
      Alert.alert("Required", "Please enter the WhatsApp number.");
      return;
    }
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await updateLead({
      ...lead,
      name: name.trim(),
      phoneNumber: fullPhone,
      whatsappNumber: fullWhatsApp,
      whatsappSameAsPhone: whatsappSame,
      email: email.trim() || undefined,
    });
    setSaving(false);
    router.back();
  };

  const handleDelete = () => {
    const doDelete = async () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await deleteLead(lead.id);
      router.replace("/(tabs)");
    };
    if (Platform.OS === "web") {
      if ((window as any).confirm(`Delete "${lead.name}"? This cannot be undone.`)) doDelete();
    } else {
      Alert.alert("Delete Lead", `Remove "${lead.name}"? This cannot be undone.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <AppHeader
        showBack
        onBack={() => router.back()}
        title="Edit Lead"
        rightElement={
          <TouchableOpacity
            onPress={handleDelete}
            activeOpacity={0.7}
            style={[styles.deleteBtn, { backgroundColor: colors.destructiveLight }]}
          >
            <Icon name="trash-2" size={17} color={colors.destructive} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 24) },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
            <Icon name="user" size={14} color={colors.primary} />
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Lead Details</Text>
          </View>
          <View style={styles.formSection}>
            <View style={styles.inputWrapper}>
              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Lead Name *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                placeholder="e.g. Rahul Sharma / Priya Traders"
                placeholderTextColor={colors.mutedForeground}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>

            <PhoneInputField
              label="Phone Number *"
              country={phoneCountry}
              number={phoneNumber}
              onCountryPress={() => setShowPhonePicker(true)}
              onNumberChange={setPhoneNumber}
              colors={colors}
            />

            <TouchableOpacity
              style={[styles.checkboxRow, { backgroundColor: colors.muted, borderColor: colors.border }]}
              onPress={() => {
                setWhatsappSame((v) => !v);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    backgroundColor: whatsappSame ? colors.primary : "transparent",
                    borderColor: whatsappSame ? colors.primary : colors.border,
                  },
                ]}
              >
                {whatsappSame && <Icon name="check" size={12} color="#fff" />}
              </View>
              <Text style={[styles.checkboxLabel, { color: colors.foreground }]}>
                WhatsApp same as phone number
              </Text>
            </TouchableOpacity>

            {!whatsappSame && (
              <PhoneInputField
                label="WhatsApp Number *"
                country={waCountry}
                number={waNumber}
                onCountryPress={() => setShowWaPicker(true)}
                onNumberChange={setWaNumber}
                colors={colors}
              />
            )}

            <View style={styles.inputWrapper}>
              <View style={styles.labelRow}>
                <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Email</Text>
                <View style={[styles.optionalTag, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <Text style={[styles.optionalText, { color: colors.mutedForeground }]}>Optional</Text>
                </View>
              </View>
              <TextInput
                style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                placeholder="email@example.com"
                placeholderTextColor={colors.mutedForeground}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>
        </View>

        <GradientButton
          label="Save Changes"
          onPress={handleSave}
          disabled={saving}
          loading={saving}
          iconName="check-circle"
          size="lg"
          style={styles.saveBtn}
        />
      </ScrollView>

      <CountryPickerModal
        visible={showPhonePicker}
        selected={phoneCountry}
        onSelect={setPhoneCountry}
        onClose={() => setShowPhonePicker(false)}
        colors={colors}
      />
      <CountryPickerModal
        visible={showWaPicker}
        selected={waCountry}
        onSelect={setWaCountry}
        onClose={() => setShowWaPicker(false)}
        colors={colors}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },
  formCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.05)",
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6, textTransform: "uppercase" },
  formSection: { padding: 16, paddingTop: 14, gap: 14 },
  inputWrapper: { gap: 6 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  inputLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.4, textTransform: "uppercase" },
  optionalTag: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  optionalText: { fontSize: 10, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.3 },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  checkboxLabel: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 20 },
  saveBtn: {
    borderRadius: 14,
  },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
