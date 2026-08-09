import { sqliteTable, text, integer, real, blob } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const customers = sqliteTable('customers', {
  id: text('id').primaryKey(), // ULID or UUID
  fullName: text('full_name').notNull(),
  companyName: text('company_name'),
  customerType: text('customer_type').default('individual'), // individual, company
  phone: text('phone'),
  email: text('email'),
  address: text('address'),
  notes: text('notes'),
  status: text('status').default('active'), // active, inactive
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

export const devices = sqliteTable('devices', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').references(() => customers.id).notNull(),
  deviceType: text('device_type'), // pc, laptop, monitor, printer, console, phone, tablet, powerlead, other
  manufacturer: text('manufacturer'),
  model: text('model'),
  serialNumber: text('serial_number'),
  assetTag: text('asset_tag'),

  // Component presence toggles (1 = present / being tracked)
  hasCpu: integer('has_cpu').default(0),
  hasRam: integer('has_ram').default(0),
  hasMotherboard: integer('has_motherboard').default(0),
  hasBox: integer('has_box').default(0),
  hasPowersupply: integer('has_powersupply').default(0),
  hasHdd: integer('has_hdd').default(0),
  hasSsd: integer('has_ssd').default(0),
  hasGpu: integer('has_gpu').default(0),
  hasBattery: integer('has_battery').default(0),
  hasCharger: integer('has_charger').default(0),
  hasBoxType: integer('has_box_type').default(0),

  // Component specs
  cpu: text('cpu'),
  ram: text('ram'),
  motherboard: text('motherboard'),
  box: text('box'),
  powersupply: text('powersupply'),
  hdd: text('hdd'),
  ssd: text('ssd'),
  gpu: text('gpu'),
  battery: text('battery'),
  charger: text('charger'),
  boxType: text('box_type'),

  storage: text('storage'), // legacy combined field
  operatingSystem: text('operating_system'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  jobNumber: text('job_number').notNull().unique(), // e.g. DJ-2026-0042
  customerId: text('customer_id').references(() => customers.id).notNull(),
  deviceId: text('device_id').references(() => devices.id).notNull(),
  dateReceived: integer('date_received', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  expectedCompletionDate: integer('expected_completion_date', { mode: 'timestamp' }),
  technician: text('technician'),
  priority: text('priority').default('normal'), // low, normal, high, urgent
  status: text('status').default('Received'), // Received, Diagnosing, Awaiting Approval, Awaiting Parts, Repairing, Testing, Ready for Collection, Collected, Completed, Cancelled
  
  // Check-in / Condition Report
  accessoriesReceived: text('accessories_received'),
  physicalCondition: text('physical_condition'),
  existingDamage: text('existing_damage'), // Scratches, cracked screen, liquid damage, etc.
  devicePassword: text('device_password'),
  
  reportedProblem: text('reported_problem'),
  initialDiagnosis: text('initial_diagnosis'),
  technicianNotes: text('technician_notes'),
  customerVisibleNotes: text('customer_visible_notes'),
  workPerformed: text('work_performed'),
  
  warrantyPeriodDays: integer('warranty_period_days').default(0),
  completionDate: integer('completion_date', { mode: 'timestamp' }),
  collectionDate: integer('collection_date', { mode: 'timestamp' }),

  // Per-job intake override: -1 = follow global setting, 0 = don't auto-send, 1 = always auto-send.
  autoSendIntake: integer('auto_send_intake').default(-1),

  // Public customer tracking code (unguessable, e.g. 8 chars A-Z/2-9). Sent on intake as a link.
  trackingCode: text('tracking_code'),
});

export const timelineEvents = sqliteTable('timeline_events', {
  id: text('id').primaryKey(),
  jobId: text('job_id').references(() => jobs.id).notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  eventType: text('event_type').notNull(), // status_change, note, email_sent, part_ordered
  description: text('description').notNull(),
});

export const inventory = sqliteTable('inventory', {
  id: text('id').primaryKey(),
  partNumber: text('part_number'),
  sku: text('sku'),
  productName: text('product_name').notNull(),
  category: text('category'),
  manufacturer: text('manufacturer'),
  model: text('model'),
  description: text('description'),
  quantity: integer('quantity').default(0),
  minimumStockLevel: integer('minimum_stock_level').default(0),
  purchasePrice: real('purchase_price').default(0),
  sellingPrice: real('selling_price').default(0),
  supplier: text('supplier'),
  supplierId: text('supplier_id').references(() => suppliers.id),
  productUrl: text('product_url'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

export const suppliers = sqliteTable('suppliers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  contactPerson: text('contact_person'),
  phone: text('phone'),
  email: text('email'),
  address: text('address'),
  website: text('website'),
  productUrl: text('product_url'),
  paymentTerms: text('payment_terms'),
  vatNumber: text('vat_number'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

export const stockMovements = sqliteTable('stock_movements', {
  id: text('id').primaryKey(),
  inventoryId: text('inventory_id').references(() => inventory.id).notNull(),
  type: text('type').notNull(), // in, out, adjustment, job-used
  quantity: integer('quantity').notNull(), // signed: + for in, - for out
  reason: text('reason'),
  jobId: text('job_id').references(() => jobs.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

export const purchases = sqliteTable('purchases', {
  id: text('id').primaryKey(),
  supplier: text('supplier').notNull(),
  orderNumber: text('order_number'),
  orderDate: integer('order_date', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  expectedDeliveryDate: integer('expected_delivery_date', { mode: 'timestamp' }),
  actualDeliveryDate: integer('actual_delivery_date', { mode: 'timestamp' }),
  deliveryStatus: text('delivery_status').default('Planned'), // Planned, Ordered, Processing, Shipped, Delivered
  trackingNumber: text('tracking_number'),
  trackingUrl: text('tracking_url'),
  supplierId: text('supplier_id').references(() => suppliers.id),
  
  // Specific to a customer/job
  customerId: text('customer_id').references(() => customers.id),
  jobId: text('job_id').references(() => jobs.id),
});

export const purchaseItems = sqliteTable('purchase_items', {
  id: text('id').primaryKey(),
  purchaseId: text('purchase_id').references(() => purchases.id).notNull(),
  inventoryId: text('inventory_id').references(() => inventory.id), // If linked to inventory
  productName: text('product_name').notNull(),
  quantity: integer('quantity').default(1),
  purchasePrice: real('purchase_price').default(0),
});

export const jobParts = sqliteTable('job_parts', {
  id: text('id').primaryKey(),
  jobId: text('job_id').references(() => jobs.id).notNull(),
  inventoryId: text('inventory_id').references(() => inventory.id), // Null if custom part
  name: text('name').notNull(),
  quantity: integer('quantity').default(1),
  costPrice: real('cost_price').default(0),
  sellingPrice: real('selling_price').default(0),
});

export const jobLabour = sqliteTable('job_labour', {
  id: text('id').primaryKey(),
  jobId: text('job_id').references(() => jobs.id).notNull(),
  description: text('description').notNull(),
  hours: real('hours').default(1),
  ratePerHour: real('rate_per_hour').default(0),
  totalCharge: real('total_charge').default(0),
});

export const quotes = sqliteTable('quotes', {
  id: text('id').primaryKey(),
  quoteNumber: text('quote_number').notNull().unique(),
  jobId: text('job_id').references(() => jobs.id),
  customerId: text('customer_id').references(() => customers.id).notNull(),
  status: text('status').default('Draft'), // Draft, Sent, Awaiting Approval, Approved, Declined
  subtotal: real('subtotal').default(0),
  discount: real('discount').default(0),
  tax: real('tax').default(0),
  total: real('total').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  validUntil: integer('valid_until', { mode: 'timestamp' }),
});

export const invoices = sqliteTable('invoices', {
  id: text('id').primaryKey(),
  invoiceNumber: text('invoice_number').notNull().unique(),
  jobId: text('job_id').references(() => jobs.id),
  customerId: text('customer_id').references(() => customers.id).notNull(),
  quoteId: text('quote_id').references(() => quotes.id),
  status: text('status').default('Draft'), // Draft, Sent, Partially Paid, Paid, Overdue, Cancelled
  subtotal: real('subtotal').default(0),
  discount: real('discount').default(0),
  tax: real('tax').default(0),
  total: real('total').default(0),
  amountPaid: real('amount_paid').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  dueDate: integer('due_date', { mode: 'timestamp' }),
});

export const payments = sqliteTable('payments', {
  id: text('id').primaryKey(),
  invoiceId: text('invoice_id').references(() => invoices.id).notNull(),
  customerId: text('customer_id').references(() => customers.id).notNull(),
  amount: real('amount').notNull(),
  paymentMethod: text('payment_method'), // Cash, EFT, Card
  reference: text('reference'),
  date: integer('date', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  notes: text('notes'),
});

export const quoteItems = sqliteTable('quote_items', {
  id: text('id').primaryKey(),
  quoteId: text('quote_id').references(() => quotes.id).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  quantity: integer('quantity').default(1),
  unitPrice: real('unit_price').default(0),
  lineTotal: real('line_total').default(0),
});

export const invoiceItems = sqliteTable('invoice_items', {
  id: text('id').primaryKey(),
  invoiceId: text('invoice_id').references(() => invoices.id).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  quantity: integer('quantity').default(1),
  unitPrice: real('unit_price').default(0),
  lineTotal: real('line_total').default(0),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(), // JSON string for complex settings
});

export const mailMessages = sqliteTable('mail_messages', {
  id: text('id').primaryKey(),
  folder: text('folder').notNull(), // inbox, sent
  uid: integer('uid'), // IMAP UID (used with folder for dedupe)
  messageKey: text('message_key').unique(), // `${folder}:${uid}` or message-id for sent
  messageId: text('message_id'), // RFC Message-ID header
  fromName: text('from_name'),
  fromEmail: text('from_email'),
  toName: text('to_name'),
  toEmail: text('to_email'),
  subject: text('subject'),
  bodyText: text('body_text'),
  bodyHtml: text('body_html'),
  date: integer('date', { mode: 'timestamp' }),
  read: integer('read').default(0),
  category: text('category'), // customer | supplier | null
  categoryId: text('category_id'), // matched customer or supplier id
  categoryLabel: text('category_label'), // display name for smart folder
  imapMirrored: integer('imap_mirrored').default(0), // 1 = copied to IMAP smart folder
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

export const mailFolderState = sqliteTable('mail_folder_state', {
  folder: text('folder').primaryKey(), // inbox, sent
  uidvalidity: text('uidvalidity'),
  lastUid: integer('last_uid').default(0),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

export const whatsappChats = sqliteTable('whatsapp_chats', {
  id: text('id').primaryKey(), // remoteJid, e.g. 27821234567@s.whatsapp.net
  contactName: text('contact_name'),
  contactPhone: text('contact_phone'),
  customerId: text('customer_id').references(() => customers.id),
  category: text('category'), // customer | supplier | null
  categoryId: text('category_id'),
  categoryLabel: text('category_label'),
  unread: integer('unread').default(0),
  lastMessageAt: integer('last_message_at', { mode: 'timestamp' }),
  lastMessagePreview: text('last_message_preview'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

export const whatsappMessages = sqliteTable('whatsapp_messages', {
  id: text('id').primaryKey(),
  chatId: text('chat_id').references(() => whatsappChats.id).notNull(),
  messageKey: text('message_key').unique(), // Baileys message id for dedupe
  fromMe: integer('from_me').default(0),
  messageType: text('message_type').default('text'), // text, image, audio, video, document, location, etc.
  content: text('content'),
  timestamp: integer('timestamp', { mode: 'timestamp' }),
});

// Structured log of WhatsApp bot requests: one row per bot-handled customer
// message. Staff see these in the WebUI instead of the raw command plumbing.
export const customerRequests = sqliteTable('customer_requests', {
  id: text('id').primaryKey(), // ULID
  chatId: text('chat_id').references(() => whatsappChats.id).notNull(),
  senderPhone: text('sender_phone'),
  senderName: text('sender_name'),
  // Intent: menu | status | invoice | quote | keyword:<key> | unknown
  intent: text('intent').notNull(),
  requestText: text('request_text'),
  // Parsed reference, e.g. job number DJ-2026-0001, invoice INV-2026-0001, or tracking code
  reference: text('reference'),
  replyText: text('reply_text'),
  archived: integer('archived').default(0),
  handledAt: integer('handled_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  user: text('user'),
  action: text('action').notNull(), // customer.created, job.status_changed, invoice.created, payment.recorded, etc.
  entityType: text('entity_type').notNull(), // customer, job, quote, invoice, payment, purchase, inventory, settings
  entityId: text('entity_id'),
  description: text('description').notNull(),
});

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(), // ULID
  name: text('name').notNull(), // original filename
  mimeType: text('mime_type').default('application/octet-stream'),
  size: integer('size').default(0), // bytes
  storageKey: text('storage_key').notNull().unique(), // relative path under data/documents
  sendAlong: integer('send_along').default(0), // 1 = attach to outgoing customer sends
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

export const jobAttachments = sqliteTable('job_attachments', {
  id: text('id').primaryKey(), // ULID
  jobId: text('job_id').references(() => jobs.id).notNull(),
  documentId: text('document_id').references(() => documents.id).notNull(),
  // Denormalized snapshots so attachments can be browsed per customer / per device
  // without requiring a join every time (values are copied from the job at upload time).
  customerId: text('customer_id').references(() => customers.id),
  deviceId: text('device_id').references(() => devices.id),
  // Category: intake, before, after, scratch, breakage, repair, document, other
  category: text('category').default('photo'),
  // Phase: before | after | null (not all photos are before/after)
  phase: text('phase'),
  capturedAt: integer('captured_at', { mode: 'timestamp' }),
  note: text('note'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});
