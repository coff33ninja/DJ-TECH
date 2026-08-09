import { client } from './index';

// Explicit CREATE TABLE IF NOT EXISTS statements mirroring src/db/schema.ts.
// Runs at server startup so a fresh or imported DB gets the full schema
// without requiring a dev-time `drizzle-kit push`.
const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "customers" (
    "id" text PRIMARY KEY NOT NULL,
    "full_name" text NOT NULL,
    "company_name" text,
    "customer_type" text DEFAULT 'individual',
    "phone" text,
    "email" text,
    "address" text,
    "notes" text,
    "status" text DEFAULT 'active',
    "created_at" integer DEFAULT (strftime('%s','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS "devices" (
    "id" text PRIMARY KEY NOT NULL,
    "customer_id" text NOT NULL REFERENCES "customers"("id"),
    "device_type" text,
    "manufacturer" text,
    "model" text,
    "serial_number" text,
    "asset_tag" text,
    "has_cpu" integer DEFAULT 0, "has_ram" integer DEFAULT 0, "has_motherboard" integer DEFAULT 0,
    "has_box" integer DEFAULT 0, "has_powersupply" integer DEFAULT 0, "has_hdd" integer DEFAULT 0,
    "has_ssd" integer DEFAULT 0, "has_gpu" integer DEFAULT 0, "has_battery" integer DEFAULT 0,
    "has_charger" integer DEFAULT 0, "has_box_type" integer DEFAULT 0,
    "cpu" text, "ram" text, "motherboard" text, "box" text, "powersupply" text,
    "hdd" text, "ssd" text, "gpu" text, "battery" text, "charger" text, "box_type" text,
    "storage" text, "operating_system" text,
    "created_at" integer DEFAULT (strftime('%s','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS "jobs" (
    "id" text PRIMARY KEY NOT NULL,
    "job_number" text NOT NULL UNIQUE,
    "customer_id" text NOT NULL REFERENCES "customers"("id"),
    "device_id" text NOT NULL REFERENCES "devices"("id"),
    "date_received" integer DEFAULT (strftime('%s','now')),
    "expected_completion_date" integer,
    "technician" text,
    "priority" text DEFAULT 'normal',
    "status" text DEFAULT 'Received',
    "accessories_received" text, "physical_condition" text, "existing_damage" text, "device_password" text,
    "reported_problem" text, "initial_diagnosis" text, "technician_notes" text,
    "customer_visible_notes" text, "work_performed" text,
    "warranty_period_days" integer DEFAULT 0,
    "completion_date" integer, "collection_date" integer,
    "auto_send_intake" integer DEFAULT -1,
    "tracking_code" text
  )`,
  `CREATE TABLE IF NOT EXISTS "timeline_events" (
    "id" text PRIMARY KEY NOT NULL,
    "job_id" text NOT NULL REFERENCES "jobs"("id"),
    "timestamp" integer DEFAULT (strftime('%s','now')),
    "event_type" text NOT NULL,
    "description" text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "suppliers" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "contact_person" text, "phone" text, "email" text, "address" text, "website" text,
    "product_url" text, "payment_terms" text, "vat_number" text, "notes" text,
    "created_at" integer DEFAULT (strftime('%s','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS "inventory" (
    "id" text PRIMARY KEY NOT NULL,
    "part_number" text, "sku" text, "product_name" text NOT NULL, "category" text,
    "manufacturer" text, "model" text, "description" text,
    "quantity" integer DEFAULT 0, "minimum_stock_level" integer DEFAULT 0,
    "purchase_price" real DEFAULT 0, "selling_price" real DEFAULT 0,
    "supplier" text, "supplier_id" text REFERENCES "suppliers"("id"), "product_url" text,
    "created_at" integer DEFAULT (strftime('%s','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS "stock_movements" (
    "id" text PRIMARY KEY NOT NULL,
    "inventory_id" text NOT NULL REFERENCES "inventory"("id"),
    "type" text NOT NULL, "quantity" integer NOT NULL, "reason" text,
    "job_id" text REFERENCES "jobs"("id"),
    "created_at" integer DEFAULT (strftime('%s','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS "purchases" (
    "id" text PRIMARY KEY NOT NULL,
    "supplier" text NOT NULL, "order_number" text,
    "order_date" integer DEFAULT (strftime('%s','now')),
    "expected_delivery_date" integer, "actual_delivery_date" integer,
    "delivery_status" text DEFAULT 'Planned', "tracking_number" text, "tracking_url" text,
    "supplier_id" text REFERENCES "suppliers"("id"),
    "customer_id" text REFERENCES "customers"("id"),
    "job_id" text REFERENCES "jobs"("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "purchase_items" (
    "id" text PRIMARY KEY NOT NULL,
    "purchase_id" text NOT NULL REFERENCES "purchases"("id"),
    "inventory_id" text REFERENCES "inventory"("id"),
    "product_name" text NOT NULL, "quantity" integer DEFAULT 1, "purchase_price" real DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS "job_parts" (
    "id" text PRIMARY KEY NOT NULL,
    "job_id" text NOT NULL REFERENCES "jobs"("id"),
    "inventory_id" text REFERENCES "inventory"("id"),
    "name" text NOT NULL, "quantity" integer DEFAULT 1,
    "cost_price" real DEFAULT 0, "selling_price" real DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS "job_labour" (
    "id" text PRIMARY KEY NOT NULL,
    "job_id" text NOT NULL REFERENCES "jobs"("id"),
    "description" text NOT NULL, "hours" real DEFAULT 1,
    "rate_per_hour" real DEFAULT 0, "total_charge" real DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS "quotes" (
    "id" text PRIMARY KEY NOT NULL,
    "quote_number" text NOT NULL UNIQUE,
    "job_id" text REFERENCES "jobs"("id"),
    "customer_id" text NOT NULL REFERENCES "customers"("id"),
    "status" text DEFAULT 'Draft',
    "subtotal" real DEFAULT 0, "discount" real DEFAULT 0, "tax" real DEFAULT 0, "total" real DEFAULT 0,
    "created_at" integer DEFAULT (strftime('%s','now')),
    "valid_until" integer
  )`,
  `CREATE TABLE IF NOT EXISTS "invoices" (
    "id" text PRIMARY KEY NOT NULL,
    "invoice_number" text NOT NULL UNIQUE,
    "job_id" text REFERENCES "jobs"("id"),
    "customer_id" text NOT NULL REFERENCES "customers"("id"),
    "quote_id" text REFERENCES "quotes"("id"),
    "status" text DEFAULT 'Draft',
    "subtotal" real DEFAULT 0, "discount" real DEFAULT 0, "tax" real DEFAULT 0,
    "total" real DEFAULT 0, "amount_paid" real DEFAULT 0,
    "created_at" integer DEFAULT (strftime('%s','now')),
    "due_date" integer
  )`,
  `CREATE TABLE IF NOT EXISTS "payments" (
    "id" text PRIMARY KEY NOT NULL,
    "invoice_id" text NOT NULL REFERENCES "invoices"("id"),
    "customer_id" text NOT NULL REFERENCES "customers"("id"),
    "amount" real NOT NULL, "payment_method" text, "reference" text,
    "date" integer DEFAULT (strftime('%s','now')), "notes" text
  )`,
  `CREATE TABLE IF NOT EXISTS "quote_items" (
    "id" text PRIMARY KEY NOT NULL,
    "quote_id" text NOT NULL REFERENCES "quotes"("id"),
    "name" text NOT NULL, "description" text, "quantity" integer DEFAULT 1,
    "unit_price" real DEFAULT 0, "line_total" real DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS "invoice_items" (
    "id" text PRIMARY KEY NOT NULL,
    "invoice_id" text NOT NULL REFERENCES "invoices"("id"),
    "name" text NOT NULL, "description" text, "quantity" integer DEFAULT 1,
    "unit_price" real DEFAULT 0, "line_total" real DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS "settings" (
    "key" text PRIMARY KEY NOT NULL,
    "value" text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "mail_messages" (
    "id" text PRIMARY KEY NOT NULL,
    "folder" text NOT NULL, "uid" integer, "message_key" text UNIQUE, "message_id" text,
    "from_name" text, "from_email" text, "to_name" text, "to_email" text,
    "subject" text, "body_text" text, "body_html" text, "date" integer, "read" integer DEFAULT 0,
    "category" text, "category_id" text, "category_label" text, "imap_mirrored" integer DEFAULT 0,
    "created_at" integer DEFAULT (strftime('%s','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS "mail_folder_state" (
    "folder" text PRIMARY KEY NOT NULL,
    "uidvalidity" text, "last_uid" integer DEFAULT 0,
    "updated_at" integer DEFAULT (strftime('%s','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS "whatsapp_chats" (
    "id" text PRIMARY KEY NOT NULL,
    "contact_name" text, "contact_phone" text, "customer_id" text REFERENCES "customers"("id"),
    "category" text, "category_id" text, "category_label" text, "unread" integer DEFAULT 0,
    "last_message_at" integer, "last_message_preview" text,
    "created_at" integer DEFAULT (strftime('%s','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS "whatsapp_messages" (
    "id" text PRIMARY KEY NOT NULL,
    "chat_id" text NOT NULL REFERENCES "whatsapp_chats"("id"),
    "message_key" text UNIQUE, "from_me" integer DEFAULT 0,
    "message_type" text DEFAULT 'text', "content" text, "timestamp" integer
  )`,
  `CREATE TABLE IF NOT EXISTS "customer_requests" (
    "id" text PRIMARY KEY NOT NULL,
    "chat_id" text NOT NULL REFERENCES "whatsapp_chats"("id"),
    "sender_phone" text, "sender_name" text, "intent" text NOT NULL,
    "request_text" text, "reference" text, "reply_text" text, "archived" integer DEFAULT 0,
    "handled_at" integer DEFAULT (strftime('%s','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS "audit_log" (
    "id" text PRIMARY KEY NOT NULL,
    "timestamp" integer DEFAULT (strftime('%s','now')),
    "user" text, "action" text NOT NULL, "entity_type" text NOT NULL,
    "entity_id" text, "description" text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "documents" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text NOT NULL, "mime_type" text DEFAULT 'application/octet-stream',
    "size" integer DEFAULT 0, "storage_key" text NOT NULL UNIQUE, "send_along" integer DEFAULT 0,
    "created_at" integer DEFAULT (strftime('%s','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS "job_attachments" (
    "id" text PRIMARY KEY NOT NULL,
    "job_id" text NOT NULL REFERENCES "jobs"("id"),
    "document_id" text NOT NULL REFERENCES "documents"("id"),
    "customer_id" text REFERENCES "customers"("id"),
    "device_id" text REFERENCES "devices"("id"),
    "category" text DEFAULT 'photo', "phase" text, "captured_at" integer, "note" text,
    "created_at" integer DEFAULT (strftime('%s','now'))
  )`,
];

export async function ensureSchema(): Promise<void> {
  for (const ddl of DDL) {
    await client.execute(ddl);
  }
}
