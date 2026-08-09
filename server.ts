import express from 'express';
import path from 'path';
import cors from 'cors';
import multer from 'multer';
import { createHash, randomBytes } from 'crypto';
import { createServer as createViteServer } from 'vite';
import { db } from './src/db/index';
import { ensureSchema } from './src/db/init';
import { applyPendingRestore, exportDatabase, resetDatabaseData, restoreFromBackup } from './src/services/backup';
import { customers, devices } from './src/db/schema';
import { jobs, timelineEvents, inventory, purchases, purchaseItems, quotes, invoices, payments, quoteItems, invoiceItems, settings, auditLog } from './src/db/schema';
import { suppliers, stockMovements } from './src/db/schema';
import { eq, desc, sql, max, like, inArray, and, count, isNotNull } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getMailConfig, isMailConfigured, mailConfigSummary, testMailConnection, syncMail, mirrorClassifiedMail, sendMail, getMailMessages, getMailMessage, markMailRead, startMailPolling } from './src/services/email';
import { classifyAll } from './src/services/classify';
import { getWhatsAppStatus, startWhatsApp, logoutWhatsApp, sendWhatsAppText, sendWhatsAppDocument, getWhatsAppChats, getWhatsAppMessages, markChatRead, createCustomerFromChat } from './src/services/whatsapp';
import { getCustomerRequests, setCustomerRequestArchived, sendCustomerStatus } from './src/services/bot';
import { saveDocument, listDocuments, getDocument, getDocumentFilePath, deleteDocument, setDocumentSendAlong, sendJobIntake, getJobPhotos, listJobAttachments, getJobAttachment, saveJobAttachment, deleteJobAttachment } from './src/services/documents';
import { buildQuotePdf, buildInvoicePdf, sendBillingDoc } from './src/services/billing';

// Billing/display name for a customer: the company name when the customer is
// a company (with one set), otherwise the individual's full name.
const billingName = sql<string>`CASE WHEN ${customers.customerType} = 'company' AND ${customers.companyName} IS NOT NULL AND trim(${customers.companyName}) <> '' THEN ${customers.companyName} ELSE ${customers.fullName} END`;

// Next sequential document number for the current year (e.g. QUO-2026-003),
// based on the highest existing number per year, not row count.
async function nextDocNumber(table: any, column: any, prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  const digitStart = prefix.length + year.toString().length + 3;
  const latest = await db.select({
    lastNum: max(sql<number>`CAST(substr(${column}, ${digitStart}) AS INTEGER)`),
  }).from(table).where(like(column, `${prefix}-${year}-%`));
  return `${prefix}-${year}-${String((Number(latest[0]?.lastNum) || 0) + 1).padStart(3, '0')}`;
}

// Read a business setting from the settings table, with a fallback default.
async function getSettingValue(key: string, fallback: string): Promise<string> {
  try {
    const rows = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key));
    return rows[0]?.value ?? fallback;
  } catch {
    return fallback;
  }
}

// SHA-256 hash for sensitive fields (e.g. device passwords). Not meant for
// authentication — the customer password is only needed for verification,
// never displayed back, so a one-way hash is enough.
function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// Short unguessable tracking code for a job's public progress page. Uses a
// vowel-free alphabet (A-Z without I/O, 2-9) so codes are easy to read out
// loud and never spell words.
const TRACKING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateTrackingCode(len = 8): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += TRACKING_ALPHABET[bytes[i] % TRACKING_ALPHABET.length];
  return out;
}

// Public base URL used in links sent to customers (e.g. job tracking links).
// Configured as the `public_base_url` setting; falls back to the LAN address.
async function getPublicBaseUrl(): Promise<string> {
  return (await getSettingValue('public_base_url', 'http://192.168.0.100:3000')).replace(/\/+$/, '');
}

// When a tracking code is supplied on a quote/invoice PDF link, verify it
// matches the code of the job the document belongs to. Staff requests carry no
// code and are always allowed; a wrong/missing code blocks the customer path.
async function verifyDocTrackingCode(table: any, docId: string, code: unknown): Promise<boolean> {
  if (!code) return true;
  const rows = await db.select({ jobId: table.jobId }).from(table).where(eq(table.id, docId));
  const jobId = rows[0]?.jobId;
  if (!jobId) return false;
  const jobRows = await db.select({ trackingCode: jobs.trackingCode }).from(jobs).where(eq(jobs.id, jobId));
  return jobRows[0]?.trackingCode === String(code).trim().toUpperCase();
}

