import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Image,
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
import { LinearGradient } from "expo-linear-gradient";
import { Icon } from "@/components/Icon";
import { AppHeader } from "@/components/AppHeader";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { extractCatalogueFromFile } from "@/services/ai";
import { Product, generateId } from "@/services/storage";

type AddMode = "manual" | "image" | "excel";

function ProductCard({
  product,
  onEdit,
  onDelete,
  colors,
}: {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.productCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <LinearGradient
        colors={["#4F46E5", "#6D28D9"]}
        style={styles.productIconWrap}
      >
        <Icon name="package" size={16} color="#fff" />
      </LinearGradient>
      <View style={styles.productInfo}>
        <Text style={[styles.productName, { color: colors.foreground }]} numberOfLines={1}>
          {product.name}
        </Text>
        <View style={styles.productPriceLine}>
          <Text style={[styles.productPrice, { color: colors.primary }]}>
            ₹{product.price.toLocaleString("en-IN")}
          </Text>
          <Text style={[styles.productUnit, { color: colors.mutedForeground }]}>/ {product.unit}</Text>
        </View>
        {!!product.hsnCode && (
          <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 }}>
            HSN: {product.hsnCode}
          </Text>
        )}
      </View>
      <View style={styles.productActions}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.primaryLight }]}
          onPress={onEdit}
          activeOpacity={0.7}
        >
          <Icon name="edit-2" size={14} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.destructiveLight }]}
          onPress={onDelete}
          activeOpacity={0.7}
        >
          <Icon name="trash-2" size={14} color={colors.destructive} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface ExtractedProduct {
  name: string;
  price: number;
  unit: string;
}

interface AddProductModalProps {
  visible: boolean;
  editProduct?: Product | null;
  onClose: () => void;
  onSave: (product: Omit<Product, "id"> & { id?: string }) => void;
  onAddMany: (products: ExtractedProduct[]) => void;
  colors: ReturnType<typeof useColors>;
}

