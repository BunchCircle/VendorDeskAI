import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Icon } from "@/components/Icon";
import { AppHeader } from "@/components/AppHeader";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { Lead } from "@/services/storage";

const STATUS_KEYS: Lead["status"][] = ["Pending", "Quote Created", "PDF Shared"];

const STATUS_CONFIG: Record<Lead["status"], { bg: string; text: string; dot: string; label: string; desc: string }> = {
  Pending: {
    bg: "#FEF3C7", text: "#92400E", dot: "#D97706", label: "Pending",
    desc: "Lead added — no quotation or invoice sent yet.",
  },
  "Quote Created": {
    bg: "#D1FAE5", text: "#065F46", dot: "#059669", label: "Quote Created",
    desc: "A quotation has been prepared or shared with this lead.",
  },
  "PDF Shared": {
    bg: "#DBEAFE", text: "#1E40AF", dot: "#2563EB", label: "PDF Shared",
    desc: "The PDF (quote or invoice) has been shared via WhatsApp or download.",
  },
};

const DATE_PRESETS = [
  { label: "All Time", value: "all" },
  { label: "Today", value: "today" },
  { label: "Last 7 Days", value: "7days" },
  { label: "Last 30 Days", value: "30days" },
  { label: "This Month", value: "month" },
];

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getPresetRange(preset: string): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (preset === "today") return { from: startOfDay(now), to: now };
  if (preset === "7days") {
    const from = new Date(now); from.setDate(from.getDate() - 6);
    return { from: startOfDay(from), to: now };
  }
  if (preset === "30days") {
    const from = new Date(now); from.setDate(from.getDate() - 29);
    return { from: startOfDay(from), to: now };
  }
  if (preset === "month") return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
  return { from: null, to: null };
}

