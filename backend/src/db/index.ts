import Database from 'better-sqlite3';
import { config } from '../config.js';
import { SCHEMA_SQL } from './schema.js';

let _db: Database.Database | null = null;

/** Singleton app.db handle (WAL, foreign keys on, schema applied). */
export function db(): Database.Database {
  if (_db) return _db;
  const d = new Database(config.appDbPath);
  d.pragma('journal_mode = WAL');
  d.pragma('foreign_keys = ON');
  d.exec(SCHEMA_SQL);
  _db = d;
  return d;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
