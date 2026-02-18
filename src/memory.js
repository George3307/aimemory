/**
 * aimemory - 核心记忆引擎
 * 增删改查 + 搜索 + 衰减
 */
import { openDB } from './db.js';
import { TfIdfEngine, cosineSimilarity, serializeVector, deserializeVector } from './embedding.js';
import { GeminiEmbedding, cosineSimilarityDense, serializeDenseVector, deserializeDenseVector } from './gemini-embedding.js';

export class MemoryEngine {
  constructor(dbPath, { geminiApiKey = null } = {}) {
    this.db = openDB(dbPath);
    this._tfidf = null; // lazy load
    this._gemini = null;
    if (geminiApiKey) {
      this._gemini = new GeminiEmbedding(geminiApiKey);
    }
  }

  /**
   * 获取/初始化TF-IDF引擎
   */
  _getTfIdf() {
    if (this._tfidf) return this._tfidf;
    
    // 尝试从数据库加载已有索引
    const row = this.db.prepare('SELECT data FROM tfidf_index WHERE id = 1').get();
    if (row) {
      this._tfidf = TfIdfEngine.fromJSON(JSON.parse(row.data));
    } else {
      this._tfidf = new TfIdfEngine();
    }
    return this._tfidf;
  }

  /**
   * 保存TF-IDF索引到数据库
   */
  _saveTfIdf() {
    if (!this._tfidf) return;
    this.db.prepare(`
      INSERT INTO tfidf_index (id, data) VALUES (1, ?)
      ON CONFLICT(id) DO UPDATE SET data = excluded.data
    `).run(JSON.stringify(this._tfidf.toJSON()));
  }

  /**
   * 对文本分词（中英文混合），返回词集合
   */
  _tokenize(text) {
    const lower = text.toLowerCase();
    // 提取中文字符（按2-gram切分）和英文单词
    const zhChars = lower.match(/[\u4e00-\u9fa5]{2,}/g) || [];
    const zhBigrams = [];
    for (const seg of zhChars) {
      for (let i = 0; i < seg.length - 1; i++) {
        zhBigrams.push(seg.slice(i, i + 2));
      }
    }
    const enWords = lower.match(/[a-z0-9]+/g) || [];
    return new Set([...zhBigrams, ...enWords]);
  }

