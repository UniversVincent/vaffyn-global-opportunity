import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';

const accountRow = z.object({
  username: z.string(),
  salt: z.string(),
  hash: z.string(),
  data: z.string(),
});
export type PreviewAccount = z.infer<typeof accountRow>;

/** Isolated, loopback-only development accounts. Never reads or migrates LibreChat users. */
export class PreviewStore {
  private readonly db: DatabaseSync;

  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS preview_accounts (
        username TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL, data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS preview_sessions (
        hash TEXT PRIMARY KEY, username TEXT NOT NULL REFERENCES preview_accounts(username), expires INTEGER NOT NULL
      );
    `);
  }

  account(username: string): PreviewAccount | undefined {
    const row = this.db
      .prepare('SELECT username, salt, hash, data FROM preview_accounts WHERE username = ?')
      .get(username);
    return row ? accountRow.parse(row) : undefined;
  }

  create(account: PreviewAccount): void {
    this.db
      .prepare('INSERT INTO preview_accounts (username,salt,hash,data) VALUES (?,?,?,?)')
      .run(account.username, account.salt, account.hash, account.data);
  }

  save(username: string, data: string): void {
    this.db.prepare('UPDATE preview_accounts SET data = ? WHERE username = ?').run(data, username);
  }

  session(hash: string, now: number): string | undefined {
    this.db.prepare('DELETE FROM preview_sessions WHERE expires <= ?').run(now);
    const row = this.db.prepare('SELECT username FROM preview_sessions WHERE hash = ?').get(hash);
    return row ? z.object({ username: z.string() }).parse(row).username : undefined;
  }

  issue(hash: string, username: string, expires: number): void {
    this.db.prepare('DELETE FROM preview_sessions WHERE username = ?').run(username);
    this.db
      .prepare('INSERT INTO preview_sessions (hash,username,expires) VALUES (?,?,?)')
      .run(hash, username, expires);
  }

  revoke(hash: string): void {
    this.db.prepare('DELETE FROM preview_sessions WHERE hash = ?').run(hash);
  }

  close(): void {
    this.db.close();
  }
}
