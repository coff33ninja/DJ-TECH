import { ulid } from 'ulid';
import { eq, desc, notInArray, and } from 'drizzle-orm';
import { db } from '../db/index';
import { customerRequests, whatsappChats, jobs, invoices, quotes, customers } from '../db/schema';
import { readSetting } from './documents';
import { buildInvoicePdf, buildQuotePdf } from './billing';

// Injected by whatsapp.ts so this module never imports it (avoids a cycle).
export interface BotTransport {
  sendText(to: string, text: string): Promise<unknown>;
  sendDocument(to: string, content: Buffer, filename: string, mimetype?: string, caption?: string): Promise<unknown>;
}

// Vowel-free tracking code alphabet (matches server.generateTrackingCode).
const TRACKING_CODE_RE = /\b[A-HJ-NP-Z2-9]{8}\b/;
const JOB_NO_RE = /\bDJ-\d{4}-\d+\b/i;
// Matches both invoice and quote numbers, e.g. INV-2026-0001 / QUO-2026-0001.
const DOC_NO_RE = /\b(INV|QUO)-\d{4}-\d+\b/i;

function extractText(message: any): string {
  if (!message) return '';
  if (typeof message.conversation === 'string') return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  return '';
}

async function getMenuText(): Promise<string> {
  const bizName = (await readSetting('business_name', 'DJ TECH')) || 'DJ TECH';
  const fallback = [
    `*${bizName} — Automated Assistant*`,
    '',
    'Reply with one of the following:',
    '',
    '1. *MENU* — show this menu again',
    '2. *STATUS <job no. or code>* — check your repair',
    '   e.g. STATUS DJ-2026-0001',
    '3. *INVOICE <invoice no.>* — get a copy of your invoice',
    '   e.g. INVOICE INV-2026-0001',
    '4. *QUOTE <quote no.>* — get a copy of your quote',
    '   e.g. QUOTE QUO-2026-0001',
    '',
    'You can also just send your job number or tracking code.',
  ].join('\n');
  return (await readSetting('whatsapp_bot_menu', fallback)) || fallback;
}

function parseKeywords(text: string): Array<{ key: string; reply: string }> {
  return text
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('|');
      if (idx <= 0) return null;
      return { key: line.slice(0, idx).trim().toLowerCase(), reply: line.slice(idx + 1).trim() };
    })
    .filter((e): e is { key: string; reply: string } => Boolean(e && e.key && e.reply));
}

async function getPublicBaseUrl(): Promise<string> {
  return (await readSetting('public_base_url', 'http://192.168.0.100:3000')).replace(/\/+$/, '');
}

async function findJobByRef(text: string): Promise<{ job: any; ref: string } | null> {
  const jobNoMatch = text.match(JOB_NO_RE);
  if (jobNoMatch) {
    const rows = await db.select().from(jobs).where(eq(jobs.jobNumber, jobNoMatch[0].toUpperCase()));
    if (rows[0]) return { job: rows[0], ref: jobNoMatch[0].toUpperCase() };
  }
  const codeMatch = text.match(TRACKING_CODE_RE);
  if (codeMatch) {
    const rows = await db.select().from(jobs).where(eq(jobs.trackingCode, codeMatch[0].toUpperCase()));
    if (rows[0]) return { job: rows[0], ref: codeMatch[0].toUpperCase() };
  }
  return null;
}

export async function buildStatusReply(job: any): Promise<string> {  const baseUrl = await getPublicBaseUrl();
  const lines: string[] = [`*Job ${job.jobNumber}*`, `Status: *${job.status}*`];
  if (job.reportedProblem) lines.push(`Reported: ${job.reportedProblem}`);
  if (job.customerVisibleNotes) lines.push(`Note: ${job.customerVisibleNotes}`);
  if (job.expectedCompletionDate) {
    lines.push(`Expected: ${new Date(job.expectedCompletionDate).toLocaleDateString()}`);
  }
  if (job.trackingCode) lines.push(``, `Track it live: ${baseUrl}/track/${job.trackingCode}`);
  return lines.join('\n');
}

