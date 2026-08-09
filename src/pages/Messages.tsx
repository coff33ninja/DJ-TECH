import React, { useState, useEffect, useCallback } from 'react';
import { Mail, Send, Inbox, Loader, AlertCircle, MessageCircle, RefreshCw, Reply, Users, X, UserPlus, Signature, Folder, Truck, Bot, ChevronDown } from 'lucide-react';

type View =
  | { type: 'email'; folder: 'inbox' | 'sent' }
  | { type: 'whatsapp'; chatId: string }
  | { type: 'contact'; customerId: string }
  | { type: 'category'; category: 'customer' | 'supplier'; categoryId: string | null };

type Compose =
  | { mode: 'email'; to: string; toName: string; subject: string; body: string; useSignature: boolean; signatureRole: string }
  | { mode: 'whatsapp'; to: string; body: string; useSignature: boolean; signatureRole: string }
  | null;

const SIGNATURE_ROLES = ['technician', 'sales', 'admin', 'support'];

const displayRole = (role: string) => {
  switch (role) {
    case 'sales': return 'Sales Representative';
    case 'admin': return 'Administrator';
    case 'support': return 'Support';
    default: return 'Technician';
  }
};

const fmtTime = (ts: number | string | Date | null | undefined): string => {
  if (!ts) return '';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts as any);
  if (isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
};

const fmtDate = (ts: number | string | Date | null | undefined): string => {
  if (!ts) return '';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts as any);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const snippetOf = (msg: any): string => {
  const text = (msg.bodyText || msg.content || '').trim();
  return text.split('\n')[0] || msg.subject || '(No preview)';
};

