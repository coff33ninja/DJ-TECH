import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';
import fs from 'fs/promises';
import { sqlitePath } from '../lib/paths';

export function getSqlitePath(): string {
  return sqlitePath();
}

export let client = createClient({
  url: `file:${sqlitePath()}`,
});

export let db = drizzle(client, { schema });

// Close the current connection, delete the DB file and reopen a fresh, empty
// database. Used by the "restore from backup on next boot" flow, which must
// delete sqlite.db while nothing has it open (Windows locks open files).
export async function reopenDatabase(): Promise<void> {
  try {
    client.close();
  } catch { /* already closed */ }

  // The underlying handle may take a moment to release on Windows.
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const dbPath = sqlitePath();
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      await fs.rm(dbPath, { force: true });
      await fs.rm(`${dbPath}-wal`, { force: true }).catch(() => {});
      await fs.rm(`${dbPath}-shm`, { force: true }).catch(() => {});
      break;
    } catch {
      if (attempt === 20) throw new Error('Could not remove sqlite.db (file still locked)');
      await wait(200);
    }
  }

  client = createClient({ url: `file:${dbPath}` });
  db = drizzle(client, { schema });
}
