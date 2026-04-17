import { Quotation, VendorProfile, Lead } from "./storage";
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
