import { apiFetch } from '../lib/firestoreStore.ts';
import React, { useState, useEffect } from 'react';
import {
  Mail,
  X,
  FileDown,
  Send,
  CheckCircle,
  AlertTriangle,
  ShieldCheck,
  FileText,
  Save,
} from 'lucide-react';
import {
  googleSignInForGmail,
  subscribeGmailToken,
} from '../lib/firebase.ts';
import { sendInvoicePdfViaGmail } from '../lib/gmail.ts';
import {
  InvoicePdfData,
  buildInvoiceFilename,
  downloadInvoicePdf,
} from '../lib/invoicePdf.ts';

interface EmailInvoiceModalProps {
  invoice: InvoicePdfData;
  onClose: () => void;
  onEmailSent?: (recipient: string) => void;
  onClientEmailSaved?: (clientId: number, email: string) => void;
}

export const EmailInvoiceModal: React.FC<EmailInvoiceModalProps> = ({
  invoice,
  onClose,
  onEmailSent,
  onClientEmailSaved,
}) => {
  const [recipientEmail, setRecipientEmail] = useState(invoice.clientEmail || '');
  const [saveToClient, setSaveToClient] = useState(!invoice.clientEmail && Boolean(invoice.clientId));
  const [customMessage, setCustomMessage] = useState('');

  const [gmailToken, setGmailToken] = useState<string | null>(null);
  const [gmailSenderEmail, setGmailSenderEmail] = useState<string | null>(null);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);

  const [isConfirmingSend, setIsConfirmingSend] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [sentSuccess, setSentSuccess] = useState<{ to: string; filename: string } | null>(null);

  const filename = buildInvoiceFilename(invoice.invoiceNumber);

  useEffect(() => {
    return subscribeGmailToken((token, email) => {
      setGmailToken(token);
      setGmailSenderEmail(email);
    });
  }, []);

  const handleConnectGoogle = async () => {
    setErrorMsg('');
    setIsConnectingGoogle(true);
    try {
      const res = await googleSignInForGmail();
      setGmailToken(res.accessToken);
      setGmailSenderEmail(res.user.email || null);
    } catch (err: any) {
      setErrorMsg(
        err?.message || 'No se completó la conexión con Google. Intente nuevamente.'
      );
    } finally {
      setIsConnectingGoogle(false);
    }
  };

  const validateRecipient = () => {
    const clean = recipientEmail.trim();
    if (!clean) {
      setErrorMsg('Ingrese el correo electrónico del cliente para enviar la factura PDF.');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setErrorMsg('Ingrese un correo electrónico válido (ejemplo: cliente@correo.com).');
      return false;
    }
    return true;
  };

  const handleRequestConfirmation = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!validateRecipient()) return;
    if (!gmailToken) {
      setErrorMsg('Primero conecte su cuenta de Google / Gmail para poder enviar el correo.');
      return;
    }
    setIsConfirmingSend(true);
  };

  const handleConfirmedSend = async () => {
    if (!gmailToken) {
      setIsConfirmingSend(false);
      setErrorMsg('Debe conectar su cuenta de Google para enviar la factura.');
      return;
    }

    const cleanEmail = recipientEmail.trim();
    setIsSending(true);
    setErrorMsg('');

    try {
      // Optionally save or update the email in the client's database profile
      if (saveToClient && invoice.clientId && cleanEmail !== (invoice.clientEmail || '')) {
        try {
          const putRes = await apiFetch(`/api/clients/${invoice.clientId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: cleanEmail }),
          });
          if (putRes.ok && onClientEmailSaved) {
            onClientEmailSaved(invoice.clientId, cleanEmail);
          }
        } catch (saveErr) {
          console.warn('No se pudo guardar el correo en la ficha del cliente:', saveErr);
        }
      }

      const result = await sendInvoicePdfViaGmail({
        accessToken: gmailToken,
        toEmail: cleanEmail,
        invoiceData: {
          ...invoice,
          clientEmail: cleanEmail,
        },
        customMessage,
      });

      setSentSuccess({ to: cleanEmail, filename: result.filename });
      setIsConfirmingSend(false);
      if (onEmailSent) onEmailSent(cleanEmail);
    } catch (err: any) {
      setIsConfirmingSend(false);
      setErrorMsg(err?.message || 'Error al enviar la factura en PDF por correo.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-60 p-4 overflow-y-auto print:hidden">
      <div className="bg-white dark:bg-[#161b22] text-slate-900 dark:text-slate-100 rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 dark:border-[#2d3748] relative my-auto animate-in fade-in duration-150">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg cursor-pointer"
          title="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="pr-8 mb-4">
          <h3 className="text-base font-bold flex items-center gap-2">
            <Mail className="w-5 h-5 text-sky-600 dark:text-sky-400" />
            <span>Enviar Factura en PDF por Correo</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Factura <strong className="font-mono text-slate-800 dark:text-slate-200">{invoice.invoiceNumber}</strong> ·{' '}
            {invoice.clientName}
          </p>
        </div>

        {/* Resumen del PDF Adjunto */}
        <div className="mb-4 p-3 bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                {filename}
              </div>
              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                Total: Bs. {invoice.totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })} (Ref. $
                {invoice.totalUsd.toFixed(2)})
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => downloadInvoicePdf({ ...invoice, clientEmail: recipientEmail.trim() || invoice.clientEmail })}
            className="px-2.5 py-1.5 bg-white dark:bg-[#161b22] hover:bg-slate-100 dark:hover:bg-[#252e3d] border border-slate-200 dark:border-[#2d3748] rounded-lg text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 shrink-0 cursor-pointer"
            title="Descargar copia PDF en este equipo"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Descargar PDF</span>
          </button>
        </div>

        {sentSuccess ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-xl text-center space-y-1.5">
              <CheckCircle className="w-9 h-9 text-emerald-600 dark:text-emerald-400 mx-auto" />
              <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                ¡Factura PDF Enviada Exitosamente!
              </h4>
              <p className="text-xs text-emerald-800 dark:text-emerald-300">
                Se envió <strong>{sentSuccess.filename}</strong> al correo:
              </p>
              <p className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                {sentSuccess.to}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              Listo · Volver
            </button>
          </div>
        ) : (
          <form onSubmit={handleRequestConfirmation} className="space-y-3.5 text-xs">
            {/* Correo Destinatario */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Correo Electrónico del Cliente *
                </label>
                {invoice.clientEmail ? (
                  <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                    Correo registrado en ficha
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                    Sin correo registrado aún
                  </span>
                )}
              </div>
              <input
                type="email"
                required
                placeholder="cliente@correo.com"
                value={recipientEmail}
                onChange={(e) => {
                  setRecipientEmail(e.target.value);
                  setIsConfirmingSend(false);
                }}
                className="w-full h-9 px-3 bg-slate-50 dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] rounded-lg font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-sky-500"
              />

              {invoice.clientId && recipientEmail.trim() && recipientEmail.trim() !== (invoice.clientEmail || '') && (
                <label className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={saveToClient}
                    onChange={(e) => setSaveToClient(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <Save className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  <span>Guardar este correo en el registro permanente del cliente</span>
                </label>
              )}
            </div>

            {/* Nota opcional en el cuerpo del correo */}
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Mensaje adicional (opcional)
              </label>
              <input
                type="text"
                placeholder="Ej: Gracias por su compra, cualquier consulta estamos a su orden."
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                className="w-full h-9 px-3 bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-sky-500"
              />
            </div>

            {/* Estado de Conexión con Gmail */}
            {!gmailToken ? (
              <div className="p-3.5 bg-sky-50/70 dark:bg-[#14202c] border border-sky-200 dark:border-sky-900/70 rounded-xl space-y-2.5">
                <p className="text-[11px] text-sky-950 dark:text-sky-200 leading-relaxed">
                  Para enviar el PDF directamente por correo electrónico, conecte su cuenta de{' '}
                  <strong>Google (Gmail)</strong>:
                </p>
                <button
                  type="button"
                  onClick={handleConnectGoogle}
                  disabled={isConnectingGoogle}
                  className="w-full h-10 px-4 bg-white hover:bg-slate-50 text-[#1f1f1f] border border-[#747775] rounded-lg font-medium text-sm flex items-center justify-center gap-3 shadow-xs transition-colors cursor-pointer disabled:opacity-60"
                >
                  <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    className="w-5 h-5 shrink-0 block"
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                    <path fill="none" d="M0 0h48v48H0z" />
                  </svg>
                  <span>{isConnectingGoogle ? 'Conectando con Google...' : 'Sign in with Google'}</span>
                </button>
              </div>
            ) : (
              <div className="px-3 py-2 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 rounded-lg flex items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300 font-semibold truncate">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    Gmail conectado{gmailSenderEmail ? `: ${gmailSenderEmail}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleConnectGoogle}
                  className="text-[10px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline shrink-0 cursor-pointer"
                >
                  Cambiar cuenta
                </button>
              </div>
            )}

            {errorMsg && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 rounded-lg text-xs text-rose-700 dark:text-rose-300 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Confirmación explícita obligatoria antes de enviar correo por Gmail */}
            {isConfirmingSend ? (
              <div className="p-3.5 bg-amber-50 dark:bg-[#231d12] border border-amber-300 dark:border-amber-700 rounded-xl space-y-3">
                <div className="text-xs text-amber-950 dark:text-amber-200 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>Confirmar envío de correo electrónico</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    ¿Desea enviar la factura <strong>{invoice.invoiceNumber}</strong> con el archivo PDF adjunto (
                    <span className="font-mono">{filename}</span>) desde su cuenta de Gmail a{' '}
                    <strong className="font-mono">{recipientEmail.trim()}</strong>?
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isSending}
                    onClick={() => setIsConfirmingSend(false)}
                    className="flex-1 py-2 bg-white dark:bg-[#1c222b] border border-slate-300 dark:border-[#2d3748] text-slate-700 dark:text-slate-300 rounded-lg font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={isSending}
                    onClick={handleConfirmedSend}
                    className="flex-1 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSending ? 'Enviando PDF...' : 'Sí, Confirmar y Enviar'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-[#1f2530] dark:hover:bg-[#2a3342] text-slate-700 dark:text-slate-300 rounded-xl font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!gmailToken || !recipientEmail.trim()}
                  className="flex-1 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  <span>Enviar Factura PDF por Gmail</span>
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
};
