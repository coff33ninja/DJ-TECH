import { useState, useEffect, FormEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Search, Plus, Laptop, X, Cpu, MemoryStick, CircuitBoard, Box, Zap, HardDrive, Database, Monitor, Printer, Gamepad2, Smartphone, Tablet, Cable, Package, Pencil, Eye, BatteryCharging, Plug } from 'lucide-react';

interface Customer {
  id: string;
  fullName: string;
}

interface ComponentField {
  present: boolean;
  spec: string;
}

interface Device {
  id: string;
  customerId: string;
  deviceType: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  assetTag: string | null;
  operatingSystem: string | null;
  hasCpu: number;
  hasRam: number;
  hasMotherboard: number;
  hasBox: number;
  hasPowersupply: number;
  hasHdd: number;
  hasSsd: number;
  hasGpu: number;
  hasBattery: number;
  hasCharger: number;
  hasBoxType: number;
  cpu: string | null;
  ram: string | null;
  motherboard: string | null;
  box: string | null;
  powersupply: string | null;
  hdd: string | null;
  ssd: string | null;
  gpu: string | null;
  battery: string | null;
  charger: string | null;
  boxType: string | null;
  customerName?: string;
}

const DEVICE_TYPES = [
  { value: 'pc', label: 'PC / Desktop', icon: Laptop },
  { value: 'laptop', label: 'Laptop', icon: Laptop },
  { value: 'monitor', label: 'Monitor', icon: Monitor },
  { value: 'printer', label: 'Printer', icon: Printer },
  { value: 'console', label: 'Console', icon: Gamepad2 },
  { value: 'phone', label: 'Phone', icon: Smartphone },
  { value: 'tablet', label: 'Tablet', icon: Tablet },
  { value: 'powerlead', label: 'Power Lead / Cable', icon: Cable },
  { value: 'other', label: 'Other / Generic', icon: Package },
];

const typeLabel = (t: string | null) =>
  DEVICE_TYPES.find(d => d.value === t)?.label || (t ? t[0].toUpperCase() + t.slice(1) : 'Computer');

interface ComponentConfig {
  key: string;
  label: string;
  icon: LucideIcon;
  placeholder?: string;
  options?: string[];
  types?: string[];
}

const COMPONENTS: ComponentConfig[] = [
  { key: 'cpu', label: 'CPU', icon: Cpu, placeholder: 'i5-13400' },
  { key: 'ram', label: 'RAM', icon: MemoryStick, placeholder: '16GB DDR4' },
  { key: 'motherboard', label: 'Motherboard', icon: CircuitBoard, placeholder: 'ASUS B650M-A' },
  { key: 'box', label: 'Box / Case', icon: Box, placeholder: 'Fractal Design Meshify' },
  { key: 'boxType', label: 'Box Type', icon: Box, options: ['OEM', 'Custom'], types: ['pc'] },
  { key: 'powersupply', label: 'Power Supply', icon: Zap, placeholder: '650W Gold' },
  { key: 'hdd', label: 'HDD', icon: HardDrive, placeholder: '2TB Seagate Barracuda' },
  { key: 'ssd', label: 'SSD', icon: Database, placeholder: '1TB NVMe PCIe 4.0' },
  { key: 'gpu', label: 'GPU', icon: Monitor, placeholder: 'RTX 3070' },
  { key: 'battery', label: 'Battery', icon: BatteryCharging, options: ['OK', 'Defective', 'Not included'], types: ['laptop'] },
  { key: 'charger', label: 'Charger', icon: Plug, options: ['Original', 'Generic', 'Not included'], types: ['laptop'] },
];

type CompKey = typeof COMPONENTS[number]['key'];

const emptyComponents = (): Record<CompKey, ComponentField> =>
  Object.fromEntries(COMPONENTS.map(c => [c.key, { present: false, spec: '' }])) as Record<CompKey, ComponentField>;

const deviceToComponents = (d: Device): Record<CompKey, ComponentField> =>
  Object.fromEntries(COMPONENTS.map(c => {
    const flag = (d as any)[`has${c.key[0].toUpperCase()}${c.key.slice(1)}`];
    const value = (d as any)[c.key];
    return [c.key, { present: !!flag || !!value, spec: value || '' }];
  })) as Record<CompKey, ComponentField>;

