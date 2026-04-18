import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Icon } from "@/components/Icon";
import { AppHeader } from "@/components/AppHeader";
import { GradientButton } from "@/components/GradientButton";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

interface Country {
  flag: string;
  name: string;
  code: string;
  dial: string;
}

const COUNTRIES: Country[] = [
  { flag: "🇮🇳", name: "India", code: "IN", dial: "+91" },
  { flag: "🇦🇪", name: "UAE", code: "AE", dial: "+971" },
  { flag: "🇺🇸", name: "USA", code: "US", dial: "+1" },
  { flag: "🇬🇧", name: "UK", code: "GB", dial: "+44" },
  { flag: "🇸🇬", name: "Singapore", code: "SG", dial: "+65" },
  { flag: "🇧🇩", name: "Bangladesh", code: "BD", dial: "+880" },
  { flag: "🇵🇰", name: "Pakistan", code: "PK", dial: "+92" },
  { flag: "🇳🇵", name: "Nepal", code: "NP", dial: "+977" },
  { flag: "🇸🇦", name: "Saudi Arabia", code: "SA", dial: "+966" },
  { flag: "🇶🇦", name: "Qatar", code: "QA", dial: "+974" },
  { flag: "🇰🇼", name: "Kuwait", code: "KW", dial: "+965" },
  { flag: "🇲🇾", name: "Malaysia", code: "MY", dial: "+60" },
  { flag: "🇦🇺", name: "Australia", code: "AU", dial: "+61" },
  { flag: "🇨🇦", name: "Canada", code: "CA", dial: "+1" },
  { flag: "🇩🇪", name: "Germany", code: "DE", dial: "+49" },
];

const INDIA = COUNTRIES[0];

function CountryPickerModal({
  visible,
  selected,
  onSelect,
  onClose,
  colors,
}: {
  visible: boolean;
  selected: Country;
  onSelect: (c: Country) => void;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [query, setQuery] = useState("");
  const filtered = COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.dial.includes(query)
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.pickerOverlay}>
        <View style={[styles.pickerSheet, { backgroundColor: colors.card }]}>
          <View style={[styles.pickerHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.pickerTitle, { color: colors.foreground }]}>Select Country</Text>
          <View style={[styles.pickerSearch, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Icon name="search" size={15} color={colors.mutedForeground} />
            <TextInput
              style={[styles.pickerSearchInput, { color: colors.foreground }]}
              placeholder="Search country..."
              placeholderTextColor={colors.mutedForeground}
              value={query}
              onChangeText={setQuery}
              autoFocus
            />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.code}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.countryRow,
                  {
                    backgroundColor: item.code === selected.code ? colors.primaryLight : "transparent",
                    borderBottomColor: colors.border,
                  },
                ]}
                onPress={() => {
                  onSelect(item);
                  onClose();
                  setQuery("");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.countryFlag}>{item.flag}</Text>
                <Text style={[styles.countryName, { color: colors.foreground }]}>{item.name}</Text>
                <Text style={[styles.countryDial, { color: item.code === selected.code ? colors.primary : colors.mutedForeground }]}>
                  {item.dial}
                </Text>
                {item.code === selected.code && (
                  <Icon name="check" size={16} color={colors.primary} />
                )}
              </TouchableOpacity>
            )}
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 320 }}
          />
          <TouchableOpacity
            style={[styles.pickerClose, { backgroundColor: colors.muted, borderColor: colors.border }]}
            onPress={() => { onClose(); setQuery(""); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.pickerCloseText, { color: colors.foreground }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function PhoneInput({
  label,
  country,
  number,
  onCountryPress,
  onNumberChange,
  colors,
}: {
  label: string;
  country: Country;
  number: string;
  onCountryPress: () => void;
  onNumberChange: (n: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.inputWrapper}>
      <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={styles.phoneRow}>
        <TouchableOpacity
          style={[styles.countryPill, { backgroundColor: colors.muted, borderColor: colors.border }]}
          onPress={onCountryPress}
          activeOpacity={0.8}
        >
          <Text style={styles.pillFlag}>{country.flag}</Text>
          <Text style={[styles.pillDial, { color: colors.foreground }]}>{country.dial}</Text>
          <Icon name="chevron-down" size={13} color={colors.mutedForeground} />
        </TouchableOpacity>
        <TextInput
          style={[styles.phoneNumberInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
          placeholder="98765 43210"
          placeholderTextColor={colors.mutedForeground}
          value={number}
          onChangeText={onNumberChange}
          keyboardType="phone-pad"
        />
      </View>
    </View>
  );
}

export default function NewLeadScreen() {
  const { addLead } = useApp();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [name, setName] = useState("");

  const [phoneCountry, setPhoneCountry] = useState<Country>(INDIA);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [showPhonePicker, setShowPhonePicker] = useState(false);

  const [whatsappSame, setWhatsappSame] = useState(true);
  const [waCountry, setWaCountry] = useState<Country>(INDIA);
  const [waNumber, setWaNumber] = useState("");
  const [showWaPicker, setShowWaPicker] = useState(false);

  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const fullPhone = phoneNumber.trim()
    ? `${phoneCountry.dial}${phoneNumber.trim().replace(/^0/, "")}`
    : "";
  const fullWhatsApp = whatsappSame
    ? fullPhone
    : waNumber.trim()
    ? `${waCountry.dial}${waNumber.trim().replace(/^0/, "")}`
    : "";

  const handleSave = async (goToQuotation: boolean) => {
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
    const newLead = await addLead({
      name: name.trim(),
      phoneNumber: fullPhone,
      whatsappNumber: fullWhatsApp,
      whatsappSameAsPhone: whatsappSame,
      email: email.trim() || undefined,
      status: "Pending",
    });
    setSaving(false);
    if (goToQuotation) {
      router.replace(`/lead/${newLead.id}/quotation`);
    } else {
      router.back();
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
        title="New Lead"
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

            <PhoneInput
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
              <PhoneInput
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

        <View style={styles.buttons}>
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => handleSave(false)}
            disabled={saving}
            activeOpacity={0.8}
          >
            <Icon name="save" size={16} color={colors.foreground} />
            <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>Save Lead</Text>
          </TouchableOpacity>
          <GradientButton
            label="Create Quotation"
            onPress={() => handleSave(true)}
            disabled={saving}
            loading={saving}
            iconName="zap"
            size="md"
            style={styles.primaryBtnWrap}
          />
        </View>
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
  phoneRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  countryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 13,
    borderWidth: 1.5,
    borderRadius: 12,
  },
  pillFlag: { fontSize: 18 },
  pillDial: { fontSize: 14, fontFamily: "Inter_500Medium" },
  phoneNumberInput: {
    flex: 1,
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
  buttons: { flexDirection: "row", gap: 10 },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  secondaryBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  primaryBtnWrap: { flex: 1.4 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    boxShadow: "0px 4px 10px rgba(79, 70, 229, 0.3)",
    elevation: 4,
  },
  primaryBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  pickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  pickerSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
  },
  pickerHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 20 },
  pickerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 14 },
  pickerSearch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 12,
  },
  pickerSearchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  countryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderRadius: 8,
    marginBottom: 2,
  },
  countryFlag: { fontSize: 22, width: 32 },
  countryName: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  countryDial: { fontSize: 14, fontFamily: "Inter_500Medium", marginRight: 8 },
  pickerClose: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
  },
  pickerCloseText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
