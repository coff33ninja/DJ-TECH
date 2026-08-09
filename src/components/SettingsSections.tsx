import { Fragment, ReactNode } from 'react';
import { Building2, Banknote, Receipt, Mail, Signature, Paperclip, Link2, Bot, CheckCircle2, AlertCircle } from 'lucide-react';

export const BUSINESS_FIELDS = [
  { key: 'business_name', label: 'Business Name', type: 'text' },
  { key: 'business_tagline', label: 'Tagline', type: 'text' },
  { key: 'business_phone', label: 'Phone', type: 'text' },
  { key: 'business_email', label: 'Email', type: 'email' },
  { key: 'business_address', label: 'Address', type: 'text' },
];

export const BANK_FIELDS = [
  { key: 'business_bank_name', label: 'Bank Name', type: 'text' },
  { key: 'business_bank_account', label: 'Account Number', type: 'text' },
  { key: 'business_bank_branch', label: 'Branch / Code', type: 'text' },
];

export const DOC_FIELDS = [
  { key: 'quote_prefix', label: 'Quote Number Prefix', type: 'text' },
  { key: 'invoice_prefix', label: 'Invoice Number Prefix', type: 'text' },
  { key: 'vat_rate', label: 'VAT Rate (decimal, e.g. 0.15)', type: 'number' },
  { key: 'currency', label: 'Currency', type: 'text' },
  { key: 'default_labour_rate', label: 'Default Labour Rate (R/hour)', type: 'number' },
  { key: 'default_markup', label: 'Default Markup (decimal, e.g. 0.5 = 50%)', type: 'number' },
  { key: 'warranty_days', label: 'Default Warranty (days)', type: 'number' },
  { key: 'daily_revenue_goal', label: 'Daily Revenue Goal (R)', type: 'number' },
];

const Section = ({ icon: Icon, title, optional, children }: { icon: any, title: string, optional?: boolean, children: ReactNode }) => (
  <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
    <div className="flex items-center gap-2 mb-1">
      <Icon size={16} className="text-indigo-600" />
      <h2 className="text-sm font-bold text-slate-800">{title}</h2>
      {optional && (
        <span className="ml-auto rounded-full bg-slate-100 border border-slate-200 text-[10px] font-semibold text-slate-500 px-2 py-0.5">
          Optional
        </span>
      )}
    </div>
    {optional && (
      <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
        Can be left for later and changed any time in Settings.
      </p>
    )}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
  </div>
);

const Field = ({ label, type, value, placeholder, required, onChange }: { label: string, type: string, value: string, placeholder?: string, required?: boolean, onChange: (v: string) => void }) => (
  <div className="flex flex-col gap-1">
    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
      {label}{required && <span className="text-red-500"> *</span>}
    </label>
    {type === 'textarea' ? (
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono leading-relaxed resize-y"
      />
    ) : (
      <input
        type={type}
        step={type === 'number' ? '1' : undefined}
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
      />
    )}
  </div>
);

