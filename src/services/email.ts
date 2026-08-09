import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { ulid } from 'ulid';
import { eq, desc, and, lt } from 'drizzle-orm';
import { db } from '../db/index';
import { settings, mailMessages, mailFolderState } from '../db/schema';
import { classifyMailMessage } from './classify';

export interface MailConfig {
  protocol: 'imap' | 'pop3';
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  user: string;
  pass: string;
  fromName: string;
  pop3Host: string;
  pop3Port: number;
  pop3LeaveDays: number;
}

async function getSetting(key: string, fallback: string): Promise<string> {
  try {
    const rows = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key));
    return rows[0]?.value ?? fallback;
  } catch {
    return fallback;
  }
}

export async function getMailConfig(): Promise<MailConfig> {
  const smtpPort = Number(await getSetting('mail_smtp_port', '587')) || 587;
  return {
    protocol: (await getSetting('mail_protocol', 'imap')) === 'pop3' ? 'pop3' : 'imap',
    imapHost: await getSetting('mail_imap_host', 'outlook.office365.com'),
    imapPort: Number(await getSetting('mail_imap_port', '993')) || 993,
    smtpHost: await getSetting('mail_smtp_host', 'smtp.office365.com'),
    smtpPort,
    smtpSecure: smtpPort === 465,
    user: await getSetting('mail_user', ''),
    pass: await getSetting('mail_pass', ''),
    fromName: (await getSetting('business_name', '')) || 'DJ TECH',
    pop3Host: await getSetting('pop3_host', 'pop.gmail.com'),
    pop3Port: Number(await getSetting('pop3_port', '995')) || 995,
    pop3LeaveDays: Number(await getSetting('pop3_leave_days', '14')) || 14,
  };
}

export function isMailConfigured(config: MailConfig): boolean {
  return Boolean(config.user && config.pass);
}

export function mailConfigSummary(config: MailConfig) {
  return {
    configured: isMailConfigured(config),
    protocol: config.protocol,
    user: config.user,
    imapHost: config.imapHost,
    imapPort: config.imapPort,
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    pop3Host: config.pop3Host,
    pop3Port: config.pop3Port,
    pop3LeaveDays: config.pop3LeaveDays,
    fromName: config.fromName,
  };
}

// ---------------------------------------------------------------- IMAP helpers

function imapClient(config: MailConfig): ImapFlow {
  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: true,
    auth: { user: config.user, pass: config.pass },
    logger: false,
  });
  // Swallow socket/stream errors so a slow or dropped connection never
  // crashes the process via an unhandled 'error' event. Sync failures are
  // surfaced through the promises instead.
  client.on('error', () => {});
  return client;
}

async function getFolderState(folder: 'inbox' | 'sent') {
  const rows = await db.select().from(mailFolderState).where(eq(mailFolderState.folder, folder));
  return rows[0] || null;
}

async function saveFolderState(folder: 'inbox' | 'sent', uidvalidity: string, lastUid: number) {
  await db.insert(mailFolderState).values({ folder, uidvalidity, lastUid })
    .onConflictDoUpdate({
      target: mailFolderState.folder,
      set: { uidvalidity, lastUid, updatedAt: new Date() },
    });
}

// Sync a single IMAP mailbox, tracking UIDVALIDITY so we never skip/duplicate
// when the server renumbers mailboxes. On a UIDVALIDITY change we rebuild the folder.
async function syncMailbox(client: ImapFlow, mailboxPath: string, folder: 'inbox' | 'sent'): Promise<number> {
  const mail = await client.mailboxOpen(mailboxPath);
  const uidvalidity = String(mail.uidValidity ?? '');
  const currentUidNext = mail.uidNext ?? 0;
  const state = await getFolderState(folder);
  const uidValidityChanged = !state || state.uidvalidity !== uidvalidity;

  if (uidValidityChanged) {
    // Mailbox identity changed — wipe stored messages for this folder and rebuild.
    await db.delete(mailMessages).where(eq(mailMessages.folder, folder));
    await saveFolderState(folder, uidvalidity, 0);
  }

  const lastUid = uidValidityChanged ? 0 : (state?.lastUid ?? 0);
  let newCount = 0;
  for await (const message of client.fetch({ uid: `${lastUid + 1}:*` }, { uid: true, envelope: true, source: true, flags: true })) {
    try {
      const inserted = await storeIncomingMessage(message, folder);
      if (inserted) newCount++;
    } catch (err) {
      console.error('Failed to store mail message:', err);
    }
  }

  await saveFolderState(folder, uidvalidity, Math.max(lastUid, currentUidNext - 1));
  await reconcileReadState(client, folder);
  return newCount;
}

