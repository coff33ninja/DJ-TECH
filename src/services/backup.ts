import fs from 'fs/promises';
import path from 'path';
import { client } from '../db/index';
import { ensureSchema } from '../db/init';
import { pendingRestorePath as dataPendingRestorePath } from '../lib/paths';

// Canonical table list. Parents first so a plain (FK-off) restore always has
// referenced rows inserted before their children; used for export, wipe and
// restore. `settings` is special-cased: kept during a data reset, but fully
// exported/restored as part of a backup.
export const BACKUP_TABLES: string[] = [
  'customers',
  'suppliers',
  'devices',
  'inventory',
  'jobs',
  'documents',
  'whatsapp_chats',
  'timeline_events',
  'stock_movements',
  'purchases',
  'purchase_items',
  'job_parts',
  'job_labour',
  'quotes',
  'quote_items',
  'invoices',
  'invoice_items',
  'payments',
  'job_attachments',
  'mail_messages',
  'mail_folder_state',
  'whatsapp_messages',
  'customer_requests',
  'audit_log',
  'settings',
];

export interface BackupData {
  format: 'djtech-backup';
  version: number;
  exportedAt: string;
  tables: Record<string, Array<Record<string, any>>>;
}

const PENDING_FILE = dataPendingRestorePath();

// ------------------------------------------------------------------ Export

export async function exportDatabase(): Promise<BackupData> {
  const tables: Record<string, Array<Record<string, any>>> = {};
  for (const table of BACKUP_TABLES) {
    const rs = await client.execute(`SELECT * FROM "${table}"`);
    const rows = rs.rows.map((row) => {
      const obj: Record<string, any> = {};
      for (let i = 0; i < rs.columns.length; i++) obj[rs.columns[i]] = (row as any)[i];
      return obj;
    });
    tables[table] = rows;
  }
  return {
    format: 'djtech-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    tables,
  };
}

// ------------------------------------------------------------------ Restore

function toSqliteValue(v: any): any {
  if (v === undefined) return null;
  if (v === true) return 1;
  if (v === false) return 0;
  return v;
}

function validateBackup(data: any): asserts data is BackupData {
  if (!data || typeof data !== 'object') throw new Error('Backup is not an object');
  if (data.format !== 'djtech-backup') throw new Error('Not a DJ-TECH backup file');
  if (!data.tables || typeof data.tables !== 'object') throw new Error('Backup has no tables');
}

// Insert every table's rows into the currently-open (fresh/empty) database.
export async function restoreDatabase(data: any): Promise<Record<string, number>> {
  validateBackup(data);
  const counts: Record<string, number> = {};
  await withForeignKeysOff(async () => {
    for (const table of BACKUP_TABLES) {
      const rows = data.tables[table];
      if (!Array.isArray(rows) || rows.length === 0) {
        counts[table] = 0;
        continue;
      }
      const cols = Object.keys(rows[0]);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO "${table}" ("${cols.join('", "')}") VALUES (${placeholders})`;
      const stmts = rows.map((r) => ({
        sql,
        args: cols.map((c) => toSqliteValue(r[c])),
      }));
      await client.batch(stmts);
      counts[table] = rows.length;
    }
  });
  return counts;
}

// Restore an uploaded backup into the currently-running database without
// restarting the server. Drops every table, recreates the schema and seeds it
// from the backup data. Works live because we drop via SQL (no file delete, so
// no Windows file-lock) — staged restores no longer require a restart.
export async function restoreFromBackup(data: any): Promise<Record<string, number>> {
  validateBackup(data);
  await dropAllTables();
  await ensureSchema();
  return restoreDatabase(data);
}

// SQLite only honours `PRAGMA foreign_keys` outside a transaction, and the
// libsql batch() wrapper does NOT disable FK checks (only migrate() does).
// Wrap multi-statement operations in this so child tables can be dropped or
// cleared regardless of reference order.
async function withForeignKeysOff<T>(fn: () => Promise<T>): Promise<T> {
  await client.execute('PRAGMA foreign_keys=off');
  try {
    return await fn();
  } finally {
    await client.execute('PRAGMA foreign_keys=on');
  }
}

// Delete all rows from every table except `settings` (business config, mail
// credentials, WhatsApp session). Keeps the app configured while clearing data.
export async function resetDatabaseData(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const stmts: Array<{ sql: string }> = [];
  for (const table of BACKUP_TABLES) {
    if (table === 'settings') continue;
    stmts.push({ sql: `DELETE FROM "${table}"` });
  }
  const results = await withForeignKeysOff(() => client.batch(stmts));
  let i = 0;
  for (const table of BACKUP_TABLES) {
    if (table === 'settings') continue;
    counts[table] = results[i]?.rowsAffected || 0;
    i++;
  }
  return counts;
}

// ------------------------------------------------------------ Pending restore

// Staged-restore flow: imports restore in place via restoreFromBackup(), while
// this path handles a pending-restore.json that may be present at boot.
export function pendingRestorePath(): string {
  return PENDING_FILE;
}

export async function stagePendingRestore(data: any): Promise<void> {
  validateBackup(data);
  await fs.mkdir(path.dirname(PENDING_FILE), { recursive: true });
  await fs.writeFile(PENDING_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Drop every table in the database (including any not in BACKUP_TABLES).
async function dropAllTables(): Promise<void> {
  const rs = await client.execute(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
  );
  const tables = rs.rows.map((row) => String((row as any)[0]));
  if (tables.length === 0) return;
  const stmts = tables.map((t) => ({ sql: `DROP TABLE IF EXISTS "${t}"` }));
  await withForeignKeysOff(() => client.batch(stmts));
}

export async function applyPendingRestore(): Promise<{ restored: boolean; counts: Record<string, number> }> {
  let raw: string;
  try {
    raw = await fs.readFile(PENDING_FILE, 'utf8');
  } catch (err: any) {
    if (err?.code === 'ENOENT') return { restored: false, counts: {} };
    throw err;
  }
  const data = JSON.parse(raw);
  const counts = await restoreFromBackup(data);
  await fs.rm(PENDING_FILE, { force: true });
  return { restored: true, counts };
}

// Used by tests/scripts to verify the staged file before a real restore.
export function readStagedBackup(): Promise<BackupData | null> {
  return fs.readFile(PENDING_FILE, 'utf8')
    .then((raw) => JSON.parse(raw) as BackupData)
    .catch((err: any) => (err?.code === 'ENOENT' ? null : Promise.reject(err)));
}
