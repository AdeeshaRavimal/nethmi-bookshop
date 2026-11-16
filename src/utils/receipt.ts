import type { GRNHeader, GRNItem } from '../db';

export interface ReceiptLineItem {
  title: string;
  quantity: number;
  unit_price: number;
  discount_percent?: number;
  original_price?: number;
  is_special_discount?: boolean;
}

export interface ReceiptData {
  receipt_no: string;
  created_at: string;
  payment_type: string;
  total_amount: number;
  items: ReceiptLineItem[];
  subtotal?: number;
  bill_discount?: number;
  cash_tendered?: number;
  change_amount?: number;
  customer_name?: string;
  customer_phone?: string;
  points_earned?: number;
  points_balance?: number;
  previous_due?: number;
  credit_due_amount?: number;
}

const SHOP_NAME = 'Hiru Bookshop & Communication';
const SHOP_ADDRESS = 'Maniyangama, Avissawella';
const SHOP_PHONE = '070200042';
const FOOTER = 'Thank you for your business!';

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

function money(n: number): string {
  return `Rs. ${Number(n).toFixed(2)}`;
}

/**
 * Builds an A5 Portrait retail invoice and prints ONLY that invoice by
 * writing it into a hidden, dedicated iframe.
 */
export function printReceipt(data: ReceiptData): void {
  const date = new Date(data.created_at).toLocaleString('en-LK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const isCredit = data.payment_type === 'CREDIT';

  const rows = data.items.map((item, index) => {
    const lineTotal = item.unit_price * item.quantity;
    const origPrice = Number(item.original_price ?? 0);
    const isReduced = origPrice > 0 && origPrice > item.unit_price;
    const hasDiscount = isReduced && ((item.discount_percent || 0) > 0 || item.is_special_discount);
    const originalLine = hasDiscount
      ? `<span class="strike">${money(origPrice * item.quantity)}</span>`
      : '';
    const discountNote = hasDiscount
      ? `<span class="disc-pill">-${item.discount_percent ? `${item.discount_percent}%` : money((origPrice - item.unit_price) * item.quantity)}</span>`
      : '';
      
    return `
      <tr>
        <td class="col-idx">${index + 1}</td>
        <td class="col-desc">
          <div class="item-title">${escapeHtml(item.title)}</div>
          ${discountNote}
        </td>
        <td class="col-qty">${item.quantity}</td>
        <td class="col-price">${money(item.unit_price)}</td>
        <td class="col-total">${originalLine}${money(lineTotal)}</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Invoice ${escapeHtml(data.receipt_no)}</title>
<style>
  @page {
    size: A5 portrait;
    margin: 8mm 8mm 10mm 8mm;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", Helvetica, Arial, sans-serif;
    width: 100%;
    margin: 0;
    padding: 0;
    color: #0f172a;
    font-size: 11px;
    line-height: 1.35;
    background: #ffffff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── Header & Business Letterhead ── */
  .inv-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #0f172a;
    padding-bottom: 8px;
    margin-bottom: 10px;
  }
  .company h1 {
    font-size: 17px;
    font-weight: 800;
    margin: 0 0 2px 0;
    color: #0f172a;
    letter-spacing: -0.2px;
    text-transform: uppercase;
  }
  .company p {
    margin: 1px 0;
    color: #475569;
    font-size: 10.5px;
  }
  .inv-badge-block {
    text-align: right;
  }
  .inv-type-title {
    font-size: 15px;
    font-weight: 800;
    margin: 0 0 3px 0;
    color: ${isCredit ? '#b91c1c' : '#0f172a'};
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .inv-number {
    font-family: monospace;
    font-size: 13px;
    font-weight: 700;
    color: #0f172a;
    margin: 0;
  }

  /* ── Meta Details Strip (Customer & Invoice Info) ── */
  .meta-container {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 7px 10px;
    margin-bottom: 12px;
  }
  .meta-left {
    flex: 1;
  }
  .meta-right {
    text-align: right;
  }
  .meta-label {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    color: #64748b;
    letter-spacing: 0.4px;
    margin-bottom: 2px;
  }
  .meta-value {
    font-size: 11px;
    font-weight: 600;
    color: #0f172a;
  }
  .meta-sub {
    font-size: 10px;
    color: #475569;
  }
  .payment-pill {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    background: #e2e8f0;
    color: #1e293b;
    margin-top: 2px;
  }

  /* ── Items Table ── */
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 10px;
  }
  thead {
    display: table-header-group;
  }
  th {
    background: #f1f5f9;
    color: #1e293b;
    border-top: 1px solid #0f172a;
    border-bottom: 1px solid #0f172a;
    padding: 5px 6px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  td {
    border-bottom: 1px solid #e2e8f0;
    padding: 5px 6px;
    vertical-align: middle;
    font-size: 11px;
  }
  tr {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .col-idx {
    width: 20px;
    text-align: center;
    color: #64748b;
    font-weight: 600;
    font-size: 10px;
  }
  .col-desc {
    text-align: left;
  }
  .item-title {
    font-weight: 600;
    color: #0f172a;
  }
  .disc-pill {
    display: inline-block;
    font-size: 9px;
    color: #b45309;
    background: #fef3c7;
    border: 1px solid #fde68a;
    padding: 0 4px;
    border-radius: 3px;
    font-weight: 700;
    margin-top: 1px;
  }
  .col-qty {
    width: 36px;
    text-align: center;
    font-weight: 700;
    font-family: monospace;
    font-size: 11px;
  }
  .col-price {
    width: 70px;
    text-align: right;
    font-family: monospace;
    color: #334155;
  }
  .col-total {
    width: 80px;
    text-align: right;
    font-family: monospace;
    font-weight: 700;
    color: #0f172a;
  }
  .strike {
    text-decoration: line-through;
    color: #94a3b8;
    font-size: 9.5px;
    display: block;
  }

  /* ── Settlement / Financial Summary ── */
  .summary-container {
    display: flex;
    justify-content: flex-end;
    margin-top: 6px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .totals-box {
    width: 230px;
  }
  .total-line {
    display: flex;
    justify-content: space-between;
    padding: 2.5px 0;
    font-size: 11px;
    color: #334155;
  }
  .total-line.grand {
    font-size: 14.5px;
    font-weight: 800;
    color: #0f172a;
    border-top: 2px solid #0f172a;
    border-bottom: 2px solid #0f172a;
    padding: 5px 0;
    margin: 4px 0;
  }
  .total-line.credit-due {
    background: #fef2f2;
    border: 1px dashed #ef4444;
    border-radius: 4px;
    padding: 4px 6px;
    font-size: 12px;
    font-weight: 800;
    color: #dc2626;
    margin-top: 4px;
  }
  .total-line.change-due {
    color: #16a34a;
    font-weight: 700;
  }

  /* ── Sign-off & Footer ── */
  .inv-sign-block {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-top: 24px;
    padding-top: 8px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .sign-col {
    text-align: center;
    border-top: 1px dashed #94a3b8;
    padding-top: 4px;
    font-size: 9.5px;
    color: #475569;
  }
  .inv-footer {
    margin-top: 16px;
    text-align: center;
    border-top: 1px solid #e2e8f0;
    padding-top: 8px;
    font-size: 10px;
    color: #64748b;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .terms-note {
    font-size: 9px;
    color: #64748b;
    margin-bottom: 3px;
  }
  .branding {
    font-size: 8.5px;
    color: #94a3b8;
    margin: 2px 0 0 0;
  }
</style>
</head>
<body>
  <!-- Letterhead -->
  <div class="inv-header">
    <div class="company">
      <h1>${SHOP_NAME}</h1>
      <p>Books • Stationery • Office & School Supplies • Color Copy</p>
      <p>${SHOP_ADDRESS} • Tel: <strong>${SHOP_PHONE}</strong></p>
    </div>
    <div class="inv-badge-block">
      <div class="inv-type-title">${isCredit ? 'Credit Invoice' : 'Retail Cash Bill'}</div>
      <p class="inv-number">${escapeHtml(data.receipt_no)}</p>
    </div>
  </div>

  <!-- Meta Strip -->
  <div class="meta-container">
    <div class="meta-left">
      <div class="meta-label">Billed To</div>
      <div class="meta-value">${data.customer_name ? escapeHtml(data.customer_name) : 'Cash Customer / Walk-in'}</div>
      ${data.customer_phone ? `<div class="meta-sub">Tel: ${escapeHtml(data.customer_phone)}</div>` : ''}
    </div>
    <div class="meta-right">
      <div class="meta-label">Invoice Details</div>
      <div class="meta-sub">Date: <strong>${date}</strong></div>
      <div><span class="payment-pill">${escapeHtml(data.payment_type)}</span></div>
    </div>
  </div>

  <!-- Items Table -->
  <table>
    <thead>
      <tr>
        <th class="col-idx">#</th>
        <th class="col-desc">Item Description</th>
        <th class="col-qty">Qty</th>
        <th class="col-price">Price</th>
        <th class="col-total">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <!-- Financial Summary -->
  <div class="summary-container">
    <div class="totals-box">
      ${(data.bill_discount && data.bill_discount > 0) ? `
      <div class="total-line">
        <span>Subtotal:</span>
        <span style="font-family:monospace;">${money(data.subtotal ?? (data.total_amount + data.bill_discount))}</span>
      </div>
      <div class="total-line" style="color: #b91c1c;">
        <span>Bill Discount:</span>
        <span style="font-family:monospace;">- ${money(data.bill_discount)}</span>
      </div>` : ''}
      
      <div class="total-line grand">
        <span>NET TOTAL:</span>
        <span style="font-family:monospace;">${money(data.total_amount)}</span>
      </div>

      ${(data.payment_type === 'CASH' && data.cash_tendered != null && data.cash_tendered > 0) ? `
      <div class="total-line" style="border-top:1px dashed #cbd5e1; padding-top:3px; margin-top:2px;">
        <span>Cash Tendered:</span>
        <span style="font-family:monospace;">${money(data.cash_tendered)}</span>
      </div>
      <div class="total-line change-due">
        <span>Change Return:</span>
        <span style="font-family:monospace;">${money(data.change_amount ?? Math.max(0, data.cash_tendered - data.total_amount))}</span>
      </div>` : ''}

      ${(data.payment_type === 'CREDIT' && data.previous_due != null) ? `
      <div class="total-line" style="border-top:1px dashed #cbd5e1; padding-top:3px; margin-top:2px;">
        <span>Previous Balance:</span>
        <span style="font-family:monospace;">${money(data.previous_due)}</span>
      </div>
      <div class="total-line">
        <span>This Bill:</span>
        <span style="font-family:monospace;">${money(data.total_amount)}</span>
      </div>` : ''}

      ${(data.credit_due_amount != null && (data.credit_due_amount > 0 || isCredit)) ? `
      <div class="total-line credit-due">
        <span>${isCredit ? 'TOTAL CREDIT DUE:' : 'REMAINING CREDIT:'}</span>
        <span style="font-family:monospace;">${money(data.credit_due_amount)}</span>
      </div>` : ''}
    </div>
  </div>

  <!-- Signatures Block (Crucial for A5 credit invoices & customer verification) -->
  <div class="inv-sign-block">
    <div class="sign-col">
      <p style="margin:0 0 16px 0;"></p>
      <span>Customer Signature</span>
    </div>
    <div class="sign-col">
      <p style="margin:0 0 16px 0;"></p>
      <span>Authorized / Cashier</span>
    </div>
  </div>

  <!-- Footer -->
  <div class="inv-footer">
    <div class="terms-note">Goods once sold can be exchanged within 7 days in original condition with this invoice.</div>
    <div style="font-weight: 600; color: #1e293b;">${FOOTER}</div>
    <div class="branding">Software by inkoart.online • 0724207000</div>
  </div>

  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 150); };<` + `/script>
</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  // Clean up the iframe after the print dialog closes.
  iframe.contentWindow?.addEventListener('afterprint', () => {
    document.body.removeChild(iframe);
  });
  // Fallback cleanup in case afterprint doesn't fire.
  setTimeout(() => {
    if (iframe.parentNode) document.body.removeChild(iframe);
  }, 60000);
}

/**
 * Builds clean, professionally-formatted WhatsApp receipt text.
 */
export function buildWhatsAppReceiptText(data: ReceiptData): string {
  const date = new Date(data.created_at).toLocaleString();
  const itemsList = (data.items || [])
    .map(i => {
      const unitPrice = Number(i.unit_price ?? (i as any).selling_price ?? 0);
      const qty = Number(i.quantity ?? 1);
      const lineTotal = unitPrice * qty;
      const origPrice = Number(i.original_price ?? 0);
      const isReduced = origPrice > 0 && origPrice > unitPrice;
      const hasDiscount = isReduced && ((i.discount_percent || 0) > 0 || i.is_special_discount);

      if (hasDiscount) {
        const discountAmt = (origPrice - unitPrice) * qty;
        return `• ${i.title}  x${qty}  =  Rs. ${lineTotal.toFixed(2)}\n   (Special Discount: -Rs. ${discountAmt.toFixed(2)})`;
      }
      return `• ${i.title}  x${qty}  =  Rs. ${lineTotal.toFixed(2)}`;
    })
    .join('\n');

  let text = `*${SHOP_NAME}*\n${SHOP_ADDRESS} (Tel: ${SHOP_PHONE})\n----------------------------------------\n*INVOICE / RECEIPT: ${data.receipt_no}*\nDate: ${date}\nPayment: ${data.payment_type}\n`;

  if (data.customer_name) {
    text += `Customer: ${data.customer_name}${data.customer_phone ? ` (${data.customer_phone})` : ''}\n`;
  }

  text += `----------------------------------------\n*Items Purchased:*\n${itemsList}\n----------------------------------------\n*TOTAL: Rs. ${Number(data.total_amount || 0).toFixed(2)}*`;

  if (data.bill_discount && data.bill_discount > 0) {
    text += `\n(Discount Saved: Rs. ${Number(data.bill_discount).toFixed(2)})`;
  }

  if (data.payment_type === 'CASH' && data.cash_tendered && data.cash_tendered > data.total_amount) {
    text += `\nCash Received: Rs. ${Number(data.cash_tendered).toFixed(2)}`;
    text += `\nChange Returned: Rs. ${(data.change_amount ?? Math.max(0, data.cash_tendered - data.total_amount)).toFixed(2)}`;
  }

  if (data.payment_type === 'CREDIT' && data.previous_due != null) {
    text += `\nPrevious Due: Rs. ${Number(data.previous_due).toFixed(2)}`;
    text += `\nThis Bill: Rs. ${Number(data.total_amount).toFixed(2)}`;
  }

  if (data.credit_due_amount != null && (data.credit_due_amount > 0 || data.payment_type === 'CREDIT')) {
    const label = data.payment_type === 'CREDIT' ? 'TOTAL CREDIT DUE' : 'REMAINING CREDIT DUE';
    text += `\n----------------------------------------\n*${label}: Rs. ${Number(data.credit_due_amount).toFixed(2)}*`;
  }

  text += `\n\nThank you for shopping with us! Have a great day!`;

  return text;
}

/**
 * Generates an HTML5 Canvas of the invoice bill and returns its base64 PNG data URL.
 * Can be saved as a high-resolution PNG image or sent to customers via WhatsApp.
 */
export function generateBillImage(data: ReceiptData): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      const width = 600;
      const rowHeight = 32;
      const hasCreditDue = data.credit_due_amount != null && (data.credit_due_amount > 0 || data.payment_type === 'CREDIT');
      const hasPrevDue = hasCreditDue && data.payment_type === 'CREDIT' && data.previous_due != null;
      const baseHeight = 560 + (hasCreditDue ? 50 : 0) + (hasPrevDue ? 30 : 0);
      const height = baseHeight + (data.items.length * rowHeight);

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas context not available'));

      // ── Background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // ── Header Box
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(0, 0, width, 120);

      // Header Texts
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px "Segoe UI", sans-serif';
      ctx.fillText(SHOP_NAME, 24, 42);

      ctx.font = '13px "Segoe UI", sans-serif';
      ctx.fillStyle = '#bfdbfe';
      ctx.fillText(`${SHOP_ADDRESS}  •  Tel: ${SHOP_PHONE}`, 24, 68);

      ctx.fillStyle = '#60a5fa';
      ctx.font = 'bold 12px "Segoe UI", sans-serif';
      ctx.fillText('INVOICE / RECEIPT', 24, 98);

      // Invoice info (Right aligned in header)
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px "Segoe UI", sans-serif';
      ctx.fillText(data.receipt_no, width - 24, 45);

      ctx.font = '12px "Segoe UI", sans-serif';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(new Date(data.created_at).toLocaleString(), width - 24, 70);

      ctx.font = 'bold 12px "Segoe UI", sans-serif';
      ctx.fillStyle = '#93c5fd';
      ctx.fillText(`PAYMENT: ${data.payment_type}`, width - 24, 98);
      ctx.textAlign = 'left';

      // ── Customer & Loyalty Info (if available)
      let y = 145;
      if (data.customer_name) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(20, y - 18, width - 40, 48);
        ctx.strokeStyle = '#e2e8f0';
        ctx.strokeRect(20, y - 18, width - 40, 48);

        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 13px "Segoe UI", sans-serif';
        ctx.fillText(`Customer: ${data.customer_name} ${data.customer_phone ? `(${data.customer_phone})` : ''}`, 32, y + 2);

        if (data.points_balance !== undefined) {
          ctx.textAlign = 'right';
          ctx.fillStyle = '#7c3aed';
          ctx.font = 'bold 12px "Segoe UI", sans-serif';
          ctx.fillText(`Loyalty Points: ${data.points_balance} pts (+${data.points_earned || 0} earned)`, width - 32, y + 2);
          ctx.textAlign = 'left';
        }
        y += 50;
      }

      // ── Table Header
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(20, y, width - 40, 32);

      ctx.fillStyle = '#475569';
      ctx.font = 'bold 12px "Segoe UI", sans-serif';
      ctx.fillText('ITEM DESCRIPTION', 32, y + 21);
      ctx.textAlign = 'center';
      ctx.fillText('QTY', 360, y + 21);
      ctx.textAlign = 'right';
      ctx.fillText('PRICE', 460, y + 21);
      ctx.fillText('AMOUNT', width - 32, y + 21);
      ctx.textAlign = 'left';

      y += 35;

      // ── Table Rows
      data.items.forEach((item, idx) => {
        ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#fafafa';
        ctx.fillRect(20, y - 4, width - 40, rowHeight);

        ctx.fillStyle = '#1e293b';
        ctx.font = '13px "Segoe UI", sans-serif';
        const displayTitle = item.title.length > 34 ? item.title.slice(0, 32) + '...' : item.title;
        ctx.fillText(displayTitle, 32, y + 16);

        ctx.textAlign = 'center';
        ctx.fillText(String(item.quantity), 360, y + 16);

        ctx.textAlign = 'right';
        ctx.fillText(`Rs.${item.unit_price.toFixed(2)}`, 460, y + 16);
        ctx.font = 'bold 13px "Segoe UI", sans-serif';
        ctx.fillText(`Rs.${(item.unit_price * item.quantity).toFixed(2)}`, width - 32, y + 16);
        ctx.textAlign = 'left';

        y += rowHeight;
      });

      // ── Summary Box
      y += 15;
      ctx.strokeStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.lineTo(width - 20, y);
      ctx.stroke();

      y += 20;
      if (data.subtotal && data.bill_discount && data.bill_discount > 0) {
        ctx.font = '13px "Segoe UI", sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText('Subtotal:', 340, y);
        ctx.textAlign = 'right';
        ctx.fillText(`Rs. ${data.subtotal.toFixed(2)}`, width - 32, y);
        ctx.textAlign = 'left';
        y += 22;

        ctx.fillStyle = '#dc2626';
        ctx.fillText('Bill Discount:', 340, y);
        ctx.textAlign = 'right';
        ctx.fillText(`- Rs. ${data.bill_discount.toFixed(2)}`, width - 32, y);
        ctx.textAlign = 'left';
        y += 22;
      }

      // Net Total
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 18px "Segoe UI", sans-serif';
      ctx.fillText('TOTAL AMOUNT:', 300, y + 8);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#1e3a8a';
      ctx.font = 'bold 22px "Segoe UI", sans-serif';
      ctx.fillText(`Rs. ${data.total_amount.toFixed(2)}`, width - 32, y + 8);
      ctx.textAlign = 'left';

      y += 35;
      if (data.payment_type === 'CASH' && data.cash_tendered && data.cash_tendered > data.total_amount) {
        ctx.font = '12px "Segoe UI", sans-serif';
        ctx.fillStyle = '#475569';
        ctx.fillText(`Cash Tendered: Rs. ${data.cash_tendered.toFixed(2)}`, 340, y);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#16a34a';
        ctx.fillText(`Change: Rs. ${(data.change_amount || 0).toFixed(2)}`, width - 32, y);
        ctx.textAlign = 'left';
        y += 25;
      }

      if (hasCreditDue) {
        if (hasPrevDue) {
          ctx.font = '12px "Segoe UI", sans-serif';
          ctx.fillStyle = '#64748b';
          ctx.fillText(`Previous Due: Rs. ${Number(data.previous_due).toFixed(2)}`, 340, y);
          ctx.textAlign = 'right';
          ctx.fillText(`This Bill: Rs. ${data.total_amount.toFixed(2)}`, width - 32, y);
          ctx.textAlign = 'left';
          y += 24;
        }

        y += 8;
        ctx.fillStyle = '#fef2f2';
        ctx.fillRect(20, y, width - 40, 36);
        ctx.strokeStyle = '#f87171';
        ctx.strokeRect(20, y, width - 40, 36);

        ctx.fillStyle = '#dc2626';
        ctx.font = 'bold 13px "Segoe UI", sans-serif';
        const label = data.payment_type === 'CREDIT' ? 'TOTAL DUE CREDIT BALANCE:' : 'REMAINING CREDIT BALANCE:';
        ctx.fillText(label, 32, y + 23);
        ctx.textAlign = 'right';
        ctx.font = 'bold 16px "Segoe UI", sans-serif';
        ctx.fillText(`Rs. ${Number(data.credit_due_amount).toFixed(2)}`, width - 32, y + 23);
        ctx.textAlign = 'left';
        y += 42;
      }

      // ── Footer
      y = height - 60;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, y, width, 60);

      ctx.fillStyle = '#475569';
      ctx.font = 'bold 12px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(FOOTER, width / 2, y + 25);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px "Segoe UI", sans-serif';
      ctx.fillText('System by Inkoart.online • Tel: 0724207000', width / 2, y + 44);

      resolve(canvas.toDataURL('image/png'));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Prints a clean, professional Goods Received Note (GRN) / Delivery Voucher
 * via a hidden iframe formatted for A4 / A5 printing.
 */
export function printGRNVoucher(data: { header: GRNHeader; items: GRNItem[] }): void {
  const { header, items } = data;
  const dateStr = header.received_date ? header.received_date.split('-').reverse().join('/') : '—';
  const dueDateStr = header.due_date ? header.due_date.split('-').reverse().join('/') : '—';
  const totalQty = items.reduce((sum, item) => sum + (item.received_qty || 0), 0);
  const totalRetail = items.reduce((sum, item) => sum + (item.received_qty * (item.selling_price || 0)), 0);

  const itemRows = items.map((item, idx) => `
    <tr>
      <td style="text-align: center; color: #64748b;">${idx + 1}</td>
      <td style="font-family: monospace; font-size: 11px;">${escapeHtml(item.barcode)}</td>
      <td style="font-weight: 600;">${escapeHtml(item.title)}</td>
      <td style="text-align: center; font-weight: bold;">${item.received_qty}</td>
      <td style="text-align: right;">${money(item.unit_cost)}</td>
      <td style="text-align: right; font-weight: bold;">${money(item.total_cost)}</td>
      <td style="text-align: right; color: #1e40af;">${item.selling_price > 0 ? money(item.selling_price) : '—'}</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>GRN ${escapeHtml(header.grn_number)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    color: #0f172a;
    background: #fff;
    margin: 0;
    padding: 0;
    font-size: 13px;
    line-height: 1.4;
  }
  .header-container {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #0f172a;
    padding-bottom: 12px;
    margin-bottom: 14px;
  }
  .company h1 {
    font-size: 20px;
    margin: 0 0 4px 0;
    font-weight: 800;
    text-transform: uppercase;
    color: #1e3a8a;
  }
  .company p {
    margin: 0;
    color: #475569;
    font-size: 12px;
  }
  .doc-title {
    text-align: right;
  }
  .doc-title h2 {
    font-size: 18px;
    margin: 0 0 2px 0;
    color: #0f172a;
    font-weight: 800;
    letter-spacing: 0.5px;
  }
  .doc-title p {
    margin: 0;
    font-size: 12px;
    color: #64748b;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 10px 14px;
    margin-bottom: 16px;
  }
  .meta-item .label {
    font-size: 10px;
    text-transform: uppercase;
    color: #64748b;
    font-weight: 700;
    letter-spacing: 0.5px;
    margin-bottom: 2px;
  }
  .meta-item .value {
    font-size: 13px;
    font-weight: 600;
    color: #0f172a;
  }
  table.items-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 16px;
  }
  table.items-table th {
    background: #f1f5f9;
    color: #334155;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 8px 10px;
    border: 1px solid #cbd5e1;
    text-align: left;
  }
  table.items-table td {
    padding: 7px 10px;
    border: 1px solid #e2e8f0;
    font-size: 12px;
  }
  table.items-table tr:nth-child(even) {
    background: #f8fafc;
  }
  .summary-container {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 28px;
  }
  .notes-box {
    width: 55%;
    font-size: 11px;
    color: #475569;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 8px 12px;
    background: #fafafa;
  }
  .totals-table {
    width: 38%;
    border-collapse: collapse;
  }
  .totals-table td {
    padding: 5px 8px;
    font-size: 12px;
  }
  .totals-table tr.grand-row td {
    border-top: 2px solid #0f172a;
    font-weight: 800;
    font-size: 14px;
    color: #1e3a8a;
  }
  .signatures {
    display: flex;
    justify-content: space-between;
    margin-top: 40px;
    padding-top: 10px;
  }
  .sig-block {
    width: 28%;
    text-align: center;
  }
  .sig-line {
    border-top: 1px dashed #64748b;
    margin-bottom: 6px;
    height: 1px;
  }
  .sig-label {
    font-size: 11px;
    font-weight: 600;
    color: #334155;
  }
  .sig-sub {
    font-size: 9px;
    color: #94a3b8;
  }
</style>
</head>
<body>
  <div class="header-container">
    <div class="company">
      <h1>${SHOP_NAME}</h1>
      <p>${SHOP_ADDRESS} • Tel: ${SHOP_PHONE}</p>
    </div>
    <div class="doc-title">
      <h2>GOODS RECEIVED NOTE (GRN)</h2>
      <p>Official Stock Inward & Delivery Voucher</p>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-item">
      <div class="label">GRN Number</div>
      <div class="value" style="font-family: monospace; font-weight: 800; color: #1e40af;">${escapeHtml(header.grn_number)}</div>
    </div>
    <div class="meta-item">
      <div class="label">Received Date</div>
      <div class="value">${dateStr}</div>
    </div>
    <div class="meta-item">
      <div class="label">Supplier</div>
      <div class="value">${escapeHtml(header.supplier_name || 'Walk-in / Direct')}</div>
    </div>
    <div class="meta-item">
      <div class="label">Supplier Invoice / DN #</div>
      <div class="value" style="font-family: monospace; font-weight: 700;">${escapeHtml(header.supplier_invoice_no || '—')}</div>
    </div>
    <div class="meta-item">
      <div class="label">Payment Type</div>
      <div class="value">${header.payment_type}</div>
    </div>
    <div class="meta-item">
      <div class="label">Payment Status</div>
      <div class="value">${header.status}${header.payment_type === 'CREDIT' && header.due_date ? ` (Due: ${dueDateStr})` : ''}</div>
    </div>
    <div class="meta-item">
      <div class="label">Total Units Received</div>
      <div class="value">${totalQty} units (${items.length} items)</div>
    </div>
    <div class="meta-item">
      <div class="label">Grand Total Cost</div>
      <div class="value" style="color: #1e3a8a;">${money(header.total_amount)}</div>
    </div>
  </div>

  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 32px; text-align: center;">#</th>
        <th style="width: 120px;">Barcode</th>
        <th>Item Description</th>
        <th style="width: 70px; text-align: center;">Qty</th>
        <th style="width: 100px; text-align: right;">Unit Cost</th>
        <th style="width: 120px; text-align: right;">Total Cost</th>
        <th style="width: 110px; text-align: right;">Retail Price</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <div class="summary-container">
    <div class="notes-box">
      <strong>Notes / Remarks:</strong>
      <p style="margin: 4px 0 0 0;">${header.notes ? escapeHtml(header.notes) : 'Stock received in good condition and added to inventory.'}</p>
    </div>
    <table class="totals-table">
      <tr>
        <td style="color: #64748b;">Total Received Quantity:</td>
        <td style="text-align: right; font-weight: bold;">${totalQty}</td>
      </tr>
      <tr>
        <td style="color: #64748b;">Total Retail Value:</td>
        <td style="text-align: right; font-weight: 600; color: #1e40af;">${money(totalRetail)}</td>
      </tr>
      <tr class="grand-row">
        <td>TOTAL COST VALUE:</td>
        <td style="text-align: right;">${money(header.total_amount)}</td>
      </tr>
    </table>
  </div>

  <div class="signatures">
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-label">Received By (Store Keeper)</div>
      <div class="sig-sub">Date & Signature</div>
    </div>
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-label">Checked & Approved By</div>
      <div class="sig-sub">Management Signature</div>
    </div>
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-label">Supplier / Delivery Rep</div>
      <div class="sig-sub">Handover Confirmation</div>
    </div>
  </div>

  <div style="margin-top: 25px; text-align: center; font-size: 10px; color: #94a3b8;">
    Generated on ${new Date().toLocaleString()} • Hiru Bookshop & Communication POS System
  </div>

  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 200); };<` + `/script>
</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  iframe.contentWindow?.addEventListener('afterprint', () => {
    document.body.removeChild(iframe);
  });
  setTimeout(() => {
    if (iframe.parentNode) document.body.removeChild(iframe);
  }, 60000);
}

