import { jsPDF } from 'jspdf';

export interface InvoicePdfItem {
  code: string;
  name: string;
  quantity: number;
  unit?: string;
  unitPriceVes: number;
  unitPriceUsd: number;
  discountPercent?: number;
  isExempt?: boolean;
  lineTotalVes: number;
  lineTotalUsd: number;
}

export interface InvoicePdfPayment {
  paymentMethod: string;
  amountOriginal: number;
  currency: 'USD' | 'VES' | string;
  bank?: string | null;
  reference?: string | null;
}

export interface InvoicePdfData {
  invoiceNumber: string;
  date: string;
  paymentType: 'contado' | 'credito' | string;
  status?: string;
  exchangeRate: number;
  clientId?: number;
  clientName: string;
  clientIdDoc?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  items: InvoicePdfItem[];
  exemptBaseVes?: number;
  taxableBaseVes?: number;
  totalDiscountVes?: number;
  totalIvaVes?: number;
  totalVes: number;
  totalUsd: number;
  amountPaidUsd?: number;
  balanceDueUsd?: number;
  payments?: InvoicePdfPayment[];
  notes?: string | null;
}

const fmtBs = (n: number) =>
  `Bs. ${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtUsd = (n: number) => `$${n.toFixed(2)}`;

const formatMethodLabel = (method: string) => {
  switch (method) {
    case 'efectivo_usd':
      return 'Efectivo Dólares ($)';
    case 'efectivo_ves':
      return 'Efectivo Bolívares (Bs.)';
    case 'punto_de_venta':
      return 'Punto de Venta / Tarjeta';
    case 'pago_movil':
      return 'Pago Móvil';
    case 'transferencia':
      return 'Transferencia Bancaria';
    default:
      return method.replace(/_/g, ' ').toUpperCase();
  }
};

export const buildInvoiceFilename = (invoiceNumber: string) => {
  const safeNum = (invoiceNumber || 'FACTURA').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `Factura_${safeNum}_Distribuidora_ROECA.pdf`;
};

export const generateInvoicePdf = (
  data: InvoicePdfData
): { blob: Blob; base64: string; filename: string } => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const rate = data.exchangeRate || 76.5;

  // Header Banner
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.rect(0, 0, pageWidth, 34, 'F');

  // Accent bar
  doc.setFillColor(5, 150, 105); // Emerald 600
  doc.rect(0, 34, pageWidth, 2, 'F');

  // Company Identity (Left)
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('DISTRIBUIDORA ROECA C.A.', margin, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text('RIF: J-50182934-1 · Supermercado y Mayorista de Víveres', margin, 19.5);
  doc.text('Documento Comercial / Comprobante de Facturación', margin, 25);

  // Invoice Badge (Right)
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`FACTURA ${data.invoiceNumber}`, pageWidth - margin, 13, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(167, 243, 208);
  const conditionLabel = data.paymentType === 'credito' ? 'A CRÉDITO (CxC)' : 'CONTADO';
  doc.text(`Fecha: ${data.date} · Condición: ${conditionLabel}`, pageWidth - margin, 19.5, {
    align: 'right',
  });
  doc.setTextColor(203, 213, 225);
  doc.text(`Tasa BCV Oficial: ${rate.toFixed(2)} Bs./USD`, pageWidth - margin, 25, {
    align: 'right',
  });

  // Client Info Card
  let y = 43;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 25, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('DATOS DEL CLIENTE', margin + 4, y + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(data.clientName || 'Cliente', margin + 4, y + 11.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  const docIdLine = `Cédula / RIF: ${data.clientIdDoc || 'N/A'}${
    data.clientPhone ? `   ·   Tel: ${data.clientPhone}` : ''
  }`;
  doc.text(docIdLine, margin + 4, y + 17);
  if (data.clientAddress) {
    const truncatedAddr =
      data.clientAddress.length > 70
        ? `${data.clientAddress.slice(0, 67)}...`
        : data.clientAddress;
    doc.text(`Dirección: ${truncatedAddr}`, margin + 4, y + 22);
  }

  // Client Email & Status (Right inside card)
  const statusText =
    (data.balanceDueUsd ?? 0) <= 0.01
      ? 'PAGADA'
      : data.status === 'parcial'
      ? 'ABONO PARCIAL'
      : 'PENDIENTE';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  if (statusText === 'PAGADA') {
    doc.setTextColor(5, 150, 105);
  } else if (statusText === 'ABONO PARCIAL') {
    doc.setTextColor(217, 119, 6);
  } else {
    doc.setTextColor(225, 29, 72);
  }
  doc.text(`ESTADO: ${statusText}`, pageWidth - margin - 4, y + 6, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `Correo: ${data.clientEmail || 'No registrado'}`,
    pageWidth - margin - 4,
    y + 12.5,
    { align: 'right' }
  );

  // Table Columns Layout
  y += 32;
  const colCode = margin + 2;
  const colDesc = margin + 26;
  const colQty = margin + 102;
  const colPrice = margin + 125;
  const colDisc = margin + 141;
  const colTax = margin + 157;
  const colTotal = pageWidth - margin - 2;

  const drawTableHeader = (startY: number) => {
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.rect(margin, startY, contentWidth, 8, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text('CÓDIGO', colCode, startY + 5.3);
    doc.text('DESCRIPCIÓN / ARTÍCULO', colDesc, startY + 5.3);
    doc.text('CANT.', colQty, startY + 5.3, { align: 'right' });
    doc.text('P. UNIT (Bs.)', colPrice, startY + 5.3, { align: 'right' });
    doc.text('DESC.', colDisc, startY + 5.3, { align: 'right' });
    doc.text('IMPUESTO', colTax, startY + 5.3, { align: 'right' });
    doc.text('TOTAL (Bs.)', colTotal, startY + 5.3, { align: 'right' });
    return startY + 8;
  };

  y = drawTableHeader(y);

  // Table Rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);

  data.items.forEach((item, idx) => {
    const descLines = doc.splitTextToSize(item.name || 'Artículo', 68);
    const rowHeight = Math.max(7.5, descLines.length * 4 + 3.5);

    if (y + rowHeight > pageHeight - 58) {
      doc.addPage();
      y = 18;
      y = drawTableHeader(y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
    }

    if (idx % 2 === 1) {
      doc.setFillColor(250, 252, 255);
      doc.rect(margin, y, contentWidth, rowHeight, 'F');
    }

    doc.setDrawColor(241, 245, 249);
    doc.line(margin, y + rowHeight, margin + contentWidth, y + rowHeight);

    const textY = y + 5;
    doc.setTextColor(71, 85, 105);
    doc.text(String(item.code || '-').slice(0, 14), colCode, textY);

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(descLines, colDesc, textY);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);
    doc.text(String(item.quantity), colQty, textY, { align: 'right' });
    doc.text(item.unitPriceVes.toFixed(2), colPrice, textY, { align: 'right' });
    doc.text(
      item.discountPercent && item.discountPercent > 0 ? `${item.discountPercent}%` : '-',
      colDisc,
      textY,
      { align: 'right' }
    );
    const taxLabel =
      item.isExempt === undefined ? 'E / G' : item.isExempt ? 'Exento (E)' : 'IVA 16%';
    doc.text(taxLabel, colTax, textY, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(item.lineTotalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), colTotal, textY, {
      align: 'right',
    });

    y += rowHeight;
  });

  // Ensure enough room for totals & payments block
  if (y > pageHeight - 72) {
    doc.addPage();
    y = 20;
  }

  y += 6;

  // Left block: Payment Methods & Notes
  const leftBoxWidth = 104;
  const rightBoxX = margin + leftBoxWidth + 6;
  const rightBoxWidth = contentWidth - leftBoxWidth - 6;

  let leftY = y;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  const paymentCount = data.payments?.length || 0;
  const leftBoxHeight = Math.max(30, 14 + paymentCount * 5.2 + (data.notes ? 8 : 0));
  doc.roundedRect(margin, leftY, leftBoxWidth, leftBoxHeight, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('FORMAS DE PAGO APLICADAS', margin + 4, leftY + 5.5);
  leftY += 10.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);

  if (data.payments && data.payments.length > 0) {
    data.payments.forEach((p) => {
      const label = `${formatMethodLabel(p.paymentMethod)}${
        p.reference ? ` (Ref: ${p.reference})` : ''
      }`;
      const amountText =
        p.currency === 'USD'
          ? `${fmtUsd(p.amountOriginal)} (${fmtBs(p.amountOriginal * rate)})`
          : fmtBs(p.amountOriginal);
      doc.text(`• ${label.slice(0, 42)}`, margin + 4, leftY);
      doc.setFont('helvetica', 'bold');
      doc.text(amountText, margin + leftBoxWidth - 4, leftY, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      leftY += 5;
    });
  } else {
    doc.setTextColor(100, 116, 139);
    doc.text(
      data.paymentType === 'credito'
        ? 'Venta emitida a Crédito (Cuenta por Cobrar).'
        : 'Pago registrado en caja.',
      margin + 4,
      leftY
    );
    leftY += 5;
  }

  if (data.notes) {
    doc.setTextColor(146, 64, 14);
    doc.setFontSize(7.5);
    doc.text(`Nota: ${data.notes.slice(0, 62)}`, margin + 4, leftY + 2);
  }

  // Right block: Fiscal & Financial Totals
  let rightY = y;
  const hasFiscalBreakdown =
    data.exemptBaseVes !== undefined ||
    data.taxableBaseVes !== undefined ||
    data.totalIvaVes !== undefined;
  const hasCreditDue = (data.balanceDueUsd ?? 0) > 0.01;
  const rightBoxHeight =
    (hasFiscalBreakdown ? 23 : 6) + 19 + (hasCreditDue ? 12 : 0) + (data.totalDiscountVes ? 5 : 0);

  doc.setFillColor(240, 253, 244); // Soft Emerald tint
  doc.setDrawColor(167, 243, 208);
  doc.roundedRect(rightBoxX, rightY, rightBoxWidth, Math.max(30, rightBoxHeight), 2, 2, 'FD');

  rightY += 6;
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);

  if (hasFiscalBreakdown) {
    doc.setFont('helvetica', 'normal');
    doc.text('Base Exenta (E):', rightBoxX + 4, rightY);
    doc.text(fmtBs(data.exemptBaseVes || 0), rightBoxX + rightBoxWidth - 4, rightY, {
      align: 'right',
    });
    rightY += 4.8;

    doc.text('Base Imponible (G):', rightBoxX + 4, rightY);
    doc.text(fmtBs(data.taxableBaseVes || 0), rightBoxX + rightBoxWidth - 4, rightY, {
      align: 'right',
    });
    rightY += 4.8;

    if (data.totalDiscountVes && data.totalDiscountVes > 0) {
      doc.setTextColor(180, 83, 9);
      doc.text('Descuentos:', rightBoxX + 4, rightY);
      doc.text(`-${fmtBs(data.totalDiscountVes)}`, rightBoxX + rightBoxWidth - 4, rightY, {
        align: 'right',
      });
      rightY += 4.8;
      doc.setTextColor(51, 65, 85);
    }

    doc.text('IVA (16%):', rightBoxX + 4, rightY);
    doc.text(fmtBs(data.totalIvaVes || 0), rightBoxX + rightBoxWidth - 4, rightY, {
      align: 'right',
    });
    rightY += 4.5;

    doc.setDrawColor(167, 243, 208);
    doc.line(rightBoxX + 3, rightY, rightBoxX + rightBoxWidth - 3, rightY);
    rightY += 5.5;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(6, 78, 59);
  doc.text('TOTAL A PAGAR:', rightBoxX + 4, rightY);
  doc.text(fmtBs(data.totalVes), rightBoxX + rightBoxWidth - 4, rightY, { align: 'right' });
  rightY += 5.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(4, 120, 87);
  doc.text('Ref. Divisas (BCV):', rightBoxX + 4, rightY);
  doc.text(`${fmtUsd(data.totalUsd)} USD`, rightBoxX + rightBoxWidth - 4, rightY, {
    align: 'right',
  });

  if (hasCreditDue) {
    rightY += 5.5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text('Total Abonado:', rightBoxX + 4, rightY);
    doc.text(fmtBs((data.amountPaidUsd || 0) * rate), rightBoxX + rightBoxWidth - 4, rightY, {
      align: 'right',
    });

    rightY += 5;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(190, 18, 60);
    doc.text('SALDO PENDIENTE:', rightBoxX + 4, rightY);
    doc.text(
      `${fmtBs((data.balanceDueUsd || 0) * rate)} (${fmtUsd(data.balanceDueUsd || 0)})`,
      rightBoxX + rightBoxWidth - 4,
      rightY,
      { align: 'right' }
    );
  }

  // Footer
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, pageHeight - 16, pageWidth - margin, pageHeight - 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Gracias por su compra en DISTRIBUIDORA ROECA C.A. · Montos expresados en Bolívares a la tasa oficial del BCV.',
    pageWidth / 2,
    pageHeight - 11,
    { align: 'center' }
  );

  const filename = buildInvoiceFilename(data.invoiceNumber);
  const dataUri = doc.output('datauristring');
  const base64 = dataUri.split(',')[1] || '';
  const blob = doc.output('blob');

  return { blob, base64, filename };
};

export const downloadInvoicePdf = (data: InvoicePdfData) => {
  const { blob, filename } = generateInvoicePdf(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
