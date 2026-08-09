import path from 'path';
import fs from 'fs/promises';
import PDFDocument from 'pdfkit';
import { ulid } from 'ulid';
import { eq, desc, asc, and, inArray } from 'drizzle-orm';
import { db } from '../db/index';
import { documents, jobAttachments, settings, customers, devices, jobs } from '../db/schema';
import { sendMail } from './email';
import { sendWhatsAppText, sendWhatsAppDocument, sendWhatsAppImage } from './whatsapp';
import { documentsDir } from '../lib/paths';

const DATA_DIR = documentsDir();

// ---------------------------------------------------------------- Storage

async function ensureStorageDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readSetting(key: string, fallback = '') {
  const rows = await db.select().from(settings).where(eq(settings.key, key));
  return rows[0]?.value ?? fallback;
}

export interface StoredDocument {
  id: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  sendAlong: number | null;
  createdAt: Date | null;
  storageKey: string;
}

export async function saveDocument(input: { name: string; mimeType: string; buffer: Buffer }): Promise<StoredDocument> {
  await ensureStorageDir();
  const ext = path.extname(input.name);
  const id = ulid();
  const storageKey = `${id}${ext}`;
  await fs.writeFile(path.join(DATA_DIR, storageKey), input.buffer);
  const row = await db.insert(documents).values({
    id,
    name: input.name,
    mimeType: input.mimeType || 'application/octet-stream',
    size: input.buffer.length,
    storageKey,
    sendAlong: 0,
  }).returning();
  return row[0];
}

export async function listDocuments(): Promise<StoredDocument[]> {
  return db.select({
    id: documents.id,
    name: documents.name,
    mimeType: documents.mimeType,
    size: documents.size,
    sendAlong: documents.sendAlong,
    createdAt: documents.createdAt,
    storageKey: documents.storageKey,
  }).from(documents).orderBy(desc(documents.createdAt));
}

export async function getDocument(id: string) {
  const rows = await db.select().from(documents).where(eq(documents.id, id));
  return rows[0] || null;
}

export async function getDocumentFilePath(row: { storageKey: string }): Promise<string> {
  const p = path.join(DATA_DIR, row.storageKey);
  // Guard against path traversal via storageKey.
  if (!p.startsWith(DATA_DIR)) throw new Error('Invalid document path');
  return p;
}

export async function deleteDocument(id: string): Promise<boolean> {
  const row = await getDocument(id);
  if (!row) return false;
  await db.delete(documents).where(eq(documents.id, id));
  try {
    await fs.unlink(await getDocumentFilePath(row));
  } catch { /* file may already be gone */ }
  return true;
}

export async function setDocumentSendAlong(id: string, sendAlong: boolean): Promise<void> {
  await db.update(documents).set({ sendAlong: sendAlong ? 1 : 0 }).where(eq(documents.id, id));
}

export async function getSendAlongDocuments(): Promise<StoredDocument[]> {
  const rows = await db.select().from(documents).where(eq(documents.sendAlong, 1)).orderBy(desc(documents.createdAt));
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    mimeType: r.mimeType,
    size: r.size,
    sendAlong: r.sendAlong,
    createdAt: r.createdAt,
    storageKey: r.storageKey,
  }));
}

// ---------------------------------------------------------------- Job attachments

export const CATEGORY_LABELS: Record<string, string> = {
  intake: 'Intake',
  before: 'Before',
  after: 'After',
  scratch: 'Scratch',
  breakage: 'Breakage',
  repair: 'Repair',
  document: 'Document',
  photo: 'Photo',
  other: 'Other',
};

export function categoryLabel(category: string | null | undefined): string {
  if (!category) return 'Photo';
  return CATEGORY_LABELS[category] || category;
}

export interface JobAttachmentRecord {
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
  capturedAt: Date | null;
  note: string | null;
  createdAt: Date | null;
}