// Format a phone/JID base as a readable SA number: 27821234567 -> "082 123 4567".
const fmtPhone = (p: string): string => {
  const digits = (p || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('27')) return `0${digits.slice(2, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return digits;
};

const jidPhone = (jid: string): string => (jid || '').split('@')[0] || '';

// Resolve a WhatsApp chat to its best human-readable label. Never exposes the
// raw JID: linked customer/supplier name > WhatsApp nickname > formatted phone.
const waChatLabel = (chat: any): string =>
  chat?.categoryLabel || chat?.contactName || fmtPhone(chat?.contactPhone || jidPhone(chat?.id)) || 'Unknown contact';

export default function Messages() {
  const [view, setView] = useState<View>({ type: 'email', folder: 'inbox' });
  const [mailConfig, setMailConfig] = useState<any>(null);
  const [mailInbox, setMailInbox] = useState<any[]>([]);
  const [mailSent, setMailSent] = useState<any[]>([]);
  const [selectedMail, setSelectedMail] = useState<any>(null);
  const [waStatus, setWaStatus] = useState<any>(null);
  const [waChats, setWaChats] = useState<any[]>([]);
  const [waMessages, setWaMessages] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [customerModal, setCustomerModal] = useState<{ chatId: string; name: string; phone: string; email: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [compose, setCompose] = useState<Compose>(null);
  const [sending, setSending] = useState(false);
  const [waDraft, setWaDraft] = useState('');
  const [waSignatureOn, setWaSignatureOn] = useState(true);
  const [waSignatureRole, setWaSignatureRole] = useState('technician');
  const [requests, setRequests] = useState<any[]>([]);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [requestsPage, setRequestsPage] = useState(1);
  const [requestsTotal, setRequestsTotal] = useState(0);
  const [requestsShowArchived, setRequestsShowArchived] = useState(false);

  // Preview + reply popout (mail or WhatsApp)
  const [popout, setPopout] = useState<{ kind: 'mail'; msg: any } | { kind: 'whatsapp'; chatId: string } | null>(null);
  const [popoutDraft, setPopoutDraft] = useState('');
  const [popoutRole, setPopoutRole] = useState('technician');
  const [popoutSending, setPopoutSending] = useState(false);

  const mailList = view.type === 'email' && view.folder === 'sent' ? mailSent : mailInbox;

  // Resolve a WhatsApp chat to its display name + subtitle. When the chat is
  // linked to a customer/supplier, show ONLY the client's name and put the
  // company/phone/email in the subtitle (never expose the raw JID or number).
  const waChatDetails = (chat: any): { name: string; sub: string } => {
    if (!chat) return { name: 'Unknown contact', sub: '' };
    if (chat.category === 'customer' && chat.categoryId) {
      const cust = customers.find(c => c.id === chat.categoryId || c.id === chat.customerId);
      if (cust) {
        const sub = [cust.companyName, cust.phone, cust.email].filter(Boolean).join(' · ');
        return { name: cust.fullName, sub };
      }
    }
    if (chat.category === 'supplier' && chat.categoryId) {
      const sup = suppliers.find(s => s.id === chat.categoryId);
      if (sup) {
        const sub = [sup.contactPerson && sup.contactPerson !== sup.name ? `${sup.name} (${sup.contactPerson})` : sup.name, sup.phone, sup.email].filter(Boolean).join(' · ');
        return { name: sup.name, sub };
      }
    }
    const phone = fmtPhone(chat.contactPhone || jidPhone(chat.id));
    return { name: chat.contactName || phone || 'Unknown contact', sub: chat.contactName && phone ? phone : '' };
  };

  // Same idea for mail: matched senders show the client name only, with the
  // raw address in the subtitle line.
  const mailDetails = (msg: any): { name: string; sub: string } => {
    const raw = msg.folder === 'sent' ? (msg.toName || msg.toEmail) : (msg.fromName || msg.fromEmail);
    if (msg.categoryLabel) {
      const addr = msg.folder === 'sent' ? msg.toEmail : msg.fromEmail;
      return { name: msg.categoryLabel, sub: addr && addr !== raw ? `${raw} · ${addr}` : raw || '' };
    }
    return { name: raw, sub: '' };
  };

  const fetchMailConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/mail/config');
      setMailConfig(await res.json());
    } catch { /* noop */ }
  }, []);

  const fetchMailFolder = useCallback(async (folder: 'inbox' | 'sent') => {
    try {
      const res = await fetch(`/api/mail/messages?folder=${folder}`);
      const data = await res.json();
      if (folder === 'sent') setMailSent(data); else setMailInbox(data);
    } catch { /* noop */ }
  }, []);

  const fetchWaStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      setWaStatus(await res.json());
    } catch { /* noop */ }
  }, []);

  const fetchWaChats = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/chats');
      setWaChats(await res.json());
    } catch { /* noop */ }
  }, []);

  const fetchWaMessages = useCallback(async (chatId: string) => {
    try {
      const res = await fetch(`/api/whatsapp/chats/${encodeURIComponent(chatId)}/messages`);
      setWaMessages(await res.json());
    } catch { /* noop */ }
  }, []);

  const fetchCustomers = useCallback(async () => {
    try {
      const res = await fetch('/api/customers');
      setCustomers(await res.json());
    } catch { /* noop */ }
  }, []);

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await fetch('/api/suppliers');
      setSuppliers(await res.json());
    } catch { /* noop */ }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      setSettings(await res.json());
    } catch { /* noop */ }
  }, []);

  const fetchRequests = useCallback(async (page = 1, showArchived = false) => {
    try {
      const res = await fetch(`/api/customer-requests?page=${page}&pageSize=20&includeArchived=${showArchived ? '1' : '0'}`);
      const data = await res.json();
      if (data && Array.isArray(data.rows)) {
        setRequests(data.rows);
        setRequestsTotal(data.total || 0);
        setRequestsPage(data.page || 1);
      } else {
        setRequests([]);
        setRequestsTotal(0);
      }
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    void fetchMailConfig();
    void fetchMailFolder('inbox');
    void fetchMailFolder('sent');
    void fetchWaStatus();
    void fetchWaChats();
    void fetchCustomers();
    void fetchSuppliers();
    void fetchSettings();
    void fetchRequests(1, false);
  }, [fetchMailConfig, fetchMailFolder, fetchWaStatus, fetchWaChats, fetchCustomers, fetchSuppliers, fetchSettings, fetchRequests]);

  useEffect(() => {
    const waTimer = setInterval(() => { void fetchWaStatus(); }, 4000);
    const chatTimer = setInterval(() => { void fetchWaChats(); }, 5000);
    const reqTimer = setInterval(() => { if (requestsOpen) void fetchRequests(requestsPage, requestsShowArchived); }, 10000);
    const mailTimer = setInterval(() => { void fetchMailFolder('inbox'); }, 30000);
    return () => { clearInterval(waTimer); clearInterval(chatTimer); clearInterval(reqTimer); clearInterval(mailTimer); };
  }, [fetchWaStatus, fetchWaChats, fetchRequests, fetchMailFolder, requestsOpen, requestsPage, requestsShowArchived]);

  const toggleRequestArchived = async (r: any) => {
    try {
      await fetch(`/api/customer-requests/${r.id}/${r.archived ? 'unarchive' : 'archive'}`, { method: 'POST' });
      await fetchRequests(requestsPage, requestsShowArchived);
    } catch { /* noop */ }
  };

  useEffect(() => {
    if (view.type === 'whatsapp') {
      void fetchWaMessages(view.chatId);
      void fetch('/api/whatsapp/chats/' + encodeURIComponent(view.chatId) + '/read', { method: 'POST' }).then(() => fetchWaChats()).catch(() => { /* noop */ });
    }
  }, [view, fetchWaMessages, fetchWaChats]);

  useEffect(() => {
    if (view.type === 'whatsapp') {
      const timer = setInterval(() => { void fetchWaMessages(view.chatId); }, 5000);
      return () => clearInterval(timer);
    }
  }, [view, fetchWaMessages]);

  const switchMailFolder = (folder: 'inbox' | 'sent') => {
    setView({ type: 'email', folder });
    setSelectedMail(null);
    void fetchMailFolder(folder);
  };

  const openMailMessage = (msg: any) => {
    setSelectedMail(msg);
    setPopout({ kind: 'mail', msg });
    if (msg.folder === 'inbox' && !msg.read) {
      void fetch(`/api/mail/messages/${msg.id}/read`, { method: 'PATCH' }).then(() => {
        setMailInbox(prev => prev.map(m => m.id === msg.id ? { ...m, read: 1 } : m));
      }).catch(() => { /* noop */ });
    }
  };

  const openChat = (chatId: string) => {
    setView({ type: 'whatsapp', chatId });
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch('/api/mail/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      await fetchMailFolder('inbox');
      await fetchMailFolder('sent');
      await fetchWaChats();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleClassify = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch('/api/classify', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Classification failed');
      await fetchMailFolder('inbox');
      await fetchWaChats();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const openComposeEmail = (prefill?: { to?: string; toName?: string; subject?: string; body?: string }) => {
    setCompose({
      mode: 'email',
      to: prefill?.to || '',
      toName: prefill?.toName || '',
      subject: prefill?.subject || '',
      body: prefill?.body || '',
      useSignature: true,
      signatureRole: settings.signature_role || 'technician',
    });
  };

  const openComposeWhatsApp = (to?: string) => {
    setCompose({
      mode: 'whatsapp',
      to: to || '',
      body: '',
      useSignature: true,
      signatureRole: settings.signature_role || 'technician',
    });
  };

  const buildSignature = (role: string): string => {
    const s = settings;
    const name = s.signature_name || s.business_name || '';
    const lines: string[] = [];
    if (name) lines.push(name);
    lines.push(displayRole(role));
    if (s.business_phone) lines.push(s.business_phone);
    if (s.business_email) lines.push(s.business_email);
    if (s.business_address) lines.push(s.business_address);
    return lines.join('\n');
  };

  const emailHtmlWithSignature = (body: string, role: string): string => {
    const sig = buildSignature(role);
    const html = body.split('\n').map(l => `<p>${l}</p>`).join('');
    if (!sig) return html;
    return `${html}<br/><p>${sig.split('\n').map(l => l.trim() ? `<span style="display:block">${l}</span>` : '<span>&nbsp;</span>').join('')}</p>`;
  };

  // Shared send helpers (compose modal, popout, inline WA composer)
  const sendEmailNow = async (opts: { to: string; toName?: string; subject: string; body: string; useSignature: boolean; role: string }): Promise<boolean> => {
    try {
      const body = opts.useSignature ? `${opts.body}\n\n--\n${buildSignature(opts.role)}` : opts.body;
      const res = await fetch('/api/mail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: opts.to,
          toName: opts.toName,
          subject: opts.subject,
          text: body,
          html: opts.useSignature ? emailHtmlWithSignature(opts.body, opts.role) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send email');
      void fetchMailFolder('sent');
      return true;
    } catch (err: any) {
      alert(err.message);
      return false;
    }
  };

  const sendWaNow = async (to: string, text: string, useSignature: boolean, role: string): Promise<boolean> => {
    try {
      const message = useSignature ? `${text}\n\n--\n${buildSignature(role)}` : text;
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send message');
      void fetchWaChats();
      return true;
    } catch (err: any) {
      alert(err.message);
      return false;
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compose) return;
    setSending(true);
    try {
      if (compose.mode === 'email') {
        const ok = await sendEmailNow({ to: compose.to, toName: compose.toName, subject: compose.subject, body: compose.body, useSignature: compose.useSignature, role: compose.signatureRole });
        if (ok) setCompose(null);
      } else {
        const jid = compose.to.includes('@') ? compose.to : `${compose.to.replace(/\D/g, '')}@s.whatsapp.net`;
        const ok = await sendWaNow(compose.to, compose.body, compose.useSignature, compose.signatureRole);
        if (ok) {
          setCompose(null);
          setView({ type: 'whatsapp', chatId: jid });
          void fetchWaMessages(jid);
        }
      }
    } finally {
      setSending(false);
    }
  };

  const sendPopoutReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!popout || !popoutDraft.trim()) return;
    setPopoutSending(true);
    try {
      if (popout.kind === 'mail') {
        const msg = popout.msg;
        const to = msg.folder === 'sent' ? msg.toEmail : msg.fromEmail;
        const toName = msg.folder === 'sent' ? msg.toName : msg.fromName;
        const subject = msg.subject?.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`;
        const ok = await sendEmailNow({ to, toName, subject, body: popoutDraft, useSignature: true, role: popoutRole });
        if (ok) setPopoutDraft('');
      } else {
        const ok = await sendWaNow(popout.chatId, popoutDraft, true, popoutRole);
        if (ok) {
          setPopoutDraft('');
          void fetchWaMessages(popout.chatId);
          void fetchWaChats();
        }
      }
    } finally {
      setPopoutSending(false);
    }
  };

  const activeContact = view.type === 'contact' ? customers.find(c => c.id === view.customerId) : null;
  const inboxUnread = mailInbox.filter(m => !m.read).length;
  const waUnread = waChats.reduce((n, c) => n + (c.unread || 0), 0);

  // ---- Smart folder helpers ----
  const mailForCat = (category: 'customer' | 'supplier', categoryId: string | null) =>
    mailInbox.filter(m => m.category === category && (categoryId == null || m.categoryId === categoryId));
  const chatsForCat = (category: 'customer' | 'supplier', categoryId: string | null) =>
    waChats.filter(c => c.category === category && (categoryId == null || c.categoryId === categoryId));

  const catItems = (category: 'customer' | 'supplier', categoryId: string | null) => {
    const mail = mailForCat(category, categoryId);
    const chats = chatsForCat(category, categoryId);
    const items = [
      ...mail.map(m => { const d = mailDetails(m); return { kind: 'mail' as const, key: m.id, ts: m.date, unread: m.read ? 0 : 1, label: d.name, subj: d.sub || m.subject, preview: snippetOf(m), msg: m }; }),
      ...chats.map(c => { const d = waChatDetails(c); return { kind: 'wa' as const, key: c.id, ts: c.lastMessageAt, unread: c.unread || 0, label: d.name, subj: d.sub, preview: c.lastMessagePreview || '(WhatsApp)', msg: c }; }),
    ];
    return items.sort((a, b) => ((b.ts as any) || 0) - ((a.ts as any) || 0));
  };

  const catContactsWithItems = (category: 'customer' | 'supplier') => {
    const contacts = category === 'customer' ? customers : suppliers;
    const withItems = contacts.filter(c => {
      const mail = mailForCat(category, c.id);
      const chats = chatsForCat(category, c.id);
      return mail.length > 0 || chats.length > 0;
    });
    return withItems.sort((a, b) => (a.fullName || a.name || '').localeCompare(b.fullName || b.name || ''));
  };

  const catUnread = (category: 'customer' | 'supplier', categoryId: string | null) => {
    const mail = mailForCat(category, categoryId);
    const chats = chatsForCat(category, categoryId);
    return mail.filter(m => !m.read).length + chats.reduce((n, c) => n + (c.unread || 0), 0);
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Messages</h1>
          <p className="text-sm text-slate-500 mt-1">Email ({mailConfig?.protocol === 'pop3' ? 'POP3' : 'IMAP'} / SMTP), WhatsApp, and auto-filed customer &amp; supplier folders.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSync} disabled={syncing} className="flex items-center gap-2 text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded">
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync Mail'}
          </button>
          <button onClick={handleClassify} disabled={syncing} className="flex items-center gap-2 text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded">
            <Folder size={14} />
            Re-file
          </button>
          <button onClick={() => openComposeEmail()} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-semibold flex items-center gap-2 text-xs transition-colors">
            <Send size={16} />
            Compose
          </button>
        </div>
      </div>

      {waStatus && !waStatus.connected && (
        <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs px-4 py-2 flex items-center gap-2">
          <AlertCircle size={14} />
          WhatsApp is not connected. Link your phone in Settings to send and receive WhatsApp messages.
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-2">{error}</div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-0 flex-1">
        <div className="grid grid-cols-[220px_1fr] flex-1 min-h-0">
          {/* Sidebar */}
          <div className="border-r border-slate-100 flex flex-col overflow-y-auto min-h-0">
            <div className="px-4 pt-4 pb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <Mail size={12} /> Email
            </div>
            <button onClick={() => switchMailFolder('inbox')} className={`flex items-center justify-between px-4 py-2 text-sm ${view.type === 'email' && view.folder === 'inbox' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'}`}>
              <span className="flex items-center gap-2"><Inbox size={15} /> Inbox</span>
              {inboxUnread > 0 && <span className="bg-indigo-600 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">{inboxUnread}</span>}
            </button>
            <button onClick={() => switchMailFolder('sent')} className={`flex items-center justify-between px-4 py-2 text-sm ${view.type === 'email' && view.folder === 'sent' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'}`}>
              <span className="flex items-center gap-2"><Send size={15} /> Sent</span>
            </button>

            <div className="px-4 pt-5 pb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <MessageCircle size={12} /> WhatsApp
              {waStatus?.connected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
            </div>
            {waChats.length === 0 ? (
              <p className="px-4 py-2 text-xs text-slate-400">{waStatus?.connected ? 'No chats yet.' : 'Not connected.'}</p>
            ) : (
              waChats.map(chat => (
                <button key={chat.id} onClick={() => openChat(chat.id)} className={`flex items-center justify-between px-4 py-2 text-sm ${view.type === 'whatsapp' && view.chatId === chat.id ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'}`}>
                  <span className="flex items-center gap-2 truncate">
                    <MessageCircle size={15} className="shrink-0" />
                    <span className="truncate flex flex-col">
                      <span className="truncate">{waChatDetails(chat).name}</span>
                      {waChatDetails(chat).sub && <span className="text-[10px] text-slate-400 truncate">{waChatDetails(chat).sub}</span>}
                    </span>
                  </span>
                  {chat.unread > 0 && <span className="bg-emerald-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">{chat.unread}</span>}
                </button>
              ))
            )}

            <div className="px-4 pt-5 pb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <Users size={12} /> Customer Contacts
            </div>
            {customers.length === 0 ? (
              <p className="px-4 py-2 text-xs text-slate-400">No customers yet.</p>
            ) : (
              customers.map(c => (
                <button key={c.id} onClick={() => setView({ type: 'contact', customerId: c.id })} className={`px-4 py-2 text-sm text-left ${view.type === 'contact' && view.customerId === c.id ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'}`}>
                  <span className="block truncate">{c.fullName}</span>
                  <span className="block text-[11px] text-slate-400 truncate">{c.companyName || c.email || c.phone || ''}</span>
                </button>
              ))
            )}

            <div className="px-4 pt-5 pb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <Folder size={12} /> Auto-Folders
            </div>
            <button onClick={() => setView({ type: 'category', category: 'customer', categoryId: null })} className={`flex items-center justify-between px-4 py-2 text-sm ${view.type === 'category' && view.category === 'customer' && view.categoryId === null ? 'bg-amber-50 text-amber-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'}`}>
              <span className="flex items-center gap-2"><Users size={15} /> Customers</span>
              {catUnread('customer', null) > 0 && <span className="bg-amber-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">{catUnread('customer', null)}</span>}
            </button>
            {catContactsWithItems('customer').map(c => (
              <button key={c.id} onClick={() => setView({ type: 'category', category: 'customer', categoryId: c.id })} className={`flex items-center justify-between pl-8 pr-4 py-1.5 text-sm ${view.type === 'category' && view.category === 'customer' && view.categoryId === c.id ? 'bg-amber-50 text-amber-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'}`}>
                <span className="truncate">{c.fullName}</span>
                {catUnread('customer', c.id) > 0 && <span className="text-[10px] font-bold text-amber-600">{catUnread('customer', c.id)}</span>}
              </button>
            ))}
            <button onClick={() => setView({ type: 'category', category: 'supplier', categoryId: null })} className={`flex items-center justify-between px-4 py-2 text-sm ${view.type === 'category' && view.category === 'supplier' && view.categoryId === null ? 'bg-amber-50 text-amber-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'}`}>
              <span className="flex items-center gap-2"><Truck size={15} /> Suppliers</span>
              {catUnread('supplier', null) > 0 && <span className="bg-amber-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">{catUnread('supplier', null)}</span>}
            </button>
            {catContactsWithItems('supplier').map(c => (
              <button key={c.id} onClick={() => setView({ type: 'category', category: 'supplier', categoryId: c.id })} className={`flex items-center justify-between pl-8 pr-4 py-1.5 text-sm ${view.type === 'category' && view.category === 'supplier' && view.categoryId === c.id ? 'bg-amber-50 text-amber-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'}`}>
                <span className="truncate">{c.name}</span>
                {catUnread('supplier', c.id) > 0 && <span className="text-[10px] font-bold text-amber-600">{catUnread('supplier', c.id)}</span>}
              </button>
            ))}
          </div>

          {/* List / Thread pane */}
          <div className="flex flex-col min-h-0">
            {view.type === 'category' ? (
              <>
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                    <Folder size={15} className="text-amber-600" />
                    {view.categoryId ? (view.category === 'customer'
                      ? customers.find(c => c.id === view.categoryId)?.fullName
                      : suppliers.find(c => c.id === view.categoryId)?.name)
                      : (view.category === 'customer' ? 'Customers' : 'Suppliers')}
                  </h2>
                  <span className="text-[10px] text-slate-400 font-medium">{catItems(view.category, view.categoryId).length} item(s) · mail + WhatsApp</span>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {catItems(view.category, view.categoryId).length === 0 ? (
                    <div className="p-10 text-center text-slate-400 text-sm">No matching mail or WhatsApp yet. Use "Re-file" to scan again.</div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {catItems(view.category, view.categoryId).map(item => (
                        <button
                          key={item.key}
                          onClick={() => {
                            if (item.kind === 'mail') openMailMessage(item.msg);
                            else { setPopout({ kind: 'whatsapp', chatId: item.key }); void fetchWaMessages(item.key); }
                          }}
                          className="w-full text-left p-4 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-sm truncate pr-4 font-semibold text-slate-800 flex items-center gap-2">
                              {item.kind === 'mail' ? <Mail size={13} className="text-indigo-500 shrink-0" /> : <MessageCircle size={13} className="text-emerald-500 shrink-0" />}
                              {item.label}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">{fmtTime(item.ts)}</span>
                          </div>
                          {item.subj && <h3 className="text-xs mb-1 truncate text-slate-700">{item.subj}</h3>}
                          <p className="text-xs text-slate-500 line-clamp-1">{item.preview}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : view.type === 'email' ? (
              <>
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                    <Inbox size={15} className="text-indigo-600" />
                    {view.folder === 'sent' ? 'Sent' : 'Inbox'}
                  </h2>
                  <button onClick={() => fetchMailFolder(view.folder)} className="text-xs text-indigo-600 font-semibold hover:underline">Refresh</button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {loading ? (
                    <div className="flex justify-center items-center h-40"><Loader className="animate-spin text-indigo-600" size={24} /></div>
                  ) : mailList.length === 0 ? (
                    <div className="p-10 text-center text-slate-400 text-sm">
                      {mailConfig?.configured ? 'No messages here yet. Hit "Sync Mail" to pull your mailbox.' : 'Email not configured — add your mailbox in Settings.'}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {mailList.map(msg => (
                        <button key={msg.id} onClick={() => openMailMessage(msg)} className={`w-full text-left p-4 hover:bg-slate-50 transition-colors ${selectedMail?.id === msg.id ? 'bg-indigo-50/60' : ''} ${!msg.read && msg.folder === 'inbox' ? 'bg-slate-50' : ''}`}>
                          <div className="flex justify-between items-start mb-1">
                            <span className={`text-sm truncate pr-4 ${msg.read ? 'text-slate-700' : 'font-bold text-slate-900'}`}>{mailDetails(msg).name}</span>
                            <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">{fmtTime(msg.date)}</span>
                          </div>
                          {mailDetails(msg).sub && <p className="text-[11px] text-slate-400 truncate">{mailDetails(msg).sub}</p>}
                          <h3 className={`text-xs mb-1 truncate ${msg.read ? 'text-slate-600' : 'font-bold text-slate-800'}`}>{msg.subject}</h3>
                          <p className="text-xs text-slate-500 line-clamp-1">{snippetOf(msg)}</p>
                          {msg.categoryLabel && <span className="inline-block mt-1 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">{msg.categoryLabel}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : view.type === 'whatsapp' ? (
              <>
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                      <MessageCircle size={15} className="text-emerald-600" />
                      {(() => { const chat = waChats.find(c => c.id === view.chatId); return waChatDetails(chat).name; })()}
                    </h2>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setPopout({ kind: 'whatsapp', chatId: view.chatId }); void fetchWaMessages(view.chatId); }} className="flex items-center gap-1 text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 px-2.5 py-1.5 rounded">
                      <Mail size={12} /> Pop out
                    </button>
                    {(() => { const chat = waChats.find(c => c.id === view.chatId); return chat && !chat.customerId ? (
                      <button
                        onClick={() => setCustomerModal({
                          chatId: view.chatId,
                          name: waChatDetails(chat).name,
                          phone: chat?.contactPhone || jidPhone(view.chatId),
                          email: '',
                        })}
                        className="flex items-center gap-1 text-xs font-semibold text-indigo-600 border border-indigo-200 hover:bg-indigo-50 px-2.5 py-1.5 rounded"
                      >
                        <UserPlus size={12} /> Create customer
                      </button>
                    ) : null; })()}
                    <span className="text-[10px] text-slate-400 font-medium">{(() => { const chat = waChats.find(c => c.id === view.chatId); const d = waChatDetails(chat); return d.sub || null; })()}</span>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 bg-slate-50/50">
                  {waMessages.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">No messages yet. Say hello.</div>
                  ) : (
                    [...waMessages].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)).map(m => (
                      <div key={m.id} className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${m.fromMe ? 'self-end bg-emerald-500 text-white rounded-br-sm' : 'self-start bg-white border border-slate-200 rounded-bl-sm'}`}>
                        <p className="whitespace-pre-wrap break-words">{m.content || '(media)'}</p>
                        <span className={`block text-[10px] mt-1 ${m.fromMe ? 'text-emerald-100' : 'text-slate-400'}`}>{fmtTime(m.timestamp)}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="p-3 border-t border-slate-100 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                      <input type="checkbox" checked={waSignatureOn} onChange={(e) => setWaSignatureOn(e.target.checked)} className="accent-emerald-600" />
                      <Signature size={12} className="text-slate-400" /> Signature
                    </label>
                    {waSignatureOn && (
                      <select
                        value={waSignatureRole}
                        onChange={(e) => setWaSignatureRole(e.target.value)}
                        className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700"
                      >
                        {SIGNATURE_ROLES.map(r => <option key={r} value={r}>{displayRole(r)}</option>)}
                      </select>
                    )}
                  </div>
                  <form className="flex gap-2">
                    <input
                      value={waDraft}
                      onChange={(e) => setWaDraft(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (!waDraft.trim()) return;
                        const ok = await sendWaNow(view.chatId, waDraft, waSignatureOn, waSignatureRole);
                        if (ok) {
                          setWaDraft('');
                          void fetchWaMessages(view.chatId);
                        }
                      }}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded font-semibold text-xs transition-colors"
                    >
                      Send
                    </button>
                  </form>
                </div>
              </>
            ) : activeContact ? (
              <div className="flex-1 overflow-y-auto p-6">
                <h2 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2"><Users size={15} className="text-indigo-600" /> Contact Details</h2>
                <div className="space-y-3">
                  <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Name</p><p className="text-sm text-slate-800">{activeContact.fullName}</p></div>
                  <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Company</p><p className="text-sm text-slate-800">{activeContact.companyName || '—'}</p></div>
                  <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Email</p>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-slate-800">{activeContact.email || '—'}</p>
                      {activeContact.email && (
                        <button onClick={() => openComposeEmail({ to: activeContact.email, toName: activeContact.fullName })} className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline">
                          <Send size={12} /> Email
                        </button>
                      )}
                    </div>
                  </div>
                  <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Phone</p>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-slate-800">{activeContact.phone || '—'}</p>
                      {activeContact.phone && (
                        <button onClick={() => openComposeWhatsApp(activeContact.phone)} className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline">
                          <MessageCircle size={12} /> WhatsApp
                        </button>
                      )}
                    </div>
                  </div>
                  <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Type</p><p className="text-sm text-slate-800 capitalize">{activeContact.customerType || 'individual'}</p></div>
                  <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Address</p><p className="text-sm text-slate-800">{activeContact.address || '—'}</p></div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Select a customer.</div>
            )}
          </div>
        </div>
      </div>

      {/* Preview + Reply popout (mail or WhatsApp) */}
      {popout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl flex flex-col max-h-full">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                {popout.kind === 'mail' ? <Mail size={15} className="text-indigo-600" /> : <MessageCircle size={15} className="text-emerald-600" />}
                {popout.kind === 'mail' ? (popout.msg.subject || '(No Subject)') : (() => { const chat = waChats.find(c => c.id === popout.chatId); return waChatDetails(chat).name; })()}
              </h2>
              <button onClick={() => setPopout(null)} className="text-slate-400 hover:text-slate-600 text-sm font-bold"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {popout.kind === 'mail' ? (
                <div className="px-5 py-4">
                  <p className="text-xs text-slate-500 mb-2">
                    <span className="font-semibold text-slate-700">{popout.msg.folder === 'sent' ? 'To:' : 'From:'}</span>{' '}
                    {mailDetails(popout.msg).name}
                    {mailDetails(popout.msg).sub && <span className="text-slate-400"> · {mailDetails(popout.msg).sub}</span>}
                    <span className="block text-[11px] text-slate-400 mt-0.5">{fmtDate(popout.msg.date)}</span>
                  </p>
                  {popout.msg.bodyHtml ? (
                    <div className="text-sm text-slate-800 leading-relaxed" dangerouslySetInnerHTML={{ __html: popout.msg.bodyHtml }} />
                  ) : (
                    <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{popout.msg.bodyText || '(No content)'}</p>
                  )}
                </div>
              ) : (
                <div className="p-4 flex flex-col gap-2 bg-slate-50/50">
                  {waMessages.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-slate-400 text-sm py-10">No messages yet.</div>
                  ) : (
                    [...waMessages].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)).map(m => (
                      <div key={m.id} className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${m.fromMe ? 'self-end bg-emerald-500 text-white rounded-br-sm' : 'self-start bg-white border border-slate-200 rounded-bl-sm'}`}>
                        <p className="whitespace-pre-wrap break-words">{m.content || '(media)'}</p>
                        <span className={`block text-[10px] mt-1 ${m.fromMe ? 'text-emerald-100' : 'text-slate-400'}`}>{fmtTime(m.timestamp)}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <form onSubmit={sendPopoutReply} className="p-3 border-t border-slate-100 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                  <Signature size={12} className="text-slate-400" /> Signature
                </label>
                <select
                  value={popoutRole}
                  onChange={(e) => setPopoutRole(e.target.value)}
                  className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700"
                >
                  {SIGNATURE_ROLES.map(r => <option key={r} value={r}>{displayRole(r)}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <input
                  value={popoutDraft}
                  onChange={(e) => setPopoutDraft(e.target.value)}
                  placeholder={popout.kind === 'mail' ? `Reply to ${popout.msg.folder === 'sent' ? popout.msg.toEmail : popout.msg.fromEmail}...` : 'Type a reply...'}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
                <button type="submit" disabled={popoutSending || !popoutDraft.trim()} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded font-semibold text-xs transition-colors">
                  {popoutSending ? 'Sending...' : 'Reply'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Compose Modal */}
      {compose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl flex flex-col max-h-full">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <h2 className="font-bold text-slate-800 text-sm">{compose.mode === 'email' ? 'New Email' : 'New WhatsApp Message'}</h2>
              <button onClick={() => setCompose(null)} className="text-slate-400 hover:text-slate-600 text-sm font-bold"><X size={16} /></button>
            </div>
            <form onSubmit={handleSend} className="p-4 flex flex-col flex-1 overflow-y-auto gap-4">
              {compose.mode === 'email' ? (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">To</label>
                    <input type="email" required value={compose.to} onChange={(e) => setCompose({ ...compose, to: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" placeholder="customer@example.com" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Name (optional)</label>
                    <input type="text" value={compose.toName} onChange={(e) => setCompose({ ...compose, toName: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" placeholder="Customer name" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Subject</label>
                    <input type="text" required value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" placeholder="Update on your repair (DJ-2026-0001)" />
                  </div>
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Message</label>
                    <textarea required value={compose.body} onChange={(e) => setCompose({ ...compose, body: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm flex-1 min-h-[150px] resize-none" placeholder="Hi there, your device is ready for collection..." />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                      <input type="checkbox" checked={compose.useSignature} onChange={(e) => setCompose({ ...compose, useSignature: e.target.checked })} className="accent-indigo-600" />
                      <Signature size={12} className="text-slate-400" /> Add signature
                    </label>
                    {compose.useSignature && (
                      <select
                        value={compose.signatureRole}
                        onChange={(e) => setCompose({ ...compose, signatureRole: e.target.value })}
                        className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700"
                      >
                        {SIGNATURE_ROLES.map(r => <option key={r} value={r}>{displayRole(r)}</option>)}
                      </select>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Phone / WhatsApp number</label>
                    <input type="text" required value={compose.to} onChange={(e) => setCompose({ ...compose, to: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm" placeholder="082 123 4567 or 27821234567" />
                  </div>
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Message</label>
                    <textarea required value={compose.body} onChange={(e) => setCompose({ ...compose, body: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm flex-1 min-h-[150px] resize-none" placeholder="Hi there, your device is ready for collection..." />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                      <input type="checkbox" checked={compose.useSignature} onChange={(e) => setCompose({ ...compose, useSignature: e.target.checked })} className="accent-emerald-600" />
                      <Signature size={12} className="text-slate-400" /> Add signature
                    </label>
                    {compose.useSignature && (
                      <select
                        value={compose.signatureRole}
                        onChange={(e) => setCompose({ ...compose, signatureRole: e.target.value })}
                        className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700"
                      >
                        {SIGNATURE_ROLES.map(r => <option key={r} value={r}>{displayRole(r)}</option>)}
                      </select>
                    )}
                  </div>
                </>
              )}
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setCompose(null)} className="px-4 py-2 rounded text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={sending} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-semibold flex items-center gap-2 text-xs transition-colors disabled:opacity-50">
                  <Send size={14} />
                  {sending ? 'Sending...' : compose.mode === 'email' ? 'Send Email' : 'Send Message'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create customer from WhatsApp chat modal */}
      {customerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md flex flex-col max-h-full">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2"><UserPlus size={15} className="text-indigo-600" /> Create Customer</h2>
              <button onClick={() => setCustomerModal(null)} className="text-slate-400 hover:text-slate-600 text-sm font-bold"><X size={16} /></button>
            </div>
            <form
              className="p-4 flex flex-col gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!customerModal) return;
                try {
                  const res = await fetch(`/api/whatsapp/chats/${encodeURIComponent(customerModal.chatId)}/customer`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      fullName: customerModal.name,
                      phone: customerModal.phone,
                      email: customerModal.email,
                    }),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || 'Failed to create customer');
                  setCustomerModal(null);
                  await fetchCustomers();
                  await fetchWaChats();
                } catch (err: any) {
                  alert(err.message);
                }
              }}
            >
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Full name</label>
                <input required value={customerModal.name} onChange={(e) => setCustomerModal({ ...customerModal, name: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" placeholder="Customer name" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Phone (WhatsApp)</label>
                <input value={customerModal.phone} onChange={(e) => setCustomerModal({ ...customerModal, phone: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" placeholder="27821234567" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Email (optional)</label>
                <input type="email" value={customerModal.email} onChange={(e) => setCustomerModal({ ...customerModal, email: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" placeholder="customer@example.com" />
              </div>
              <div className="pt-1 flex justify-end gap-2">
                <button type="button" onClick={() => setCustomerModal(null)} className="px-4 py-2 rounded text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-semibold flex items-center gap-2 text-xs transition-colors">
                  <UserPlus size={14} /> Create Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer bot requests log */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <button
          onClick={() => { setRequestsOpen(!requestsOpen); if (!requestsOpen) void fetchRequests(requestsPage, requestsShowArchived); }}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <span className="flex items-center gap-2">
            <Bot size={15} className="text-indigo-500" />
            Customer Bot Requests
            {requestsTotal > 0 && <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-full px-1.5 py-0.5">{requestsTotal}</span>}
          </span>
          <ChevronDown size={15} className={`transition-transform ${requestsOpen ? 'rotate-180' : ''}`} />
        </button>
        {requestsOpen && (
          <div className="border-t border-slate-100">
            <div className="flex items-center justify-between gap-2 px-4 py-2">
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={requestsShowArchived}
                  onChange={(e) => { setRequestsShowArchived(e.target.checked); void fetchRequests(1, e.target.checked); }}
                  className="rounded border-slate-300"
                />
                Show archived
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void fetchRequests(Math.max(1, requestsPage - 1), requestsShowArchived)}
                  disabled={requestsPage <= 1}
                  className="text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-40 px-2.5 py-1 rounded"
                >
                  Prev
                </button>
                <span className="text-xs text-slate-500">Page {requestsPage} of {Math.max(1, Math.ceil(requestsTotal / 20))}</span>
                <button
                  onClick={() => void fetchRequests(requestsPage + 1, requestsShowArchived)}
                  disabled={requestsPage * 20 >= requestsTotal}
                  className="text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-40 px-2.5 py-1 rounded"
                >
                  Next
                </button>
              </div>
            </div>
            {requests.length === 0 ? (
              <p className="px-4 py-4 text-xs text-slate-400">No customer bot requests{requestsShowArchived ? ' (including archived)' : ''} yet. Messages customers send to your WhatsApp number that match the menu (status, invoice, quote, keywords) are logged here.</p>
            ) : (
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] sticky top-0">
                    <tr>
                      <th className="px-4 py-2 font-bold">When</th>
                      <th className="px-4 py-2 font-bold">Sender</th>
                      <th className="px-4 py-2 font-bold">Request</th>
                      <th className="px-4 py-2 font-bold">Reply</th>
                      <th className="px-4 py-2 font-bold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {requests.map(r => (
                      <tr key={r.id} className={`align-top ${r.archived ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-2 whitespace-nowrap text-slate-500">{fmtDate(r.handledAt)}</td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <div className="font-semibold text-slate-800">{r.senderName || 'Unknown'}</div>
                          <div className="text-slate-400">{r.senderPhone}</div>
                          <span className="inline-block mt-0.5 bg-slate-100 text-slate-600 rounded px-1.5 py-0.5 text-[10px] font-semibold capitalize">{r.intent}</span>
                          {r.reference && <span className="inline-block mt-0.5 ml-1 bg-indigo-50 text-indigo-700 rounded px-1.5 py-0.5 text-[10px] font-mono">{r.reference}</span>}
                          {r.archived ? <span className="inline-block mt-0.5 ml-1 bg-slate-200 text-slate-500 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase">archived</span> : null}
                        </td>
                        <td className="px-4 py-2 text-slate-700 max-w-[240px] whitespace-pre-wrap break-words">{r.requestText}</td>
                        <td className="px-4 py-2 text-slate-500 max-w-[280px] whitespace-pre-wrap break-words">{r.replyText}</td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <button
                            onClick={() => void toggleRequestArchived(r)}
                            className="text-slate-500 hover:text-indigo-600 font-semibold text-[10px] uppercase tracking-wide"
                          >
                            {r.archived ? 'Restore' : 'Archive'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
