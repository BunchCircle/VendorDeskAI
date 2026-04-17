import AsyncStorage from "@react-native-async-storage/async-storage";

export interface VendorProfile {
  businessName: string;
  vendorName: string;
  whatsappNumber: string;
  email: string;
  address: string;
  gstNumber?: string;
  profilePicUri?: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  unit: string;
  hsnCode?: string;
}

export interface Lead {
  id: string;
  name: string;
  phoneNumber?: string;
  whatsappNumber: string;
  whatsappSameAsPhone?: boolean;
  email?: string;
  status: "Pending" | "Quote Created" | "PDF Shared";
  createdAt: string;
}

export interface QuotationItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  rate: number;
  hsnCode?: string;
}

export interface Quotation {
  id: string;
  leadId: string;
  items: QuotationItem[];
  notes?: string;
  createdAt: string;
  quoteNumber: string;
  discount?: { enabled: boolean; type: "percent" | "flat"; value: number };
  tax?: { enabled: boolean; label: string; rate: number };
}

const KEYS = {
  VENDOR_PROFILE: "vendor_profile",
  PRODUCTS: "products",
  LEADS: "leads",
  QUOTATIONS: "quotations",
  ONBOARDED: "is_onboarded",
};

export async function getVendorProfile(): Promise<VendorProfile | null> {
  const raw = await AsyncStorage.getItem(KEYS.VENDOR_PROFILE);
  return raw ? JSON.parse(raw) : null;
}

export async function saveVendorProfile(profile: VendorProfile): Promise<void> {
  await AsyncStorage.setItem(KEYS.VENDOR_PROFILE, JSON.stringify(profile));
  await AsyncStorage.setItem(KEYS.ONBOARDED, "true");
}

export async function isOnboarded(): Promise<boolean> {
  const val = await AsyncStorage.getItem(KEYS.ONBOARDED);
  return val === "true";
}

export async function getProducts(): Promise<Product[]> {
  const raw = await AsyncStorage.getItem(KEYS.PRODUCTS);
  return raw ? JSON.parse(raw) : [];
}

export async function saveProducts(products: Product[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.PRODUCTS, JSON.stringify(products));
}

export async function addProduct(product: Product): Promise<void> {
  const products = await getProducts();
  products.push(product);
  await saveProducts(products);
}

export async function updateProduct(product: Product): Promise<void> {
  const products = await getProducts();
  const idx = products.findIndex((p) => p.id === product.id);
  if (idx >= 0) products[idx] = product;
  await saveProducts(products);
}

export async function deleteProduct(id: string): Promise<void> {
  const products = await getProducts();
  await saveProducts(products.filter((p) => p.id !== id));
}

export async function getLeads(): Promise<Lead[]> {
  const raw = await AsyncStorage.getItem(KEYS.LEADS);
  return raw ? JSON.parse(raw) : [];
}

export async function saveLeads(leads: Lead[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.LEADS, JSON.stringify(leads));
}

export async function addLead(lead: Lead): Promise<void> {
  const leads = await getLeads();
  leads.unshift(lead);
  await saveLeads(leads);
}

export async function updateLead(lead: Lead): Promise<void> {
  const leads = await getLeads();
  const idx = leads.findIndex((l) => l.id === lead.id);
  if (idx >= 0) leads[idx] = lead;
  await saveLeads(leads);
}

export async function deleteLead(id: string): Promise<void> {
  const leads = await getLeads();
  await saveLeads(leads.filter((l) => l.id !== id));
}

export async function getLeadById(id: string): Promise<Lead | null> {
  const leads = await getLeads();
  return leads.find((l) => l.id === id) ?? null;
}

export async function getQuotations(): Promise<Quotation[]> {
  const raw = await AsyncStorage.getItem(KEYS.QUOTATIONS);
  return raw ? JSON.parse(raw) : [];
}

export async function saveQuotation(quotation: Quotation): Promise<void> {
  const quotations = await getQuotations();
  const idx = quotations.findIndex((q) => q.id === quotation.id);
  if (idx >= 0) {
    quotations[idx] = quotation;
  } else {
    quotations.push(quotation);
  }
  await AsyncStorage.setItem(KEYS.QUOTATIONS, JSON.stringify(quotations));
}

export async function getQuotationByLeadId(
  leadId: string
): Promise<Quotation | null> {
  const quotations = await getQuotations();
  return quotations.find((q) => q.leadId === leadId) ?? null;
}

export function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

export function generateQuoteNumber(): string {
  const num = Math.floor(Math.random() * 9000) + 1000;
  return `QT-${num}`;
}
