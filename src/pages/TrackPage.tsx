import { useState, useEffect, FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Headphones, Search, CheckCircle2, Clock, Wrench, Package, FileText, Loader2, PackageX, ChevronRight, AlertTriangle, Printer } from 'lucide-react';

const statusColors: Record<string, string> = {
  'Received': 'bg-slate-100 text-slate-700',
  'Diagnosing': 'bg-purple-100 text-purple-700',
  'Awaiting Approval': 'bg-amber-100 text-amber-700',
  'Awaiting Parts': 'bg-orange-100 text-orange-700',
  'Repairing': 'bg-indigo-100 text-indigo-700',
  'Testing': 'bg-cyan-100 text-cyan-700',
  'Ready for Collection': 'bg-emerald-100 text-emerald-700',
  'Collected': 'bg-emerald-100 text-emerald-700',
  'Completed': 'bg-emerald-100 text-emerald-700',
  'Cancelled': 'bg-rose-100 text-rose-700',
  'Unrepairable': 'bg-rose-100 text-rose-700',
  'Customer Declined Repair': 'bg-slate-100 text-slate-700',
  'Awaiting Customer': 'bg-amber-100 text-amber-700',
  'Warranty Return': 'bg-sky-100 text-sky-700',
};

function formatDate(v: any): string {
  if (!v) return '';
  const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateShort(v: any): string {
  if (!v) return '';
  const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`flex items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 font-bold text-white shadow-md ${small ? 'h-9 w-9' : 'h-12 w-12'}`}>
        <Headphones size={small ? 18 : 24} />
      </div>
      <div>
        <p className={`font-bold tracking-tight text-slate-900 ${small ? 'text-lg' : 'text-2xl'}`}>DJ TECH</p>
        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Fixing your problems, one service at a time.</p>
      </div>
    </div>
  );
}

