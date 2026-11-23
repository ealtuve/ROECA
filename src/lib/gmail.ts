import { clearGmailAccessToken } from './firebase.ts';
import { generateInvoicePdf, InvoicePdfData } from './invoicePdf.ts';

const encodeUtf8ToBase64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

const encodeUtf8ToBase64Url = (text: string): string =>
  encodeUtf8ToBase64(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const chunkBase64 = (b64: string, lineLength = 76): string => {
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += lineLength) {
    lines.push(b64.slice(i, i + lineLength));
  }
  return lines.join('\r\n');
};

const encodeRfc2047Subject = (subject: string): string =>
  `=?UTF-8?B?${encodeUtf8ToBase64(subject)}?=`;

export interface SendInvoiceEmailParams {
  accessToken: string;
  toEmail: string;
  invoiceData: InvoicePdfData;
  customMessage?: string;
}

export const sendInvoicePdfViaGmail = async ({
  accessToken,
  toEmail,
  invoiceData,
  customMessage,
}: SendInvoiceEmailParams): Promise<{ id: string; filename: string }> => {
  const cleanRecipient = toEmail.trim();
  if (!cleanRecipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanRecipient)) {
    throw new Error('La dirección de correo electrónico del cliente no es válida.');
  }

  const { base64: pdfBase64, filename } = generateInvoicePdf(invoiceData);
  const rate = invoiceData.exchangeRate || 76.5;
  const totalBsFormatted = invoiceData.totalVes.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const balanceBsFormatted = ((invoiceData.balanceDueUsd || 0) * rate).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const subject = `Factura ${invoiceData.invoiceNumber} - Distribuidora ROECA C.A.`;
  const boundary = `roeca_pdf_boundary_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const conditionText =
    invoiceData.paymentType === 'credito' ? 'A Crédito (Cuenta por Cobrar)' : 'Contado';

  const htmlBody = `
<div style="font-family: Arial, Helvetica, sans-serif; color: #0f172a; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;">
  <div style="background-color: #0f172a; color: #ffffff; padding: 20px 24px; border-bottom: 3px solid #059669;">
    <h2 style="margin: 0; font-size: 18px;">DISTRIBUIDORA ROECA C.A.</h2>
    <p style="margin: 4px 0 0; font-size: 12px; color: #cbd5e1;">RIF: J-50182934-1 · Supermercado y Mayorista de Víveres</p>
  </div>
  <div style="padding: 22px 24px; font-size: 14px; line-height: 1.55;">
    <p style="margin-top: 0;">Estimado(a) <strong>${invoiceData.clientName}</strong>,</p>
    <p>Adjunto a este correo encontrará su factura en formato PDF correspondiente a su compra en <strong>Distribuidora ROECA C.A.</strong></p>
    ${customMessage?.trim() ? `<p style="background: #f8fafc; padding: 10px 14px; border-left: 3px solid #059669; border-radius: 4px;">${customMessage.trim()}</p>` : ''}
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; background: #f8fafc; border-radius: 8px;">
      <tr>
        <td style="padding: 8px 12px; color: #64748b;">N° de Factura:</td>
        <td style="padding: 8px 12px; font-weight: bold; text-align: right;">${invoiceData.invoiceNumber}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; color: #64748b;">Fecha de Emisión:</td>
        <td style="padding: 8px 12px; text-align: right;">${invoiceData.date}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; color: #64748b;">Condición:</td>
        <td style="padding: 8px 12px; text-align: right;">${conditionText}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; color: #64748b;">Tasa BCV Aplicada:</td>
        <td style="padding: 8px 12px; text-align: right;">${rate.toFixed(2)} Bs./USD</td>
      </tr>
      <tr style="border-top: 1px solid #cbd5e1;">
        <td style="padding: 10px 12px; font-weight: bold; color: #065f46;">TOTAL FACTURA:</td>
        <td style="padding: 10px 12px; font-weight: bold; font-size: 15px; color: #065f46; text-align: right;">Bs. ${totalBsFormatted} (Ref. $${invoiceData.totalUsd.toFixed(2)})</td>
      </tr>
      ${
        (invoiceData.balanceDueUsd || 0) > 0.01
          ? `<tr>
        <td style="padding: 8px 12px; font-weight: bold; color: #be123c;">Saldo Pendiente:</td>
        <td style="padding: 8px 12px; font-weight: bold; color: #be123c; text-align: right;">Bs. ${balanceBsFormatted} ($${(invoiceData.balanceDueUsd || 0).toFixed(2)})</td>
      </tr>`
          : ''
      }
    </table>
    <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">Gracias por su preferencia. Archivo adjunto: <strong>${filename}</strong></p>
  </div>
</div>`.trim();

  const mimeParts = [
    `To: ${cleanRecipient}`,
    `Subject: ${encodeRfc2047Subject(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    chunkBase64(encodeUtf8ToBase64(htmlBody)),
    '',
    `--${boundary}`,
    `Content-Type: application/pdf; name="${filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${filename}"`,
    '',
    chunkBase64(pdfBase64),
    '',
    `--${boundary}--`,
  ].join('\r\n');

  const raw = encodeUtf8ToBase64Url(mimeParts);

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (response.status === 401 || response.status === 403) {
    clearGmailAccessToken();
    throw new Error(
      'La sesión de Gmail expiró o no tiene permiso de envío. Vuelva a conectar su cuenta de Google.'
    );
  }

  if (!response.ok) {
    let errText = 'No se pudo enviar el correo a través de Gmail.';
    try {
      const errJson = await response.json();
      if (errJson?.error?.message) {
        errText = `Error de Gmail: ${errJson.error.message}`;
      }
    } catch {
      // ignore json parse failure
    }
    throw new Error(errText);
  }

  const result = await response.json();
  return { id: result.id, filename };
};
