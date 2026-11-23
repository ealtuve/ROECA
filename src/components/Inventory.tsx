import { apiFetch } from '../lib/firestoreStore.ts';
import React, { useState, useEffect, useMemo } from 'react';
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  AlertCircle,
  ExternalLink,
  Edit,
  Trash2,
  X,
  Check,
  Filter,
  DollarSign,
  TrendingUp,
} from 'lucide-react';
import { Product, Category, ExchangeRate } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';

interface InventoryProps {
  exchangeRate: ExchangeRate | null;
  initialLowStockFilter?: boolean;
}

export const Inventory: React.FC<InventoryProps> = ({
  exchangeRate,
  initialLowStockFilter = false,
}) => {
  const { hasPermission } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('todas');
  const [showLowStockOnly, setShowLowStockOnly] = useState(initialLowStockFilter);
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [formError, setFormError] = useState('');

  // Form fields
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [unit, setUnit] = useState('unidad');
  const [costUsd, setCostUsd] = useState('');
  const [priceUsd, setPriceUsd] = useState('');
  const [stock, setStock] = useState('');
  const [minStock, setMinStock] = useState('10');

  const rate = exchangeRate?.rate || 76.5;

  const loadInventory = async () => {
    setIsLoading(true);
    try {
      const [prodRes, catRes] = await Promise.all([
        apiFetch('/api/products'),
        apiFetch('/api/categories'),
      ]);
      if (prodRes.ok) setProducts(await prodRes.json());
      if (catRes.ok) setCategories(await catRes.json());
    } catch (err) {
      console.error('Error fetching inventory', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, []);

  useEffect(() => {
    if (initialLowStockFilter) {
      setShowLowStockOnly(true);
    }
  }, [initialLowStockFilter]);

  const openCreateModal = () => {
    setEditingProduct(null);
    setCode('');
    setName('');
    setDescription('');
    setCategoryId(categories[0]?.id ? String(categories[0].id) : '');
    setUnit('unidad');
    setCostUsd('0.00');
    setPriceUsd('');
    setStock('0');
    setMinStock('10');
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setCode(p.code);
    setName(p.name);
    setDescription(p.description || '');
    setCategoryId(p.categoryId ? String(p.categoryId) : '');
    setUnit(p.unit || 'unidad');
    setCostUsd(String(p.costUsd));
    setPriceUsd(String(p.priceUsd));
    setStock(String(p.stock));
    setMinStock(String(p.minStock));
    setFormError('');
    setIsModalOpen(true);
  };

  const normalizeText = (str: string) =>
    str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  // Duplicate code detection in real-time
  const duplicateProductByCode = useMemo(() => {
    const trimmed = normalizeText(code);
    if (!trimmed) return null;
    return products.find(
      (p) => p.id !== editingProduct?.id && normalizeText(p.code) === trimmed
    ) || null;
  }, [code, products, editingProduct]);

  // Exact duplicate name detection in real-time
  const exactMatchByName = useMemo(() => {
    const trimmed = normalizeText(name);
    if (!trimmed) return null;
    return products.find(
      (p) => p.id !== editingProduct?.id && normalizeText(p.name) === trimmed
    ) || null;
  }, [name, products, editingProduct]);

  // Similar products search in real-time as user types
  const similarProducts = useMemo(() => {
    const query = normalizeText(name);
    const codeQuery = normalizeText(code);
    if (query.length < 2 && codeQuery.length < 2) return [];

    const tokens = query.split(/\s+/).filter((t) => t.length > 1);

    const scored = products
      .filter((p) => p.id !== editingProduct?.id)
      .map((p) => {
        const pName = normalizeText(p.name);
        const pCode = normalizeText(p.code);
        let score = 0;

        // Code matching
        if (codeQuery.length >= 2) {
          if (pCode === codeQuery) score += 40;
          else if (pCode.startsWith(codeQuery)) score += 25;
          else if (pCode.includes(codeQuery)) score += 15;
        }

        // Name matching
        if (query.length >= 2) {
          if (pName === query) score += 60;
          else if (pName.startsWith(query)) score += 35;
          else if (pName.includes(query)) score += 20;

          tokens.forEach((tok) => {
            if (pName.includes(tok)) score += 10;
          });
        }

        return { product: p, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((item) => item.product);

    return scored;
  }, [name, code, products, editingProduct]);

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim() || !priceUsd) {
      setFormError('Código, nombre y precio en USD son obligatorios.');
      return;
    }

    if (duplicateProductByCode) {
      setFormError(
        `No se puede guardar: el código "${code.trim()}" ya está asignado al producto "${duplicateProductByCode.name}". No se permiten códigos duplicados.`
      );
      return;
    }

    if (!editingProduct && exactMatchByName) {
      setFormError(
        `Ya existe un producto idéntico registrado: "${exactMatchByName.name}" con código [${exactMatchByName.code}]. Verifique antes de crear un registro duplicado con otro código.`
      );
      return;
    }

    try {
      const payload = {
        code: code.trim(),
        name: name.trim(),
        description: description.trim() || null,
        categoryId: categoryId ? Number(categoryId) : null,
        unit,
        costUsd: Number(costUsd) || 0,
        priceUsd: Number(priceUsd),
        stock: Number(stock) || 0,
        minStock: Number(minStock) || 10,
      };

      const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products';
      const method = editingProduct ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al guardar el producto');
      }

      setIsModalOpen(false);
      setSuccessMsg(editingProduct ? '¡Producto actualizado correctamente en la base de datos!' : '¡Nuevo producto registrado exitosamente en la base de datos!');
      setTimeout(() => setSuccessMsg(''), 5000);
      loadInventory();
    } catch (err: any) {
      setFormError(err.message || 'Error en el servidor');
    }
  };

  const handleDeleteProduct = async () => {
    if (!deleteTarget) return;

    try {
      const res = await apiFetch(`/api/products/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'No se pudo eliminar el producto');
      } else {
        setDeleteTarget(null);
        loadInventory();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filtered = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      selectedCategory === 'todas' || (p.categoryId && String(p.categoryId) === selectedCategory);
    const matchesLowStock = !showLowStockOnly || p.stock <= p.minStock;

    return matchesSearch && matchesCategory && matchesLowStock;
  });

  const lowStockCount = products.filter((p) => p.stock <= p.minStock).length;
  const canEdit = hasPermission('inventory');

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Bar */}
      <div className="bg-white dark:bg-[#161b22] p-6 rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition-colors">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Catálogo de Inventario y Víveres
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-md bg-slate-100 dark:bg-[#1c222b] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#2d3748] font-semibold font-mono">
              {products.length} productos
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Gestión intuitiva de víveres, costos en divisas, precios y control de alertas de stock mínimo.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowLowStockOnly(!showLowStockOnly)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer border ${
              showLowStockOnly
                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                : 'bg-white dark:bg-[#1c222b] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#2d3748] hover:bg-slate-50 dark:hover:bg-[#252c38]'
            }`}
          >
            <AlertTriangle className={`w-4 h-4 ${showLowStockOnly ? 'text-amber-700 dark:text-amber-400' : 'text-amber-500'}`} />
            <span>Solo Stock Bajo ({lowStockCount})</span>
          </button>

          {canEdit && (
            <button
              onClick={openCreateModal}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Producto</span>
            </button>
          )}
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 font-semibold flex items-center gap-2 shadow-xs">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Filters & Search */}
      <div className="bg-white dark:bg-[#161b22] p-4 rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between transition-colors">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Buscar por código de barra, SKU o nombre del producto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:border-emerald-600 dark:focus:border-emerald-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="py-2 px-3 bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-hidden cursor-pointer"
          >
            <option value="todas">Todas las Categorías</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white dark:bg-[#161b22] rounded-xl border border-slate-200 dark:border-[#262f3c] shadow-xs overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-[#1f2530] border-b border-slate-200 dark:border-[#262f3c] text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Código / SKU</th>
                <th className="py-3 px-4">Descripción del Producto</th>
                <th className="py-3 px-4">Categoría</th>
                <th className="py-3 px-4">Unidad</th>
                <th className="py-3 px-4 text-right">Precio Venta (Bs.)</th>
                <th className="py-3 px-4 text-right">Ref. USD</th>
                <th className="py-3 px-4 text-right">Costo USD</th>
                <th className="py-3 px-4 text-center">Stock Actual</th>
                <th className="py-3 px-4 text-center">Mínimo</th>
                <th className="py-3 px-4 text-center">Estado</th>
                {canEdit && <th className="py-3 px-4 text-center">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-400">
                    No se encontraron productos que coincidan con la búsqueda.
                  </td>
                </tr>
              ) : (
                filtered.map((product) => {
                  const isOutOfStock = product.stock <= 0;
                  const isLowStock = product.stock > 0 && product.stock <= product.minStock;

                  return (
                    <tr
                      key={product.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isOutOfStock
                          ? 'bg-rose-50/40'
                          : isLowStock
                          ? 'bg-amber-50/40'
                          : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                        {product.code}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">
                        <span className="font-semibold">{product.name}</span>
                        {product.description && (
                          <span className="block text-[11px] text-slate-400 truncate max-w-xs">
                            {product.description}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {product.categoryName || 'Sin categoría'}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{product.unit}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900 text-sm">
                        Bs. {(product.priceUsd * rate).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500">
                        ${product.priceUsd.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-400">
                        ${product.costUsd.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center font-mono tabular-nums font-bold">
                        <span
                          className={`${
                            isOutOfStock
                              ? 'text-rose-700'
                              : isLowStock
                              ? 'text-amber-700'
                              : 'text-slate-900'
                          }`}
                        >
                          {product.stock}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono tabular-nums text-slate-400">
                        {product.minStock}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isOutOfStock ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                            AGOTADO
                          </span>
                        ) : isLowStock ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            STOCK BAJO
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            NORMAL
                          </span>
                        )}
                      </td>
                      {canEdit && (
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => openEditModal(product)}
                              className="p-1 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                              title="Modificar producto"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(product)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                              title="Eliminar producto"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Product Modal with Live Duplicate & Similar Detection */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#161b22] text-slate-900 dark:text-slate-100 rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 dark:border-[#2d3748] relative my-6 animate-in fade-in duration-150">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Package className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <span>{editingProduct ? 'Modificar Producto de Víveres' : 'Registrar Nuevo Producto'}</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Distribuidora ROECA · Verificación en tiempo real de códigos y productos semejantes
              </p>
            </div>

            {formError && (
              <div className="mb-4 p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-700 dark:text-rose-300 font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveProduct} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Código / SKU Input */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                      Código de Barra / SKU *
                    </label>
                    {duplicateProductByCode && (
                      <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold">
                        ¡Código duplicado!
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="ej. 7591001001"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className={`w-full py-2 px-3 rounded-lg font-mono text-slate-900 dark:text-slate-100 focus:outline-hidden transition-colors ${
                      duplicateProductByCode
                        ? 'border-2 border-rose-500 bg-rose-50/50 dark:bg-rose-950/30'
                        : 'border border-slate-200 dark:border-[#2d3748] bg-white dark:bg-[#1c222b] focus:border-emerald-600'
                    }`}
                    required
                  />
                </div>

                {/* Unidad de Medida */}
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Unidad de Medida
                  </label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full py-2 px-3 border border-slate-200 dark:border-[#2d3748] bg-white dark:bg-[#1c222b] text-slate-900 dark:text-slate-100 rounded-lg focus:outline-hidden cursor-pointer"
                  >
                    <option value="unidad">Unidad</option>
                    <option value="kg">Kilogramo (kg)</option>
                    <option value="paquete">Paquete</option>
                    <option value="bulto">Bulto</option>
                    <option value="litro">Litro</option>
                    <option value="caja">Caja</option>
                  </select>
                </div>
              </div>

              {/* Duplicate Code Alert Box */}
              {duplicateProductByCode && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-900/60 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2.5 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-bold block">¡Código ya registrado en el inventario!</span>
                    <span className="block mt-0.5 text-[11px]">
                      El código <strong className="font-mono">"{code}"</strong> ya pertenece al producto: <strong className="font-semibold">{duplicateProductByCode.name}</strong> (Stock: {duplicateProductByCode.stock} {duplicateProductByCode.unit} · Precio: Bs. {(duplicateProductByCode.priceUsd * rate).toFixed(2)}).
                    </span>
                    <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5">
                      Para no crear registros duplicados, modifique el código o edite directamente este producto.
                    </p>
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(duplicateProductByCode)}
                        className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-md font-semibold text-[11px] cursor-pointer shadow-2xs transition-colors flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Cargar y Modificar este Producto Existente</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Nombre del Producto Input */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                    Nombre del Producto *
                  </label>
                  {exactMatchByName && !editingProduct && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                      ¡Nombre idéntico detectado!
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="ej. Harina P.A.N. Maíz Blanco 1kg"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full py-2 px-3 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-hidden transition-colors ${
                    exactMatchByName && !editingProduct
                      ? 'border-2 border-amber-500 bg-amber-50/50 dark:bg-amber-950/30'
                      : 'border border-slate-200 dark:border-[#2d3748] bg-white dark:bg-[#1c222b] focus:border-emerald-600'
                  }`}
                  required
                />
              </div>

              {/* Exact Match by Name Warning */}
              {exactMatchByName && !editingProduct && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-900/60 rounded-xl text-xs text-amber-900 dark:text-amber-300 flex items-start gap-2.5 animate-in fade-in">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-bold block">¡Producto con este nombre exacto ya existe!</span>
                    <span className="block mt-0.5 text-[11px]">
                      Ya se encuentra registrado: <strong>"{exactMatchByName.name}"</strong> con código <strong className="font-mono">[{exactMatchByName.code}]</strong>.
                    </span>
                    <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
                      Evite registrar el mismo producto con un código doble diferente.
                    </p>
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(exactMatchByName)}
                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-md font-semibold text-[11px] cursor-pointer shadow-2xs transition-colors flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Cargar este producto existente en vez de crear uno nuevo</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* LIVE SIMILAR PRODUCTS PANEL (PRODUCTOS SEMEJANTES) */}
              {similarProducts.length > 0 && (
                <div className="p-3 bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Search className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Productos semejantes en inventario ({similarProducts.length} encontrados):</span>
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Revise para no duplicar</span>
                  </div>

                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {similarProducts.map((simProd) => (
                      <div
                        key={simProd.id}
                        className="p-2 bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#262f3c] rounded-lg flex items-center justify-between text-[11px] hover:border-emerald-500 dark:hover:border-emerald-500 transition-colors"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-900 dark:text-slate-100 truncate">
                              {simProd.name}
                            </span>
                            <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-[#252c38] px-1 py-0.2 rounded">
                              SKU: {simProd.code}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5 font-mono">
                            <span>Stock: {simProd.stock} {simProd.unit}</span>
                            <span>·</span>
                            <span className="font-bold text-emerald-700 dark:text-emerald-400">
                              Bs. {(simProd.priceUsd * rate).toFixed(2)} (${simProd.priceUsd.toFixed(2)})
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => openEditModal(simProd)}
                          className="px-2 py-1 bg-slate-100 hover:bg-emerald-50 dark:bg-[#252c38] dark:hover:bg-emerald-950/60 text-slate-700 dark:text-slate-200 hover:text-emerald-700 dark:hover:text-emerald-400 border border-slate-200 dark:border-[#2d3748] rounded text-[10px] font-semibold shrink-0 cursor-pointer transition-colors"
                          title="Cargar los datos de este producto en el formulario para editarlo"
                        >
                          Cargar / Editar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Categoría y Stock Mínimo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Categoría</label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full py-2 px-3 border border-slate-200 dark:border-[#2d3748] bg-white dark:bg-[#1c222b] text-slate-900 dark:text-slate-100 rounded-lg focus:outline-hidden cursor-pointer"
                  >
                    <option value="">Seleccione Categoría</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Alerta Stock Mínimo
                  </label>
                  <input
                    type="number"
                    value={minStock}
                    onChange={(e) => setMinStock(e.target.value)}
                    className="w-full py-2 px-3 border border-slate-200 dark:border-[#2d3748] bg-white dark:bg-[#1c222b] text-slate-900 dark:text-slate-100 rounded-lg focus:outline-hidden font-mono"
                  />
                </div>
              </div>

              {/* Costo, Precio y Stock Actual */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Costo Compra ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={costUsd}
                    onChange={(e) => setCostUsd(e.target.value)}
                    className="w-full py-2 px-3 border border-slate-200 dark:border-[#2d3748] bg-white dark:bg-[#1c222b] text-slate-900 dark:text-slate-100 rounded-lg focus:outline-hidden font-mono"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Precio Venta ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={priceUsd}
                    onChange={(e) => setPriceUsd(e.target.value)}
                    className="w-full py-2 px-3 border border-slate-200 dark:border-[#2d3748] bg-white dark:bg-[#1c222b] text-slate-900 dark:text-slate-100 rounded-lg focus:outline-hidden font-mono font-bold text-emerald-800 dark:text-emerald-400"
                    required
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Stock Actual</label>
                  <input
                    type="number"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    className="w-full py-2 px-3 border border-slate-200 dark:border-[#2d3748] bg-white dark:bg-[#1c222b] text-slate-900 dark:text-slate-100 rounded-lg focus:outline-hidden font-mono"
                  />
                </div>
              </div>

              {/* Live calculated price in Bs. at BCV rate */}
              {priceUsd && (
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#1c222b] border border-slate-200 dark:border-[#2d3748] text-[11px] text-slate-600 dark:text-slate-400 flex justify-between font-mono">
                  <span>Precio calculado en Bolívares (Tasa BCV {rate.toFixed(2)}):</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    Bs. {(Number(priceUsd) * rate).toFixed(2)}
                  </span>
                </div>
              )}

              {/* Modal Action Buttons */}
              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#1c222b] dark:hover:bg-[#252c38] text-slate-700 dark:text-slate-300 rounded-xl font-semibold cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!!duplicateProductByCode}
                  className={`flex-1 py-2 rounded-xl font-semibold cursor-pointer shadow-xs transition-colors ${
                    duplicateProductByCode
                      ? 'bg-rose-400 text-white cursor-not-allowed opacity-75'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  {duplicateProductByCode
                    ? 'Código ya Registrado'
                    : editingProduct
                    ? 'Actualizar Producto'
                    : 'Guardar Producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-xl border border-slate-200 text-center">
            <span className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-5 h-5" />
            </span>
            <h4 className="text-base font-bold text-slate-900">¿Eliminar este producto?</h4>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Se eliminará <span className="font-bold text-slate-800">"{deleteTarget.name}"</span> del inventario. Si tiene ventas registradas, el sistema protegerá la integridad contable.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteProduct}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
