/**
 * aimemory - Gemini Embedding 引擎
 * 
 * 用Google的gemini-embedding-001模型生成真正的语义向量
 * 3072维，中英文效果都很好
 * 免费额度大，适合个人使用
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = 'gemini-embedding-001';

export class GeminiEmbedding {
  constructor(apiKey) {
    if (!apiKey) throw new Error('Gemini API key required');
    this.apiKey = apiKey;
    this.dimensions = 3072;
  }

  /**
   * 单条文本embedding
   */
  async embed(text) {
    const url = `${API_BASE}/models/${MODEL}:embedContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${MODEL}`,
        content: { parts: [{ text }] }
      })
    });
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Gemini embedding failed: ${res.status} ${err.error?.message || ''}`);
    }
    
    const data = await res.json();
    return new Float32Array(data.embedding.values);
  }

  /**
   * 批量embedding（最多100条）
   */
  async embedBatch(texts) {
    const url = `${API_BASE}/models/${MODEL}:batchEmbedContents?key=${this.apiKey}`;
    
    // API限制每批100条
    const results = [];
    for (let i = 0; i < texts.length; i += 100) {
      const batch = texts.slice(i, i + 100);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: batch.map(text => ({
            model: `models/${MODEL}`,
            content: { parts: [{ text }] }
          }))
        })
      });
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Gemini batch embedding failed: ${res.status} ${err.error?.message || ''}`);
      }
      
      const data = await res.json();
      for (const emb of data.embeddings) {
        results.push(new Float32Array(emb.values));
      }
    }
    return results;
  }
}

/**
 * 余弦相似度（Float32Array版本）
 */
export function cosineSimilarityDense(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

/**
 * 序列化 Float32Array → base64
 */
export function serializeDenseVector(vec) {
  return Buffer.from(vec.buffer).toString('base64');
}

/**
 * 反序列化 base64 → Float32Array
 */
export function deserializeDenseVector(str) {
  const buf = Buffer.from(str, 'base64');
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}