const Toggle = ({ checked, onChange, label, hint }: { checked: boolean, onChange: () => void, label: string, hint?: string }) => (
  <div className="col-span-1 sm:col-span-2 flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-slate-800">{label}</span>
      {hint && <span className="text-[11px] text-slate-500 leading-relaxed">{hint}</span>}
    </div>
    <button
      type="button"
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-slate-300'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-1'}`} />
    </button>
  </div>
);

// Renders every configurable section from the Settings page. Used by both the
// Settings page (mode "settings", with mail test) and the first-run setup page
// (mode "setup", with required business fields and no live-connection actions).
export function SettingsSections({ settings, set, mode, onTestMail, mailTesting, mailTest }: {
  settings: Record<string, string>;
  set: (key: string, value: string) => void;
  mode: 'settings' | 'setup';
  onTestMail?: () => void;
  mailTesting?: boolean;
  mailTest?: { ok?: boolean; error?: string } | null;
}) {
  const required = mode === 'setup';
  const req = (k: string) => required && ['business_name', 'business_phone', 'business_email'].includes(k);

  return (
    <>
      <Section icon={Building2} title="Business Information">
        {BUSINESS_FIELDS.map(f => (
          <Fragment key={f.key}>
            <Field label={f.label} type={f.type} value={String(settings[f.key] || '')} required={req(f.key)} onChange={(v) => set(f.key, v)} />
          </Fragment>
        ))}
        <p className="col-span-1 sm:col-span-2 text-[11px] text-slate-400 leading-relaxed">
          The Email field fills in automatically from the mailbox address in the Email section below.
        </p>
      </Section>

      <Section icon={Banknote} title="Banking Details" optional={required}>
        {BANK_FIELDS.map(f => (
          <Fragment key={f.key}>
            <Field label={f.label} type={f.type} value={String(settings[f.key] || '')} onChange={(v) => set(f.key, v)} />
          </Fragment>
        ))}
      </Section>

      <Section icon={Receipt} title="Quotes, Invoices & Billing" optional={required}>
        {DOC_FIELDS.map(f => (
          <Fragment key={f.key}>
            <Field label={f.label} type={f.type} value={String(settings[f.key] || '')} onChange={(v) => set(f.key, v)} />
          </Fragment>
        ))}
      </Section>

      <Section icon={Mail} title="Email (IMAP / SMTP / POP3)" optional={required}>
        <div className="col-span-1 sm:col-span-2 flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Receive Protocol</label>
          <select
            value={String(settings.mail_protocol || 'imap')}
            onChange={(e) => set('mail_protocol', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          >
            <option value="imap">IMAP (full folder sync, read states kept)</option>
            <option value="pop3">POP3 (download inbox, 14-day server retention)</option>
          </select>
        </div>
        {(settings.mail_protocol || 'imap') === 'imap' ? (
          <Fragment>
            <Field label="IMAP Server" type="text" value={String(settings.mail_imap_host || '')} placeholder="outlook.office365.com" onChange={(v) => set('mail_imap_host', v)} />
            <Field label="IMAP Port" type="number" value={String(settings.mail_imap_port || '')} placeholder="993" onChange={(v) => set('mail_imap_port', v)} />
          </Fragment>
        ) : (
          <Fragment>
            <Field label="POP3 Server" type="text" value={String(settings.pop3_host || '')} placeholder="pop.gmail.com" onChange={(v) => set('pop3_host', v)} />
            <Field label="POP3 Port" type="number" value={String(settings.pop3_port || '')} placeholder="995" onChange={(v) => set('pop3_port', v)} />
            <Field label="Leave on server (days)" type="number" value={String(settings.pop3_leave_days || '14')} placeholder="14" onChange={(v) => set('pop3_leave_days', v)} />
          </Fragment>
        )}
        <Field label="SMTP Server (sending)" type="text" value={String(settings.mail_smtp_host || '')} placeholder="smtp.office365.com" onChange={(v) => set('mail_smtp_host', v)} />
        <Field label="SMTP Port" type="number" value={String(settings.mail_smtp_port || '')} placeholder="587" onChange={(v) => set('mail_smtp_port', v)} />
        <Field label="Email Address (mailbox)" type="email" value={String(settings.mail_user || '')} placeholder="you@yourdomain.co.za"
          onChange={(v) => {
            set('mail_user', v);
            // Only one email entry needed: keep the business email in sync with
            // the mailbox address unless the user typed one explicitly.
            if (!String(settings.business_email || '').trim()) set('business_email', v);
          }} />
        <Field label="Password / App Password" type="password" value={String(settings.mail_pass || '')} placeholder="••••••••" onChange={(v) => set('mail_pass', v)} />
        {mode === 'settings' && onTestMail && (
          <div className="col-span-1 sm:col-span-2 flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onTestMail}
              disabled={mailTesting}
              className="bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-4 py-2 rounded font-semibold text-xs transition-colors flex items-center gap-2"
            >
              {mailTesting ? 'Testing...' : 'Test Connection'}
            </button>
            {mailTest && (
              <span className={`text-xs font-semibold flex items-center gap-1 ${mailTest.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                {mailTest.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                {mailTest.ok ? 'Connected — mailbox reached.' : (mailTest.error || 'Connection failed.')}
              </span>
            )}
          </div>
        )}
        <p className="col-span-1 sm:col-span-2 text-[11px] text-slate-400 leading-relaxed">
          IMAP: outlook.office365.com:993 (or imap.gmail.com:993), keeps read/unread in sync both ways. POP3: pop.gmail.com:995, messages stay on the server for the retention window then are removed. SMTP is always used for sending. {mode === 'settings' ? 'Save before testing.' : 'You can test the connection later from Settings.'}
        </p>
      </Section>

      <Section icon={Signature} title="Message Signature" optional={required}>
        <Field label="Sender Name" type="text" value={String(settings.signature_name || '')} placeholder="e.g. DJ TECH" onChange={(v) => set('signature_name', v)} />
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Default Role</label>
          <select
            value={String(settings.signature_role || 'technician')}
            onChange={(e) => set('signature_role', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          >
            <option value="technician">Technician</option>
            <option value="sales">Sales Rep</option>
            <option value="admin">Administrator</option>
            <option value="support">Support</option>
          </select>
        </div>
        <p className="col-span-1 sm:col-span-2 text-[11px] text-slate-400 leading-relaxed">
          Appends company details (name, phone, email, address from Business Information) plus this sender's role to outgoing email and WhatsApp messages.
        </p>
      </Section>

      <Section icon={Paperclip} title="Job Intake Sending">
        <Toggle
          label="Auto-send job card on intake"
          hint={'When a device enters the workshop, send the PDF job card + all documents marked "Send along" to the customer via WhatsApp and email.'}
          checked={settings.auto_send_job_intake !== '0'}
          onChange={() => set('auto_send_job_intake', settings.auto_send_job_intake === '0' ? '1' : '0')}
        />
      </Section>

      <Section icon={Link2} title="Customer Tracking" optional={required}>
        <Toggle
          label="Public tracking pages"
          hint="Customers can follow their repair progress and print quotes/invoices via the tracking link sent on intake."
          checked={settings.public_tracking_enabled !== '0'}
          onChange={() => set('public_tracking_enabled', settings.public_tracking_enabled === '0' ? '1' : '0')}
        />
        <Field
          label="Public base URL"
          type="text"
          value={settings.public_base_url || ''}
          onChange={(v) => set('public_base_url', v)}
          placeholder="http://192.168.0.100:3000"
        />
        <p className="col-span-1 sm:col-span-2 text-[11px] text-slate-400 leading-relaxed">
          The address customers use to reach this system (as seen from their phone/PC on your network). Tracking links in WhatsApp and email are built from this.
        </p>
      </Section>

      <Section icon={Bot} title="WhatsApp Bot" optional={required}>
        <Toggle
          label="Customer self-service bot"
          hint={'Customers messaging this WhatsApp number get automatic replies for status, invoices, quotes, and your custom keywords. Each handled request is logged in Messages → Customer Bot Requests.'}
          checked={settings.whatsapp_bot_enabled !== '0'}
          onChange={() => set('whatsapp_bot_enabled', settings.whatsapp_bot_enabled === '0' ? '1' : '0')}
        />
        <Field
          label="Menu text"
          type="textarea"
          value={settings.whatsapp_bot_menu || ''}
          onChange={(v) => set('whatsapp_bot_menu', v)}
          placeholder={'Reply with one of the following:\n1. MENU — show this menu\n2. STATUS <job no. or code> — check your repair'}
        />
        <Field
          label="Custom keywords (one per line: keyword | reply)"
          type="textarea"
          value={settings.whatsapp_bot_keywords || ''}
          onChange={(v) => set('whatsapp_bot_keywords', v)}
          placeholder={'hours | We are open Mon-Fri 08:00-17:00 and Sat 08:00-13:00.\nopening | Our shop is at ...'}
        />
        <p className="col-span-1 sm:col-span-2 text-[11px] text-slate-400 leading-relaxed">
          Built-in commands always work: MENU, STATUS &lt;job no. or tracking code&gt;, INVOICE &lt;invoice no.&gt;, QUOTE &lt;quote no.&gt;. Custom keywords below are matched in addition.
        </p>
      </Section>
    </>
  );
}

// Marker components reused by pages that show live-connection status.
export const StatusOk = ({ text }: { text: string }) => (
  <span className={`text-xs font-semibold flex items-center gap-1 text-emerald-600`}>
    <CheckCircle2 size={14} /> {text}
  </span>
);

export const StatusErr = ({ text }: { text: string }) => (
  <span className={`text-xs font-semibold flex items-center gap-1 text-red-500`}>
    <AlertCircle size={14} /> {text}
  </span>
);
