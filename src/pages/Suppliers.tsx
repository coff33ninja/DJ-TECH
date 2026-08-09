import { useState, useEffect, FormEvent } from 'react';
import { Search, Plus, X, Pencil, Factory, Phone, Mail, Globe, MapPin, CreditCard, FileText } from 'lucide-react';

interface Supplier {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  productUrl: string | null;
  paymentTerms: string | null;
  vatNumber: string | null;
  notes: string | null;
  createdAt: string | number | Date | null;
  productCount: number;
  totalSpend: number;
}

const emptyForm = {
  name: '', contactPerson: '', phone: '', email: '', address: '', website: '', productUrl: '',
  paymentTerms: '', vatNumber: '', notes: '',
};

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const fetchSuppliers = () => {
    setLoading(true);
    fetch('/api/suppliers')
      .then(res => res.json())
      .then(data => {
        setSuppliers(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch suppliers', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/suppliers/${editing.id}` : '/api/suppliers', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (!res.ok) throw new Error('Save failed');
      setShowModal(false);
      setEditing(null);
      setForm(emptyForm);
      fetchSuppliers();
    } catch (err) {
      console.error('Failed to save supplier', err);
      alert('Failed to save supplier.');
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({
      name: s.name,
      contactPerson: s.contactPerson || '',
      phone: s.phone || '',
      email: s.email || '',
      address: s.address || '',
      website: s.website || '',
      productUrl: s.productUrl || '',
      paymentTerms: s.paymentTerms || '',
      vatNumber: s.vatNumber || '',
      notes: s.notes || '',
    });
    setShowModal(true);
  };

  const setField = (field: keyof typeof form, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.contactPerson && s.contactPerson.toLowerCase().includes(search.toLowerCase())) ||
    (s.email && s.email.toLowerCase().includes(search.toLowerCase())) ||
    (s.phone && s.phone.includes(search))
  );

  return (
    <div className="p-6 h-full flex flex-col relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Suppliers</h1>
          <p className="text-sm text-slate-500 mt-1">Manage vendors, contact details, and product sources.</p>
        </div>
        <button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-semibold flex items-center gap-2 text-xs transition-colors">
          <Plus size={16} />
          New Supplier
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-0 flex-1">
        <div className="p-4 border-b border-slate-100 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Search suppliers..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <th className="px-6 py-3">Supplier</th>
                <th className="px-6 py-3">Contact</th>
                <th className="px-6 py-3">Products</th>
                <th className="px-6 py-3">Total Spend</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">Loading suppliers...</td>
                </tr>
              ) : filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Factory size={32} className="text-slate-300" />
                      <p>No suppliers found.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map(supplier => (
                  <tr key={supplier.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                          <Factory size={18} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{supplier.name}</p>
                          {supplier.contactPerson && (
                            <p className="text-xs text-slate-500 mt-0.5">Contact: {supplier.contactPerson}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {supplier.phone && (
                          <p className="flex items-center gap-2 text-slate-600">
                            <Phone size={14} className="text-slate-400" /> {supplier.phone}
                          </p>
                        )}
                        {supplier.email && (
                          <p className="flex items-center gap-2 text-slate-600">
                            <Mail size={14} className="text-slate-400" /> {supplier.email}
                          </p>
                        )}
                        {!supplier.phone && !supplier.email && (
                          <span className="text-xs text-slate-400">No contact details</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                        {supplier.productCount} item{supplier.productCount === 1 ? '' : 's'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-semibold text-slate-700">R{supplier.totalSpend.toFixed(2)}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => openEdit(supplier)} className="text-indigo-600 hover:underline font-bold text-xs transition-colors flex items-center gap-1 ml-auto">
                        <Pencil size={14} /> Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New / Edit Supplier Modal */}
      {showModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg flex flex-col max-h-full">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <h2 className="font-bold text-slate-800 text-sm">{editing ? 'Edit Supplier' : 'New Supplier'}</h2>
              <button onClick={() => { setShowModal(false); setEditing(null); }} className="text-slate-400 hover:text-slate-600 text-sm font-bold">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 flex flex-col flex-1 overflow-y-auto gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Supplier Name *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  placeholder="Wootware"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Contact Person</label>
                  <input
                    value={form.contactPerson}
                    onChange={(e) => setField('contactPerson', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="Jane van der Merwe"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Phone</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setField('phone', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="+27 21 123 4567"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setField('email', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  placeholder="sales@wootware.co.za"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Address</label>
                <input
                  value={form.address}
                  onChange={(e) => setField('address', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  placeholder="123 Bree St, Cape Town"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Website</label>
                  <input
                    value={form.website}
                    onChange={(e) => setField('website', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="https://www.wootware.co.za"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Product / Catalogue URL</label>
                  <input
                    value={form.productUrl}
                    onChange={(e) => setField('productUrl', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="https://.../catalogue"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Payment Terms</label>
                  <input
                    value={form.paymentTerms}
                    onChange={(e) => setField('paymentTerms', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="Net 30, EFT, COD..."
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">VAT Number</label>
                  <input
                    value={form.vatNumber}
                    onChange={(e) => setField('vatNumber', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="4850123456"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setField('notes', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm min-h-[60px] resize-none"
                  placeholder="Delivery lead times, reliability notes..."
                />
              </div>
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
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
