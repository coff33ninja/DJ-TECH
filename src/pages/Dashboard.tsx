import { useState, useEffect } from 'react';
import { Wrench, AlertTriangle, FileText, CheckCircle2, TrendingUp, Package, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard')
      .then(res => res.json())
      .then(data => {
        setStats(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch dashboard', err);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="p-8 text-center text-slate-500">Loading dashboard...</div>;

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pb-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Open Jobs</p>
          <p className="mt-1 text-2xl font-bold text-indigo-600">{stats?.openJobs || 0}</p>
          <span className="text-[10px] text-slate-500">{stats?.waitingParts || 0} Awaiting Parts</span>
        </div>
        
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Low Stock</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{stats?.lowStockAlerts || 0}</p>
          <span className="text-[10px] text-slate-500">Inventory Alerts</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Outstanding</p>
          <p className="mt-1 text-2xl font-bold text-red-500">R {(stats?.unpaidInvoicesTotal || 0).toFixed(2)}</p>
          <span className="text-[10px] text-slate-500">Unpaid Invoices</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Monthly Revenue</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">R {(stats?.monthRevenue || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</p>
          <span className={`text-[10px] font-bold ${(stats?.revenueChange || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            {(stats?.revenueChange || 0) >= 0 ? '+' : ''}{stats?.revenueChange || 0}% vs last month
          </span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 overflow-hidden flex-1 min-h-0">
        <section className="flex-[2] rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col min-h-0">
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <h2 className="text-sm font-bold text-slate-800">Active Job Workflow</h2>
            <div className="flex gap-2">
              <Link to="/jobs" className="rounded border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold">View All</Link>
              <Link to="/jobs" className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700">+ New Job</Link>
            </div>
          </div>
          <div className="overflow-y-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3">Job #</th>
                  <th className="px-4 py-3">Issue</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {stats?.recentJobs?.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500 text-sm">No recent jobs.</td></tr>
                ) : (
                  stats?.recentJobs?.map((job: any) => (
                    <tr key={job.id} className="hover:bg-slate-50">
                      <td className="px-4 py-4 font-mono font-bold text-indigo-600">{job.jobNumber}</td>
                      <td className="px-4 py-4 leading-tight max-w-[200px]">
                        <div className="text-xs text-slate-600 truncate" title={job.reportedProblem}>{job.reportedProblem || 'No description'}</div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          job.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
                          job.status === 'Awaiting Parts' ? 'bg-amber-100 text-amber-700' :
                          job.status === 'Repairing' ? 'bg-purple-100 text-purple-700' :
                          'bg-indigo-100 text-indigo-700'
                        }`}>
                          {job.status}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <Link to={`/jobs`} className="text-indigo-600 hover:underline font-bold text-xs">Edit</Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="flex-1 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col min-h-0">
          <div className="border-b border-slate-100 p-4">
            <h2 className="text-sm font-bold text-slate-800">Recent Activities</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="relative flex flex-col gap-6 before:absolute before:left-2.5 before:top-1 before:h-[90%] before:w-px before:bg-slate-100">
              {stats?.activities?.length === 0 ? (
                <p className="text-xs text-slate-500 pl-8">No activity yet.</p>
              ) : (
                stats?.activities?.map((a: any, i: number) => (
                  <div key={i} className="relative pl-8">
                    <div className={`absolute left-0 top-1 h-5 w-5 rounded-full border-2 bg-white ${
                      a.title === 'Payment Received' ? 'border-emerald-500' :
                      a.title.includes('Status') || a.title.includes('Part') ? 'border-indigo-500' :
                      'border-slate-300'
                    }`}></div>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold">{a.title}</span>
                      <span className="text-[10px] text-slate-500 italic">{a.subtitle}</span>
                      <span className="text-[10px] font-medium text-slate-400">
                        {a.timestamp ? format(new Date(a.timestamp), 'HH:mm • dd MMM') : ''}{a.detail ? ` • ${a.detail}` : ''}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="border-t border-slate-100 p-4">
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Daily Revenue Goal</span>
                <span className="font-bold text-slate-800">R {(stats?.dailyGoal || 0).toLocaleString('en-ZA')}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, stats?.dailyGoal ? (stats.todayRevenue / stats.dailyGoal) * 100 : 0)}%` }}></div>
              </div>
              <p className="text-center text-[10px] text-slate-400">R {(stats?.todayRevenue || 0).toLocaleString('en-ZA')} / R {(stats?.dailyGoal || 0).toLocaleString('en-ZA')}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