async function decorateAttachments(rows: Array<Record<string, any>>): Promise<JobAttachmentRecord[]> {
  const jobIds = [...new Set(rows.map(r => r.jobId).filter(Boolean))];
  const customerIds = [...new Set(rows.map(r => r.customerId).filter(Boolean))];
  const deviceIds = [...new Set(rows.map(r => r.deviceId).filter(Boolean))];

  const [jobRows, customerRows, deviceRows] = await Promise.all([
    jobIds.length ? db.select({ id: jobs.id, jobNumber: jobs.jobNumber }).from(jobs).where(inArray(jobs.id, jobIds)) : Promise.resolve([]),
    customerIds.length ? db.select({ id: customers.id, fullName: customers.fullName }).from(customers).where(inArray(customers.id, customerIds)) : Promise.resolve([]),
    deviceIds.length ? db.select({ id: devices.id, manufacturer: devices.manufacturer, model: devices.model }).from(devices).where(inArray(devices.id, deviceIds)) : Promise.resolve([]),
  ]);

  const jobMap = new Map(jobRows.map(j => [j.id, j.jobNumber]));
  const customerMap = new Map(customerRows.map(c => [c.id, c.fullName]));
  const deviceMap = new Map(deviceRows.map(d => [d.id, [d.manufacturer, d.model].filter(Boolean).join(' ') || 'Device']));

  return rows.map(r => ({
    id: r.id,
    jobId: r.jobId,
    jobNumber: r.jobId ? jobMap.get(r.jobId) || null : null,
    customerId: r.customerId || null,
    customerName: r.customerId ? customerMap.get(r.customerId) || null : null,
    deviceId: r.deviceId || null,
    deviceSummary: r.deviceId ? deviceMap.get(r.deviceId) || null : null,
    documentId: r.documentId,
    name: r.name || 'unnamed',
    mimeType: r.mimeType || null,
    size: r.size ?? null,
    category: r.category || null,
    phase: r.phase || null,
    capturedAt: r.capturedAt ?? null,
    note: r.note || null,
    createdAt: r.createdAt ?? null,
  }));
}

