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
 * Builds a 58mm thermal-printer receipt and prints ONLY that receipt by
 * writing it into a hidden, dedicated iframe. This avoids the previous
 * behaviour of `window.print()` which printed the entire application UI.
 */
export function printReceipt(data: ReceiptData): void {
  const date = new Date(data.created_at).toLocaleString();

  const rows = data.items.map(item => {
    const lineTotal = item.unit_price * item.quantity;
    const origPrice = Number(item.original_price ?? 0);
    const isReduced = origPrice > 0 && origPrice > item.unit_price;
    const hasDiscount = isReduced && ((item.discount_percent || 0) > 0 || item.is_special_discount);
    const originalLine = hasDiscount
      ? `<span class="strike">${money(origPrice * item.quantity)}</span>`
      : '';
    const discountNote = hasDiscount
      ? `<br><span style="font-size:11px; color:#d97706; font-weight:600;">(Special Discount: ${item.discount_percent ? `${item.discount_percent}%` : money((origPrice - item.unit_price) * item.quantity)})</span>`
      : '';
      
    return `
      <tr>
        <td>${escapeHtml(item.title)}${discountNote}</td>
        <td class="num">${item.quantity}</td>
        <td class="num">${money(item.unit_price)}</td>
        <td class="num">${originalLine}${money(lineTotal)}</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Invoice ${escapeHtml(data.receipt_no)}</title>
<style>
  @page { size: A5 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", system-ui, sans-serif; width: 100%; margin: 0 auto; color: #000; font-size: 13px; line-height: 1.4; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #222; padding-bottom: 10px; margin-bottom: 15px; }
  .shop-info h1 { font-size: 22px; margin: 0 0 5px 0; font-weight: 800; text-transform: uppercase; }
  .shop-info p { margin: 0; color: #444; }
  .invoice-info { text-align: right; }
  .invoice-info h2 { font-size: 18px; margin: 0 0 5px 0; color: #555; text-transform: uppercase; letter-spacing: 1px; }
  .invoice-info p { margin: 2px 0; color: #333; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
  th { border-bottom: 2px solid #000; padding: 6px 4px; text-align: left; font-weight: bold; font-size: 12px; text-transform: uppercase; }
  td { border-bottom: 1px solid #eee; padding: 8px 4px; vertical-align: top; }
  th.num, td.num { text-align: right; }
  .strike { text-decoration: line-through; color: #888; font-size: 11px; display: block; }
  .totals { width: 300px; margin-left: auto; }
  .total-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px; }
  .total-row.grand { font-size: 18px; font-weight: bold; border-top: 2px solid #000; padding-top: 8px; margin-top: 4px; }
  .footer { margin-top: 20px; text-align: center; color: #555; font-size: 11px; border-top: 1px solid #ddd; padding-top: 10px; }
</style>
</head>
<body>
  <div class="header">
    <div class="shop-info">
      <h1>${SHOP_NAME}</h1>
      <p>${SHOP_ADDRESS}</p>
      <p>Tel: ${SHOP_PHONE}</p>
    </div>
    <div class="invoice-info">
      <h2>INVOICE / BILL</h2>
      <p>No: ${escapeHtml(data.receipt_no)}</p>
      <p>Date: ${date}</p>
      <p>Payment: ${escapeHtml(data.payment_type)}</p>
      ${data.customer_name ? `<p>Customer: <strong>${escapeHtml(data.customer_name)}</strong>${data.customer_phone ? ` (${escapeHtml(data.customer_phone)})` : ''}</p>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Item Description</th>
        <th class="num" style="width: 80px;">Qty</th>
        <th class="num" style="width: 120px;">Unit Price</th>
        <th class="num" style="width: 140px;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="totals">
    ${(data.bill_discount && data.bill_discount > 0) ? `
    <div class="total-row">
      <span>Subtotal</span>
      <span>${money(data.subtotal ?? (data.total_amount + data.bill_discount))}</span>
    </div>
    <div class="total-row" style="color: #dc2626;">
      <span>Bill Discount</span>
      <span>- ${money(data.bill_discount)}</span>
    </div>` : ''}
    <div class="total-row grand">
      <span>NET TOTAL</span>
      <span>${money(data.total_amount)}</span>
    </div>
    ${(data.payment_type === 'CASH' && data.cash_tendered != null && data.cash_tendered > 0) ? `
    <div class="total-row" style="margin-top: 6px; border-top: 1px dashed #ccc; padding-top: 4px;">
      <span>Cash Tendered</span>
      <span>${money(data.cash_tendered)}</span>
    </div>
    <div class="total-row" style="font-weight: bold; color: #15803d;">
      <span>Change Return</span>
      <span>${money(data.change_amount ?? Math.max(0, data.cash_tendered - data.total_amount))}</span>
    </div>` : ''}
    ${(data.payment_type === 'CREDIT' && data.previous_due != null) ? `
    <div class="total-row" style="margin-top: 6px; border-top: 1px dashed #ccc; padding-top: 4px; color: #475569;">
      <span>Previous Due</span>
      <span>${money(data.previous_due)}</span>
    </div>
    <div class="total-row" style="color: #475569;">
      <span>This Bill</span>
      <span>${money(data.total_amount)}</span>
    </div>` : ''}
    ${(data.credit_due_amount != null && (data.credit_due_amount > 0 || data.payment_type === 'CREDIT')) ? `
    <div class="total-row" style="margin-top: 8px; border-top: 2px dashed #dc2626; padding-top: 6px; color: #dc2626; font-weight: 800; font-size: 15px;">
      <span>${data.payment_type === 'CREDIT' ? 'TOTAL CREDIT DUE' : 'REMAINING CREDIT DUE'}</span>
      <span>${money(data.credit_due_amount)}</span>
    </div>` : ''}
  </div>

  <div class="footer">
    <p>${FOOTER}</p>
    <p style="font-size: 9px; margin-top: 4px; opacity: 0.7;">Software by inkoart.online • 0724207000</p>
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
