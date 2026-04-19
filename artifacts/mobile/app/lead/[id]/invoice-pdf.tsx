import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
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
import { generateInvoiceHTML } from "@/services/pdf";
import { INDIAN_STATES, InvoiceStatus, computePerItemTaxData } from "@/services/storage";
import { savePDFToDevice, shareViaWhatsApp } from "@/services/pdfActions";

const STATUS_CONFIG = {
  draft: { bg: "#FEF3C7", text: "#92400E", dot: "#D97706", label: "Draft" },
  sent: { bg: "#DBEAFE", text: "#1E40AF", dot: "#2563EB", label: "Sent" },
  paid: { bg: "#D1FAE5", text: "#065F46", dot: "#059669", label: "Paid" },
};

export default function InvoicePDFScreen() {
  const params = useLocalSearchParams<{ id: string; invoiceId: string }>();
  const { id: leadId, invoiceId } = params;
  const { leads, vendorProfile, invoices, updateInvoiceStatus } = useApp();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const lead = leads.find((l) => l.id === leadId);
  const invoice = invoices.find((inv) => inv.id === invoiceId);

  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [statusMenuVisible, setStatusMenuVisible] = useState(false);

  if (!lead || !invoice) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: colors.mutedForeground }}>Invoice not found</Text>
      </View>
    );
  }

  const subtotal = invoice.items.reduce((sum, item) => sum + item.quantity * item.rate, 0);

  const discountAmount = (() => {
    const d = invoice.discount;
    if (!d?.enabled) return 0;
    if (d.type === "percent") return (subtotal * d.value) / 100;
    return Math.min(d.value, subtotal);
  })();

  const afterDiscount = subtotal - discountAmount;
  const taxRate = invoice.tax?.enabled ? (invoice.tax.rate ?? 0) : 0;
  const perItemTaxData = computePerItemTaxData(invoice.items);
  const hasPerItemTaxes = perItemTaxData.slabs.length > 0;
  const taxAmount = hasPerItemTaxes
    ? perItemTaxData.totalTax
    : invoice.tax?.enabled ? (afterDiscount * taxRate) / 100 : 0;
  const grandTotal = afterDiscount + taxAmount;

  const invoiceDate = new Date(invoice.invoiceDate).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const isCgstSgst = invoice.taxSplit.type === "cgst_sgst";
  const halfRate = taxRate / 2;
  const selectedState = INDIAN_STATES.find((s) => s.code === invoice.placeOfSupply);
  const statusCfg = STATUS_CONFIG[invoice.status] || STATUS_CONFIG.draft;

  const generatePDF = async (): Promise<string | null> => {
    if (!vendorProfile) return null;
    const html = generateInvoiceHTML(invoice, vendorProfile, lead);
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
      const filename = `Invoice-${invoice.invoiceNumber}.pdf`;
      await savePDFToDevice(uri, filename);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (invoice.status === "draft") {
        await updateInvoiceStatus(invoice.id, "sent");
      }
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
        `Hi ${lead.name}, please find your Tax Invoice ${invoice.invoiceNumber} from ${vendorProfile?.businessName || "us"}.`
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
      const message = `Hi ${lead.name}, please find your Tax Invoice ${invoice.invoiceNumber} from ${vendorProfile?.businessName || "us"}.`;
      await shareViaWhatsApp(uri, lead.whatsappNumber, message);
      if (invoice.status === "draft") {
        await updateInvoiceStatus(invoice.id, "sent");
      }
    } catch {
      Alert.alert("Error", "Could not open WhatsApp.");
    }
    setSharing(false);
  };

  const handleStatusChange = async (status: InvoiceStatus) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateInvoiceStatus(invoice.id, status);
    setStatusMenuVisible(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader
        showBack
        onBack={() => router.back()}
        title="Tax Invoice"
        subtitle={invoice.invoiceNumber}
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 160) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.pdfDoc, { backgroundColor: colors.card }]}>
          <LinearGradient colors={["#4F46E5", "#6D28D9"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.docAccent} />

          {/* Title + Status */}
          <View style={styles.docTitleRow}>
            <Text style={[styles.docTaxTitle, { color: colors.primary }]}>TAX INVOICE</Text>
            <TouchableOpacity
              style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}
              onPress={() => setStatusMenuVisible(true)}
              activeOpacity={0.8}
            >
              <View style={[styles.statusDot, { backgroundColor: statusCfg.dot }]} />
              <Text style={[styles.statusText, { color: statusCfg.text }]}>{statusCfg.label}</Text>
              <Icon name="chevron-down" size={11} color={statusCfg.text} />
            </TouchableOpacity>
          </View>

          {/* Vendor Header */}
          <View style={styles.docHeader}>
            <View style={{ flex: 1 }}>
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
              {vendorProfile?.gstNumber && (
                <View style={[styles.gstinBadge, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[styles.gstinText, { color: colors.primary }]}>GSTIN: {vendorProfile.gstNumber}</Text>
                </View>
              )}
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <LinearGradient colors={["#4F46E5", "#6D28D9"]} style={styles.invNumberBadge}>
                <Text style={styles.invNumberText}>{invoice.invoiceNumber}</Text>
              </LinearGradient>
              <Text style={[styles.docDate, { color: colors.mutedForeground }]}>{invoiceDate}</Text>
              {invoice.dueDate && (
                <Text style={[styles.docDate, { color: colors.mutedForeground }]}>
                  Due: {new Date(invoice.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </Text>
              )}
            </View>
          </View>

          <View style={[styles.docDivider, { backgroundColor: colors.border }]} />

          {/* Bill To */}
          <View style={styles.billToSection}>
            <View>
              <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Bill To</Text>
              <Text style={[styles.metaValue, { color: colors.foreground }]}>{lead.name}</Text>
              <Text style={[styles.metaPhone, { color: colors.mutedForeground }]}>{lead.whatsappNumber}</Text>
              {invoice.buyerGstin && (
                <View style={[styles.gstinBadge, { backgroundColor: colors.muted, marginTop: 4 }]}>
                  <Text style={[styles.gstinText, { color: colors.foreground }]}>GSTIN: {invoice.buyerGstin}</Text>
                </View>
              )}
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Place of Supply</Text>
              <Text style={[styles.metaSmall, { color: colors.foreground }]}>
                {selectedState ? `${selectedState.code} - ${selectedState.name}` : invoice.placeOfSupply}
              </Text>
              <View style={[styles.taxTypeBadge, { backgroundColor: isCgstSgst ? "#D1FAE5" : "#EEF2FF" }]}>
                <Text style={[styles.taxTypeText, { color: isCgstSgst ? "#065F46" : "#4F46E5" }]}>
                  {isCgstSgst ? "CGST + SGST" : "IGST"}
                </Text>
              </View>
            </View>
          </View>

          {/* Items Table */}
          <View style={[styles.itemsTable, { borderColor: colors.border }]}>
            <LinearGradient colors={["#4F46E5", "#6D28D9"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.tableHead}>
              <Text style={[styles.th, { flex: 3 }]}>Item</Text>
              <Text style={[styles.th, { flex: 1.5, textAlign: "center" }]}>HSN</Text>
              <Text style={[styles.th, { flex: 1.5, textAlign: "center" }]}>Qty</Text>
              <Text style={[styles.th, { flex: 2, textAlign: "right" }]}>Rate</Text>
              <Text style={[styles.th, { flex: 2, textAlign: "right" }]}>Amount</Text>
            </LinearGradient>
            {invoice.items.map((item, idx) => (
              <View key={item.id} style={[styles.tableRow, { backgroundColor: idx % 2 === 0 ? colors.card : colors.surfaceElevated, borderBottomColor: colors.border }]}>
                <Text style={[styles.td, { flex: 3, color: colors.foreground }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.td, { flex: 1.5, color: colors.mutedForeground, textAlign: "center" }]}>{item.hsnCode || "-"}</Text>
                <Text style={[styles.td, { flex: 1.5, color: colors.foreground, textAlign: "center" }]}>{item.quantity} {item.unit}</Text>
                <Text style={[styles.td, { flex: 2, color: colors.foreground, textAlign: "right" }]}>₹{item.rate.toLocaleString("en-IN")}</Text>
                <Text style={[styles.td, { flex: 2, color: colors.foreground, textAlign: "right", fontFamily: "Inter_600SemiBold" }]}>
                  ₹{(item.quantity * item.rate).toLocaleString("en-IN")}
                </Text>
              </View>
            ))}
          </View>

          {/* Tax Breakdown */}
          {invoice.tax?.enabled && taxAmount > 0 && (
            <View style={[styles.taxBreakdown, { borderColor: colors.border }]}>
              <Text style={[styles.taxBreakdownTitle, { color: colors.mutedForeground }]}>Tax Summary</Text>
              <View style={styles.taxRow}>
                <Text style={[styles.taxCol, { color: colors.mutedForeground }]}>Tax Rate</Text>
                <Text style={[styles.taxCol, { color: colors.mutedForeground }]}>Taxable Amt</Text>
                {isCgstSgst ? (
                  <>
                    <Text style={[styles.taxCol, { color: colors.mutedForeground }]}>CGST {halfRate}%</Text>
                    <Text style={[styles.taxCol, { color: colors.mutedForeground }]}>SGST {halfRate}%</Text>
                  </>
                ) : (
                  <Text style={[styles.taxCol, { color: colors.mutedForeground }]}>IGST {taxRate}%</Text>
                )}
              </View>
              <View style={[styles.taxRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.taxCol, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{taxRate}%</Text>
                <Text style={[styles.taxCol, { color: colors.foreground }]}>₹{afterDiscount.toLocaleString("en-IN")}</Text>
                {isCgstSgst ? (
                  <>
                    <Text style={[styles.taxCol, { color: colors.foreground }]}>₹{(taxAmount / 2).toLocaleString("en-IN")}</Text>
                    <Text style={[styles.taxCol, { color: colors.foreground }]}>₹{(taxAmount / 2).toLocaleString("en-IN")}</Text>
                  </>
                ) : (
                  <Text style={[styles.taxCol, { color: colors.foreground }]}>₹{taxAmount.toLocaleString("en-IN")}</Text>
                )}
              </View>
            </View>
          )}

          {/* Totals */}
          <View style={styles.totalSection}>
            <View style={styles.summaryLines}>
              <SummaryRow label="Subtotal" value={`₹${subtotal.toLocaleString("en-IN")}`} colors={colors} />
              {invoice.discount?.enabled && discountAmount > 0 && (
                <SummaryRow label="Discount" value={`–₹${discountAmount.toLocaleString("en-IN")}`} valueColor={colors.destructive} colors={colors} />
              )}
              {invoice.tax?.enabled && taxAmount > 0 && (
                isCgstSgst ? (
                  <>
                    <SummaryRow label={`CGST (${halfRate}%)`} value={`+₹${(taxAmount / 2).toLocaleString("en-IN")}`} colors={colors} />
                    <SummaryRow label={`SGST (${halfRate}%)`} value={`+₹${(taxAmount / 2).toLocaleString("en-IN")}`} colors={colors} />
                  </>
                ) : (
                  <SummaryRow label={`IGST (${taxRate}%)`} value={`+₹${taxAmount.toLocaleString("en-IN")}`} colors={colors} />
                )
              )}
            </View>
            <LinearGradient colors={["#4F46E5", "#6D28D9"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.totalBox}>
              <Text style={styles.totalLabel}>Grand Total</Text>
              <Text style={styles.totalAmount}>₹{grandTotal.toLocaleString("en-IN")}</Text>
            </LinearGradient>
          </View>

          {invoice.notes ? (
            <View style={[styles.notesBox, { backgroundColor: colors.muted }]}>
              <Text style={[styles.notesLabel, { color: colors.mutedForeground }]}>Notes</Text>
              <Text style={[styles.notesText, { color: colors.foreground }]}>{invoice.notes}</Text>
            </View>
          ) : null}

          <View style={styles.docFooter}>
            <Text style={[styles.footerText, { color: colors.mutedForeground }]}>Generated by VendorDesk.AI</Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.actionBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 8) }]}>
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

      <Modal visible={statusMenuVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.statusOverlay} activeOpacity={1} onPress={() => setStatusMenuVisible(false)}>
          <View style={[styles.statusMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statusMenuTitle, { color: colors.mutedForeground }]}>Update Status</Text>
            {(["draft", "sent", "paid"] as InvoiceStatus[]).map((s) => {
              const cfg = STATUS_CONFIG[s];
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.statusMenuItem, { backgroundColor: invoice.status === s ? colors.primaryLight : "transparent" }]}
                  onPress={() => handleStatusChange(s)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.statusDot, { backgroundColor: cfg.dot }]} />
                  <Text style={[styles.statusMenuText, { color: invoice.status === s ? colors.primary : colors.foreground }]}>{cfg.label}</Text>
                  {invoice.status === s && <Icon name="check" size={15} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function SummaryRow({ label, value, valueColor, colors }: {
  label: string;
  value: string;
  valueColor?: string;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: valueColor || colors.foreground }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  pdfDoc: { borderRadius: 16, overflow: "hidden", elevation: 3, boxShadow: "0px 4px 12px rgba(79, 70, 229, 0.1)", marginBottom: 16 },
  docAccent: { height: 6 },
  docTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  docTaxTitle: { fontSize: 18, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  docHeader: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, gap: 12 },
  docBusinessName: { fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  docContact: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  docAddress: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 17, marginTop: 2 },
  gstinBadge: { alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 },
  gstinText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  invNumberBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  invNumberText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff" },
  docDate: { fontSize: 12, fontFamily: "Inter_400Regular" },
  docDivider: { height: 1, marginHorizontal: 16 },
  billToSection: { flexDirection: "row", justifyContent: "space-between", padding: 16 },
  metaLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  metaValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  metaPhone: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  metaSmall: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "right", maxWidth: 150 },
  taxTypeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  taxTypeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  itemsTable: { marginHorizontal: 16, borderRadius: 12, overflow: "hidden", borderWidth: 1, marginBottom: 12 },
  tableHead: { flexDirection: "row", paddingHorizontal: 10, paddingVertical: 10 },
  th: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" },
  tableRow: { flexDirection: "row", paddingHorizontal: 10, paddingVertical: 11, borderBottomWidth: 1 },
  td: { fontSize: 12, fontFamily: "Inter_400Regular", paddingHorizontal: 2 },
  taxBreakdown: { marginHorizontal: 16, borderRadius: 12, borderWidth: 1, marginBottom: 12, overflow: "hidden" },
  taxBreakdownTitle: { fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, padding: 10 },
  taxRow: { flexDirection: "row", paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: 1 },
  taxCol: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
  totalSection: { paddingHorizontal: 16, marginBottom: 16, gap: 10 },
  summaryLines: { gap: 6 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  summaryValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  totalBox: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderRadius: 14, paddingHorizontal: 18, paddingVertical: 16 },
  totalLabel: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  totalAmount: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#fff" },
  notesBox: { marginHorizontal: 16, borderRadius: 12, padding: 16, marginBottom: 16, gap: 6 },
  notesLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6 },
  notesText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  docFooter: { alignItems: "center", paddingVertical: 14 },
  footerText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  actionBar: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, gap: 10 },
  downloadBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 13, borderWidth: 1.5 },
  downloadBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  whatsappBtnWrap: {},
  statusOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" },
  statusMenu: { borderRadius: 16, borderWidth: 1, padding: 8, width: 220, gap: 4 },
  statusMenuTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, paddingHorizontal: 10, paddingVertical: 6 },
  statusMenuItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 12, borderRadius: 10 },
  statusMenuText: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
});
