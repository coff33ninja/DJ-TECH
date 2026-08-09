import PDFDocument from 'pdfkit';
import { eq } from 'drizzle-orm';
import { db } from '../db/index';
import { quotes, invoices, quoteItems, invoiceItems, customers, jobs, devices } from '../db/schema';
import { readSetting, getJobPhotos, embedJobPhotos } from './documents';
import { sendMail } from './email';
import { sendWhatsAppDocument } from './whatsapp';

// ---------------------------------------------------------------- PDF helpers

interface BillingLineItem {
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface BillingData {
  kind: 'quote' | 'invoice';
  docNumber: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  jobNumber: string | null;
  deviceSummary: string;
  deviceSerial: string | null;
  status: string;
  items: BillingLineItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amountPaid: number;
  date: Date | null;
  validUntil: Date | null;
  dueDate: Date | null;
  photos: Awaited<ReturnType<typeof getJobPhotos>>;
}

export async function buildBillingPdf(data: BillingData): Promise<Buffer> {
  const bizName = (await readSetting('business_name', 'DJ TECH')) || 'DJ TECH';
  const bizTagline = await readSetting('business_tagline');
  const bizPhone = await readSetting('business_phone');
  const bizEmail = await readSetting('business_email');
  const bizAddress = await readSetting('business_address');
  const vatRate = parseFloat(await readSetting('vat_rate', '0.15')) || 0.15;
  const isQuote = data.kind === 'quote';
  const balance = data.total - data.amountPaid;

  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  doc.on('data', (c: Buffer) => chunks.push(c));

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
  doc.fontSize(15).fillColor('#4338ca').text(isQuote ? 'QUOTE' : 'INVOICE', { continued: true });
  doc.fontSize(9).fillColor('#64748b').text(`   ${data.docNumber}`, { align: 'right' });
  doc.moveDown();

  const field = (x: number, y: number, text: string, value: string | null) => {
    doc.fontSize(7).fillColor('#94a3b8').text(text.toUpperCase(), x, y, { width: 230 });
    doc.fontSize(10).fillColor('#0f172a').text(value || '—', x, y + 10, { width: 230 });
  };

  const colX = doc.page.margins.left;
  const col2X = colX + 260;
  let rowY = doc.y;
  field(colX, rowY, 'Customer', data.customerName);
  field(col2X, rowY, 'Device', data.deviceSummary);
  rowY += 26;
  field(colX, rowY, 'Phone', data.customerPhone);
  field(col2X, rowY, 'Serial Number', data.deviceSerial);
  rowY += 26;
  field(colX, rowY, 'Job', data.jobNumber);
  field(col2X, rowY, isQuote ? 'Valid Until' : 'Due Date', (isQuote ? data.validUntil : data.dueDate) ? new Date((isQuote ? data.validUntil : data.dueDate) as Date).toLocaleDateString() : '—');
  rowY += 26;
  field(colX, rowY, 'Date', data.date ? new Date(data.date).toLocaleDateString() : '—');
  field(col2X, rowY, 'Status', data.status);

  doc.y = rowY + 16;
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#cbd5e1').lineWidth(1).stroke();
  doc.moveDown();

  // Line items
  const tblTop = doc.y;
  const tblLeft = doc.page.margins.left;
  const tblRight = doc.page.width - doc.page.margins.right;
  const colW = {
    item: tblRight - tblLeft - 200,
    qty: 50,
    unit: 75,
    total: 75,
  };
  const headerY = tblTop;
  doc.fontSize(8).fillColor('#4338ca');
  doc.text('ITEM', tblLeft, headerY, { width: colW.item });
  doc.text('QTY', tblLeft + colW.item, headerY, { width: colW.qty, align: 'center' });
  doc.text('UNIT PRICE', tblLeft + colW.item + colW.qty, headerY, { width: colW.unit, align: 'right' });
  doc.text('LINE TOTAL', tblLeft + colW.item + colW.qty + colW.unit, headerY, { width: colW.total, align: 'right' });
  doc.moveDown(0.5);

  let y = doc.y;
  for (const it of data.items) {
    doc.fontSize(9).fillColor('#0f172a');
    doc.text(it.name, tblLeft, y, { width: colW.item });
    if (it.description) doc.fontSize(7).fillColor('#64748b').text(it.description, tblLeft, y + 11, { width: colW.item });
    doc.fontSize(9).fillColor('#0f172a');
    doc.text(String(it.quantity), tblLeft + colW.item, y, { width: colW.qty, align: 'center' });
    doc.text(`R${it.unitPrice.toFixed(2)}`, tblLeft + colW.item + colW.qty, y, { width: colW.unit, align: 'right' });
    doc.text(`R${it.lineTotal.toFixed(2)}`, tblLeft + colW.item + colW.qty + colW.unit, y, { width: colW.total, align: 'right' });
    y += (it.description ? 20 : 15);
  }

  doc.y = y;
  doc.moveTo(tblLeft, doc.y).lineTo(tblRight, doc.y).strokeColor('#cbd5e1').lineWidth(1).stroke();
  doc.moveDown();

  const totalLine = (label: string, value: string, bold = false) => {
    doc.fontSize(bold ? 10 : 9).fillColor(bold ? '#0f172a' : '#64748b');
    doc.text(label, tblLeft, doc.y, { width: 300 });
    doc.text(value, tblLeft + 300, doc.y, { width: tblRight - tblLeft - 300, align: 'right' });
    doc.moveDown(0.4);
  };

  totalLine('Subtotal', `R${data.subtotal.toFixed(2)}`);
  if (data.discount > 0) totalLine('Discount', `-R${data.discount.toFixed(2)}`);
  totalLine(`VAT (${(vatRate * 100).toFixed(0)}%)`, `R${data.tax.toFixed(2)}`);
  totalLine(`${isQuote ? 'Total' : 'Total Due'}`, `R${data.total.toFixed(2)}`, true);
  if (!isQuote && data.amountPaid > 0) {
    totalLine('Amount Paid', `R${data.amountPaid.toFixed(2)}`);
    totalLine('Balance', `R${balance.toFixed(2)}`, true);
  }

  doc.moveDown();
  doc.moveTo(tblLeft, doc.y).lineTo(tblRight, doc.y).strokeColor('#cbd5e1').lineWidth(1).stroke();
  doc.moveDown();

  if (data.photos.length) {
    embedJobPhotos(doc, data.photos, { title: 'Device Photos' });
    doc.moveDown();
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#cbd5e1').lineWidth(1).stroke();
    doc.moveDown();
  }

  if (isQuote && data.validUntil) {
    doc.fontSize(8).fillColor('#94a3b8').text(`This quote is valid until ${new Date(data.validUntil).toLocaleDateString()}.`);
  } else if (!isQuote && data.dueDate) {
    doc.fontSize(8).fillColor('#94a3b8').text(`Payment is due by ${new Date(data.dueDate).toLocaleDateString()}.`);
  }
  doc.fontSize(7).fillColor('#cbd5e1').text('Thank you for choosing DJ TECH.', { align: 'center' });

  doc.end();

  return new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

async function loadBillingData(kind: 'quote' | 'invoice', id: string): Promise<BillingData | null> {
  let docRow: any;
  let items: any[];
  if (kind === 'quote') {
    const q = (await db.select().from(quotes).where(eq(quotes.id, id)))[0];
    if (!q) return null;
    docRow = q;
    items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, id));
  } else {
    const inv = (await db.select().from(invoices).where(eq(invoices.id, id)))[0];
    if (!inv) return null;
    docRow = inv;
    items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id));
  }

  const customerRows = await db.select().from(customers).where(eq(customers.id, docRow.customerId));
  const customer = customerRows[0];
  const jobRows = docRow.jobId ? await db.select().from(jobs).where(eq(jobs.id, docRow.jobId)) : [];
  const job = jobRows[0];
  const deviceRows = job?.deviceId ? await db.select().from(devices).where(eq(devices.id, job.deviceId)) : [];
  const device = deviceRows[0];

  return {
    kind,
    docNumber: kind === 'quote' ? docRow.quoteNumber : docRow.invoiceNumber,
    customerName: customer?.fullName || 'Unknown',
    customerPhone: customer?.phone || null,
    customerEmail: customer?.email || null,
    jobNumber: job?.jobNumber || null,
    deviceSummary: [device?.manufacturer, device?.model].filter(Boolean).join(' ') || 'Device',
    deviceSerial: device?.serialNumber || null,
    status: docRow.status || 'Draft',
    items: items.map(it => ({
      name: it.name,
      description: it.description || null,
      quantity: it.quantity || 1,
      unitPrice: it.unitPrice || 0,
      lineTotal: it.lineTotal || 0,
    })),
    subtotal: docRow.subtotal || 0,
    discount: docRow.discount || 0,
    tax: docRow.tax || 0,
    total: docRow.total || 0,
    amountPaid: docRow.amountPaid || 0,
    date: docRow.createdAt,
    validUntil: kind === 'quote' ? (docRow.validUntil || null) : null,
    dueDate: kind === 'invoice' ? (docRow.dueDate || null) : null,
    photos: docRow.jobId ? await getJobPhotos(docRow.jobId) : [],
  };
}

