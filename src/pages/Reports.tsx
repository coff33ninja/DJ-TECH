import { useState, useEffect } from 'react';
import { TrendingUp, AlertTriangle, CheckCircle2, Package, Truck, Users, Wrench, FileWarning } from 'lucide-react';
import { Link } from 'react-router-dom';

const Card = ({ icon: Icon, label, value, sub, accent }: { icon: any, label: string, value: string, sub?: string, accent: string }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center gap-2">
      <Icon size={14} className={accent} />
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
    </div>
    <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    {sub && <span className="text-[10px] text-slate-500">{sub}</span>}
  </div>
);

const R = (n: number) => 'R ' + (n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 });

export default function Reports() {
  const [data, setData] = useState<any>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    fetch(`/api/reports?${params.toString()}`)
      .then(res => res.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { console.error('Failed to fetch reports', err); setLoading(false); });
  };

  if (loading && !data) return <div className="p-8 text-center text-slate-500">Loading reports...</div>;

  return (
    <div className="p-6 h-full flex flex-col overflow-y-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Reports</h1>
          <p className="text-sm text-slate-500 mt-1">Revenue, jobs, spending, and repair insights.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <span className="text-xs text-slate-400">to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <button onClick={fetchReports} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-semibold text-xs transition-colors">
            Apply
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card icon={TrendingUp} label="Revenue (period)" value={R(data?.revenue)} accent="text-emerald-600" sub="From received payments" />
        <Card icon={Truck} label="Supplier Spend (period)" value={R(data?.supplierSpending)} accent="text-indigo-600" sub="Value of parts ordered" />
        <Card icon={AlertTriangle} label="Outstanding Invoices" value={R(data?.outstandingInvoices)} accent="text-red-500" sub="Unpaid balance" />
        <Card icon={CheckCircle2} label="Jobs Completed" value={String(data?.jobsCompleted || 0)} accent="text-emerald-600" sub={`${data?.jobsAwaitingParts || 0} awaiting parts`} />
        <Card icon={Package} label="Warranty Returns" value={String(data?.warrantyReturns || 0)} accent="text-amber-600" />
        <Card icon={Users} label="Top Customer" value={data?.topCustomers?.[0]?.name || '—'} accent="text-indigo-600" sub={data?.topCustomers?.[0] ? R(data.topCustomers[0].total) : undefined} />
        <Card icon={Wrench} label="Most Common Repair" value={data?.commonRepairs?.[0]?.problem || '—'} accent="text-slate-600" sub={data?.commonRepairs?.[0] ? `${data.commonRepairs[0].count} job(s)` : undefined} />
        <Card icon={FileWarning} label="Unresolved Status" value="—" accent="text-slate-400" />
      </div>

      <div className="flex flex-col lg:flex-row gap-6 mt-6">
        <section className="flex-[2] rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 p-4">
            <h2 className="text-sm font-bold text-slate-800">Monthly Revenue</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3">Month</th>
                  <th className="px-4 py-3 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.monthlyRevenue || []).length === 0 ? (
                  <tr><td colSpan={2} className="px-4 py-6 text-center text-slate-500 text-xs">No revenue recorded yet.</td></tr>
                ) : data.monthlyRevenue.map((m: any) => (
                  <tr key={m.month} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-800">{m.month}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600">{R(m.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex-1 flex flex-col gap-6">
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 p-4">
              <h2 className="text-sm font-bold text-slate-800">Customer Spending</h2>
            </div>
            <div className="p-4 flex flex-col gap-2">
              {(data?.topCustomers || []).length === 0 ? (
                <p className="text-xs text-slate-500">No payments in period.</p>
              ) : data.topCustomers.map((c: any) => (
                <div key={c.name} className="flex justify-between items-center text-sm">
                  <span className="font-semibold text-slate-800">{c.name}</span>
                  <span className="font-bold text-slate-600">{R(c.total)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 p-4">
              <h2 className="text-sm font-bold text-slate-800">Supplier Spending</h2>
            </div>
            <div className="p-4 flex flex-col gap-2">
              {(data?.topSuppliers || []).length === 0 ? (
                <p className="text-xs text-slate-500">No purchases in period.</p>
              ) : data.topSuppliers.map((s: any) => (
                <div key={s.supplier} className="flex justify-between items-center text-sm">
                  <span className="font-semibold text-slate-800">{s.supplier}</span>
                  <span className="font-bold text-slate-600">{R(s.total)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 p-4">
              <h2 className="text-sm font-bold text-slate-800">Most Common Repairs</h2>
            </div>
            <div className="p-4 flex flex-col gap-2">
              {(data?.commonRepairs || []).length === 0 ? (
                <p className="text-xs text-slate-500">No jobs in period.</p>
              ) : data.commonRepairs.map((r: any) => (
                <div key={r.problem} className="flex justify-between items-center text-sm">
                  <span className="font-semibold text-slate-800 truncate max-w-[220px]">{r.problem}</span>
                  <span className="font-bold text-slate-600">{r.count}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="mt-6 text-center">
        <Link to="/jobs" className="text-xs text-indigo-600 hover:underline font-semibold">Open the jobs view for full repair detail →</Link>
      </div>
    </div>
  );
}