export interface ReturnReceiptData {
  return_no: string;
  receipt_no: string;
  created_at: string;
  refund_method: string;
  reason: string;
  total_refund: number;
  items: Array<{
    title: string;
    quantity: number;
    unit_price: number;
    refund_amount: number;
  }>;
}

/**
 * Prints a 58mm Sales Return & Refund Voucher on thermal printer.
 */
export function printReturnReceipt(data: ReturnReceiptData): void {
  const date = new Date(data.created_at).toLocaleString();

  const rows = data.items.map(item => `
    <tr>
      <td colspan="2" class="desc">${escapeHtml(item.title)}</td>
    </tr>
    <tr>
      <td class="qty">${item.quantity} x ${money(item.unit_price)}</td>
      <td class="amount">${money(item.refund_amount)}</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Return Voucher - ${escapeHtml(data.return_no)}</title>
  <style>
    @page { size: 58mm auto; margin: 0; }
    body {
      width: 58mm;
      margin: 0;
      padding: 6px 8px 16px 8px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      line-height: 1.3;
      color: #000;
      box-sizing: border-box;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .shop-name { font-size: 14px; font-weight: bold; }
    .header-tag {
      display: inline-block;
      margin: 4px 0;
      padding: 2px 6px;
      border: 1px dashed #000;
      font-weight: bold;
      font-size: 13px;
    }
    .divider {
      border-top: 1px dashed #000;
      margin: 6px 0;
    }
    table { width: 100%; border-collapse: collapse; }
    .desc { padding-top: 3px; font-weight: 500; }
    .qty { font-size: 11px; }
    .amount { text-align: right; font-size: 12px; }
    .total-row {
      font-size: 14px;
      font-weight: bold;
    }
    .footer {
      text-align: center;
      font-size: 10px;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="center">
    <div class="shop-name">${escapeHtml(SHOP_NAME)}</div>
    <div>${escapeHtml(SHOP_ADDRESS)}</div>
    <div>Tel: ${escapeHtml(SHOP_PHONE)}</div>
    <div class="divider"></div>
    <div class="header-tag">SALES RETURN / VOUCHER</div>
    <div><strong>Voucher:</strong> ${escapeHtml(data.return_no)}</div>
    <div><strong>Original Bill:</strong> ${escapeHtml(data.receipt_no)}</div>
    <div>${escapeHtml(date)}</div>
    <div>Refund: <strong>${escapeHtml(data.refund_method)}</strong></div>
    ${data.reason ? `<div>Reason: ${escapeHtml(data.reason)}</div>` : ''}
  </div>

  <div class="divider"></div>

  <table>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="divider"></div>

  <table>
    <tr class="total-row">
      <td>TOTAL REFUND:</td>
      <td class="amount">${money(data.total_refund)}</td>
    </tr>
  </table>

  <div class="divider"></div>

  <div class="footer">
    Items returned and restocked.<br>
    Please keep this slip for reference.<br>
    Thank you!
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 150);
    };
  </script>
</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  iframe.contentWindow?.addEventListener('afterprint', () => {
    document.body.removeChild(iframe);
  });
  setTimeout(() => {
    if (iframe.parentNode) document.body.removeChild(iframe);
  }, 60000);
}

// ── Daily Shift Close & Z-Report Thermal Printing ───────────────────────────

export interface ZReportData {
  closing_date: string;
  closed_at: string;
  opening_balance: number;
  pos_cash_sales: number;
  customer_debt_collected: number;
  supplier_cash_paid: number;
  expenses: number;
  other_in: number;
  other_out: number;
  expected_cash: number;
  counted_cash: number;
  variance: number;
  card_sales?: number;
  credit_sales?: number;
  total_gross_sales?: number;
  pos_sales_count: number;
  denominations?: Record<string, number>;
  notes?: string;
}

export function printZReport(data: ZReportData): void {
  const isMatch = Math.abs(data.variance) < 0.01;
  const isSurplus = data.variance > 0.01;
  const varianceStatus = isMatch ? 'EXACT MATCH' : isSurplus ? `SURPLUS (+${money(data.variance)})` : `SHORTAGE (-${money(Math.abs(data.variance))})`;

  let denomRows = '';
  if (data.denominations) {
    const dKeys = ['5000', '1000', '500', '100', '50', '20', 'coins'];
    const renderedDenoms = dKeys
      .map(k => {
        const count = data.denominations![k] || 0;
        if (count <= 0) return '';
        const val = k === 'coins' ? count : Number(k) * count;
        const label = k === 'coins' ? 'Coins Total' : `Rs. ${k} x ${count}`;
        return `<tr><td style="padding:1px 0;">${label}</td><td style="text-align:right;padding:1px 0;">${money(val)}</td></tr>`;
      })
      .filter(Boolean)
      .join('');
    if (renderedDenoms) {
      denomRows = `
        <div class="divider"></div>
        <div class="center bold" style="margin:4px 0;">CASH DRAWER BREAKDOWN</div>
        <table><tbody>${renderedDenoms}</tbody></table>
      `;
    }
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Z-Report - ${escapeHtml(data.closing_date)}</title>
  <style>
    @page { size: 58mm auto; margin: 0; }
    @media print {
      body { width: 48mm; margin: 2mm auto; }
      .no-print { display: none !important; }
    }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10px;
      line-height: 1.25;
      color: #000;
      background: #fff;
      padding: 3mm 2mm;
    }
    .center { text-align: center; }
    .right { text-align: right; }
    .bold { font-weight: bold; }
    .shop-name { font-size: 13px; font-weight: bold; letter-spacing: 0.5px; }
    .title-banner {
      font-size: 11px;
      font-weight: bold;
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000;
      padding: 3px 0;
      margin: 4px 0;
      text-align: center;
    }
    .divider { border-top: 1px dashed #000; margin: 4px 0; }
    .double-divider { border-top: 2px solid #000; margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    td { vertical-align: top; padding: 1.5px 0; }
    .amount { text-align: right; font-family: monospace; }
    .footer { text-align: center; font-size: 8px; margin-top: 6px; }
  </style>
</head>
<body>
  <div class="center">
    <div class="shop-name">${SHOP_NAME}</div>
    <div>${SHOP_ADDRESS}</div>
    <div>Tel: ${SHOP_PHONE}</div>
  </div>

  <div class="title-banner">DAILY Z-REPORT / SHIFT CLOSE</div>

  <table>
    <tr><td>Date:</td><td class="amount bold">${escapeHtml(data.closing_date)}</td></tr>
    <tr><td>Closed At:</td><td class="amount">${escapeHtml(data.closed_at)}</td></tr>
  </table>

  <div class="divider"></div>
  <div class="bold" style="margin-bottom:2px;">DRAWER CASH RECONCILIATION</div>
  <table>
    <tr><td>Opening Cash:</td><td class="amount">${money(data.opening_balance)}</td></tr>
    <tr><td>+ POS Cash Sales (${data.pos_sales_count}):</td><td class="amount bold">${money(data.pos_cash_sales)}</td></tr>
    <tr><td>+ Debt Collected:</td><td class="amount">${money(data.customer_debt_collected)}</td></tr>
    ${data.other_in > 0 ? `<tr><td>+ Other Cash In:</td><td class="amount">${money(data.other_in)}</td></tr>` : ''}
    <tr><td>- Supplier Cash Paid:</td><td class="amount">-${money(data.supplier_cash_paid)}</td></tr>
    <tr><td>- Expenses / Drawings:</td><td class="amount">-${money(data.expenses + data.other_out)}</td></tr>
    <tr class="bold" style="border-top:1px solid #000;">
      <td>EXPECTED DRAWER CASH:</td>
      <td class="amount">${money(data.expected_cash)}</td>
    </tr>
    <tr class="bold" style="font-size:11px;">
      <td>ACTUAL COUNTED CASH:</td>
      <td class="amount">${money(data.counted_cash)}</td>
    </tr>
    <tr class="bold" style="font-size:11px;border-top:1px dashed #000;">
      <td>VARIANCE:</td>
      <td class="amount">${varianceStatus}</td>
    </tr>
  </table>

  ${denomRows}

  <div class="double-divider"></div>
  <div class="bold" style="margin-bottom:2px;">TOTAL REVENUE OVERVIEW</div>
  <table>
    <tr><td>Total Cash Sales:</td><td class="amount">${money(data.pos_cash_sales)}</td></tr>
    ${data.card_sales !== undefined ? `<tr><td>Card Payments:</td><td class="amount">${money(data.card_sales)}</td></tr>` : ''}
    ${data.credit_sales !== undefined ? `<tr><td>Credit Book Sales:</td><td class="amount">${money(data.credit_sales)}</td></tr>` : ''}
    ${data.total_gross_sales !== undefined ? `
    <tr class="bold" style="border-top:1px solid #000;">
      <td>TOTAL GROSS SALES:</td>
      <td class="amount">${money(data.total_gross_sales)}</td>
    </tr>` : ''}
  </table>

  ${data.notes ? `
  <div class="divider"></div>
  <div style="font-size:9px;"><strong>Notes:</strong> ${escapeHtml(data.notes)}</div>
  ` : ''}

  <div class="divider"></div>
  <div class="footer">
    Official Shift Closure Document<br>
    Printed directly from POS System
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 150);
    };
  </script>
</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  iframe.contentWindow?.addEventListener('afterprint', () => {
    document.body.removeChild(iframe);
  });
  setTimeout(() => {
    if (iframe.parentNode) document.body.removeChild(iframe);
  }, 60000);
}