  /**
   * 计算 Jaccard 相似度
   */
  _jaccardSimilarity(setA, setB) {
    if (setA.size === 0 && setB.size === 0) return 1;
    let intersection = 0;
    for (const item of setA) {
      if (setB.has(item)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * 检查是否已存在高度相似的记忆
   * @returns {object|null} 已有的相似记忆，或null
   */
  _findDuplicate(content, category = null, threshold = 0.7) {
    const contentTokens = this._tokenize(content);
    if (contentTokens.size === 0) return null;

    // 从内容中提取关键词用于LIKE搜索缩小范围
    const sampleTokens = [...contentTokens].slice(0, 5);
    let candidates = [];
    for (const token of sampleTokens) {
      const rows = this.db.prepare(
        `SELECT id, content, category, importance FROM memories WHERE content LIKE ? LIMIT 50`
      ).all(`%${token}%`);
      candidates.push(...rows);
    }

    // 去重候选
    const seen = new Set();
    candidates = candidates.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    // 计算相似度
    for (const candidate of candidates) {
      const candidateTokens = this._tokenize(candidate.content);
      const similarity = this._jaccardSimilarity(contentTokens, candidateTokens);
      if (similarity >= threshold) {
        return { ...candidate, similarity: Math.round(similarity * 1000) / 1000 };
      }
    }

    return null;
  }

  /**
   * 添加一条记忆（自动去重）
   */
  add(content, { category = 'general', importance = 0.5, source = null, tags = [] } = {}) {
    // 去重检查：如果已有高度相似的记忆，跳过添加
    const existing = this._findDuplicate(content, category);
    if (existing) {
      // 如果新的importance更高，更新已有记忆的importance
      if (importance > existing.importance) {
        this.setImportance(existing.id, importance);
        existing.importance = importance;
      }
      return { id: existing.id, content: existing.content, category: existing.category, importance: existing.importance, duplicate: true };
    }

    const stmt = this.db.prepare(`
      INSERT INTO memories (content, category, importance, source, tags)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(content, category, importance, source, JSON.stringify(tags));
    const id = Number(result.lastInsertRowid);
    
    // 自动向量化
    const tfidf = this._getTfIdf();
    tfidf.addDoc(content);
    const vec = tfidf.vectorize(content);
    this.db.prepare('INSERT OR REPLACE INTO memory_vectors (memory_id, vector) VALUES (?, ?)')
      .run(id, serializeVector(vec));
    this._saveTfIdf();
    
    return { id, content, category, importance };
  }

  /**
   * 异步添加记忆（支持Gemini embedding）
   */
  async addAsync(content, opts = {}) {
    const mem = this.add(content, opts);
    
    // 如果是重复记忆，直接返回
    if (mem.duplicate) return mem;
    
    // 如果有Gemini，生成dense embedding
    if (this._gemini) {
      try {
        const vec = await this._gemini.embed(content);
        this.db.prepare('INSERT OR REPLACE INTO memory_dense_vectors (memory_id, vector) VALUES (?, ?)')
          .run(mem.id, serializeDenseVector(vec));
      } catch(e) {
        // Gemini失败不影响，TF-IDF兜底
        process.stderr.write(`Gemini embedding failed for #${mem.id}: ${e.message}\n`);
      }
    }
    
    return mem;
  }

  /**
   * 全文搜索记忆
   */
  search(query, { limit = 10, category = null, minImportance = 0 } = {}) {
    let sql, params;
    
    if (query) {
      // 先试FTS，失败就用LIKE（中文兼容）
      try {
        sql = `
          SELECT m.*, rank
          FROM memories_fts fts
          JOIN memories m ON m.id = fts.rowid
          WHERE memories_fts MATCH (? || '*')
          ${category ? 'AND m.category = ?' : ''}
          AND m.importance >= ?
          ORDER BY (rank * -1) * m.importance * m.decay_score DESC
          LIMIT ?
        `;
        params = category 
          ? [query, category, minImportance, limit]
          : [query, minImportance, limit];
        const ftsRows = this.db.prepare(sql).all(...params);
        if (ftsRows.length > 0) {
          const updateStmt = this.db.prepare(`UPDATE memories SET last_accessed = datetime('now'), access_count = access_count + 1 WHERE id = ?`);
          for (const row of ftsRows) updateStmt.run(row.id);
          return ftsRows.map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') }));
        }
      } catch(e) { /* FTS failed, fall through to LIKE */ }
      
      // LIKE fallback（中文友好）
      sql = `
        SELECT m.*, 0 as rank
        FROM memories m
        WHERE m.content LIKE ?
        ${category ? 'AND m.category = ?' : ''}
        AND m.importance >= ?
        ORDER BY m.importance * m.decay_score DESC
        LIMIT ?
      `;
      params = category 
        ? [`%${query}%`, category, minImportance, limit]
        : [`%${query}%`, minImportance, limit];
    } else {
      // 无查询，按重要性+衰减排序
      sql = `
        SELECT m.*
        FROM memories m
        ${category ? 'WHERE m.category = ? AND' : 'WHERE'} m.importance >= ?
        ORDER BY m.importance * m.decay_score DESC
        LIMIT ?
      `;
      params = category 
        ? [category, minImportance, limit]
        : [minImportance, limit];
    }

    const rows = this.db.prepare(sql).all(...params);
    
    // 更新访问记录
    const updateStmt = this.db.prepare(`
      UPDATE memories SET last_accessed = datetime('now'), access_count = access_count + 1
      WHERE id = ?
    `);
    for (const row of rows) {
      updateStmt.run(row.id);
    }

    return rows.map(r => ({
      ...r,
      tags: JSON.parse(r.tags || '[]')
    }));
  }

  /**
   * 语义搜索 — 基于TF-IDF余弦相似度
   * 能找到意思相近但用词不同的记忆
   */
  semanticSearch(query, { limit = 10, category = null, minImportance = 0, minScore = 0.05 } = {}) {
    const tfidf = this._getTfIdf();
    const queryVec = tfidf.vectorize(query, { expandSynonyms: true });
    
    if (queryVec.size === 0) return [];
    
    // 获取所有向量
    let sql = `
      SELECT mv.memory_id, mv.vector, m.*
      FROM memory_vectors mv
      JOIN memories m ON m.id = mv.memory_id
      WHERE m.importance >= ?
      ${category ? 'AND m.category = ?' : ''}
    `;
    const params = category ? [minImportance, category] : [minImportance];
    const rows = this.db.prepare(sql).all(...params);
    
    // 计算相似度
    const scored = rows.map(row => {
      const memVec = deserializeVector(row.vector);
      const similarity = cosineSimilarity(queryVec, memVec);
      // 综合分数 = 相似度 × 重要性权重 × 衰减
      const score = similarity * (0.5 + 0.5 * row.importance) * row.decay_score;
      return { ...row, similarity, score };
    });
    
    // 排序+过滤
    const results = scored
      .filter(r => r.similarity >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    
    // 更新访问记录
    const updateStmt = this.db.prepare(
      'UPDATE memories SET last_accessed = datetime(\'now\'), access_count = access_count + 1 WHERE id = ?'
    );
    for (const r of results) updateStmt.run(r.memory_id);
    
    return results.map(r => ({
      id: r.memory_id,
      content: r.content,
      category: r.category,
      importance: r.importance,
      similarity: Math.round(r.similarity * 1000) / 1000,
      score: Math.round(r.score * 1000) / 1000,
      tags: JSON.parse(r.tags || '[]'),
      created_at: r.created_at
    }));
  }

  /**
   * 异步语义搜索 — Gemini优先，TF-IDF兜底
   */
  async semanticSearchAsync(query, { limit = 10, category = null, minImportance = 0, minScore = 0.05 } = {}) {
    // 如果有Gemini且有dense向量，用Gemini
    if (this._gemini) {
      try {
        const denseCount = this.db.prepare('SELECT COUNT(*) as c FROM memory_dense_vectors').get().c;
        if (denseCount > 0) {
          const queryVec = await this._gemini.embed(query);
          
          let sql = `
            SELECT dv.memory_id, dv.vector, m.*
            FROM memory_dense_vectors dv
            JOIN memories m ON m.id = dv.memory_id
            WHERE m.importance >= ?
            ${category ? 'AND m.category = ?' : ''}
          `;
          const params = category ? [minImportance, category] : [minImportance];
          const rows = this.db.prepare(sql).all(...params);
          
          const scored = rows.map(row => {
            const memVec = deserializeDenseVector(row.vector);
            const similarity = cosineSimilarityDense(queryVec, memVec);
            const score = similarity * (0.5 + 0.5 * row.importance) * row.decay_score;
            return { ...row, similarity, score };
          });
          
          const results = scored
            .filter(r => r.similarity >= minScore)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
          
          const updateStmt = this.db.prepare(
            "UPDATE memories SET last_accessed = datetime('now'), access_count = access_count + 1 WHERE id = ?"
          );
          for (const r of results) updateStmt.run(r.memory_id);
          
          return results.map(r => ({
            id: r.memory_id,
            content: r.content,
            category: r.category,
            importance: r.importance,
            similarity: Math.round(r.similarity * 1000) / 1000,
            score: Math.round(r.score * 1000) / 1000,
            tags: JSON.parse(r.tags || '[]'),
            created_at: r.created_at,
            engine: 'gemini'
          }));
        }
      } catch(e) {
        process.stderr.write(`Gemini search failed, falling back to TF-IDF: ${e.message}\n`);
      }
    }
    
    // 兜底：TF-IDF
    const results = this.semanticSearch(query, { limit, category, minImportance, minScore });
    return results.map(r => ({ ...r, engine: 'tfidf' }));
  }

  /**
   * 异步重建向量（含Gemini dense vectors）
   */
  async rebuildVectorsAsync() {
    // 先重建TF-IDF
    const count = this.rebuildVectors();
    
    // 如果有Gemini，也重建dense vectors
    if (this._gemini) {
      const allMemories = this.db.prepare('SELECT id, content FROM memories').all();
      const texts = allMemories.map(m => m.content);
      
      const vectors = await this._gemini.embedBatch(texts);
      
      const insertStmt = this.db.prepare(
        'INSERT OR REPLACE INTO memory_dense_vectors (memory_id, vector) VALUES (?, ?)'
      );
      this.db.prepare('BEGIN').run();
      for (let i = 0; i < allMemories.length; i++) {
        insertStmt.run(allMemories[i].id, serializeDenseVector(vectors[i]));
      }
      this.db.prepare('COMMIT').run();
      
      return { count, gemini: true };
    }
    
    return { count, gemini: false };
  }

  /**
   * 重建所有记忆的向量索引
   * 用于首次启用语义搜索或索引损坏时
   */
  rebuildVectors() {
    const allMemories = this.db.prepare('SELECT id, content FROM memories').all();
    const tfidf = new TfIdfEngine();
    
    // 先构建全局DF
    tfidf.buildFromDocs(allMemories.map(m => m.content));
    
    // 向量化每条记忆
    const insertStmt = this.db.prepare(
      'INSERT OR REPLACE INTO memory_vectors (memory_id, vector) VALUES (?, ?)'
    );
    
    const txn = this.db.prepare('BEGIN');
    const commit = this.db.prepare('COMMIT');
    txn.run();
    
    for (const mem of allMemories) {
      const vec = tfidf.vectorize(mem.content);
      insertStmt.run(mem.id, serializeVector(vec));
    }
    
    commit.run();
    
    // 保存索引
    this._tfidf = tfidf;
    this._saveTfIdf();
    
    return allMemories.length;
  }

  /**
   * 获取单条记忆
   */
  get(id) {
    const row = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id);
    if (row) row.tags = JSON.parse(row.tags || '[]');
    return row;
  }

  /**
   * 删除记忆
   */
  forget(id) {
    return this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
  }

  /**
   * 更新重要性
   */
  setImportance(id, importance) {
    return this.db.prepare('UPDATE memories SET importance = ? WHERE id = ?').run(importance, id);
  }

  /**
   * 记忆衰减 — 模拟遗忘曲线
   * 越久没访问的记忆，decay_score越低
   * 但高importance的衰减更慢
   */
  applyDecay() {
    this.db.exec(`
      UPDATE memories SET decay_score = 
        CASE 
          WHEN importance >= 0.9 THEN MAX(0.5, decay_score * 0.99)
          WHEN importance >= 0.7 THEN MAX(0.3, decay_score * 0.97)
          WHEN importance >= 0.5 THEN MAX(0.2, decay_score * 0.95)
          ELSE MAX(0.1, decay_score * 0.90)
        END
      WHERE julianday('now') - julianday(last_accessed) > 1
    `);
  }

  /**
   * 添加/获取实体（人物、地点、概念等）
   */
  addEntity(name, type = 'unknown', attributes = {}) {
    const stmt = this.db.prepare(`
      INSERT INTO entities (name, type, attributes) VALUES (?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET 
        type = excluded.type,
        attributes = excluded.attributes,
        updated_at = datetime('now')
    `);
    return stmt.run(name, type, JSON.stringify(attributes));
  }

  getEntity(name) {
    const row = this.db.prepare('SELECT * FROM entities WHERE name = ?').get(name);
    if (row) row.attributes = JSON.parse(row.attributes || '{}');
    return row;
  }

  /**
   * 关联记忆与实体
   */
  linkMemoryEntity(memoryId, entityName) {
    const entity = this.getEntity(entityName);
    if (!entity) return null;
    this.db.prepare(`
      INSERT OR IGNORE INTO memory_entities (memory_id, entity_id) VALUES (?, ?)
    `).run(memoryId, entity.id);
  }

  /**
   * 统计
   */
  stats() {
    const total = this.db.prepare('SELECT COUNT(*) as count FROM memories').get();
    const byCategory = this.db.prepare(
      'SELECT category, COUNT(*) as count FROM memories GROUP BY category'
    ).all();
    const entities = this.db.prepare('SELECT COUNT(*) as count FROM entities').get();
    return {
      totalMemories: total.count,
      byCategory,
      totalEntities: entities.count
    };
  }

  close() {
    this.db.close();
  }
}