export interface BotDecision {
  intent: string;
  reference: string | null;
  replyText: string;
  // Optional document to send after the text reply (invoice/quote PDF).
  document?: { type: 'invoice' | 'quote'; id: string; filename: string };
}

export async function decideBotResponse(text: string): Promise<BotDecision> {
  const lower = text.trim().toLowerCase();
  const normalized = lower.replace(/\s+/g, ' ');

  // 1. Menu / greeting
  if (
    /^(menu|help|start|hi|hello|hey|good (morning|afternoon|evening))[\s!?.,]*$/.test(normalized) ||
    normalized.includes(' menu') ||
    normalized === '1'
  ) {
    return { intent: 'menu', reference: null, replyText: await getMenuText() };
  }

  // 2. Invoice request
  if (lower.includes('invoice') || /^inv-\d{4}-\d+/.test(lower)) {
    const docMatch = text.match(DOC_NO_RE);
    let invoice: any;
    let ref = docMatch ? docMatch[0].toUpperCase() : null;
    if (ref) {
      const rows = await db.select().from(invoices).where(eq(invoices.invoiceNumber, ref));
      invoice = rows[0];
    } else {
      const found = await findJobByRef(text);
      if (found?.job?.id) {
        const rows = await db.select().from(invoices).where(eq(invoices.jobId, found.job.id)).limit(1);
        invoice = rows[0];
        ref = invoice?.invoiceNumber || null;
      }
    }
    if (!invoice) {
      return {
        intent: 'invoice',
        reference: ref,
        replyText: 'I couldn\'t find that invoice. Please send it like: INVOICE INV-2026-0001 (or your job number / tracking code).',
      };
    }
    const bizName = (await readSetting('business_name', 'DJ TECH')) || 'DJ TECH';
    return {
      intent: 'invoice',
      reference: ref,
      replyText: `Here is your invoice from ${bizName}.`,
      document: { type: 'invoice', id: invoice.id, filename: `${invoice.invoiceNumber}.pdf` },
    };
  }

  // 3. Quote request
  if (lower.includes('quote') || /^quo-\d{4}-\d+/.test(lower)) {
    const docMatch = text.match(DOC_NO_RE);
    let quote: any;
    let ref = docMatch ? docMatch[0].toUpperCase() : null;
    if (ref) {
      const rows = await db.select().from(quotes).where(eq(quotes.quoteNumber, ref));
      quote = rows[0];
    } else {
      const found = await findJobByRef(text);
      if (found?.job?.id) {
        const rows = await db.select().from(quotes).where(eq(quotes.jobId, found.job.id)).limit(1);
        quote = rows[0];
        ref = quote?.quoteNumber || null;
      }
    }
    if (!quote) {
      return {
        intent: 'quote',
        reference: ref,
        replyText: 'I couldn\'t find that quote. Please send it like: QUOTE QUO-2026-0001 (or your job number / tracking code).',
      };
    }
    const bizName = (await readSetting('business_name', 'DJ TECH')) || 'DJ TECH';
    return {
      intent: 'quote',
      reference: ref,
      replyText: `Here is your quote from ${bizName}.`,
      document: { type: 'quote', id: quote.id, filename: `${quote.quoteNumber}.pdf` },
    };
  }

  // 4. Status lookup (job number or tracking code)
  const foundJob = await findJobByRef(text);
  if (foundJob) {
    return { intent: 'status', reference: foundJob.ref, replyText: await buildStatusReply(foundJob.job) };
  }

  // 5. Custom keywords (settings: whatsapp_bot_keywords, one "key | reply" per line)
  const keywordCfg = await readSetting('whatsapp_bot_keywords', '');
  for (const { key, reply } of parseKeywords(keywordCfg)) {
    if (normalized.includes(key)) {
      return { intent: `keyword:${key}`, reference: null, replyText: reply };
    }
  }

  // 6. Unknown
  return {
    intent: 'unknown',
    reference: null,
    replyText: `I didn't understand that. Here is how I can help:\n\n${await getMenuText()}`,
  };
}

