import { eq, or, isNull } from 'drizzle-orm';
import { db } from '../db/index';
import { customers, suppliers, mailMessages, whatsappChats } from '../db/schema';

const FREE_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'yahoo.com', 'ymail.com', 'icloud.com', 'me.com', 'aol.com',
  'proton.me', 'protonmail.com', 'pm.me', 'outlook.co.za', 'gmx.com',
]);

interface ContactMatch {
  category: 'customer' | 'supplier';
  id: string;
  label: string;
}

const normEmail = (e: string): string => (e || '').trim().toLowerCase();
const emailDomain = (e: string): string => {
  const at = e.lastIndexOf('@');
  return at >= 0 ? e.slice(at + 1).toLowerCase() : '';
};

const normPhone = (p: string): string => (p || '').replace(/\D/g, '');
const phonesEqual = (a: string, b: string): boolean => {
  const x = normPhone(a), y = normPhone(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const full = (n: string) => n.startsWith('27') ? n : `27${n.replace(/^0/, '')}`;
  return full(x) === full(y);
};

const namesOverlap = (a: string, b: string): boolean => {
  const x = (a || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const y = (b || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
};

async function loadContacts(): Promise<{ customers: any[]; suppliers: any[] }> {
  const [custRows, supRows] = await Promise.all([
    db.select().from(customers),
    db.select().from(suppliers),
  ]);
  return { customers: custRows, suppliers: supRows };
}

// Match a mail message (by sender address/domain) against customers then suppliers.
export async function classifyMailMessage(msgId: string): Promise<void> {
  const rows = await db.select().from(mailMessages).where(eq(mailMessages.id, msgId));
  const msg = rows[0];
  if (!msg || msg.folder !== 'inbox') return;

  const sender = normEmail(msg.fromEmail);
  if (!sender) return;
  const senderDomain = emailDomain(sender);

  const { customers: custRows, suppliers: supRows } = await loadContacts();

  let match: ContactMatch | null = null;
  for (const c of custRows) {
    const ce = normEmail(c.email);
    if (ce === sender || (senderDomain && ce && emailDomain(ce) === senderDomain && !FREE_MAIL_DOMAINS.has(senderDomain))) {
      match = { category: 'customer', id: c.id, label: c.fullName };
      break;
    }
  }
  if (!match) {
    for (const s of supRows) {
      const se = normEmail(s.email);
      if (se === sender || (senderDomain && se && emailDomain(se) === senderDomain && !FREE_MAIL_DOMAINS.has(senderDomain))) {
        match = { category: 'supplier', id: s.id, label: s.name };
        break;
      }
    }
  }

  if (match) {
    await db.update(mailMessages).set({ category: match.category, categoryId: match.id, categoryLabel: match.label }).where(eq(mailMessages.id, msgId));
  }
}

// Match a WhatsApp chat (by phone / contact name) against customers then suppliers.
export async function classifyWhatsAppChat(chatId: string): Promise<void> {
  const rows = await db.select().from(whatsappChats).where(eq(whatsappChats.id, chatId));
  const chat = rows[0];
  if (!chat) return;

  const { customers: custRows, suppliers: supRows } = await loadContacts();

  let match: ContactMatch | null = null;
  for (const c of custRows) {
    if (phonesEqual(chat.contactPhone, c.phone) || namesOverlap(chat.contactName, c.fullName)) {
      match = { category: 'customer', id: c.id, label: c.fullName };
      break;
    }
  }
  if (!match) {
    for (const s of supRows) {
      if (phonesEqual(chat.contactPhone, s.phone) || namesOverlap(chat.contactName, s.name) || namesOverlap(chat.contactName, s.contactPerson)) {
        match = { category: 'supplier', id: s.id, label: s.name };
        break;
      }
    }
  }

  if (match) {
    const patch: Record<string, any> = { category: match.category, categoryId: match.id, categoryLabel: match.label };
    if (match.category === 'customer') patch.customerId = match.id;
    await db.update(whatsappChats).set(patch).where(eq(whatsappChats.id, chatId));
  }
}

// Re-run classification over all unclassified / uncategorized records.
export async function classifyAll(): Promise<{ mail: number; chats: number }> {
  const uncategorizedMail = await db.select({ id: mailMessages.id }).from(mailMessages).where(or(isNull(mailMessages.category), eq(mailMessages.category, 'inbox')));
  const mailIds = uncategorizedMail.map(r => r.id);
  for (const id of mailIds) await classifyMailMessage(id);

  const uncategorizedChats = await db.select({ id: whatsappChats.id }).from(whatsappChats).where(or(isNull(whatsappChats.category), eq(whatsappChats.category, 'inbox')));
  const chatIds = uncategorizedChats.map(r => r.id);
  for (const id of chatIds) await classifyWhatsAppChat(id);

  return { mail: mailIds.length, chats: chatIds.length };
}
