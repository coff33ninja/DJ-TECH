import { useState, useEffect } from 'react';
import { History } from 'lucide-react';

const ACTION_LABELS: Record<string, string> = {
  'customer.created': 'Customer created',
  'job.created': 'Job created',
  'job.updated': 'Job edited',
  'quote.created': 'Quote created',
  'quote.approved': 'Quote approved',
  'quote.status_changed': 'Quote status changed',
  'quote.deleted': 'Quote deleted',
  'invoice.created': 'Invoice created',
  'invoice.deleted': 'Invoice deleted',
  'payment.recorded': 'Payment recorded',
  'purchase.created': 'Part purchased',
  'purchase.updated': 'Purchase updated',
  'purchase.deleted': 'Purchase deleted',
  'settings.updated': 'Settings changed',
};

const actionLabel = (a: string) => ACTION_LABELS[a] || a.replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const ENTITY_ICONS: Record<string, string> = {
  customer: '👤',
  job: '🔧',
  quote: '📄',
  invoice: '🧾',
  payment: '💳',
  purchase: '📦',
  settings: '⚙️',
};

export default function AuditLog() {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => {
    fetchAudit();
  }, [entityType, page]);

  const fetchAudit = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (entityType) params.set('entityType', entityType);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(page * PAGE_SIZE));
    fetch(`/api/audit?${params.toString()}`)
      .then(res => res.json())
      .then(d => { setRows(d.rows || []); setTotal(d.total || 0); setLoading(false); })
      .catch(err => { console.error('Failed to fetch audit log', err); setLoading(false); });
  };

  const fmtDate = (ts: any) => {
    if (!ts) return '—';
    const ms = typeof ts === 'number' && ts < 1e12 ? ts * 1000 : typeof ts === 'number' ? ts : Date.parse(ts);
    return new Date(ms).toLocaleString('en-ZA');
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 h-full flex flex-col overflow-y-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Audit Log</h1>
          <p className="text-sm text-slate-500 mt-1">Record of important actions across the system.</p>
        </div>
        <select value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(0); }}
          className="px-3 py-2 bg-white border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">All record types</option>
          <option value="customer">Customers</option>
          <option value="job">Jobs</option>
          <option value="quote">Quotes</option>
          <option value="invoice">Invoices</option>
          <option value="payment">Payments</option>
          <option value="purchase">Purchases</option>
          <option value="settings">Settings</option>
        </select>
      </div>

      {loading && !rows.length ? (
        <div className="p-8 text-center text-slate-500">Loading audit log...</div>
      ) : (
        <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          {rows.length === 0 ? (
            <p className="p-8 text-center text-slate-500">No audit entries yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left">
                <tr className="text-[10px] uppercase tracking-widest text-slate-400">
                  <th className="px-4 py-3 font-bold">Time</th>
                  <th className="px-4 py-3 font-bold">Action</th>
                  <th className="px-4 py-3 font-bold">Record</th>
                  <th className="px-4 py-3 font-bold">User</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(row => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">{fmtDate(row.timestamp)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 font-semibold text-slate-700">
                        <span>{ENTITY_ICONS[row.entityType] || '📋'}</span>
                        {actionLabel(row.action)}
                      </span>
                      <p className="text-xs text-slate-500 mt-0.5">{row.description}</p>
                    </td>
                    <td className="px-4 py-3 text-xs capitalize text-slate-500">{row.entityType || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{row.user || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-4 text-sm">
        <span className="text-xs text-slate-500">{total} entr{total === 1 ? 'y' : 'ies'}</span>
        <div className="flex items-center gap-2">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 rounded border border-slate-200 bg-white text-xs font-semibold disabled:opacity-40 hover:bg-slate-50">
            Previous
          </button>
          <span className="text-xs text-slate-500">Page {page + 1} of {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 rounded border border-slate-200 bg-white text-xs font-semibold disabled:opacity-40 hover:bg-slate-50">
            Next
          </button>
        </div>
      </div>

      <div className="mt-6 flex items-start gap-2 rounded-lg bg-indigo-50 p-3 text-xs text-indigo-700">
        <History size={14} className="mt-0.5 flex-shrink-0" />
        <p>Actions are recorded automatically: customer created, job created/edited, quotes approved, invoices created, payments recorded, parts purchased, and settings changes. Deleted records remain in the log for accountability.</p>
      </div>
    </div>
  );
}
