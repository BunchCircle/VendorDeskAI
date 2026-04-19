import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { GradientButton } from "@/components/GradientButton";
import { Icon } from "@/components/Icon";
import { AppHeader } from "@/components/AppHeader";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { generateId, Quotation, QuotationItem } from "@/services/storage";

type DiscountType = "percent" | "flat";

export default function QuotationPreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { leads, vendorProfile, getQuotationForLead, saveQuotation, updateLead } = useApp();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const lead = leads.find((l) => l.id === id);
  const existingQuotation = lead ? getQuotationForLead(lead.id) : undefined;

  const [items, setItems] = useState<QuotationItem[]>(existingQuotation?.items || []);
  const [notes, setNotes] = useState(existingQuotation?.notes || "");
  const [editingItem, setEditingItem] = useState<QuotationItem | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);

  const [discountEnabled, setDiscountEnabled] = useState(existingQuotation?.discount?.enabled ?? false);
  const [discountType, setDiscountType] = useState<DiscountType>(existingQuotation?.discount?.type ?? "percent");
  const [discountValue, setDiscountValue] = useState(existingQuotation?.discount?.value?.toString() ?? "");

  const [taxEnabled, setTaxEnabled] = useState(existingQuotation?.tax?.enabled ?? false);
  const [taxLabel, setTaxLabel] = useState(existingQuotation?.tax?.label ?? "GST");
  const [taxRate, setTaxRate] = useState(existingQuotation?.tax?.rate?.toString() ?? "");

  useEffect(() => {
    if (existingQuotation) {
      setItems(existingQuotation.items);
      setNotes(existingQuotation.notes || "");
      if (existingQuotation.discount) {
        setDiscountEnabled(existingQuotation.discount.enabled);
        setDiscountType(existingQuotation.discount.type);
        setDiscountValue(existingQuotation.discount.value.toString());
      }
      if (existingQuotation.tax) {
        setTaxEnabled(existingQuotation.tax.enabled);
        setTaxLabel(existingQuotation.tax.label);
        setTaxRate(existingQuotation.tax.rate.toString());
      }
    }
  }, [existingQuotation]);

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.rate, 0);

  const discountAmount = (() => {
    if (!discountEnabled) return 0;
    const v = parseFloat(discountValue) || 0;
    if (discountType === "percent") return (subtotal * v) / 100;
    return Math.min(v, subtotal);
  })();

  const afterDiscount = subtotal - discountAmount;

  const taxAmount = (() => {
    if (!taxEnabled) return 0;
    const r = parseFloat(taxRate) || 0;
    return (afterDiscount * r) / 100;
  })();

  const grandTotal = afterDiscount + taxAmount;

  const deriveDefaultTaxRate = (currentItems: QuotationItem[]): string => {
    if (currentItems.length === 0) return "";
    const allHaveRate = currentItems.every((item) => item.taxRate !== undefined);
    if (!allHaveRate) return "";
    const rates = currentItems.map((item) => item.taxRate as number);
    const allSame = rates.every((r) => r === rates[0]);
    return allSame ? rates[0].toString() : "";
  };

  const handleSaveItem = (item: QuotationItem) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === item.id);
      let next: QuotationItem[];
      if (idx >= 0) {
        next = [...prev];
        next[idx] = item;
      } else {
        next = [...prev, item];
      }
      if (taxEnabled) {
        setTaxRate(deriveDefaultTaxRate(next));
      }
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleDeleteItem = (itemId: string) => {
    const doDelete = () => {
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    };
    if (Platform.OS === "web") {
      if ((window as any).confirm("Remove this item from the quotation?")) doDelete();
    } else {
      Alert.alert("Remove Item", "Remove this item from the quotation?", [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  const buildUpdatedQuotation = (): Quotation => ({
    ...existingQuotation!,
    items,
    notes,
    discount: {
      enabled: discountEnabled,
      type: discountType,
      value: parseFloat(discountValue) || 0,
    },
    tax: {
      enabled: taxEnabled,
      label: taxLabel,
      rate: parseFloat(taxRate) || 0,
    },
  });

  const handleCreatePDF = async () => {
    if (!lead || !existingQuotation) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await saveQuotation(buildUpdatedQuotation());
    await updateLead({ ...lead, status: "Quote Created" });
    router.push(`/lead/${lead.id}/pdf`);
  };

  if (!lead || !existingQuotation) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: colors.mutedForeground }}>Quotation not found</Text>
      </View>
    );
  }

  const date = new Date(existingQuotation.createdAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader
        showBack
        onBack={() => router.back()}
        title="Quotation Preview"
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 100) },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.quoteHeader, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <LinearGradient
            colors={["#4F46E5", "#6D28D9"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.quoteAccent}
          />
          <View style={styles.quoteHeaderInner}>
            <Text style={[styles.businessName, { color: colors.primary }]}>
              {vendorProfile?.businessName || "Your Business"}
            </Text>
            <Text style={[styles.quoteFor, { color: colors.mutedForeground }]}>
              For: {lead.name}
            </Text>
            <View style={styles.quoteMetaRow}>
              <Text style={[styles.quoteMeta, { color: colors.mutedForeground }]}>{date}</Text>
              <View style={[styles.quoteNumberBadge, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.quoteNumberText, { color: colors.primary }]}>
                  {existingQuotation.quoteNumber}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.itemsSection, { borderColor: colors.border }]}>
          <LinearGradient colors={["#4F46E5", "#6D28D9"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.tableHeader}>
            <Text style={[styles.colItem, styles.tableHeaderText]}>Item</Text>
            <Text style={[styles.colQty, styles.tableHeaderText, { textAlign: "center" }]}>Qty</Text>
            <Text style={[styles.colRate, styles.tableHeaderText, { textAlign: "right" }]}>Rate</Text>
            <Text style={[styles.colTotal, styles.tableHeaderText, { textAlign: "right" }]}>Total</Text>
            <View style={{ width: 56 }} />
          </LinearGradient>

          {items.map((item, idx) => (
            <View
              key={item.id}
              style={[
                styles.itemRow,
                {
                  backgroundColor: idx % 2 === 0 ? colors.card : colors.surfaceElevated,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <View style={styles.colItem}>
                <Text style={[styles.itemText, { color: colors.foreground }]} numberOfLines={1}>
                  {item.name}
                </Text>
                {!!item.hsnCode && (
                  <Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
                    HSN: {item.hsnCode}
                  </Text>
                )}
              </View>
              <Text style={[styles.colQty, styles.itemText, { color: colors.foreground, textAlign: "center" }]}>
                {item.quantity} {item.unit}
              </Text>
              <Text style={[styles.colRate, styles.itemText, { color: colors.foreground, textAlign: "right" }]}>
                ₹{item.rate.toLocaleString("en-IN")}
              </Text>
              <Text style={[styles.colTotal, styles.itemText, { color: colors.foreground, textAlign: "right", fontFamily: "Inter_600SemiBold" }]}>
                ₹{(item.quantity * item.rate).toLocaleString("en-IN")}
              </Text>
              <View style={styles.rowActions}>
                <TouchableOpacity
                  onPress={() => { setEditingItem(item); setEditModalVisible(true); }}
                  activeOpacity={0.7}
                >
                  <Icon name="edit-2" size={14} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteItem(item.id)} activeOpacity={0.7}>
                  <Icon name="trash-2" size={14} color={colors.destructive} />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          <TouchableOpacity
            style={[styles.addItemRow, { borderColor: colors.border }]}
            onPress={() => setAddModalVisible(true)}
            activeOpacity={0.7}
          >
            <Icon name="plus" size={16} color={colors.primary} />
            <Text style={[styles.addItemText, { color: colors.primary }]}>Add item</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.togglesCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ToggleRow
            label="Discount"
            icon="tag"
            enabled={discountEnabled}
            onToggle={(v) => { setDiscountEnabled(v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            colors={colors}
          />
          {discountEnabled && (
            <View style={styles.toggleDetail}>
              <View style={[styles.typeSwitch, { backgroundColor: colors.muted }]}>
                {(["percent", "flat"] as DiscountType[]).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeBtn, discountType === t && { backgroundColor: colors.card }]}
                    onPress={() => setDiscountType(t)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.typeBtnText, { color: discountType === t ? colors.primary : colors.mutedForeground, fontFamily: discountType === t ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                      {t === "percent" ? "%" : "₹ Flat"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={[styles.toggleInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                value={discountValue}
                onChangeText={setDiscountValue}
                placeholder={discountType === "percent" ? "e.g. 10" : "e.g. 500"}
                placeholderTextColor={colors.mutedForeground}
                keyboardType="decimal-pad"
              />
              {discountAmount > 0 && (
                <Text style={[styles.computedHint, { color: colors.success }]}>
                  = –₹{discountAmount.toLocaleString("en-IN")}
                </Text>
              )}
            </View>
          )}

          <View style={[styles.toggleDivider, { backgroundColor: colors.border }]} />

          <ToggleRow
            label="Tax"
            icon="percent"
            enabled={taxEnabled}
            onToggle={(v) => {
              setTaxEnabled(v);
              if (v) setTaxRate(deriveDefaultTaxRate(items));
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            colors={colors}
          />
          {taxEnabled && (
            <View style={styles.toggleDetail}>
              <View style={styles.taxRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.miniLabel, { color: colors.mutedForeground }]}>Label</Text>
                  <TextInput
                    style={[styles.toggleInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                    value={taxLabel}
                    onChangeText={setTaxLabel}
                    placeholder="GST / IGST / VAT"
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.miniLabel, { color: colors.mutedForeground }]}>Rate (%)</Text>
                  <TextInput
                    style={[styles.toggleInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                    value={taxRate}
                    onChangeText={setTaxRate}
                    placeholder="18"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
              {taxAmount > 0 && (
                <Text style={[styles.computedHint, { color: colors.primary }]}>
                  = +₹{taxAmount.toLocaleString("en-IN")}
                </Text>
              )}
            </View>
          )}
        </View>

        <View style={[styles.totalsSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>Subtotal</Text>
            <Text style={[styles.totalValue, { color: colors.foreground }]}>
              ₹{subtotal.toLocaleString("en-IN")}
            </Text>
          </View>
          {discountEnabled && discountAmount > 0 && (
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>
                Discount {discountType === "percent" ? `(${discountValue}%)` : "(flat)"}
              </Text>
              <Text style={[styles.totalValue, { color: colors.destructive }]}>
                –₹{discountAmount.toLocaleString("en-IN")}
              </Text>
            </View>
          )}
          {taxEnabled && taxAmount > 0 && (
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>
                {taxLabel || "Tax"} ({taxRate}%)
              </Text>
              <Text style={[styles.totalValue, { color: colors.foreground }]}>
                +₹{taxAmount.toLocaleString("en-IN")}
              </Text>
            </View>
          )}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.totalRow}>
            <Text style={[styles.grandTotalLabel, { color: colors.foreground }]}>Total</Text>
            <Text style={[styles.grandTotalValue, { color: colors.primary }]}>
              ₹{grandTotal.toLocaleString("en-IN")}
            </Text>
          </View>
        </View>

        <View style={styles.notesSection}>
          <Text style={[styles.notesLabel, { color: colors.mutedForeground }]}>Notes (optional)</Text>
          <TextInput
            style={[
              styles.notesInput,
              { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
            ]}
            placeholder="Add any special notes or terms..."
            placeholderTextColor={colors.mutedForeground}
            value={notes}
            onChangeText={setNotes}
            multiline
          />
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 8),
          },
        ]}
      >
        <GradientButton
          label="Create PDF"
          onPress={handleCreatePDF}
          iconName="file-text"
          size="lg"
          style={styles.createPdfBtn}
        />
      </View>

      <ItemEditModal
        visible={editModalVisible || addModalVisible}
        item={editModalVisible ? editingItem : null}
        onClose={() => { setEditModalVisible(false); setAddModalVisible(false); setEditingItem(null); }}
        onSave={handleSaveItem}
        colors={colors}
      />
    </View>
  );
}

function ToggleRow({
  label, icon, enabled, onToggle, colors,
}: {
  label: string;
  icon: "tag" | "percent";
  enabled: boolean;
  onToggle: (v: boolean) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleRowLeft}>
        <View style={[styles.toggleIcon, { backgroundColor: enabled ? colors.primaryLight : colors.muted }]}>
          <Icon name={icon} size={15} color={enabled ? colors.primary : colors.mutedForeground} />
        </View>
        <Text style={[styles.toggleLabel, { color: colors.foreground }]}>{label}</Text>
      </View>
      <Switch
        value={enabled}
        onValueChange={onToggle}
        trackColor={{ false: colors.muted, true: colors.primaryLight }}
        thumbColor={enabled ? colors.primary : colors.mutedForeground}
      />
    </View>
  );
}

function ItemEditModal({
  visible, item, onClose, onSave, colors,
}: {
  visible: boolean;
  item: QuotationItem | null;
  onClose: () => void;
  onSave: (item: QuotationItem) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [name, setName] = useState(item?.name || "");
  const [qty, setQty] = useState(item?.quantity?.toString() || "1");
  const [unit, setUnit] = useState(item?.unit || "piece");
  const [rate, setRate] = useState(item?.rate?.toString() || "");

  useEffect(() => {
    setName(item?.name || "");
    setQty(item?.quantity?.toString() || "1");
    setUnit(item?.unit || "piece");
    setRate(item?.rate?.toString() || "");
  }, [item, visible]);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: item?.id || generateId(),
      name: name.trim(),
      quantity: parseFloat(qty) || 1,
      unit: unit.trim() || "piece",
      rate: parseFloat(rate) || 0,
      hsnCode: item?.hsnCode,
      taxRate: item?.taxRate,
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
          <View style={styles.modalHandle} />
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>
            {item ? "Edit Item" : "Add Item"}
          </Text>
          <View style={styles.modalForm}>
            <LabeledInput label="Item Name" value={name} onChangeText={setName} placeholder="e.g. Rice" colors={colors} />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <LabeledInput label="Quantity" value={qty} onChangeText={setQty} placeholder="1" keyboardType="decimal-pad" colors={colors} />
              </View>
              <View style={{ flex: 1 }}>
                <LabeledInput label="Unit" value={unit} onChangeText={setUnit} placeholder="piece" colors={colors} />
              </View>
            </View>
            <LabeledInput label="Rate (₹)" value={rate} onChangeText={setRate} placeholder="0" keyboardType="decimal-pad" colors={colors} />
          </View>
          <View style={styles.modalButtons}>
            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.muted }]} onPress={onClose} activeOpacity={0.7}>
              <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={handleSave} activeOpacity={0.85}>
              <Text style={[styles.modalBtnText, { color: "#fff" }]}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function LabeledInput({ label, value, onChangeText, placeholder, keyboardType, colors }: {
  label: string; value: string; onChangeText: (t: string) => void;
  placeholder: string; keyboardType?: "default" | "decimal-pad";
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.inputWrapper}>
      <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={keyboardType || "default"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },
  quoteHeader: {
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: "hidden",
    boxShadow: "0px 1px 4px rgba(0, 0, 0, 0.04)",
    elevation: 1,
  },
  quoteAccent: { height: 5 },
  quoteHeaderInner: { padding: 16, gap: 4 },
  businessName: { fontSize: 20, fontFamily: "Inter_700Bold" },
  quoteFor: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
  quoteMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  quoteMeta: { fontSize: 13, fontFamily: "Inter_400Regular" },
  quoteNumberBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  quoteNumberText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  itemsSection: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1.5,
    boxShadow: "0px 1px 4px rgba(0, 0, 0, 0.04)",
    elevation: 1,
  },
  tableHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 11 },
  tableHeaderText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#FFFFFF", letterSpacing: 0.3 },
  colItem: { flex: 2.5, paddingHorizontal: 2 },
  colQty: { flex: 1.5, paddingHorizontal: 2 },
  colRate: { flex: 1.5, paddingHorizontal: 2 },
  colTotal: { flex: 1.5, paddingHorizontal: 2 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  itemText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  rowActions: { width: 56, flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  addItemRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14, borderTopWidth: 1 },
  addItemText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  togglesCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    gap: 4,
    boxShadow: "0px 1px 4px rgba(0, 0, 0, 0.04)",
    elevation: 1,
  },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  toggleRowLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  toggleIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  toggleLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  toggleDivider: { height: 1, marginVertical: 8 },
  toggleDetail: { paddingLeft: 44, gap: 10, marginTop: 4, marginBottom: 4 },
  typeSwitch: { flexDirection: "row", borderRadius: 10, padding: 3, alignSelf: "flex-start" },
  typeBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8 },
  typeBtnText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  toggleInput: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  taxRow: { flexDirection: "row", gap: 12 },
  miniLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginBottom: 4, letterSpacing: 0.3, textTransform: "uppercase" },
  computedHint: { fontSize: 13, fontFamily: "Inter_700Bold" },
  totalsSection: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    gap: 10,
    boxShadow: "0px 1px 4px rgba(0, 0, 0, 0.04)",
    elevation: 1,
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  totalValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  divider: { height: 1 },
  grandTotalLabel: { fontSize: 16, fontFamily: "Inter_700Bold" },
  grandTotalValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  notesSection: { gap: 6 },
  notesLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.3, textTransform: "uppercase" },
  notesInput: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    minHeight: 80,
    textAlignVertical: "top",
  },
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  createPdfBtn: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    marginBottom: 4,
  },
  createPdfText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, backgroundColor: "#CBD5E1", borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 20 },
  modalForm: { gap: 14, marginBottom: 20 },
  row: { flexDirection: "row", gap: 12 },
  inputWrapper: { gap: 6 },
  inputLabel: { fontSize: 12, fontFamily: "Inter_500Medium", letterSpacing: 0.3, textTransform: "uppercase" },
  input: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, fontFamily: "Inter_400Regular" },
  modalButtons: { flexDirection: "row", gap: 12 },
  modalBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  modalBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