function AddProductModal({ visible, editProduct, onClose, onSave, onAddMany, colors }: AddProductModalProps) {
  const [mode, setMode] = useState<AddMode>("manual");
  const [name, setName] = useState(editProduct?.name || "");
  const [price, setPrice] = useState(editProduct?.price?.toString() || "");
  const [unit, setUnit] = useState(editProduct?.unit || "");
  const [hsnCode, setHsnCode] = useState(editProduct?.hsnCode || "");

  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedProduct[]>([]);

  React.useEffect(() => {
    if (editProduct) {
      setName(editProduct.name);
      setPrice(editProduct.price.toString());
      setUnit(editProduct.unit);
      setHsnCode(editProduct.hsnCode || "");
      setMode("manual");
    } else {
      setName("");
      setPrice("");
      setUnit("");
      setHsnCode("");
    }
    setSelectedImageUri(null);
    setSelectedFileName(null);
    setExtracted([]);
  }, [editProduct, visible]);

  React.useEffect(() => {
    if (!visible || Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  const handleSave = () => {
    if (!name.trim() || !price.trim() || !unit.trim()) {
      Alert.alert("Required Fields", "Please fill in all fields.");
      return;
    }
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      Alert.alert("Invalid Price", "Please enter a valid price.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSave({ id: editProduct?.id, name: name.trim(), price: priceNum, unit: unit.trim(), hsnCode: hsnCode.trim() || undefined });
    onClose();
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Needed", "Please allow access to your photo library to pick a price list image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert("Error", "Could not read image. Please try again.");
      return;
    }
    setSelectedImageUri(asset.uri);
    setExtracted([]);
    setExtracting(true);
    try {
      const mimeType = asset.mimeType || "image/jpeg";
      const products = await extractCatalogueFromFile(asset.base64, mimeType);
      if (products.length === 0) {
        Alert.alert("No Products Found", "AI couldn't find any products in this image. Try a clearer photo of your price list.");
      }
      setExtracted(products);
    } catch {
      Alert.alert("Error", "Failed to process the image. Please try again.");
    } finally {
      setExtracting(false);
    }
  };

  const handlePickExcel = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
          "text/csv",
          "text/comma-separated-values",
          "*/*",
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setSelectedFileName(asset.name);
      setExtracted([]);
      setExtracting(true);
      try {
        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const ext = (asset.name || "").split(".").pop()?.toLowerCase();
        let mimeType = asset.mimeType || "application/octet-stream";
        if (ext === "csv") mimeType = "text/csv";
        else if (ext === "xlsx") mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        else if (ext === "xls") mimeType = "application/vnd.ms-excel";

        const products = await extractCatalogueFromFile(base64, mimeType);
        if (products.length === 0) {
          Alert.alert("No Products Found", "AI couldn't find any products in this file. Make sure it has columns for product name, price, and unit.");
        }
        setExtracted(products);
      } catch {
        Alert.alert("Error", "Failed to read or process the file. Please try again.");
      } finally {
        setExtracting(false);
      }
    } catch {
      Alert.alert("Error", "Could not open file picker. Please try again.");
    }
  };

  const handleAddExtracted = () => {
    if (extracted.length === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onAddMany(extracted);
    onClose();
  };

  const UNITS = ["kg", "g", "litre", "ml", "piece", "box", "dozen", "pack"];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      presentationStyle={Platform.OS === "ios" ? "formSheet" : "overFullScreen"}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                {editProduct ? "Edit Product" : "Add Product"}
              </Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Icon name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {!editProduct && (
              <View style={[styles.modeSelector, { backgroundColor: colors.muted }]}>
                {(["manual", "image", "excel"] as AddMode[]).map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.modeBtn, mode === m && { backgroundColor: colors.card }]}
                    onPress={() => { setMode(m); setExtracted([]); setSelectedImageUri(null); setSelectedFileName(null); }}
                    activeOpacity={0.7}
                  >
                    <Icon
                      name={m === "manual" ? "edit-3" : m === "image" ? "image" : "file-text"}
                      size={14}
                      color={mode === m ? colors.primary : colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.modeBtnText,
                        {
                          color: mode === m ? colors.primary : colors.mutedForeground,
                          fontFamily: mode === m ? "Inter_600SemiBold" : "Inter_400Regular",
                        },
                      ]}
                    >
                      {m === "manual" ? "Manual" : m === "image" ? "Image" : "Excel"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {mode === "manual" ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>Product Name</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="e.g. Basmati Rice"
                    placeholderTextColor={colors.mutedForeground}
                    value={name}
                    onChangeText={setName}
                  />
                </View>
                <View style={styles.row}>
                  <View style={[styles.formGroup, { flex: 1 }]}>
                    <Text style={[styles.label, { color: colors.mutedForeground }]}>Price (₹)</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                      placeholder="80"
                      placeholderTextColor={colors.mutedForeground}
                      value={price}
                      onChangeText={setPrice}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={[styles.formGroup, { flex: 1 }]}>
                    <Text style={[styles.label, { color: colors.mutedForeground }]}>Unit</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                      placeholder="kg"
                      placeholderTextColor={colors.mutedForeground}
                      value={unit}
                      onChangeText={setUnit}
                    />
                  </View>
                </View>
                <View style={styles.unitChips}>
                  {UNITS.map((u) => (
                    <TouchableOpacity
                      key={u}
                      style={[styles.chip, { backgroundColor: unit === u ? colors.primary : colors.muted, borderColor: unit === u ? colors.primary : colors.border }]}
                      onPress={() => setUnit(u)}
                      activeOpacity={0.7}
                    >
                      <Text style={{ color: unit === u ? "#fff" : colors.mutedForeground, fontSize: 13, fontFamily: "Inter_500Medium" }}>
                        {u}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.formGroup}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <Text style={[styles.label, { color: colors.mutedForeground, marginBottom: 0 }]}>HSN Code</Text>
                    <View style={[styles.optionalBadge, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                      <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular" }}>optional</Text>
                    </View>
                  </View>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="e.g. 1006 (rice)"
                    placeholderTextColor={colors.mutedForeground}
                    value={hsnCode}
                    onChangeText={setHsnCode}
                    keyboardType="number-pad"
                    maxLength={8}
                  />
                </View>
                <TouchableOpacity onPress={handleSave} activeOpacity={0.85}>
                  <LinearGradient
                    colors={["#4F46E5", "#6D28D9"]}
                    style={styles.saveBtn}
                  >
                    <Text style={[styles.saveBtnText, { color: "#fff" }]}>Save Product</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {mode === "image" ? (
                  <>
                    <Text style={[styles.uploadHint, { color: colors.mutedForeground }]}>
                      Take a photo or pick an image of your price list — AI will extract all products automatically.
                    </Text>
                    {selectedImageUri && (
                      <Image
                        source={{ uri: selectedImageUri }}
                        style={[styles.imagePreview, { borderColor: colors.border }]}
                        resizeMode="cover"
                      />
                    )}
                    <View style={styles.pickBtnRow}>
                      <TouchableOpacity
                        style={[styles.uploadBtn, { backgroundColor: colors.primaryLight, borderColor: colors.primary, flex: 1 }]}
                        onPress={handlePickImage}
                        activeOpacity={0.8}
                        disabled={extracting}
                      >
                        <Icon name="image" size={18} color={colors.primary} />
                        <Text style={[styles.uploadBtnText, { color: colors.primary }]}>
                          {selectedImageUri ? "Change Image" : "Choose Image"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={[styles.uploadHint, { color: colors.mutedForeground }]}>
                      Upload an Excel (.xlsx) or CSV file with your product list. AI will extract all products automatically.
                    </Text>
                    <TouchableOpacity
                      style={[styles.uploadBtn, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
                      onPress={handlePickExcel}
                      activeOpacity={0.8}
                      disabled={extracting}
                    >
                      <Icon name="file-text" size={18} color={colors.primary} />
                      <Text style={[styles.uploadBtnText, { color: colors.primary }]}>
                        {selectedFileName ? "Change File" : "Choose Excel / CSV"}
                      </Text>
                    </TouchableOpacity>
                    {selectedFileName && (
                      <View style={[styles.fileNameBadge, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                        <Icon name="paperclip" size={14} color={colors.mutedForeground} />
                        <Text style={[styles.fileNameText, { color: colors.mutedForeground }]} numberOfLines={1}>
                          {selectedFileName}
                        </Text>
                      </View>
                    )}
                  </>
                )}

                {extracting && (
                  <View style={styles.extractingRow}>
                    <ActivityIndicator color={colors.primary} />
                    <Text style={[styles.extractingText, { color: colors.mutedForeground }]}>
                      AI is reading your {mode === "image" ? "image" : "file"}…
                    </Text>
                  </View>
                )}

                {!extracting && extracted.length > 0 && (
                  <View style={styles.extractedSection}>
                    <View style={styles.extractedHeader}>
                      <Icon name="check-circle" size={16} color={colors.primary} />
                      <Text style={[styles.extractedTitle, { color: colors.foreground }]}>
                        {extracted.length} product{extracted.length !== 1 ? "s" : ""} found
                      </Text>
                    </View>
                    {extracted.map((p, i) => (
                      <View key={i} style={[styles.extractedRow, { borderBottomColor: colors.border }]}>
                        <Text style={[styles.extractedName, { color: colors.foreground }]} numberOfLines={1}>
                          {p.name}
                        </Text>
                        <Text style={[styles.extractedPrice, { color: colors.primary }]}>
                          ₹{p.price} / {p.unit}
                        </Text>
                      </View>
                    ))}
                    <TouchableOpacity onPress={handleAddExtracted} activeOpacity={0.85} style={{ marginTop: 16 }}>
                      <LinearGradient
                        colors={["#4F46E5", "#6D28D9"]}
                        style={styles.saveBtn}
                      >
                        <Icon name="plus" size={18} color="#fff" />
                        <Text style={[styles.saveBtnText, { color: "#fff" }]}>
                          Add {extracted.length} Product{extracted.length !== 1 ? "s" : ""} to Catalogue
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function CatalogueScreen() {
  const { products, addProduct, updateProduct, deleteProduct } = useApp();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const filtered = useMemo(
    () => products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())),
    [products, search]
  );

  const handleSave = (product: Omit<Product, "id"> & { id?: string }) => {
    if (product.id) {
      updateProduct(product as Product);
    } else {
      addProduct({ name: product.name, price: product.price, unit: product.unit, hsnCode: product.hsnCode });
    }
  };

  const handleAddMany = (list: Array<{ name: string; price: number; unit: string }>) => {
    list.forEach((p) => addProduct({ name: p.name, price: p.price, unit: p.unit }));
  };

  const handleDelete = (product: Product) => {
    const doDelete = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      deleteProduct(product.id);
    };
    if (Platform.OS === "web") {
      if ((window as any).confirm(`Remove "${product.name}" from your catalogue?`)) doDelete();
    } else {
      Alert.alert("Delete Product", `Remove "${product.name}" from your catalogue?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader />

      <View style={styles.titleRow}>
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>Catalogue</Text>
        <View style={[styles.countPill, { backgroundColor: colors.primaryLight }]}>
          <Text style={[styles.countPillText, { color: colors.primary }]}>{products.length} products</Text>
        </View>
      </View>

      <View style={[styles.searchContainer, { paddingHorizontal: 16, paddingVertical: 10 }]}>
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Icon name="search" size={15} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search products..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Icon name="x" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ProductCard
            product={item}
            onEdit={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setEditingProduct(item);
              setModalVisible(true);
            }}
            onDelete={() => handleDelete(item)}
            colors={colors}
          />
        )}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 90) },
        ]}
        scrollEnabled={!!filtered.length}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <LinearGradient
              colors={["#4F46E5", "#6D28D9"]}
              style={styles.emptyIcon}
            >
              <Icon name="package" size={28} color="#fff" />
            </LinearGradient>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {search ? "No products found" : "Your catalogue is empty"}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
              {search ? "Try a different search" : "Add products so AI can create quotations for you"}
            </Text>
            {!search && (
              <TouchableOpacity
                onPress={() => { setEditingProduct(null); setModalVisible(true); }}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={["#4F46E5", "#6D28D9"]}
                  style={styles.emptyCtaBtn}
                >
                  <Icon name="plus" size={16} color="#fff" />
                  <Text style={styles.emptyCtaText}>Add First Product</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      <TouchableOpacity
        style={[
          styles.fab,
          { bottom: insets.bottom + (Platform.OS === "web" ? 104 : 80) },
        ]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setEditingProduct(null);
          setModalVisible(true);
        }}
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

      <AddProductModal
        visible={modalVisible}
        editProduct={editingProduct}
        onClose={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setModalVisible(false);
          setEditingProduct(null);
        }}
        onSave={handleSave}
        onAddMany={handleAddMany}
        colors={colors}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  screenTitle: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  countPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  countPillText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  searchContainer: {},
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
  productCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  productIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  productInfo: { flex: 1, gap: 2 },
  productName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  productPriceLine: { flexDirection: "row", alignItems: "baseline", gap: 2 },
  productPrice: { fontSize: 14, fontFamily: "Inter_700Bold" },
  productUnit: { fontSize: 12, fontFamily: "Inter_400Regular" },
  productActions: { flexDirection: "row", gap: 8 },
  actionBtn: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  emptyState: { flex: 1, alignItems: "center", paddingTop: 80, gap: 14 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 32, lineHeight: 20 },
  emptyCtaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 4,
  },
  emptyCtaText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
  fab: {
    position: "absolute",
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  fabGradient: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
    maxHeight: "92%",
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  modeSelector: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  modeBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 5 },
  modeBtnText: { fontSize: 13 },
  formGroup: { marginBottom: 14 },
  row: { flexDirection: "row", gap: 12 },
  label: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 6, letterSpacing: 0.4, textTransform: "uppercase" },
  input: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, fontFamily: "Inter_400Regular" },
  unitChips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  optionalBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 15,
    marginTop: 4,
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  uploadHint: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20, marginBottom: 16 },
  imagePreview: { width: "100%", height: 180, borderRadius: 12, marginBottom: 12, borderWidth: 1 },
  pickBtnRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  uploadBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 13, borderRadius: 12, borderWidth: 1.5, marginBottom: 12 },
  uploadBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  fileNameBadge: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  fileNameText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  extractingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 16 },
  extractingText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  extractedSection: { marginTop: 8 },
  extractedHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  extractedTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  extractedRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1 },
  extractedName: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", marginRight: 8 },
  extractedPrice: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
