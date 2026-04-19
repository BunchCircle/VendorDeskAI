import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
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
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";
import { LinearGradient } from "expo-linear-gradient";
import { Icon } from "@/components/Icon";
import { AppHeader } from "@/components/AppHeader";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { Invoice, InvoiceStatus } from "@/services/storage";

// ─── Types ────────────────────────────────────────────────────────────────────

type DatePreset = "today" | "yesterday" | "7days" | "30days" | "custom";
type InvoiceFilter = "all" | InvoiceStatus;

interface DateRange {
  from: Date | null;
  to: Date | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DATE_PRESETS: { label: string; value: DatePreset }[] = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 Days", value: "7days" },
  { label: "Last 30 Days", value: "30days" },
  { label: "Custom", value: "custom" },
];

const INVOICE_FILTERS: { label: string; value: InvoiceFilter }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Paid", value: "paid" },
];

const STATUS_CONFIG: Record<
  InvoiceStatus,
  { bg: string; text: string; dot: string; label: string }
> = {
  draft: { bg: "#FEF3C7", text: "#92400E", dot: "#D97706", label: "Draft" },
  sent: { bg: "#DBEAFE", text: "#1E40AF", dot: "#2563EB", label: "Sent" },
  paid: { bg: "#D1FAE5", text: "#065F46", dot: "#059669", label: "Paid" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function getPresetRange(preset: DatePreset): DateRange {
  const now = new Date();
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "7days": {
      const f = new Date(now);
      f.setDate(f.getDate() - 6);
      return { from: startOfDay(f), to: endOfDay(now) };
    }
    case "30days": {
      const f = new Date(now);
      f.setDate(f.getDate() - 29);
      return { from: startOfDay(f), to: endOfDay(now) };
    }
    default:
      return { from: null, to: null };
  }
}

function parseDateInput(str: string): Date | null {
  const parts = str.trim().split("/");
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts.map(Number);
  if (!dd || !mm || !yyyy || yyyy < 2000) return null;
  const d = new Date(yyyy, mm - 1, dd);
  if (isNaN(d.getTime())) return null;
  return d;
}

function formatDateInput(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function computeTotal(invoice: Invoice): number {
  const subtotal = invoice.items.reduce(
    (sum, item) => sum + item.quantity * item.rate,
    0
  );
  const d = invoice.discount;
  const discountAmount = d?.enabled
    ? d.type === "percent"
      ? (subtotal * d.value) / 100
      : Math.min(d.value, subtotal)
    : 0;
  const afterDiscount = subtotal - discountAmount;
  const taxRate = invoice.tax?.enabled ? (invoice.tax.rate ?? 0) : 0;
  return afterDiscount + (afterDiscount * taxRate) / 100;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function inRange(dateStr: string, range: DateRange): boolean {
  if (!range.from && !range.to) return true;
  const d = new Date(dateStr).getTime();
  if (range.from && d < range.from.getTime()) return false;
  if (range.to && d > range.to.getTime()) return false;
  return true;
}

function buildXlsx(
  invoices: Invoice[],
  leads: { id: string; name: string }[],
  quotationCount: number,
  leadCount: number,
  productCount: number,
  range: DateRange,
  preset: DatePreset
): string {
  const leadMap = Object.fromEntries(leads.map((l) => [l.id, l.name]));
  const periodLabel =
    preset === "custom"
      ? `${range.from ? formatDateInput(range.from) : "All"} – ${range.to ? formatDateInput(range.to) : "All"}`
      : DATE_PRESETS.find((p) => p.value === preset)?.label ?? "All Time";

  const summaryData = [
    ["Metric", "Value"],
    ["Period", periodLabel],
    ["Total Leads", leadCount],
    ["Total Quotations", quotationCount],
    ["Total Invoices", invoices.length],
    ["Total Products", productCount],
    ["Total Revenue (INR)", parseFloat(invoices.reduce((s, inv) => s + computeTotal(inv), 0).toFixed(2))],
    ["Paid (INR)", parseFloat(invoices.filter((i) => i.status === "paid").reduce((s, inv) => s + computeTotal(inv), 0).toFixed(2))],
    ["Outstanding (INR)", parseFloat(invoices.filter((i) => i.status !== "paid").reduce((s, inv) => s + computeTotal(inv), 0).toFixed(2))],
  ];

  const invoiceData = [
    ["Invoice No", "Lead", "Invoice Date", "Due Date", "Status", "Total (INR)"],
    ...invoices.map((inv) => [
      inv.invoiceNumber,
      leadMap[inv.leadId] ?? "Unknown",
      formatDate(inv.invoiceDate),
      inv.dueDate ? formatDate(inv.dueDate) : "",
      inv.status,
      parseFloat(computeTotal(inv).toFixed(2)),
    ]),
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), "Summary");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(invoiceData), "Invoices");

  return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  iconName,
  gradientColors,
  isCurrency = false,
}: {
  label: string;
  value: number;
  iconName: Parameters<typeof Icon>[0]["name"];
  gradientColors: [string, string];
  isCurrency?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[metricStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <LinearGradient colors={gradientColors} style={metricStyles.iconWrap}>
        <Icon name={iconName} size={15} color="#fff" />
      </LinearGradient>
      <Text style={[metricStyles.value, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit>
        {isCurrency ? formatCurrency(value) : String(value)}
      </Text>
      <Text style={[metricStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const metricStyles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: "30%",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  label: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    lineHeight: 13,
  },
});

function InvoiceCard({
  invoice,
  leadName,
  onPress,
  colors,
}: {
  invoice: Invoice;
  leadName: string;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const cfg = STATUS_CONFIG[invoice.status];
  const total = computeTotal(invoice);
  return (
    <TouchableOpacity
      style={[cardStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={cardStyles.row}>
        <LinearGradient colors={["#4F46E5", "#6D28D9"]} style={cardStyles.iconWrap}>
          <Icon name="file-text" size={16} color="#fff" />
        </LinearGradient>
        <View style={cardStyles.info}>
          <Text style={[cardStyles.invoiceNo, { color: colors.foreground }]}>{invoice.invoiceNumber}</Text>
          <Text style={[cardStyles.leadName, { color: colors.mutedForeground }]} numberOfLines={1}>
            {leadName}
          </Text>
        </View>
        <View style={cardStyles.right}>
          <Text style={[cardStyles.amount, { color: colors.foreground }]}>{formatCurrency(total)}</Text>
          <View style={[cardStyles.badge, { backgroundColor: cfg.bg }]}>
            <View style={[cardStyles.dot, { backgroundColor: cfg.dot }]} />
            <Text style={[cardStyles.badgeText, { color: cfg.text }]}>{cfg.label}</Text>
          </View>
        </View>
      </View>
      <View style={[cardStyles.footer, { borderTopColor: colors.border }]}>
        <View style={cardStyles.footerItem}>
          <Icon name="calendar" size={12} color={colors.mutedForeground} />
          <Text style={[cardStyles.footerText, { color: colors.mutedForeground }]}>
            {formatDate(invoice.invoiceDate)}
          </Text>
        </View>
        {invoice.dueDate && (
          <View style={cardStyles.footerItem}>
            <Icon name="clock" size={12} color={colors.mutedForeground} />
            <Text style={[cardStyles.footerText, { color: colors.mutedForeground }]}>
              Due {formatDate(invoice.dueDate)}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const cardStyles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, marginBottom: 10, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  info: { flex: 1, gap: 2 },
  invoiceNo: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  leadName: { fontSize: 12, fontFamily: "Inter_400Regular" },
  right: { alignItems: "flex-end", gap: 6 },
  amount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  footer: { flexDirection: "row", gap: 16, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  footerItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  footerText: { fontSize: 11, fontFamily: "Inter_400Regular" },
});

function CustomRangeModal({
  visible,
  onApply,
  onCancel,
  initialFrom,
  initialTo,
  colors,
  insets,
}: {
  visible: boolean;
  onApply: (from: Date | null, to: Date | null) => void;
  onCancel: () => void;
  initialFrom: Date | null;
  initialTo: Date | null;
  colors: ReturnType<typeof useColors>;
  insets: { bottom: number };
}) {
  const [fromStr, setFromStr] = useState(initialFrom ? formatDateInput(initialFrom) : "");
  const [toStr, setToStr] = useState(initialTo ? formatDateInput(initialTo) : "");
  const [error, setError] = useState("");

  React.useEffect(() => {
    if (visible) {
      setFromStr(initialFrom ? formatDateInput(initialFrom) : "");
      setToStr(initialTo ? formatDateInput(initialTo) : "");
      setError("");
    }
  }, [visible]);

  const handleApply = () => {
    const from = fromStr ? parseDateInput(fromStr) : null;
    const to = toStr ? parseDateInput(toStr) : null;
    if (fromStr && !from) { setError("Invalid start date. Use DD/MM/YYYY."); return; }
    if (toStr && !to) { setError("Invalid end date. Use DD/MM/YYYY."); return; }
    if (from && to && from > to) { setError("Start date must be before end date."); return; }
    onApply(from, to ? endOfDay(to) : null);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={modalStyles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onCancel} activeOpacity={1} />
        <View style={[modalStyles.sheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 20 }]}>
          <View style={modalStyles.handle} />
          <Text style={[modalStyles.title, { color: colors.foreground }]}>Custom Date Range</Text>
          <Text style={[modalStyles.hint, { color: colors.mutedForeground }]}>Enter dates in DD/MM/YYYY format</Text>

          <View style={modalStyles.fields}>
            <View style={modalStyles.field}>
              <Text style={[modalStyles.fieldLabel, { color: colors.mutedForeground }]}>From</Text>
              <TextInput
                style={[modalStyles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
                value={fromStr}
                onChangeText={(t) => { setFromStr(t); setError(""); }}
                placeholder="DD/MM/YYYY"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
                maxLength={10}
              />
            </View>
            <View style={modalStyles.field}>
              <Text style={[modalStyles.fieldLabel, { color: colors.mutedForeground }]}>To</Text>
              <TextInput
                style={[modalStyles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
                value={toStr}
                onChangeText={(t) => { setToStr(t); setError(""); }}
                placeholder="DD/MM/YYYY"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
                maxLength={10}
              />
            </View>
          </View>

          {error ? <Text style={modalStyles.error}>{error}</Text> : null}

          <View style={modalStyles.actions}>
            <TouchableOpacity
              style={[modalStyles.cancelBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
              onPress={onCancel}
            >
              <Text style={[modalStyles.cancelText, { color: colors.foreground }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={modalStyles.applyBtn} onPress={handleApply}>
              <LinearGradient colors={["#4F46E5", "#6D28D9"]} style={modalStyles.applyGrad}>
                <Text style={modalStyles.applyText}>Apply</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, padding: 20, gap: 16 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#ccc", alignSelf: "center", marginBottom: 4 },
  title: { fontSize: 17, fontFamily: "Inter_700Bold" },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: -8 },
  fields: { flexDirection: "row", gap: 12 },
  field: { flex: 1, gap: 6 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  input: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontFamily: "Inter_400Regular" },
  error: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#EF4444" },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 13, alignItems: "center" },
  cancelText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  applyBtn: { flex: 1, borderRadius: 10, overflow: "hidden" },
  applyGrad: { paddingVertical: 13, alignItems: "center" },
  applyText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const { invoices, leads, quotations, products } = useApp();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [preset, setPreset] = useState<DatePreset>("30days");
  const [customRange, setCustomRange] = useState<DateRange>({ from: null, to: null });
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter>("all");

  const dateRange = useMemo<DateRange>(() => {
    if (preset === "custom") return customRange;
    return getPresetRange(preset);
  }, [preset, customRange]);

  const customLabel = useMemo(() => {
    if (preset !== "custom" || (!customRange.from && !customRange.to)) return "Custom";
    const f = customRange.from ? formatDateInput(customRange.from) : "Start";
    const t = customRange.to ? formatDateInput(endOfDay(customRange.to)) : "End";
    return `${f} – ${t}`;
  }, [preset, customRange]);

  const leadNameMap = useMemo(
    () => Object.fromEntries(leads.map((l) => [l.id, l.name])),
    [leads]
  );

  const filteredInvoices = useMemo(() => {
    return [...invoices]
      .filter((inv) => inRange(inv.invoiceDate, dateRange))
      .sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime());
  }, [invoices, dateRange]);

  const filteredLeads = useMemo(
    () => leads.filter((l) => inRange(l.createdAt, dateRange)),
    [leads, dateRange]
  );

  const filteredQuotations = useMemo(
    () => quotations.filter((q) => inRange(q.createdAt, dateRange)),
    [quotations, dateRange]
  );

  const stats = useMemo(() => {
    const totalRevenue = filteredInvoices.reduce((s, inv) => s + computeTotal(inv), 0);
    const paid = filteredInvoices.filter((i) => i.status === "paid").reduce((s, inv) => s + computeTotal(inv), 0);
    const outstanding = filteredInvoices.filter((i) => i.status !== "paid").reduce((s, inv) => s + computeTotal(inv), 0);
    return { totalRevenue, paid, outstanding };
  }, [filteredInvoices]);

  const displayedInvoices = useMemo(
    () =>
      invoiceFilter === "all"
        ? filteredInvoices
        : filteredInvoices.filter((inv) => inv.status === invoiceFilter),
    [filteredInvoices, invoiceFilter]
  );

  const handlePresetPress = (value: DatePreset) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (value === "custom") {
      setShowCustomModal(true);
    } else {
      setPreset(value);
    }
  };

  const handleCustomApply = (from: Date | null, to: Date | null) => {
    setCustomRange({ from, to });
    setPreset("custom");
    setShowCustomModal(false);
  };

  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (filteredInvoices.length === 0 && filteredLeads.length === 0) {
      Alert.alert("Nothing to Export", "No data found for the selected period.");
      return;
    }
    if (exporting) return;
    setExporting(true);
    try {
      const base64 = buildXlsx(
        filteredInvoices,
        leads,
        filteredQuotations.length,
        filteredLeads.length,
        products.length,
        dateRange,
        preset
      );
      const fileName = `dashboard-export-${Date.now()}.xlsx`;
      const fileUri = (FileSystem.cacheDirectory ?? "") + fileName;
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          dialogTitle: "Save or Share Dashboard Export",
          UTI: "com.microsoft.excel.xlsx",
        });
      } else {
        Alert.alert("Sharing unavailable", "Your device does not support file sharing.");
      }
    } catch {
      Alert.alert("Export Failed", "Could not generate the Excel file. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const handleInvoicePress = (invoice: Invoice) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: "/lead/[id]/invoice-pdf",
      params: { id: invoice.leadId, invoiceId: invoice.id },
    });
  };

  const ListHeader = (
    <>
      {/* ── Date filter chips ──────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.presetRow}
      >
        {DATE_PRESETS.map((p) => {
          const active = preset === p.value;
          const label = p.value === "custom" ? customLabel : p.label;
          return (
            <TouchableOpacity
              key={p.value}
              onPress={() => handlePresetPress(p.value)}
              activeOpacity={0.8}
              style={[
                styles.presetChip,
                {
                  backgroundColor: active ? colors.primary : colors.card,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
            >
              {p.value === "custom" && (
                <Icon
                  name="calendar"
                  size={12}
                  color={active ? "#fff" : colors.mutedForeground}
                />
              )}
              <Text style={[styles.presetLabel, { color: active ? "#fff" : colors.foreground }]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Revenue metrics row ────────────────────────── */}
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Revenue</Text>
      <View style={styles.metricsRow}>
        <MetricCard
          label="Total Revenue"
          value={stats.totalRevenue}
          iconName="trending-up"
          gradientColors={["#4F46E5", "#6D28D9"]}
          isCurrency
        />
        <MetricCard
          label="Paid"
          value={stats.paid}
          iconName="check-circle"
          gradientColors={["#059669", "#047857"]}
          isCurrency
        />
        <MetricCard
          label="Outstanding"
          value={stats.outstanding}
          iconName="clock"
          gradientColors={["#D97706", "#B45309"]}
          isCurrency
        />
      </View>

      {/* ── Count metrics ──────────────────────────────── */}
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Activity</Text>
      <View style={styles.metricsRow}>
        <MetricCard
          label="Leads"
          value={filteredLeads.length}
          iconName="users"
          gradientColors={["#0891B2", "#0E7490"]}
        />
        <MetricCard
          label="Quotations"
          value={filteredQuotations.length}
          iconName="file"
          gradientColors={["#7C3AED", "#6D28D9"]}
        />
        <MetricCard
          label="Invoices"
          value={filteredInvoices.length}
          iconName="file-text"
          gradientColors={["#DB2777", "#BE185D"]}
        />
      </View>
      <View style={[styles.metricsRow, { marginBottom: 20 }]}>
        <MetricCard
          label="Products"
          value={products.length}
          iconName="package"
          gradientColors={["#EA580C", "#C2410C"]}
        />
        <MetricCard
          label={filteredInvoices.filter((i) => i.status === "draft").length === 1 ? "Draft" : "Drafts"}
          value={filteredInvoices.filter((i) => i.status === "draft").length}
          iconName="edit-3"
          gradientColors={["#CA8A04", "#A16207"]}
        />
        <MetricCard
          label="Conversion Rate"
          value={
            filteredLeads.length > 0
              ? Math.round((filteredInvoices.length / filteredLeads.length) * 100)
              : 0
          }
          iconName="percent"
          gradientColors={["#16A34A", "#15803D"]}
        />
      </View>

      {/* ── Invoice list header ────────────────────────── */}
      <View style={styles.invoiceHeader}>
        <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>
          Invoices
        </Text>
      </View>

      {/* ── Invoice status filter chips ────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {INVOICE_FILTERS.map((opt) => {
          const active = invoiceFilter === opt.value;
          const count =
            opt.value === "all"
              ? filteredInvoices.length
              : filteredInvoices.filter((i) => i.status === opt.value).length;
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setInvoiceFilter(opt.value);
              }}
              activeOpacity={0.8}
              style={[
                styles.filterChip,
                {
                  backgroundColor: active ? colors.primary : colors.card,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
            >
              {opt.value !== "all" && (
                <View
                  style={[
                    styles.chipDot,
                    {
                      backgroundColor: active
                        ? "#fff"
                        : STATUS_CONFIG[opt.value as InvoiceStatus].dot,
                    },
                  ]}
                />
              )}
              <Text style={[styles.filterLabel, { color: active ? "#fff" : colors.foreground }]}>
                {opt.label}
              </Text>
              <Text
                style={[
                  styles.filterCount,
                  { color: active ? "rgba(255,255,255,0.75)" : colors.mutedForeground },
                ]}
              >
                {count}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {displayedInvoices.length > 0 && (
        <Text style={[styles.rowCount, { color: colors.mutedForeground }]}>
          {displayedInvoices.length} invoice{displayedInvoices.length !== 1 ? "s" : ""}
        </Text>
      )}
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Dashboard"
        rightElement={
          <TouchableOpacity
            onPress={handleExport}
            disabled={exporting}
            style={[styles.exportBtn, { backgroundColor: colors.card, borderColor: colors.border, opacity: exporting ? 0.5 : 1 }]}
            accessibilityLabel="Export dashboard data as Excel"
          >
            <Icon name={exporting ? "refresh-cw" : "download"} size={16} color={colors.primary} />
          </TouchableOpacity>
        }
      />

      <FlatList
        data={displayedInvoices}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 90 }]}
        ListHeaderComponent={ListHeader}
        renderItem={({ item }) => (
          <InvoiceCard
            invoice={item}
            leadName={leadNameMap[item.leadId] ?? "Unknown Lead"}
            onPress={() => handleInvoicePress(item)}
            colors={colors}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <LinearGradient colors={["#4F46E5", "#6D28D9"]} style={styles.emptyIcon}>
              <Icon name="file-text" size={24} color="#fff" />
            </LinearGradient>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Invoices</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              {invoiceFilter === "all"
                ? "No invoices found for this period."
                : `No ${invoiceFilter} invoices in this period.`}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      <CustomRangeModal
        visible={showCustomModal}
        onApply={handleCustomApply}
        onCancel={() => setShowCustomModal(false)}
        initialFrom={customRange.from}
        initialTo={customRange.to}
        colors={colors}
        insets={insets}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  exportBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  list: { paddingHorizontal: 16, paddingTop: 12 },
  presetRow: { flexDirection: "row", gap: 8, marginBottom: 20, paddingRight: 4 },
  presetChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 99,
    borderWidth: 1,
  },
  presetLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 0.3, marginBottom: 10, textTransform: "uppercase" },
  metricsRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  invoiceHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  filterRow: { flexDirection: "row", gap: 8, marginBottom: 12, paddingRight: 4 },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
    borderWidth: 1,
  },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  filterLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  filterCount: { fontSize: 11, fontFamily: "Inter_500Medium" },
  rowCount: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 8, letterSpacing: 0.3 },
  emptyWrap: { alignItems: "center", paddingTop: 40, gap: 10 },
  emptyIcon: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", maxWidth: 240, lineHeight: 20 },
});