export async function buildQuotePdf(id: string): Promise<Buffer | null> {
  const data = await loadBillingData('quote', id);
  return data ? buildBillingPdf(data) : null;
}

export async function buildInvoicePdf(id: string): Promise<Buffer | null> {
  const data = await loadBillingData('invoice', id);
  return data ? buildBillingPdf(data) : null;
}

// ---------------------------------------------------------------- Send

function buildBillingMessage(data: BillingData): string {
  const isQuote = data.kind === 'quote';
  const lines = [
    `Hi ${data.customerName},`,
    '',
    `Please find your ${isQuote ? 'quote' : 'invoice'} (${data.docNumber}) attached.`,
    data.jobNumber ? `Job: ${data.jobNumber}` : '',
    data.deviceSummary ? `Device: ${data.deviceSummary}` : '',
    '',
    isQuote
      ? `Total: R${data.total.toFixed(2)}${data.validUntil ? ` — valid until ${new Date(data.validUntil).toLocaleDateString()}` : ''}`
      : `Total: R${data.total.toFixed(2)} — balance R${(data.total - data.amountPaid).toFixed(2)}${data.dueDate ? ` (due ${new Date(data.dueDate).toLocaleDateString()})` : ''}`,
    data.photos.length ? 'Device photos are included as before/after proof.' : '',
    '',
    'Please let us know if you have any questions.',
  ].filter((l) => l !== '');
  return lines.join('\n');
}

