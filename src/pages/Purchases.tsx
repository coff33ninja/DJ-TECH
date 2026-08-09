import { useState, useEffect, FormEvent } from 'react';
import { Search, Plus, Truck, X, ExternalLink, PackagePlus, Trash2 } from 'lucide-react';

interface Customer {
  id: string;
  fullName: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface Job {
  id: string;
  jobNumber: string;
  customerId: string;
}

interface PurchaseItem {
  id?: string;
  inventoryId?: string | null;
  productName: string;
  quantity: number;
  purchasePrice: number;
}

interface Purchase {
  id: string;
  supplier: string;
  supplierId: string | null;
  supplierName: string | null;
  orderNumber: string | null;
  orderDate: string;
  expectedDeliveryDate: string | null;
  actualDeliveryDate: string | null;
  deliveryStatus: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  customerId: string | null;
  customerName: string | null;
  jobId: string | null;
  jobNumber: string | null;
  items?: PurchaseItem[];
}

const STATUSES = ['Planned', 'Ordered', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Returned', 'Cancelled'];

const STATUS_COLORS: Record<string, string> = {
  'Planned': 'bg-slate-100 text-slate-700',
  'Ordered': 'bg-blue-100 text-blue-700',
  'Processing': 'bg-indigo-100 text-indigo-700',
  'Shipped': 'bg-purple-100 text-purple-700',
  'Out for Delivery': 'bg-amber-100 text-amber-700',
  'Delivered': 'bg-emerald-100 text-emerald-700',
  'Returned': 'bg-rose-100 text-rose-700',
  'Cancelled': 'bg-red-100 text-red-700',
};

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
};

const today = () => new Date().toISOString().slice(0, 10);

export default function Purchases() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Purchase | null>(null);
  const [showDelete, setShowDelete] = useState(false);

  const [form, setForm] = useState({
    supplier: '',
    supplierId: '',
    orderNumber: '',
    orderDate: today(),
    expectedDeliveryDate: '',
    deliveryStatus: 'Planned',
    trackingNumber: '',
    trackingUrl: '',
    customerId: '',
    jobId: '',
  });

  const [formItems, setFormItems] = useState<PurchaseItem[]>([{ productName: '', quantity: 1, purchasePrice: 0 }]);

  // Inline "add supplier" state
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [addingSupplier, setAddingSupplier] = useState(false);

  useEffect(() => {
    fetchPurchases();
    fetch('/api/customers').then(r => r.json()).then(setCustomers).catch(() => {});
    fetch('/api/suppliers').then(r => r.json()).then(setSuppliers).catch(() => {});
    fetch('/api/jobs').then(r => r.json()).then(setJobs).catch(() => {});
  }, []);

  const refreshSuppliers = () => {
    fetch('/api/suppliers').then(r => r.json()).then(setSuppliers).catch(() => {});
  };

