import { DatabaseSync } from 'node:sqlite';
import { applyCommand, createFarm, upgradeFarm, snapshot, type Farm, type Command, type Snapshot, type FarmEvent } from '../src/model.ts';
export type Reply = { accepted: boolean; message: string; event?: FarmEvent; duplicate: boolean; snapshot: Snapshot };
type Receipt = Omit<Reply, 'snapshot' | 'duplicate'>;
/** Local-only adapter. A SQLite transaction owns state and the command receipt together. */
export class FarmStore {
  private db: DatabaseSync;
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS farms (device TEXT PRIMARY KEY, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS commands (device TEXT NOT NULL, id TEXT NOT NULL, receipt TEXT NOT NULL, PRIMARY KEY(device,id));`);
  }
  private load(device: string, now: number): Farm {
    const row = this.db.prepare('SELECT state FROM farms WHERE device=?').get(device) as {state: string} | undefined;
    if (row) {const s=upgradeFarm(JSON.parse(row.state));if(JSON.stringify(s)!==row.state)this.save(s);return s;}
    const s = createFarm(device, now);
    this.save(s); return s;
  }
  private save(s: Farm) { this.db.prepare('INSERT INTO farms(device,state) VALUES(?,?) ON CONFLICT(device) DO UPDATE SET state=excluded.state').run(s.playerId, JSON.stringify(s)); }
  get(device: string, now: number): Snapshot { return snapshot(this.load(device, now), now); }
  command(device: string, command: Command, now: number): Reply {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const s = this.load(device, now);
      const row = this.db.prepare('SELECT receipt FROM commands WHERE device=? AND id=?').get(device, command.id) as {receipt: string} | undefined;
      if (row) {
        this.db.exec('COMMIT');
        return { ...JSON.parse(row.receipt) as Receipt, duplicate: true, snapshot: snapshot(s, now) };
      }
      const result = applyCommand(s, command, now);
      const receipt: Receipt = { accepted: result.accepted, message: result.message, ...(result.event ? {event: result.event} : {}) };
      this.save(result.state);
      this.db.prepare('INSERT INTO commands(device,id,receipt) VALUES(?,?,?)').run(device, command.id, JSON.stringify(receipt));
      this.db.exec('COMMIT');
      return { ...receipt, duplicate: false, snapshot: snapshot(result.state, now) };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}