const Toggle = ({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) => (
  <button
    type="button"
    onClick={() => onChange(!on)}
    aria-pressed={on}
    className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${on ? 'bg-indigo-600' : 'bg-slate-300'}`}
  >
    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
  </button>
);

export default function Devices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showView, setShowView] = useState<Device | null>(null);
  const [editing, setEditing] = useState<Device | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customerId: '',
    deviceType: '',
    manufacturer: '',
    model: '',
    serialNumber: '',
    assetTag: '',
    operatingSystem: '',
    components: emptyComponents(),
  });

  const fetchDevices = () => {
    setLoading(true);
    fetch('/api/devices')
      .then(res => res.json())
      .then((data: Device[]) => {
        setDevices(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch devices', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchDevices();
    fetch('/api/customers')
      .then(res => res.json())
      .then(data => setCustomers(data))
      .catch(err => console.error('Failed to fetch customers', err));
  }, []);

  const setField = (field: string, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const setComponent = (key: CompKey, patch: Partial<ComponentField>) =>
    setForm(prev => ({ ...prev, components: { ...prev.components, [key]: { ...prev.components[key], ...patch } } }));

  const buildPayload = () => {
    const payload: Record<string, any> = {
      customerId: form.customerId,
      deviceType: form.deviceType,
      manufacturer: form.manufacturer,
      model: form.model,
      serialNumber: form.serialNumber,
      assetTag: form.assetTag,
      operatingSystem: form.operatingSystem,
    };
    for (const c of COMPONENTS) {
      const { present, spec } = form.components[c.key];
      payload[c.key] = present ? spec : null;
      payload[`has${c.key[0].toUpperCase()}${c.key.slice(1)}`] = present ? 1 : 0;
    }
    return payload;
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      customerId: '', deviceType: '', manufacturer: '', model: '', serialNumber: '',
      assetTag: '', operatingSystem: '', components: emptyComponents(),
    });
    setShowModal(true);
  };

  const openEdit = (d: Device) => {
    setEditing(d);
    setForm({
      customerId: d.customerId,
      deviceType: d.deviceType || '',
      manufacturer: d.manufacturer || '',
      model: d.model || '',
      serialNumber: d.serialNumber || '',
      assetTag: d.assetTag || '',
      operatingSystem: d.operatingSystem || '',
      components: deviceToComponents(d),
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.customerId) return;
    setSaving(true);
    try {
      const method = editing ? 'PATCH' : 'POST';
      const url = editing ? `/api/devices/${editing.id}` : '/api/devices';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload())
      });
      if (!res.ok) throw new Error('Save failed');
      setShowModal(false);
      setEditing(null);
      fetchDevices();
    } catch (err) {
      console.error('Failed to save device', err);
      alert('Failed to save device.');
    } finally {
      setSaving(false);
    }
  };

  const filteredDevices = devices.filter(d =>
    (d.manufacturer && d.manufacturer.toLowerCase().includes(search.toLowerCase())) ||
    (d.model && d.model.toLowerCase().includes(search.toLowerCase())) ||
    (d.serialNumber && d.serialNumber.toLowerCase().includes(search.toLowerCase())) ||
    (typeLabel(d.deviceType) && typeLabel(d.deviceType).toLowerCase().includes(search.toLowerCase()))
  );

  const presentComponents = (d: Device) => deviceToComponents(d);

  return (
    <div className="p-6 h-full flex flex-col relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Devices</h1>
          <p className="text-sm text-slate-500 mt-1">Manage customer devices and hardware specifications.</p>
        </div>
        <button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-semibold flex items-center gap-2 text-xs transition-colors">
          <Plus size={16} />
          Check-in Device
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-0 flex-1">
        <div className="p-4 border-b border-slate-100 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Search by model, serial number or type..."
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
                <th className="px-6 py-3">Device</th>
                <th className="px-6 py-3">Components</th>
                <th className="px-6 py-3">Serial / Tag</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500">Loading devices...</td>
                </tr>
              ) : filteredDevices.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Laptop size={32} className="text-slate-300" />
                      <p>No devices found.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredDevices.map(device => {
                  const comps = presentComponents(device);
                  const present = COMPONENTS.filter(c => comps[c.key].present);
                  const TypeIcon = DEVICE_TYPES.find(d => d.value === device.deviceType)?.icon || Laptop;
                  return (
                    <tr key={device.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded bg-indigo-50 text-indigo-600 flex items-center justify-center">
                            <TypeIcon size={20} />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{device.manufacturer || 'Unknown'} {device.model || 'Device'}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{typeLabel(device.deviceType)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {present.length === 0 ? (
                          <span className="text-slate-400 italic text-xs">No components recorded</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {present.map(c => (
                              <span key={c.key} className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-[10px] font-semibold px-2 py-0.5 rounded">
                                <c.icon size={11} className="text-indigo-500" />
                                {c.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded inline-block w-max font-bold">
                            SN: {device.serialNumber || 'N/A'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setShowView(device)} className="text-slate-500 hover:text-indigo-600 font-bold text-xs transition-colors flex items-center gap-1">
                            <Eye size={14} /> View
                          </button>
                          <button onClick={() => openEdit(device)} className="text-indigo-600 hover:underline font-bold text-xs transition-colors flex items-center gap-1">
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

      {/* Check-in / Edit Device Modal */}
      {showModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl flex flex-col max-h-full">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <h2 className="font-bold text-slate-800 text-sm">{editing ? 'Edit Device' : 'Check-in Device'}</h2>
              <button onClick={() => { setShowModal(false); setEditing(null); }} className="text-slate-400 hover:text-slate-600 text-sm font-bold">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 flex flex-col flex-1 overflow-y-auto gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Customer *</label>
                <select
                  required
                  value={form.customerId}
                  onChange={(e) => setField('customerId', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                >
                  <option value="" disabled>Select customer...</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.fullName}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {DEVICE_TYPES.map(t => {
                  const active = form.deviceType === t.value;
                  return (
                    <button
                      type="button"
                      key={t.value}
                      onClick={() => setField('deviceType', t.value)}
                      className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-xs font-semibold transition-colors ${active ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                    >
                      <t.icon size={18} />
                      {t.label}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Manufacturer</label>
                  <input
                    value={form.manufacturer}
                    onChange={(e) => setField('manufacturer', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="Dell, HP, Lenovo..."
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Model</label>
                  <input
                    value={form.model}
                    onChange={(e) => setField('model', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="XPS 15"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Serial Number</label>
                  <input
                    value={form.serialNumber}
                    onChange={(e) => setField('serialNumber', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="Serial number"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Asset Tag</label>
                  <input
                    value={form.assetTag}
                    onChange={(e) => setField('assetTag', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Operating System</label>
                <input
                  value={form.operatingSystem}
                  onChange={(e) => setField('operatingSystem', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  placeholder="Windows 11"
                />
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Components</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {COMPONENTS.filter(c => !c.types || c.types.some(t => form.deviceType.toLowerCase() === t)).map(c => {
                    const comp = form.components[c.key];
                    return (
                      <div key={c.key} className={`rounded-lg border p-3 transition-colors ${comp.present ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-200'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <c.icon size={15} className={comp.present ? 'text-indigo-600' : 'text-slate-400'} />
                            <span className="text-xs font-bold text-slate-700">{c.label}</span>
                          </div>
                          <Toggle on={comp.present} onChange={(v) => setComponent(c.key, { present: v, spec: v ? (comp.spec || c.options?.[0] || '') : '' })} />
                        </div>
                        {comp.present && (c.options ? (
                          <select
                            value={comp.spec}
                            onChange={(e) => setComponent(c.key, { spec: e.target.value })}
                            className="mt-2 w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                          >
                            <option value="" disabled>Select state...</option>
                            {c.options.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input
                            value={comp.spec}
                            onChange={(e) => setComponent(c.key, { spec: e.target.value })}
                            className="mt-2 w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                            placeholder={c.placeholder}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
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
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Save Device'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Device Modal */}
      {showView && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowView(null)}>
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-xl flex flex-col max-h-full" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  {(DEVICE_TYPES.find(d => d.value === showView.deviceType)?.icon || Laptop)({ size: 18 })}
                </div>
                <div>
                  <h2 className="font-bold text-slate-800 text-sm">{showView.manufacturer || 'Unknown'} {showView.model || 'Device'}</h2>
                  <p className="text-xs text-slate-500">{typeLabel(showView.deviceType)}</p>
                </div>
              </div>
              <button onClick={() => setShowView(null)} className="text-slate-400 hover:text-slate-600 text-sm font-bold">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Serial Number</p>
                  <p className="font-mono font-semibold text-slate-800 mt-0.5">{showView.serialNumber || 'N/A'}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Asset Tag</p>
                  <p className="font-semibold text-slate-800 mt-0.5">{showView.assetTag || 'N/A'}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Operating System</p>
                  <p className="font-semibold text-slate-800 mt-0.5">{showView.operatingSystem || 'N/A'}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Customer</p>
                  <p className="font-semibold text-slate-800 mt-0.5">{showView.customerName || '—'}</p>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Components</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {COMPONENTS.filter(c => !c.types || c.types.some(t => showView.deviceType?.toLowerCase() === t)).map(c => {
                    const comp = deviceToComponents(showView)[c.key];
                    return (
                      <div key={c.key} className={`rounded-lg border p-3 ${comp.present ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-200 opacity-60'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <c.icon size={14} className={comp.present ? 'text-indigo-600' : 'text-slate-400'} />
                            <span className="text-xs font-bold text-slate-700">{c.label}</span>
                          </div>
                          <span className={`text-[10px] font-bold uppercase ${comp.present ? 'text-indigo-600' : 'text-slate-400'}`}>
                            {comp.present ? 'Present' : 'Not recorded'}
                          </span>
                        </div>
                        {comp.present && <p className="mt-1 text-xs text-slate-700">{comp.spec || 'No details'}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button onClick={() => setShowView(null)} className="px-4 py-2 rounded text-xs font-semibold text-slate-600 hover:bg-slate-100">
                  Close
                </button>
                <button
                  onClick={() => { const d = showView; setShowView(null); openEdit(d); }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-semibold text-xs transition-colors flex items-center gap-1.5"
                >
                  <Pencil size={14} /> Edit Device
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
