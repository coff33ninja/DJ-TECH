import React, { useState, useEffect } from 'react';
import { File, FileText, Image, Search, Upload, Loader, AlertCircle, Trash2, Download, Paperclip, X, Camera, FolderOpen, Users } from 'lucide-react';

interface Doc {
  id: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  sendAlong: number | null;
  createdAt: string | Date | null;
}

interface JobBrief {
  id: string;
  jobNumber: string;
  customerName: string;
  deviceSummary: string;
}

interface Attachment {
  id: string;
  jobId: string;
  jobNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  deviceId: string | null;
  deviceSummary: string | null;
  documentId: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  category: string | null;
  phase: string | null;
  capturedAt: string | Date | null;
  note: string | null;
  createdAt: string | Date | null;
}

const CATEGORIES = [
  { value: 'intake', label: 'Intake' },
  { value: 'before', label: 'Before' },
  { value: 'after', label: 'After' },
  { value: 'scratch', label: 'Scratch' },
  { value: 'breakage', label: 'Breakage' },
  { value: 'repair', label: 'Repair' },
  { value: 'document', label: 'Document' },
  { value: 'other', label: 'Other' },
];

const categoryLabel = (c: string | null | undefined) =>
  CATEGORIES.find(x => x.value === c)?.label || 'Photo';

const isImage = (mime: string | null) => (mime || '').toLowerCase().startsWith('image/');

