import { supabase } from "./supabase";
import {
  Lead,
  Product,
  Quotation,
  VendorProfile,
} from "./storage";

export type RemoteResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ─── Vendor Profile ───────────────────────────────────────────────────────────

export async function getRemoteVendorProfile(): Promise<RemoteResult<VendorProfile | null>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: true, data: null };
  const { data, error } = await supabase
    .from("vendor_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, data: null };
  return {
    ok: true,
    data: {
      businessName: data.business_name,
      vendorName: data.vendor_name,
      whatsappNumber: data.whatsapp_number,
      email: data.email,
      address: data.address,
      gstNumber: data.gst_number ?? undefined,
    },
  };
}

export async function upsertRemoteVendorProfile(profile: VendorProfile): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from("vendor_profiles").upsert(
    {
      user_id: user.id,
      business_name: profile.businessName,
      vendor_name: profile.vendorName,
      whatsapp_number: profile.whatsappNumber,
      email: profile.email,
      address: profile.address,
      gst_number: profile.gstNumber ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(error.message);
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function getRemoteProducts(): Promise<RemoteResult<Product[]>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: true, data: [] };
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at");
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      price: Number(d.price),
      unit: d.unit,
      hsnCode: d.hsn_code ?? undefined,
      taxRate: d.tax_rate != null ? Number(d.tax_rate) : undefined,
    })),
  };
}

export async function upsertRemoteProduct(product: Product): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from("products").upsert({
    id: product.id,
    user_id: user.id,
    name: product.name,
    price: product.price,
    unit: product.unit,
    hsn_code: product.hsnCode ?? null,
    tax_rate: product.taxRate ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function deleteRemoteProduct(id: string): Promise<void> {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Leads ────────────────────────────────────────────────────────────────────

export async function getRemoteLeads(): Promise<RemoteResult<Lead[]>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: true, data: [] };
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      phoneNumber: d.phone_number ?? undefined,
      whatsappNumber: d.whatsapp_number,
      whatsappSameAsPhone: d.whatsapp_same_as_phone ?? false,
      email: d.email ?? undefined,
      status: d.status as Lead["status"],
      createdAt: d.created_at,
    })),
  };
}

export async function upsertRemoteLead(lead: Lead): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from("leads").upsert({
    id: lead.id,
    user_id: user.id,
    name: lead.name,
    phone_number: lead.phoneNumber ?? null,
    whatsapp_number: lead.whatsappNumber,
    whatsapp_same_as_phone: lead.whatsappSameAsPhone ?? false,
    email: lead.email ?? null,
    status: lead.status,
    created_at: lead.createdAt,
  });
  if (error) throw new Error(error.message);
}

export async function deleteRemoteLead(id: string): Promise<void> {
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Quotations ───────────────────────────────────────────────────────────────

export async function getRemoteQuotations(): Promise<RemoteResult<Quotation[]>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: true, data: [] };
  const { data, error } = await supabase
    .from("quotations")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at");
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((d) => ({
      id: d.id,
      leadId: d.lead_id,
      items: d.items ?? [],
      notes: d.notes ?? undefined,
      quoteNumber: d.quote_number,
      discount: d.discount ?? undefined,
      tax: d.tax ?? undefined,
      status: d.status ?? undefined,
      createdAt: d.created_at,
    })),
  };
}

export async function upsertRemoteQuotation(quotation: Quotation): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from("quotations").upsert({
    id: quotation.id,
    user_id: user.id,
    lead_id: quotation.leadId,
    items: quotation.items,
    notes: quotation.notes ?? null,
    quote_number: quotation.quoteNumber,
    discount: quotation.discount ?? null,
    tax: quotation.tax ?? null,
    status: quotation.status ?? null,
    created_at: quotation.createdAt,
  });
  if (error) throw new Error(error.message);
}

export async function deleteRemoteQuotation(id: string): Promise<void> {
  const { error } = await supabase.from("quotations").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