// Keep local read flags in sync with the server (\Seen), at most every 30 minutes per folder.
async function reconcileReadState(client: ImapFlow, folder: 'inbox' | 'sent') {
  const state = await getFolderState(folder);
  const lastReconcile = state?.updatedAt ? new Date(state.updatedAt).getTime() : 0;
  if (Date.now() - lastReconcile < 30 * 60 * 1000) return;

  const rows = await db.select({ id: mailMessages.id, uid: mailMessages.uid, read: mailMessages.read })
    .from(mailMessages).where(eq(mailMessages.folder, folder));
  if (rows.length === 0) return;

  const byUid = new Map(rows.filter(r => r.uid != null).map(r => [r.uid as number, r]));
  if (byUid.size === 0) return;

  const maxUid = Math.max(...byUid.keys());
  const seenUids = new Set<number>();
  for await (const message of client.fetch({ uid: `1:${maxUid}` }, { uid: true, flags: true })) {
    if (message.flags instanceof Set && message.flags.has('\\Seen') && byUid.has(message.uid)) {
      seenUids.add(message.uid);
    }
  }
  for (const [uid, row] of byUid) {
    const serverRead = seenUids.has(uid) ? 1 : 0;
    if (serverRead !== row.read) {
      await db.update(mailMessages).set({ read: serverRead }).where(eq(mailMessages.id, row.id));
    }
  }
  await db.update(mailFolderState).set({ updatedAt: new Date() }).where(eq(mailFolderState.folder, folder));
}

async function findSentMailbox(client: ImapFlow): Promise<string | null> {
  const list = await client.list();
  const byPath = list.find((b) => /^\[gmail\]\/sent/i.test(b.path) || /^sent/i.test(b.name) || /sent items/i.test(b.name));
  if (byPath) return byPath.path;
  return null;
}

async function storeIncomingMessage(message: any, folder: 'inbox' | 'sent'): Promise<boolean> {
  const uid = message.uid;
  const messageKey = `${folder}:${uid}`;
  const existing = await db.select({ id: mailMessages.id }).from(mailMessages).where(eq(mailMessages.messageKey, messageKey));
  if (existing.length) return false;

  const parsed = await simpleParser(message.source);
  const fromAddr = parsed.from?.value?.[0];
  const toAddr = parsed.to?.value?.[0];
  const date = parsed.date instanceof Date && !isNaN(parsed.date.getTime()) ? parsed.date : new Date();
  const flags: Set<string> = message.flags instanceof Set ? message.flags : new Set();
  const read = flags.has('\\Seen') ? 1 : 0;

  const id = ulid();
  try {
    await db.insert(mailMessages).values({
      id,
      folder,
      uid,
      messageKey,
      messageId: parsed.messageId || null,
      fromName: fromAddr?.name || fromAddr?.address || '',
      fromEmail: fromAddr?.address || '',
      toName: toAddr?.name || toAddr?.address || '',
      toEmail: toAddr?.address || '',
      subject: parsed.subject || '(No Subject)',
      bodyText: parsed.text || '',
      bodyHtml: parsed.html || '',
      date,
      read,
    });
  } catch (err: any) {
    // A concurrent sync may have inserted the same message_key first.
    if (String(err?.message || err).includes('UNIQUE')) return false;
    throw err;
  }
  if (folder === 'inbox') void classifyMailMessage(id);
  return true;
}

// ---------------------------------------------------------------- POP3 helpers

let pop3Ctor: any = null;
async function getPop3(): Promise<any> {
  if (!pop3Ctor) {
    // node-pop3 ships ESM syntax under its `import` condition (./src/*.js) but its
    // `require` condition points at .cjs files that contain ESM statements and fail
    // under CJS. Load via dynamic import with a non-static specifier so esbuild keeps
    // it as a real import() and Node resolves the ESM entry.
    const mod: any = await import('node-pop3' + '');
    pop3Ctor = mod?.default ?? mod;
  }
  return pop3Ctor;
}

async function pop3Client(config: MailConfig): Promise<any> {
  const Pop3 = await getPop3();
  return new Pop3({
    user: config.user,
    password: config.pass,
    host: config.pop3Host,
    port: config.pop3Port,
    tls: true,
    timeout: 15000,
    streamReadTimeout: 60000,
    parseStreamToString: true,
    maxMailSize: 30 * 1024 * 1024,
  });
}

