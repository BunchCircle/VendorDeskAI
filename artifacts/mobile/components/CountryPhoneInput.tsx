import React, { useState } from "react";
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Icon } from "@/components/Icon";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";

export interface Country {
  flag: string;
  name: string;
  code: string;
  dial: string;
}

export const COUNTRIES: Country[] = [
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

export const INDIA = COUNTRIES[0];

export function detectCountry(fullNumber: string): { country: Country; local: string } {
  if (!fullNumber) return { country: INDIA, local: "" };
  const clean = fullNumber.startsWith("+") ? fullNumber : "+" + fullNumber;
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sorted) {
    if (clean.startsWith(c.dial)) {
      return { country: c, local: clean.slice(c.dial.length).trim() };
    }
  }
  return { country: INDIA, local: fullNumber.replace(/^\+91\s?/, "") };
}

export function CountryPickerModal({
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
      <View style={s.pickerOverlay}>
        <View style={[s.pickerSheet, { backgroundColor: colors.card }]}>
          <View style={[s.pickerHandle, { backgroundColor: colors.border }]} />
          <Text style={[s.pickerTitle, { color: colors.foreground }]}>Select Country</Text>
          <View style={[s.pickerSearch, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Icon name="search" size={14} color={colors.mutedForeground} />
            <TextInput
              style={[s.pickerSearchInput, { color: colors.foreground }]}
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
                  s.countryRow,
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
                <Text style={s.countryFlag}>{item.flag}</Text>
                <Text style={[s.countryName, { color: colors.foreground }]}>{item.name}</Text>
                <Text style={[s.countryDial, { color: item.code === selected.code ? colors.primary : colors.mutedForeground }]}>
                  {item.dial}
                </Text>
              </TouchableOpacity>
            )}
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 320 }}
          />
          <TouchableOpacity
            style={[s.pickerClose, { backgroundColor: colors.muted }]}
            onPress={() => { onClose(); setQuery(""); }}
            activeOpacity={0.8}
          >
            <Text style={[s.pickerCloseText, { color: colors.foreground }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export function PhoneInputField({
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
    <View style={s.inputWrapper}>
      <Text style={[s.inputLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={s.phoneRow}>
        <TouchableOpacity
          style={[s.countryPill, { backgroundColor: colors.muted, borderColor: colors.border }]}
          onPress={onCountryPress}
          activeOpacity={0.8}
        >
          <Text style={s.pillFlag}>{country.flag}</Text>
          <Text style={[s.pillDial, { color: colors.foreground }]}>{country.dial}</Text>
          <Icon name="chevron-down" size={13} color={colors.mutedForeground} />
        </TouchableOpacity>
        <TextInput
          style={[s.phoneNumberInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
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

const s = StyleSheet.create({
  inputWrapper: { gap: 6 },
  inputLabel: { fontSize: 12, fontFamily: "Inter_500Medium", letterSpacing: 0.3, textTransform: "uppercase" },
  phoneRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  countryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderRadius: 12,
  },
  pillFlag: { fontSize: 20 },
  pillDial: { fontSize: 14, fontFamily: "Inter_500Medium" },
  phoneNumberInput: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  pickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  pickerSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  pickerHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  pickerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 14 },
  pickerSearch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    marginBottom: 10,
  },
  pickerSearchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  countryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderRadius: 8,
    gap: 12,
  },
  countryFlag: { fontSize: 24 },
  countryName: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  countryDial: { fontSize: 14, fontFamily: "Inter_500Medium" },
  pickerClose: { marginTop: 12, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  pickerCloseText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
