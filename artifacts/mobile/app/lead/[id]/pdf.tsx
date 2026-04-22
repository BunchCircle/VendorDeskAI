import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { GradientButton } from "@/components/GradientButton";
import { Icon } from "@/components/Icon";
import { AppHeader } from "@/components/AppHeader";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { generateQuotationHTML } from "@/services/pdf";
import { savePDFToDevice, shareViaWhatsApp } from "@/services/pdfActions";

export default function PDFViewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { leads, vendorProfile, getQuotationForLead, updateLead } = useApp();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const lead = leads.find((l) => l.id === id);
  const quotation = lead ? getQuotationForLead(lead.id) : undefined;
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);

  if (!lead || !quotation) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: colors.mutedForeground }}>Quotation not found</Text>
      </View>
    );
  }

  const subtotal = quotation.items.reduce((sum, item) => sum + item.quantity * item.rate, 0);

  const discountAmount = (() => {
    const d = quotation.discount;
    if (!d?.enabled) return 0;
    if (d.type === "percent") return (subtotal * d.value) / 100;
    return Math.min(d.value, subtotal);
  })();

  const afterDiscount = subtotal - discountAmount;

  // Per-item GST from catalogue taxRate, grouped by slab — suppressed when taxEnabled is false
  const taxApplied = quotation.taxEnabled !== false;
  const perItemSlabMap = new Map<number, { taxableAmt: number; taxAmt: number }>();
  if (taxApplied) {
    for (const item of quotation.items) {
      const r = item.taxRate || 0;
      if (r <= 0) continue;
      const taxableAmt = item.quantity * item.rate;
      const taxAmt = (taxableAmt * r) / 100;
      const prev = perItemSlabMap.get(r) || { taxableAmt: 0, taxAmt: 0 };
      perItemSlabMap.set(r, { taxableAmt: prev.taxableAmt + taxableAmt, taxAmt: prev.taxAmt + taxAmt });
    }
  }
  const perItemSlabs = Array.from(perItemSlabMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([rate, { taxableAmt, taxAmt }]) => ({ rate, taxableAmt, taxAmt }));
  const hasPerItemTaxes = perItemSlabs.length > 0;
  const taxAmount = hasPerItemTaxes ? perItemSlabs.reduce((s, slab) => s + slab.taxAmt, 0) : 0;

  const grandTotal = afterDiscount + taxAmount;

  const date = new Date(quotation.createdAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const generatePDF = async (): Promise<string | null> => {
    if (!vendorProfile) return null;
    const html = generateQuotationHTML(quotation, vendorProfile, lead);
    try {
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      return uri;
    } catch {
      return null;
    }
  };

  const handleDownloadPDF = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Not Supported", "PDF download is available on the mobile app.");
      return;
    }
    setDownloading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const uri = await generatePDF();
    if (!uri) {
      Alert.alert("Error", "Could not generate PDF. Please try again.");
      setDownloading(false);
      return;
    }
    try {
      const filename = `Quotation-${quotation.quoteNumber}.pdf`;
      await savePDFToDevice(uri, filename);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Could not save PDF to device.");
    }
    setDownloading(false);
  };

  const handleShareWhatsApp = async () => {
    if (Platform.OS === "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const cleanNumber = lead.whatsappNumber.replace(/\D/g, "");
      const msg = encodeURIComponent(
        `Hi ${lead.name}, please find your quotation ${quotation.quoteNumber} from ${vendorProfile?.businessName || "us"}.`
      );
      Linking.openURL(`https://wa.me/${cleanNumber}?text=${msg}`);
      return;
    }
    setSharing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const uri = await generatePDF();
    if (!uri) {
      Alert.alert("Error", "Could not generate PDF. Please try again.");
      setSharing(false);
      return;
    }
    try {
      const message = `Hi ${lead.name}, please find your quotation ${quotation.quoteNumber} from ${vendorProfile?.businessName || "us"}.`;
      await shareViaWhatsApp(uri, lead.whatsappNumber, message);
      await updateLead({ ...lead, status: "PDF Shared" });
    } catch {
      Alert.alert("Error", "Could not open the share sheet.");
    }
    setSharing(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader
        showBack
        onBack={() => router.back()}
        title="Quotation PDF"
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 140) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.pdfDoc, { backgroundColor: colors.card }]}>
          <LinearGradient
            colors={["#4F46E5", "#6D28D9"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.docAccent}
          />

          <View style={styles.docHeader}>
            <Text style={[styles.docBusinessName, { color: colors.primary }]}>
              {vendorProfile?.businessName || "Your Business"}
            </Text>
            {vendorProfile && (
              <Text style={[styles.docContact, { color: colors.mutedForeground }]}>
                {vendorProfile.vendorName} · {vendorProfile.whatsappNumber}
              </Text>
            )}
            {vendorProfile?.address && (
              <Text style={[styles.docAddress, { color: colors.mutedForeground }]}>
                {vendorProfile.address}
              </Text>
            )}
          </View>

          <View style={[styles.docDivider, { backgroundColor: colors.border }]} />

          <View style={styles.docMeta}>
            <View>
              <Text style={[styles.docMetaLabel, { color: colors.mutedForeground }]}>Quotation For</Text>
              <Text style={[styles.docMetaValue, { color: colors.foreground }]}>{lead.name}</Text>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  Linking.openURL(`tel:${lead.whatsappNumber}`).catch(() => {});
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.docMetaPhone, { color: colors.mutedForeground }]}>{lead.whatsappNumber}</Text>
              </TouchableOpacity>
              {!!lead.email && (
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    Linking.openURL(`mailto:${lead.email}`).catch(() => {});
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.docMetaPhone, { color: colors.mutedForeground }]}>{lead.email}</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <LinearGradient
                colors={["#4F46E5", "#6D28D9"]}
                style={styles.quoteNumberBadge}
              >
                <Text style={styles.quoteNumberText}>{quotation.quoteNumber}</Text>
              </LinearGradient>
              <Text style={[styles.docDate, { color: colors.mutedForeground }]}>{date}</Text>
            </View>
          </View>

          <View style={[styles.itemsTable, { borderColor: colors.border }]}>
            <LinearGradient
              colors={["#4F46E5", "#6D28D9"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.tableHead}
            >
              <Text style={[styles.th, { flex: 3 }]}>Item</Text>
              <Text style={[styles.th, { flex: 2, textAlign: "center" }]}>Qty</Text>
              <Text style={[styles.th, { flex: 2, textAlign: "right" }]}>Rate</Text>
              <Text style={[styles.th, { flex: 2, textAlign: "right" }]}>Amount</Text>
            </LinearGradient>
            {quotation.items.map((item, idx) => (
              <View
                key={item.id}
                style={[
                  styles.tableRow,
                  {
                    backgroundColor: idx % 2 === 0 ? colors.card : colors.surfaceElevated,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.td, { flex: 3, color: colors.foreground }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.td, { flex: 2, color: colors.foreground, textAlign: "center" }]}>
                  {item.quantity} {item.unit}
                </Text>
                <Text style={[styles.td, { flex: 2, color: colors.foreground, textAlign: "right" }]}>
                  ₹{item.rate.toLocaleString("en-IN")}
                </Text>
                <Text style={[styles.td, { flex: 2, color: colors.foreground, textAlign: "right", fontFamily: "Inter_600SemiBold" }]}>
                  ₹{(item.quantity * item.rate).toLocaleString("en-IN")}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.totalSection}>
            <View style={styles.summaryLines}>
              <SummaryRow label="Subtotal" value={`₹${subtotal.toLocaleString("en-IN")}`} colors={colors} />
              {quotation.discount?.enabled && discountAmount > 0 && (
                <SummaryRow
                  label={`Discount (${quotation.discount.type === "percent" ? `${quotation.discount.value}%` : "flat"})`}
                  value={`–₹${discountAmount.toLocaleString("en-IN")}`}
                  valueColor={colors.destructive}
                  colors={colors}
                />
              )}
              {!taxApplied ? (
                <Text style={[styles.noTaxNote, { color: colors.mutedForeground }]}>
                  Tax not applicable
                </Text>
              ) : hasPerItemTaxes ? (
                perItemSlabs.map((slab) => (
                  <React.Fragment key={slab.rate}>
                    <SummaryRow
                      label={`${slab.rate}% slab — taxable ₹${slab.taxableAmt.toLocaleString("en-IN")}`}
                      value=""
                      colors={colors}
                      labelStyle={{ fontStyle: "italic", fontSize: 11 }}
                    />
                    <SummaryRow
                      label={`GST (${slab.rate}%)`}
                      value={`+₹${slab.taxAmt.toLocaleString("en-IN")}`}
                      colors={colors}
                    />
                  </React.Fragment>
                ))
              ) : (
                <Text style={[styles.noTaxNote, { color: colors.mutedForeground }]}>
                  Quotation without Taxes
                </Text>
              )}
            </View>
            <LinearGradient
              colors={["#4F46E5", "#6D28D9"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.totalBox}
            >
              <Text style={styles.totalLabel}>Grand Total</Text>
              <Text style={styles.totalAmount}>₹{grandTotal.toLocaleString("en-IN")}</Text>
            </LinearGradient>
          </View>

          {quotation.notes ? (
            <View style={[styles.notesBox, { backgroundColor: colors.muted }]}>
              <Text style={[styles.notesLabel, { color: colors.mutedForeground }]}>Notes</Text>
              <Text style={[styles.notesText, { color: colors.foreground }]}>{quotation.notes}</Text>
            </View>
          ) : null}

          <View style={styles.docFooter}>
            <Text style={[styles.footerText, { color: colors.mutedForeground }]}>Generated by VendorDesk.AI</Text>
          </View>
        </View>
      </ScrollView>

      <View
        style={[
          styles.actionBar,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 8),
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.downloadBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
          onPress={handleDownloadPDF}
          disabled={downloading || sharing}
          activeOpacity={0.8}
        >
          {downloading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <Icon name="download" size={17} color={colors.foreground} />
              <Text style={[styles.downloadBtnText, { color: colors.foreground }]}>Download PDF</Text>
            </>
          )}
        </TouchableOpacity>

        <GradientButton
          label="Share on WhatsApp"
          onPress={handleShareWhatsApp}
          disabled={downloading || sharing}
          loading={sharing}
          iconName="message-circle"
          colors={["#25D366", "#128C7E"]}
          size="lg"
          style={styles.whatsappBtnWrap}
        />
      </View>
    </View>
  );
}

function SummaryRow({ label, value, valueColor, colors, labelStyle }: {
  label: string;
  value: string;
  valueColor?: string;
  colors: ReturnType<typeof useColors>;
  labelStyle?: object;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, { color: colors.mutedForeground }, labelStyle]}>{label}</Text>
      {!!value && <Text style={[styles.summaryValue, { color: valueColor || colors.foreground }]}>{value}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  pdfDoc: {
    borderRadius: 16,
    overflow: "hidden",
    elevation: 3,
    boxShadow: "0px 4px 12px rgba(79, 70, 229, 0.1)",
    marginBottom: 16,
  },
  docAccent: { height: 6 },
  docHeader: { padding: 20, gap: 4 },
  docBusinessName: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  docContact: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  docAddress: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  docDivider: { height: 1, marginHorizontal: 16 },
  docMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 16,
    paddingTop: 16,
  },
  docMetaLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  docMetaValue: { fontSize: 17, fontFamily: "Inter_700Bold" },
  docMetaPhone: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  quoteNumberBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  quoteNumberText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff" },
  docDate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 6 },
  itemsTable: { marginHorizontal: 16, borderRadius: 12, overflow: "hidden", borderWidth: 1, marginBottom: 16 },
  tableHead: { flexDirection: "row", paddingHorizontal: 14, paddingVertical: 11 },
  th: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#FFFFFF", letterSpacing: 0.3 },
  tableRow: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  td: { fontSize: 13, fontFamily: "Inter_400Regular", paddingHorizontal: 2 },
  totalSection: { paddingHorizontal: 16, marginBottom: 16, gap: 10 },
  summaryLines: { gap: 6 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  summaryValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  noTaxNote: { fontSize: 12, fontFamily: "Inter_400Regular", fontStyle: "italic" },
  totalBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  totalLabel: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  totalAmount: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#fff" },
  notesBox: { marginHorizontal: 16, borderRadius: 12, padding: 16, marginBottom: 16, gap: 6 },
  notesLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6 },
  notesText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  docFooter: { alignItems: "center", paddingVertical: 14 },
  footerText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  actionBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  downloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 13,
    borderWidth: 1.5,
  },
  downloadBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  whatsappBtnWrap: {},
  whatsappBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 4,
  },
  whatsappBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
});