export async function listJobAttachments(filters: { jobId?: string; customerId?: string; deviceId?: string; category?: string; phase?: string } = {}): Promise<JobAttachmentRecord[]> {
  const conds = [];
  if (filters.jobId) conds.push(eq(jobAttachments.jobId, filters.jobId));
  if (filters.customerId) conds.push(eq(jobAttachments.customerId, filters.customerId));
  if (filters.deviceId) conds.push(eq(jobAttachments.deviceId, filters.deviceId));
  if (filters.category) conds.push(eq(jobAttachments.category, filters.category));
  if (filters.phase) conds.push(eq(jobAttachments.phase, filters.phase));
  const rows = await db.select({
    id: jobAttachments.id,
    jobId: jobAttachments.jobId,
    customerId: jobAttachments.customerId,
    deviceId: jobAttachments.deviceId,
    documentId: jobAttachments.documentId,
    category: jobAttachments.category,
    phase: jobAttachments.phase,
    capturedAt: jobAttachments.capturedAt,
    note: jobAttachments.note,
    createdAt: jobAttachments.createdAt,
    name: documents.name,
    mimeType: documents.mimeType,
    size: documents.size,
  }).from(jobAttachments)
    .leftJoin(documents, eq(jobAttachments.documentId, documents.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(jobAttachments.createdAt));
  return decorateAttachments(rows as any[]);
}

export async function getJobAttachment(id: string): Promise<JobAttachmentRecord | null> {
  const rows = await db.select({
    id: jobAttachments.id,
    jobId: jobAttachments.jobId,
    customerId: jobAttachments.customerId,
    deviceId: jobAttachments.deviceId,
    documentId: jobAttachments.documentId,
    category: jobAttachments.category,
    phase: jobAttachments.phase,
    capturedAt: jobAttachments.capturedAt,
    note: jobAttachments.note,
    createdAt: jobAttachments.createdAt,
    name: documents.name,
    mimeType: documents.mimeType,
    size: documents.size,
  }).from(jobAttachments)
    .leftJoin(documents, eq(jobAttachments.documentId, documents.id))
    .where(eq(jobAttachments.id, id));
  const decorated = await decorateAttachments(rows as any[]);
  return decorated[0] || null;
}

export async function saveJobAttachment(input: {
  jobId: string;
  category?: string;
  phase?: string | null;
  capturedAt?: Date | null;
  note?: string;
  name: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<JobAttachmentRecord> {
  const jobRows = await db.select().from(jobs).where(eq(jobs.id, input.jobId));
  const job = jobRows[0];
  if (!job) throw new Error('Job not found');

  const doc = await saveDocument({ name: input.name, mimeType: input.mimeType, buffer: input.buffer });

  const id = ulid();
  await db.insert(jobAttachments).values({
    id,
    jobId: input.jobId,
    documentId: doc.id,
    customerId: job.customerId,
    deviceId: job.deviceId,
    category: input.category || 'photo',
    phase: input.phase || null,
    capturedAt: input.capturedAt || null,
    note: input.note || null,
  });
  return (await getJobAttachment(id))!;
}

export async function deleteJobAttachment(id: string): Promise<boolean> {
  const rows = await db.select().from(jobAttachments).where(eq(jobAttachments.id, id));
  const att = rows[0];
  if (!att) return false;
  await db.delete(jobAttachments).where(eq(jobAttachments.id, id));
  const docRows = await db.select().from(documents).where(eq(documents.id, att.documentId));
  if (docRows[0]) {
    await db.delete(documents).where(eq(documents.id, att.documentId));
    try {
      await fs.unlink(await getDocumentFilePath(docRows[0]));
    } catch { /* file may already be gone */ }
  }
  return true;
}

export interface JobPhoto {
  attachmentId: string;
  documentId: string;
  name: string;
  mimeType: string | null;
  category: string | null;
  phase: string | null;
  capturedAt: Date | null;
  note: string | null;
  buffer: Buffer;
}

// Photo/condition shots for a job. Only image MIME types are returned so they can
// be embedded into PDFs and sent as WhatsApp image messages.
export async function getJobPhotos(jobId: string, opts: { phase?: string } = {}): Promise<JobPhoto[]> {
  const conds = [eq(jobAttachments.jobId, jobId)];
  if (opts.phase) conds.push(eq(jobAttachments.phase, opts.phase));
  const rows = await db.select({
    id: jobAttachments.id,
    documentId: jobAttachments.documentId,
    category: jobAttachments.category,
    phase: jobAttachments.phase,
    capturedAt: jobAttachments.capturedAt,
    note: jobAttachments.note,
    name: documents.name,
    mimeType: documents.mimeType,
    storageKey: documents.storageKey,
  }).from(jobAttachments)
    .leftJoin(documents, eq(jobAttachments.documentId, documents.id))
    .where(and(...conds))
    .orderBy(asc(jobAttachments.capturedAt));
  const photos: JobPhoto[] = [];
  for (const r of rows as any[]) {
    if (!r.storageKey || !(r.mimeType || '').startsWith('image/')) continue;
    try {
      const filePath = await getDocumentFilePath({ storageKey: r.storageKey });
      photos.push({
        attachmentId: r.id,
        documentId: r.documentId,
        name: r.name || 'photo',
        mimeType: r.mimeType || null,
        category: r.category || null,
        phase: r.phase || null,
        capturedAt: r.capturedAt ?? null,
        note: r.note || null,
        buffer: await fs.readFile(filePath),
      });
    } catch (err) {
      console.error('[documents] failed reading job photo', r.id, err);
    }
  }
  return photos;
}

// Flat attachment list (filenames + buffers) for reuse in invoice/quote sends.
export async function getJobPhotoAttachments(jobId: string): Promise<{ filename: string; content: Buffer; contentType?: string }[]> {
  const photos = await getJobPhotos(jobId);
  return photos.map(p => ({ filename: p.name, content: p.buffer, contentType: p.mimeType || undefined }));
}

// ---------------------------------------------------------------- PDF job card

interface JobCardData {
  jobNumber: string;
  dateReceived: Date | null;
  priority: string;
  status: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  deviceSummary: string;
  deviceSerial: string | null;
  reportedProblem: string | null;
  accessoriesReceived: string | null;
  physicalCondition: string | null;
  existingDamage: string | null;
  technician: string | null;
  photos?: JobPhoto[];
}

// Draw a grid of device photos onto the PDF. Adds a fresh page so the job card
// body stays clean. Reused by the job card now and available for invoice/quote PDFs.
export function embedJobPhotos(doc: PDFKit.PDFDocument, photos: JobPhoto[], opts: { title?: string; freshPage?: boolean } = {}) {
  if (!photos.length) return;
  if (opts.freshPage !== false) doc.addPage();
  if (opts.title) {
    doc.fontSize(13).fillColor('#4338ca').text(opts.title.toUpperCase());
    doc.moveDown(0.5);
  }

  const cols = 2;
  const cellW = (doc.page.width - doc.page.margins.left - doc.page.margins.right - 12) / cols;
  const cellH = 175;
  const imgH = cellH - 20;
  let x = doc.page.margins.left;
  let y = doc.y;

  for (const p of photos) {
    if (x > doc.page.margins.left && x + cellW > doc.page.width - doc.page.margins.right) {
      x = doc.page.margins.left;
      y += cellH + 14;
    }
    if (y + cellH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      x = doc.page.margins.left;
      y = doc.page.margins.top;
    }
    try {
      doc.image(p.buffer, x, y, { fit: [cellW - 8, imgH] });
    } catch {
      doc.fontSize(8).fillColor('#94a3b8').text('(unreadable image)', x, y, { width: cellW - 8 });
    }
    const caption = [categoryLabel(p.category), p.phase].filter(Boolean).join(' · ');
    doc.fontSize(7).fillColor('#64748b').text(caption, x, y + cellH - 16, { width: cellW - 8 });
    x += cellW + 12;
  }
}

export async function buildJobCardPdf(job: JobCardData): Promise<Buffer> {
  const bizName = (await readSetting('business_name', 'DJ TECH')) || 'DJ TECH';
  const bizTagline = await readSetting('business_tagline');
  const bizPhone = await readSetting('business_phone');
  const bizEmail = await readSetting('business_email');
  const bizAddress = await readSetting('business_address');
  const warrantyDays = (await readSetting('warranty_days', '30')) || '30';

  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: 'A4', margin: 48 });

  doc.on('data', (c: Buffer) => chunks.push(c));
  doc.on('end', () => {});

  // Header
  doc.fontSize(20).fillColor('#1e293b').text(bizName, { continued: false });
  if (bizTagline) doc.fontSize(10).fillColor('#64748b').text(bizTagline);
  doc.moveDown(0.5);
  const bizLines = [bizPhone, bizEmail, bizAddress].filter(Boolean).join('  |  ');
  if (bizLines) doc.fontSize(9).fillColor('#94a3b8').text(bizLines);
  doc.moveDown();
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#cbd5e1').lineWidth(1).stroke();
  doc.moveDown();

  // Title
  doc.fontSize(15).fillColor('#4338ca').text('JOB CARD', { continued: true });
  doc.fontSize(9).fillColor('#64748b').text(`   ${job.jobNumber}`, { align: 'right' });
  doc.moveDown();

  // Field grid helper — draws at explicit coordinates so two columns align.
  const field = (x: number, y: number, text: string, value: string | null) => {
    doc.fontSize(7).fillColor('#94a3b8').text(text.toUpperCase(), x, y, { width: 230 });
    doc.fontSize(10).fillColor('#0f172a').text(value || '—', x, y + 10, { width: 230 });
  };

  const colX = doc.page.margins.left;
  const col2X = colX + 260;
  let rowY = doc.y;
  field(colX, rowY, 'Customer', job.customerName);
  field(col2X, rowY, 'Device', job.deviceSummary);
  rowY += 26;
  field(colX, rowY, 'Phone', job.customerPhone);
  field(col2X, rowY, 'Serial Number', job.deviceSerial);
  rowY += 26;
  field(colX, rowY, 'Email', job.customerEmail);
  field(col2X, rowY, 'Status', job.status);
  rowY += 26;
  field(col2X, rowY, 'Priority', job.priority);

  doc.y = rowY + 16;
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#cbd5e1').lineWidth(1).stroke();
  doc.moveDown();

  const block = (title: string, value: string | null | undefined) => {
    doc.fontSize(8).fillColor('#4338ca').text(title.toUpperCase());
    doc.fontSize(10).fillColor('#0f172a').text(value || '—');
    doc.moveDown(1);
  };

  block('Reported Problem', job.reportedProblem);
  block('Physical Condition', job.physicalCondition);
  block('Existing Damage', job.existingDamage);
  block('Accessories Received', job.accessoriesReceived);
  block('Technician', job.technician);

  if (job.photos?.length) {
    embedJobPhotos(doc, job.photos, { title: 'Device Photos' });
  }

  doc.moveDown();
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#cbd5e1').lineWidth(1).stroke();
  doc.moveDown();
  doc.fontSize(8).fillColor('#94a3b8')
    .text(`Received on ${job.dateReceived ? new Date(job.dateReceived).toLocaleDateString() : '—'}  |  Warranty: ${warrantyDays} days from repair completion.`);
  doc.fontSize(7).fillColor('#cbd5e1').text('This job card confirms your device has been accepted into the DJ TECH workshop.', { align: 'center' });

  doc.end();

  return new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

// Standalone "Device Photos" PDF (before/after shots) for attaching to
// invoice/quote sends. Returns null when the job has no photos.
export async function buildJobPhotosPdf(jobId: string): Promise<{ buffer: Buffer; filename: string } | null> {
  const photos = await getJobPhotos(jobId);
  if (!photos.length) return null;

  const jobRows = await db.select({ jobNumber: jobs.jobNumber }).from(jobs).where(eq(jobs.id, jobId));
  const jobNumber = jobRows[0]?.jobNumber || 'JOB';

  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  doc.on('data', (c: Buffer) => chunks.push(c));
  doc.on('end', () => {});
  doc.fontSize(13).fillColor('#4338ca').text(`DEVICE PHOTOS  ${jobNumber}`);
  doc.moveDown(0.5);
  embedJobPhotos(doc, photos, { freshPage: false });
  doc.end();
  return new Promise<{ buffer: Buffer; filename: string }>((resolve, reject) => {
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), filename: `${jobNumber.replace(/[^A-Za-z0-9-]/g, '_')}_Photos.pdf` }));
    doc.on('error', reject);
  });
}

