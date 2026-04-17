import { useRouter } from "expo-router";
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
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { GradientButton } from "@/components/GradientButton";
import { Icon } from "@/components/Icon";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import {
  INDIA,
  Country,
  CountryPickerModal,
  PhoneInputField,
} from "@/components/CountryPhoneInput";
import { LogoMark, BrandWordmark } from "@/components/AppHeader";

export default function OnboardingScreen() {
  const { saveProfile, session } = useApp();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const sessionEmail = session?.user?.email ?? "";

  const [businessName, setBusinessName] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [waCountry, setWaCountry] = useState<Country>(INDIA);
  const [waLocal, setWaLocal] = useState("");
  const [showWaPicker, setShowWaPicker] = useState(false);
  const [address, setAddress] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [profilePicUri, setProfilePicUri] = useState<string | null>(null);
  const [pickingImage, setPickingImage] = useState(false);
  const [saving, setSaving] = useState(false);

  const initials = businessName
    ? businessName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : vendorName
    ? vendorName[0].toUpperCase()
    : "V";

  const pickProfilePic = async () => {
    if (pickingImage) return;
    setPickingImage(true);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Please allow photo library access to set a profile picture.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        const sourceUri = result.assets[0].uri;
        const fileName = `profile_pic_${Date.now()}.jpg`;
        const destUri = `${FileSystem.documentDirectory}${fileName}`;
        await FileSystem.copyAsync({ from: sourceUri, to: destUri });
        setProfilePicUri(destUri);
      }
    } finally {
      setPickingImage(false);
    }
  };

  const handleSave = async () => {
    if (!businessName.trim() || !vendorName.trim() || !waLocal.trim() || !address.trim()) {
      Alert.alert("Required Fields", "Please fill in all required fields.");
      return;
    }
    const whatsappNumber = `${waCountry.dial}${waLocal.trim().replace(/^0/, "")}`;
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await saveProfile({
      businessName: businessName.trim(),
      vendorName: vendorName.trim(),
      whatsappNumber,
      email: sessionEmail,
      address: address.trim(),
      gstNumber: gstNumber.trim() || undefined,
      profilePicUri: profilePicUri || undefined,
    });
    setSaving(false);
    router.replace("/(tabs)/catalogue");
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View
        style={[
          styles.topBar,
          {
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 10),
          },
        ]}
      >
        <View style={styles.brandRow}>
          <LogoMark size={30} />
          <BrandWordmark />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingBottom: insets.bottom + 40,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.heroBanner, { backgroundColor: colors.primaryLight }]}>
          <Text style={[styles.heroTitle, { color: colors.primary }]}>Set up your business</Text>
          <Text style={[styles.heroSubtitle, { color: colors.mutedForeground }]}>
            Signed in as {sessionEmail}
          </Text>
        </View>

        <View style={styles.pickerSection}>
          <TouchableOpacity
            style={[styles.avatarWrap, { borderColor: colors.primary }]}
            onPress={pickProfilePic}
            activeOpacity={0.8}
          >
            {profilePicUri ? (
              <Image source={{ uri: profilePicUri }} style={styles.avatarImage} contentFit="cover" />
            ) : (
              <LinearGradient
                colors={["#4F46E5", "#6D28D9"]}
                style={styles.avatarFallback}
              >
                <Text style={styles.avatarInitials}>{initials}</Text>
              </LinearGradient>
            )}
            {pickingImage ? (
              <View style={[styles.cameraOverlay, { backgroundColor: "rgba(0,0,0,0.45)" }]}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            ) : (
              <View style={[styles.cameraOverlay, { backgroundColor: "rgba(0,0,0,0.32)" }]}>
                <Icon name="camera" size={18} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
          <Text style={[styles.pickerHint, { color: colors.mutedForeground }]}>
            {profilePicUri ? "Tap to change photo" : "Add profile photo (optional)"}
          </Text>
        </View>

        <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
            <Icon name="building-2" size={15} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Business Information</Text>
          </View>
          <View style={styles.formSection}>
            <View style={styles.inputWrapper}>
              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Business Name *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                placeholder="e.g. Sharma Traders"
                placeholderTextColor={colors.mutedForeground}
                value={businessName}
                onChangeText={setBusinessName}
              />
            </View>

            <View style={styles.inputWrapper}>
              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Your Name *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                placeholder="e.g. Rajesh Sharma"
                placeholderTextColor={colors.mutedForeground}
                value={vendorName}
                onChangeText={setVendorName}
              />
            </View>

            <PhoneInputField
              label="WhatsApp Number *"
              country={waCountry}
              number={waLocal}
              onCountryPress={() => setShowWaPicker(true)}
              onNumberChange={setWaLocal}
              colors={colors}
            />

            <View style={styles.inputWrapper}>
              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Business Address *</Text>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Shop No., Street, City"
                placeholderTextColor={colors.mutedForeground}
                value={address}
                onChangeText={setAddress}
                multiline
              />
            </View>

            <View style={styles.inputWrapper}>
              <View style={styles.labelRow}>
                <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>GST / TIN Number</Text>
                <View style={[styles.optionalTag, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <Text style={[styles.optionalText, { color: colors.mutedForeground }]}>Optional</Text>
                </View>
              </View>
              <TextInput
                style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                placeholder="e.g. 29ABCDE1234F1Z5"
                placeholderTextColor={colors.mutedForeground}
                value={gstNumber}
                onChangeText={setGstNumber}
                autoCapitalize="characters"
              />
            </View>
          </View>
        </View>

        <GradientButton
          label="Save & Continue"
          onPress={handleSave}
          disabled={saving}
          loading={saving}
          iconName="check-circle"
          size="lg"
          style={{ marginHorizontal: 20 }}
        />
      </ScrollView>

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
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  container: { gap: 20 },
  heroBanner: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 4,
  },
  heroTitle: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  heroSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular" },
  pickerSection: { alignItems: "center", gap: 10 },
  avatarWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    overflow: "hidden",
    position: "relative",
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: { fontSize: 34, fontFamily: "Inter_700Bold", color: "#fff" },
  cameraOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerHint: { fontSize: 13, fontFamily: "Inter_400Regular" },
  formCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
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
  sectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6, textTransform: "uppercase" },
  formSection: { padding: 16, gap: 16 },
  inputWrapper: { gap: 6 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  inputLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.4, textTransform: "uppercase" },
  optionalTag: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  optionalText: { fontSize: 10, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.3 },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  textArea: { minHeight: 72, textAlignVertical: "top" },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 16,
    paddingVertical: 17,
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 5,
  },
  saveButtonText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
});