  const addSupplierInline = async () => {
    if (!newSupplierName.trim()) return;
    setAddingSupplier(true);
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSupplierName.trim() }),
      });
      if (!res.ok) throw new Error('Failed to create supplier');
      const data = await res.json();
      refreshSuppliers();
      setForm(prev => ({ ...prev, supplierId: data.id, supplier: '' }));
      setNewSupplierName('');
      setShowAddSupplier(false);
    } catch (err) {
      console.error(err);
      alert('Failed to create supplier.');
    } finally {
      setAddingSupplier(false);
    }
  };

  const setField = (field: keyof typeof form, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const fetchPurchases = () => {
    setLoading(true);
    fetch('/api/purchases')
      .then(res => res.json())
      .then(data => { setPurchases(data); setLoading(false); })
      .catch(err => { console.error('Failed to fetch purchases', err); setLoading(false); });
  };

  const openNew = () => {
    setForm({ supplier: '', supplierId: '', orderNumber: '', orderDate: today(), expectedDeliveryDate: '', deliveryStatus: 'Planned', trackingNumber: '', trackingUrl: '', customerId: '', jobId: '' });
    setShowAddSupplier(false);
    setNewSupplierName('');
    setFormItems([{ productName: '', quantity: 1, purchasePrice: 0 }]);
    setShowModal(true);
  };

  const openDetail = async (p: Purchase) => {
    try {
      const res = await fetch(`/api/purchases/${p.id}`);
      const data = await res.json();
      setSelected(data);
    } catch (err) {
      console.error(err);
      alert('Failed to load purchase details.');
    }
  };

  const customerJobs = jobs.filter(j => !form.customerId || j.customerId === form.customerId);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.supplier.trim() && !form.supplierId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          supplierId: form.supplierId || null,
          customerId: form.customerId || null,
          jobId: form.jobId || null,
          items: formItems.filter(i => i.productName.trim()).map(i => ({
            inventoryId: i.inventoryId || null,
            productName: i.productName,
            quantity: i.quantity,
            purchasePrice: i.purchasePrice,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create purchase');
      }
      setShowModal(false);
      fetchPurchases();
    } catch (err: any) {
      alert(err.message || 'Failed to create purchase.');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (p: Purchase, status: string) => {
    const body: any = { deliveryStatus: status };
    if (status === 'Delivered') {
      body.actualDeliveryDate = p.actualDeliveryDate || today();
    }
    try {
      const res = await fetch(`/api/purchases/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update');
      }
      fetchPurchases();
      setSelected(null);
    } catch (err: any) {
      alert(err.message || 'Failed to update status.');
    }
  };

  const updateETA = async (p: Purchase, eta: string) => {
    try {
      await fetch(`/api/purchases/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedDeliveryDate: eta || null }),
      });
      fetchPurchases();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    try {
      await fetch(`/api/purchases/${selected.id}`, { method: 'DELETE' });
      setSelected(null);
      setShowDelete(false);
      fetchPurchases();
    } catch (err) {
      console.error(err);
      alert('Failed to delete purchase.');
    }
  };

  const filtered = purchases.filter(p =>
    (p.supplierName || p.supplier).toLowerCase().includes(search.toLowerCase()) ||
    (p.orderNumber && p.orderNumber.toLowerCase().includes(search.toLowerCase())) ||
    (p.customerName && p.customerName.toLowerCase().includes(search.toLowerCase())) ||
    (p.jobNumber && p.jobNumber.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-6 h-full flex flex-col relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Purchases & ETA Tracking</h1>
          <p className="text-sm text-slate-500 mt-1">Track supplier orders, delivery ETAs, and part arrivals per job.</p>
        </div>
        <button onClick={openNew} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-semibold flex items-center gap-2 text-xs transition-colors">
          <Plus size={16} />
          New Purchase
        </button>
      </div>

      <div className="flex flex-col gap-6 overflow-hidden flex-1 min-h-0">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-0">
          <div className="p-4 border-b border-slate-100">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input
                type="text"
                placeholder="Search supplier, order #, customer, job..."
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
                  <th className="px-6 py-3">Supplier / Order</th>
                  <th className="px-6 py-3">Customer / Job</th>
                  <th className="px-6 py-3">Order Date</th>
                  <th className="px-6 py-3">ETA</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Tracking</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">Loading purchases...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Truck size={32} className="text-slate-300" />
                        <p>No purchases found.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => openDetail(p)}>
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900">{p.supplierName || p.supplier}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{p.orderNumber || 'No order #'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-slate-800">{p.customerName || '—'}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{p.jobNumber || ''}</p>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{fmtDate(p.orderDate)}</td>
                      <td className="px-6 py-4">
                        <span className={p.expectedDeliveryDate ? 'font-semibold text-slate-800' : 'text-slate-400'}>{fmtDate(p.expectedDeliveryDate)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`font-bold text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLORS[p.deliveryStatus] || 'bg-slate-100 text-slate-700'}`}>{p.deliveryStatus}</span>
                      </td>
                      <td className="px-6 py-4">
                        {p.trackingNumber ? (
                          p.trackingUrl ? (
                            <a href={p.trackingUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-indigo-600 hover:underline text-xs" onClick={(e) => e.stopPropagation()}>
                              {p.trackingNumber} <ExternalLink size={12} />
                            </a>
                          ) : <span className="text-xs text-slate-600">{p.trackingNumber}</span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg flex flex-col max-h-full">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <h2 className="font-bold text-slate-800 text-sm">New Purchase</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-sm font-bold">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 flex flex-col flex-1 overflow-y-auto gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Supplier *</label>
                <div className="flex gap-2">
                  <select
                    value={form.supplierId}
                    onChange={(e) => { setField('supplierId', e.target.value); setField('supplier', ''); }}
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  >
                    <option value="">-- Select supplier --</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => { setShowAddSupplier(true); setNewSupplierName(''); }}
                    className="px-3 py-2 rounded border border-indigo-200 text-indigo-600 hover:bg-indigo-50 text-xs font-semibold whitespace-nowrap"
                    title="Add a new supplier"
                  >
                    + New
                  </button>
                </div>
                {showAddSupplier ? (
                  <div className="flex gap-2 mt-2">
                    <input
                      autoFocus
                      value={newSupplierName}
                      onChange={(e) => setNewSupplierName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSupplierInline(); } }}
                      className="flex-1 px-3 py-2 bg-slate-50 border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                      placeholder="Supplier name"
                    />
                    <button
                      type="button"
                      onClick={addSupplierInline}
                      disabled={addingSupplier || !newSupplierName.trim()}
                      className="px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold"
                    >
                      {addingSupplier ? 'Adding...' : 'Add'}
                    </button>
                    <button type="button" onClick={() => setShowAddSupplier(false)} className="px-2 py-2 text-slate-400 hover:text-slate-600 text-xs font-bold">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      value={form.supplier}
                      onChange={(e) => { setField('supplier', e.target.value); setField('supplierId', ''); }}
                      className="w-full px-3 py-2 mt-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                      placeholder="Or type supplier name (legacy)"
                    />
                    {!form.supplierId && !form.supplier && (
                      <p className="text-[10px] text-amber-600 font-semibold">Select a supplier or type a name.</p>
                    )}
                  </>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Order Number</label>
                  <input
                    value={form.orderNumber}
                    onChange={(e) => setField('orderNumber', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Order Date</label>
                  <input
                    type="date"
                    value={form.orderDate}
                    onChange={(e) => setField('orderDate', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Expected Delivery (ETA)</label>
                  <input
                    type="date"
                    value={form.expectedDeliveryDate}
                    onChange={(e) => setField('expectedDeliveryDate', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</label>
                  <select
                    value={form.deliveryStatus}
                    onChange={(e) => setField('deliveryStatus', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Customer (optional)</label>
                <select
                  value={form.customerId}
                  onChange={(e) => { setField('customerId', e.target.value); setField('jobId', ''); }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                >
                  <option value="">No customer (stock order)</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Repair Job (optional)</label>
                <select
                  value={form.jobId}
                  onChange={(e) => setField('jobId', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm disabled:opacity-50"
                >
                  <option value="">No job linked</option>
                  {customerJobs.map(j => <option key={j.id} value={j.id}>{j.jobNumber}</option>)}
                </select>
                {form.customerId && customerJobs.length === 0 && (
                  <p className="text-[10px] text-amber-600 font-semibold">This customer has no jobs yet.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tracking Number</label>
                  <input
                    value={form.trackingNumber}
                    onChange={(e) => setField('trackingNumber', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tracking URL</label>
                  <input
                    value={form.trackingUrl}
                    onChange={(e) => setField('trackingUrl', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Items</label>
                {formItems.map((it, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      value={it.productName}
                      onChange={(e) => setFormItems(prev => prev.map((x, i) => i === idx ? { ...x, productName: e.target.value } : x))}
                      placeholder="Product name"
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    />
                    <input
                      type="number"
                      min={1}
                      value={it.quantity}
                      onChange={(e) => setFormItems(prev => prev.map((x, i) => i === idx ? { ...x, quantity: parseInt(e.target.value, 10) || 1 } : x))}
                      className="w-16 px-2 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                      title="Qty"
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={it.purchasePrice}
                      onChange={(e) => setFormItems(prev => prev.map((x, i) => i === idx ? { ...x, purchasePrice: parseFloat(e.target.value) || 0 } : x))}
                      className="w-24 px-2 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                      placeholder="Price"
                    />
                    <button type="button" onClick={() => setFormItems(prev => prev.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-red-500 px-1">
                      <X size={16} />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setFormItems(prev => [...prev, { productName: '', quantity: 1, purchasePrice: 0 }])} className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                  <PackagePlus size={14} /> Add item
                </button>
              </div>

              <button type="submit" disabled={saving} className="mt-2 w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2 rounded font-semibold text-sm transition-colors">
                {saving ? 'Saving...' : 'Create Purchase'}
              </button>
            </form>
          </div>
        </div>
      )}

      {selected && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg flex flex-col max-h-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <h2 className="font-bold text-slate-800 text-sm">{selected.supplierName || selected.supplier} — {selected.orderNumber || 'No order #'}</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowDelete(true)} className="text-slate-400 hover:text-red-500" title="Delete">
                  <Trash2 size={16} />
                </button>
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="p-4 flex flex-col gap-4 flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Customer</p>
                  <p className="font-semibold text-slate-800 mt-0.5">{selected.customerName || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Repair Job</p>
                  <p className="font-semibold text-slate-800 mt-0.5">{selected.jobNumber || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Order Date</p>
                  <p className="font-semibold text-slate-800 mt-0.5">{fmtDate(selected.orderDate)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Actual Delivery</p>
                  <p className="font-semibold text-slate-800 mt-0.5">{fmtDate(selected.actualDeliveryDate)}</p>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Delivery Status</label>
                <select
                  value={selected.deliveryStatus}
                  onChange={(e) => updateStatus(selected, e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                >
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Expected Delivery (ETA)</label>
                <input
                  type="date"
                  value={selected.expectedDeliveryDate ? selected.expectedDeliveryDate.slice(0, 10) : ''}
                  onChange={(e) => updateETA(selected, e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>

              {selected.trackingNumber && (
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span>Tracking: {selected.trackingNumber}</span>
                  {selected.trackingUrl && (
                    <a href={selected.trackingUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-indigo-600 hover:underline">
                      Track <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              )}

              {selected.items && selected.items.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Items</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        <th className="text-left pb-1">Product</th>
                        <th className="text-right pb-1">Qty</th>
                        <th className="text-right pb-1">Price</th>
                        <th className="text-right pb-1">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selected.items.map((it, i) => (
                        <tr key={i}>
                          <td className="py-2 font-semibold text-slate-800">{it.productName}</td>
                          <td className="py-2 text-right text-slate-600">{it.quantity}</td>
                          <td className="py-2 text-right text-slate-600">R{it.purchasePrice.toFixed(2)}</td>
                          <td className="py-2 text-right font-semibold text-slate-800">R{(it.quantity * it.purchasePrice).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showDelete && selected && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-sm p-4">
            <h2 className="font-bold text-slate-800 text-sm">Delete purchase?</h2>
            <p className="text-xs text-slate-500 mt-1">This will permanently remove the purchase and its items.</p>
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => setShowDelete(false)} className="px-3 py-1.5 rounded text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button onClick={handleDelete} className="px-3 py-1.5 rounded text-xs font-semibold bg-red-600 text-white hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
