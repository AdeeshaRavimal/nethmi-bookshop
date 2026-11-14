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