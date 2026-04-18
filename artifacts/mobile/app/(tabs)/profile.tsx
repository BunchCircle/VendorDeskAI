import React, { useEffect, useState } from "react";
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
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { GradientButton } from "@/components/GradientButton";
import { Icon } from "@/components/Icon";
import { AppHeader } from "@/components/AppHeader";
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
  detectCountry,
} from "@/components/CountryPhoneInput";

export default function ProfileScreen() {
  const { vendorProfile, saveProfile, session, logout } = useApp();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const sessionEmail = session?.user?.email ?? vendorProfile?.email ?? "";

  const [businessName, setBusinessName] = useState(vendorProfile?.businessName || "");
  const [vendorName, setVendorName] = useState(vendorProfile?.vendorName || "");
  const [address, setAddress] = useState(vendorProfile?.address || "");
  const [gstNumber, setGstNumber] = useState(vendorProfile?.gstNumber || "");
  const [profilePicUri, setProfilePicUri] = useState<string | null>(vendorProfile?.profilePicUri || null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);

  const detected = detectCountry(vendorProfile?.whatsappNumber || "");
  const [waCountry, setWaCountry] = useState<Country>(detected.country);
  const [waLocal, setWaLocal] = useState(detected.local);
  const [showWaPicker, setShowWaPicker] = useState(false);

  useEffect(() => {
    if (vendorProfile) {
      setBusinessName(vendorProfile.businessName);
      setVendorName(vendorProfile.vendorName);
      setAddress(vendorProfile.address);
      setGstNumber(vendorProfile.gstNumber || "");
      setProfilePicUri(vendorProfile.profilePicUri || null);
      const d = detectCountry(vendorProfile.whatsappNumber || "");
      setWaCountry(d.country);
      setWaLocal(d.local);
    }
  }, [vendorProfile]);

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
      Alert.alert("Required Fields", "Please fill in all fields.");
      return;
    }
    const whatsappNumber = `${waCountry.dial}${waLocal.trim().replace(/^0/, "")}`;
    setSaving(true);
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
    setSaved(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleLogout = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign Out", style: "destructive", onPress: () => logout() },
      ]
    );
  };

  const initials = businessName
    ? businessName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : "V";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <AppHeader />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : Platform.OS === "android" ? 80 : 24) },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.screenTitleRow}>
          <Text style={[styles.screenTitle, { color: colors.foreground }]}>Profile</Text>
        </View>

        <LinearGradient
          colors={["#4F46E5", "#6D28D9"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.profileBanner}
        >
          <TouchableOpacity
            style={styles.avatarWrap}
            onPress={pickProfilePic}
            activeOpacity={0.8}
          >
            {profilePicUri ? (
              <Image source={{ uri: profilePicUri }} style={styles.avatarImage} contentFit="cover" />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitialsText}>{initials}</Text>
              </View>
            )}
            {pickingImage ? (
              <View style={styles.cameraOverlay}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            ) : (
              <View style={styles.cameraOverlay}>
                <Icon name="camera" size={13} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.bannerInfo}>
            <Text style={styles.bannerBusiness}>
              {businessName || "Your Business"}
            </Text>
            <Text style={styles.bannerEmail}>{sessionEmail}</Text>
            {gstNumber ? (
              <View style={styles.gstBadge}>
                <Text style={styles.gstText}>GST: {gstNumber}</Text>
              </View>
            ) : null}
          </View>
        </LinearGradient>

        <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
            <Icon name="building-2" size={14} color={colors.primary} />
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Business Info</Text>
          </View>

          <View style={styles.formSection}>
            <View style={styles.inputWrapper}>
              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Business Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                placeholder="e.g. Sharma Traders"
                placeholderTextColor={colors.mutedForeground}
                value={businessName}
                onChangeText={setBusinessName}
              />
            </View>

            <View style={styles.inputWrapper}>
              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Your Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                placeholder="e.g. Rajesh Sharma"
                placeholderTextColor={colors.mutedForeground}
                value={vendorName}
                onChangeText={setVendorName}
              />
            </View>

            <PhoneInputField
              label="WhatsApp Number"
              country={waCountry}
              number={waLocal}
              onCountryPress={() => setShowWaPicker(true)}
              onNumberChange={setWaLocal}
              colors={colors}
            />

            <View style={styles.inputWrapper}>
              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Email</Text>
              <View style={[styles.input, styles.emailDisplay, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 15 }}>
                  {sessionEmail}
                </Text>
              </View>
            </View>

            <View style={styles.inputWrapper}>
              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Business Address</Text>
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
                  <Text style={[styles.optionalTagText, { color: colors.mutedForeground }]}>Optional</Text>
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

        {saved ? (
          <View style={[styles.savedBtn, { backgroundColor: colors.success }]}>
            <Icon name="check-circle" size={18} color="#fff" />
            <Text style={styles.saveBtnText}>Changes Saved</Text>
          </View>
        ) : (
          <GradientButton
            label="Save Changes"
            onPress={handleSave}
            disabled={saving}
            loading={saving}
            iconName="check-circle"
            size="lg"
            style={styles.saveBtn}
          />
        )}

        <TouchableOpacity
          style={[styles.logoutBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Icon name="log-out" size={16} color={colors.destructive ?? "#ef4444"} />
          <Text style={[styles.logoutBtnText, { color: colors.destructive ?? "#ef4444" }]}>
            Sign Out
          </Text>
        </TouchableOpacity>
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
  content: { gap: 16, paddingTop: 0 },
  screenTitleRow: { paddingHorizontal: 20, paddingTop: 16 },
  screenTitle: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  profileBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 20,
    marginHorizontal: 16,
    borderRadius: 16,
    boxShadow: "0px 4px 12px rgba(79, 70, 229, 0.25)",
    elevation: 4,
  },
  avatarWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    overflow: "hidden",
    borderWidth: 2.5,
    borderColor: "rgba(255,255,255,0.5)",
    flexShrink: 0,
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarFallback: {
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitialsText: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#fff" },
  cameraOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 22,
    backgroundColor: "rgba(0,0,0,0.38)",
    alignItems: "center",
    justifyContent: "center",
  },
  bannerInfo: { flex: 1, gap: 3 },
  bannerBusiness: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  bannerEmail: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.7)" },
  gstBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 2,
  },
  gstText: { fontSize: 11, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.9)" },
  formCard: {
    marginHorizontal: 16,
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
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  formSection: { padding: 16, gap: 16 },
  inputWrapper: { gap: 6 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  inputLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.4, textTransform: "uppercase" },
  optionalTag: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  optionalTagText: { fontSize: 10, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.3 },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  emailDisplay: { justifyContent: "center" },
  textArea: { minHeight: 72, textAlignVertical: "top" },
  saveBtnWrap: { marginHorizontal: 16 },
  saveBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    boxShadow: "0px 6px 12px rgba(79, 70, 229, 0.3)",
    elevation: 5,
  },
  savedBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
  logoutBtn: {
    marginHorizontal: 16,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    borderWidth: 1.5,
    marginBottom: 8,
  },
  logoutBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