async function syncMailPop3(config: MailConfig): Promise<{ inbox: number; sent: number }> {
  const client = await pop3Client(config);
  try {
    const [list, uidl] = await Promise.all([client.LIST(), client.UIDL()]);
    const uidlMap = new Map<string, number>(); // uid -> msgNumber
    for (const row of uidl || []) uidlMap.set(String(row[1]), Number(row[0]));

    const msgNumbers = (list || []).map((row: any) => Number(row[0]));
    const stored = await db.select({ messageKey: mailMessages.messageKey, date: mailMessages.date })
      .from(mailMessages).where(eq(mailMessages.folder, 'inbox'));
    const storedKeys = new Set(stored.map(r => r.messageKey));
    const storedByKey = new Map(stored.map(r => [r.messageKey, r.date ? new Date(r.date).getTime() : 0]));

    const cutoff = Date.now() - config.pop3LeaveDays * 24 * 60 * 60 * 1000;
    let newCount = 0;

    for (const num of msgNumbers) {
      const uid = [...uidlMap.entries()].find(([, n]) => n === num)?.[0];
      if (!uid) continue;
      const messageKey = `pop3:${uid}`;
      if (!storedKeys.has(messageKey)) {
        try {
          const raw = await client.RETR(num);
          const inserted = await storePop3Message(raw, messageKey, num);
          if (inserted) newCount++;
        } catch (err) {
          console.error('[pop3] RETR failed for', num, err);
        }
      } else if (storedByKey.get(messageKey) && storedByKey.get(messageKey)! < cutoff) {
        // Already stored and older than the retention window — delete from server.
        try { await client.DELE(num); } catch { /* noop */ }
      }
    }
    return { inbox: newCount, sent: 0 };
  } finally {
    try { await client.QUIT(); } catch { /* noop */ }
  }
}

async function storePop3Message(raw: string, messageKey: string, msgNumber: number): Promise<boolean> {
  const existing = await db.select({ id: mailMessages.id }).from(mailMessages).where(eq(mailMessages.messageKey, messageKey));
  if (existing.length) return false;

  const parsed = await simpleParser(raw);
  const fromAddr = parsed.from?.value?.[0];
  const toAddr = parsed.to?.value?.[0];
  const date = parsed.date instanceof Date && !isNaN(parsed.date.getTime()) ? parsed.date : new Date();

  const id = ulid();
  try {
    await db.insert(mailMessages).values({
      id,
      folder: 'inbox',
      uid: msgNumber,
      messageKey,
      messageId: parsed.messageId || null,
      fromName: fromAddr?.name || fromAddr?.address || '',
      fromEmail: fromAddr?.address || '',
      toName: toAddr?.name || toAddr?.address || '',
      toEmail: toAddr?.address || '',
      subject: parsed.subject || '(No Subject)',
      bodyText: parsed.text || '',
      bodyHtml: parsed.html || '',
      date,
      read: 0,
    });
  } catch (err: any) {
    if (String(err?.message || err).includes('UNIQUE')) return false;
    throw err;
  }
  void classifyMailMessage(id);
  return true;
}

// ---------------------------------------------------------------- Public API

export async function testMailConnection(): Promise<{ ok: boolean; error?: string }> {
  const config = await getMailConfig();
  if (!isMailConfigured(config)) return { ok: false, error: 'Mail is not configured. Add your mailbox credentials in Settings.' };

  if (config.protocol === 'pop3') {
    const client = await pop3Client(config);
    try {
      await client.STAT();
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error?.message || String(error) };
    } finally {
      try { await client.QUIT(); } catch { /* noop */ }
    }
  }

  const client = imapClient(config);
  try {
    await client.connect();
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  } finally {
    try { await client.logout(); } catch { /* noop */ }
  }
}

export async function syncMail(): Promise<{ inbox: number; sent: number }> {
  const config = await getMailConfig();
  if (!isMailConfigured(config)) throw new Error('Mail is not configured');

  if (config.protocol === 'pop3') {
    return syncMailPop3(config);
  }

  const client = imapClient(config);
  await client.connect();
  try {
    const result = { inbox: 0, sent: 0 };
    result.inbox = await syncMailbox(client, 'INBOX', 'inbox');
    const sentPath = await findSentMailbox(client);
    if (sentPath) result.sent = await syncMailbox(client, sentPath, 'sent');
    return result;
  } finally {
    try { await client.logout(); } catch { /* noop */ }
  }
}

