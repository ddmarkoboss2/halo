import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

export const db = new DatabaseSync(config.dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    username      TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    bio           TEXT NOT NULL DEFAULT '',
    custom_status TEXT NOT NULL DEFAULT '',
    accent        TEXT NOT NULL DEFAULT '#7c5cff',
    avatar_url    TEXT,
    presence      TEXT NOT NULL DEFAULT 'offline',
    last_seen     INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS servers (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    accent      TEXT NOT NULL DEFAULT '#7c5cff',
    icon_url    TEXT,
    invite_code TEXT NOT NULL UNIQUE,
    is_public   INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS server_members (
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nickname  TEXT,
    role      TEXT NOT NULL DEFAULT 'member',
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (server_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_members_user ON server_members(user_id);

  CREATE TABLE IF NOT EXISTS channels (
    id         TEXT PRIMARY KEY,
    server_id  TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    topic      TEXT NOT NULL DEFAULT '',
    type       TEXT NOT NULL DEFAULT 'text',
    position   INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_channels_server ON channels(server_id, position);

  CREATE TABLE IF NOT EXISTS dms (
    id              TEXT PRIMARY KEY,
    user_a          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      INTEGER NOT NULL,
    last_message_at INTEGER NOT NULL DEFAULT 0,
    UNIQUE (user_a, user_b)
  );
  CREATE INDEX IF NOT EXISTS idx_dms_a ON dms(user_a);
  CREATE INDEX IF NOT EXISTS idx_dms_b ON dms(user_b);

  CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    scope       TEXT NOT NULL,
    scope_id    TEXT NOT NULL,
    author_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content     TEXT NOT NULL DEFAULT '',
    reply_to_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
    created_at  INTEGER NOT NULL,
    edited_at   INTEGER,
    deleted_at  INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_messages_scope ON messages(scope, scope_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS attachments (
    id         TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    url        TEXT NOT NULL,
    filename   TEXT NOT NULL,
    mime       TEXT NOT NULL,
    size       INTEGER NOT NULL DEFAULT 0,
    width      INTEGER,
    height     INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);

  CREATE TABLE IF NOT EXISTS reactions (
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji      TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (message_id, user_id, emoji)
  );

  CREATE TABLE IF NOT EXISTS friendships (
    id           TEXT PRIMARY KEY,
    requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'pending',
    created_at   INTEGER NOT NULL,
    responded_at INTEGER,
    UNIQUE (requester_id, addressee_id)
  );
  CREATE INDEX IF NOT EXISTS idx_friendships_req ON friendships(requester_id);
  CREATE INDEX IF NOT EXISTS idx_friendships_add ON friendships(addressee_id);

  CREATE TABLE IF NOT EXISTS reads (
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope        TEXT NOT NULL,
    scope_id     TEXT NOT NULL,
    last_read_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, scope, scope_id)
  );
`);

/** Add a column to an existing table when an older database is opened. */
function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('servers', 'is_public', 'INTEGER NOT NULL DEFAULT 0');

/** Run a write statement. */
export function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}

/** Fetch one row (plain object) or undefined. */
export function get(sql, ...params) {
  const row = db.prepare(sql).get(...params);
  return row ? { ...row } : undefined;
}

/** Fetch many rows as plain objects. */
export function all(sql, ...params) {
  return db.prepare(sql).all(...params).map((row) => ({ ...row }));
}

/** Wrap a function in a transaction. */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** Delete expired sessions; called at boot. */
export function pruneSessions() {
  run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
}
