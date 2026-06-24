export interface ReceiptItem {
  name: string;
  qty: number;
  price: number;
}

export interface ReceiptData {
  docNumber: string;
  date: string;
  seller: string;
  customer: string;
  items: ReceiptItem[];
  total: number;
  paymentMethod: string;
  notes?: string;
}

const COP = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);

export function openReceipt(data: ReceiptData) {
  const rows = data.items
    .map(
      it => `<tr>
      <td style="padding:4px 0;border-bottom:1px solid #eee">${it.name}</td>
      <td style="text-align:center;padding:4px 4px;border-bottom:1px solid #eee">${it.qty}</td>
      <td style="text-align:right;padding:4px 0;border-bottom:1px solid #eee">${COP(it.price)}</td>
      <td style="text-align:right;padding:4px 0;border-bottom:1px solid #eee;font-weight:700">${COP(it.qty * it.price)}</td>
    </tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Documento Equivalente · Bhumi Yoga</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    color: #1a2a51;
    background: #fff;
    padding: 28px 24px;
    max-width: 360px;
    margin: 0 auto;
  }
  .header { text-align: center; margin-bottom: 18px; }
  .brand { font-size: 18px; font-weight: 700; letter-spacing: 3px; }
  .address { font-size: 10px; color: #666; margin-top: 3px; line-height: 1.5; }
  .doc-title {
    text-align: center;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 3px;
    border: 1px solid #1a2a51;
    padding: 5px 8px;
    margin: 14px 0;
  }
  .info { font-size: 11px; line-height: 1.9; margin-bottom: 14px; }
  .info span { color: #555; }
  .divider { border: none; border-top: 1px dashed #bbb; margin: 12px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { text-align: left; padding: 4px 0 6px; border-bottom: 1px solid #1a2a51; font-weight: 700; font-size: 10px; letter-spacing: .08em; }
  .total-line {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid #1a2a51;
    font-size: 13px;
    font-weight: 700;
  }
  .notes { font-size: 10px; color: #777; margin-top: 8px; font-style: italic; }
  .footer {
    text-align: center;
    font-size: 10px;
    color: #999;
    margin-top: 24px;
    line-height: 1.6;
    border-top: 1px dashed #ddd;
    padding-top: 12px;
  }
  @media print {
    @page { margin: 0; size: 80mm auto; }
    body { padding: 8px 10px; max-width: none; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>

<div class="header">
  <div class="brand">BHUMI YOGA</div>
  <div class="address">
    Bhumi Yoga Academy · Armenia, Quindío<br>
    demo-yoga.app
  </div>
</div>

<div class="doc-title">DOCUMENTO EQUIVALENTE</div>

<div class="info">
  <div><b>No.:</b> <span>${data.docNumber}</span></div>
  <div><b>Fecha:</b> <span>${data.date}</span></div>
  <div><b>Vendedor:</b> <span>${data.seller}</span></div>
  <div><b>Cliente:</b> <span>${data.customer}</span></div>
  <div><b>Medio de pago:</b> <span>${data.paymentMethod}</span></div>
</div>

<hr class="divider">

<table>
  <thead>
    <tr>
      <th>Descripción</th>
      <th style="text-align:center">Cant</th>
      <th style="text-align:right">P.Unit</th>
      <th style="text-align:right">Subtotal</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>

<div class="total-line">
  <span>TOTAL A PAGAR</span>
  <span>${COP(data.total)}</span>
</div>

${data.notes ? `<div class="notes">Obs: ${data.notes}</div>` : ''}

<div class="footer">
  Este documento es válido como soporte de pago.<br>
  Régimen simplificado · No somos responsables de IVA.<br>
  ¡Gracias por practicar con nosotros!
</div>

<div class="no-print" style="text-align:center;margin-top:20px">
  <button onclick="window.print()"
    style="background:#1a2a51;color:#fff;border:none;padding:10px 28px;border-radius:8px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:.05em">
    Imprimir / Descargar PDF
  </button>
  <button onclick="window.close()"
    style="margin-left:10px;background:#eee;color:#333;border:none;padding:10px 18px;border-radius:8px;font-family:inherit;font-size:13px;cursor:pointer">
    Cerrar
  </button>
</div>

</body>
</html>`;

  const win = window.open('', '_blank', 'width=460,height=700,scrollbars=yes');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}