// Copy categorized inbox mail into real IMAP folders (DJ TECH/Customers/<name> etc.).
// Non-destructive: copies, leaves the original in the inbox.
export async function mirrorClassifiedMail(): Promise<number> {
  const config = await getMailConfig();
  if (config.protocol !== 'imap' || !isMailConfigured(config)) return 0;

  const rows = await db.select().from(mailMessages).where(and(
    eq(mailMessages.folder, 'inbox'),
    eq(mailMessages.imapMirrored, 0),
    eq(mailMessages.category, 'customer'),
  )).limit(100);
  if (rows.length === 0) return 0;

  const client = imapClient(config);
  await client.connect();
  try {
    const folders = new Map<string, string>();
    let mirrored = 0;
    for (const msg of rows) {
      if (msg.uid == null) continue;
      const scope = 'DJ TECH/Customers';
      const label = sanitizeFolderName(msg.categoryLabel || 'Unknown');
      const path = `${scope}/${label}`;
      if (!folders.has(path)) {
        try { await client.mailboxCreate(path); } catch { /* may already exist */ }
        folders.set(path, path);
      }
      try {
        await client.messageCopy(msg.uid, path);
        await db.update(mailMessages).set({ imapMirrored: 1 }).where(eq(mailMessages.id, msg.id));
        mirrored++;
      } catch (err) {
        console.error('[mail] mirror failed for', msg.id, err);
      }
    }
    return mirrored;
  } finally {
    try { await client.logout(); } catch { /* noop */ }
  }
}

function sanitizeFolderName(name: string): string {
  return name.replace(/[\\/:"*?<>|]/g, '_').trim().slice(0, 60) || 'Unknown';
}

export interface MailAttachment {
  filename?: string;
  content?: Buffer | string;
  path?: string;
  contentType?: string;
}

export async function sendMail(opts: { to: string; toName?: string; subject: string; text?: string; html?: string; attachments?: MailAttachment[] }): Promise<{ messageId?: string }> {
  const config = await getMailConfig();
  if (!isMailConfigured(config)) throw new Error('Mail is not configured');

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.user, pass: config.pass },
  });

  const info = await transporter.sendMail({
    from: `"${config.fromName}" <${config.user}>`,
    to: opts.toName ? `"${opts.toName}" <${opts.to}>` : opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    attachments: opts.attachments,
  });

  const messageId = info.messageId || `sent_${Date.now()}`;
  await db.insert(mailMessages).values({
    id: ulid(),
    folder: 'sent',
    uid: null,
    messageKey: `sent:${messageId}`,
    messageId,
    fromName: config.fromName,
    fromEmail: config.user,
    toName: opts.toName || '',
    toEmail: opts.to,
    subject: opts.subject,
    bodyText: opts.text || '',
    bodyHtml: opts.html || '',
    date: new Date(),
    read: 1,
  });

  return { messageId };
}

export async function getMailMessages(folder: string) {
  const safe = folder === 'sent' ? 'sent' : 'inbox';
  return db.select().from(mailMessages).where(eq(mailMessages.folder, safe)).orderBy(desc(mailMessages.date)).limit(300);
}

export async function getMailMessage(id: string) {
  const rows = await db.select().from(mailMessages).where(eq(mailMessages.id, id));
  return rows[0] || null;
}

export async function markMailRead(id: string) {
  const rows = await db.select().from(mailMessages).where(eq(mailMessages.id, id));
  const msg = rows[0];
  await db.update(mailMessages).set({ read: 1 }).where(eq(mailMessages.id, id));
  if (!msg || msg.folder !== 'inbox' || msg.uid == null) return;

  // Mirror the read state back to the server when using IMAP.
  const config = await getMailConfig();
  if (config.protocol !== 'imap' || !isMailConfigured(config)) return;
  const client = imapClient(config);
  try {
    await client.connect();
    await client.mailboxOpen('INBOX');
    await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true });
  } catch { /* noop */ }
  finally {
    try { await client.logout(); } catch { /* noop */ }
  }
}

export function startMailPolling(intervalMs = 120000) {
  setInterval(() => {
    void (async () => {
      const config = await getMailConfig();
      if (!isMailConfigured(config)) return;
      try {
        const { inbox, sent } = await syncMail();
        if (inbox > 0 || sent > 0) console.log(`[mail] synced ${inbox} new inbox, ${sent} new sent`);
        const mirrored = await mirrorClassifiedMail();
        if (mirrored > 0) console.log(`[mail] mirrored ${mirrored} message(s) to IMAP smart folders`);
      } catch (err) {
        console.error('[mail] poll failed:', (err as any)?.message || err);
      }
    })();
  }, intervalMs);
}
