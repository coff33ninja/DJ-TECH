import { useState, useEffect, useRef } from 'react';
import { Search, Users, Laptop, Wrench, FileText, Receipt, Truck, Package, History } from 'lucide-react';
import { Link } from 'react-router-dom';

interface SearchResults {
  customers: any[];
  devices: any[];
  jobs: any[];
  invoices: any[];
  quotes: any[];
  purchases: any[];
  inventory: any[];
  deviceHistory: any[];
}

export default function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<any>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) { setResults(null); setOpen(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then(res => res.json())
        .then(data => { setResults(data); setOpen(true); setLoading(false); })
        .catch(err => { console.error('Search failed', err); setLoading(false); });
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const total = results ? results.customers.length + results.devices.length + results.jobs.length +
    results.invoices.length + results.quotes.length + results.purchases.length + results.inventory.length : 0;

  const SectionTitle = ({ icon: Icon, text }: { icon: any, text: string }) => (
    <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
      <Icon size={12} /> {text}
    </div>
  );

  return (
    <div ref={boxRef} className="relative flex-1 max-w-md hidden sm:block">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
      <input
        type="text"
        placeholder="Search customers, serial numbers, jobs..."
        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow text-sm"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => { if (results && total > 0) setOpen(true); }}
      />

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-2 z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
            {loading ? (
              <div className="p-4 text-center text-xs text-slate-500">Searching...</div>
            ) : total === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">No results for "{query}".</div>
            ) : (
              <div className="py-1">
                {results.customers.length > 0 && (
                  <>
                    <SectionTitle icon={Users} text="Customers" />
                    {results.customers.map(c => (
                      <Link key={c.id} to="/customers" onClick={() => setOpen(false)}
                        className="flex items-center justify-between px-3 py-1.5 hover:bg-slate-50 text-sm">
                        <span className="font-semibold text-slate-800">{c.customerType === 'company' ? (c.companyName || c.fullName) : c.fullName}</span>
                        <span className="text-[10px] text-slate-400">{c.phone || c.email || ''}</span>
                      </Link>
                    ))}
                  </>
                )}

                {results.devices.length > 0 && (
                  <>
                    <SectionTitle icon={Laptop} text="Devices" />
                    {results.devices.map(d => (
                      <Link key={d.id} to="/devices" onClick={() => setOpen(false)}
                        className="flex items-center justify-between px-3 py-1.5 hover:bg-slate-50 text-sm">
                        <span className="font-semibold text-slate-800">{d.manufacturer || ''} {d.model || 'Device'}</span>
                        <span className="text-[10px] text-slate-400">{d.serialNumber || ''}</span>
                      </Link>
                    ))}
                  </>
                )}

                {results.deviceHistory.length > 0 && (
                  <>
                    <SectionTitle icon={History} text="Repair History (by serial)" />
                    {results.deviceHistory.map(j => (
                      <Link key={j.id} to="/jobs" onClick={() => setOpen(false)}
                        className="flex items-center justify-between px-3 py-1.5 hover:bg-slate-50 text-sm">
                        <span className="font-mono font-bold text-indigo-600">{j.jobNumber}</span>
                        <span className="text-[10px] text-slate-500 truncate max-w-[200px]">{j.status} • {j.reportedProblem || ''}</span>
                      </Link>
                    ))}
                  </>
                )}

                {results.jobs.length > 0 && (
                  <>
                    <SectionTitle icon={Wrench} text="Jobs" />
                    {results.jobs.map(j => (
                      <Link key={j.id} to="/jobs" onClick={() => setOpen(false)}
                        className="flex items-center justify-between px-3 py-1.5 hover:bg-slate-50 text-sm">
                        <span className="font-mono font-bold text-indigo-600">{j.jobNumber}</span>
                        <span className="text-[10px] text-slate-500 truncate max-w-[200px]">{j.status} • {j.reportedProblem || ''}</span>
                      </Link>
                    ))}
                  </>
                )}

                {results.invoices.length > 0 && (
                  <>
                    <SectionTitle icon={FileText} text="Invoices" />
                    {results.invoices.map(i => (
                      <Link key={i.id} to="/billing" onClick={() => setOpen(false)}
                        className="flex items-center justify-between px-3 py-1.5 hover:bg-slate-50 text-sm">
                        <span className="font-mono font-bold text-slate-800">{i.invoiceNumber}</span>
                        <span className="text-[10px] text-slate-500">{i.status} • R{i.total?.toFixed?.(2) ?? i.total}</span>
                      </Link>
                    ))}
                  </>
                )}

                {results.quotes.length > 0 && (
                  <>
                    <SectionTitle icon={Receipt} text="Quotes" />
                    {results.quotes.map(q => (
                      <Link key={q.id} to="/billing" onClick={() => setOpen(false)}
                        className="flex items-center justify-between px-3 py-1.5 hover:bg-slate-50 text-sm">
                        <span className="font-mono font-bold text-slate-800">{q.quoteNumber}</span>
                        <span className="text-[10px] text-slate-500">{q.status} • R{q.total?.toFixed?.(2) ?? q.total}</span>
                      </Link>
                    ))}
                  </>
                )}

                {results.purchases.length > 0 && (
                  <>
                    <SectionTitle icon={Truck} text="Purchases" />
                    {results.purchases.map(p => (
                      <Link key={p.id} to="/purchases" onClick={() => setOpen(false)}
                        className="flex items-center justify-between px-3 py-1.5 hover:bg-slate-50 text-sm">
                        <span className="font-semibold text-slate-800">{p.supplier}</span>
                        <span className="text-[10px] text-slate-500">{p.orderNumber || p.deliveryStatus}</span>
                      </Link>
                    ))}
                  </>
                )}

                {results.inventory.length > 0 && (
                  <>
                    <SectionTitle icon={Package} text="Parts" />
                    {results.inventory.map(i => (
                      <Link key={i.id} to="/inventory" onClick={() => setOpen(false)}
                        className="flex items-center justify-between px-3 py-1.5 hover:bg-slate-50 text-sm">
                        <span className="font-semibold text-slate-800">{i.productName}</span>
                        <span className="text-[10px] text-slate-500">{i.partNumber || i.sku || `${i.quantity} in stock`}</span>
                      </Link>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
