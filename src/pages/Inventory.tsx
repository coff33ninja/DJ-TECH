import { useState, useEffect, FormEvent } from 'react';
import { Search, Plus, Package, X, Link as LinkIcon, DollarSign, Pencil, TrendingUp, TrendingDown, History } from 'lucide-react';

interface InventoryItem {
  id: string;
  partNumber: string | null;
  sku: string | null;
  productName: string;
  category: string | null;
  manufacturer: string | null;
  model: string | null;
  description: string | null;
  quantity: number;
  minimumStockLevel: number | null;
  purchasePrice: number;
  sellingPrice: number;
  supplier: string | null;
  supplierId: string | null;
  supplierName: string | null;
  productUrl: string | null;
}

interface Supplier {
  id: string;
  name: string;
}

interface Movement {
  id: string;
  type: string;
  quantity: number;
  reason: string | null;
  jobId: string | null;
  createdAt: string | number | Date | null;
}

const emptyForm = {
  productName: '', category: '', manufacturer: '', model: '',
  purchasePrice: '', sellingPrice: '', supplier: '', supplierId: '', quantity: '0',
};

export default function Inventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  // Movement state
  const [showMovements, setShowMovements] = useState(false);
  const [movementItem, setMovementItem] = useState<InventoryItem | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [movementForm, setMovementForm] = useState({ type: 'in', quantity: '1', reason: '' });
  const [movementSaving, setMovementSaving] = useState(false);

  // Import State
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetchInventory();
    fetchSuppliers();
  }, []);

  const fetchSuppliers = () => {
    fetch('/api/suppliers')
      .then(res => res.json())
      .then(data => setSuppliers(data))
      .catch(err => console.error('Failed to fetch suppliers', err));
  };

  const fetchMovements = (id: string) => {
    fetch(`/api/inventory/${id}/movements`)
      .then(res => res.json())
      .then(data => setMovements(data))
      .catch(err => console.error('Failed to fetch movements', err));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.productName.trim()) return;
    setSaving(true);
    try {
      const payload = {
        productName: form.productName,
        category: form.category,
        manufacturer: form.manufacturer,
        model: form.model,
        purchasePrice: parseFloat(form.purchasePrice) || 0,
        sellingPrice: parseFloat(form.sellingPrice) || 0,
        quantity: parseInt(form.quantity, 10) || 0,
      };
      if (form.supplierId) {
        (payload as any).supplierId = form.supplierId;
      } else if (form.supplier) {
        (payload as any).supplier = form.supplier;
      }
      const res = await fetch(editing ? `/api/inventory/${editing.id}` : '/api/inventory', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Save failed');
      setShowModal(false);
      setEditing(null);
      setForm(emptyForm);
      fetchInventory();
    } catch (err) {
      console.error('Failed to save inventory item', err);
      alert('Failed to save inventory item.');
    } finally {
      setSaving(false);
    }
  };

  const handleMovementSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!movementItem) return;
    setMovementSaving(true);
    try {
      const res = await fetch(`/api/inventory/${movementItem.id}/movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: movementForm.type,
          quantity: parseInt(movementForm.quantity, 10) || 0,
          reason: movementForm.reason,
        })
      });
      if (!res.ok) throw new Error('Movement failed');
      setMovementForm({ type: 'in', quantity: '1', reason: '' });
      fetchMovements(movementItem.id);
      fetchInventory();
    } catch (err) {
      console.error('Failed to record movement', err);
      alert('Failed to record stock movement.');
    } finally {
      setMovementSaving(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditing(item);
    setForm({
      productName: item.productName,
      category: item.category || '',
      manufacturer: item.manufacturer || '',
      model: item.model || '',
      purchasePrice: String(item.purchasePrice ?? ''),
      sellingPrice: String(item.sellingPrice ?? ''),
      supplier: item.supplier || '',
      supplierId: item.supplierId || '',
      quantity: String(item.quantity ?? '0'),
    });
    setShowModal(true);
  };

  const openMovements = (item: InventoryItem) => {
    setMovementItem(item);
    setMovements([]);
    setShowMovements(true);
    fetchMovements(item.id);
  };

  const setField = (field: keyof typeof form, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const fetchInventory = () => {
    setLoading(true);
    fetch('/api/inventory')
      .then(res => res.json())
      .then(data => {
        setItems(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch inventory', err);
        setLoading(false);
      });
  };

  const handleImport = async () => {
    if (!importUrl) return;
    setImporting(true);
    try {
      const res = await fetch('/api/product-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl })
      });
      const data = await res.json();

      // Auto-save the imported item for demo purposes
      await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          sellingPrice: data.purchasePrice * 1.5, // Default 50% markup
          quantity: 0
        })
      });
      setImportUrl('');
      fetchInventory();
    } catch (error) {
      console.error(error);
    } finally {
      setImporting(false);
    }
  };

  const filteredItems = items.filter(i =>
    i.productName.toLowerCase().includes(search.toLowerCase()) ||
    (i.supplier && i.supplier.toLowerCase().includes(search.toLowerCase())) ||
    (i.supplierName && i.supplierName.toLowerCase().includes(search.toLowerCase()))
  );

  const supplierDisplay = (item: InventoryItem) => item.supplierName || item.supplier || 'Unknown Supplier';
  const movementTypeStyles: Record<string, string> = {
    in: 'bg-emerald-100 text-emerald-700',
    out: 'bg-red-100 text-red-700',
    adjustment: 'bg-amber-100 text-amber-700',
    'job-used': 'bg-sky-100 text-sky-700',
  };

  return (
    <div className="p-6 h-full flex flex-col relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Inventory & Parts</h1>
          <p className="text-sm text-slate-500 mt-1">Manage stock, track purchases, and import products.</p>
        </div>
        <button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-semibold flex items-center gap-2 text-xs transition-colors">
          <Plus size={16} />
          Add Item
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 overflow-hidden flex-1 min-h-0">
        {/* Main Inventory Table */}
        <div className="flex-[2] bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-0">
          <div className="p-4 border-b border-slate-100 flex gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input
                type="text"
                placeholder="Search inventory..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="px-6 py-3">Product</th>
                  <th className="px-6 py-3">Stock</th>
                  <th className="px-6 py-3">Price (Cost / Sell)</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-500">Loading inventory...</td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Package size={32} className="text-slate-300" />
                        <p>No items found.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredItems.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900 truncate max-w-[200px]">{item.productName}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{supplierDisplay(item)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`font-bold text-[10px] px-2 py-0.5 rounded-full ${item.quantity <= 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
                          {item.quantity} in stock
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1 text-[11px] font-medium">
                          <span className="text-slate-500">Cost: R{item.purchasePrice.toFixed(2)}</span>
                          <span className="text-emerald-600">Sell: R{item.sellingPrice.toFixed(2)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button onClick={() => openMovements(item)} className="text-slate-500 hover:text-indigo-600 font-bold text-xs transition-colors flex items-center gap-1">
                            <History size={14} /> Movements
                          </button>
                          <button onClick={() => openEdit(item)} className="text-indigo-600 hover:underline font-bold text-xs transition-colors flex items-center gap-1">
                            <Pencil size={14} /> Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sidebar Tools */}
        <div className="flex-1 space-y-6 overflow-y-auto">
          {/* Smart Importer */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h2 className="font-bold text-slate-900 flex items-center gap-2 mb-4 text-sm">
              <LinkIcon size={16} className="text-indigo-600" />
              Smart Product Import
            </h2>
            <p className="text-xs text-slate-500 mb-4">Paste a URL from Takealot or a supplier to automatically import product details.</p>

            <div className="space-y-3">
              <input
                type="url"
                placeholder="https://takealot.com/..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
              />
              <button
                onClick={handleImport}
                disabled={importing || !importUrl}
                className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white py-2 rounded text-xs font-semibold uppercase tracking-wide transition-colors"
              >
                {importing ? 'Importing...' : 'Extract Product Data'}
              </button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-slate-900 rounded-xl shadow-sm p-5 text-white">
            <h2 className="font-bold flex items-center gap-2 mb-4 text-sm">
              <DollarSign size={16} className="text-emerald-400" />
              Inventory Value
            </h2>
            <div className="space-y-4">
              <div>
                <p className="text-slate-400 text-[10px] uppercase tracking-wider font-bold">Total Cost Value</p>
                <p className="text-2xl font-bold mt-1">R{items.reduce((acc, curr) => acc + (curr.purchasePrice * curr.quantity), 0).toFixed(2)}</p>
              </div>
              <div className="pt-4 border-t border-slate-800">
                <p className="text-slate-400 text-[10px] uppercase tracking-wider font-bold">Potential Retail Value</p>
                <p className="text-xl font-bold text-emerald-400 mt-1">R{items.reduce((acc, curr) => acc + (curr.sellingPrice * curr.quantity), 0).toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add / Edit Item Modal */}
      {showModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg flex flex-col max-h-full">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <h2 className="font-bold text-slate-800 text-sm">{editing ? 'Edit Inventory Item' : 'Add Inventory Item'}</h2>
              <button onClick={() => { setShowModal(false); setEditing(null); }} className="text-slate-400 hover:text-slate-600 text-sm font-bold">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 flex flex-col flex-1 overflow-y-auto gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Product Name *</label>
                <input
                  required
                  value={form.productName}
                  onChange={(e) => setField('productName', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  placeholder="Samsung 1TB SSD"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Category</label>
                  <input
                    value={form.category}
                    onChange={(e) => setField('category', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="Storage, Screens, Cables..."
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Supplier</label>
                  <select
                    value={form.supplierId}
                    onChange={(e) => setField('supplierId', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  >
                    <option value="">-- Select supplier --</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <input
                    value={form.supplier}
                    onChange={(e) => setField('supplier', e.target.value)}
                    className="w-full px-3 py-2 mt-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="Or type supplier name (legacy)"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Manufacturer</label>
                  <input
                    value={form.manufacturer}
                    onChange={(e) => setField('manufacturer', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="Samsung"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Model</label>
                  <input
                    value={form.model}
                    onChange={(e) => setField('model', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="870 EVO"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Purchase Price (R)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.purchasePrice}
                    onChange={(e) => setField('purchasePrice', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="0.00"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Selling Price (R)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.sellingPrice}
                    onChange={(e) => setField('sellingPrice', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="0.00"
                  />
                </div>
              </div>
              {!editing && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Quantity in Stock</label>
                  <input
                    type="number"
                    min="0"
                    value={form.quantity}
                    onChange={(e) => setField('quantity', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
              )}
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setEditing(null); }}
                  className="px-4 py-2 rounded text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-semibold text-xs transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Movement Modal */}
      {showMovements && movementItem && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg flex flex-col max-h-full">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <History size={15} className="text-indigo-600" />
                Stock Movements — {movementItem.productName}
              </h2>
              <button onClick={() => setShowMovements(false)} className="text-slate-400 hover:text-slate-600 text-sm font-bold">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleMovementSubmit} className="p-4 border-b border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Type</label>
                <select
                  value={movementForm.type}
                  onChange={(e) => setMovementForm(prev => ({ ...prev, type: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                >
                  <option value="in">In</option>
                  <option value="out">Out</option>
                  <option value="adjustment">Adjustment</option>
                  <option value="job-used">Job Used</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Qty</label>
                <input
                  type="number"
                  value={movementForm.quantity}
                  onChange={(e) => setMovementForm(prev => ({ ...prev, quantity: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Reason</label>
                <input
                  value={movementForm.reason}
                  onChange={(e) => setMovementForm(prev => ({ ...prev, reason: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  placeholder="e.g. Used in DJ-2026-0001"
                />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2">
                <button
                  type="submit"
                  disabled={movementSaving}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-semibold text-xs transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  {movementForm.type === 'in' ? <TrendingUp size={14} /> : movementForm.type === 'out' ? <TrendingDown size={14} /> : null}
                  {movementSaving ? 'Recording...' : 'Record Movement'}
                </button>
              </div>
            </form>

            <div className="p-4 overflow-y-auto flex-1">
              {movements.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-6">No movements recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {movements.map(m => (
                    <div key={m.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${movementTypeStyles[m.type] || 'bg-slate-100 text-slate-700'}`}>
                          {m.type}
                        </span>
                        <span className="text-sm text-slate-700">
                          {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                        </span>
                        {m.reason && <span className="text-xs text-slate-400">{m.reason}</span>}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {m.createdAt ? new Date(m.createdAt).toLocaleString() : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