// Called from whatsapp.ts after an incoming message is persisted. Returns false
// when the bot is disabled or the message is not bot-handled.
export async function handleCustomerMessage(msg: any, transport: BotTransport): Promise<boolean> {
  try {
    const key = msg?.key;
    if (!key?.remoteJid || key.fromMe) return false;
    const chatId = String(key.remoteJid);
    const text = extractText(msg.message);
    if (!text) return false;
    if ((await readSetting('whatsapp_bot_enabled', '1')) !== '1') return false;

    const decision = await decideBotResponse(text);

    const chatRows = await db.select({ contactName: whatsappChats.contactName })
      .from(whatsappChats).where(eq(whatsappChats.id, chatId));
    const senderName = chatRows[0]?.contactName || null;
    const senderPhone = chatId.split('@')[0].replace(/\D/g, '') || null;

    await db.insert(customerRequests).values({
      id: ulid(),
      chatId,
      senderPhone,
      senderName,
      intent: decision.intent,
      requestText: text,
      reference: decision.reference,
      replyText: decision.replyText,
    });

    await transport.sendText(chatId, decision.replyText);

    if (decision.document) {
      const pdf = decision.document.type === 'invoice'
        ? await buildInvoicePdf(decision.document.id)
        : await buildQuotePdf(decision.document.id);
      if (pdf) {
        await transport.sendDocument(chatId, pdf, decision.document.filename, 'application/pdf');
      }
    }
    return true;
  } catch (err) {
    console.error('[bot] handle failed:', err);
    return false;
  }
}

export async function getCustomerRequests(opts: { page?: number; pageSize?: number; includeArchived?: boolean } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(Math.max(1, opts.pageSize ?? 100), 500);
  const where = opts.includeArchived ? undefined : eq(customerRequests.archived, 0);
  const rows = await db.select().from(customerRequests)
    .where(where)
    .orderBy(desc(customerRequests.handledAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const countRows = await db.select({ n: db.$count(customerRequests, where) });
  const total = Number(countRows[0]?.n || 0);
  return { rows, total, page, pageSize };
}

export async function setCustomerRequestArchived(id: string, archived: boolean) {
  const updated = await db.update(customerRequests).set({ archived: archived ? 1 : 0 }).where(eq(customerRequests.id, id)).returning();
  return updated[0] || null;
}

// Push the current status of a customer's open jobs to their WhatsApp.
export async function sendCustomerStatus(customerId: string, transport: BotTransport): Promise<{ ok: boolean; error?: string; sent?: boolean; jobs?: number }> {
  const custRows = await db.select().from(customers).where(eq(customers.id, customerId));
  const customer = custRows[0];
  if (!customer) return { ok: false, error: 'Customer not found' };

  let target: string | null = null;
  const chatRows = await db.select({ id: whatsappChats.id }).from(whatsappChats).where(eq(whatsappChats.customerId, customerId)).limit(1);
  if (chatRows[0]) target = chatRows[0].id;
  if (!target && customer.phone) {
    const digits = String(customer.phone).replace(/\D/g, '');
    if (digits) target = `${digits}@s.whatsapp.net`;
  }
  if (!target) return { ok: false, error: 'No WhatsApp chat or phone linked to this customer' };

  const openJobs = await db.select().from(jobs)
    .where(and(eq(jobs.customerId, customerId), notInArray(jobs.status, ['Collected', 'Completed', 'Cancelled'])))
    .orderBy(desc(jobs.dateReceived));
  if (!openJobs.length) return { ok: false, error: 'Customer has no open jobs' };

  const blocks: string[] = [];
  for (const job of openJobs) blocks.push(await buildStatusReply(job));
  const name = customer.fullName || customer.companyName || 'Customer';
  const text = `*Status update for ${name}*\n\n${blocks.join('\n\n---\n\n')}`;
  await transport.sendText(target, text);
  return { ok: true, sent: true, jobs: openJobs.length };
}
