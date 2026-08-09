import { useState, useEffect, type FormEvent } from 'react';
import { Search, Plus, FileText, FileCheck, CheckCircle2, CreditCard, Clock, X, Trash2, Wallet, Send, Download, Phone, Mail, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

const VAT_RATE = 0.15;

interface Quote {
  id: string;
  quoteNumber: string;
  jobId: string | null;
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  createdAt: string;
  validUntil: string | null;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  jobId: string | null;
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  quoteId: string | null;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amountPaid: number;
  createdAt: string;
  dueDate: string | null;
}

interface LineItem {
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

interface Payment {
  id: string;
  amount: number;
  paymentMethod: string | null;
  reference: string | null;
  date: string;
  notes: string | null;
}

interface Customer {
  id: string;
  fullName: string;
}

interface Job {
  id: string;
  jobNumber: string;
}

type DocDetail =
  | { kind: 'quote'; doc: Quote; items: LineItem[] }
  | { kind: 'invoice'; doc: Invoice; items: LineItem[]; payments: Payment[] };

const emptyLine = (): LineItem => ({ name: '', description: '', quantity: 1, unitPrice: 0 });

function LineItemsEditor({ items, onChange }: { items: LineItem[]; onChange: (items: LineItem[]) => void }) {
  const update = (i: number, patch: Partial<LineItem>) => {
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 items-center">
          <input
            value={it.name}
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder="Item name *"
            className="col-span-4 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
          />
          <input
            value={it.description}
            onChange={(e) => update(i, { description: e.target.value })}
            placeholder="Description"
            className="col-span-4 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
          />
          <input
            type="number"
            min="1"
            value={it.quantity}
            onChange={(e) => update(i, { quantity: parseInt(e.target.value, 10) || 1 })}
            className="col-span-1 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs text-center"
            title="Quantity"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={it.unitPrice}
            onChange={(e) => update(i, { unitPrice: parseFloat(e.target.value) || 0 })}
            className="col-span-2 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
            title="Unit price"
            placeholder="R 0.00"
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            className="col-span-1 flex justify-center text-slate-400 hover:text-red-500 transition-colors"
            title="Remove line"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, emptyLine()])}
        className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
      >
        <Plus size={14} /> Add line item
      </button>
    </div>
  );
}

