import { useState, useEffect, useRef, FormEvent, ChangeEvent } from 'react';
import { Search, Plus, Wrench, X, Calendar, Clock, AlertCircle, History, MessageSquare, CheckCircle2, ChevronRight, Package, Mail, Camera, UserPlus, Copy } from 'lucide-react';
import { format } from 'date-fns';

interface Customer {
  id: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
}

interface Device {
  id: string;
  customerId: string;
  manufacturer: string | null;
  model: string | null;
}

interface TimelineEvent {
  id: string;
  eventType: string;
  description: string;
  timestamp: string | Date;
}

interface Job {
  id: string;
  jobNumber: string;
  customerId: string;
  customerName?: string | null;
  deviceId: string;
  deviceSummary?: string | null;
  dateReceived: string | Date | null;
  expectedCompletionDate: string | Date | null;
  priority: string;
  status: string;
  reportedProblem: string | null;
  accessoriesReceived: string | null;
  physicalCondition: string | null;
  existingDamage: string | null;
  devicePassword: string | null;
  initialDiagnosis: string | null;
  technician: string | null;
  technicianNotes: string | null;
  customerVisibleNotes: string | null;
  workPerformed: string | null;
  warrantyPeriodDays: number | null;
  completionDate: string | Date | null;
  collectionDate: string | Date | null;
  timeline?: TimelineEvent[];
}

const WORKFLOW = [
  'Received',
  'Diagnosing',
  'Awaiting Approval',
  'Awaiting Parts',
  'Repairing',
  'Testing',
  'Ready for Collection',
  'Completed',
];

const EXTRA_STATUSES = ['Collected', 'Cancelled', 'Unrepairable', 'Customer Declined Repair', 'Awaiting Customer', 'Warranty Return'];

const ALL_STATUSES = [...WORKFLOW, ...EXTRA_STATUSES];

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
  'Cancelled': 'bg-red-100 text-red-700',
  'Unrepairable': 'bg-red-100 text-red-700',
  'Customer Declined Repair': 'bg-rose-100 text-rose-700',
  'Awaiting Customer': 'bg-slate-100 text-slate-700',
  'Warranty Return': 'bg-cyan-100 text-cyan-700',
};

const priorityColors: Record<string, string> = {
  'low': 'text-slate-500',
  'normal': 'text-indigo-500',
  'high': 'text-amber-500',
  'urgent': 'text-red-600 font-bold',
};

const eventIcons: Record<string, any> = {
  'status_change': CheckCircle2,
  'note': MessageSquare,
  'part_ordered': Package,
  'email_sent': Mail,
};