export default function TrackPage() {
  const { code } = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const [lookup, setLookup] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!code) { setData(null); setNotFound(false); return; }
    setLoading(true);
    setNotFound(false);
    setData(null);
    fetch(`/api/track/${encodeURIComponent(code.trim())}`)
      .then((res) => {
        if (res.status === 404) { setNotFound(true); return null; }
        if (!res.ok) throw new Error('failed');
        return res.json();
      })
      .then((d) => setData(d))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [code]);

  const submitLookup = (e: FormEvent) => {
    e.preventDefault();
    const c = lookup.trim().toUpperCase();
    if (!c) return;
    navigate(`/track/${c}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-slate-50 to-purple-50">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-8">
        <header className="flex items-center justify-between">
          <Brand small />
          {code && (
            <Link to="/track" className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline">
              <Search size={13} /> Look up another job
            </Link>
          )}
        </header>

        <main className="mt-8 flex-1">
          {!code ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <h1 className="text-xl font-bold text-slate-900">Track your repair</h1>
              <p className="mt-1 text-sm text-slate-500">Enter the tracking code from your job card message to see the current progress of your repair.</p>
              <form onSubmit={submitLookup} className="mt-5 flex gap-2">
                <input
                  value={lookup}
                  onChange={(e) => setLookup(e.target.value.toUpperCase())}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. 9F3K2AQW"
                  autoFocus
                />
                <button type="submit" className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors">
                  <Search size={15} /> Track
                </button>
              </form>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-12 shadow-sm">
              <Loader2 className="animate-spin text-indigo-600" size={28} />
              <p className="mt-3 text-sm text-slate-500">Loading your repair...</p>
            </div>
          ) : notFound ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
              <PackageX className="mx-auto text-slate-300" size={40} />
              <h1 className="mt-3 text-lg font-bold text-slate-900">We couldn't find that job</h1>
              <p className="mt-1 text-sm text-slate-500">Double-check the code from your job card, or contact the workshop if it still doesn't work.</p>
              <Link to="/track" className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-indigo-600 hover:underline">
                <Search size={14} /> Back to lookup
              </Link>
            </div>
          ) : data ? (
            <div className="space-y-4">
              {/* Status card */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Job {data.job.jobNumber}</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">
                      {data.device ? [data.device.manufacturer, data.device.model].filter(Boolean).join(' ') : 'Your device'}
                    </p>
                    {data.device?.serialNumber && (
                      <p className="mt-0.5 text-xs text-slate-500">Serial: {data.device.serialNumber}</p>
                    )}
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase ${statusColors[data.job.status] || 'bg-slate-100 text-slate-700'}`}>
                    {data.job.status}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs">
                  <div>
                    <p className="text-slate-400">Received</p>
                    <p className="font-semibold text-slate-700">{formatDate(data.job.dateReceived) || '—'}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Expected completion</p>
                    <p className="font-semibold text-slate-700">{formatDate(data.job.expectedCompletionDate) || 'To be confirmed'}</p>
                  </div>
                  {data.job.technician && (
                    <div>
                      <p className="text-slate-400">Technician</p>
                      <p className="font-semibold text-slate-700">{data.job.technician}</p>
                    </div>
                  )}
                  {data.job.completionDate && (
                    <div>
                      <p className="text-slate-400">Completed</p>
                      <p className="font-semibold text-slate-700">{formatDate(data.job.completionDate)}</p>
                    </div>
                  )}
                </div>
                {data.job.reportedProblem && (
                  <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs">
                    <p className="font-bold text-slate-500">Problem reported</p>
                    <p className="mt-1 text-slate-700">{data.job.reportedProblem}</p>
                  </div>
                )}
                {data.job.workPerformed && (
                  <div className="mt-2 rounded-lg bg-emerald-50 p-3 text-xs">
                    <p className="font-bold text-emerald-600">Work performed</p>
                    <p className="mt-1 text-emerald-800">{data.job.workPerformed}</p>
                  </div>
                )}
                {data.job.customerVisibleNotes && (
                  <div className="mt-2 rounded-lg bg-indigo-50 p-3 text-xs">
                    <p className="font-bold text-indigo-600">Note from the workshop</p>
                    <p className="mt-1 text-indigo-800">{data.job.customerVisibleNotes}</p>
                  </div>
                )}
              </div>

              {/* Timeline */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Clock size={16} className="text-indigo-600" /> Progress
                </h2>
                {data.timeline.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-500">No updates yet — we'll add entries as your repair moves along.</p>
                ) : (
                  <ol className="mt-4 space-y-0">
                    {data.timeline.map((ev: any, i: number) => (
                      <li key={ev.id || i} className="relative flex gap-3 pb-5 last:pb-0">
                        {i < data.timeline.length - 1 && <span className="absolute left-[7px] top-4 h-full w-px bg-slate-200" />}
                        <span className={`relative mt-1 flex h-[15px] w-[15px] items-center justify-center rounded-full ${i === 0 ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                          {i === 0 && <CheckCircle2 size={10} className="text-white" />}
                        </span>
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-slate-800">{ev.description}</p>
                          <p className="mt-0.5 text-[11px] text-slate-400">{formatDateShort(ev.timestamp)}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* Photos */}
              {data.photos.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Wrench size={16} className="text-indigo-600" /> Condition photos
                  </h2>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {data.photos.map((p: any) => (
                      <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-slate-200">
                        <img src={p.url} alt={p.name} className="h-32 w-full object-cover" loading="lazy" />
                        <div className="flex items-center justify-between bg-slate-50 px-2 py-1">
                          <span className="text-[10px] font-bold uppercase text-slate-500">{p.phase || 'photo'}</span>
                          {p.category && <span className="text-[10px] text-slate-400">{p.category}</span>}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Quotes & invoices */}
              {(data.quotes.length > 0 || data.invoices.length > 0) && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <FileText size={16} className="text-indigo-600" /> Documents
                  </h2>
                  <p className="mt-1 text-[11px] text-slate-500">Open a document to view or print it.</p>
                  <div className="mt-3 flex flex-col gap-2">
                    {data.quotes.map((q: any) => (
                      <a key={q.id} href={`/api/quotes/${q.id}/pdf?code=${encodeURIComponent(data.job.trackingCode || '')}`} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                        <div className="flex items-center gap-2">
                          <FileText size={15} className="text-indigo-600" />
                          <div>
                            <p className="text-xs font-bold text-slate-800">{q.quoteNumber}</p>
                            <p className="text-[10px] text-slate-400">Quote · {q.status}</p>
                          </div>
                        </div>
                        <span className="flex items-center gap-1 text-xs font-bold text-indigo-600">
                          <Printer size={13} /> View / print
                          <ChevronRight size={13} />
                        </span>
                      </a>
                    ))}
                    {data.invoices.map((inv: any) => (
                      <a key={inv.id} href={`/api/invoices/${inv.id}/pdf?code=${encodeURIComponent(data.job.trackingCode || '')}`} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                        <div className="flex items-center gap-2">
                          <Package size={15} className="text-emerald-600" />
                          <div>
                            <p className="text-xs font-bold text-slate-800">{inv.invoiceNumber}</p>
                            <p className="text-[10px] text-slate-400">Invoice · {inv.status}</p>
                          </div>
                        </div>
                        <span className="flex items-center gap-1 text-xs font-bold text-indigo-600">
                          <Printer size={13} /> View / print
                          <ChevronRight size={13} />
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Contact */}
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 text-center">
                <p className="text-xs text-slate-600">Need help with your repair?</p>
                {data.customer?.phone ? (
                  <p className="mt-1 text-xs font-semibold text-indigo-700">Contact the workshop on {data.customer.phone}</p>
                ) : (
                  <p className="mt-1 text-xs font-semibold text-indigo-700">Contact the workshop for more info.</p>
                )}
              </div>
            </div>
          ) : null}
        </main>

        <footer className="mt-8 pb-2 text-center">
          <p className="text-[10px] text-slate-400">
            <AlertTriangle size={10} className="inline" /> For security, always verify the workshop's details before making any payment.
          </p>
        </footer>
      </div>
    </div>
  );
}