// Send the quote/invoice PDF (with embedded device photos) to the customer via
// WhatsApp and/or email. Never throws — failures are logged.
export async function sendBillingDoc(kind: 'quote' | 'invoice', id: string): Promise<{ whatsapp: boolean; email: boolean; pdf: boolean }> {
  const result = { whatsapp: false, email: false, pdf: false };
  try {
    const data = await loadBillingData(kind, id);
    if (!data) return result;

    const pdf = await buildBillingPdf(data);
    const pdfName = `${data.docNumber.replace(/[^A-Za-z0-9-]/g, '_')}.pdf`;
    result.pdf = true;
    const message = buildBillingMessage(data);

    if (data.customerPhone) {
      try {
        await sendWhatsAppDocument(data.customerPhone, pdf, pdfName, 'application/pdf', message);
        result.whatsapp = true;
      } catch (err) {
        console.error(`[billing] whatsapp send failed for ${kind}`, id, (err as any)?.message || err);
      }
    }

    if (data.customerEmail) {
      try {
        await sendMail({
          to: data.customerEmail,
          toName: data.customerName,
          subject: `${data.kind === 'quote' ? 'Your Quote' : 'Your Invoice'} — ${data.docNumber}`,
          text: message,
          html: message.replace(/\n/g, '<br/>'),
          attachments: [{ filename: pdfName, content: pdf, contentType: 'application/pdf' }],
        });
        result.email = true;
      } catch (err) {
        console.error(`[billing] email send failed for ${kind}`, id, (err as any)?.message || err);
      }
    }
  } catch (err) {
    console.error(`[billing] sendBillingDoc failed for ${kind}`, id, (err as any)?.message || err);
  }
  return result;
}
