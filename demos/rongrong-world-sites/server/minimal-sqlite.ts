import {minimalRepositoryNamespace} from './minimal-namespace.ts';
import {DatabaseSync} from 'node:sqlite';
import type {MinimalRepository, MinimalRows, MinimalTable, MinimalTransaction, WishingOffer} from '../src/minimal/cloud-contract.ts';

export const MINIMAL_TABLES: Record<MinimalTable, string> = {
  boardings: 'minimal_boardings',
  profiles: 'minimal_profiles',
  farms: 'minimal_farms',
  receipts: 'minimal_receipts',
  imports: 'minimal_imports',
  importSources: 'minimal_import_sources',
  offers: 'minimal_wishing_offers',
  daily: 'minimal_wishing_daily',
  trades: 'minimal_wishing_trades',
};

function tableName(table: MinimalTable): string {
  if (!Object.hasOwn(MINIMAL_TABLES, table)) throw new Error('Unknown minimal authority table');
  return MINIMAL_TABLES[table];
}

/** Local, feature-gated authority storage. This adapter never reads or changes legacy rows.
 *
 * One instance serializes the entire asynchronous callback under BEGIN IMMEDIATE, so
 * its reads, decisions and writes share one atomic snapshot. Do not nest transactions
 * on the same instance, and finish pending work before closing it.
 *
 * Separate connections/processes are protected by SQLite's writer lock. They fail
 * immediately with SQLITE_BUSY rather than synchronously waiting while an async
 * callback on this event loop holds that lock. Callers may retry the whole request
 * after the competing writer finishes; receipts make committed requests idempotent.
 * Use one repository instance per database for queued local service operations.
 */
export class MinimalSqliteRepository implements MinimalRepository {
  private db: DatabaseSync;
  private namespace:ReturnType<typeof minimalRepositoryNamespace>;
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;
  private closed = false;

  constructor(file: string, namespace?:string) {
    this.namespace=minimalRepositoryNamespace(namespace);
    this.db = new DatabaseSync(file);
    try {
      // A synchronous busy timeout would prevent the lock owner from resuming.
      this.db.exec('PRAGMA busy_timeout=0');
      this.db.exec('BEGIN IMMEDIATE');
      for (const table of Object.values(MINIMAL_TABLES)) {
        this.db.exec(`CREATE TABLE IF NOT EXISTS ${table} (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL CHECK (json_valid(value)))`);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK');
      this.db.close();
      throw error;
    }
  }

  transaction<T>(work: (tx: MinimalTransaction) => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Minimal SQLite repository is closed'));
    this.pending++;
    const run = this.queue.then(async () => {
      this.db.exec('BEGIN IMMEDIATE');
      let active = true;
      const checkActive = () => {if (!active) throw new Error('Minimal SQLite transaction is closed');};
      const tx: MinimalTransaction = {
        get: async <K extends MinimalTable>(table: K, key: string): Promise<MinimalRows[K] | null> => {
          checkActive();
          const row = this.db.prepare(`SELECT value FROM ${tableName(table)} WHERE key=?`).get(this.namespace.key(key)) as {value: string} | undefined;
          return row ? JSON.parse(row.value) as MinimalRows[K] : null;
        },
        put: async (table, key, value) => {
          checkActive();
          this.db.prepare(`INSERT INTO ${tableName(table)} (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(this.namespace.key(key), JSON.stringify(value));
        },
        listOpenOffers: async (now, after, limit): Promise<WishingOffer[]> => {
          checkActive();
          const rows = this.db.prepare(`SELECT value FROM minimal_wishing_offers
            WHERE ${this.namespace.offerPredicate} AND json_extract(value,'$.status')='open'
              AND json_extract(value,'$.expiresAt')>?
              AND (? IS NULL OR json_extract(value,'$.offerId')>?)
            ORDER BY json_extract(value,'$.offerId') COLLATE BINARY LIMIT ?`).all(...this.namespace.offerArgs,now, after, after, limit) as {value: string}[];
          return rows.map(row => JSON.parse(row.value) as WishingOffer);
        },
      };
      try {
        const result = await work(tx);
        this.db.exec('COMMIT');
        return result;
      } catch (error) {
        if (this.db.isTransaction) this.db.exec('ROLLBACK');
        throw error;
      } finally {
        active = false;
      }
    }).finally(() => {this.pending--;});
    // A failed callback must not poison subsequent transactions in the queue.
    this.queue = run.then(() => {}, () => {});
    return run;
  }

  close(): void {
    if (this.closed) return;
    if (this.pending) throw new Error('Cannot close minimal SQLite repository with pending transactions');
    this.db.close();
    this.closed = true;
  }
}