// ---------------------------------------------------------------- Intake send

function buildIntakeMessage(job: JobCardData, trackingUrl?: string): string {
  const lines = [
    `Hi ${job.customerName},`,
    '',
    `Your device has been booked into our workshop (Job #${job.jobNumber}).`,
    '',
    `Device: ${job.deviceSummary}`,
    `Problem reported: ${job.reportedProblem || '—'}`,
    job.accessoriesReceived ? `Accessories received: ${job.accessoriesReceived}` : '',
    job.physicalCondition ? `Physical condition: ${job.physicalCondition}` : '',
    job.existingDamage ? `Existing damage: ${job.existingDamage}` : '',
    '',
    'Please keep this job number for reference. We will keep you updated on progress.',
    trackingUrl ? `Track your repair here: ${trackingUrl}` : '',
  ].filter((l) => l !== '');
  return lines.join('\n');
}

// Public tracking link for a job, when it has a tracking code and a base URL
// is available. Falls back to undefined so older sends stay link-free.
function trackingUrl(job: { trackingCode?: string | null }, baseUrl?: string): string | undefined {
  if (!job.trackingCode || !baseUrl) return undefined;
  return `${baseUrl.replace(/\/+$/, '')}/track/${job.trackingCode}`;
}

// Send the job card + all "send along" documents to the customer via WhatsApp
// and/or email. Never throws — failures are logged so job creation is unaffected.
export async function sendJobIntake(jobId: string, baseUrl?: string): Promise<{ whatsapp: boolean; email: boolean; documents: number }> {
  const result = { whatsapp: false, email: false, documents: 0 };
  try {
    const jobRows = await db.select().from(jobs).where(eq(jobs.id, jobId));
    const job = jobRows[0];
    if (!job) return result;

    const customerRows = await db.select().from(customers).where(eq(customers.id, job.customerId));
    const customer = customerRows[0];
    if (!customer) return result;

    const deviceRows = job.deviceId ? await db.select().from(devices).where(eq(devices.id, job.deviceId)) : [];
    const device = deviceRows[0];

    const jobCard: JobCardData = {
      jobNumber: job.jobNumber,
      dateReceived: job.dateReceived,
      priority: job.priority || 'normal',
      status: job.status || 'Received',
      customerName: customer.fullName,
      customerPhone: customer.phone || null,
      customerEmail: customer.email || null,
      deviceSummary: [device?.manufacturer, device?.model].filter(Boolean).join(' ') || 'Device',
      deviceSerial: device?.serialNumber || null,
      reportedProblem: job.reportedProblem,
      accessoriesReceived: job.accessoriesReceived,
      physicalCondition: job.physicalCondition,
      existingDamage: job.existingDamage,
      technician: job.technician,
    };

    const message = buildIntakeMessage(jobCard, trackingUrl(job, baseUrl));
    const sendAlong = await getSendAlongDocuments();

    // Device condition photos (scratches, breakage, etc.) captured on this job.
    const photos = await getJobPhotos(jobId);

    // Build the PDF job card + attach toggled documents + job photos.
    const pdf = await buildJobCardPdf({ ...jobCard, photos });
    const pdfName = `${job.jobNumber.replace(/[^A-Za-z0-9-]/g, '_')}_JobCard.pdf`;

    const attachments: { filename: string; content: Buffer; contentType?: string }[] = [
      { filename: pdfName, content: pdf, contentType: 'application/pdf' },
    ];
    for (const d of sendAlong) {
      try {
        const filePath = await getDocumentFilePath(d);
        const buf = await fs.readFile(filePath);
        attachments.push({ filename: d.name, content: buf, contentType: d.mimeType || undefined });
      } catch (err) {
        console.error('[documents] failed reading send-along doc', d.id, err);
      }
    }
    for (const p of photos) {
      attachments.push({ filename: p.name, content: p.buffer, contentType: p.mimeType || undefined });
    }
    result.documents = attachments.length;

    // WhatsApp — send the PDF + toggled docs as documents, photos as images
    // (clearer for condition shots), with the intake text on the job card.
    if (customer.phone) {
      try {
        await sendWhatsAppDocument(customer.phone, pdf, pdfName, 'application/pdf', message);
        for (const att of attachments.slice(1)) {
          const isImage = (att.contentType || '').startsWith('image/');
          if (isImage) {
            await sendWhatsAppImage(customer.phone, att.content, categoryLabel('photo'));
          } else {
            await sendWhatsAppDocument(customer.phone, att.content, att.filename, att.contentType || 'application/octet-stream');
          }
        }
        result.whatsapp = true;
      } catch (err) {
        console.error('[documents] whatsapp intake send failed for job', jobId, (err as any)?.message || err);
      }
    }

    // Email
    if (customer.email) {
      try {
        await sendMail({
          to: customer.email,
          toName: customer.fullName,
          subject: `Your device has been received — ${job.jobNumber}`,
          text: message,
          html: message.replace(/\n/g, '<br/>'),
          attachments,
        });
        result.email = true;
      } catch (err) {
        console.error('[documents] email intake send failed for job', jobId, (err as any)?.message || err);
      }
    }
  } catch (err) {
    console.error('[documents] sendJobIntake failed for job', jobId, (err as any)?.message || err);
  }
  return result;
}