export default function Jobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<Job | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [action, setAction] = useState('');
  const [note, setNote] = useState('');
  const [form, setForm] = useState({
    customerId: '',
    deviceId: '',
    reportedProblem: '',
    priority: 'normal',
    accessoriesReceived: '',
    physicalCondition: '',
    existingDamage: '',
    devicePassword: '',
    autoSendIntake: -1,
  });
  const [intakePhotos, setIntakePhotos] = useState<File[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [detailAttachments, setDetailAttachments] = useState<any[]>([]);
  const [attaching, setAttaching] = useState(false);

  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [fullCustomerForm, setFullCustomerForm] = useState(false);
  const [showNewDevice, setShowNewDevice] = useState(false);
  const [inlineSaving, setInlineSaving] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ fullName: '', companyName: '', customerType: 'individual', phone: '', email: '', address: '', notes: '' });
  const [newDevice, setNewDevice] = useState({ deviceType: 'laptop', manufacturer: '', model: '', serialNumber: '' });

  const fetchJobs = () => {
    setLoading(true);
    fetch('/api/jobs')
      .then(res => res.json())
      .then(data => {
        setJobs(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch jobs', err);
        setLoading(false);
      });
  };

  const refreshDetail = (id: string) => {
    fetch(`/api/jobs/${id}`)
      .then(res => res.json())
      .then(data => {
        setDetail(data);
        setJobs(prev => prev.map(j => (j.id === id ? { ...j, ...data } : j)));
      })
      .catch(err => console.error('Failed to refresh job', err));
  };  useEffect(() => {
    fetchJobs();
    fetch('/api/customers')
      .then(res => res.json())
      .then(data => setCustomers(data))
      .catch(err => console.error('Failed to fetch customers', err));
    fetch('/api/devices')
      .then(res => res.json())
      .then(data => setDevices(data))
      .catch(err => console.error('Failed to fetch devices', err));
  }, []);

  const openDetail = (id: string) => {
    fetch(`/api/jobs/${id}`)
      .then(res => res.json())
      .then(data => {
        setDetail(data);
        setDraft({});
      })
      .catch(err => {
        console.error('Failed to fetch job detail', err);
        alert('Failed to load job.');
      });
    fetch(`/api/jobs/${id}/attachments`)
      .then(res => res.json())
      .then(data => setDetailAttachments(data))
      .catch(() => setDetailAttachments([]));
  };

  const uploadDetailPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!detail) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setAttaching(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('jobId', detail.id);
      fd.append('category', 'intake');
      fd.append('phase', 'before');
      const res = await fetch('/api/attachments', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Failed');
      const atts = await fetch(`/api/jobs/${detail.id}/attachments`).then(r => r.json());
      setDetailAttachments(atts);
    } catch (err: any) {
      alert('Failed to upload photo: ' + err.message);
    } finally {
      setAttaching(false);
      if (e.target) e.target.value = '';
    }
  };

  const deleteDetailPhoto = async (attId: string) => {
    if (!confirm('Remove this photo from the job?')) return;
    if (!detail) return;
    try {
      const res = await fetch(`/api/attachments/${attId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      setDetailAttachments(prev => prev.filter(a => a.id !== attId));
    } catch (err: any) {
      alert('Failed to delete: ' + err.message);
    }
  };

  const fieldValue = (name: string) =>
    (name in draft ? draft[name] : (detail as any)[name] ?? '') as string;

  const setDraftField = (name: string, value: string) =>
    setDraft(prev => ({ ...prev, [name]: value }));

  const saveDraftField = (name: string) => {
    if (!detail) return;
    const value = draft[name];
    if (value === undefined) return;
    if (value === ((detail as any)[name] ?? '')) return;
    updateField({ [name]: value });
  };

  const openCreateModal = () => {
    setShowNewCustomer(false);
    setFullCustomerForm(false);
    setShowNewDevice(false);
    setNewCustomer({ fullName: '', companyName: '', customerType: 'individual', phone: '', email: '', address: '', notes: '' });
    setNewDevice({ deviceType: 'laptop', manufacturer: '', model: '', serialNumber: '' });
    setShowModal(true);
  };

  const closeCreateModal = () => {
    setShowNewCustomer(false);
    setShowNewDevice(false);
    setShowModal(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.customerId || !form.deviceId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, autoSendIntake: Number(form.autoSendIntake) })
      });
      if (!res.ok) throw new Error('Failed to create job');
      const created = await res.json();

      // Upload any photos chosen at intake against the new job.
      if (intakePhotos.length > 0 && created?.id) {
        for (const file of intakePhotos) {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('jobId', created.id);
          fd.append('category', 'intake');
          fd.append('phase', 'before');
          await fetch('/api/attachments', { method: 'POST', body: fd });
        }
      }

      setShowModal(false);
      setForm({
        customerId: '', deviceId: '', reportedProblem: '', priority: 'normal',
        accessoriesReceived: '', physicalCondition: '', existingDamage: '', devicePassword: '',
        autoSendIntake: -1,
      });
      setIntakePhotos([]);
      fetchJobs();
    } catch (err) {
      console.error('Failed to create job', err);
      alert('Failed to create job.');
    } finally {
      setSaving(false);
    }
  };

  const setField = (field: keyof typeof form, value: string | number) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const noEnterSubmit = (e: { key: string; preventDefault: () => void }) => {
    if (e.key === 'Enter') e.preventDefault();
  };

  const saveNewCustomer = async () => {
    if (!newCustomer.fullName.trim()) return;
    if (newCustomer.customerType === 'company' && !newCustomer.companyName.trim()) return;
    setInlineSaving(true);
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: newCustomer.fullName.trim(),
          companyName: newCustomer.companyName.trim() || null,
          customerType: newCustomer.customerType,
          phone: newCustomer.phone.trim() || null,
          email: newCustomer.email.trim() || null,
          address: newCustomer.address.trim() || null,
          notes: newCustomer.notes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const created = await res.json();
      setCustomers(prev => [created, ...prev]);
      setForm(prev => ({ ...prev, customerId: created.id, deviceId: '' }));
      setNewCustomer({ fullName: '', companyName: '', customerType: 'individual', phone: '', email: '', address: '', notes: '' });
      setFullCustomerForm(false);
      setShowNewCustomer(false);
      setShowNewDevice(true);
    } catch (err) {
      alert('Failed to create customer.');
    } finally {
      setInlineSaving(false);
    }
  };

  const saveNewDevice = async () => {
    if (!form.customerId || (!newDevice.manufacturer.trim() && !newDevice.model.trim())) return;
    setInlineSaving(true);
    try {
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newDevice, customerId: form.customerId }),
      });
      if (!res.ok) throw new Error('Failed');
      const created = await res.json();
      setDevices(prev => [created, ...prev]);
      setForm(prev => ({ ...prev, deviceId: created.id }));
      setNewDevice({ deviceType: 'laptop', manufacturer: '', model: '', serialNumber: '' });
      setShowNewDevice(false);
    } catch (err) {
      alert('Failed to create device.');
    } finally {
      setInlineSaving(false);
    }
  };

  const updateStatus = async (status: string) => {
    if (!detail) return;
    setAction('Updating status...');
    try {
      const res = await fetch(`/api/jobs/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed');
      refreshDetail(detail.id);
      fetchJobs();
    } catch (err) {
      alert('Failed to update status.');
    } finally {
      setAction('');
    }
  };

  const updateField = async (patch: Record<string, any>) => {
    if (!detail) return;
    setAction('Saving...');
    try {
      const res = await fetch(`/api/jobs/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('Failed');
      refreshDetail(detail.id);
      fetchJobs();
    } catch (err) {
      alert('Failed to save changes.');
    } finally {
      setAction('');
    }
  };

  const addNote = async (e: FormEvent) => {
    e.preventDefault();
    if (!detail || !note.trim()) return;
    setAction('Adding note...');
    try {
      const res = await fetch(`/api/jobs/${detail.id}/timeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType: 'note', description: note.trim() }),
      });
      if (!res.ok) throw new Error('Failed');
      setNote('');
      refreshDetail(detail.id);
    } catch (err) {
      alert('Failed to add note.');
    } finally {
      setAction('');
    }
  };

  const customerDevices = devices.filter(d => d.customerId === form.customerId);
  const selectedCustomer = customers.find(c => c.id === form.customerId);

  const filteredJobs = jobs.filter(j => 
    j.jobNumber.toLowerCase().includes(search.toLowerCase()) || 
    (j.reportedProblem && j.reportedProblem.toLowerCase().includes(search.toLowerCase())) ||
    (j.customerName && j.customerName.toLowerCase().includes(search.toLowerCase())) ||
    (j.deviceSummary && j.deviceSummary.toLowerCase().includes(search.toLowerCase()))
  );

  const detailStep = detail ? WORKFLOW.indexOf(detail.status) : -1;

  return (
    <div className="p-6 h-full flex flex-col relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Repair Jobs</h1>
          <p className="text-sm text-slate-500 mt-1">Manage active repairs, diagnostics, and workflow.</p>
        </div>
        <button onClick={openCreateModal} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-semibold flex items-center gap-2 text-xs transition-colors">
          <Plus size={16} />
          New Job Card
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-0 flex-1">
        <div className="p-4 border-b border-slate-100 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input 
              type="text"
              placeholder="Search by job number, customer, device or problem..."
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
                <th className="px-6 py-3">Job Details</th>
                <th className="px-6 py-3">Dates</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Priority</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">Loading jobs...</td>
                </tr>
              ) : filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Wrench size={32} className="text-slate-300" />
                      <p>No jobs found.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredJobs.map(job => (
                  <tr key={job.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => openDetail(job.id)}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded bg-indigo-50 text-indigo-600 flex items-center justify-center">
                          <Wrench size={20} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{job.jobNumber}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{job.customerName || 'Unknown customer'}</p>
                          <p className="text-xs text-slate-400">{job.deviceSummary || 'Device'}</p>
                          {job.reportedProblem && (
                            <p className="text-xs text-slate-500 mt-0.5 max-w-[200px] truncate" title={job.reportedProblem}>
                              {job.reportedProblem}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 text-[11px] text-slate-600">
                        <span className="flex items-center gap-1.5">
                          <Calendar size={12} className="text-slate-400" />
                          In: {job.dateReceived ? format(new Date(job.dateReceived), 'dd MMM yyyy') : 'N/A'}
                        </span>
                        {job.expectedCompletionDate && (
                          <span className="flex items-center gap-1.5">
                            <Clock size={12} className="text-slate-400" />
                            Due: {format(new Date(job.expectedCompletionDate), 'dd MMM yyyy')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColors[job.status] || 'bg-slate-100 text-slate-700'}`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`capitalize flex items-center gap-1 text-xs font-semibold ${priorityColors[job.priority] || priorityColors.normal}`}>
                        {job.priority === 'urgent' && <AlertCircle size={14} />}
                        {job.priority}
                      </span>
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

      {/* New Job Card Modal */}
      {showModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg flex flex-col max-h-full">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <h2 className="font-bold text-slate-800 text-sm">New Job Card</h2>
              <button onClick={closeCreateModal} className="text-slate-400 hover:text-slate-600 text-sm font-bold">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 flex flex-col flex-1 overflow-y-auto gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Customer *</label>
                  {!showNewCustomer && (
                    <button type="button" onClick={() => setShowNewCustomer(true)} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline">
                      <UserPlus size={12} /> New customer
                    </button>
                  )}
                </div>
                {showNewCustomer ? (
                  <div className="border border-indigo-100 bg-indigo-50/40 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                        <button type="button" onClick={() => setNewCustomer(p => ({ ...p, customerType: 'individual' }))} className={`px-3 py-1 text-[11px] font-semibold transition-colors ${newCustomer.customerType === 'individual' ? 'bg-violet-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                          Individual
                        </button>
                        <button type="button" onClick={() => setNewCustomer(p => ({ ...p, customerType: 'company' }))} className={`px-3 py-1 text-[11px] font-semibold transition-colors ${newCustomer.customerType === 'company' ? 'bg-sky-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                          Company
                        </button>
                      </div>
                      <button type="button" onClick={() => setFullCustomerForm(f => !f)} className="text-[11px] font-bold text-indigo-600 hover:underline">
                        {fullCustomerForm ? 'Quick form' : 'Full details'}
                      </button>
                    </div>
                    {newCustomer.customerType === 'company' && (
                      <input
                        value={newCustomer.companyName}
                        onChange={(e) => setNewCustomer(p => ({ ...p, companyName: e.target.value }))}
                        onKeyDown={noEnterSubmit}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder="Company name *"
                        autoFocus
                      />
                    )}
                    <input
                      value={newCustomer.fullName}
                      onChange={(e) => setNewCustomer(p => ({ ...p, fullName: e.target.value }))}
                      onKeyDown={noEnterSubmit}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                      placeholder={newCustomer.customerType === 'company' ? 'Contact person *' : 'Full name *'}
                      autoFocus={newCustomer.customerType !== 'company'}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        value={newCustomer.phone}
                        onChange={(e) => setNewCustomer(p => ({ ...p, phone: e.target.value }))}
                        onKeyDown={noEnterSubmit}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder="Phone"
                      />
                      <input
                        value={newCustomer.email}
                        onChange={(e) => setNewCustomer(p => ({ ...p, email: e.target.value }))}
                        onKeyDown={noEnterSubmit}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder="Email"
                      />
                    </div>
                    {fullCustomerForm && (
                      <>
                        <input
                          value={newCustomer.address}
                          onChange={(e) => setNewCustomer(p => ({ ...p, address: e.target.value }))}
                          onKeyDown={noEnterSubmit}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                          placeholder="Address"
                        />
                        <textarea
                          value={newCustomer.notes}
                          onChange={(e) => setNewCustomer(p => ({ ...p, notes: e.target.value }))}
                          rows={2}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
                          placeholder="Notes"
                        />
                      </>
                    )}
                    <p className="text-[10px] text-slate-500">Adding a phone or email lets us auto-send the job card to the customer on intake.</p>
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={saveNewCustomer} disabled={inlineSaving || !newCustomer.fullName.trim() || (newCustomer.customerType === 'company' && !newCustomer.companyName.trim())} className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors disabled:opacity-50">
                        {inlineSaving ? 'Creating...' : 'Create customer'}
                      </button>
                      <button type="button" onClick={() => { setShowNewCustomer(false); setFullCustomerForm(false); setNewCustomer({ fullName: '', companyName: '', customerType: 'individual', phone: '', email: '', address: '', notes: '' }); }} className="px-3 py-1.5 rounded text-xs font-semibold text-slate-600 hover:bg-slate-100">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <select
                      required
                      value={form.customerId}
                      onChange={(e) => { setField('customerId', e.target.value); setField('deviceId', ''); }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    >
                      <option value="" disabled>Select customer...</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>{c.fullName}</option>
                      ))}
                    </select>
                    {selectedCustomer && (
                      <p className="text-[10px] font-semibold flex items-center gap-1 mt-1">
                        {selectedCustomer.phone || selectedCustomer.email ? (
                          <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 size={11} /> Registered — {[selectedCustomer.phone, selectedCustomer.email].filter(Boolean).join(' · ')}</span>
                        ) : (
                          <span className="text-amber-600 flex items-center gap-1"><AlertCircle size={11} /> No contact details — intake won't auto-send (add phone/email on the customer)</span>
                        )}
                      </p>
                    )}
                  </>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Device *</label>
                  {form.customerId && !showNewDevice && (
                    <button type="button" onClick={() => setShowNewDevice(true)} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline">
                      <Plus size={12} /> New device
                    </button>
                  )}
                </div>
                {showNewDevice ? (
                  <div className="border border-indigo-100 bg-indigo-50/40 rounded-lg p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={newDevice.deviceType}
                        onChange={(e) => setNewDevice(p => ({ ...p, deviceType: e.target.value }))}
                        className="px-2 py-2 bg-white border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                      >
                        <option value="pc">PC</option>
                        <option value="laptop">Laptop</option>
                        <option value="monitor">Monitor</option>
                        <option value="printer">Printer</option>
                        <option value="console">Console</option>
                        <option value="phone">Phone</option>
                        <option value="tablet">Tablet</option>
                        <option value="powerlead">Power lead</option>
                        <option value="other">Other</option>
                      </select>
                      <input
                        value={newDevice.serialNumber}
                        onChange={(e) => setNewDevice(p => ({ ...p, serialNumber: e.target.value }))}
                        onKeyDown={noEnterSubmit}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder="Serial number"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        value={newDevice.manufacturer}
                        onChange={(e) => setNewDevice(p => ({ ...p, manufacturer: e.target.value }))}
                        onKeyDown={noEnterSubmit}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder="Manufacturer (Dell, Apple...) *"
                        autoFocus
                      />
                      <input
                        value={newDevice.model}
                        onChange={(e) => setNewDevice(p => ({ ...p, model: e.target.value }))}
                        onKeyDown={noEnterSubmit}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder="Model"
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={saveNewDevice} disabled={inlineSaving || !newDevice.manufacturer.trim() && !newDevice.model.trim()} className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors disabled:opacity-50">
                        {inlineSaving ? 'Registering...' : 'Register device'}
                      </button>
                      <button type="button" onClick={() => { setShowNewDevice(false); setNewDevice({ deviceType: 'laptop', manufacturer: '', model: '', serialNumber: '' }); }} className="px-3 py-1.5 rounded text-xs font-semibold text-slate-600 hover:bg-slate-100">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <select
                      required
                      value={form.deviceId}
                      onChange={(e) => setField('deviceId', e.target.value)}
                      disabled={!form.customerId}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm disabled:opacity-50"
                    >
                      <option value="" disabled>{form.customerId ? 'Select device...' : 'Select a customer first'}</option>
                      {customerDevices.map(d => (
                        <option key={d.id} value={d.id}>{d.manufacturer || 'Unknown'} {d.model || 'Device'}</option>
                      ))}
                    </select>
                    {form.customerId && customerDevices.length === 0 && !showNewCustomer && (
                      <p className="text-[10px] text-amber-600 font-semibold">This customer has no devices yet — register one with "New device" above.</p>
                    )}
                  </>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Reported Problem *</label>
                <textarea
                  required
                  value={form.reportedProblem}
                  onChange={(e) => setField('reportedProblem', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm min-h-[60px] resize-none"
                  placeholder="Device won't power on, screen cracked, etc."
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Priority</label>
                <select
                  value={form.priority}
                  onChange={(e) => setField('priority', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Auto-send intake</label>
                <select
                  value={form.autoSendIntake}
                  onChange={(e) => setField('autoSendIntake', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                >
                  <option value={-1}>Follow default (Settings)</option>
                  <option value={1}>Always send job card + files</option>
                  <option value={0}>Don't send on this job</option>
                </select>
                <p className="text-[10px] text-slate-400">Sends the PDF job card, device photos and "send along" docs to the customer on registration.</p>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Intake photos</label>
                <input
                  ref={photoInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => setIntakePhotos(Array.from(e.target.files || []))}
                  className="hidden"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded text-xs font-semibold text-slate-600 transition-colors"
                  >
                    Choose photos...
                  </button>
                  {intakePhotos.length > 0 && (
                    <span className="text-xs text-slate-500">{intakePhotos.length} photo{intakePhotos.length > 1 ? 's' : ''} selected</span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400">Scratches, breakage, condition shots — they go onto the job card PDF and the intake send.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Accessories Received</label>
                  <input
                    value={form.accessoriesReceived}
                    onChange={(e) => setField('accessoriesReceived', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="Charger, cables..."
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Physical Condition</label>
                  <input
                    value={form.physicalCondition}
                    onChange={(e) => setField('physicalCondition', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="Good, fair, poor..."
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Existing Damage</label>
                  <input
                    value={form.existingDamage}
                    onChange={(e) => setField('existingDamage', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="Scratches, cracked screen..."
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Device Password</label>
                  <input
                    value={form.devicePassword}
                    onChange={(e) => setField('devicePassword', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="Only if provided"
                  />
                </div>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="px-4 py-2 rounded text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-semibold text-xs transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Job Card'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Job Detail Modal */}
      {detail && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-3xl flex flex-col max-h-full">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Wrench size={16} className="text-indigo-600" />
                {detail.jobNumber}
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColors[detail.status] || 'bg-slate-100 text-slate-700'}`}>
                  {detail.status}
                </span>
              </h2>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600 text-sm font-bold"><X size={16} /></button>
            </div>

            <div className="p-4 flex flex-col flex-1 overflow-y-auto gap-4">
              <div className="flex flex-wrap gap-4 text-xs">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Customer</p>
                  <p className="font-semibold text-slate-800">{detail.customerName || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Device</p>
                  <p className="font-semibold text-slate-800">{detail.deviceSummary || 'Device'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Received</p>
                  <p className="font-semibold text-slate-800">{detail.dateReceived ? format(new Date(detail.dateReceived), 'dd MMM yyyy HH:mm') : 'N/A'}</p>
                </div>
                {detail.expectedCompletionDate && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Expected Completion</p>
                    <p className="font-semibold text-slate-800 flex items-center gap-1"><Clock size={12} /> {format(new Date(detail.expectedCompletionDate), 'dd MMM yyyy')}</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Priority</p>
                  <span className={`capitalize flex items-center gap-1 text-xs font-semibold ${priorityColors[detail.priority] || priorityColors.normal}`}>
                    {detail.priority === 'urgent' && <AlertCircle size={12} />}
                    {detail.priority}
                  </span>
                </div>
                {detail.trackingCode && (
                  <div className="w-full sm:w-auto">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Customer tracking link</p>
                    <div className="mt-1 flex items-center gap-2">
                      <code className="rounded bg-slate-100 px-2 py-1 text-[11px] font-bold tracking-widest text-indigo-700">{detail.trackingCode}</code>
                      <a
                        href={`${window.location.origin}/track/${detail.trackingCode}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-bold text-indigo-600 hover:underline"
                      >
                        Open
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/track/${detail.trackingCode}`);
                        }}
                        className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline"
                      >
                        <Copy size={11} /> Copy
                      </button>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-400">Sent to the customer on intake — shows live progress.</p>
                  </div>
                )}
              </div>

              {/* Workflow stepper */}
              <div className="border border-slate-200 rounded-lg p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Workflow</p>
                <div className="flex items-center gap-1 overflow-x-auto pb-1">
                  {WORKFLOW.map((step, i) => {
                    const done = detailStep > i;
                    const current = detailStep === i;
                    const isTerminal = detail.status === 'Collected' || detail.status === 'Cancelled' || detail.status === 'Unrepairable' || detail.status === 'Customer Declined Repair';
                    return (
                      <div key={step} className="flex items-center shrink-0">
                        <button
                          onClick={() => !isTerminal && step !== detail.status && updateStatus(step)}
                          disabled={!!action || isTerminal || step === detail.status}
                          className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase transition-colors disabled:cursor-not-allowed
                            ${current ? 'bg-indigo-600 text-white' : done ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                          title={isTerminal ? 'Job is in a terminal state' : `Set status to ${step}`}
                        >
                          {done && <CheckCircle2 size={11} />}
                          {step}
                        </button>
                        {i < WORKFLOW.length - 1 && <ChevronRight size={12} className="text-slate-300 shrink-0" />}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Set status:</label>
                  <select
                    value={detail.status}
                    disabled={!!action}
                    onChange={(e) => updateStatus(e.target.value)}
                    className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs disabled:opacity-50"
                  >
                    {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {action && <span className="text-xs text-slate-500">{action}</span>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Job Card</p>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reported Problem</p>
                      <p className="text-xs text-slate-700 mt-0.5">{detail.reportedProblem || 'None'}</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Accessories Received</p>
                        <p className="text-xs text-slate-700 mt-0.5">{detail.accessoriesReceived || 'None'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Physical Condition</p>
                        <p className="text-xs text-slate-700 mt-0.5">{detail.physicalCondition || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Existing Damage</p>
                        <p className="text-xs text-slate-700 mt-0.5">{detail.existingDamage || 'None'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Device Password</p>
                        <p className="text-xs text-slate-700 mt-0.5">{detail.devicePassword ? 'Provided' : 'Not provided'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><Camera size={12} className="text-indigo-600" /> Photos</p>
                      <label className="cursor-pointer">
                        <input type="file" accept="image/*" onChange={uploadDetailPhoto} className="hidden" />
                        <span className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline">
                          <Plus size={12} /> {attaching ? 'Uploading...' : 'Add photo'}
                        </span>
                      </label>
                    </div>
                    {detailAttachments.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No photos yet. Add condition shots (scratches, breakage) — they go on the job card and intake send.</p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        {detailAttachments.map(a => (
                          <div key={a.id} className="relative group border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                            <a href={`/api/documents/${a.documentId}/download`} target="_blank" rel="noopener noreferrer">
                              <img src={`/api/documents/${a.documentId}/download`} alt={a.name} className="w-full h-20 object-cover" />
                            </a>
                            <button onClick={() => deleteDetailPhoto(a.id)} className="absolute top-1 right-1 w-5 h-5 rounded bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" title="Remove">
                              <X size={12} />
                            </button>
                            <p className="px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-500 truncate">{a.category || 'photo'}{a.phase ? ` · ${a.phase}` : ''}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Diagnosis & Work</p>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Initial Diagnosis</p>
                      <textarea
                        value={fieldValue('initialDiagnosis')}
                        onChange={(e) => setDraftField('initialDiagnosis', e.target.value)}
                        className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs min-h-[60px] resize-none"
                        placeholder="Fault not yet identified..."
                        onBlur={() => saveDraftField('initialDiagnosis')}
                      />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Work Performed</p>
                      <textarea
                        value={fieldValue('workPerformed')}
                        onChange={(e) => setDraftField('workPerformed', e.target.value)}
                        className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs min-h-[60px] resize-none"
                        placeholder="Describe the repairs completed..."
                        onBlur={() => saveDraftField('workPerformed')}
                      />
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Assignment</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Technician</p>
                        <input
                          value={fieldValue('technician')}
                          onChange={(e) => setDraftField('technician', e.target.value)}
                          onBlur={() => saveDraftField('technician')}
                          className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                          placeholder="Unassigned"
                        />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Expected Completion</p>
                        <input
                          type="date"
                          value={fieldValue('expectedCompletionDate') ? format(new Date(fieldValue('expectedCompletionDate')), 'yyyy-MM-dd') : ''}
                          onChange={(e) => setDraftField('expectedCompletionDate', e.target.value ? new Date(e.target.value).toISOString() : '')}
                          onBlur={() => saveDraftField('expectedCompletionDate')}
                          className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Customer-Visible Notes</p>
                      <textarea
                        value={fieldValue('customerVisibleNotes')}
                        onChange={(e) => setDraftField('customerVisibleNotes', e.target.value)}
                        className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs min-h-[50px] resize-none"
                        placeholder="Notes shown to the customer..."
                        onBlur={() => saveDraftField('customerVisibleNotes')}
                      />
                    </div>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><History size={12} className="text-indigo-600" /> Timeline</p>
                  {detail.timeline && detail.timeline.length > 0 ? (
                    <div className="space-y-3">
                      {detail.timeline.map(ev => {
                        const Icon = eventIcons[ev.eventType] || MessageSquare;
                        return (
                          <div key={ev.id} className="flex gap-3">
                            <div className="mt-0.5 w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                              <Icon size={12} />
                            </div>
                            <div>
                              <p className="text-xs text-slate-700">{ev.description}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">{format(new Date(ev.timestamp), 'dd MMM yyyy HH:mm')}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No activity recorded yet.</p>
                  )}

                  <form onSubmit={addNote} className="pt-2 border-t border-slate-100 flex gap-2">
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                      placeholder="Add a note to the timeline..."
                    />
                    <button type="submit" disabled={!!action || !note.trim()} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded font-semibold text-xs transition-colors disabled:opacity-50">
                      Add
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