const formatSize = (bytes: number | null) => {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function Documents() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [jobs, setJobs] = useState<JobBrief[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<'all' | 'jobs' | 'customers'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  const [showUpload, setShowUpload] = useState(false);
  const [uploadMode, setUploadMode] = useState<'job' | 'global'>('job');
  const [uploadJobId, setUploadJobId] = useState('');
  const [uploadCategory, setUploadCategory] = useState('intake');
  const [uploadPhase, setUploadPhase] = useState<'before' | 'after' | ''>('before');
  const [uploadNote, setUploadNote] = useState('');
  const [uploadDate, setUploadDate] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, a] = await Promise.all([
        fetch('/api/documents').then(r => { if (!r.ok) throw new Error('documents'); return r.json(); }),
        fetch('/api/attachments').then(r => { if (!r.ok) throw new Error('attachments'); return r.json(); }),
      ]);
      setDocs(d);
      setAttachments(a);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    fetch('/api/jobs')
      .then(r => r.json())
      .then((data: JobBrief[]) => setJobs(data))
      .catch(() => setJobs([]));
  }, []);

  const openUpload = () => {
    setUploadMode('job');
    setUploadJobId(jobs[0]?.id || '');
    setUploadCategory('intake');
    setUploadPhase('before');
    setUploadNote('');
    setUploadDate('');
    setUploadFile(null);
    setShowUpload(true);
  };

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadFile(e.target.files?.[0] || null);
  };

  const submitUpload = async () => {
    if (!uploadFile) return;
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', uploadFile);
      if (uploadMode === 'job') {
        if (!uploadJobId) throw new Error('Choose a job');
        form.append('jobId', uploadJobId);
        form.append('category', uploadCategory);
        if (uploadPhase) form.append('phase', uploadPhase);
        if (uploadNote) form.append('note', uploadNote);
        if (uploadDate) form.append('capturedAt', String(new Date(uploadDate).getTime()));
        const res = await fetch('/api/attachments', { method: 'POST', body: form });
        if (!res.ok) throw new Error('Upload failed');
      } else {
        const res = await fetch('/api/documents', { method: 'POST', body: form });
        if (!res.ok) throw new Error('Upload failed');
      }
      setShowUpload(false);
      await fetchAll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleSendAlong = async (doc: Doc) => {
    const next = !doc.sendAlong;
    setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, sendAlong: next ? 1 : 0 } : d));
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sendAlong: next }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, sendAlong: doc.sendAlong } : d));
    }
  };

  const handleDeleteDoc = async (doc: Doc) => {
    if (!confirm(`Delete "${doc.name}"?`)) return;
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      setDocs(prev => prev.filter(d => d.id !== doc.id));
    } catch (err: any) {
      alert('Failed to delete: ' + err.message);
    }
  };

  const handleDeleteAtt = async (att: Attachment) => {
    if (!confirm(`Delete "${att.name}" from job ${att.jobNumber}?`)) return;
    try {
      const res = await fetch(`/api/attachments/${att.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      setAttachments(prev => prev.filter(a => a.id !== att.id));
    } catch (err: any) {
      alert('Failed to delete: ' + err.message);
    }
  };

  const matchesSearch = (name: string, extra: string) => {
    const q = searchQuery.toLowerCase();
    return !q || name.toLowerCase().includes(q) || extra.toLowerCase().includes(q);
  };

  const matchesCategory = (c: string | null | undefined) =>
    !categoryFilter || (c || 'photo') === categoryFilter;

  const filteredAtts = attachments.filter(a =>
    matchesSearch(a.name, `${a.jobNumber || ''} ${a.customerName || ''} ${a.deviceSummary || ''}`) &&
    matchesCategory(a.category));

  const filteredDocs = docs.filter(d =>
    matchesSearch(d.name, '') && (categoryFilter === '' || categoryFilter === 'document'));

  const sendAlongCount = docs.filter(d => d.sendAlong).length;
  const photoCount = attachments.length;

  const Thumb = ({ mime, url, name }: { mime: string | null; url: string; name: string }) => (
    <div className="flex items-center gap-3">
      {isImage(mime) ? (
        <img src={url} alt={name} className="w-11 h-11 object-cover rounded-md border border-slate-200 bg-slate-50" />
      ) : (
        <span className="w-11 h-11 flex items-center justify-center rounded-md border border-slate-200 bg-slate-50">
          {(mime || '').includes('pdf') ? <FileText size={18} className="text-blue-500" /> : <File size={18} className="text-slate-400" />}
        </span>
      )}
      <span className="font-semibold text-slate-900 truncate max-w-[240px] text-[13px]" title={name}>{name}</span>
    </div>
  );

  const groupedByJob: Record<string, Attachment[]> = {};
  for (const a of filteredAtts) (groupedByJob[a.jobId] = groupedByJob[a.jobId] || []).push(a);

  const groupedByCustomer: Record<string, Attachment[]> = {};
  for (const a of filteredAtts) (groupedByCustomer[a.customerId || 'unknown'] = groupedByCustomer[a.customerId || 'unknown'] || []).push(a);

  const emptyState = loading ? (
    <div className="flex justify-center items-center h-40">
      <Loader className="animate-spin text-indigo-600" size={24} />
    </div>
  ) : error ? (
    <div className="p-6 text-center text-red-500 flex flex-col items-center gap-2">
      <AlertCircle size={24} />
      <p className="text-sm">{error}</p>
    </div>
  ) : (
    <div className="p-10 text-center text-slate-500">
      <Camera size={28} className="mx-auto mb-2 text-slate-300" />
      <p className="text-sm">No files match. Upload device photos (scratches, breakage, repairs) against a job.</p>
    </div>
  );

  return (
    <div className="p-6 h-full flex flex-col relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Documents</h1>
          <p className="text-sm text-slate-500 mt-1">
            Server-hosted files, categorized per <span className="font-semibold">job / customer / device</span>. Photos go onto the job card and auto-sends.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openUpload} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-semibold flex items-center gap-2 text-xs transition-colors">
            <Upload size={16} />
            Upload
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-0 flex-1">
        <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button onClick={() => setView('all')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${view === 'all' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}>
              <FolderOpen size={14} /> All files
            </button>
            <button onClick={() => setView('jobs')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${view === 'jobs' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}>
              <Camera size={14} /> By job
            </button>
            <button onClick={() => setView('customers')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${view === 'customers' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}>
              <Users size={14} /> By customer
            </button>
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search files, jobs, customers..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button onClick={fetchAll} className="text-xs text-indigo-600 font-semibold hover:underline px-2">Refresh</button>
        </div>

        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-100 overflow-x-auto">
          <button onClick={() => setCategoryFilter('')} className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors ${categoryFilter === '' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>All</button>
          {CATEGORIES.map(c => (
            <button key={c.value} onClick={() => setCategoryFilter(categoryFilter === c.value ? '' : c.value)} className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors ${categoryFilter === c.value ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}>{c.label}</button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 bg-indigo-50/60 border-b border-indigo-100 text-xs text-indigo-700">
          <span className="flex items-center gap-1"><Paperclip size={13} /> {sendAlongCount} global doc{sendAlongCount === 1 ? '' : 's'} send-along</span>
          <span className="flex items-center gap-1"><Camera size={13} /> {photoCount} job photo{photoCount === 1 ? '' : 's'}</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {view === 'all' && (
            <>
              {loading || error ? emptyState : (filteredAtts.length === 0 && filteredDocs.length === 0) ? emptyState : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Job</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Device</th>
                      <th className="px-4 py-3">Size</th>
                      <th className="px-4 py-3">Send along</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAtts.map(a => (
                      <tr key={a.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-4 py-3">
                          <Thumb mime={a.mimeType} url={`/api/documents/${a.documentId}/download`} name={a.name} />
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">{categoryLabel(a.category)}</span>
                          {a.phase && <span className={`ml-1 inline-block text-[11px] font-bold px-2 py-0.5 rounded-full ${a.phase === 'after' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>{a.phase}</span>}
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-800 whitespace-nowrap">{a.jobNumber || '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{a.customerName || '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{a.deviceSummary || '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{formatSize(a.size)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <a href={`/api/documents/${a.documentId}/download`} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-bold text-xs transition-colors flex items-center gap-1">
                              <Download size={14} /> Open
                            </a>
                            <button onClick={() => handleDeleteAtt(a)} className="text-slate-400 hover:text-red-500 transition-colors" title="Delete">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredDocs.map(d => (
                      <tr key={d.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-4 py-3">
                          <Thumb mime={d.mimeType} url={`/api/documents/${d.id}/download`} name={d.name} />
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">Global</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">—</td>
                        <td className="px-4 py-3 text-xs text-slate-600">—</td>
                        <td className="px-4 py-3 text-xs text-slate-500">—</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{formatSize(d.size)}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => toggleSendAlong(d)} role="switch" aria-checked={!!d.sendAlong} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${d.sendAlong ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${d.sendAlong ? 'translate-x-[18px]' : 'translate-x-1'}`} />
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <a href={`/api/documents/${d.id}/download`} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-bold text-xs transition-colors flex items-center gap-1">
                              <Download size={14} /> Open
                            </a>
                            <button onClick={() => handleDeleteDoc(d)} className="text-slate-400 hover:text-red-500 transition-colors" title="Delete">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {view === 'jobs' && (
            loading || error ? emptyState : Object.keys(groupedByJob).length === 0 ? emptyState : (
              <div className="divide-y divide-slate-100">
                {Object.entries(groupedByJob).map(([jobId, atts]) => {
                  const a0 = atts[0];
                  return (
                    <div key={jobId} className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Camera size={15} className="text-indigo-600" />
                        <span className="text-sm font-bold text-slate-900">{a0.jobNumber || 'Job'}</span>
                        <span className="text-xs text-slate-500">{a0.customerName} · {a0.deviceSummary}</span>
                        <span className="text-[11px] text-slate-400 ml-auto">{atts.length} file{atts.length > 1 ? 's' : ''}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {atts.map(a => (
                          <div key={a.id} className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50 group">
                            <div className="aspect-video bg-slate-100 flex items-center justify-center overflow-hidden">
                              {isImage(a.mimeType) ? (
                                <img src={`/api/documents/${a.documentId}/download`} alt={a.name} className="w-full h-full object-cover" />
                              ) : (
                                <FileText size={24} className="text-blue-500" />
                              )}
                            </div>
                            <div className="p-2.5">
                              <p className="text-[11px] font-semibold text-slate-800 truncate" title={a.name}>{a.name}</p>
                              <div className="flex items-center gap-1 mt-1">
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">{categoryLabel(a.category)}</span>
                                {a.phase && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${a.phase === 'after' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{a.phase}</span>}
                              </div>
                              <div className="flex items-center justify-end gap-2 mt-1.5">
                                <a href={`/api/documents/${a.documentId}/download`} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline text-[11px] font-bold">Open</a>
                                <button onClick={() => handleDeleteAtt(a)} className="text-slate-400 hover:text-red-500" title="Delete"><Trash2 size={14} /></button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {view === 'customers' && (
            loading || error ? emptyState : Object.keys(groupedByCustomer).length === 0 ? emptyState : (
              <div className="divide-y divide-slate-100">
                {Object.entries(groupedByCustomer).map(([customerId, atts]) => {
                  const a0 = atts[0];
                  return (
                    <div key={customerId} className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Users size={15} className="text-indigo-600" />
                        <span className="text-sm font-bold text-slate-900">{a0.customerName || 'Unknown customer'}</span>
                        <span className="text-[11px] text-slate-400 ml-auto">{atts.length} file{atts.length > 1 ? 's' : ''}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {atts.map(a => (
                          <div key={a.id} className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50 group">
                            <div className="aspect-video bg-slate-100 flex items-center justify-center overflow-hidden">
                              {isImage(a.mimeType) ? (
                                <img src={`/api/documents/${a.documentId}/download`} alt={a.name} className="w-full h-full object-cover" />
                              ) : (
                                <FileText size={24} className="text-blue-500" />
                              )}
                            </div>
                            <div className="p-2.5">
                              <p className="text-[11px] font-semibold text-slate-800 truncate" title={a.name}>{a.name}</p>
                              <p className="text-[10px] text-slate-500 truncate">{a.jobNumber} · {a.deviceSummary}</p>
                              <div className="flex items-center gap-1 mt-1">
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">{categoryLabel(a.category)}</span>
                                {a.phase && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${a.phase === 'after' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{a.phase}</span>}
                              </div>
                              <div className="flex items-center justify-end gap-2 mt-1.5">
                                <a href={`/api/documents/${a.documentId}/download`} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline text-[11px] font-bold">Open</a>
                                <button onClick={() => handleDeleteAtt(a)} className="text-slate-400 hover:text-red-500" title="Delete"><Trash2 size={14} /></button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>

      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-900">Upload file</h2>
              <button onClick={() => setShowUpload(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 mb-4">
              <button onClick={() => setUploadMode('job')} className={`flex-1 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${uploadMode === 'job' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500'}`}>Job photo / file</button>
              <button onClick={() => setUploadMode('global')} className={`flex-1 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${uploadMode === 'global' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500'}`}>Global document</button>
            </div>

            {uploadMode === 'job' && (
              <div className="space-y-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Job</label>
                  <select value={uploadJobId} onChange={(e) => setUploadJobId(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm">
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.jobNumber} · {j.customerName} · {j.deviceSummary}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Category</label>
                    <select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm">
                      {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Phase</label>
                    <select value={uploadPhase} onChange={(e) => setUploadPhase(e.target.value as any)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm">
                      <option value="before">Before</option>
                      <option value="after">After</option>
                      <option value="">None</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Captured on</label>
                    <input type="date" value={uploadDate} onChange={(e) => setUploadDate(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Note</label>
                    <input type="text" value={uploadNote} onChange={(e) => setUploadNote(e.target.value)} placeholder="e.g. cracked screen" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                  </div>
                </div>
              </div>
            )}

            {uploadMode === 'global' && (
              <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                Global documents are not tied to a job. Toggle <span className="font-semibold">Send along</span> on the list to attach them to job intake and future invoice/quote sends.
              </p>
            )}

            <input type="file" ref={fileInputRef} onChange={pickFile} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="w-full border-2 border-dashed border-slate-300 rounded-lg px-4 py-5 text-center text-xs text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors">
              {uploadFile ? <span className="font-semibold text-slate-800">{uploadFile.name} ({formatSize(uploadFile.size)})</span> : 'Click to choose a file'}
            </button>

            {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowUpload(false)} className="px-4 py-2 rounded text-xs font-semibold text-slate-500 hover:bg-slate-100">Cancel</button>
              <button onClick={submitUpload} disabled={!uploadFile || saving} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded font-semibold text-xs flex items-center gap-2">
                <Upload size={14} />
                {saving ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
