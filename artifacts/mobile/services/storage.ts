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
  taxRate?: number;
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
  taxRate?: number;
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

export type InvoiceStatus = "draft" | "sent" | "paid";

export interface TaxSplit {
  type: "cgst_sgst" | "igst";
  rate: number;
  cgstAmt?: number;
  sgstAmt?: number;
  igstAmt?: number;
}

export interface Invoice {
  id: string;
  leadId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  items: QuotationItem[];
  notes?: string;
  discount?: { enabled: boolean; type: "percent" | "flat"; value: number };
  tax?: { enabled: boolean; label: string; rate: number };
  buyerGstin?: string;
  placeOfSupply: string;
  taxSplit: TaxSplit;
  status: InvoiceStatus;
  createdAt: string;
}

const KEYS = {
  VENDOR_PROFILE: "vendor_profile",
  PRODUCTS: "products",
  LEADS: "leads",
  QUOTATIONS: "quotations",
  INVOICES: "invoices",
  INVOICE_COUNTER: "invoice_counter",
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

// ─── Invoices ─────────────────────────────────────────────────────────────────

export async function getInvoices(): Promise<Invoice[]> {
  const raw = await AsyncStorage.getItem(KEYS.INVOICES);
  return raw ? JSON.parse(raw) : [];
}

export async function saveInvoice(invoice: Invoice): Promise<void> {
  const invoices = await getInvoices();
  const idx = invoices.findIndex((inv) => inv.id === invoice.id);
  if (idx >= 0) {
    invoices[idx] = invoice;
  } else {
    invoices.push(invoice);
  }
  await AsyncStorage.setItem(KEYS.INVOICES, JSON.stringify(invoices));
}

export async function getInvoicesByLeadId(leadId: string): Promise<Invoice[]> {
  const invoices = await getInvoices();
  return invoices.filter((inv) => inv.leadId === leadId);
}

export async function updateInvoiceStatus(
  id: string,
  status: InvoiceStatus
): Promise<void> {
  const invoices = await getInvoices();
  const idx = invoices.findIndex((inv) => inv.id === id);
  if (idx >= 0) {
    invoices[idx] = { ...invoices[idx], status };
    await AsyncStorage.setItem(KEYS.INVOICES, JSON.stringify(invoices));
  }
}

export async function deleteInvoice(id: string): Promise<void> {
  const invoices = await getInvoices();
  await AsyncStorage.setItem(
    KEYS.INVOICES,
    JSON.stringify(invoices.filter((inv) => inv.id !== id))
  );
}

export function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

export function generateQuoteNumber(): string {
  const num = Math.floor(Math.random() * 9000) + 1000;
  return `QT-${num}`;
}

export async function generateInvoiceNumber(): Promise<string> {
  const raw = await AsyncStorage.getItem(KEYS.INVOICE_COUNTER);
  const current = raw ? parseInt(raw, 10) : 0;
  const next = current + 1;
  await AsyncStorage.setItem(KEYS.INVOICE_COUNTER, next.toString());
  return `INV-${next.toString().padStart(4, "0")}`;
}

// ─── Indian States for Place of Supply ────────────────────────────────────────

export const INDIAN_STATES: { code: string; name: string }[] = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "28", name: "Andhra Pradesh" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh (New)" },
  { code: "38", name: "Ladakh" },
  { code: "97", name: "Other Territory" },
];

export function getVendorStateCode(gstin?: string): string | null {
  if (!gstin || gstin.length < 2) return null;
  return gstin.substring(0, 2);
}

export function computeTaxSplit(
  taxRate: number,
  taxableAmount: number,
  vendorStateCode: string | null,
  placeOfSupplyCode: string
): TaxSplit {
  const isIntraState = vendorStateCode === placeOfSupplyCode;
  if (isIntraState) {
    const halfRate = taxRate / 2;
    const halfAmt = (taxableAmount * halfRate) / 100;
    return {
      type: "cgst_sgst",
      rate: taxRate,
      cgstAmt: halfAmt,
      sgstAmt: halfAmt,
    };
  } else {
    const igstAmt = (taxableAmount * taxRate) / 100;
    return {
      type: "igst",
      rate: taxRate,
      igstAmt,
    };
  }
}

/**
 * Compute a TaxSplit when the total tax amount is already known (e.g. per-item computation).
 * The `rate` in the result is set to 0 — callers that need a display rate should compute it themselves.
 */
export function computeTaxSplitFromAmount(
  totalTaxAmt: number,
  vendorStateCode: string | null,
  placeOfSupplyCode: string
): TaxSplit {
  const isIntraState = vendorStateCode === placeOfSupplyCode;
  if (isIntraState) {
    return {
      type: "cgst_sgst",
      rate: 0,
      cgstAmt: totalTaxAmt / 2,
      sgstAmt: totalTaxAmt / 2,
    };
  } else {
    return {
      type: "igst",
      rate: 0,
      igstAmt: totalTaxAmt,
    };
  }
}

/**
 * Compute per-item GST totals grouped by tax rate slab.
 * Returns an array of slabs sorted ascending by rate, plus the grand total tax amount.
 */
export function computePerItemTaxData(
  items: QuotationItem[]
): { slabs: Array<{ rate: number; taxableAmt: number; taxAmt: number }>; totalTax: number } {
  const map = new Map<number, { taxableAmt: number; taxAmt: number }>();
  for (const item of items) {
    const rate = item.taxRate || 0;
    if (rate <= 0) continue;
    const taxableAmt = item.quantity * item.rate;
    const taxAmt = (taxableAmt * rate) / 100;
    const prev = map.get(rate) || { taxableAmt: 0, taxAmt: 0 };
    map.set(rate, { taxableAmt: prev.taxableAmt + taxableAmt, taxAmt: prev.taxAmt + taxAmt });
  }
  const slabs = Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([rate, { taxableAmt, taxAmt }]) => ({ rate, taxableAmt, taxAmt }));
  const totalTax = slabs.reduce((s, slab) => s + slab.taxAmt, 0);
  return { slabs, totalTax };
}
