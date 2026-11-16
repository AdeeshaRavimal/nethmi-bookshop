export interface ReceiptLineItem {
  title: string;
  quantity: number;
  unit_price: number;
  discount_percent?: number;
  original_price?: number;
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
    const hasDiscount = (item.discount_percent || 0) > 0 && item.original_price;
    const originalLine = hasDiscount
      ? `<span class="strike">${money(item.original_price! * item.quantity)}</span>`
      : '';
    const discountNote = hasDiscount
      ? `<br><span style="font-size:11px; color:#666;">(Discount: ${item.discount_percent}%)</span>`
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
    ${(data.cash_tendered != null && data.cash_tendered > 0) ? `
    <div class="total-row" style="margin-top: 6px; border-top: 1px dashed #ccc; padding-top: 4px;">
      <span>Cash Tendered</span>
      <span>${money(data.cash_tendered)}</span>
    </div>
    <div class="total-row" style="font-weight: bold; color: #15803d;">
      <span>Change Return</span>
      <span>${money(data.change_amount ?? Math.max(0, data.cash_tendered - data.total_amount))}</span>
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
    .map(i => `• ${i.title}  x${i.quantity}  =  Rs. ${(i.unit_price * i.quantity).toFixed(2)}`)
    .join('\n');

  let text = `*${SHOP_NAME}*\n${SHOP_ADDRESS} (Tel: ${SHOP_PHONE})\n----------------------------------------\n*INVOICE / RECEIPT: ${data.receipt_no}*\nDate: ${date}\nPayment: ${data.payment_type}\n`;

  if (data.customer_name) {
    text += `Customer: ${data.customer_name}${data.customer_phone ? ` (${data.customer_phone})` : ''}\n`;
  }

  text += `----------------------------------------\n*Items Purchased:*\n${itemsList}\n----------------------------------------\n*TOTAL: Rs. ${data.total_amount.toFixed(2)}*`;

  if (data.bill_discount && data.bill_discount > 0) {
    text += `\n(Discount Saved: Rs. ${data.bill_discount.toFixed(2)})`;
  }

  if (data.cash_tendered && data.cash_tendered > data.total_amount) {
    text += `\nCash Received: Rs. ${data.cash_tendered.toFixed(2)}`;
    text += `\nChange Returned: Rs. ${(data.change_amount ?? Math.max(0, data.cash_tendered - data.total_amount)).toFixed(2)}`;
  }

  if (data.points_earned && data.points_earned > 0) {
    text += `\n\n✨ Points Earned: +${data.points_earned} pts`;
  }
  if (data.points_balance !== undefined && data.points_balance !== null) {
    text += `\n⭐ Loyalty Balance: ${data.points_balance} pts`;
  }

  text += `\n\nThank you for shopping with us! Have a great day! 🙏`;

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
      const baseHeight = 560;
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
      if (data.cash_tendered && data.cash_tendered > data.total_amount) {
        ctx.font = '12px "Segoe UI", sans-serif';
        ctx.fillStyle = '#475569';
        ctx.fillText(`Cash Tendered: Rs. ${data.cash_tendered.toFixed(2)}`, 340, y);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#16a34a';
        ctx.fillText(`Change: Rs. ${(data.change_amount || 0).toFixed(2)}`, width - 32, y);
        ctx.textAlign = 'left';
        y += 25;
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