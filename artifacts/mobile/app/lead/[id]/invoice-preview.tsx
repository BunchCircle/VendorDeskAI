import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextInputProps,
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
import {
  generateId,
  generateInvoiceNumber,
  Invoice,
  QuotationItem,
  INDIAN_STATES,
  getVendorStateCode,
  computeTaxSplit,
  computeTaxSplitFromAmount,
  computePerItemTaxData,
} from "@/services/storage";

type DiscountType = "percent" | "flat";

const STATUS_LABELS = { draft: "Draft", sent: "Sent", paid: "Paid" } as const;

export default function InvoicePreviewScreen() {
  const params = useLocalSearchParams<{ id: string; invoiceId?: string }>();
  const { id: leadId, invoiceId } = params;
  const { leads, vendorProfile, invoices, saveInvoice } = useApp();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const lead = leads.find((l) => l.id === leadId);
  const existingInvoice = invoiceId
    ? invoices.find((inv) => inv.id === invoiceId)
    : undefined;

  const [invoiceNumber, setInvoiceNumber] = useState(existingInvoice?.invoiceNumber || "");
  const [invoiceDate, setInvoiceDate] = useState(
    existingInvoice?.invoiceDate || new Date().toISOString().split("T")[0]
  );
  const [dueDate, setDueDate] = useState(existingInvoice?.dueDate || "");
  const [buyerGstin, setBuyerGstin] = useState(existingInvoice?.buyerGstin || "");
  const [placeOfSupply, setPlaceOfSupply] = useState(
    existingInvoice?.placeOfSupply || "29"
  );
  const [items, setItems] = useState<QuotationItem[]>(existingInvoice?.items || []);
  const [notes, setNotes] = useState(existingInvoice?.notes || "");
  const [editingItem, setEditingItem] = useState<QuotationItem | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [statePickerVisible, setStatePickerVisible] = useState(false);
  const [stateSearch, setStateSearch] = useState("");

  const [discountEnabled, setDiscountEnabled] = useState(existingInvoice?.discount?.enabled ?? false);
  const [discountType, setDiscountType] = useState<DiscountType>(existingInvoice?.discount?.type ?? "percent");
  const [discountValue, setDiscountValue] = useState(existingInvoice?.discount?.value?.toString() ?? "");

  const [taxEnabled, setTaxEnabled] = useState(existingInvoice?.tax?.enabled ?? false);
  const [taxRate, setTaxRate] = useState(existingInvoice?.tax?.rate?.toString() ?? "18");

  // Only a brand-new invoice (no invoiceId param) needs a generated number.
  const [isGeneratingNumber, setIsGeneratingNumber] = useState(!invoiceId && !existingInvoice);

  // Per-item GST from catalogue (overrides the manual toggle when items have taxRate)
  const perItemTaxData = useMemo(() => computePerItemTaxData(items), [items]);
  const hasPerItemTaxes = perItemTaxData.slabs.length > 0;

  useEffect(() => {
    // Only generate a new number when this is a brand-new invoice (no invoiceId param).
    // When invoiceId is present we are viewing/editing an existing invoice; the rehydration
    // effect below will populate the number once the context delivers the invoice.
    if (!invoiceId && !existingInvoice) {
      generateInvoiceNumber().then((num) => {
        setInvoiceNumber(num);
        setIsGeneratingNumber(false);
      });
    }
  }, []);

  // Rehydrate form state when existingInvoice becomes available (e.g. convert-to-invoice flow
  // navigates to this screen right after saving so context may update slightly after first render)
  useEffect(() => {
    if (!existingInvoice) return;
    setInvoiceNumber(existingInvoice.invoiceNumber);
    setInvoiceDate(existingInvoice.invoiceDate);
    setDueDate(existingInvoice.dueDate || "");
    setBuyerGstin(existingInvoice.buyerGstin || "");
    setPlaceOfSupply(existingInvoice.placeOfSupply || "29");
    setItems(existingInvoice.items);
    setNotes(existingInvoice.notes || "");
    setDiscountEnabled(existingInvoice.discount?.enabled ?? false);
    setDiscountType(existingInvoice.discount?.type ?? "percent");
    setDiscountValue(existingInvoice.discount?.value?.toString() ?? "");
    setTaxEnabled(existingInvoice.tax?.enabled ?? false);
    setTaxRate(existingInvoice.tax?.rate?.toString() ?? "18");
  }, [existingInvoice?.id]);

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.rate, 0);

  const discountAmount = (() => {
    if (!discountEnabled) return 0;
    const v = parseFloat(discountValue) || 0;
    if (discountType === "percent") return (subtotal * v) / 100;
    return Math.min(v, subtotal);
  })();

  const afterDiscount = subtotal - discountAmount;
  const taxRateNum = parseFloat(taxRate) || 0;
  // When catalogue items have taxRate, use per-item computation; fall back to manual toggle rate
  const taxAmount = hasPerItemTaxes
    ? perItemTaxData.totalTax
    : taxEnabled ? (afterDiscount * taxRateNum) / 100 : 0;
  const grandTotal = afterDiscount + taxAmount;

  const vendorStateCode = getVendorStateCode(vendorProfile?.gstNumber);
  const selectedState = INDIAN_STATES.find((s) => s.code === placeOfSupply);
  const selectedStateName = selectedState ? `${selectedState.code} - ${selectedState.name}` : placeOfSupply;

  const isCgstSgst = vendorStateCode === placeOfSupply;
  const halfRate = taxRateNum / 2;

  const filteredStates = stateSearch.trim()
    ? INDIAN_STATES.filter(
        (s) =>
          s.name.toLowerCase().includes(stateSearch.toLowerCase()) ||
          s.code.includes(stateSearch)
      )
    : INDIAN_STATES;

  const handleSaveItem = (item: QuotationItem) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === item.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = item;
        return next;
      }
      return [...prev, item];
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleDeleteItem = (itemId: string) => {
    const doDelete = () => {
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    };
    Alert.alert("Remove Item", "Remove this item from the invoice?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: doDelete },
    ]);
  };

  const buildInvoice = (): Invoice => {
    const taxSplit = hasPerItemTaxes
      ? computeTaxSplitFromAmount(perItemTaxData.totalTax, vendorStateCode, placeOfSupply)
      : computeTaxSplit(taxRateNum, afterDiscount, vendorStateCode, placeOfSupply);
    return {
      id: existingInvoice?.id || generateId(),
      leadId: leadId!,
      invoiceNumber,
      invoiceDate,
      dueDate: dueDate || undefined,
      items,
      notes: notes || undefined,
      discount: {
        enabled: discountEnabled,
        type: discountType,
        value: parseFloat(discountValue) || 0,
      },
      tax: hasPerItemTaxes
        ? { enabled: true, label: isCgstSgst ? "CGST+SGST" : "IGST", rate: 0 }
        : { enabled: taxEnabled, label: isCgstSgst ? "CGST+SGST" : "IGST", rate: taxRateNum },
      buyerGstin: buyerGstin.trim() || undefined,
      placeOfSupply,
      taxSplit,
      status: existingInvoice?.status || "draft",
      createdAt: existingInvoice?.createdAt || new Date().toISOString(),
    };
  };

  const handleSave = async () => {
    if (!lead) return;
    if (isGeneratingNumber || !invoiceNumber) {
      Alert.alert("Please Wait", "Invoice number is still being generated. Please try again in a moment.");
      return;
    }
    if (items.length === 0) {
      Alert.alert("No Items", "Please add at least one item to the invoice.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const inv = buildInvoice();
    await saveInvoice(inv);
    router.push(`/lead/${leadId}/invoice-pdf?invoiceId=${inv.id}`);
  };

  if (!lead) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: colors.mutedForeground }}>Lead not found</Text>
      </View>
    );
  }

  // When an invoiceId is provided (e.g. just after converting a quotation) but the invoice
  // hasn't yet appeared in the app context, show a brief loading state rather than rendering
  // the form with wrong defaults (taxEnabled = false → incorrect grand total).
  if (invoiceId && !existingInvoice) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.mutedForeground, marginTop: 12, fontSize: 14 }}>Loading invoice…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader
        showBack
        onBack={() => router.back()}
        title={invoiceNumber || "New Invoice"}
        subtitle={`For ${lead.name}`}
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 120) },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Invoice Details Card */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeaderRow}>
            <Icon name="file-text" size={14} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Invoice Details</Text>
          </View>
          <View style={styles.sectionBody}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Invoice No.</Text>
                <View style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 15 }}>
                    {invoiceNumber || "Generating…"}
                  </Text>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Invoice Date</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                  value={invoiceDate}
                  onChangeText={setInvoiceDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
            </View>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Due Date (optional)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                  value={dueDate}
                  onChangeText={setDueDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Buyer GSTIN (optional)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                  value={buyerGstin}
                  onChangeText={setBuyerGstin}
                  placeholder="15-digit GSTIN"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="characters"
                  maxLength={15}
                />
              </View>
            </View>
            <View>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Place of Supply</Text>
              <TouchableOpacity
                style={[styles.input, styles.statePicker, { backgroundColor: colors.muted, borderColor: colors.border }]}
                onPress={() => setStatePickerVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={{ color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 14, flex: 1 }} numberOfLines={1}>
                  {selectedStateName}
                </Text>
                <Icon name="chevron-down" size={15} color={colors.mutedForeground} />
              </TouchableOpacity>
              {vendorProfile?.gstNumber && (
                <Text style={[styles.hint, { color: isCgstSgst ? colors.success : colors.primary }]}>
                  {isCgstSgst ? "✓ Intra-state — CGST + SGST applies" : "↕ Inter-state — IGST applies"}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Items Table */}
        <View style={[styles.section, { borderColor: colors.border }]}>
          <LinearGradient colors={["#4F46E5", "#6D28D9"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.tableHeader}>
            <Text style={[styles.colItem, styles.thText]}>Item</Text>
            <Text style={[styles.colQty, styles.thText, { textAlign: "center" }]}>Qty</Text>
            <Text style={[styles.colRate, styles.thText, { textAlign: "right" }]}>Rate</Text>
            <Text style={[styles.colTotal, styles.thText, { textAlign: "right" }]}>Total</Text>
            <View style={{ width: 56 }} />
          </LinearGradient>

          {items.map((item, idx) => (
            <View
              key={item.id}
              style={[styles.itemRow, {
                backgroundColor: idx % 2 === 0 ? colors.card : colors.surfaceElevated,
                borderBottomColor: colors.border,
              }]}
            >
              <View style={styles.colItem}>
                <Text style={[styles.itemText, { color: colors.foreground }]} numberOfLines={1}>{item.name}</Text>
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
                <TouchableOpacity onPress={() => { setEditingItem(item); setEditModalVisible(true); }} activeOpacity={0.7}>
                  <Icon name="edit-2" size={14} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteItem(item.id)} activeOpacity={0.7}>
                  <Icon name="trash-2" size={14} color={colors.destructive} />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          <TouchableOpacity
            style={[styles.addItemRow, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => setAddModalVisible(true)}
            activeOpacity={0.7}
          >
            <Icon name="plus" size={16} color={colors.primary} />
            <Text style={[styles.addItemText, { color: colors.primary }]}>Add item</Text>
          </TouchableOpacity>
        </View>

        {/* Discount & Tax */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleLeft}>
              <View style={[styles.toggleIcon, { backgroundColor: discountEnabled ? colors.primaryLight : colors.muted }]}>
                <Icon name="tag" size={15} color={discountEnabled ? colors.primary : colors.mutedForeground} />
              </View>
              <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Discount</Text>
            </View>
            <Switch
              value={discountEnabled}
              onValueChange={(v) => { setDiscountEnabled(v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              trackColor={{ false: colors.muted, true: colors.primaryLight }}
              thumbColor={discountEnabled ? colors.primary : colors.mutedForeground}
            />
          </View>
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
                    <Text style={[styles.typeBtnText, { color: discountType === t ? colors.primary : colors.mutedForeground }]}>
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
            </View>
          )}

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {hasPerItemTaxes ? (
            /* ── Auto-computed GST from catalogue taxRate ── */
            <>
              <View style={styles.toggleRow}>
                <View style={styles.toggleLeft}>
                  <View style={[styles.toggleIcon, { backgroundColor: colors.primaryLight }]}>
                    <Icon name="percent" size={15} color={colors.primary} />
                  </View>
                  <View>
                    <Text style={[styles.toggleLabel, { color: colors.foreground }]}>GST</Text>
                    <Text style={[styles.miniLabel, { color: colors.mutedForeground, marginTop: 1 }]}>
                      Auto from catalogue
                    </Text>
                  </View>
                </View>
                <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
                  ₹{taxAmount.toLocaleString("en-IN")}
                </Text>
              </View>
              {perItemTaxData.slabs.map((slab) => {
                const half = slab.rate / 2;
                return (
                  <View key={slab.rate} style={[styles.toggleDetail, { paddingTop: 4 }]}>
                    <View style={[styles.row, { justifyContent: "space-between" }]}>
                      <Text style={[styles.miniLabel, { color: colors.mutedForeground }]}>
                        {slab.rate}% slab — taxable ₹{slab.taxableAmt.toLocaleString("en-IN")}
                      </Text>
                    </View>
                    {isCgstSgst ? (
                      <View style={[styles.row, { justifyContent: "space-between", marginTop: 2 }]}>
                        <Text style={[styles.miniLabel, { color: colors.mutedForeground }]}>
                          CGST ({half}%) + SGST ({half}%)
                        </Text>
                        <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 13 }}>
                          ₹{(slab.taxAmt / 2).toLocaleString("en-IN")} each
                        </Text>
                      </View>
                    ) : (
                      <View style={[styles.row, { justifyContent: "space-between", marginTop: 2 }]}>
                        <Text style={[styles.miniLabel, { color: colors.mutedForeground }]}>
                          IGST ({slab.rate}%)
                        </Text>
                        <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 13 }}>
                          ₹{slab.taxAmt.toLocaleString("en-IN")}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </>
          ) : (
            /* ── Manual GST toggle (fallback when items have no taxRate) ── */
            <>
              <View style={styles.toggleRow}>
                <View style={styles.toggleLeft}>
                  <View style={[styles.toggleIcon, { backgroundColor: taxEnabled ? colors.primaryLight : colors.muted }]}>
                    <Icon name="percent" size={15} color={taxEnabled ? colors.primary : colors.mutedForeground} />
                  </View>
                  <Text style={[styles.toggleLabel, { color: colors.foreground }]}>GST</Text>
                </View>
                <Switch
                  value={taxEnabled}
                  onValueChange={(v) => { setTaxEnabled(v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  trackColor={{ false: colors.muted, true: colors.primaryLight }}
                  thumbColor={taxEnabled ? colors.primary : colors.mutedForeground}
                />
              </View>
              {taxEnabled && (
                <View style={styles.toggleDetail}>
                  <View style={styles.row}>
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
                    {taxAmount > 0 && (
                      <View style={{ flex: 1, justifyContent: "flex-end", paddingBottom: 4 }}>
                        {isCgstSgst ? (
                          <View>
                            <Text style={[styles.miniLabel, { color: colors.mutedForeground }]}>CGST ({halfRate}%) + SGST ({halfRate}%)</Text>
                            <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
                              ₹{(taxAmount / 2).toLocaleString("en-IN")} each
                            </Text>
                          </View>
                        ) : (
                          <View>
                            <Text style={[styles.miniLabel, { color: colors.mutedForeground }]}>IGST ({taxRateNum}%)</Text>
                            <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
                              ₹{taxAmount.toLocaleString("en-IN")}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              )}
            </>
          )}
        </View>

        {/* Totals */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>Subtotal</Text>
            <Text style={[styles.totalValue, { color: colors.foreground }]}>₹{subtotal.toLocaleString("en-IN")}</Text>
          </View>
          {discountEnabled && discountAmount > 0 && (
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>Discount</Text>
              <Text style={[styles.totalValue, { color: colors.destructive }]}>–₹{discountAmount.toLocaleString("en-IN")}</Text>
            </View>
          )}
          {taxAmount > 0 && (
            hasPerItemTaxes ? (
              isCgstSgst ? (
                <>
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>CGST</Text>
                    <Text style={[styles.totalValue, { color: colors.foreground }]}>+₹{(taxAmount / 2).toLocaleString("en-IN")}</Text>
                  </View>
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>SGST</Text>
                    <Text style={[styles.totalValue, { color: colors.foreground }]}>+₹{(taxAmount / 2).toLocaleString("en-IN")}</Text>
                  </View>
                </>
              ) : (
                <View style={styles.totalRow}>
                  <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>IGST</Text>
                  <Text style={[styles.totalValue, { color: colors.foreground }]}>+₹{taxAmount.toLocaleString("en-IN")}</Text>
                </View>
              )
            ) : taxEnabled ? (
              isCgstSgst ? (
                <>
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>CGST ({halfRate}%)</Text>
                    <Text style={[styles.totalValue, { color: colors.foreground }]}>+₹{(taxAmount / 2).toLocaleString("en-IN")}</Text>
                  </View>
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>SGST ({halfRate}%)</Text>
                    <Text style={[styles.totalValue, { color: colors.foreground }]}>+₹{(taxAmount / 2).toLocaleString("en-IN")}</Text>
                  </View>
                </>
              ) : (
                <View style={styles.totalRow}>
                  <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>IGST ({taxRateNum}%)</Text>
                  <Text style={[styles.totalValue, { color: colors.foreground }]}>+₹{taxAmount.toLocaleString("en-IN")}</Text>
                </View>
              )
            ) : null
          )}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.totalRow}>
            <Text style={[styles.grandTotalLabel, { color: colors.foreground }]}>Grand Total</Text>
            <Text style={[styles.grandTotalValue, { color: colors.primary }]}>₹{grandTotal.toLocaleString("en-IN")}</Text>
          </View>
        </View>

        {/* Notes */}
        <View style={styles.notesSection}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Notes (optional)</Text>
          <TextInput
            style={[styles.notesInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            placeholder="Payment terms, bank details, notes…"
            placeholderTextColor={colors.mutedForeground}
            value={notes}
            onChangeText={setNotes}
            multiline
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 8) }]}>
        <GradientButton
          label={isGeneratingNumber ? "Generating Number…" : "Save & Preview Invoice"}
          onPress={handleSave}
          iconName="file-text"
          size="lg"
          style={{ flex: 1 }}
          disabled={isGeneratingNumber}
        />
      </View>

      <ItemEditModal
        visible={editModalVisible || addModalVisible}
        item={editModalVisible ? editingItem : null}
        onClose={() => { setEditModalVisible(false); setAddModalVisible(false); setEditingItem(null); }}
        onSave={handleSaveItem}
        colors={colors}
      />

      <Modal visible={statePickerVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Place of Supply</Text>
            <TextInput
              style={[styles.stateSearch, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Search state…"
              placeholderTextColor={colors.mutedForeground}
              value={stateSearch}
              onChangeText={setStateSearch}
            />
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {filteredStates.map((state) => (
                <TouchableOpacity
                  key={state.code}
                  style={[styles.stateItem, {
                    borderBottomColor: colors.border,
                    backgroundColor: state.code === placeOfSupply ? colors.primaryLight : "transparent",
                  }]}
                  onPress={() => {
                    setPlaceOfSupply(state.code);
                    setStatePickerVisible(false);
                    setStateSearch("");
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.stateCode, { color: colors.primary }]}>{state.code}</Text>
                  <Text style={[styles.stateName, { color: colors.foreground }]}>{state.name}</Text>
                  {state.code === placeOfSupply && <Icon name="check" size={15} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  const [name, setName] = useState(item?.name || "");
  const [qty, setQty] = useState(item?.quantity?.toString() || "1");
  const [unit, setUnit] = useState(item?.unit || "piece");
  const [rate, setRate] = useState(item?.rate?.toString() || "");
  const [hsnCode, setHsnCode] = useState(item?.hsnCode || "");

  useEffect(() => {
    setName(item?.name || "");
    setQty(item?.quantity?.toString() || "1");
    setUnit(item?.unit || "piece");
    setRate(item?.rate?.toString() || "");
    setHsnCode(item?.hsnCode || "");
  }, [item, visible]);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: item?.id || generateId(),
      name: name.trim(),
      quantity: parseFloat(qty) || 1,
      unit: unit.trim() || "piece",
      rate: parseFloat(rate) || 0,
      hsnCode: hsnCode.trim() || undefined,
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
          <View style={styles.modalHandle} />
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>{item ? "Edit Item" : "Add Item"}</Text>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <LabeledInput label="Item Name" value={name} onChangeText={setName} placeholder="e.g. Rice" colors={colors} />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <LabeledInput label="Quantity" value={qty} onChangeText={setQty} placeholder="1" keyboardType="decimal-pad" colors={colors} />
              </View>
              <View style={{ flex: 1 }}>
                <LabeledInput label="Unit" value={unit} onChangeText={setUnit} placeholder="piece" colors={colors} />
              </View>
            </View>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <LabeledInput label="Rate (₹)" value={rate} onChangeText={setRate} placeholder="0" keyboardType="decimal-pad" colors={colors} />
              </View>
              <View style={{ flex: 1 }}>
                <LabeledInput label="HSN/SAC Code" value={hsnCode} onChangeText={setHsnCode} placeholder="e.g. 1006" colors={colors} />
              </View>
            </View>
            <TouchableOpacity
              style={[styles.saveItemBtn, { backgroundColor: colors.primary, marginTop: 8 }]}
              onPress={handleSave}
              activeOpacity={0.85}
              disabled={!name.trim()}
            >
              <Icon name="check" size={16} color="#fff" />
              <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 }}>Save Item</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function LabeledInput({
  label, value, onChangeText, placeholder, keyboardType, colors,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: TextInputProps["keyboardType"];
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={keyboardType}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.07)",
  },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6 },
  sectionBody: { padding: 14, gap: 12 },
  row: { flexDirection: "row", gap: 10 },
  label: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 },
  input: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    justifyContent: "center",
  },
  statePicker: { flexDirection: "row", alignItems: "center" },
  hint: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 4 },
  tableHeader: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 10 },
  thText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 0.3 },
  colItem: { flex: 3 },
  colQty: { flex: 2 },
  colRate: { flex: 2 },
  colTotal: { flex: 2 },
  itemRow: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, alignItems: "center" },
  itemText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  rowActions: { width: 56, flexDirection: "row", gap: 12, justifyContent: "flex-end" },
  addItemRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14, borderTopWidth: 1 },
  addItemText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 },
  toggleLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  toggleIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  toggleLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  toggleDetail: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  typeSwitch: { flexDirection: "row", borderRadius: 10, padding: 3, gap: 4 },
  typeBtn: { flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: "center" },
  typeBtnText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  toggleInput: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular" },
  miniLabel: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 4 },
  divider: { height: 1, marginHorizontal: 14 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8 },
  totalLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  totalValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  grandTotalLabel: { fontSize: 17, fontFamily: "Inter_700Bold" },
  grandTotalValue: { fontSize: 17, fontFamily: "Inter_700Bold" },
  notesSection: { gap: 6 },
  notesInput: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular", minHeight: 80, textAlignVertical: "top" },
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, flexDirection: "row", gap: 10 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34, maxHeight: "85%" },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#E0E0E0", alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 16 },
  stateSearch: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 10 },
  stateItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, gap: 10, borderRadius: 8 },
  stateCode: { fontSize: 13, fontFamily: "Inter_700Bold", width: 30 },
  stateName: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  saveItemBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 14 },
});
