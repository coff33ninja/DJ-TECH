import { useState, useEffect, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Headphones, Loader2, CheckCircle2, ArrowRight, MessageCircle, Mail, Database, Info } from 'lucide-react';
import { SettingsSections } from '../components/SettingsSections';

function Brand() {
  return (
    <div className="flex items-center justify-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 font-bold text-white shadow-md">
        <Headphones size={24} />
      </div>
      <div>
        <p className="text-2xl font-bold tracking-tight text-slate-900">DJ TECH</p>
        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Fixing your problems, one service at a time.</p>
      </div>
    </div>
  );
}

const LATER_ITEMS = [
  { icon: MessageCircle, title: 'WhatsApp device pairing', desc: 'Scan the QR code in Settings → WhatsApp Business to receive and reply to customer chats, and let the customer bot answer status / invoice / quote requests.' },
  { icon: Mail, title: 'Email mailbox connection', desc: 'Test and finish IMAP / SMTP / POP3 credentials in Settings → Email, and set your sender signature.' },
  { icon: Database, title: 'Database backups', desc: 'Download backups, import a previous backup, or reset data — all from Settings → Database.' },
];

function LaterList() {
  return (
    <div className="mt-8 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-6">
      <div className="flex items-center gap-2">
        <Info size={16} className="text-indigo-600" />
        <h2 className="text-sm font-bold text-slate-800">What you can set up later</h2>
      </div>
      <p className="mt-1 text-xs text-slate-500 leading-relaxed">
        Everything above can be changed any time in <span className="font-semibold text-slate-700">Settings</span>. These extras are best done after you're in:
      </p>
      <div className="mt-4 flex flex-col gap-4">
        {LATER_ITEMS.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white border border-indigo-100 text-indigo-600">
              <Icon size={15} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">{title}</p>
              <p className="text-[11px] text-slate-500 leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SetupPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([
      fetch('/api/setup-status').then((res) => res.json()),
      fetch('/api/settings').then((res) => res.json()).catch(() => ({})),
    ])
      .then(([status, s]) => {
        setSettings(s || {});
        if (!status?.needsSetup) navigate('/', { replace: true });
      })
      .catch(() => { /* keep setup page reachable if status fails */ })
      .finally(() => setChecking(false));
  }, [navigate]);

  const set = (key: string, value: string) => setSettings((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/setup/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Save failed');
      setDone(true);
      setTimeout(() => navigate('/', { replace: true }), 1200);
    } catch (err: any) {
      setError(err?.message || 'Could not save setup details.');
    } finally {
      setSaving(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-purple-50">
        <Loader2 className="animate-spin text-indigo-600" size={28} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-slate-50 to-purple-50">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-10">
        <Brand />

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="text-emerald-500" size={40} />
              <p className="text-lg font-bold text-slate-900">All set!</p>
              <p className="text-sm text-slate-500">Taking you to the dashboard...</p>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-slate-900">Welcome to DJ TECH</h1>
              <p className="mt-1 text-sm text-slate-500">
                A few details about your business so documents and messages look right.
                <span className="font-semibold text-slate-700"> Business Name, Phone and Email are required</span>;
                everything else can be filled now or later in Settings.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-6">
                <SettingsSections settings={settings} set={set} mode="setup" />

                {error && <p className="text-xs font-semibold text-red-500">{error}</p>}

                <button
                  type="submit"
                  disabled={saving}
                  className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Get started'}
                  {!saving && <ArrowRight size={15} />}
                </button>
              </form>

              <LaterList />
            </>
          )}
        </div>

        <p className="mt-6 text-center text-[10px] text-slate-400">
          <Link to="/track" className="hover:underline">Customer tracking page</Link>
        </p>
      </div>
    </div>
  );
}
