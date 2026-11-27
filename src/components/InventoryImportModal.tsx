import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  FileSpreadsheet,
  Download,
  X,
  Check,
  AlertCircle,
  Loader2,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import { apiFetch } from '../lib/firestoreStore.ts';
import { Product, Category } from '../types/index.ts';

interface InventoryImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingProducts: Product[];
  categories: Category[];
  exchangeRate: number;
  branchId: number;
  onImportSuccess: (summary: string) => void;
}

type ColumnField =
  | 'code'
  | 'name'
  | 'costUsd'
  | 'priceUsd'
  | 'stock'
  | 'minStock'
  | 'unit'
  | 'categoryName';

type ColumnMapping = Record<ColumnField, string>;

interface ParsedPreviewRow {
  rowNumber: number;
  code: string;
  name: string;
  costUsd: number;
  priceUsd: number;
  stock?: number;
  minStock?: number;
  unit?: string;
  categoryName?: string;
  existsInDb: boolean;
  isDuplicateInFile?: boolean;
  hadLeadingQuote?: boolean;
  isValid: boolean;
  reason?: string;
}

const cleanProductCode = (raw: unknown): string =>
  String(raw ?? '')
    .trim()
    .replace(/^['´`’‘ʼ′ʹ"“”\u00B4\u02B9\u02BC\u2018\u2019\u2032]+/, '')
    .trim();

const normalizeDesc = (raw: unknown): string =>
  String(raw ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

type SalePriceRoundingMode =
  | 'round_2'
  | 'ceil_2'
  | 'step_005'
  | 'step_010'
  | 'int_round'
  | 'int_ceil';

const applySalePriceRounding = (value: number, mode: SalePriceRoundingMode): number => {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  switch (mode) {
    case 'ceil_2':
      return Number((Math.ceil(safe * 100 - 1e-9) / 100).toFixed(2));
    case 'step_005':
      return Number((Math.round(safe * 20) / 20).toFixed(2));
    case 'step_010':
      return Number((Math.round(safe * 10) / 10).toFixed(2));
    case 'int_round':
      return Math.round(safe);
    case 'int_ceil':
      return Math.ceil(safe - 1e-9);
    case 'round_2':
    default:
      return Number((Math.round(safe * 100) / 100).toFixed(2));
  }
};

const normalizeHeader = (val: unknown): string =>
  String(val ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Parses Venezuelan, European, and US numeric formats cleanly:
 * - "$ 12,50" -> 12.5
 * - "Bs. 1.250,75" -> 1250.75
 * - "1,250.75" -> 1250.75
 * - 15.2 -> 15.2
 */
const parseSmartNumber = (raw: unknown): number => {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : 0;
  }
  const str = String(raw ?? '').trim();
  if (!str) return 0;

  // Strip currency symbols and letters
  const cleaned = str.replace(/[^0-9.,-]/g, '');
  if (!cleaned) return 0;

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  let normalized = cleaned;
  if (hasComma && hasDot) {
    // Whichever appears last is the decimal separator
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    // Check if comma looks like a thousands separator (e.g. 1,250 or 1,000,000) vs decimal (12,50)
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      normalized = cleaned.replace(',', '.');
    } else if (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3) {
      // Could be decimal with 3 decimals or thousands; treat as thousands if integer-like >= 1
      normalized = cleaned.replace(',', '');
    } else {
      normalized = cleaned.replace(/,/g, '.');
    }
  }

  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const autoDetectMapping = (headers: string[]): ColumnMapping => {
  const mapping: ColumnMapping = {
    code: '',
    name: '',
    costUsd: '',
    priceUsd: '',
    stock: '',
    minStock: '',
    unit: '',
    categoryName: '',
  };

  const used = new Set<string>();
  const pick = (patterns: RegExp[]): string => {
    for (const pat of patterns) {
      const found = headers.find((h) => !used.has(h) && pat.test(normalizeHeader(h)));
      if (found) {
        used.add(found);
        return found;
      }
    }
    return '';
  };

  mapping.code = pick([
    /^(codigo|cod|sku|barcode|barra|codigo de barra|cod barra|referencia|ref|clave)$/,
    /(codigo|cod|sku|barra|barcode)/,
  ]);
  mapping.name = pick([
    /^(descripcion|producto|nombre|articulo|detalle|mercancia|item|descripcion del producto)$/,
    /(descripcion|producto|nombre|articulo|detalle)/,
  ]);
  mapping.costUsd = pick([
    /^(precio costo|precio de costo|costo|costo usd|costo bs|p costo|cost|compra|valor costo)$/,
    /(costo|cost|compra)/,
  ]);
  mapping.priceUsd = pick([
    /^(precio venta|precio de venta|pvp|precio|venta|precio usd|precio bs|p venta|price)$/,
    /(venta|pvp|precio|price)/,
  ]);
  mapping.stock = pick([
    /^(stock|existencia|existencias|cantidad|cant|inventario|disponible|saldo)$/,
    /(stock|existenc|cant|inventar)/,
  ]);
  mapping.minStock = pick([
    /^(minimo|stock minimo|min|alerta|punto reorden)$/,
    /(minim|min)/,
  ]);
  mapping.unit = pick([
    /^(unidad|und|medida|presentacion|empaque|um|u m)$/,
    /(unidad|medida|presentac|empaque)/,
  ]);
  mapping.categoryName = pick([
    /^(categoria|departamento|linea|grupo|familia|rubro)$/,
    /(categor|depart|linea|grupo|rubro)/,
  ]);

  return mapping;
};

export const InventoryImportModal: React.FC<InventoryImportModalProps> = ({
  isOpen,
  onClose,
  existingProducts,
  categories,
  exchangeRate,
  branchId,
  onImportSuccess,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    code: '',
    name: '',
    costUsd: '',
    priceUsd: '',
    stock: '',
    minStock: '',
    unit: '',
    categoryName: '',
  });
  const [priceCurrency, setPriceCurrency] = useState<'USD' | 'VES'>('USD');
  const [roundingMode, setRoundingMode] = useState<SalePriceRoundingMode>('round_2');
  const [duplicateMode, setDuplicateMode] = useState<'upsert' | 'skip_existing'>('upsert');
  const [defaultCategoryId, setDefaultCategoryId] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const existingCodeSet = useMemo(() => {
    const set = new Set<string>();
    for (const p of existingProducts) {
      set.add(
        cleanProductCode(p.code)
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim()
      );
    }
    return set;
  }, [existingProducts]);

  const existingNameSet = useMemo(() => {
    const set = new Set<string>();
    for (const p of existingProducts) {
      const n = normalizeDesc(p.name);
      if (n) set.add(n);
    }
    return set;
  }, [existingProducts]);

  const resetState = () => {
    setFileName('');
    setHeaders([]);
    setRawRows([]);
    setMapping({
      code: '',
      name: '',
      costUsd: '',
      priceUsd: '',
      stock: '',
      minStock: '',
      unit: '',
      categoryName: '',
    });
    setErrorMsg('');
    setIsImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (isImporting) return;
    resetState();
    onClose();
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        Codigo: '7591001001',
        Descripcion: 'HARINA P.A.N. MAIZ BLANCO 1KG',
        'Precio Costo': 1.05,
        'Precio Venta': 1.35,
        Stock: 120,
        Unidad: 'kg',
        Categoria: 'Harinas y Granos',
      },
      {
        Codigo: '7591001002',
        Descripcion: 'ARROZ MARY TRADICIONAL 1KG',
        'Precio Costo': 1.1,
        'Precio Venta': 1.45,
        Stock: 85,
        Unidad: 'kg',
        Categoria: 'Harinas y Granos',
      },
      {
        Codigo: '7591002001',
        Descripcion: 'ACEITE MAZEITE 1 LITRO',
        'Precio Costo': 2.6,
        'Precio Venta': 3.25,
        Stock: 60,
        Unidad: 'litro',
        Categoria: 'Aceites y Grasas',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    worksheet['!cols'] = [
      { wch: 16 },
      { wch: 36 },
      { wch: 14 },
      { wch: 14 },
      { wch: 10 },
      { wch: 12 },
      { wch: 20 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario');
    XLSX.writeFile(workbook, 'Plantilla_Inventario_ROECA.xlsx');
  };

  const processFile = async (file: File) => {
    setErrorMsg('');
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (!['xlsx', 'xls', 'csv', 'txt', 'ods'].includes(ext)) {
        setErrorMsg(
          'Formato no compatible. Por favor suba un archivo de Excel (.xlsx, .xls) o CSV (.csv).'
        );
        return;
      }

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', raw: false });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        setErrorMsg('El archivo seleccionado está vacío o no contiene hojas de cálculo.');
        return;
      }

      const sheet = workbook.Sheets[firstSheetName];
      // Read as 2D array first so we can find the true header row even if the Excel has title rows on top
      const matrix: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
        blankrows: false,
      });

      if (matrix.length < 2) {
        setErrorMsg('El archivo debe contener al menos una fila de encabezados y una fila de productos.');
        return;
      }

      // Detect header row among first 8 rows (pick the row with most non-empty text cells / matching keywords)
      let headerRowIdx = 0;
      let bestScore = -1;
      const headerKeywords = /(cod|sku|barra|desc|prod|nom|art|cost|prec|vent|pvp|stock|cant|exist)/;

      for (let i = 0; i < Math.min(8, matrix.length - 1); i++) {
        const row = matrix[i];
        const nonEmpty = row.filter((c) => String(c ?? '').trim() !== '');
        if (nonEmpty.length < 2) continue;
        let score = nonEmpty.length;
        for (const cell of nonEmpty) {
          if (headerKeywords.test(normalizeHeader(cell))) {
            score += 5;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          headerRowIdx = i;
        }
      }

      const rawHeaderRow = matrix[headerRowIdx];
      const detectedHeaders: string[] = [];
      const seenHeaders = new Map<string, number>();

      rawHeaderRow.forEach((cell, idx) => {
        let label = String(cell ?? '').trim() || `Columna ${idx + 1}`;
        const count = seenHeaders.get(label) || 0;
        seenHeaders.set(label, count + 1);
        if (count > 0) {
          label = `${label} (${count + 1})`;
        }
        detectedHeaders.push(label);
      });

      const parsedObjects: Record<string, unknown>[] = [];
      for (let r = headerRowIdx + 1; r < matrix.length; r++) {
        const row = matrix[r];
        const hasAnyValue = row.some((c) => String(c ?? '').trim() !== '');
        if (!hasAnyValue) continue;
        const obj: Record<string, unknown> = {};
        detectedHeaders.forEach((h, cIdx) => {
          obj[h] = row[cIdx] ?? '';
        });
        parsedObjects.push(obj);
      }

      if (parsedObjects.length === 0) {
        setErrorMsg('No se encontraron filas de datos debajo de los encabezados.');
        return;
      }

      setFileName(file.name);
      setHeaders(detectedHeaders);
      setRawRows(parsedObjects);
      setMapping(autoDetectMapping(detectedHeaders));
    } catch (err: any) {
      console.error('Error parsing inventory file:', err);
      setErrorMsg(
        'No se pudo leer el archivo. Verifique que sea un archivo Excel (.xlsx / .xls) o CSV válido sin contraseña.'
      );
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void processFile(file);
  };

  const previewRows: ParsedPreviewRow[] = useMemo(() => {
    if (rawRows.length === 0) return [];
    const safeRate = exchangeRate > 0 ? exchangeRate : 1;
    const seenFileCodes = new Set<string>();
    const seenFileNames = new Set<string>();

    return rawRows.map((row, idx) => {
      const rawCode = mapping.code ? String(row[mapping.code] ?? '').trim() : '';
      const code = cleanProductCode(rawCode);
      const hadLeadingQuote = rawCode !== '' && rawCode !== code;
      const name = mapping.name ? String(row[mapping.name] ?? '').trim() : '';

      const rawCost = mapping.costUsd ? parseSmartNumber(row[mapping.costUsd]) : 0;
      const rawPrice = mapping.priceUsd ? parseSmartNumber(row[mapping.priceUsd]) : 0;

      const rawCostUsd = priceCurrency === 'VES' ? rawCost / safeRate : rawCost;
      const rawPriceUsd = priceCurrency === 'VES' ? rawPrice / safeRate : rawPrice;
      const costUsd = Math.max(0, Number((Math.round(rawCostUsd * 100) / 100).toFixed(2)));
      const priceUsd = applySalePriceRounding(rawPriceUsd, roundingMode);

      const stockVal = mapping.stock ? row[mapping.stock] : undefined;
      const stock =
        mapping.stock && String(stockVal ?? '').trim() !== ''
          ? Math.max(0, parseSmartNumber(stockVal))
          : undefined;

      const minStockVal = mapping.minStock ? row[mapping.minStock] : undefined;
      const minStock =
        mapping.minStock && String(minStockVal ?? '').trim() !== ''
          ? Math.max(0, parseSmartNumber(minStockVal))
          : undefined;

      const unit = mapping.unit ? String(row[mapping.unit] ?? '').trim() || undefined : undefined;
      const categoryName = mapping.categoryName
        ? String(row[mapping.categoryName] ?? '').trim() || undefined
        : undefined;

      const normCode = code
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
      const normName = normalizeDesc(name);

      let isDuplicateInFile = false;
      let reason: string | undefined;
      if (!code) {
        reason = 'Falta código';
      } else if (!name) {
        reason = 'Falta descripción';
      } else if (seenFileNames.has(normName)) {
        isDuplicateInFile = true;
        reason = 'Descripción repetida (se deja solo 1)';
      } else if (seenFileCodes.has(normCode)) {
        isDuplicateInFile = true;
        reason = 'Código repetido (se deja solo 1)';
      } else {
        seenFileCodes.add(normCode);
        seenFileNames.add(normName);
      }

      const existsInDb =
        !isDuplicateInFile &&
        ((normCode !== '' && existingCodeSet.has(normCode)) ||
          (normName !== '' && existingNameSet.has(normName)));

      return {
        rowNumber: idx + 1,
        code,
        name,
        costUsd,
        priceUsd,
        stock,
        minStock,
        unit,
        categoryName,
        existsInDb,
        isDuplicateInFile,
        hadLeadingQuote,
        isValid: Boolean(code && name && !isDuplicateInFile),
        reason,
      };
    });
  }, [rawRows, mapping, priceCurrency, roundingMode, exchangeRate, existingCodeSet, existingNameSet]);

  const stats = useMemo(() => {
    let valid = 0;
    let invalid = 0;
    let duplicatesSkipped = 0;
    let cleanedQuotes = 0;
    let newCount = 0;
    let updateCount = 0;

    for (const r of previewRows) {
      if (r.hadLeadingQuote) cleanedQuotes++;
      if (r.isDuplicateInFile) {
        duplicatesSkipped++;
      } else if (!r.isValid) {
        invalid++;
      } else {
        valid++;
        if (r.existsInDb) updateCount++;
        else newCount++;
      }
    }
    return { valid, invalid, duplicatesSkipped, cleanedQuotes, newCount, updateCount };
  }, [previewRows]);

  const handleConfirmImport = async () => {
    if (!mapping.code || !mapping.name) {
      setErrorMsg('Debe seleccionar al menos las columnas de Código y Descripción del Producto.');
      return;
    }

    const validItems = previewRows
      .filter((r) => r.isValid)
      .map((r) => ({
        code: r.code,
        name: r.name,
        costUsd: r.costUsd,
        priceUsd: r.priceUsd,
        stock: r.stock,
        minStock: r.minStock,
        unit: r.unit,
        categoryName: r.categoryName,
      }));

    if (validItems.length === 0) {
      setErrorMsg('No hay filas válidas para importar. Revise el mapeo de columnas.');
      return;
    }

    setIsImporting(true);
    setErrorMsg('');

    try {
      const res = await apiFetch('/api/products/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: validItems,
          mode: duplicateMode,
          defaultCategoryId: defaultCategoryId ? Number(defaultCategoryId) : null,
          branchId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al guardar los productos en la base de datos.');
      }

      const parts: string[] = [];
      if (data.created > 0) parts.push(`${data.created} creados`);
      if (data.updated > 0) parts.push(`${data.updated} actualizados`);
      if (data.skipped > 0) parts.push(`${data.skipped} omitidos`);

      const summary = `¡Importación completada exitosamente! (${parts.join(' · ')})`;
      resetState();
      onImportSuccess(summary);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Ocurrió un error al importar el archivo.');
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#161b22] text-slate-900 dark:text-slate-100 rounded-2xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-[#2d3748] relative overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-[#262f3c] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Importar Inventario desde Excel o CSV
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Suba su lista con Código, Descripción, Precio Costo y Precio Venta para alimentar la base de datos.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={isImporting}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Step 1: Upload Zone */}
          {rawRows.length === 0 ? (
            <div className="space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 sm:p-10 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30'
                    : 'border-slate-300 dark:border-[#303a48] hover:border-emerald-500 dark:hover:border-emerald-500 bg-slate-50/70 dark:bg-[#12161d]'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt,.ods"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-600/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-3">
                  <Upload className="w-7 h-7" />
                </div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  Haga clic aquí o arrastre su archivo Excel (.xlsx, .xls) o CSV
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                  El sistema detecta automáticamente las columnas de Código, Descripción, Precio Costo, Precio Venta y Stock, y le permite verificar todo antes de guardar.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#12161d] border border-slate-200 dark:border-[#262f3c] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-800 dark:text-white">
                    ¿Necesita un archivo de ejemplo?
                  </p>
                  <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                    Descargue la plantilla de Excel ya lista con las columnas recomendadas y pegue allí su inventario.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-[#232a36] dark:hover:bg-[#2d3645] text-white rounded-lg font-semibold flex items-center gap-2 shrink-0 cursor-pointer transition-colors"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span>Descargar Plantilla Excel</span>
                </button>
              </div>
            </div>
          ) : (
            /* Step 2: Column Mapping + Preview */
            <div className="space-y-5">
              {/* Loaded File Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60">
                <div className="flex items-center gap-2.5">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div>
                    <p className="font-bold text-emerald-900 dark:text-emerald-200">{fileName}</p>
                    <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80">
                      {rawRows.length} filas detectadas · {headers.length} columnas
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetState}
                  disabled={isImporting}
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#2d3748] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1f2530] font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Cambiar Archivo</span>
                </button>
              </div>

              {/* Column Mapping Grid */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#12161d] border border-slate-200 dark:border-[#262f3c] space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                    1. Verifique las columnas de su archivo
                  </h4>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Campos con * son obligatorios
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {(
                    [
                      { key: 'code', label: 'Código / SKU *', required: true },
                      { key: 'name', label: 'Descripción del Producto *', required: true },
                      { key: 'costUsd', label: 'Precio Costo', required: false },
                      { key: 'priceUsd', label: 'Precio Venta', required: false },
                      { key: 'stock', label: 'Stock / Existencia (Opcional)', required: false },
                      { key: 'unit', label: 'Unidad (Opcional)', required: false },
                      { key: 'categoryName', label: 'Categoría (Opcional)', required: false },
                      { key: 'minStock', label: 'Stock Mínimo (Opcional)', required: false },
                    ] as const
                  ).map((field) => (
                    <div key={field.key}>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {field.label}
                      </label>
                      <select
                        value={mapping[field.key]}
                        onChange={(e) =>
                          setMapping((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        className={`w-full py-2 px-2.5 bg-white dark:bg-[#161b22] border rounded-lg text-xs text-slate-900 dark:text-white focus:outline-hidden ${
                          field.required && !mapping[field.key]
                            ? 'border-amber-400 dark:border-amber-600'
                            : 'border-slate-200 dark:border-[#2d3748] focus:border-emerald-500'
                        }`}
                      >
                        <option value="">— No importar —</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Import Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#12161d] border border-slate-200 dark:border-[#262f3c]">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Moneda de los precios
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPriceCurrency('USD')}
                      className={`py-1.5 px-2 rounded-lg font-bold border transition-colors cursor-pointer ${
                        priceCurrency === 'USD'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white dark:bg-[#161b22] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#2d3748]'
                      }`}
                    >
                      Dólares ($)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPriceCurrency('VES')}
                      className={`py-1.5 px-2 rounded-lg font-bold border transition-colors cursor-pointer ${
                        priceCurrency === 'VES'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white dark:bg-[#161b22] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#2d3748]'
                      }`}
                    >
                      Bolívares (Bs.)
                    </button>
                  </div>
                  {priceCurrency === 'VES' && (
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1.5">
                      Tasa BCV actual: {exchangeRate.toFixed(2)} Bs/$
                    </p>
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#12161d] border border-slate-200 dark:border-[#262f3c]">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Redondeo Precio de Venta
                  </label>
                  <select
                    value={roundingMode}
                    onChange={(e) => setRoundingMode(e.target.value as SalePriceRoundingMode)}
                    className="w-full py-2 px-2.5 bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs text-slate-900 dark:text-white focus:outline-hidden"
                  >
                    <option value="round_2">2 decimales (ej. 1.35)</option>
                    <option value="ceil_2">Hacia arriba (2 decimales)</option>
                    <option value="step_005">Múltiplo de 0.05 (1.35 / 1.40)</option>
                    <option value="step_010">Múltiplo de 0.10 (1.30 / 1.40)</option>
                    <option value="int_round">Entero más cercano (ej. 2.00)</option>
                    <option value="int_ceil">Entero hacia arriba (ej. 2.00)</option>
                  </select>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#12161d] border border-slate-200 dark:border-[#262f3c]">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Si un código ya existe
                  </label>
                  <select
                    value={duplicateMode}
                    onChange={(e) =>
                      setDuplicateMode(e.target.value as 'upsert' | 'skip_existing')
                    }
                    className="w-full py-2 px-2.5 bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs text-slate-900 dark:text-white focus:outline-hidden"
                  >
                    <option value="upsert">Actualizar nombre y precios</option>
                    <option value="skip_existing">Omitir y dejar el existente</option>
                  </select>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#12161d] border border-slate-200 dark:border-[#262f3c]">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Categoría por defecto
                  </label>
                  <select
                    value={defaultCategoryId}
                    onChange={(e) => setDefaultCategoryId(e.target.value)}
                    className="w-full py-2 px-2.5 bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs text-slate-900 dark:text-white focus:outline-hidden"
                  >
                    <option value="">Sin categoría</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Summary Counters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#12161d] border border-slate-200 dark:border-[#262f3c]">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Listos para cargar</span>
                  <span className="text-lg font-black text-slate-900 dark:text-white font-mono">
                    {stats.valid}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60">
                  <span className="text-[11px] text-emerald-700 dark:text-emerald-400 block">Productos nuevos</span>
                  <span className="text-lg font-black text-emerald-800 dark:text-emerald-300 font-mono">
                    {stats.newCount}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/60">
                  <span className="text-[11px] text-sky-700 dark:text-sky-400 block">
                    {duplicateMode === 'upsert' ? 'Se actualizarán' : 'Se omitirán'}
                  </span>
                  <span className="text-lg font-black text-sky-800 dark:text-sky-300 font-mono">
                    {stats.updateCount}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60">
                  <span className="text-[11px] text-amber-700 dark:text-amber-400 block">
                    Repetidos / Incompletos
                  </span>
                  <span className="text-lg font-black text-amber-800 dark:text-amber-300 font-mono">
                    {stats.duplicatesSkipped + stats.invalid}
                  </span>
                </div>
              </div>

              {(stats.cleanedQuotes > 0 || stats.duplicatesSkipped > 0) && (
                <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 text-[11px] text-emerald-800 dark:text-emerald-300 font-medium flex flex-wrap items-center gap-x-4 gap-y-1">
                  {stats.cleanedQuotes > 0 && (
                    <span>
                      ✓ Se quitó el símbolo (´ / ') inicial de <strong>{stats.cleanedQuotes}</strong> códigos.
                    </span>
                  )}
                  {stats.duplicatesSkipped > 0 && (
                    <span>
                      ✓ Se omitieron <strong>{stats.duplicatesSkipped}</strong> descripciones/códigos repetidos para dejar uno solo.
                    </span>
                  )}
                </div>
              )}

              {/* Preview Table */}
              <div className="rounded-xl border border-slate-200 dark:border-[#262f3c] overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 dark:bg-[#1f2530] border-b border-slate-200 dark:border-[#262f3c] flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    2. Vista previa de los productos (mostrando primeros {Math.min(50, previewRows.length)} de {previewRows.length})
                  </span>
                </div>
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 dark:bg-[#1a2029] text-slate-600 dark:text-slate-300 font-semibold sticky top-0">
                      <tr>
                        <th className="py-2 px-3">Código</th>
                        <th className="py-2 px-3">Descripción del Producto</th>
                        <th className="py-2 px-3 text-right">Costo USD</th>
                        <th className="py-2 px-3 text-right">Venta USD</th>
                        <th className="py-2 px-3 text-right">Venta Bs.</th>
                        <th className="py-2 px-3 text-center">Stock</th>
                        <th className="py-2 px-3 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#262f3c] bg-white dark:bg-[#161b22]">
                      {previewRows.slice(0, 50).map((row) => (
                        <tr
                          key={row.rowNumber}
                          className={!row.isValid ? 'bg-rose-50/50 dark:bg-rose-950/25' : ''}
                        >
                          <td className="py-2 px-3 font-mono font-semibold text-slate-900 dark:text-slate-200">
                            {row.code || '—'}
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white">
                            {row.name || '—'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-slate-600 dark:text-slate-300">
                            ${row.costUsd.toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                            ${row.priceUsd.toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-emerald-700 dark:text-emerald-400">
                            Bs. {(row.priceUsd * exchangeRate).toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-center font-mono text-slate-700 dark:text-slate-300">
                            {row.stock !== undefined ? row.stock : '—'}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {!row.isValid ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300">
                                {row.reason}
                              </span>
                            ) : row.existsInDb ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 dark:bg-sky-950/70 text-sky-800 dark:text-sky-300">
                                {duplicateMode === 'upsert' ? 'ACTUALIZAR' : 'OMITIR'}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300">
                                NUEVO
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-[#262f3c] flex items-center justify-between gap-3 shrink-0 bg-slate-50/70 dark:bg-[#12161d]">
          <button
            type="button"
            onClick={handleClose}
            disabled={isImporting}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-[#2d3748] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1f2530] text-xs font-semibold cursor-pointer"
          >
            Cancelar
          </button>

          {rawRows.length > 0 && (
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={isImporting || stats.valid === 0}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-xs cursor-pointer transition-colors"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Cargando en la base de datos...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>
                    Importar {stats.valid} {stats.valid === 1 ? 'Producto' : 'Productos'} a la Base de Datos
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
