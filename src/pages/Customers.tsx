import { useState, useEffect, FormEvent } from 'react';
import { Search, Plus, User, Building, Phone, Mail, X, Pencil, UserRound, MessageCircle } from 'lucide-react';

interface Customer {
  id: string;
  fullName: string;
  companyName: string | null;
  customerType: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: string;
}

const emptyForm = {
  fullName: '', companyName: '', customerType: 'individual', phone: '', email: '', address: '', notes: '',
};

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [sendingStatusId, setSendingStatusId] = useState<string | null>(null);

  const sendStatus = async (customer: Customer) => {
    setSendingStatusId(customer.id);
    try {
      const res = await fetch(`/api/customers/${customer.id}/send-status`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send status');
      alert(`Status sent to WhatsApp for ${data.jobs} open job(s).`);
    } catch (err: any) {
      alert(err.message || 'Failed to send status.');
    } finally {
      setSendingStatusId(null);
    }
  };

  const fetchCustomers = () => {
    setLoading(true);
    fetch('/api/customers')
      .then(res => res.json())
      .then(data => {
        setCustomers(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch customers', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim()) return;
    if (form.customerType === 'company' && !form.companyName.trim()) {
      alert('Please enter a company name for company customers.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/customers/${editing.id}` : '/api/customers', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (!res.ok) throw new Error('Save failed');
      setShowModal(false);
      setEditing(null);
      setForm(emptyForm);
      fetchCustomers();
    } catch (err) {
      console.error('Failed to save customer', err);
      alert('Failed to save customer.');
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({
      fullName: c.fullName,
      companyName: c.companyName || '',
      customerType: c.customerType === 'company' ? 'company' : 'individual',
      phone: c.phone || '',
      email: c.email || '',
      address: c.address || '',
      notes: c.notes || '',
    });
    setShowModal(true);
  };

  const setField = (field: keyof typeof form, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const filteredCustomers = customers.filter(c =>
    c.fullName.toLowerCase().includes(search.toLowerCase()) ||
    (c.companyName && c.companyName.toLowerCase().includes(search.toLowerCase())) ||
    (c.email && c.email.toLowerCase().includes(search.toLowerCase())) ||
    (c.phone && c.phone.includes(search))
  );

  return (
    <div className="p-6 h-full flex flex-col relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Customers</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your client database and their contact details.</p>
        </div>
        <button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-semibold flex items-center gap-2 text-xs transition-colors">
          <Plus size={16} />
          New Customer
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-0 flex-1">
        <div className="p-4 border-b border-slate-100 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Search customers..."
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
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Contact</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">Loading customers...</td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <User size={32} className="text-slate-300" />
                      <p>No customers found.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCustomers.map(customer => {
                  const isCompany = customer.customerType === 'company';
                  const displayName = isCompany ? (customer.companyName || customer.fullName) : customer.fullName;
                  return (
                    <tr key={customer.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                            {displayName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{displayName}</p>
                            {!isCompany && customer.companyName && (
                              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                <Building size={12} /> {customer.companyName}
                              </p>
                            )}
                            {isCompany && customer.fullName !== customer.companyName && (
                              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                <UserRound size={12} /> Contact: {customer.fullName}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${isCompany ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'}`}>
                          {isCompany ? <><Building size={11} /> Company</> : <><User size={11} /> Individual</>}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          {customer.phone && (
                            <p className="flex items-center gap-2 text-slate-600">
                              <Phone size={14} className="text-slate-400" /> {customer.phone}
                            </p>
                          )}
                          {customer.email && (
                            <p className="flex items-center gap-2 text-slate-600">
                              <Mail size={14} className="text-slate-400" /> {customer.email}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase
                          ${customer.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}
                        `}>
                          {customer.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => void sendStatus(customer)}
                            disabled={sendingStatusId === customer.id}
                            title="Send open job status to the customer's WhatsApp"
                            className="text-emerald-600 hover:text-emerald-700 font-bold text-xs transition-colors flex items-center gap-1 disabled:opacity-50"
                          >
                            <MessageCircle size={14} />
                            {sendingStatusId === customer.id ? 'Sending...' : 'Send Status'}
                          </button>
                          <button onClick={() => openEdit(customer)} className="text-indigo-600 hover:underline font-bold text-xs transition-colors flex items-center gap-1 ml-auto">
                            <Pencil size={14} /> Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New / Edit Customer Modal */}
      {showModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg flex flex-col max-h-full">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <h2 className="font-bold text-slate-800 text-sm">{editing ? 'Edit Customer' : 'New Customer'}</h2>
              <button onClick={() => { setShowModal(false); setEditing(null); }} className="text-slate-400 hover:text-slate-600 text-sm font-bold">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 flex flex-col flex-1 overflow-y-auto gap-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Customer Type *</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setField('customerType', 'individual')}
                    className={`flex items-center justify-center gap-2 rounded-lg border p-2 text-xs font-semibold transition-colors ${form.customerType === 'individual' ? 'border-violet-600 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                  >
                    <User size={15} /> Individual
                  </button>
                  <button
                    type="button"
                    onClick={() => setField('customerType', 'company')}
                    className={`flex items-center justify-center gap-2 rounded-lg border p-2 text-xs font-semibold transition-colors ${form.customerType === 'company' ? 'border-sky-600 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                  >
                    <Building size={15} /> Company
                  </button>
                </div>
              </div>

              {form.customerType === 'company' && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Company Name *</label>
                  <input
                    required
                    value={form.companyName}
                    onChange={(e) => setField('companyName', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="Acme Pty Ltd"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {form.customerType === 'company' ? 'Contact Person *' : 'Full Name *'}
                </label>
                <input
                  required
                  value={form.fullName}
                  onChange={(e) => setField('fullName', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  placeholder="Jane Doe"
                />
              </div>

              {form.customerType === 'individual' && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Company Name</label>
                  <input
                    value={form.companyName}
                    onChange={(e) => setField('companyName', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="Optional"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Phone</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setField('phone', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="+27 82 123 4567"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setField('email', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="jane@example.com"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Address</label>
                <input
                  value={form.address}
                  onChange={(e) => setField('address', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  placeholder="123 Main St, Cape Town"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setField('notes', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm min-h-[60px] resize-none"
                  placeholder="Preferences, reminders, etc."
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
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
