import Customers from './pages/Customers';
import Devices from './pages/Devices';
import Jobs from './pages/Jobs';
import Inventory from './pages/Inventory';
import Dashboard from './pages/Dashboard';
import QuotesInvoices from './pages/QuotesInvoices';
import Messages from './pages/Messages';
import Documents from './pages/Documents';
import Tasks from './pages/Tasks';
import Purchases from './pages/Purchases';
import Suppliers from './pages/Suppliers';
import Settings from './pages/Settings';
import Reports from './pages/Reports';
import AuditLog from './pages/AuditLog';
import TrackPage from './pages/TrackPage';
import SetupPage from './pages/SetupPage';
import GlobalSearch from './components/GlobalSearch';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Users, Laptop, Wrench, Package, FileText, Settings as SettingsIcon, Menu, Headphones, Mail, HardDrive, CheckSquare, Truck, BarChart3, History, Factory } from 'lucide-react';
import { useState, useEffect } from 'react';

const SidebarItem = ({ to, icon: Icon, label }: { to: string, icon: any, label: string }) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Link to={to} className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
};

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/track" element={<TrackPage />} />
        <Route path="/track/:code" element={<TrackPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/*" element={<MainLayout />} />
      </Routes>
    </Router>
  );
}

function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [brand, setBrand] = useState({ business_name: '', business_tagline: '' });
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    fetch('/api/setup-status')
      .then((res) => res.json())
      .then((d) => {
        if (d?.needsSetup) navigate('/setup', { replace: true });
      })
      .catch(() => {});
  }, [navigate]);

  useEffect(() => {
    const loadBrand = () => {
      fetch('/api/settings')
        .then(res => res.json())
        .then((s) => setBrand({
          business_name: s?.business_name || '',
          business_tagline: s?.business_tagline || '',
        }))
        .catch(() => {});
    };
    loadBrand();
    window.addEventListener('settings-updated', loadBrand);
    return () => window.removeEventListener('settings-updated', loadBrand);
  }, [location.pathname]);

  useEffect(() => {
    fetch('/api/inventory')
      .then(res => res.json())
      .then(data => {
        setLowStock(data.filter((i: any) => i.quantity <= (i.minimumStockLevel || 0)));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex h-screen flex-col bg-[#F8FAFC] font-sans text-slate-900 overflow-hidden">
        
        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6 shadow-sm z-20">
          <div className="flex items-center gap-4">
            <div className="flex items-center md:hidden">
              <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg">
                <Menu size={24} />
              </button>
            </div>
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-600 font-bold text-white shadow-md bg-gradient-to-br from-indigo-500 to-purple-600">
              <Headphones size={20} />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-xl font-bold tracking-tight">{brand.business_name || 'DJ TECH'}</h1>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{brand.business_tagline || 'Fixing your problems, one service at a time.'}</p>
            </div>
          </div>
          <div className="hidden sm:flex flex-1 justify-center px-4">
            <GlobalSearch />
          </div>
          <div className="flex items-center gap-6">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-xs font-semibold text-slate-600">Technician: Admin</span>
              <span className="text-[10px] text-indigo-500">● Online</span>
            </div>
            <div className="h-10 w-10 rounded-full border-2 border-slate-200 bg-slate-100 flex items-center justify-center text-slate-400 font-bold">
              A
            </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden relative">
          {/* Sidebar */}
          <aside className={`absolute inset-y-0 left-0 z-10 w-56 transform border-r border-slate-200 bg-white py-6 transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <nav className="flex flex-col gap-1 px-3">
              <SidebarItem to="/" icon={Home} label="Dashboard" />
              <SidebarItem to="/customers" icon={Users} label="Customers" />
              <SidebarItem to="/messages" icon={Mail} label="Messages" />
              <SidebarItem to="/documents" icon={HardDrive} label="Documents" />
              <SidebarItem to="/tasks" icon={CheckSquare} label="Tasks & Reminders" />
              <SidebarItem to="/devices" icon={Laptop} label="Devices" />
              <SidebarItem to="/jobs" icon={Wrench} label="Jobs & Repair Cards" />
              <SidebarItem to="/billing" icon={FileText} label="Quotes & Invoices" />
              <SidebarItem to="/inventory" icon={Package} label="Inventory & Parts" />
              <SidebarItem to="/suppliers" icon={Factory} label="Suppliers" />
              <SidebarItem to="/purchases" icon={Truck} label="Purchases & ETA" />
              <SidebarItem to="/reports" icon={BarChart3} label="Reports" />
              <SidebarItem to="/audit" icon={History} label="Audit Log" />
              <SidebarItem to="/settings" icon={SettingsIcon} label="Settings" />
            </nav>

            <div className="mt-10 px-6 hidden md:block">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Stock Alerts</h3>
              <div className="mt-4 flex flex-col gap-3">
                {lowStock.length === 0 ? (
                  <p className="text-[10px] text-slate-400">All stock levels are healthy.</p>
                ) : (
                  lowStock.map(item => (
                    <div key={item.id} className="flex flex-col">
                      <span className="text-xs font-semibold">{item.productName}</span>
                      <div className="mt-1 h-1 w-full bg-slate-100">
                        <div className={`h-full ${item.quantity <= 0 ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, Math.max(5, (item.quantity / Math.max(1, item.minimumStockLevel)) * 100))}%` }}></div>
                      </div>
                      <span className={`mt-1 text-[10px] font-bold ${item.quantity <= 0 ? 'text-red-500' : 'text-amber-600'}`}>
                        {item.quantity <= 0 ? 'OUT' : 'LOW'}: {item.quantity} units
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>

          {/* Mobile Overlay */}
          {sidebarOpen && (
            <div className="fixed inset-0 bg-slate-950/50 z-0 md:hidden" onClick={() => setSidebarOpen(false)} />
          )}

          {/* Main Content */}
          <main className="flex-1 overflow-hidden flex flex-col bg-[#F8FAFC]">
            <div className="flex-1 overflow-auto">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/messages" element={<Messages />} />
                <Route path="/documents" element={<Documents />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/devices" element={<Devices />} />
                <Route path="/jobs" element={<Jobs />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/suppliers" element={<Suppliers />} />
                <Route path="/purchases" element={<Purchases />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/audit" element={<AuditLog />} />
                <Route path="/billing" element={<QuotesInvoices />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </div>
          </main>
        </div>
      </div>
  );
}
