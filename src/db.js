/**
 * aimemory - 存储层
 * SQLite数据库，支持全文搜索
 */
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const DEFAULT_DB_PATH = resolve(process.env.AIMEM_DB || '~/.aimemory/memories.db'.replace('~', process.env.HOME));

export function openDB(dbPath = DEFAULT_DB_PATH) {
  mkdirSync(resolve(dbPath, '..'), { recursive: true });
  const db = new DatabaseSync(dbPath);
  
  // 初始化表
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      importance REAL DEFAULT 0.5,
      source TEXT,
      tags TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      last_accessed TEXT DEFAULT (datetime('now')),
      access_count INTEGER DEFAULT 0,
      decay_score REAL DEFAULT 1.0
    );

    CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      type TEXT DEFAULT 'unknown',
      attributes TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memory_entities (
      memory_id INTEGER REFERENCES memories(id),
      entity_id INTEGER REFERENCES entities(id),
      PRIMARY KEY (memory_id, entity_id)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content, category, tags,
      content='memories',
      content_rowid='id'
    );

    -- 触发器保持FTS同步
    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, content, category, tags)
      VALUES (new.id, new.content, new.category, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, category, tags)
      VALUES ('delete', old.id, old.content, old.category, old.tags);
    END;

    CREATE TABLE IF NOT EXISTS memory_dense_vectors (
      memory_id INTEGER PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
      vector TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_vectors (
      memory_id INTEGER PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
      vector TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tfidf_index (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL
    );

    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, category, tags)
      VALUES ('delete', old.id, old.content, old.category, old.tags);
      INSERT INTO memories_fts(rowid, content, category, tags)
      VALUES (new.id, new.content, new.category, new.tags);
    END;

    -- TF-IDF引擎状态持久化
    CREATE TABLE IF NOT EXISTS tfidf_state (
      key TEXT PRIMARY KEY DEFAULT 'main',
      data TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  return db;
}