export default function QuotesInvoices() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'quotes' | 'invoices'>('invoices');
  const [loading, setLoading] = useState(true);

  const [quoteOpen, setQuoteOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [detail, setDetail] = useState<DocDetail | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState('');

  const [quoteForm, setQuoteForm] = useState({ customerId: '', jobId: '', validUntil: '', discount: '', items: [emptyLine()] });
  const [invoiceForm, setInvoiceForm] = useState({ customerId: '', jobId: '', quoteId: '', dueDate: '', discount: '', items: [emptyLine()] });
  const [payForm, setPayForm] = useState({ amount: '', method: 'EFT', reference: '', notes: '' });

  useEffect(() => {
    fetchData();
    fetch('/api/customers')
      .then(res => res.json())
      .then(data => setCustomers(data))
      .catch(err => console.error('Failed to fetch customers', err));
    fetch('/api/jobs')
      .then(res => res.json())
      .then(data => setJobs(data))
      .catch(err => console.error('Failed to fetch jobs', err));
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [qRes, iRes] = await Promise.all([fetch('/api/quotes'), fetch('/api/invoices')]);
      setQuotes(await qRes.json());
      setInvoices(await iRes.json());
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const computeTotals = (items: LineItem[], discount: string) => {
    const subtotal = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
    const discountValue = parseFloat(discount) || 0;
    const tax = subtotal * VAT_RATE;
    return { subtotal, tax, total: subtotal - discountValue + tax };
  };

  const submitQuote = async (e: FormEvent) => {
    e.preventDefault();
    if (!quoteForm.customerId) { alert('Select a customer.'); return; }
    setSaving(true);
    try {
      await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: quoteForm.customerId,
          jobId: quoteForm.jobId || null,
          validUntil: quoteForm.validUntil || null,
          discount: quoteForm.discount || 0,
          items: quoteForm.items.filter(it => it.name.trim()),
        }),
      });
      setQuoteOpen(false);
      setQuoteForm({ customerId: '', jobId: '', validUntil: '', discount: '', items: [emptyLine()] });
      fetchData();
    } catch (err) {
      alert('Failed to create quote.');
    } finally {
      setSaving(false);
    }
  };

  const loadQuoteItems = async (quoteId: string) => {
    if (!quoteId) return;
    try {
      const res = await fetch(`/api/quotes/${quoteId}`);
      const q = await res.json();
      setInvoiceForm(prev => ({
        ...prev,
        customerId: q.customerId,
        items: q.items?.length
          ? q.items.map((it: any) => ({ name: it.name, description: it.description || '', quantity: it.quantity, unitPrice: it.unitPrice }))
          : [emptyLine()],
      }));
    } catch (err) {
      console.error('Failed to load quote', err);
    }
  };

  const submitInvoice = async (e: FormEvent) => {
    e.preventDefault();
    if (!invoiceForm.customerId) { alert('Select a customer.'); return; }
    setSaving(true);
    try {
      await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: invoiceForm.customerId,
          jobId: invoiceForm.jobId || null,
          quoteId: invoiceForm.quoteId || null,
          dueDate: invoiceForm.dueDate || null,
          discount: invoiceForm.discount || 0,
          items: invoiceForm.items.filter(it => it.name.trim()),
        }),
      });
      setInvoiceOpen(false);
      setInvoiceForm({ customerId: '', jobId: '', quoteId: '', dueDate: '', discount: '', items: [emptyLine()] });
      fetchData();
    } catch (err) {
      alert('Failed to create invoice.');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (kind: 'quote' | 'invoice', id: string) => {
    try {
      const res = await fetch(`/api/${kind}s/${id}`);
      const data = await res.json();
      if (kind === 'quote') {
        setDetail({ kind, doc: data, items: data.items || [] });
      } else {
        setDetail({ kind, doc: data, items: data.items || [], payments: data.payments || [] });
      }
    } catch (err) {
      alert('Failed to load document.');
    }
  };

  const updateStatus = async (kind: 'quote' | 'invoice', id: string, status: string) => {
    setAction(`Marking ${status}...`);
    try {
      const res = await fetch(`/api/${kind}s/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed');
      const updated = await res.json();
      if (detail && detail.kind === kind && detail.doc.id === id) {
        setDetail({ ...detail, doc: { ...detail.doc, status: updated.status, amountPaid: updated.amountPaid ?? detail.doc.amountPaid } });
      }
      fetchData();
    } catch (err) {
      alert('Failed to update status.');
    } finally {
      setAction('');
    }
  };

  const convertQuote = async (id: string) => {
    if (!window.confirm('Convert this quote into an invoice?')) return;
    setAction('Converting...');
    try {
      const res = await fetch(`/api/quotes/${id}/convert`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      setDetail(null);
      setActiveTab('invoices');
      fetchData();
    } catch (err) {
      alert('Failed to convert quote.');
    } finally {
      setAction('');
    }
  };

  const sendDoc = async (kind: 'quote' | 'invoice', id: string) => {
    if (!window.confirm(`Send this ${kind} (with job photos) to the customer via WhatsApp and/or email?`)) return;
    setAction('Sending...');
    try {
      const res = await fetch(`/api/${kind}s/${id}/send`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      const result = await res.json();
      const parts = [];
      if (result.whatsapp) parts.push('WhatsApp');
      if (result.email) parts.push('email');
      alert(parts.length ? `Sent via ${parts.join(' + ')}.` : 'No contact details on file — nothing was sent.');
      if (detail && detail.kind === kind && detail.doc.id === id) {
        setDetail({ ...detail, doc: { ...detail.doc, status: 'Sent' } });
      }
      fetchData();
    } catch (err) {
      alert(`Failed to send ${kind}.`);
    } finally {
      setAction('');
    }
  };

  const downloadPdf = (kind: 'quote' | 'invoice', id: string) => {
    window.open(`/api/${kind}s/${id}/pdf`, '_blank');
  };

  const deleteDoc = async (kind: 'quote' | 'invoice', id: string) => {
    if (!window.confirm(`Delete this ${kind} permanently?`)) return;
    try {
      const res = await fetch(`/api/${kind}s/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      setDetail(null);
      fetchData();
    } catch (err) {
      alert(`Failed to delete ${kind}.`);
    }
  };

  const openPayment = () => {
    if (detail?.kind !== 'invoice') return;
    const balance = detail.doc.total - detail.doc.amountPaid;
    setPayForm({ amount: balance.toFixed(2), method: 'EFT', reference: '', notes: '' });
    setPayOpen(true);
  };

  const submitPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (detail?.kind !== 'invoice') return;
    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0) { alert('Enter a valid amount.'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${detail.doc.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payForm),
      });
      if (!res.ok) throw new Error('Failed');
      const updated = await res.json();
      setDetail({ ...detail, doc: { ...detail.doc, status: updated.status, amountPaid: updated.amountPaid } });
      setPayOpen(false);
      fetchData();
      const fresh = await fetch(`/api/invoices/${detail.doc.id}`).then(r => r.json());
      if (detail.kind === 'invoice') setDetail({ kind: 'invoice', doc: fresh, items: fresh.items, payments: fresh.payments });
    } catch (err) {
      alert('Failed to record payment.');
    } finally {
      setSaving(false);
    }
  };

  const filteredQuotes = quotes.filter(q =>
    q.quoteNumber.toLowerCase().includes(search.toLowerCase()) ||
    (q.customerName && q.customerName.toLowerCase().includes(search.toLowerCase())) ||
    q.status.toLowerCase().includes(search.toLowerCase())
  );
  const filteredInvoices = invoices.filter(inv =>
    inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
    (inv.customerName && inv.customerName.toLowerCase().includes(search.toLowerCase())) ||
    inv.status.toLowerCase().includes(search.toLowerCase())
  );

  const customerJobs = jobs.filter(j => j.customerId === (quoteForm.customerId || invoiceForm.customerId));

  return (
    <div className="p-6 h-full flex flex-col relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Quotes & Invoices</h1>
          <p className="text-sm text-slate-500 mt-1">Manage billing, estimates, and customer payments.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded font-semibold flex items-center gap-2 transition-colors shadow-sm hidden md:flex text-xs">
            Print List
          </button>
          <button onClick={() => setQuoteOpen(true)} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded font-semibold flex items-center gap-2 transition-colors shadow-sm text-xs">
            <Plus size={16} />
            New Quote
          </button>
          <button onClick={() => setInvoiceOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-semibold flex items-center gap-2 text-xs transition-colors">
            <Plus size={16} />
            New Invoice
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-0 flex-1">
        <div className="border-b border-slate-100 flex overflow-x-auto">
          <button
            onClick={() => setActiveTab('invoices')}
            className={`px-6 py-4 text-xs font-bold uppercase tracking-wider border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${activeTab === 'invoices' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <FileCheck size={16} />
            Invoices
          </button>
          <button
            onClick={() => setActiveTab('quotes')}
            className={`px-6 py-4 text-xs font-bold uppercase tracking-wider border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${activeTab === 'quotes' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <FileText size={16} />
            Quotes
          </button>
        </div>

        <div className="p-4 border-b border-slate-100 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder={`Search ${activeTab} by number, customer or status...`}
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
                <th className="px-6 py-3">Document ID</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Amount</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">Loading data...</td>
                </tr>
              ) : activeTab === 'invoices' && filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <FileCheck size={40} className="text-slate-300" />
                      <p>{search ? 'No invoices match your search.' : 'No invoices created yet.'}</p>
                    </div>
                  </td>
                </tr>
              ) : activeTab === 'quotes' && filteredQuotes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <FileText size={40} className="text-slate-300" />
                      <p>{search ? 'No quotes match your search.' : 'No quotes created yet.'}</p>
                    </div>
                  </td>
                </tr>
              ) : activeTab === 'invoices' ? (
                filteredInvoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => openDetail('invoice', inv.id)}>
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-900">{inv.invoiceNumber}</p>
                      {inv.customerName && <p className="text-xs text-slate-500 mt-0.5">{inv.customerName}</p>}
                    </td>
                    <td className="px-6 py-4 text-slate-600 text-xs">
                      {format(new Date(inv.createdAt), 'dd MMM yyyy')}
                      {inv.dueDate && <p className="mt-0.5 flex items-center gap-1"><Clock size={11} /> Due {format(new Date(inv.dueDate), 'dd MMM')}</p>}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase
                        ${inv.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                          inv.status === 'Partially Paid' ? 'bg-indigo-100 text-indigo-700' :
                          inv.status === 'Overdue' ? 'bg-red-100 text-red-700' :
                          'bg-slate-100 text-slate-700'}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="font-bold text-slate-900">R{inv.total.toFixed(2)}</p>
                      {inv.amountPaid > 0 && <p className="text-[10px] text-slate-500 font-medium">Paid: R{inv.amountPaid.toFixed(2)}</p>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-indigo-600 hover:underline font-bold text-xs transition-colors">
                        View
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                filteredQuotes.map(quo => (
                  <tr key={quo.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => openDetail('quote', quo.id)}>
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-900">{quo.quoteNumber}</p>
                      {quo.customerName && <p className="text-xs text-slate-500 mt-0.5">{quo.customerName}</p>}
                    </td>
                    <td className="px-6 py-4 text-slate-600 text-xs">
                      {format(new Date(quo.createdAt), 'dd MMM yyyy')}
                      {quo.validUntil && <p className="mt-0.5 flex items-center gap-1"><Clock size={11} /> Valid until {format(new Date(quo.validUntil), 'dd MMM')}</p>}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase
                        ${quo.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                          quo.status === 'Awaiting Approval' ? 'bg-amber-100 text-amber-700' :
                          quo.status === 'Declined' ? 'bg-red-100 text-red-700' :
                          'bg-slate-100 text-slate-700'}`}>
                        {quo.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="font-bold text-slate-900">R{quo.total.toFixed(2)}</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-indigo-600 hover:underline font-bold text-xs transition-colors">
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Quote Modal */}
      {quoteOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl flex flex-col max-h-full">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <h2 className="font-bold text-slate-800 text-sm">New Quote</h2>
              <button onClick={() => setQuoteOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm font-bold"><X size={16} /></button>
            </div>
            <form onSubmit={submitQuote} className="p-4 flex flex-col flex-1 overflow-y-auto gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Customer *</label>
                  <select required value={quoteForm.customerId} onChange={(e) => setQuoteForm(p => ({ ...p, customerId: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm">
                    <option value="" disabled>Select customer...</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Related Job</label>
                  <select value={quoteForm.jobId} onChange={(e) => setQuoteForm(p => ({ ...p, jobId: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm">
                    <option value="">None</option>
                    {jobs.filter(j => j.customerId === quoteForm.customerId).map(j => <option key={j.id} value={j.id}>{j.jobNumber}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Valid Until</label>
                  <input type="date" value={quoteForm.validUntil} onChange={(e) => setQuoteForm(p => ({ ...p, validUntil: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Line Items *</label>
                <LineItemsEditor items={quoteForm.items} onChange={(items) => setQuoteForm(p => ({ ...p, items }))} />
              </div>
              <div className="flex flex-col gap-1 sm:max-w-[180px]">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Discount (R)</label>
                <input type="number" min="0" step="0.01" value={quoteForm.discount} onChange={(e) => setQuoteForm(p => ({ ...p, discount: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" placeholder="0.00" />
              </div>
              {(() => { const t = computeTotals(quoteForm.items, quoteForm.discount); return (
                <div className="ml-auto text-right text-xs space-y-1">
                  <p className="text-slate-500">Subtotal: <span className="font-semibold text-slate-700">R{t.subtotal.toFixed(2)}</span></p>
                  <p className="text-slate-500">VAT ({(VAT_RATE * 100).toFixed(0)}%): <span className="font-semibold text-slate-700">R{t.tax.toFixed(2)}</span></p>
                  <p className="text-slate-900 font-bold">Total: R{t.total.toFixed(2)}</p>
                </div>
              ); })()}
              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button type="button" onClick={() => setQuoteOpen(false)} className="px-4 py-2 rounded text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-semibold text-xs transition-colors disabled:opacity-50">{saving ? 'Saving...' : 'Create Quote'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Invoice Modal */}
      {invoiceOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl flex flex-col max-h-full">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <h2 className="font-bold text-slate-800 text-sm">New Invoice</h2>
              <button onClick={() => setInvoiceOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm font-bold"><X size={16} /></button>
            </div>
            <form onSubmit={submitInvoice} className="p-4 flex flex-col flex-1 overflow-y-auto gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Customer *</label>
                  <select required value={invoiceForm.customerId} onChange={(e) => setInvoiceForm(p => ({ ...p, customerId: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm">
                    <option value="" disabled>Select customer...</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">From Approved Quote</label>
                  <select value={invoiceForm.quoteId} onChange={(e) => { setInvoiceForm(p => ({ ...p, quoteId: e.target.value })); loadQuoteItems(e.target.value); }} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm">
                    <option value="">None</option>
                    {quotes.filter(q => q.status === 'Approved' && (!invoiceForm.customerId || q.customerId === invoiceForm.customerId)).map(q => <option key={q.id} value={q.id}>{q.quoteNumber} — R{q.total.toFixed(2)}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Related Job</label>
                  <select value={invoiceForm.jobId} onChange={(e) => setInvoiceForm(p => ({ ...p, jobId: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm">
                    <option value="">None</option>
                    {jobs.filter(j => j.customerId === invoiceForm.customerId).map(j => <option key={j.id} value={j.id}>{j.jobNumber}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Due Date</label>
                  <input type="date" value={invoiceForm.dueDate} onChange={(e) => setInvoiceForm(p => ({ ...p, dueDate: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Discount (R)</label>
                  <input type="number" min="0" step="0.01" value={invoiceForm.discount} onChange={(e) => setInvoiceForm(p => ({ ...p, discount: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" placeholder="0.00" />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Line Items *</label>
                <LineItemsEditor items={invoiceForm.items} onChange={(items) => setInvoiceForm(p => ({ ...p, items }))} />
              </div>
              {(() => { const t = computeTotals(invoiceForm.items, invoiceForm.discount); return (
                <div className="ml-auto text-right text-xs space-y-1">
                  <p className="text-slate-500">Subtotal: <span className="font-semibold text-slate-700">R{t.subtotal.toFixed(2)}</span></p>
                  <p className="text-slate-500">VAT ({(VAT_RATE * 100).toFixed(0)}%): <span className="font-semibold text-slate-700">R{t.tax.toFixed(2)}</span></p>
                  <p className="text-slate-900 font-bold">Total: R{t.total.toFixed(2)}</p>
                </div>
              ); })()}
              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button type="button" onClick={() => setInvoiceOpen(false)} className="px-4 py-2 rounded text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-semibold text-xs transition-colors disabled:opacity-50">{saving ? 'Saving...' : 'Create Invoice'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detail && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl flex flex-col max-h-full">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                {detail.kind === 'quote' ? <FileText size={16} className="text-indigo-600" /> : <FileCheck size={16} className="text-indigo-600" />}
                {detail.kind === 'quote' ? detail.doc.quoteNumber : detail.doc.invoiceNumber}
              </h2>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600 text-sm font-bold"><X size={16} /></button>
            </div>
            <div className="p-4 flex flex-col flex-1 overflow-y-auto gap-4">
              <div className="flex flex-wrap gap-4 text-xs">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Customer</p>
                  <p className="font-semibold text-slate-800">{detail.doc.customerName || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Contact</p>
                  <div className="space-y-0.5 font-semibold text-slate-800">
                    {detail.doc.customerPhone && <span className="flex items-center gap-1 text-emerald-700"><Phone size={11} /> {detail.doc.customerPhone}</span>}
                    {detail.doc.customerEmail && <span className="flex items-center gap-1 text-emerald-700"><Mail size={11} /> {detail.doc.customerEmail}</span>}
                    {!detail.doc.customerPhone && !detail.doc.customerEmail && (
                      <span className="flex items-center gap-1 text-amber-600"><AlertTriangle size={11} /> No contact details — send will not reach the customer</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</p>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase
                    ${detail.doc.status === 'Paid' || detail.doc.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                      detail.doc.status === 'Partially Paid' ? 'bg-indigo-100 text-indigo-700' :
                      detail.doc.status === 'Declined' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
                    {(detail.doc.status === 'Paid' || detail.doc.status === 'Approved') && <CheckCircle2 size={12} />}
                    {detail.doc.status}
                  </span>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Date</p>
                  <p className="font-semibold text-slate-800">{format(new Date(detail.doc.createdAt), 'dd MMM yyyy')}</p>
                </div>
                {detail.doc.validUntil && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Valid Until</p>
                    <p className="font-semibold text-slate-800">{format(new Date(detail.doc.validUntil), 'dd MMM yyyy')}</p>
                  </div>
                )}
                {detail.doc.dueDate && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Due Date</p>
                    <p className="font-semibold text-slate-800 flex items-center gap-1"><Clock size={12} /> {format(new Date(detail.doc.dueDate), 'dd MMM yyyy')}</p>
                  </div>
                )}
              </div>

              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                    <th className="py-2">Item</th>
                    <th className="py-2 text-center">Qty</th>
                    <th className="py-2 text-right">Unit Price</th>
                    <th className="py-2 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {detail.items.length === 0 ? (
                    <tr><td colSpan={4} className="py-4 text-center text-slate-400 italic">No line items recorded.</td></tr>
                  ) : detail.items.map((it, i) => (
                    <tr key={i}>
                      <td className="py-2">
                        <p className="font-semibold text-slate-800">{it.name}</p>
                        {it.description && <p className="text-[10px] text-slate-500">{it.description}</p>}
                      </td>
                      <td className="py-2 text-center text-slate-600">{it.quantity}</td>
                      <td className="py-2 text-right text-slate-600">R{it.unitPrice.toFixed(2)}</td>
                      <td className="py-2 text-right font-semibold text-slate-800">R{(it.quantity * it.unitPrice).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="ml-auto text-right text-xs space-y-1">
                <p className="text-slate-500">Subtotal: <span className="font-semibold text-slate-700">R{detail.doc.subtotal.toFixed(2)}</span></p>
                {detail.doc.discount > 0 && <p className="text-slate-500">Discount: <span className="font-semibold text-red-500">-R{detail.doc.discount.toFixed(2)}</span></p>}
                <p className="text-slate-500">VAT: <span className="font-semibold text-slate-700">R{detail.doc.tax.toFixed(2)}</span></p>
                <p className="text-slate-900 font-bold text-sm">Total: R{detail.doc.total.toFixed(2)}</p>
              </div>

              {detail.kind === 'invoice' && (
                <div className="border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5"><Wallet size={14} className="text-indigo-600" /> Payments</h3>
                    <span className="text-xs text-slate-600 font-semibold">Balance: <span className={detail.doc.total - detail.doc.amountPaid > 0 ? 'text-red-500' : 'text-emerald-600'}>R{(detail.doc.total - detail.doc.amountPaid).toFixed(2)}</span></span>
                  </div>
                  {detail.payments.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No payments recorded.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {detail.payments.map(p => (
                        <div key={p.id} className="flex justify-between items-center text-xs bg-slate-50 rounded px-3 py-2">
                          <span className="text-slate-600">{format(new Date(p.date), 'dd MMM yyyy')} · {p.paymentMethod || 'N/A'}{p.reference ? ` · ${p.reference}` : ''}</span>
                          <span className="font-bold text-emerald-600">+R{p.amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 flex flex-wrap justify-end gap-2 bg-slate-50 rounded-b-xl">
              {detail.kind === 'quote' ? (
                <>
                  {detail.doc.status === 'Draft' && <button onClick={() => sendDoc('quote', detail.doc.id)} disabled={!!action} className="px-3 py-2 rounded text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"><Send size={12} /> Send to Customer</button>}
                  <button onClick={() => downloadPdf('quote', detail.doc.id)} className="px-3 py-2 rounded text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 flex items-center gap-1.5"><Download size={12} /> Download PDF</button>
                  {detail.doc.status !== 'Approved' && detail.doc.status !== 'Declined' && <button onClick={() => updateStatus('quote', detail.doc.id, 'Approved')} disabled={!!action} className="px-3 py-2 rounded text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5"><CheckCircle2 size={12} /> Approve</button>}
                  <button onClick={() => convertQuote(detail.doc.id)} disabled={!!action} className="px-3 py-2 rounded text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"><FileCheck size={12} /> Convert to Invoice</button>
                  <button onClick={() => deleteDoc('quote', detail.doc.id)} className="px-3 py-2 rounded text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">Delete</button>
                </>
              ) : (
                <>
                  {detail.doc.status === 'Draft' && <button onClick={() => sendDoc('invoice', detail.doc.id)} disabled={!!action} className="px-3 py-2 rounded text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"><Send size={12} /> Send to Customer</button>}
                  <button onClick={() => downloadPdf('invoice', detail.doc.id)} className="px-3 py-2 rounded text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 flex items-center gap-1.5"><Download size={12} /> Download PDF</button>
                  {detail.doc.total - detail.doc.amountPaid > 0 && <button onClick={openPayment} className="px-3 py-2 rounded text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1.5"><CreditCard size={12} /> Record Payment</button>}
                  <button onClick={() => deleteDoc('invoice', detail.doc.id)} className="px-3 py-2 rounded text-xs font-semibold text-red-600 hover:bg-red-50">Delete</button>
                </>
              )}
              {action && <span className="text-xs text-slate-500 self-center">{action}</span>}
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {payOpen && detail?.kind === 'invoice' && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md flex flex-col max-h-full">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2"><Wallet size={16} className="text-indigo-600" /> Record Payment</h2>
              <button onClick={() => setPayOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm font-bold"><X size={16} /></button>
            </div>
            <form onSubmit={submitPayment} className="p-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Amount (R) *</label>
                <input type="number" min="0.01" step="0.01" required value={payForm.amount} onChange={(e) => setPayForm(p => ({ ...p, amount: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                <p className="text-[10px] text-slate-500">Balance: R{(detail.doc.total - detail.doc.amountPaid).toFixed(2)}</p>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Method</label>
                <select value={payForm.method} onChange={(e) => setPayForm(p => ({ ...p, method: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm">
                  <option value="EFT">EFT</option>
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Reference</label>
                <input value={payForm.reference} onChange={(e) => setPayForm(p => ({ ...p, reference: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" placeholder="EFT reference" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Notes</label>
                <input value={payForm.notes} onChange={(e) => setPayForm(p => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
              </div>
              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button type="button" onClick={() => setPayOpen(false)} className="px-4 py-2 rounded text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-semibold text-xs transition-colors disabled:opacity-50">{saving ? 'Saving...' : 'Record Payment'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