// Record an audit entry. Fire-and-forget from handlers: failures must never
// break the primary action.
async function logAudit(req: any, action: string, entityType: string, entityId: string | undefined, description: string) {
  try {
    const user = req.get('X-User') || 'admin';
    await db.insert(auditLog).values({
      id: ulid(),
      user,
      action,
      entityType,
      entityId,
      description,
    });
  } catch (error) {
    console.error('audit log write failed:', error);
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT ?? 3000);

  // If a pending restore was staged, apply it before anything else reads the
  // DB. Drops tables via SQL, so no file deletion is involved.
  try {
    const { restored, counts } = await applyPendingRestore();
    if (restored) {
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      console.log(`[db] Restore applied from pending backup: ${total} rows across ${Object.keys(counts).length} tables`);
    }
  } catch (err) {
    console.error('[db] Failed to apply pending restore:', (err as any)?.message || err);
  }

  // Fresh DB (or first boot after a delete) gets the full schema. Idempotent.
  await ensureSchema();

  app.use(cors());
  app.use(express.json());

  // File uploads for server-hosted documents (memory storage — the documents
  // service writes each upload to data/documents and records it in the DB).
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
  });

  // DB backup imports can be large (a full backup with message history is
  // tens of MB), so use a much higher limit than document uploads. Multer
  // errors are translated to JSON responses (Express' default handler would
  // otherwise send an HTML page that the client can't parse).
  const importUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 512 * 1024 * 1024 },
  });

  function importFile() {
    return (req: any, res: any, next: (err?: any) => void) => {
      importUpload.single('file')(req, res, (err: any) => {
        if (err) {
          const tooBig = err?.code === 'LIMIT_FILE_SIZE';
          return res.status(400).json({ error: tooBig ? 'Backup file is too large (max 512 MB)' : `Upload failed: ${err?.message || err}` });
        }
        next();
      });
    };
  }

  // API Routes - Dashboard
  app.get('/api/dashboard', async (req, res) => {
    try {
      const openJobsCount = await db.select({ count: sql<number>`count(*)` }).from(jobs).where(sql`${jobs.status} != 'Completed' AND ${jobs.status} != 'Collected' AND ${jobs.status} != 'Cancelled'`);
      const waitingPartsCount = await db.select({ count: sql<number>`count(*)` }).from(jobs).where(eq(jobs.status, 'Awaiting Parts'));
      const unbilledInvoices = await db.select({ total: sql<number>`sum(total - amount_paid)` }).from(invoices).where(sql`status != 'Paid' AND status != 'Cancelled'`);
      const lowStockCount = await db.select({ count: sql<number>`count(*)` }).from(inventory).where(sql`quantity <= minimum_stock_level`);
      
      const recentJobs = await db.select().from(jobs).orderBy(desc(jobs.dateReceived)).limit(5);

      // Revenue figures from real payment data
      const thisMonth = await db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(payments).where(sql`strftime('%Y-%m', ${payments.date}, 'unixepoch') = strftime('%Y-%m', 'now')`);
      const lastMonth = await db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(payments).where(sql`strftime('%Y-%m', ${payments.date}, 'unixepoch') = strftime('%Y-%m', 'now', '-1 month')`);
      const todayRevenue = await db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(payments).where(sql`date(${payments.date}, 'unixepoch') = date('now')`);
      const monthRevenue = thisMonth[0]?.total || 0;
      const prevMonthRevenue = lastMonth[0]?.total || 0;
      const revenueChange = prevMonthRevenue > 0 ? Math.round(((monthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100) : (monthRevenue > 0 ? 100 : 0);
      const dailyGoal = parseFloat(await getSettingValue('daily_revenue_goal', '5000')) || 0;

      // Recent activities: recent payments, timeline events, and new customers
      const recentPayments = await db.select({
        timestamp: payments.date,
        title: sql<string>`'Payment Received'`.as('title'),
        subtitle: sql<string>`${invoices.invoiceNumber} || ' (' || ${customers.fullName} || ')'`.as('subtitle'),
        detail: sql<string>`coalesce(${payments.paymentMethod}, 'Payment') || ' R' || ${payments.amount}`.as('detail'),
      }).from(payments)
        .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
        .innerJoin(customers, eq(payments.customerId, customers.id))
        .orderBy(desc(payments.date)).limit(5);

      const recentEvents = await db.select({
        timestamp: timelineEvents.timestamp,
        title: sql<string>`CASE ${timelineEvents.eventType}
          WHEN 'status_change' THEN 'Status Change'
          WHEN 'part_ordered' THEN 'Part / Delivery Update'
          WHEN 'note' THEN 'Note Added'
          ELSE 'Update' END`.as('title'),
        subtitle: sql<string>`${jobs.jobNumber}`.as('subtitle'),
        detail: timelineEvents.description,
      }).from(timelineEvents)
        .innerJoin(jobs, eq(timelineEvents.jobId, jobs.id))
        .orderBy(desc(timelineEvents.timestamp)).limit(5);

      const recentCustomers = await db.select({
        timestamp: customers.createdAt,
        title: sql<string>`'New Customer Registered'`.as('title'),
        subtitle: customers.fullName,
        detail: sql<string>`'Portal'`.as('detail'),
      }).from(customers)
        .orderBy(desc(customers.createdAt)).limit(3);

      const activities = [...recentPayments, ...recentEvents, ...recentCustomers]
        .sort((a: any, b: any) => (b.timestamp?.getTime() || 0) - (a.timestamp?.getTime() || 0))
        .slice(0, 6);

      res.json({
        openJobs: openJobsCount[0]?.count || 0,
        waitingParts: waitingPartsCount[0]?.count || 0,
        unpaidInvoicesTotal: unbilledInvoices[0]?.total || 0,
        lowStockAlerts: lowStockCount[0]?.count || 0,
        recentJobs,
        monthRevenue,
        revenueChange,
        todayRevenue: todayRevenue[0]?.total || 0,
        dailyGoal,
        activities,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
  });

  // API Routes - Quotes & Invoices
  app.get('/api/quotes', async (req, res) => {
    try {
      const allQuotes = await db.select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        jobId: quotes.jobId,
        customerId: quotes.customerId,
        status: quotes.status,
        subtotal: quotes.subtotal,
        discount: quotes.discount,
        tax: quotes.tax,
        total: quotes.total,
        createdAt: quotes.createdAt,
        validUntil: quotes.validUntil,
        customerName: billingName.as('customerName'),
      }).from(quotes).leftJoin(customers, eq(quotes.customerId, customers.id)).orderBy(desc(quotes.createdAt));
      res.json(allQuotes);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch quotes' });
    }
  });

  app.post('/api/quotes', async (req, res) => {
    try {
      const { customerId, jobId, validUntil, discount = 0, status = 'Draft', items = [] } = req.body;
      if (!customerId) return res.status(400).json({ error: 'customerId is required' });
      if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'At least one line item is required' });

      const normalizedItems = items
        .map((it: any) => ({
          name: String(it.name || '').trim(),
          description: it.description || null,
          quantity: Math.max(1, parseInt(it.quantity, 10) || 1),
          unitPrice: parseFloat(it.unitPrice) || 0,
        }))
        .filter(it => it.name);
      if (normalizedItems.length === 0) return res.status(400).json({ error: 'At least one line item is required' });

      const quoteId = ulid();
      const quoteNumber = await nextDocNumber(quotes, quotes.quoteNumber, 'QUO');
      const subtotal = normalizedItems.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
      const vatRate = parseFloat(await getSettingValue('vat_rate', '0.15'));
      const tax = subtotal * vatRate;
      const discountValue = parseFloat(discount) || 0;
      const total = subtotal - discountValue + tax;

      const newQuote = await db.insert(quotes).values({
        id: quoteId,
        quoteNumber,
        customerId,
        jobId: jobId || null,
        status,
        subtotal,
        discount: discountValue,
        tax,
        total,
        validUntil: validUntil ? new Date(validUntil) : null,
      }).returning();

      await db.insert(quoteItems).values(normalizedItems.map(it => ({
        id: ulid(),
        quoteId,
        name: it.name,
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        lineTotal: it.quantity * it.unitPrice,
      })));

      res.status(201).json({ ...newQuote[0], items: normalizedItems });
      void logAudit(req, 'quote.created', 'quote', quoteId, `Quote ${quoteNumber} created for ${total.toFixed(2)}`);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to create quote' });
    }
  });

  app.get('/api/quotes/:id', async (req, res) => {
    try {
      const quote = await db.select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        jobId: quotes.jobId,
        customerId: quotes.customerId,
        status: quotes.status,
        subtotal: quotes.subtotal,
        discount: quotes.discount,
        tax: quotes.tax,
        total: quotes.total,
        createdAt: quotes.createdAt,
        validUntil: quotes.validUntil,
        customerName: billingName.as('customerName'),
        customerPhone: customers.phone,
        customerEmail: customers.email,
      }).from(quotes).leftJoin(customers, eq(quotes.customerId, customers.id)).where(eq(quotes.id, req.params.id));
      if (!quote.length) return res.status(404).json({ error: 'Not found' });
      const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, req.params.id));
      res.json({ ...quote[0], items });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch quote' });
    }
  });

  app.get('/api/quotes/:id/pdf', async (req, res) => {
    try {
      if (!(await verifyDocTrackingCode(quotes, req.params.id, req.query.code))) {
        return res.status(404).json({ error: 'Not found' });
      }
      const pdf = await buildQuotePdf(req.params.id);
      if (!pdf) return res.status(404).json({ error: 'Not found' });
      const row = await db.select({ quoteNumber: quotes.quoteNumber }).from(quotes).where(eq(quotes.id, req.params.id));
      const name = `${(row[0]?.quoteNumber || 'QUOTE').replace(/[^A-Za-z0-9-]/g, '_')}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      res.send(pdf);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to build quote PDF' });
    }
  });

  app.post('/api/quotes/:id/send', async (req, res) => {
    try {
      const quote = await db.select({ quoteNumber: quotes.quoteNumber }).from(quotes).where(eq(quotes.id, req.params.id));
      if (!quote.length) return res.status(404).json({ error: 'Not found' });
      const result = await sendBillingDoc('quote', req.params.id);
      if (result.pdf) {
        await db.update(quotes).set({ status: 'Sent' }).where(eq(quotes.id, req.params.id));
      }
      res.json(result);
      void logAudit(req, 'quote.sent', 'quote', req.params.id,
        `Quote ${quote[0].quoteNumber} sent (whatsapp:${result.whatsapp} email:${result.email})`);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to send quote' });
    }
  });

  app.patch('/api/quotes/:id', async (req, res) => {
    try {
      const { status } = req.body;
      if (!status) return res.status(400).json({ error: 'status is required' });
      const updated = await db.update(quotes).set({ status }).where(eq(quotes.id, req.params.id)).returning();
      if (!updated.length) return res.status(404).json({ error: 'Not found' });
      res.json(updated[0]);
      const action = status === 'Approved' ? 'quote.approved' : 'quote.status_changed';
      void logAudit(req, action, 'quote', req.params.id, `Quote ${updated[0].quoteNumber} status -> ${status}`);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update quote' });
    }
  });

  app.delete('/api/quotes/:id', async (req, res) => {
    try {
      const converted = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.quoteId, req.params.id));
      if (converted.length) return res.status(409).json({ error: 'Cannot delete a quote that has been converted to an invoice' });
      await db.delete(quoteItems).where(eq(quoteItems.quoteId, req.params.id));
      await db.delete(quotes).where(eq(quotes.id, req.params.id));
      res.status(204).end();
      void logAudit(req, 'quote.deleted', 'quote', req.params.id, 'Quote deleted');
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete quote' });
    }
  });

  app.post('/api/quotes/:id/convert', async (req, res) => {
    try {
      const quote = await db.select().from(quotes).where(eq(quotes.id, req.params.id));
      if (!quote.length) return res.status(404).json({ error: 'Not found' });
      const q = quote[0];
      const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, req.params.id));

      const invoiceId = ulid();
      const invoiceNumber = await nextDocNumber(invoices, invoices.invoiceNumber, 'INV');

      await db.insert(invoices).values({
        id: invoiceId,
        invoiceNumber,
        customerId: q.customerId,
        jobId: q.jobId,
        quoteId: q.id,
        status: 'Draft',
        subtotal: q.subtotal,
        discount: q.discount,
        tax: q.tax,
        total: q.total,
        amountPaid: 0,
      });

      await db.insert(invoiceItems).values(items.map(it => ({
        id: ulid(),
        invoiceId,
        name: it.name,
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        lineTotal: it.lineTotal,
      })));

      res.status(201).json({ invoiceId, invoiceNumber });
      void logAudit(req, 'invoice.created', 'invoice', invoiceId, `Invoice ${invoiceNumber} created from quote ${q.quoteNumber}`);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to convert quote to invoice' });
    }
  });

  app.get('/api/invoices', async (req, res) => {
    try {
      const allInvoices = await db.select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        jobId: invoices.jobId,
        customerId: invoices.customerId,
        quoteId: invoices.quoteId,
        status: invoices.status,
        subtotal: invoices.subtotal,
        discount: invoices.discount,
        tax: invoices.tax,
        total: invoices.total,
        amountPaid: invoices.amountPaid,
        createdAt: invoices.createdAt,
        dueDate: invoices.dueDate,
        customerName: billingName.as('customerName'),
      }).from(invoices).leftJoin(customers, eq(invoices.customerId, customers.id)).orderBy(desc(invoices.createdAt));
      res.json(allInvoices);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch invoices' });
    }
  });

  app.post('/api/invoices', async (req, res) => {
    try {
      const { customerId, jobId, quoteId, dueDate, discount = 0, status = 'Draft', items = [] } = req.body;
      if (!customerId) return res.status(400).json({ error: 'customerId is required' });
      if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'At least one line item is required' });

      const normalizedItems = items
        .map((it: any) => ({
          name: String(it.name || '').trim(),
          description: it.description || null,
          quantity: Math.max(1, parseInt(it.quantity, 10) || 1),
          unitPrice: parseFloat(it.unitPrice) || 0,
        }))
        .filter(it => it.name);
      if (normalizedItems.length === 0) return res.status(400).json({ error: 'At least one line item is required' });

      const invoiceId = ulid();
      const invoiceNumber = await nextDocNumber(invoices, invoices.invoiceNumber, 'INV');
      const subtotal = normalizedItems.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
      const vatRate = parseFloat(await getSettingValue('vat_rate', '0.15'));
      const tax = subtotal * vatRate;
      const discountValue = parseFloat(discount) || 0;
      const total = subtotal - discountValue + tax;

      const newInvoice = await db.insert(invoices).values({
        id: invoiceId,
        invoiceNumber,
        customerId,
        jobId: jobId || null,
        quoteId: quoteId || null,
        status,
        subtotal,
        discount: discountValue,
        tax,
        total,
        amountPaid: 0,
        dueDate: dueDate ? new Date(dueDate) : null,
      }).returning();

      await db.insert(invoiceItems).values(normalizedItems.map(it => ({
        id: ulid(),
        invoiceId,
        name: it.name,
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        lineTotal: it.quantity * it.unitPrice,
      })));

      res.status(201).json({ ...newInvoice[0], items: normalizedItems });
      void logAudit(req, 'invoice.created', 'invoice', invoiceId, `Invoice ${invoiceNumber} created for ${total.toFixed(2)}`);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to create invoice' });
    }
  });

  app.get('/api/invoices/:id', async (req, res) => {
    try {
      const invoice = await db.select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        jobId: invoices.jobId,
        customerId: invoices.customerId,
        quoteId: invoices.quoteId,
        status: invoices.status,
        subtotal: invoices.subtotal,
        discount: invoices.discount,
        tax: invoices.tax,
        total: invoices.total,
        amountPaid: invoices.amountPaid,
        createdAt: invoices.createdAt,
        dueDate: invoices.dueDate,
        customerName: billingName.as('customerName'),
        customerPhone: customers.phone,
        customerEmail: customers.email,
      }).from(invoices).leftJoin(customers, eq(invoices.customerId, customers.id)).where(eq(invoices.id, req.params.id));
      if (!invoice.length) return res.status(404).json({ error: 'Not found' });
      const [items, paymentsList] = await Promise.all([
        db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, req.params.id)),
        db.select().from(payments).where(eq(payments.invoiceId, req.params.id)).orderBy(desc(payments.date)),
      ]);
      res.json({ ...invoice[0], items, payments: paymentsList });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch invoice' });
    }
  });

  app.get('/api/invoices/:id/pdf', async (req, res) => {
    try {
      if (!(await verifyDocTrackingCode(invoices, req.params.id, req.query.code))) {
        return res.status(404).json({ error: 'Not found' });
      }
      const pdf = await buildInvoicePdf(req.params.id);
      if (!pdf) return res.status(404).json({ error: 'Not found' });
      const row = await db.select({ invoiceNumber: invoices.invoiceNumber }).from(invoices).where(eq(invoices.id, req.params.id));
      const name = `${(row[0]?.invoiceNumber || 'INVOICE').replace(/[^A-Za-z0-9-]/g, '_')}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      res.send(pdf);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to build invoice PDF' });
    }
  });

  app.post('/api/invoices/:id/send', async (req, res) => {
    try {
      const invoice = await db.select({ invoiceNumber: invoices.invoiceNumber }).from(invoices).where(eq(invoices.id, req.params.id));
      if (!invoice.length) return res.status(404).json({ error: 'Not found' });
      const result = await sendBillingDoc('invoice', req.params.id);
      if (result.pdf) {
        await db.update(invoices).set({ status: 'Sent' }).where(eq(invoices.id, req.params.id));
      }
      res.json(result);
      void logAudit(req, 'invoice.sent', 'invoice', req.params.id,
        `Invoice ${invoice[0].invoiceNumber} sent (whatsapp:${result.whatsapp} email:${result.email})`);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to send invoice' });
    }
  });

  app.patch('/api/invoices/:id', async (req, res) => {
    try {
      const { status } = req.body;
      if (!status) return res.status(400).json({ error: 'status is required' });
      const invoice = await db.select().from(invoices).where(eq(invoices.id, req.params.id));
      if (!invoice.length) return res.status(404).json({ error: 'Not found' });
      const patch: any = { status };
      if (status === 'Paid') patch.amountPaid = invoice[0].total;
      const updated = await db.update(invoices).set(patch).where(eq(invoices.id, req.params.id)).returning();
      res.json(updated[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update invoice' });
    }
  });

  app.post('/api/invoices/:id/payments', async (req, res) => {
    try {
      const { amount, paymentMethod, reference, notes } = req.body;
      const invoice = await db.select().from(invoices).where(eq(invoices.id, req.params.id));
      if (!invoice.length) return res.status(404).json({ error: 'Not found' });
      const inv = invoice[0];
      const paymentAmount = parseFloat(amount);
      if (!paymentAmount || paymentAmount <= 0) return res.status(400).json({ error: 'Invalid payment amount' });

      await db.insert(payments).values({
        id: ulid(),
        invoiceId: inv.id,
        customerId: inv.customerId,
        amount: paymentAmount,
        paymentMethod,
        reference,
        notes,
      });

      const newPaid = inv.amountPaid + paymentAmount;
      const newStatus = newPaid >= inv.total ? 'Paid' : 'Partially Paid';
      const updated = await db.update(invoices).set({ amountPaid: newPaid, status: newStatus })
        .where(eq(invoices.id, inv.id)).returning();
      res.status(201).json(updated[0]);
      void logAudit(req, 'payment.recorded', 'payment', inv.id, `Payment of ${paymentAmount.toFixed(2)} recorded on invoice ${inv.invoiceNumber}`);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to record payment' });
    }
  });

  app.delete('/api/invoices/:id', async (req, res) => {
    try {
      await db.delete(payments).where(eq(payments.invoiceId, req.params.id));
      await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, req.params.id));
      await db.delete(invoices).where(eq(invoices.id, req.params.id));
      res.status(204).end();
      void logAudit(req, 'invoice.deleted', 'invoice', req.params.id, 'Invoice deleted');
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete invoice' });
    }
  });

  // API Routes - Inventory
  app.get('/api/inventory', async (req, res) => {
    try {
      const items = await db.select({
        id: inventory.id,
        partNumber: inventory.partNumber,
        sku: inventory.sku,
        productName: inventory.productName,
        category: inventory.category,
        manufacturer: inventory.manufacturer,
        model: inventory.model,
        description: inventory.description,
        quantity: inventory.quantity,
        minimumStockLevel: inventory.minimumStockLevel,
        purchasePrice: inventory.purchasePrice,
        sellingPrice: inventory.sellingPrice,
        supplier: inventory.supplier,
        supplierId: inventory.supplierId,
        supplierName: suppliers.name,
        productUrl: inventory.productUrl,
        createdAt: inventory.createdAt,
      }).from(inventory).leftJoin(suppliers, eq(inventory.supplierId, suppliers.id));
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch inventory' });
    }
  });

  app.post('/api/inventory', async (req, res) => {
    try {
      const { productName, category, manufacturer, model, purchasePrice, sellingPrice, supplier, supplierId, quantity } = req.body;
      const newItem = await db.insert(inventory).values({
        id: ulid(),
        productName,
        category,
        manufacturer,
        model,
        purchasePrice,
        sellingPrice,
        supplier: supplierId ? undefined : (supplier || undefined),
        supplierId: supplierId || null,
        quantity: quantity || 0,
      }).returning();

      if ((quantity || 0) > 0) {
        await db.insert(stockMovements).values({
          id: ulid(),
          inventoryId: newItem[0].id,
          type: 'adjustment',
          quantity: quantity || 0,
          reason: 'Initial stock on creation',
        });
      }

      res.status(201).json(newItem[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create inventory item' });
    }
  });

  // API Routes - Product Link Import (Mock Adapter)
  app.post('/api/product-import', async (req, res) => {
    try {
      const { url } = req.body;
      // In a real implementation, this would use Cheerio/Puppeteer to crawl the URL.
      // We simulate a successful crawl for prototype purposes.
      let domain = 'Unknown Supplier';
      try {
        domain = new URL(url).hostname;
      } catch (e) {}

      // Mock extracted data
      const mockExtractedData = {
        productName: `Extracted Product from ${domain}`,
        manufacturer: 'GenericBrand',
        model: 'GB-1000',
        purchasePrice: Math.floor(Math.random() * 2000) + 100,
        supplier: domain,
        productUrl: url,
      };

      res.json(mockExtractedData);
    } catch (error) {
      res.status(500).json({ error: 'Failed to parse product link' });
    }
  });

  app.patch('/api/inventory/:id', async (req, res) => {
    try {
      const existing = await db.select().from(inventory).where(eq(inventory.id, req.params.id));
      if (!existing.length) return res.status(404).json({ error: 'Not found' });

      const fields = ['partNumber', 'sku', 'productName', 'category', 'manufacturer', 'model', 'description', 'purchasePrice', 'sellingPrice', 'minimumStockLevel', 'productUrl'] as const;
      const updates: Record<string, any> = {};
      for (const f of fields) {
        if (req.body[f] !== undefined) updates[f] = req.body[f];
      }
      if (req.body.supplierId !== undefined) {
        updates.supplierId = req.body.supplierId || null;
        updates.supplier = req.body.supplierId ? null : (req.body.supplier !== undefined ? req.body.supplier : updates.supplier);
      } else if (req.body.supplier !== undefined) {
        updates.supplier = req.body.supplier;
        updates.supplierId = null;
      }

      const updated = await db.update(inventory).set(updates).where(eq(inventory.id, req.params.id)).returning();
      res.json(updated[0]);
      void logAudit(req, 'inventory.updated', 'inventory', req.params.id, `Inventory item ${updated[0].productName} updated`);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to update inventory item' });
    }
  });

  // Record a stock movement and adjust the quantity in one step.
  app.post('/api/inventory/:id/movements', async (req, res) => {
    try {
      const existing = await db.select().from(inventory).where(eq(inventory.id, req.params.id));
      if (!existing.length) return res.status(404).json({ error: 'Not found' });

      const { type, quantity, reason, jobId } = req.body;
      if (!['in', 'out', 'adjustment', 'job-used'].includes(type)) return res.status(400).json({ error: 'Invalid movement type' });
      const qty = Math.round(parseFloat(quantity));
      if (!Number.isFinite(qty) || qty === 0) return res.status(400).json({ error: 'quantity must be a non-zero number' });

      // For 'in'/'out', quantity is unsigned; store signed.
      const signed = type === 'in' ? Math.abs(qty) : type === 'out' ? -Math.abs(qty) : qty;
      const newQty = Math.max(0, (existing[0].quantity || 0) + signed);

      await db.update(inventory).set({ quantity: newQty }).where(eq(inventory.id, req.params.id));
      const movement = await db.insert(stockMovements).values({
        id: ulid(),
        inventoryId: req.params.id,
        type,
        quantity: signed,
        reason: reason || '',
        jobId: jobId || null,
      }).returning();

      res.status(201).json({ movement: movement[0], quantity: newQty });
      void logAudit(req, 'inventory.movement', 'inventory', req.params.id, `${type} ${signed > 0 ? '+' : ''}${signed} on ${existing[0].productName}${reason ? ` (${reason})` : ''}`);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to record stock movement' });
    }
  });

  // Movement history for one inventory item.
  app.get('/api/inventory/:id/movements', async (req, res) => {
    try {
      const movements = await db.select().from(stockMovements).where(eq(stockMovements.inventoryId, req.params.id)).orderBy(desc(stockMovements.createdAt)).limit(200);
      res.json(movements);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch movements' });
    }
  });

  // Global stock movement log (latest first).
  app.get('/api/movements', async (req, res) => {
    try {
      const rows = await db.select({
        id: stockMovements.id,
        inventoryId: stockMovements.inventoryId,
        type: stockMovements.type,
        quantity: stockMovements.quantity,
        reason: stockMovements.reason,
        jobId: stockMovements.jobId,
        createdAt: stockMovements.createdAt,
        productName: inventory.productName,
      }).from(stockMovements).leftJoin(inventory, eq(stockMovements.inventoryId, inventory.id)).orderBy(desc(stockMovements.createdAt)).limit(300);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch movements' });
    }
  });

  // API Routes - Suppliers
  app.get('/api/suppliers', async (req, res) => {
    try {
      const rows = await db.select({
        id: suppliers.id,
        name: suppliers.name,
        contactPerson: suppliers.contactPerson,
        phone: suppliers.phone,
        email: suppliers.email,
        address: suppliers.address,
        website: suppliers.website,
        productUrl: suppliers.productUrl,
        paymentTerms: suppliers.paymentTerms,
        vatNumber: suppliers.vatNumber,
        notes: suppliers.notes,
        createdAt: suppliers.createdAt,
      }).from(suppliers).orderBy(suppliers.name);

      const ids = rows.map(r => r.id);
      const [productCounts, spendRows] = await Promise.all([
        ids.length
          ? db.select({ supplierId: inventory.supplierId, count: count() }).from(inventory).where(inArray(inventory.supplierId, ids)).groupBy(inventory.supplierId)
          : Promise.resolve([]),
        ids.length
          ? db.select({ supplierId: purchases.supplierId, total: sql<number>`SUM(${purchaseItems.purchasePrice} * ${purchaseItems.quantity})` })
              .from(purchases).innerJoin(purchaseItems, eq(purchaseItems.purchaseId, purchases.id))
              .where(and(inArray(purchases.supplierId, ids), isNotNull(purchases.supplierId))).groupBy(purchases.supplierId)
          : Promise.resolve([]),
      ]);

      const countMap = new Map(productCounts.map(r => [r.supplierId, r.count]));
      const spendMap = new Map(spendRows.map(r => [r.supplierId, Number(r.total) || 0]));

      res.json(rows.map(r => ({ ...r, productCount: countMap.get(r.id) || 0, totalSpend: spendMap.get(r.id) || 0 })));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch suppliers' });
    }
  });

  app.post('/api/suppliers', async (req, res) => {
    try {
      const { name, contactPerson, phone, email, address, website, productUrl, paymentTerms, vatNumber, notes } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });
      const newSupplier = await db.insert(suppliers).values({
        id: ulid(),
        name,
        contactPerson,
        phone,
        email,
        address,
        website,
        productUrl,
        paymentTerms,
        vatNumber,
        notes,
      }).returning();
      res.status(201).json(newSupplier[0]);
      void logAudit(req, 'supplier.created', 'supplier', newSupplier[0].id, `Supplier ${name} created`);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to create supplier' });
    }
  });

  app.patch('/api/suppliers/:id', async (req, res) => {
    try {
      const existing = await db.select().from(suppliers).where(eq(suppliers.id, req.params.id));
      if (!existing.length) return res.status(404).json({ error: 'Not found' });

      const fields = ['name', 'contactPerson', 'phone', 'email', 'address', 'website', 'productUrl', 'paymentTerms', 'vatNumber', 'notes'] as const;
      const updates: Record<string, any> = {};
      for (const f of fields) {
        if (req.body[f] !== undefined) updates[f] = req.body[f];
      }
      const updated = await db.update(suppliers).set(updates).where(eq(suppliers.id, req.params.id)).returning();
      res.json(updated[0]);
      void logAudit(req, 'supplier.updated', 'supplier', req.params.id, `Supplier ${updated[0].name} updated`);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to update supplier' });
    }
  });

  // API Routes - Purchases & ETA Tracking
  app.get('/api/purchases', async (req, res) => {
    try {
      const allPurchases = await db.select({
        id: purchases.id,
        supplier: purchases.supplier,
        supplierId: purchases.supplierId,
        supplierName: suppliers.name,
        orderNumber: purchases.orderNumber,
        orderDate: purchases.orderDate,
        expectedDeliveryDate: purchases.expectedDeliveryDate,
        actualDeliveryDate: purchases.actualDeliveryDate,
        deliveryStatus: purchases.deliveryStatus,
        trackingNumber: purchases.trackingNumber,
        trackingUrl: purchases.trackingUrl,
        customerId: purchases.customerId,
        customerName: billingName.as('customerName'),
        jobId: purchases.jobId,
        jobNumber: jobs.jobNumber,
      }).from(purchases)
        .leftJoin(customers, eq(purchases.customerId, customers.id))
        .leftJoin(jobs, eq(purchases.jobId, jobs.id))
        .leftJoin(suppliers, eq(purchases.supplierId, suppliers.id))
        .orderBy(desc(purchases.orderDate));
      res.json(allPurchases);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch purchases' });
    }
  });

  app.get('/api/purchases/:id', async (req, res) => {
    try {
      const rows = await db.select({
        id: purchases.id,
        supplier: purchases.supplier,
        supplierId: purchases.supplierId,
        supplierName: suppliers.name,
        orderNumber: purchases.orderNumber,
        orderDate: purchases.orderDate,
        expectedDeliveryDate: purchases.expectedDeliveryDate,
        actualDeliveryDate: purchases.actualDeliveryDate,
        deliveryStatus: purchases.deliveryStatus,
        trackingNumber: purchases.trackingNumber,
        trackingUrl: purchases.trackingUrl,
        customerId: purchases.customerId,
        customerName: billingName.as('customerName'),
        jobId: purchases.jobId,
        jobNumber: jobs.jobNumber,
      }).from(purchases)
        .leftJoin(customers, eq(purchases.customerId, customers.id))
        .leftJoin(jobs, eq(purchases.jobId, jobs.id))
        .leftJoin(suppliers, eq(purchases.supplierId, suppliers.id))
        .where(eq(purchases.id, req.params.id));
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      const items = await db.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, req.params.id));
      res.json({ ...rows[0], items });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch purchase' });
    }
  });

  // Add delivered purchase quantity to inventory stock and log the movement.
  async function addStockFromDelivery(inventoryId: string, qty: number, purchaseId: string) {
    if (!inventoryId || !qty) return;
    const row = await db.select({ quantity: inventory.quantity, productName: inventory.productName }).from(inventory).where(eq(inventory.id, inventoryId));
    if (!row.length) return;
    const newQty = (row[0].quantity || 0) + qty;
    await db.update(inventory).set({ quantity: newQty }).where(eq(inventory.id, inventoryId));
    await db.insert(stockMovements).values({
      id: ulid(),
      inventoryId,
      type: 'in',
      quantity: qty,
      reason: `Purchase delivered (PO ${purchaseId.slice(0, 8)})`,
    });
  }

  // When a required part is ordered for a job, auto-set that job to 'Awaiting Parts'
  // unless it has already moved further along the workflow.
  async function syncJobForParts(jobId: string) {
    if (!jobId) return;
    const row = await db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, jobId));
    if (!row.length) return;
    const waiting = ['Received', 'Diagnosing', 'Awaiting Approval', 'Awaiting Parts'];
    if (waiting.includes(row[0].status)) {
      await db.update(jobs).set({ status: 'Awaiting Parts' }).where(eq(jobs.id, jobId));
      await db.insert(timelineEvents).values({
        id: ulid(),
        jobId,
        eventType: 'part_ordered',
        description: 'Part ordered — waiting for delivery.',
      });
    }
  }

  app.post('/api/purchases', async (req, res) => {
    try {
      const { supplier, supplierId, orderNumber, orderDate, expectedDeliveryDate, actualDeliveryDate, deliveryStatus = 'Planned', trackingNumber, trackingUrl, customerId, jobId, items = [] } = req.body;
      if (!supplier && !supplierId) return res.status(400).json({ error: 'supplier is required' });

      const id = ulid();
      // When linked to a supplier record, keep the legacy supplier column in
      // sync with the supplier name (it is NOT NULL and used for display).
      let supplierName = supplier;
      if (supplierId && !supplierName) {
        const sup = await db.select({ name: suppliers.name }).from(suppliers).where(eq(suppliers.id, supplierId));
        if (sup.length) supplierName = sup[0].name;
      }

      await db.insert(purchases).values({
        id,
        supplier: supplierName || 'Unknown Supplier',
        supplierId: supplierId || null,
        orderNumber,
        orderDate: orderDate ? new Date(orderDate) : new Date(),
        expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
        actualDeliveryDate: actualDeliveryDate ? new Date(actualDeliveryDate) : null,
        deliveryStatus,
        trackingNumber,
        trackingUrl,
        customerId: customerId || null,
        jobId: jobId || null,
      });

      for (const it of items) {
        await db.insert(purchaseItems).values({
          id: ulid(),
          purchaseId: id,
          inventoryId: it.inventoryId || null,
          productName: String(it.productName || '').trim(),
          quantity: Math.max(1, parseInt(it.quantity, 10) || 1),
          purchasePrice: parseFloat(it.purchasePrice) || 0,
        });

        // Delivered items immediately add to stock
        if (deliveryStatus === 'Delivered' && it.inventoryId) {
          await addStockFromDelivery(it.inventoryId, parseInt(it.quantity, 10) || 1, id);
        }
      }

      if (jobId && !['Delivered', 'Returned', 'Cancelled'].includes(deliveryStatus)) {
        await syncJobForParts(jobId);
      }

      res.status(201).json({ id });
      void logAudit(req, 'purchase.created', 'purchase', id, `Purchase from ${supplier || 'supplier'}${orderNumber ? ` (${orderNumber})` : ''} created`);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to create purchase' });
    }
  });

  app.patch('/api/purchases/:id', async (req, res) => {
    try {
      const existing = await db.select().from(purchases).where(eq(purchases.id, req.params.id));
      if (!existing.length) return res.status(404).json({ error: 'Not found' });
      const before = existing[0];

      const { supplier, supplierId, orderNumber, orderDate, expectedDeliveryDate, actualDeliveryDate, deliveryStatus, trackingNumber, trackingUrl, customerId, jobId } = req.body;

      const updates: any = {};
      if (supplierId !== undefined) {
        updates.supplierId = supplierId || null;
        if (supplierId && supplier === undefined) {
          const sup = await db.select({ name: suppliers.name }).from(suppliers).where(eq(suppliers.id, supplierId));
          if (sup.length) updates.supplier = sup[0].name;
        }
      }
      if (supplier !== undefined) {
        updates.supplier = supplier;
        if (updates.supplierId === undefined) updates.supplierId = null;
      }
      if (orderNumber !== undefined) updates.orderNumber = orderNumber;
      if (orderDate !== undefined) updates.orderDate = new Date(orderDate);
      if (expectedDeliveryDate !== undefined) updates.expectedDeliveryDate = expectedDeliveryDate ? new Date(expectedDeliveryDate) : null;
      if (actualDeliveryDate !== undefined) updates.actualDeliveryDate = actualDeliveryDate ? new Date(actualDeliveryDate) : null;
      if (deliveryStatus !== undefined) updates.deliveryStatus = deliveryStatus;
      if (trackingNumber !== undefined) updates.trackingNumber = trackingNumber;
      if (trackingUrl !== undefined) updates.trackingUrl = trackingUrl;
      if (customerId !== undefined) updates.customerId = customerId || null;
      if (jobId !== undefined) updates.jobId = jobId || null;

      // Auto-set actual delivery date when marked delivered
      if (deliveryStatus === 'Delivered' && actualDeliveryDate === undefined) {
        updates.actualDeliveryDate = before.actualDeliveryDate || new Date();
      }

      await db.update(purchases).set(updates).where(eq(purchases.id, req.params.id));

      const jobIdToSync = jobId !== undefined ? (jobId || null) : before.jobId;
      const statusAfter = deliveryStatus !== undefined ? deliveryStatus : before.deliveryStatus;

      // ETA change → record in the job timeline
      if (expectedDeliveryDate !== undefined && expectedDeliveryDate !== before.expectedDeliveryDate) {
        const fmt = (d: any) => d ? new Date(d).toISOString().slice(0, 10) : 'unknown';
        await db.insert(timelineEvents).values({
          id: ulid(),
          jobId: jobIdToSync || before.jobId,
          eventType: 'part_ordered',
          description: `Delivery ETA updated to ${fmt(expectedDeliveryDate)}.`,
        }).catch(() => {});
      }

      // Status change → record and sync job status
      if (deliveryStatus !== undefined && deliveryStatus !== before.deliveryStatus) {
        if (jobIdToSync) {
          await db.insert(timelineEvents).values({
            id: ulid(),
            jobId: jobIdToSync,
            eventType: 'part_ordered',
            description: `Part delivery status: ${before.deliveryStatus} → ${deliveryStatus}.`,
          }).catch(() => {});
        }
        if (deliveryStatus === 'Delivered') {
          // Part has arrived; unstick jobs that were merely waiting on it
          if (jobIdToSync) {
            const row = await db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, jobIdToSync));
            if (row.length && row[0].status === 'Awaiting Parts') {
              await db.update(jobs).set({ status: 'Repairing' }).where(eq(jobs.id, jobIdToSync));
              await db.insert(timelineEvents).values({
                id: ulid(),
                jobId: jobIdToSync,
                eventType: 'status_change',
                description: 'Status changed from Awaiting Parts to Repairing — part received.',
              });
            }
          }
          // Delivered items add to stock
          const purchaseItemsForStock = await db.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, req.params.id));
          for (const it of purchaseItemsForStock) {
            if (it.inventoryId) {
              await addStockFromDelivery(it.inventoryId, it.quantity || 1, req.params.id);
            }
          }
        } else if (!['Delivered', 'Returned', 'Cancelled'].includes(statusAfter)) {
          await syncJobForParts(jobIdToSync);
        }
      }

      res.status(200).json({ id: req.params.id });
      const descParts = [];
      if (deliveryStatus !== undefined && deliveryStatus !== before.deliveryStatus) descParts.push(`status ${before.deliveryStatus} → ${deliveryStatus}`);
      if (expectedDeliveryDate !== undefined && expectedDeliveryDate !== before.expectedDeliveryDate) descParts.push(`ETA updated`);
      void logAudit(req, 'purchase.updated', 'purchase', req.params.id, `Purchase from ${before.supplier} updated${descParts.length ? ` (${descParts.join(', ')})` : ''}`);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to update purchase' });
    }
  });

  app.delete('/api/purchases/:id', async (req, res) => {
    try {
      await db.delete(purchaseItems).where(eq(purchaseItems.purchaseId, req.params.id));
      await db.delete(purchases).where(eq(purchases.id, req.params.id));
      res.status(204).end();
      void logAudit(req, 'purchase.deleted', 'purchase', req.params.id, 'Purchase deleted');
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete purchase' });
    }
  });

  // API Routes - Settings
  const DEFAULT_SETTINGS: Record<string, string> = {
    business_name: 'DJ TECH',
    business_tagline: 'Fixing your problems, one service at a time.',
    business_phone: '',
    business_email: '',
    business_address: '',
    business_bank_name: '',
    business_bank_account: '',
    business_bank_branch: '',
    invoice_prefix: 'INV',
    quote_prefix: 'QUO',
    vat_rate: '0.15',
    currency: 'ZAR',
    default_labour_rate: '0',
    default_markup: '0.5',
    warranty_days: '30',
    daily_revenue_goal: '5000',
    auto_send_job_intake: '1',
    public_base_url: 'http://192.168.0.100:3000',
    public_tracking_enabled: '1',
    whatsapp_bot_enabled: '1',
    whatsapp_bot_keywords: '',
    whatsapp_bot_menu: 'Reply with one of the following:\n1. MENU — show this menu\n2. STATUS <job no. or code> — check your repair\n3. INVOICE <invoice no.> — get a copy of your invoice\n4. QUOTE <quote no.> — get a copy of your quote\nYou can also just send your job number or tracking code.',
  };

  app.get('/api/settings', async (req, res) => {
    try {
      const rows = await db.select().from(settings);
      const merged: Record<string, string> = { ...DEFAULT_SETTINGS };
      for (const r of rows) merged[r.key] = r.value;
      res.json(merged);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  });

  app.put('/api/settings', async (req, res) => {
    try {
      const body = req.body || {};
      // Only one email entry is needed: if the mailbox email is configured and
      // no explicit business email was given, mirror it into business_email so
      // the email service's address is the company address too.
      if (typeof body.mail_user === 'string' && body.mail_user.trim() && !String(body.business_email || '').trim()) {
        body.business_email = body.mail_user.trim();
      }
      const entries = Object.entries(body).filter(([k, v]) => typeof v === 'string' || typeof v === 'number');
      for (const [key, value] of entries) {
        await db.insert(settings).values({ key, value: String(value) })
          .onConflictDoUpdate({ target: settings.key, set: { value: String(value) } });
      }
      const rows = await db.select().from(settings);
      const merged: Record<string, string> = { ...DEFAULT_SETTINGS };
      for (const r of rows) merged[r.key] = r.value;
      res.json(merged);
      const changed = entries.map(([k]) => k).join(', ');
      if (changed) void logAudit(req, 'settings.updated', 'settings', undefined, `Settings updated: ${changed}`);
      if (entries.some(([k]) => k === 'mail_user' || k === 'mail_pass' || k === 'imap_host' || k === 'imap_port' || k === 'mail_protocol' || k === 'pop3_host' || k === 'pop3_port')) {
        void (async () => {
          try {
            const { inbox, sent } = await syncMail();
            const mirrored = await mirrorClassifiedMail();
            console.log(`[mail] auto-sync after settings save: ${inbox} inbox, ${sent} sent, ${mirrored} mirrored`);
          } catch (err) {
            console.error('[mail] auto-sync after settings save failed:', (err as any)?.message || err);
          }
        })();
      }
    } catch (error) {
      res.status(500).json({ error: 'Failed to save settings' });
    }
  });

  // API Routes - Setup & Database
  // First-run detection: the app needs the setup page until business name,
  // phone and email are configured (fresh DB or after a wipe that cleared them).
  app.get('/api/setup-status', async (req, res) => {
    try {
      const rows = await db.select({ key: settings.key, value: settings.value }).from(settings)
        .where(inArray(settings.key, ['business_name', 'business_phone', 'business_email']));
      const have = new Map(rows.map((r) => [r.key, (r.value || '').trim()]));
      const needsSetup = !have.get('business_name') || !have.get('business_phone') || !have.get('business_email');
      res.json({ needsSetup });
    } catch (error) {
      res.status(500).json({ error: 'Failed to check setup status' });
    }
  });

  // Save the first-run setup details. Mirrors the Settings PUT but works before
  // the full UI is reachable. Accepts every settings key; business name, phone
  // and email are required.
  app.post('/api/setup/complete', async (req, res) => {
    try {
      const body = req.body || {};
      const values: Record<string, string> = {};
      for (const [key, value] of Object.entries(body)) {
        if (typeof value === 'string' || typeof value === 'number') values[key] = String(value).trim();
      }
      const required = ['business_name', 'business_phone', 'business_email'];
      // If only the mailbox email was supplied, use it as the business email so
      // a single email entry is enough to complete setup.
      if (!values.business_email && values.mail_user) values.business_email = values.mail_user;
      const missing = required.filter((k) => !values[k]);
      if (missing.length) {
        return res.status(400).json({ error: `Required: ${missing.join(', ')}` });
      }
      for (const [key, value] of Object.entries(values)) {
        await db.insert(settings).values({ key, value })
          .onConflictDoUpdate({ target: settings.key, set: { value } });
      }
      res.json({ ok: true });
      if (values.business_name) void logAudit(req, 'setup.completed', 'settings', undefined, 'First-run setup completed');
    } catch (error) {
      res.status(500).json({ error: 'Failed to save setup details' });
    }
  });

  // Download the whole database as a portable JSON backup.
  app.get('/api/db/backup', async (req, res) => {
    try {
      const data = await exportDatabase();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      res.setHeader('Content-Disposition', `attachment; filename="djtech-backup-${stamp}.json"`);
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(data, null, 2));
    } catch (error) {
      res.status(500).json({ error: 'Failed to create backup' });
    }
  });

  // Import flow: validate the uploaded backup and restore it directly into the
  // running database. No staging or restart needed — tables are dropped and
  // reseeded via SQL, which avoids replacing the file (no Windows lock issues).
  app.post('/api/db/import', importFile(), async (req: any, res) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: 'No backup file uploaded' });
      }
      let parsed: any;
      try {
        parsed = JSON.parse(req.file.buffer.toString('utf8'));
      } catch {
        return res.status(400).json({ error: 'Uploaded file is not valid JSON' });
      }
      const counts = await restoreFromBackup(parsed);
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      res.json({ ok: true, message: `Backup restored: ${total} rows across ${Object.keys(counts).length} tables.` });
    } catch (error: any) {
      res.status(400).json({ error: `Backup rejected: ${(error as any)?.message || error}` });
    }
  });

  // Wipe all business data (customers, jobs, invoices, ...) but keep the
  // settings table so mail/WhatsApp credentials and business info survive.
  app.post('/api/db/reset', async (req, res) => {
    try {
      const counts = await resetDatabaseData();
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      res.json({ ok: true, total, counts });
      void logAudit(req, 'db.reset', 'settings', undefined, `Data reset: ${total} rows cleared (settings kept)`);
    } catch (error) {
      res.status(500).json({ error: 'Failed to reset database' });
    }
  });

  // API Routes - Audit Log
  app.get('/api/audit', async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Number(req.query.offset) || 0;
      const entityType = req.query.entityType ? String(req.query.entityType) : undefined;
      const action = req.query.action ? String(req.query.action) : undefined;

      const conditions: any[] = [];
      if (entityType) conditions.push(eq(auditLog.entityType, entityType));
      if (action) conditions.push(eq(auditLog.action, action));
      const where = conditions.length ? and(...conditions) : undefined;

      const rows = await db.select().from(auditLog).where(where).orderBy(desc(auditLog.timestamp)).limit(limit).offset(offset);
      const countBase = db.select({ count: sql<number>`count(*)` }).from(auditLog).where(where);
      const total = (await countBase)[0]?.count ?? 0;
      res.json({ rows, total });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch audit log' });
    }
  });

  // API Routes - Global Search
  app.get('/api/search', async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      if (!q) return res.json({ customers: [], devices: [], jobs: [], invoices: [], quotes: [], purchases: [], inventory: [] });

      const like = sql<string>`'%' || ${q} || '%'`;

      const custResults = await db.select({
        id: customers.id,
        fullName: customers.fullName,
        companyName: customers.companyName,
        customerType: customers.customerType,
        phone: customers.phone,
        email: customers.email,
      }).from(customers).where(sql`lower(coalesce(${customers.fullName}, '')) like lower(${like}) OR lower(coalesce(${customers.phone}, '')) like lower(${like}) OR lower(coalesce(${customers.email}, '')) like lower(${like})`).limit(10);

      const deviceResults = await db.select({
        id: devices.id,
        customerId: devices.customerId,
        deviceType: devices.deviceType,
        manufacturer: devices.manufacturer,
        model: devices.model,
        serialNumber: devices.serialNumber,
      }).from(devices).where(sql`lower(coalesce(${devices.serialNumber}, '')) like lower(${like}) OR lower(coalesce(${devices.model}, '')) like lower(${like}) OR lower(coalesce(${devices.manufacturer}, '')) like lower(${like})`).limit(10);

      const jobResults = await db.select({
        id: jobs.id,
        jobNumber: jobs.jobNumber,
        customerId: jobs.customerId,
        status: jobs.status,
        reportedProblem: jobs.reportedProblem,
      }).from(jobs).where(sql`lower(${jobs.jobNumber}) like lower(${like})`).limit(10);

      const invoiceResults = await db.select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        customerId: invoices.customerId,
        status: invoices.status,
        total: invoices.total,
      }).from(invoices).where(sql`lower(${invoices.invoiceNumber}) like lower(${like})`).limit(10);

      const quoteResults = await db.select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        customerId: quotes.customerId,
        status: quotes.status,
        total: quotes.total,
      }).from(quotes).where(sql`lower(${quotes.quoteNumber}) like lower(${like})`).limit(10);

      const purchResults = await db.select({
        id: purchases.id,
        supplier: purchases.supplier,
        orderNumber: purchases.orderNumber,
        deliveryStatus: purchases.deliveryStatus,
      }).from(purchases).where(sql`lower(coalesce(${purchases.supplier}, '')) like lower(${like}) OR lower(coalesce(${purchases.orderNumber}, '')) like lower(${like}) OR lower(coalesce(${purchases.trackingNumber}, '')) like lower(${like})`).limit(10);

      const invResults = await db.select({
        id: inventory.id,
        productName: inventory.productName,
        partNumber: inventory.partNumber,
        sku: inventory.sku,
        quantity: inventory.quantity,
      }).from(inventory).where(sql`lower(coalesce(${inventory.productName}, '')) like lower(${like}) OR lower(coalesce(${inventory.partNumber}, '')) like lower(${like}) OR lower(coalesce(${inventory.sku}, '')) like lower(${like})`).limit(10);

      // If searching by serial number, also return the full repair history of matched devices
      let deviceHistory: any[] = [];
      if (deviceResults.length > 0) {
        const deviceIds = deviceResults.map(d => d.id);
        deviceHistory = await db.select({
          id: jobs.id,
          jobNumber: jobs.jobNumber,
          deviceId: jobs.deviceId,
          customerId: jobs.customerId,
          dateReceived: jobs.dateReceived,
          status: jobs.status,
          reportedProblem: jobs.reportedProblem,
          workPerformed: jobs.workPerformed,
        }).from(jobs).where(inArray(jobs.deviceId, deviceIds)).orderBy(desc(jobs.dateReceived)).limit(20);
      }

      res.json({ customers: custResults, devices: deviceResults, jobs: jobResults, invoices: invoiceResults, quotes: quoteResults, purchases: purchResults, inventory: invResults, deviceHistory });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to search' });
    }
  });

  // API Routes - Reports
  app.get('/api/reports', async (req, res) => {
    try {
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      const hasRange = !!(from || to);

      // Date filtering helper: applies to a timestamp column (stored as unix seconds)
      const epochSec = (d: string, endOfDay = false) =>
        Math.floor(new Date(d + (endOfDay ? 'T23:59:59' : 'T00:00:00')).getTime() / 1000);
      const inRange = (col: any) => {
        if (from && to) return sql`${col} >= ${epochSec(from)} AND ${col} <= ${epochSec(to, true)}`;
        if (from) return sql`${col} >= ${epochSec(from)}`;
        if (to) return sql`${col} <= ${epochSec(to, true)}`;
        return sql`1`;
      };

      // Revenue: paid amounts in range
      const revenue = await db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(payments).where(inRange(payments.date));

      // Supplier spending: total purchase value in range
      const supplierSpend = await db.select({
        supplier: purchases.supplier,
        total: sql<number>`coalesce(sum(${purchaseItems.quantity} * ${purchaseItems.purchasePrice}), 0)`,
      }).from(purchases)
        .innerJoin(purchaseItems, eq(purchaseItems.purchaseId, purchases.id))
        .where(inRange(purchases.orderDate))
        .groupBy(purchases.supplier)
        .orderBy(sql`coalesce(sum(${purchaseItems.quantity} * ${purchaseItems.purchasePrice}), 0) desc`)
        .limit(5);

      const totalSupplierSpend = await db.select({
        total: sql<number>`coalesce(sum(${purchaseItems.quantity} * ${purchaseItems.purchasePrice}), 0)`,
      }).from(purchases)
        .innerJoin(purchaseItems, eq(purchaseItems.purchaseId, purchases.id))
        .where(inRange(purchases.orderDate));

      // Outstanding invoices (all time, not date-filtered — they're current balances)
      const outstanding = await db.select({ total: sql<number>`coalesce(sum(total - amount_paid), 0)` }).from(invoices).where(sql`status != 'Paid' AND status != 'Cancelled'`);

      // Jobs completed / awaiting parts in range
      const jobsCompleted = await db.select({ count: sql<number>`count(*)` }).from(jobs).where(hasRange ? sql`${inRange(jobs.completionDate)} AND ${jobs.status} = 'Completed'` : sql`${jobs.status} = 'Completed'`);
      const jobsAwaitingParts = await db.select({ count: sql<number>`count(*)` }).from(jobs).where(eq(jobs.status, 'Awaiting Parts'));
      const warrantyReturns = await db.select({ count: sql<number>`count(*)` }).from(jobs).where(eq(jobs.status, 'Warranty Return'));

      // Customer spending in range
      const customerSpending = await db.select({
        name: customers.fullName,
        total: sql<number>`coalesce(sum(${payments.amount}), 0)`,
      }).from(payments)
        .innerJoin(customers, eq(payments.customerId, customers.id))
        .where(inRange(payments.date))
        .groupBy(customers.id)
        .orderBy(sql`coalesce(sum(${payments.amount}), 0) desc`)
        .limit(5);

      // Most common repairs in range
      const commonRepairs = await db.select({
        problem: jobs.reportedProblem,
        count: sql<number>`count(*)`,
      }).from(jobs)
        .where(sql`${inRange(jobs.dateReceived)} AND ${jobs.reportedProblem} IS NOT NULL AND trim(${jobs.reportedProblem}) != ''`)
        .groupBy(jobs.reportedProblem)
        .orderBy(sql`count(*) desc`)
        .limit(5);

      // Monthly revenue for the last 12 months
      const monthlyRevenue = await db.select({
        month: sql<string>`strftime('%Y-%m', ${payments.date}, 'unixepoch')`,
        total: sql<number>`coalesce(sum(amount), 0)`,
      }).from(payments)
        .where(sql`${payments.date} >= ${Math.floor(new Date(new Date().getFullYear() - 1, new Date().getMonth(), 1).getTime() / 1000)}`)
        .groupBy(sql`strftime('%Y-%m', ${payments.date}, 'unixepoch')`)
        .orderBy(sql`strftime('%Y-%m', ${payments.date}, 'unixepoch')`);

      res.json({
        revenue: revenue[0]?.total || 0,
        supplierSpending: totalSupplierSpend[0]?.total || 0,
        topSuppliers: supplierSpend,
        outstandingInvoices: outstanding[0]?.total || 0,
        jobsCompleted: jobsCompleted[0]?.count || 0,
        jobsAwaitingParts: jobsAwaitingParts[0]?.count || 0,
        warrantyReturns: warrantyReturns[0]?.count || 0,
        topCustomers: customerSpending,
        commonRepairs: commonRepairs,
        monthlyRevenue,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch reports' });
    }
  });

  // API Routes - Jobs
  app.get('/api/jobs', async (req, res) => {
    try {
      const allJobs = await db.select({
        id: jobs.id,
        jobNumber: jobs.jobNumber,
        customerId: jobs.customerId,
        customerName: billingName.as('customerName'),
        deviceId: jobs.deviceId,
        deviceSummary: sql<string>`CASE WHEN ${devices.manufacturer} IS NULL AND ${devices.model} IS NULL THEN 'Device' ELSE trim(COALESCE(${devices.manufacturer}, '') || ' ' || COALESCE(${devices.model}, '')) END`,
        dateReceived: jobs.dateReceived,
        expectedCompletionDate: jobs.expectedCompletionDate,
        priority: jobs.priority,
        status: jobs.status,
        reportedProblem: jobs.reportedProblem,
        accessoriesReceived: jobs.accessoriesReceived,
        physicalCondition: jobs.physicalCondition,
        existingDamage: jobs.existingDamage,
        devicePassword: jobs.devicePassword,
        initialDiagnosis: jobs.initialDiagnosis,
        technician: jobs.technician,
        technicianNotes: jobs.technicianNotes,
        customerVisibleNotes: jobs.customerVisibleNotes,
        workPerformed: jobs.workPerformed,
        warrantyPeriodDays: jobs.warrantyPeriodDays,
        completionDate: jobs.completionDate,
        collectionDate: jobs.collectionDate,
        trackingCode: jobs.trackingCode,
      }).from(jobs)
        .leftJoin(customers, eq(jobs.customerId, customers.id))
        .leftJoin(devices, eq(jobs.deviceId, devices.id))
        .orderBy(desc(jobs.dateReceived));
      res.json(allJobs);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch jobs' });
    }
  });

  app.post('/api/jobs', async (req, res) => {
    try {
      const { customerId, deviceId, reportedProblem, priority, accessoriesReceived, physicalCondition, existingDamage, devicePassword, autoSendIntake } = req.body;
      const newId = ulid();
      // Generate Job Number: next sequence number for the current year, based
      // on the highest existing number (not row count, which breaks on deletion).
      const year = new Date().getFullYear();
      const latest = await db.select({
        lastNum: max(sql<number>`CAST(substr(job_number, 9) AS INTEGER)`),
      }).from(jobs).where(like(jobs.jobNumber, `DJ-${year}-%`));
      const nextNum = (Number(latest[0]?.lastNum) || 0) + 1;
      const jobNumber = `DJ-${year}-${String(nextNum).padStart(4, '0')}`;

      const newJob = await db.insert(jobs).values({
        id: newId,
        jobNumber,
        customerId,
        deviceId,
        reportedProblem,
        priority: priority || 'normal',
        accessoriesReceived,
        physicalCondition,
        existingDamage,
        devicePassword: devicePassword ? hashSecret(String(devicePassword)) : null,
        status: 'Received',
        autoSendIntake: typeof autoSendIntake === 'number' ? autoSendIntake : -1,
        trackingCode: generateTrackingCode(),
      }).returning();

      // Add timeline event
      await db.insert(timelineEvents).values({
        id: ulid(),
        jobId: newId,
        eventType: 'status_change',
        description: 'Device received and job card created.',
      });

      res.status(201).json(newJob[0]);
      void logAudit(req, 'job.created', 'job', newId, `Job ${jobNumber} created`);

      // Auto-send the job card + "send along" documents + job photos to the
      // customer when a device enters the workshop. Per-job override wins;
      // otherwise the kill-switch setting decides.
      void (async () => {
        try {
          const override = typeof newJob[0]?.autoSendIntake === 'number' ? newJob[0].autoSendIntake : -1;
          let enabled = true;
          if (override !== -1) {
            enabled = override === 1;
          } else {
            const setting = await getSettingValue('auto_send_job_intake', '1');
            enabled = setting !== '0';
          }
          if (enabled) {
            const sent = await sendJobIntake(newId, await getPublicBaseUrl());
            console.log(`[job] intake sent for ${jobNumber}:`, sent);
          }
        } catch (err) {
          console.error(`[job] intake send failed for ${jobNumber}:`, (err as any)?.message || err);
        }
      })();
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to create job' });
    }
  });

  app.get('/api/jobs/:id', async (req, res) => {
    try {
      const rows = await db.select({
        id: jobs.id,
        jobNumber: jobs.jobNumber,
        customerId: jobs.customerId,
        customerName: billingName.as('customerName'),
        deviceId: jobs.deviceId,
        deviceSummary: sql<string>`CASE WHEN ${devices.manufacturer} IS NULL AND ${devices.model} IS NULL THEN 'Device' ELSE trim(COALESCE(${devices.manufacturer}, '') || ' ' || COALESCE(${devices.model}, '')) END`,
        dateReceived: jobs.dateReceived,
        expectedCompletionDate: jobs.expectedCompletionDate,
        priority: jobs.priority,
        status: jobs.status,
        reportedProblem: jobs.reportedProblem,
        accessoriesReceived: jobs.accessoriesReceived,
        physicalCondition: jobs.physicalCondition,
        existingDamage: jobs.existingDamage,
        devicePassword: jobs.devicePassword,
        initialDiagnosis: jobs.initialDiagnosis,
        technician: jobs.technician,
        technicianNotes: jobs.technicianNotes,
        customerVisibleNotes: jobs.customerVisibleNotes,
        workPerformed: jobs.workPerformed,
        warrantyPeriodDays: jobs.warrantyPeriodDays,
        completionDate: jobs.completionDate,
        collectionDate: jobs.collectionDate,
        trackingCode: jobs.trackingCode,
      }).from(jobs)
        .leftJoin(customers, eq(jobs.customerId, customers.id))
        .leftJoin(devices, eq(jobs.deviceId, devices.id))
        .where(eq(jobs.id, req.params.id));
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      
      const timeline = await db.select().from(timelineEvents).where(eq(timelineEvents.jobId, req.params.id)).orderBy(desc(timelineEvents.timestamp));
      
      res.json({ ...rows[0], timeline });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch job' });
    }
  });

  app.patch('/api/jobs/:id', async (req, res) => {
    try {
      const existing = await db.select().from(jobs).where(eq(jobs.id, req.params.id));
      if (!existing.length) return res.status(404).json({ error: 'Not found' });
      const before = existing[0];

      const {
        status, priority, technician, expectedCompletionDate,
        initialDiagnosis, technicianNotes, customerVisibleNotes, workPerformed,
        warrantyPeriodDays, completionDate, collectionDate,
      } = req.body;

      const updates: any = {};
      if (status !== undefined) updates.status = status;
      if (priority !== undefined) updates.priority = priority;
      if (technician !== undefined) updates.technician = technician;
      if (expectedCompletionDate !== undefined) updates.expectedCompletionDate = expectedCompletionDate || null;
      if (initialDiagnosis !== undefined) updates.initialDiagnosis = initialDiagnosis;
      if (technicianNotes !== undefined) updates.technicianNotes = technicianNotes;
      if (customerVisibleNotes !== undefined) updates.customerVisibleNotes = customerVisibleNotes;
      if (workPerformed !== undefined) updates.workPerformed = workPerformed;
      if (warrantyPeriodDays !== undefined) updates.warrantyPeriodDays = warrantyPeriodDays;

      const now = new Date();
      if (status === 'Completed' && before.status !== 'Completed') updates.completionDate = now;
      if (status === 'Collected') updates.collectionDate = now;

      const updated = await db.update(jobs).set(updates).where(eq(jobs.id, req.params.id)).returning();

      // Record timeline events
      const events: { jobId: string; eventType: string; description: string }[] = [];
      if (status !== undefined && status !== before.status) {
        events.push({
          jobId: req.params.id,
          eventType: 'status_change',
          description: `Status changed from ${before.status} to ${status}.`,
        });
      }
      if (priority !== undefined && priority !== before.priority) {
        events.push({
          jobId: req.params.id,
          eventType: 'note',
          description: `Priority changed from ${before.priority} to ${priority}.`,
        });
      }
      if (technician !== undefined && technician !== before.technician) {
        events.push({
          jobId: req.params.id,
          eventType: 'note',
          description: `Assigned technician: ${technician}.`,
        });
      }
      if (workPerformed && workPerformed !== before.workPerformed) {
        events.push({
          jobId: req.params.id,
          eventType: 'note',
          description: 'Work performed updated.',
        });
      }
      for (const ev of events) {
        await db.insert(timelineEvents).values({ id: ulid(), ...ev });
      }

      const timeline = await db.select().from(timelineEvents).where(eq(timelineEvents.jobId, req.params.id)).orderBy(desc(timelineEvents.timestamp));
      res.json({ ...updated[0], timeline });
      const changed = Object.keys(updates).join(', ');
      void logAudit(req, 'job.updated', 'job', req.params.id, `Job ${before.jobNumber} updated (${changed})`);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to update job' });
    }
  });

  app.post('/api/jobs/:id/timeline', async (req, res) => {
    try {
      const { eventType = 'note', description } = req.body;
      if (!description || !String(description).trim()) return res.status(400).json({ error: 'description is required' });

      const job = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, req.params.id));
      if (!job.length) return res.status(404).json({ error: 'Not found' });

      const event = await db.insert(timelineEvents).values({
        id: ulid(),
        jobId: req.params.id,
        eventType,
        description: String(description).trim(),
      }).returning();

      res.status(201).json(event[0]);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to add timeline event' });
    }
  });

  // Public job tracking (no auth). Served at /api/track/:code and rendered
  // client-side on /track/:code. Also powers the code lookup page (/track).
  app.get('/api/track/:code', async (req, res) => {
    try {
      const code = String(req.params.code || '').trim().toUpperCase();
      if (!code) return res.status(400).json({ error: 'code is required' });

      // Kill-switch: public tracking can be turned off in Settings.
      const enabled = await getSettingValue('public_tracking_enabled', '1');
      if (enabled === '0') return res.status(404).json({ error: 'Not found' });

      const jobRows = await db.select().from(jobs).where(eq(jobs.trackingCode, code));
      const job = jobRows[0];
      if (!job) return res.status(404).json({ error: 'Not found' });

      const [customer] = await db.select().from(customers).where(eq(customers.id, job.customerId));
      const [device] = job.deviceId ? await db.select().from(devices).where(eq(devices.id, job.deviceId)) : [];
      const timeline = await db.select()
        .from(timelineEvents)
        .where(eq(timelineEvents.jobId, job.id))
        .orderBy(desc(timelineEvents.timestamp));

      const photos = await getJobPhotos(job.id);

      // Quote/invoice references for this job — the tracking page links to
      // their public PDFs so customers can print them from the link.
      const [jobQuotes, jobInvoices] = await Promise.all([
        db.select({ id: quotes.id, quoteNumber: quotes.quoteNumber, status: quotes.status, total: quotes.total })
          .from(quotes)
          .where(eq(quotes.jobId, job.id)),
        db.select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, status: invoices.status, total: invoices.total, amountPaid: invoices.amountPaid })
          .from(invoices)
          .where(eq(invoices.jobId, job.id)),
      ]);

      const photoUrls = photos.map((p) => ({
        id: p.attachmentId,
        name: p.name,
        category: p.category,
        phase: p.phase,
        url: `/api/attachments/${p.attachmentId}/download`,
      }));

      res.json({
        job: {
          id: job.id,
          jobNumber: job.jobNumber,
          status: job.status,
          priority: job.priority,
          dateReceived: job.dateReceived,
          expectedCompletionDate: job.expectedCompletionDate,
          completionDate: job.completionDate,
          collectionDate: job.collectionDate,
          reportedProblem: job.reportedProblem,
          workPerformed: job.workPerformed,
          customerVisibleNotes: job.customerVisibleNotes,
          technician: job.technician,
          trackingCode: job.trackingCode,
        },
        customer: customer ? {
          name: customer.customerType === 'company' && customer.companyName ? customer.companyName : customer.fullName,
          contactName: customer.fullName,
          phone: customer.phone,
        } : null,
        device: device ? {
          manufacturer: device.manufacturer,
          model: device.model,
          serialNumber: device.serialNumber,
          deviceType: device.deviceType,
        } : null,
        timeline,
        photos: photoUrls,
        quotes: jobQuotes,
        invoices: jobInvoices,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to load tracking info' });
    }
  });

  // API Routes - Customers
  app.get('/api/customers', async (req, res) => {
    try {
      const allCustomers = await db.select().from(customers);
      res.json(allCustomers);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch customers' });
    }
  });

  app.post('/api/customers', async (req, res) => {
    try {
      const { fullName, companyName, customerType, phone, email, address, notes } = req.body;
      const newId = ulid();
      const newCustomer = await db.insert(customers).values({
        id: newId,
        fullName,
        companyName,
        customerType: customerType === 'company' ? 'company' : 'individual',
        phone,
        email,
        address,
        notes,
      }).returning();
      res.status(201).json(newCustomer[0]);
      void logAudit(req, 'customer.created', 'customer', newId, `Customer ${fullName} created`);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to create customer' });
    }
  });

  app.get('/api/customers/:id', async (req, res) => {
    try {
      const customer = await db.select().from(customers).where(eq(customers.id, req.params.id));
      if (!customer.length) return res.status(404).json({ error: 'Not found' });
      res.json(customer[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch customer' });
    }
  });

  app.patch('/api/customers/:id', async (req, res) => {
    try {
      const existing = await db.select().from(customers).where(eq(customers.id, req.params.id));
      if (!existing.length) return res.status(404).json({ error: 'Not found' });

      const fields = ['fullName', 'companyName', 'phone', 'email', 'address', 'notes', 'status', 'customerType'] as const;
      const updates: Record<string, any> = {};
      for (const f of fields) {
        if (req.body[f] !== undefined) updates[f] = req.body[f];
      }
      if (req.body.customerType !== undefined) updates.customerType = req.body.customerType === 'company' ? 'company' : 'individual';

      const updated = await db.update(customers).set(updates).where(eq(customers.id, req.params.id)).returning();
      res.json(updated[0]);
      void logAudit(req, 'customer.updated', 'customer', req.params.id, `Customer ${updated[0].fullName} updated`);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to update customer' });
    }
  });

  // API Routes - Devices
  app.get('/api/devices', async (req, res) => {
    try {
      const allDevices = await db.select().from(devices);
      res.json(allDevices);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch devices' });
    }
  });

  app.get('/api/customers/:customerId/devices', async (req, res) => {
    try {
      const customerDevices = await db.select().from(devices).where(eq(devices.customerId, req.params.customerId));
      res.json(customerDevices);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch devices' });
    }
  });

  app.post('/api/devices', async (req, res) => {
    try {
      const { customerId, deviceType, manufacturer, model, serialNumber, assetTag, cpu, ram, motherboard, box, powersupply, hdd, ssd, gpu, battery, charger, boxType, operatingSystem, hasCpu, hasRam, hasMotherboard, hasBox, hasPowersupply, hasHdd, hasSsd, hasGpu, hasBattery, hasCharger, hasBoxType } = req.body;
      const newId = ulid();
      const newDevice = await db.insert(devices).values({
        id: newId,
        customerId,
        deviceType,
        manufacturer,
        model,
        serialNumber,
        assetTag,
        cpu,
        ram,
        motherboard,
        box,
        powersupply,
        hdd,
        ssd,
        gpu,
        battery,
        charger,
        boxType,
        operatingSystem,
        hasCpu: hasCpu ? 1 : 0,
        hasRam: hasRam ? 1 : 0,
        hasMotherboard: hasMotherboard ? 1 : 0,
        hasBox: hasBox ? 1 : 0,
        hasPowersupply: hasPowersupply ? 1 : 0,
        hasHdd: hasHdd ? 1 : 0,
        hasSsd: hasSsd ? 1 : 0,
        hasGpu: hasGpu ? 1 : 0,
        hasBattery: hasBattery ? 1 : 0,
        hasCharger: hasCharger ? 1 : 0,
        hasBoxType: hasBoxType ? 1 : 0,
      }).returning();
      res.status(201).json(newDevice[0]);
      void logAudit(req, 'device.created', 'device', newId, `Device ${[newDevice[0].manufacturer, newDevice[0].model].filter(Boolean).join(' ') || 'created'} registered`);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to create device' });
    }
  });

  app.patch('/api/devices/:id', async (req, res) => {
    try {
      const existing = await db.select().from(devices).where(eq(devices.id, req.params.id));
      if (!existing.length) return res.status(404).json({ error: 'Not found' });

      const fields = ['customerId', 'deviceType', 'manufacturer', 'model', 'serialNumber', 'assetTag', 'cpu', 'ram', 'motherboard', 'box', 'powersupply', 'hdd', 'ssd', 'gpu', 'battery', 'charger', 'boxType', 'operatingSystem', 'storage'] as const;
      const updates: Record<string, any> = {};
      for (const f of fields) {
        if (req.body[f] !== undefined) updates[f] = req.body[f];
      }
      for (const flag of ['hasCpu', 'hasRam', 'hasMotherboard', 'hasBox', 'hasPowersupply', 'hasHdd', 'hasSsd', 'hasGpu', 'hasBattery', 'hasCharger', 'hasBoxType'] as const) {
        if (req.body[flag] !== undefined) updates[flag] = req.body[flag] ? 1 : 0;
      }

      const updated = await db.update(devices).set(updates).where(eq(devices.id, req.params.id)).returning();
      res.json(updated[0]);
      void logAudit(req, 'device.updated', 'device', req.params.id, `Device ${[updated[0].manufacturer, updated[0].model].filter(Boolean).join(' ') || 'updated'} edited`);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to update device' });
    }
  });


  // API Routes - Messaging (email IMAP/SMTP + WhatsApp)
  app.get('/api/mail/config', async (req, res) => {
    try {
      res.json(mailConfigSummary(await getMailConfig()));
    } catch (error) {
      res.status(500).json({ error: 'Failed to read mail config' });
    }
  });

  app.post('/api/mail/test', async (req, res) => {
    try {
      const result = await testMailConnection();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Mail test failed' });
    }
  });

  app.post('/api/mail/sync', async (req, res) => {
    try {
      const result = await syncMail();
      const mirrored = await mirrorClassifiedMail();
      res.json({ ...result, mirrored });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Mail sync failed' });
    }
  });

  app.post('/api/classify', async (req, res) => {
    try {
      const result = await classifyAll();
      const mirrored = await mirrorClassifiedMail();
      res.json({ ...result, mirrored });
      void logAudit(req, 'messages.classified', 'settings', undefined, `Re-classified ${result.mail} mail, ${result.chats} chats`);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Classification failed' });
    }
  });

  app.get('/api/mail/messages', async (req, res) => {
    try {
      const folder = req.query.folder === 'sent' ? 'sent' : 'inbox';
      const messages = await getMailMessages(folder);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch mail messages' });
    }
  });

  app.get('/api/mail/messages/:id', async (req, res) => {
    try {
      const message = await getMailMessage(req.params.id);
      if (!message) return res.status(404).json({ error: 'Not found' });
      res.json(message);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch mail message' });
    }
  });

  app.patch('/api/mail/messages/:id/read', async (req, res) => {
    try {
      await markMailRead(req.params.id);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to mark message read' });
    }
  });

  app.post('/api/mail/send', async (req, res) => {
    try {
      const { to, toName, subject, text } = req.body || {};
      if (!to || !subject || !text) return res.status(400).json({ error: 'to, subject and text are required' });
      const result = await sendMail({ to, toName, subject, text, html: text.replace(/\n/g, '<br/>') });
      res.json(result);
      void logAudit(req, 'mail.sent', 'settings', undefined, `Email sent to ${to}: ${subject}`);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to send email' });
    }
  });

  app.get('/api/whatsapp/status', async (req, res) => {
    try {
      res.json(getWhatsAppStatus());
    } catch (error) {
      res.status(500).json({ error: 'Failed to read WhatsApp status' });
    }
  });

  app.post('/api/whatsapp/start', async (req, res) => {
    try {
      void startWhatsApp();
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to start WhatsApp' });
    }
  });

  app.post('/api/whatsapp/logout', async (req, res) => {
    try {
      await logoutWhatsApp();
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to log out WhatsApp' });
    }
  });

  app.get('/api/whatsapp/chats', async (req, res) => {
    try {
      res.json(await getWhatsAppChats());
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch WhatsApp chats' });
    }
  });

  app.get('/api/customer-requests', async (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(Math.max(1, Number(req.query.pageSize) || 50), 500);
      const includeArchived = req.query.includeArchived === '1' || req.query.includeArchived === 'true';
      res.json(await getCustomerRequests({ page, pageSize, includeArchived }));
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch customer requests' });
    }
  });

  app.post('/api/customer-requests/:id/archive', async (req, res) => {
    try {
      const row = await setCustomerRequestArchived(req.params.id, true);
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    } catch (error) {
      res.status(500).json({ error: 'Failed to archive request' });
    }
  });

  app.post('/api/customer-requests/:id/unarchive', async (req, res) => {
    try {
      const row = await setCustomerRequestArchived(req.params.id, false);
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    } catch (error) {
      res.status(500).json({ error: 'Failed to restore request' });
    }
  });

  app.post('/api/customers/:id/send-status', async (req, res) => {
    try {
      const result = await sendCustomerStatus(req.params.id, {
        sendText: sendWhatsAppText,
        sendDocument: sendWhatsAppDocument,
      });
      if (!result.ok) return res.status(400).json(result);
      res.json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to send status' });
    }
  });

  app.get('/api/whatsapp/chats/:chatId/messages', async (req, res) => {
    try {
      const messages = await getWhatsAppMessages(req.params.chatId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch WhatsApp messages' });
    }
  });

  app.post('/api/whatsapp/chats/:chatId/read', async (req, res) => {
    try {
      await markChatRead(req.params.chatId);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to mark chat read' });
    }
  });

  app.post('/api/whatsapp/send', async (req, res) => {
    try {
      const { to, message } = req.body || {};
      if (!to || !message) return res.status(400).json({ error: 'to and message are required' });
      await sendWhatsAppText(to, message);
      res.json({ ok: true });
      void logAudit(req, 'whatsapp.sent', 'settings', undefined, `WhatsApp message sent to ${to}`);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to send WhatsApp message' });
    }
  });

  app.post('/api/whatsapp/chats/:chatId/customer', async (req, res) => {
    try {
      const { fullName, phone, email, companyName } = req.body || {};
      const result = await createCustomerFromChat(req.params.chatId, { fullName, phone, email, companyName });
      res.json(result);
      void logAudit(req, 'whatsapp.customer_created', 'whatsapp', undefined, `Customer created from WhatsApp chat ${req.params.chatId}`);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to create customer from chat' });
    }
  });


  // API Routes - Documents (server-hosted; sent along with job/intake sends)
  app.get('/api/documents', async (req, res) => {
    try {
      res.json(await listDocuments());
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch documents' });
    }
  });

  app.post('/api/documents', upload.single('file'), async (req, res) => {
    try {
      const file = (req as any).file;
      if (!file) return res.status(400).json({ error: 'No file uploaded' });
      const doc = await saveDocument({ name: file.originalname || 'unnamed', mimeType: file.mimetype || 'application/octet-stream', buffer: file.buffer });
      res.status(201).json(doc);
      void logAudit(req, 'document.created', 'documents', doc.id, `Uploaded ${doc.name}`);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to upload document' });
    }
  });

  app.patch('/api/documents/:id', async (req, res) => {
    try {
      const { sendAlong } = req.body || {};
      if (typeof sendAlong !== 'boolean') return res.status(400).json({ error: 'sendAlong must be a boolean' });
      await setDocumentSendAlong(req.params.id, sendAlong);
      res.json({ ok: true });
      void logAudit(req, 'document.sendalong', 'documents', req.params.id, sendAlong ? 'Enabled send-along' : 'Disabled send-along');
    } catch (error) {
      res.status(500).json({ error: 'Failed to update document' });
    }
  });

  app.delete('/api/documents/:id', async (req, res) => {
    try {
      const ok = await deleteDocument(req.params.id);
      if (!ok) return res.status(404).json({ error: 'Not found' });
      res.json({ ok: true });
      void logAudit(req, 'document.deleted', 'documents', req.params.id, 'Deleted document');
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete document' });
    }
  });

  app.get('/api/documents/:id/download', async (req, res) => {
    try {
      const doc = await getDocument(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Not found' });
      const filePath = await getDocumentFilePath(doc);
      res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.name)}"`);
      res.sendFile(filePath);
    } catch (error) {
      res.status(500).json({ error: 'Failed to download document' });
    }
  });

  // API Routes - Job attachments (photos/files categorized per job, customer, device)
  app.get('/api/attachments', async (req, res) => {
    try {
      const { jobId, customerId, deviceId, category, phase } = req.query as Record<string, string | undefined>;
      res.json(await listJobAttachments({ jobId, customerId, deviceId, category, phase }));
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch attachments' });
    }
  });

  app.get('/api/jobs/:id/attachments', async (req, res) => {
    try {
      res.json(await listJobAttachments({ jobId: req.params.id }));
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch attachments' });
    }
  });

  app.post('/api/attachments', upload.single('file'), async (req, res) => {
    try {
      const file = (req as any).file;
      const body = (req.body || {}) as Record<string, any>;
      if (!file) return res.status(400).json({ error: 'No file uploaded' });
      if (!body.jobId) return res.status(400).json({ error: 'jobId is required' });
      const capturedAt = body.capturedAt ? new Date(Number(body.capturedAt)) : null;
      const att = await saveJobAttachment({
        jobId: String(body.jobId),
        category: body.category ? String(body.category) : undefined,
        phase: body.phase ? String(body.phase) : null,
        capturedAt: capturedAt && !isNaN(capturedAt.getTime()) ? capturedAt : null,
        note: body.note ? String(body.note) : undefined,
        name: file.originalname || 'attachment',
        mimeType: file.mimetype || 'application/octet-stream',
        buffer: file.buffer,
      });
      res.status(201).json(att);
      void logAudit(req, 'attachment.created', 'job', att.jobId, `Attached ${att.name} to job ${att.jobNumber}`);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to upload attachment' });
    }
  });

  app.get('/api/attachments/:id/download', async (req, res) => {
    try {
      const att = await getJobAttachment(req.params.id);
      if (!att) return res.status(404).json({ error: 'Not found' });
      const doc = await getDocument(att.documentId);
      if (!doc) return res.status(404).json({ error: 'Not found' });
      const filePath = await getDocumentFilePath(doc);
      res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.name)}"`);
      res.sendFile(filePath);
    } catch (error) {
      res.status(500).json({ error: 'Failed to download attachment' });
    }
  });

  app.delete('/api/attachments/:id', async (req, res) => {
    try {
      const ok = await deleteJobAttachment(req.params.id);
      if (!ok) return res.status(404).json({ error: 'Not found' });
      res.json({ ok: true });
      void logAudit(req, 'attachment.deleted', 'job', req.params.id, 'Deleted attachment');
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete attachment' });
    }
  });


  // Catch-all for unknown /api/* routes → JSON 404 (not the SPA fallback).
  app.use('/api', (req, res) => {
    res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    void startWhatsApp();
    startMailPolling();
  });
}

startServer();