function LeadCard({
  lead,
  onPress,
  onEdit,
  onDelete,
  onStatusTap,
  invoiceCount,
  colors,
}: {
  lead: Lead;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusTap: () => void;
  invoiceCount: number;
  colors: ReturnType<typeof useColors>;
}) {
  const statusCfg = STATUS_CONFIG[lead.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.Pending;
  const dateStr = new Date(lead.createdAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
  const initials = lead.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <TouchableOpacity style={styles.cardBody} onPress={onPress} activeOpacity={0.75}>
        <View style={styles.cardHeader}>
          <LinearGradient
            colors={["#4F46E5", "#6D28D9"]}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{initials}</Text>
          </LinearGradient>
          <View style={styles.cardInfo}>
            <Text style={[styles.leadName, { color: colors.foreground }]} numberOfLines={1}>
              {lead.name}
            </Text>
            <Text style={[styles.leadPhone, { color: colors.mutedForeground }]}>
              {lead.whatsappNumber}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <TouchableOpacity
              style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}
              onPress={(e) => { e.stopPropagation?.(); onStatusTap(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.8}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <View style={[styles.statusDot, { backgroundColor: statusCfg.dot }]} />
              <Text style={[styles.statusText, { color: statusCfg.text }]}>{statusCfg.label}</Text>
              <Icon name="chevron-down" size={9} color={statusCfg.text} />
            </TouchableOpacity>
            {invoiceCount > 0 && (
              <View style={[styles.invoiceBadge, { backgroundColor: "#EEF2FF" }]}>
                <Icon name="credit-card" size={10} color="#4338CA" />
                <Text style={[styles.invoiceBadgeText, { color: "#4338CA" }]}>
                  {invoiceCount} invoice{invoiceCount !== 1 ? "s" : ""}
                </Text>
              </View>
            )}
          </View>
        </View>
        <Text style={[styles.dateText, { color: colors.mutedForeground }]}>Added {dateStr}</Text>
      </TouchableOpacity>
      <View style={[styles.cardActions, { borderTopColor: colors.border }]}>
        <TouchableOpacity style={styles.cardActionBtn} onPress={onEdit} activeOpacity={0.7}>
          <Icon name="edit-2" size={13} color={colors.primary} />
          <Text style={[styles.cardActionText, { color: colors.primary }]}>Edit</Text>
        </TouchableOpacity>
        <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />
        <TouchableOpacity style={styles.cardActionBtn} onPress={onDelete} activeOpacity={0.7}>
          <Icon name="trash-2" size={13} color={colors.destructive} />
          <Text style={[styles.cardActionText, { color: colors.destructive }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function LeadsScreen() {
  const { leads, deleteLead, updateLead, refreshAll, getInvoicesForLead } = useApp();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [filterVisible, setFilterVisible] = useState(false);
  const [activePreset, setActivePreset] = useState("all");
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({ from: null, to: null });

  const [statusPickerLead, setStatusPickerLead] = useState<Lead | null>(null);
  const [infoVisible, setInfoVisible] = useState(false);

  const isFiltered = activePreset !== "all";

  const filtered = useMemo(() => {
    let result = leads.filter(
      (l) =>
        l.name.toLowerCase().includes(search.toLowerCase()) ||
        l.whatsappNumber.includes(search)
    );
    if (dateRange.from || dateRange.to) {
      result = result.filter((l) => {
        const d = new Date(l.createdAt);
        if (dateRange.from && d < dateRange.from) return false;
        if (dateRange.to && d > dateRange.to) return false;
        return true;
      });
    }
    return result;
  }, [leads, search, dateRange]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  const handleAddLead = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/lead/new");
  };

  const handleDelete = (lead: Lead) => {
    const doDelete = () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      deleteLead(lead.id);
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

  const handleStatusChange = async (lead: Lead, newStatus: Lead["status"]) => {
    setStatusPickerLead(null);
    if (newStatus === lead.status) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await updateLead({ ...lead, status: newStatus });
  };

  const applyPreset = (preset: string) => {
    setActivePreset(preset);
    setDateRange(getPresetRange(preset));
  };

  const clearFilter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActivePreset("all");
    setDateRange({ from: null, to: null });
    setFilterVisible(false);
  };

  const exportCSV = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const headers = "Lead Name,Phone Number,WhatsApp Number,Email,Status,Created Date\n";
      const rows = filtered.map((l) => {
        const d = new Date(l.createdAt).toLocaleDateString("en-IN");
        return `"${l.name}","${l.phoneNumber || ""}","${l.whatsappNumber}","${l.email || ""}","${l.status}","${d}"`;
      }).join("\n");
      const csv = headers + rows;
      if (Platform.OS === "web") {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "vendordesk_leads.csv"; a.click();
        URL.revokeObjectURL(url);
        return;
      }
      const uri = FileSystem.cacheDirectory + "vendordesk_leads.csv";
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "Export Leads", UTI: "public.comma-separated-values-text" });
    } catch { }
  };

  const formatPresetDate = () => {
    if (!dateRange.from) return "";
    const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
    const from = dateRange.from.toLocaleDateString("en-IN", opts);
    const to = dateRange.to?.toLocaleDateString("en-IN", opts) || "";
    return from === to ? from : `${from} – ${to}`;
  };

  const headerRight = (
    <View style={styles.headerActions}>
      <View style={[styles.countPill, { backgroundColor: colors.primaryLight }]}>
        <Text style={[styles.countText, { color: colors.primary }]}>{filtered.length}</Text>
      </View>
      <TouchableOpacity
        style={[styles.iconAction, {
          backgroundColor: isFiltered ? colors.primary : colors.muted,
          borderColor: isFiltered ? colors.primary : colors.border,
        }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setFilterVisible(true);
        }}
        activeOpacity={0.8}
      >
        <Icon name="calendar" size={16} color={isFiltered ? "#fff" : colors.mutedForeground} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.iconAction, { backgroundColor: colors.muted, borderColor: colors.border }]}
        onPress={exportCSV}
        activeOpacity={0.8}
      >
        <Icon name="download" size={16} color={colors.mutedForeground} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader rightElement={headerRight} />

      <View style={[styles.titleRow, { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 }]}>
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>Leads</Text>
        {isFiltered && (
          <Text style={[styles.filterSubtitle, { color: colors.primary }]}>
            {DATE_PRESETS.find((p) => p.value === activePreset)?.label}
            {formatPresetDate() ? `  ·  ${formatPresetDate()}` : ""}
          </Text>
        )}
      </View>

      <View style={styles.searchWrapper}>
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Icon name="search" size={15} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search leads by name or phone..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="x" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <LeadCard
            lead={item}
            onPress={() => router.push(`/lead/${item.id}/quotation`)}
            onEdit={() => router.push(`/lead/${item.id}/edit`)}
            onDelete={() => handleDelete(item)}
            onStatusTap={() => setStatusPickerLead(item)}
            invoiceCount={getInvoicesForLead(item.id).length}
            colors={colors}
          />
        )}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 100) }]}
        scrollEnabled={!!filtered.length}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <LinearGradient
              colors={["#4F46E5", "#6D28D9"]}
              style={styles.emptyIcon}
            >
              <Icon name="users" size={28} color="#fff" />
            </LinearGradient>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {isFiltered ? "No leads in this range" : "No leads yet"}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
              {isFiltered
                ? "Try a different date range or clear the filter"
                : "Tap the + button below to add your first lead"}
            </Text>
            {isFiltered && (
              <TouchableOpacity style={[styles.clearFilterBtn, { backgroundColor: colors.primaryLight }]} onPress={clearFilter}>
                <Text style={[styles.clearFilterText, { color: colors.primary }]}>Clear Filter</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      {/* FAB — Add Lead */}
      <TouchableOpacity
        style={[styles.fab, {
          bottom: insets.bottom + (Platform.OS === "web" ? 104 : 80),
        }]}
        onPress={handleAddLead}
        activeOpacity={0.9}
      >
        <LinearGradient
          colors={["#4F46E5", "#6D28D9"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <Icon name="plus" size={26} color="#FFFFFF" />
        </LinearGradient>
      </TouchableOpacity>

      {/* ⓘ Info button — bottom-left corner */}
      <TouchableOpacity
        style={[styles.infoBtn, {
          bottom: insets.bottom + (Platform.OS === "web" ? 108 : 84),
          backgroundColor: colors.card,
          borderColor: colors.border,
        }]}
        onPress={() => { setInfoVisible(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        activeOpacity={0.8}
      >
        <Icon name="info" size={14} color={colors.mutedForeground} />
        <Text style={[styles.infoBtnText, { color: colors.mutedForeground }]}>Status Guide</Text>
      </TouchableOpacity>

      {/* Date Filter Modal */}
      <Modal visible={filterVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Filter by Date</Text>
            <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>Show leads added within a time range</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 16 }}>
              <View style={styles.presetsGrid}>
                {DATE_PRESETS.map((p) => {
                  const isActive = activePreset === p.value;
                  return (
                    <TouchableOpacity
                      key={p.value}
                      onPress={() => { applyPreset(p.value); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      activeOpacity={0.8}
                      style={{ flex: 1, minWidth: "40%" }}
                    >
                      {isActive ? (
                        <LinearGradient
                          colors={["#4F46E5", "#6D28D9"]}
                          style={[styles.presetChip, { borderColor: colors.primary }]}
                        >
                          <Text style={[styles.presetText, { color: "#fff" }]}>{p.label}</Text>
                        </LinearGradient>
                      ) : (
                        <View style={[styles.presetChip, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                          <Text style={[styles.presetText, { color: colors.foreground }]}>{p.label}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
              {isFiltered && dateRange.from && (
                <View style={[styles.rangeSummary, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
                  <Icon name="calendar" size={14} color={colors.primary} />
                  <Text style={[styles.rangeSummaryText, { color: colors.primary }]}>
                    {formatPresetDate()}  ·  {filtered.length} lead{filtered.length !== 1 ? "s" : ""} found
                  </Text>
                </View>
              )}
            </ScrollView>
            <View style={styles.modalButtons}>
              {isFiltered && (
                <TouchableOpacity
                  style={[styles.modalBtn, styles.clearBtn, { borderColor: colors.border, backgroundColor: colors.muted }]}
                  onPress={clearFilter}
                  activeOpacity={0.8}
                >
                  <Icon name="x" size={15} color={colors.foreground} />
                  <Text style={[styles.modalBtnText, { color: colors.foreground }]}>Clear</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.modalBtn, { flex: 1 }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setFilterVisible(false);
                }}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={["#4F46E5", "#6D28D9"]}
                  style={styles.applyBtnGradient}
                >
                  <Text style={[styles.modalBtnText, { color: "#fff" }]}>Apply Filter</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Status Picker Modal */}
      <Modal visible={!!statusPickerLead} animationType="slide" transparent onRequestClose={() => setStatusPickerLead(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Update Status</Text>
            <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
              {statusPickerLead?.name} — tap a status to change it
            </Text>
            <View style={{ gap: 10, marginTop: 20 }}>
              {STATUS_KEYS.map((s) => {
                const cfg = STATUS_CONFIG[s];
                const isCurrent = statusPickerLead?.status === s;
                return (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.statusOption,
                      { backgroundColor: cfg.bg, borderColor: isCurrent ? cfg.dot : "transparent", borderWidth: 2 },
                    ]}
                    onPress={() => statusPickerLead && handleStatusChange(statusPickerLead, s)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                      <View style={[styles.statusDot, { backgroundColor: cfg.dot, width: 8, height: 8, borderRadius: 4 }]} />
                      <Text style={[styles.statusOptionLabel, { color: cfg.text }]}>{cfg.label}</Text>
                    </View>
                    {isCurrent && <Icon name="check" size={15} color={cfg.dot} />}
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={[styles.modalBtn, { marginTop: 16, backgroundColor: colors.muted }]}
              onPress={() => setStatusPickerLead(null)}
              activeOpacity={0.8}
            >
              <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Info Modal — Status Guide */}
      <Modal visible={infoVisible} animationType="fade" transparent onRequestClose={() => setInfoVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Icon name="info" size={18} color={colors.primary} />
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>What do the statuses mean?</Text>
            </View>
            <Text style={[styles.modalSubtitle, { color: colors.mutedForeground, marginBottom: 16 }]}>
              Tap the coloured badge on any lead card to change its status.
            </Text>
            <View style={{ gap: 12 }}>
              {STATUS_KEYS.map((s) => {
                const cfg = STATUS_CONFIG[s];
                return (
                  <View key={s} style={[styles.infoRow, { backgroundColor: cfg.bg }]}>
                    <View style={[styles.statusDot, { backgroundColor: cfg.dot, width: 8, height: 8, borderRadius: 4 }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.statusOptionLabel, { color: cfg.text }]}>{cfg.label}</Text>
                      <Text style={[styles.infoDesc, { color: cfg.text, opacity: 0.8 }]}>{cfg.desc}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
            <TouchableOpacity
              style={[styles.modalBtn, { marginTop: 20, backgroundColor: colors.muted }]}
              onPress={() => setInfoVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  titleRow: { gap: 2 },
  screenTitle: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  filterSubtitle: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  countPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  countText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  iconAction: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  searchWrapper: { paddingHorizontal: 16, paddingVertical: 10 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  list: { paddingHorizontal: 16, gap: 10, paddingTop: 4 },
  card: {
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: "hidden",
    boxShadow: "0px 2px 8px rgba(79, 70, 229, 0.06)",
    elevation: 2,
  },
  cardBody: { padding: 14, gap: 8 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  avatarText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  cardInfo: { flex: 1, gap: 2 },
  leadName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  leadPhone: { fontSize: 13, fontFamily: "Inter_400Regular" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  invoiceBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  invoiceBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  dateText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  cardActions: { flexDirection: "row", borderTopWidth: 1 },
  cardActionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 10 },
  cardActionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  actionDivider: { width: 1 },
  emptyState: { flex: 1, alignItems: "center", paddingTop: 80, gap: 14 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 32, lineHeight: 20, color: "#888" },
  clearFilterBtn: { marginTop: 4, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  clearFilterText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  fab: {
    position: "absolute",
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    boxShadow: "0px 6px 14px rgba(79, 70, 229, 0.4)",
    elevation: 8,
  },
  fabGradient: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  infoBtn: {
    position: "absolute",
    left: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    boxShadow: "0px 2px 6px rgba(0,0,0,0.08)",
    elevation: 3,
  },
  infoBtnText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 20 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  modalSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
  presetsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  presetChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24, borderWidth: 1.5, alignItems: "center" },
  presetText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  rangeSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  rangeSummaryText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  modalButtons: { flexDirection: "row", gap: 10, marginTop: 20 },
  modalBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
    overflow: "hidden",
  },
  applyBtnGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
  },
  clearBtn: { paddingHorizontal: 20, borderWidth: 1.5 },
  modalBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  statusOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
  },
  statusOptionLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 12,
  },
  infoDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 17 },
});
