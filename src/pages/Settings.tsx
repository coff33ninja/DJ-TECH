import { useState, useEffect, FormEvent, useRef, ReactNode } from 'react';
import { Percent, Save, MessageCircle, RefreshCw, LogOut, CheckCircle2, AlertCircle, Database, Download, Upload, Trash2 } from 'lucide-react';
import { SettingsSections } from '../components/SettingsSections';

const Section = ({ icon: Icon, title, children }: { icon: any, title: string, children: ReactNode }) => (
  <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
    <div className="flex items-center gap-2 mb-4">
      <Icon size={16} className="text-indigo-600" />
      <h2 className="text-sm font-bold text-slate-800">{title}</h2>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
  </div>
);

export default function Settings() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [testing, setTesting] = useState(false);
  const [mailTest, setMailTest] = useState<{ ok?: boolean; error?: string } | null>(null);

  const [waStatus, setWaStatus] = useState<any>(null);

  const [dbBusy, setDbBusy] = useState(false);
  const [dbMsg, setDbMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => { setSettings(data); setLoading(false); })
      .catch(err => { console.error('Failed to fetch settings', err); setLoading(false); });
  }, []);

  const fetchWaStatus = () => {
    fetch('/api/whatsapp/status')
      .then(res => res.json())
      .then(setWaStatus)
      .catch(() => { /* noop */ });
  };

  useEffect(() => {
    fetchWaStatus();
    const id = setInterval(fetchWaStatus, 4000);
    return () => clearInterval(id);
  }, []);

  const set = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const persistSettings = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      setSettings(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      window.dispatchEvent(new Event('settings-updated'));
      return true;
    } catch (err) {
      console.error('Failed to save settings', err);
      alert('Failed to save settings.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await persistSettings();
  };

  const handleTestMail = async () => {
    const savedOk = await persistSettings();
    if (!savedOk) return;
    setTesting(true);
    setMailTest(null);
    try {
      const res = await fetch('/api/mail/test', { method: 'POST' });
      const data = await res.json();
      setMailTest(data);
    } catch {
      setMailTest({ ok: false, error: 'Could not reach the server.' });
    } finally {
      setTesting(false);
    }
  };

  const handleWaStart = async () => {
    await fetch('/api/whatsapp/start', { method: 'POST' }).catch(() => { /* noop */ });
    setTimeout(fetchWaStatus, 500);
  };

  const handleWaLogout = async () => {
    if (!window.confirm('Log out of WhatsApp on this computer?')) return;
    await fetch('/api/whatsapp/logout', { method: 'POST' }).catch(() => { /* noop */ });
    fetchWaStatus();
  };

  const handleDbBackup = async () => {
    setDbBusy(true);
    setDbMsg(null);
    try {
      const res = await fetch('/api/db/backup');
      if (!res.ok) throw new Error('Backup failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `djtech-backup-${new Date().toISOString().slice(0, 19).replace(/[:]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDbMsg({ ok: true, text: 'Backup downloaded.' });
    } catch (err: any) {
      setDbMsg({ ok: false, text: err?.message || 'Backup failed.' });
    } finally {
      setDbBusy(false);
    }
  };

  const handleDbImportFile = async (file: File) => {
    setDbBusy(true);
    setDbMsg(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/db/import', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({ error: `Server responded with ${res.status} (${res.statusText}). The file may be too large.` }));
      if (!res.ok) throw new Error(data?.error || 'Import failed');
      setDbMsg({ ok: true, text: data?.message || 'Backup restored.' });
    } catch (err: any) {
      setDbMsg({ ok: false, text: err?.message || 'Import failed.' });
      setDbBusy(false);
    }
  };

  const handleDbReset = async () => {
    if (!window.confirm('This deletes ALL customers, jobs, invoices, inventory and other data. Settings are kept. Continue?')) return;
    setDbBusy(true);
    setDbMsg(null);
    try {
      const res = await fetch('/api/db/reset', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Reset failed');
      setDbMsg({ ok: true, text: `Data reset. ${data.total ?? ''} rows cleared.` });
    } catch (err: any) {
      setDbMsg({ ok: false, text: err?.message || 'Reset failed.' });
    } finally {
      setDbBusy(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading settings...</div>;

  return (
    <div className="p-6 h-full flex flex-col overflow-y-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Settings</h1>
          <p className="text-sm text-slate-500 mt-1">Business details, VAT, numbering, mail and messaging.</p>
        </div>
        <button onClick={handleSubmit} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded font-semibold flex items-center gap-2 text-xs transition-colors">
          <Save size={16} />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {saved && (
        <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-2">
          Settings saved successfully.
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6 max-w-3xl pb-6">
        <SettingsSections settings={settings} set={set} mode="settings" onTestMail={handleTestMail} mailTesting={testing} mailTest={mailTest} />
        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-2 rounded font-semibold flex items-center gap-2 text-xs transition-colors">
            <Percent size={16} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>

      <div className="max-w-3xl">
        <Section icon={MessageCircle} title="WhatsApp Business">
          <div className="col-span-1 sm:col-span-2 flex flex-col sm:flex-row gap-6">
            {waStatus?.connected ? (
              <div className="flex flex-col gap-3 flex-1">
                <div className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle2 size={18} />
                  <span className="text-sm font-bold">Connected</span>
                </div>
                <p className="text-xs text-slate-500">Paired as <span className="font-semibold text-slate-800">{waStatus.phone}</span>. Incoming chats and messages appear in the Messages page.</p>
                <button onClick={handleWaLogout} className="self-start flex items-center gap-2 text-xs font-semibold text-red-500 hover:text-red-600 border border-red-200 hover:border-red-300 px-3 py-1.5 rounded">
                  <LogOut size={14} />
                  Log out
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 flex-1">
                {waStatus?.qrDataUrl ? (
                  <>
                    <img src={waStatus.qrDataUrl} alt="WhatsApp QR code" className="w-48 h-48 rounded-lg border border-slate-200" />
                    <p className="text-xs text-slate-500 text-center leading-relaxed">
                      Scan with WhatsApp on your phone:<br />
                      <span className="font-semibold text-slate-700">Menu → Linked devices → Link a device</span>
                    </p>
                    <p className="text-[11px] text-amber-600">QR codes expire every ~20 seconds. This one refreshes automatically.</p>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-4">
                    <p className="text-xs text-slate-500">{waStatus?.connecting || waStatus?.lastError ? (waStatus.lastError || 'Connecting to WhatsApp...') : 'Not connected.'}</p>
                    <button onClick={handleWaStart} className="flex items-center gap-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded">
                      <RefreshCw size={14} />
                      Start session / Show QR
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </Section>
      </div>

      <div className="max-w-3xl">
        <Section icon={Database} title="Database">
          <div className="col-span-1 sm:col-span-2 flex flex-col gap-4">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Backup downloads the entire database (customers, jobs, invoices, settings, WhatsApp chat history) as a JSON file.
              Import replaces the database from a backup: the server stages the file and restarts, then restores on boot.
              Reset clears all business data but keeps your settings.
            </p>

            {dbMsg && (
              <div className={`rounded-lg border px-4 py-2 text-xs font-semibold flex items-center gap-2 ${dbMsg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
                {dbMsg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                {dbMsg.text}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleDbBackup}
                disabled={dbBusy}
                className="flex items-center gap-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-4 py-2 rounded transition-colors"
              >
                <Download size={14} /> Download backup
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={dbBusy}
                className="flex items-center gap-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 px-4 py-2 rounded transition-colors"
              >
                <Upload size={14} /> Import backup
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleDbImportFile(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={handleDbReset}
                disabled={dbBusy}
                className="flex items-center gap-2 text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 px-4 py-2 rounded transition-colors"
              >
                <Trash2 size={14} /> Reset data
              </button>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
