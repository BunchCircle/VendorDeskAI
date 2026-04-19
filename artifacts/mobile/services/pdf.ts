import { Quotation, VendorProfile, Lead, Invoice } from "./storage";
import { Platform, Share, Linking } from "react-native";
import * as FileSystem from "expo-file-system";

export function generateQuotationHTML(
  quotation: Quotation,
  vendor: VendorProfile,
  lead: Lead
): string {
  const subtotal = quotation.items.reduce(
    (sum, item) => sum + item.quantity * item.rate,
    0
  );

  const discountAmount = (() => {
    const d = quotation.discount;
    if (!d?.enabled) return 0;
    if (d.type === "percent") return (subtotal * d.value) / 100;
    return Math.min(d.value, subtotal);
  })();

  const afterDiscount = subtotal - discountAmount;

  const taxAmount = (() => {
    const t = quotation.tax;
    if (!t?.enabled) return 0;
    return (afterDiscount * t.rate) / 100;
  })();

  const grandTotal = afterDiscount + taxAmount;

  const formatCurrency = (amount: number) =>
    `₹${amount.toLocaleString("en-IN")}`;

  const date = new Date(quotation.createdAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const itemRows = quotation.items
    .map(
      (item) => `
    <tr>
      <td style="padding:12px 16px">${item.name}${item.hsnCode ? `<br/><span style="font-size:10px;color:#90A4AE">HSN: ${item.hsnCode}</span>` : ""}</td>
      <td class="center" style="padding:12px 16px">${item.quantity} ${item.unit}</td>
      <td class="right" style="padding:12px 16px">${formatCurrency(item.rate)}</td>
      <td class="right" style="padding:12px 16px">${formatCurrency(item.quantity * item.rate)}</td>
    </tr>`
    )
    .join("");

  const discountRow = quotation.discount?.enabled && discountAmount > 0
    ? `<div class="total-row"><span class="total-label">Discount (${quotation.discount.type === "percent" ? `${quotation.discount.value}%` : "flat"})</span><span class="total-amount" style="color:#E53935">-${formatCurrency(discountAmount)}</span></div>`
    : "";

  const taxRow = quotation.tax?.enabled && taxAmount > 0
    ? `<div class="total-row"><span class="total-label">${quotation.tax.label || "Tax"} (${quotation.tax.rate}%)</span><span class="total-amount">+${formatCurrency(taxAmount)}</span></div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Quotation ${quotation.quoteNumber}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, Arial, sans-serif; color: #1a1a2e; background: #fff; padding: 32px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 3px solid #00897B; }
  .brand-name { font-size: 22px; font-weight: 700; color: #00897B; }
  .brand-details { font-size: 12px; color: #78909C; margin-top: 4px; line-height: 1.6; }
  .quote-info { text-align: right; }
  .quote-number { font-size: 18px; font-weight: 600; color: #1a1a2e; }
  .quote-date { font-size: 13px; color: #78909C; margin-top: 4px; }
  .to-section { margin-bottom: 28px; }
  .to-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #78909C; margin-bottom: 6px; }
  .to-name { font-size: 18px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  thead { background: #00897B; color: white; }
  th { padding: 12px 16px; font-size: 13px; font-weight: 600; text-align: left; }
  th.right { text-align: right; }
  td { padding: 12px 16px; font-size: 14px; border-bottom: 1px solid #E0E5E3; }
  td.center { text-align: center; }
  td.right { text-align: right; }
  tr:last-child td { border-bottom: none; }
  tbody tr:nth-child(even) { background: #F5F7F6; }
  .totals { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; margin-bottom: 24px; }
  .total-row { display: flex; gap: 24px; font-size: 14px; }
  .total-label { color: #78909C; }
  .total-amount { font-weight: 500; min-width: 80px; text-align: right; }
  .grand-total { font-size: 18px; font-weight: 700; color: #00897B; padding-top: 12px; border-top: 2px solid #00897B; }
  .notes { margin-top: 24px; font-size: 13px; color: #78909C; padding: 16px; background: #F5F7F6; border-radius: 8px; }
  .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #B0BEC5; }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="brand-name">${vendor.businessName}</div>
    <div class="brand-details">${vendor.vendorName}<br/>${vendor.whatsappNumber}<br/>${vendor.address}${vendor.gstNumber ? `<br/>GST/TIN: ${vendor.gstNumber}` : ""}</div>
  </div>
  <div class="quote-info">
    <div class="quote-number">${quotation.quoteNumber}</div>
    <div class="quote-date">${date}</div>
  </div>
</div>
<div class="to-section">
  <div class="to-label">Quotation For</div>
  <div class="to-name">${lead.name}</div>
  ${lead.whatsappNumber ? `<div style="font-size:13px;color:#78909C;">${lead.whatsappNumber}</div>` : ""}
</div>
<table>
  <thead>
    <tr>
      <th>Item</th>
      <th style="text-align:center">Qty</th>
      <th class="right">Rate</th>
      <th class="right">Amount</th>
    </tr>
  </thead>
  <tbody>${itemRows}</tbody>
</table>
<div class="totals">
  <div class="total-row"><span class="total-label">Subtotal</span><span class="total-amount">${formatCurrency(subtotal)}</span></div>
  ${discountRow}
  ${taxRow}
  <div class="total-row grand-total">
    <span class="total-label">Grand Total</span>
    <span class="total-amount">${formatCurrency(grandTotal)}</span>
  </div>
</div>
${quotation.notes ? `<div class="notes"><strong>Notes:</strong> ${quotation.notes}</div>` : ""}
<div class="footer">Generated by VendorDesk.ai</div>
</body>
</html>`;
}

export function generateInvoiceHTML(
  invoice: Invoice,
  vendor: VendorProfile,
  lead: Lead
): string {
  const formatCurrency = (amount: number) =>
    `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const subtotal = invoice.items.reduce(
    (sum, item) => sum + item.quantity * item.rate,
    0
  );

  const discountAmount = (() => {
    const d = invoice.discount;
    if (!d?.enabled) return 0;
    if (d.type === "percent") return (subtotal * d.value) / 100;
    return Math.min(d.value, subtotal);
  })();

  const afterDiscount = subtotal - discountAmount;

  // Per-item GST (from catalogue taxRate) takes priority over the global rate
  const perItemSlabMap = new Map<number, { taxableAmt: number; taxAmt: number }>();
  for (const item of invoice.items) {
    const r = item.taxRate || 0;
    if (r <= 0) continue;
    const taxableAmt = item.quantity * item.rate;
    const taxAmt = (taxableAmt * r) / 100;
    const prev = perItemSlabMap.get(r) || { taxableAmt: 0, taxAmt: 0 };
    perItemSlabMap.set(r, { taxableAmt: prev.taxableAmt + taxableAmt, taxAmt: prev.taxAmt + taxAmt });
  }
  const hasPerItemTaxes = perItemSlabMap.size > 0;
  const perItemSlabs = Array.from(perItemSlabMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([rate, { taxableAmt, taxAmt }]) => ({ rate, taxableAmt, taxAmt }));

  const taxRate = invoice.tax?.enabled ? (invoice.tax.rate ?? 0) : 0;
  const taxAmount = hasPerItemTaxes
    ? perItemSlabs.reduce((s, slab) => s + slab.taxAmt, 0)
    : (afterDiscount * taxRate) / 100;
  const grandTotal = afterDiscount + taxAmount;

  const invoiceDate = new Date(invoice.invoiceDate).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const dueDate = invoice.dueDate
    ? new Date(invoice.dueDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  const isCgstSgst = invoice.taxSplit.type === "cgst_sgst";
  const halfRate = taxRate / 2;
  const cgstAmt = isCgstSgst ? taxAmount / 2 : 0;
  const sgstAmt = isCgstSgst ? taxAmount / 2 : 0;
  const igstAmt = !isCgstSgst ? taxAmount : 0;

  const itemRows = invoice.items
    .map(
      (item) => {
        const amount = item.quantity * item.rate;
        return `
    <tr>
      <td style="padding:10px 12px">${item.name}</td>
      <td class="center" style="padding:10px 12px">${item.hsnCode || "-"}</td>
      <td class="center" style="padding:10px 12px">${item.quantity} ${item.unit}</td>
      <td class="right" style="padding:10px 12px">${formatCurrency(item.rate)}</td>
      <td class="right" style="padding:10px 12px">${formatCurrency(amount)}</td>
    </tr>`;
      }
    )
    .join("");

  // Generate tax breakdown rows — per-slab when item taxRates exist, else single global row
  const taxBreakdownRows = taxAmount > 0
    ? hasPerItemTaxes
      ? perItemSlabs.map((slab) => {
          const slabHalf = slab.rate / 2;
          return isCgstSgst
            ? `<tr>
                <td>${slab.rate}%</td>
                <td>${formatCurrency(slab.taxableAmt)}</td>
                <td>${slabHalf}%</td>
                <td>${formatCurrency(slab.taxAmt / 2)}</td>
                <td>${slabHalf}%</td>
                <td>${formatCurrency(slab.taxAmt / 2)}</td>
                <td>-</td>
                <td>-</td>
              </tr>`
            : `<tr>
                <td>${slab.rate}%</td>
                <td>${formatCurrency(slab.taxableAmt)}</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
                <td>${slab.rate}%</td>
                <td>${formatCurrency(slab.taxAmt)}</td>
              </tr>`;
        }).join("")
      : invoice.tax?.enabled
        ? isCgstSgst
          ? `<tr>
              <td>${taxRate}%</td>
              <td>${formatCurrency(afterDiscount)}</td>
              <td>${halfRate}%</td>
              <td>${formatCurrency(cgstAmt)}</td>
              <td>${halfRate}%</td>
              <td>${formatCurrency(sgstAmt)}</td>
              <td>-</td>
              <td>-</td>
            </tr>`
          : `<tr>
              <td>${taxRate}%</td>
              <td>${formatCurrency(afterDiscount)}</td>
              <td>-</td>
              <td>-</td>
              <td>-</td>
              <td>-</td>
              <td>${taxRate}%</td>
              <td>${formatCurrency(igstAmt)}</td>
            </tr>`
        : ""
    : "";

  const numberToWords = (num: number): string => {
    const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
      "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    const convert = (n: number): string => {
      if (n < 20) return ones[n];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
      if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + convert(n % 100) : "");
      if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
      if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + convert(n % 100000) : "");
      return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + convert(n % 10000000) : "");
    };
    const rupees = Math.floor(num);
    const paise = Math.round((num - rupees) * 100);
    let result = "Indian Rupees " + (rupees > 0 ? convert(rupees) : "Zero");
    if (paise > 0) result += " and " + convert(paise) + " Paise";
    return result + " Only";
  };

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Tax Invoice ${invoice.invoiceNumber}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #1a1a2e; background: #fff; font-size: 13px; }
  .page { padding: 24px; max-width: 900px; margin: 0 auto; }
  .title-bar { background: #4F46E5; color: white; text-align: center; padding: 10px; font-size: 16px; font-weight: 700; letter-spacing: 2px; margin-bottom: 16px; }
  .header-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
  .box { border: 1px solid #ccc; border-radius: 4px; padding: 10px; }
  .box-title { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #78909C; margin-bottom: 6px; font-weight: 600; }
  .business-name { font-size: 17px; font-weight: 700; color: #4F46E5; }
  .gstin-badge { display: inline-block; background: #EEF2FF; color: #4F46E5; border: 1px solid #C7D2FE; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-top: 4px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 12px; color: #444; }
  .meta-label { color: #78909C; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12px; }
  .items-table thead { background: #4F46E5; color: white; }
  .tax-table thead { background: #1e1b4b; color: white; }
  th { padding: 8px 10px; text-align: left; font-weight: 600; }
  th.right, td.right { text-align: right; }
  th.center, td.center { text-align: center; }
  td { padding: 8px 10px; border-bottom: 1px solid #eee; }
  tbody tr:nth-child(even) { background: #F8F9FF; }
  .totals-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
  .words-box { border: 1px solid #C7D2FE; background: #EEF2FF; border-radius: 4px; padding: 10px; font-size: 12px; }
  .words-label { font-size: 10px; color: #6366F1; text-transform: uppercase; font-weight: 600; margin-bottom: 4px; }
  .summary-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
  .summary-row.total { font-size: 15px; font-weight: 700; color: #4F46E5; border-top: 2px solid #4F46E5; padding-top: 8px; margin-top: 4px; }
  .notes-box { border: 1px solid #eee; background: #fafafa; border-radius: 4px; padding: 10px; margin-bottom: 12px; font-size: 12px; color: #555; }
  .footer { text-align: center; font-size: 11px; color: #B0BEC5; margin-top: 16px; padding-top: 8px; border-top: 1px solid #eee; }
  .status-badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
  .status-draft { background: #FEF3C7; color: #92400E; }
  .status-sent { background: #DBEAFE; color: #1E40AF; }
  .status-paid { background: #D1FAE5; color: #065F46; }
</style>
</head>
<body>
<div class="page">
  <div class="title-bar">TAX INVOICE</div>
  <div class="header-grid">
    <div class="box">
      <div class="box-title">Seller / Vendor</div>
      <div class="business-name">${vendor.businessName}</div>
      <div style="margin-top:4px;color:#555;line-height:1.6">${vendor.address}</div>
      <div style="color:#555">${vendor.vendorName} · ${vendor.whatsappNumber}</div>
      ${vendor.gstNumber ? `<div class="gstin-badge">GSTIN: ${vendor.gstNumber}</div>` : ""}
    </div>
    <div class="box">
      <div class="box-title">Invoice Details</div>
      <div class="meta-grid">
        <span class="meta-label">Invoice No.</span><span><strong>${invoice.invoiceNumber}</strong></span>
        <span class="meta-label">Invoice Date</span><span>${invoiceDate}</span>
        ${dueDate ? `<span class="meta-label">Due Date</span><span>${dueDate}</span>` : ""}
        <span class="meta-label">Place of Supply</span><span>${invoice.placeOfSupply}</span>
      </div>
    </div>
  </div>
  <div class="header-grid">
    <div class="box">
      <div class="box-title">Bill To</div>
      <div style="font-size:15px;font-weight:700">${lead.name}</div>
      <div style="color:#555;margin-top:2px">${lead.whatsappNumber}</div>
      ${lead.email ? `<div style="color:#555">${lead.email}</div>` : ""}
      ${invoice.buyerGstin ? `<div class="gstin-badge" style="margin-top:4px">GSTIN: ${invoice.buyerGstin}</div>` : ""}
    </div>
    <div></div>
  </div>

  <table class="items-table">
    <thead>
      <tr>
        <th>Description</th>
        <th class="center">HSN/SAC</th>
        <th class="center">Qty</th>
        <th class="right">Rate (₹)</th>
        <th class="right">Amount (₹)</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  ${taxAmount > 0 ? `
  <table class="tax-table">
    <thead>
      <tr>
        <th>Tax Rate</th>
        <th>Taxable Amt</th>
        <th>CGST %</th>
        <th>CGST Amt</th>
        <th>SGST %</th>
        <th>SGST Amt</th>
        <th>IGST %</th>
        <th>IGST Amt</th>
      </tr>
    </thead>
    <tbody>${taxBreakdownRows}</tbody>
  </table>` : ""}

  <div class="totals-grid">
    <div class="words-box">
      <div class="words-label">Amount in Words</div>
      <div>${numberToWords(grandTotal)}</div>
    </div>
    <div>
      <div class="summary-row"><span style="color:#555">Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
      ${invoice.discount?.enabled && discountAmount > 0 ? `<div class="summary-row"><span style="color:#E53935">Discount</span><span style="color:#E53935">-${formatCurrency(discountAmount)}</span></div>` : ""}
      ${taxAmount > 0 ? (hasPerItemTaxes ? (isCgstSgst ? `
        <div class="summary-row"><span style="color:#555">CGST</span><span>${formatCurrency(taxAmount / 2)}</span></div>
        <div class="summary-row"><span style="color:#555">SGST</span><span>${formatCurrency(taxAmount / 2)}</span></div>
      ` : `
        <div class="summary-row"><span style="color:#555">IGST</span><span>${formatCurrency(taxAmount)}</span></div>
      `) : invoice.tax?.enabled ? (isCgstSgst ? `
        <div class="summary-row"><span style="color:#555">CGST (${halfRate}%)</span><span>${formatCurrency(cgstAmt)}</span></div>
        <div class="summary-row"><span style="color:#555">SGST (${halfRate}%)</span><span>${formatCurrency(sgstAmt)}</span></div>
      ` : `
        <div class="summary-row"><span style="color:#555">IGST (${taxRate}%)</span><span>${formatCurrency(igstAmt)}</span></div>
      `) : "") : ""}
      <div class="summary-row total"><span>Grand Total</span><span>${formatCurrency(grandTotal)}</span></div>
    </div>
  </div>

  ${invoice.notes ? `<div class="notes-box"><strong>Notes:</strong> ${invoice.notes}</div>` : ""}

  <div class="footer">
    This is a computer-generated invoice. · Generated by VendorDesk.ai
  </div>
</div>
</body>
</html>`;
}

export async function shareOnWhatsApp(
  leadWhatsApp: string,
  businessName: string,
  leadName: string
): Promise<void> {
  const cleanNumber = leadWhatsApp.replace(/\D/g, "");
  const message = encodeURIComponent(
    `Hi ${leadName}, I am ${businessName}. Here is your quotation.`
  );
  const url = `https://wa.me/${cleanNumber}?text=${message}`;
  const canOpen = await Linking.canOpenURL(url);
  if (canOpen) {
    await Linking.openURL(url);
  }
}

export async function shareQuotationText(
  quotation: Quotation,
  vendor: VendorProfile,
  lead: Lead
): Promise<void> {
  const subtotal = quotation.items.reduce(
    (sum, item) => sum + item.quantity * item.rate,
    0
  );
  const formatCurrency = (amount: number) =>
    `₹${amount.toLocaleString("en-IN")}`;

  const itemLines = quotation.items
    .map(
      (item) =>
        `• ${item.name} - ${item.quantity} ${item.unit} x ${formatCurrency(item.rate)} = ${formatCurrency(item.quantity * item.rate)}`
    )
    .join("\n");

  const date = new Date(quotation.createdAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const text = `*${quotation.quoteNumber}* | ${date}
*${vendor.businessName}*

Quotation for: *${lead.name}*

${itemLines}

---
*Total: ${formatCurrency(subtotal)}*

${quotation.notes ? `Notes: ${quotation.notes}\n\n` : ""}Generated by VendorDesk.ai`;

  await Share.share({
    message: text,
    title: `Quotation ${quotation.quoteNumber}`,
  });
}
