import path from 'path';
import fs from 'fs';

// Root for all persistent app data (sqlite.db, data/, wa_session/).
// Defaults to the working directory so local dev behaviour is unchanged.
// Set DATA_DIR to relocate everything, e.g. to a mounted Docker volume.
const DATA_ROOT = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : process.cwd();

// The libsql client opens sqlite.db at module load, so the parent directory
// must exist before anything else touches it. mkdirSync here (evaluated before
// db/index.ts's createClient call, thanks to hoisted imports) guarantees that.
fs.mkdirSync(DATA_ROOT, { recursive: true });

export function dataRoot(): string {
  return DATA_ROOT;
}

export function sqlitePath(): string {
  return path.join(DATA_ROOT, 'sqlite.db');
}

export function documentsDir(): string {
  return path.join(DATA_ROOT, 'data', 'documents');
}

export function pendingRestorePath(): string {
  return path.join(DATA_ROOT, 'data', 'pending-restore.json');
}

export function waSessionDir(): string {
  return path.join(DATA_ROOT, 'wa_session');
}
