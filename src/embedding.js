/**
 * aimemory - 轻量级语义搜索引擎
 * 
 * TF-IDF + 余弦相似度，纯JS零依赖
 * 中英文双语支持（中文bigram分词）
 * 后续Phase 2可换成真embedding API
 */

// ============ 停用词 ============

const STOP_WORDS = new Set([
  // English
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'it', 'its',
  'this', 'that', 'these', 'those', 'he', 'she', 'we', 'they', 'me',
  'him', 'her', 'us', 'them', 'my', 'his', 'our', 'your', 'their',
  'what', 'which', 'who', 'when', 'where', 'how', 'not', 'no', 'nor',
  'but', 'or', 'and', 'if', 'then', 'so', 'than', 'too', 'very',
  'just', 'also', 'now', 'here', 'there', 'all', 'any', 'both', 'each',
  // 中文常用虚词
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都',
  '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你',
  '会', '着', '没有', '看', '好', '自己', '这', '他', '她', '它',
]);

// ============ 分词 ============

/**
 * 中英文分词
 * 中文：单字 + bigram
 * 英文：小写单词，去停用词
 */
export function tokenize(text) {
  if (!text) return [];
  const tokens = [];
  const parts = text.split(/([\u4e00-\u9fff\u3400-\u4dbf]+)/g);

  for (const part of parts) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(part)) {
      const chars = [...part];
      for (const ch of chars) {
        if (!STOP_WORDS.has(ch)) tokens.push(ch);
      }
      for (let i = 0; i < chars.length - 1; i++) {
        const bigram = chars[i] + chars[i + 1];
        if (!STOP_WORDS.has(bigram)) tokens.push(bigram);
      }
    } else {
      const words = part.toLowerCase().match(/[a-z0-9]+/g);
      if (words) {
        for (const w of words) {
          if (w.length > 1 && !STOP_WORDS.has(w)) tokens.push(w);
        }
      }
    }
  }
  return tokens;
}

// ============ 同义词扩展 ============

const SYNONYMS = [
  ['赚钱', '收入', '赚', '钱', '盈利', '变现', '营收'],
  ['搞钱', '赚钱', '挣钱', '收入'],
  ['被动收入', '睡后收入', '自动赚钱'],
  ['社交', '面对面', '谈客户', '见人', '社恐'],
  ['记忆', '记住', '回忆', '存储'],
  ['AI', '人工智能', '机器学习', 'ml'],
  ['编程', '写代码', '开发', '代码', 'code', 'coding'],
  ['数学', '数学家', '算法', '公式'],
  ['项目', '产品', '工具', '服务'],
  ['天气', '温度', '气候', '气温', '冷', '热'],
  ['新加坡', '狮城', 'singapore', 'sg'],
  ['量化', '交易', '套利', '对冲'],
  ['开源', 'open source', 'github', '免费'],
];

const SYNONYM_MAP = new Map();
for (const group of SYNONYMS) {
  for (const word of group) {
    const existing = SYNONYM_MAP.get(word) || new Set();
    for (const w of group) existing.add(w);
    SYNONYM_MAP.set(word, existing);
  }
}

/**
 * 扩展查询词：加入同义词
 */
function expandWithSynonyms(tokens) {
  const expanded = [...tokens];
  for (const t of tokens) {
    const syns = SYNONYM_MAP.get(t);
    if (syns) {
      for (const s of syns) {
        if (!expanded.includes(s)) expanded.push(s);
      }
    }
  }
  return expanded;
}

// ============ TF-IDF Engine ============

export class TfIdfEngine {
  constructor() {
    this.docCount = 0;
    this.df = new Map();       // term -> document frequency
    this.vocabulary = new Set(); // all known terms
  }

  /**
   * 添加单个文档（更新全局DF）
   */
  addDoc(text) {
    const tokens = tokenize(text);
    const uniqueTerms = new Set(tokens);
    for (const term of uniqueTerms) {
      this.df.set(term, (this.df.get(term) || 0) + 1);
      this.vocabulary.add(term);
    }
    this.docCount++;
  }

  /**
   * 从一批文档构建索引
   */
  buildFromDocs(texts) {
    this.docCount = 0;
    this.df = new Map();
    this.vocabulary = new Set();
    for (const text of texts) {
      this.addDoc(text);
    }
  }

  /**
   * 将文本向量化为稀疏TF-IDF向量 (Map<string, number>)
   * expandSynonyms: 查询时开启，存储时关闭
   */
  vectorize(text, { expandSynonyms = false } = {}) {
    let tokens = tokenize(text);
    if (tokens.length === 0) return new Map();
    if (expandSynonyms) tokens = expandWithSynonyms(tokens);

    // TF: 词频归一化
    const tf = new Map();
    for (const t of tokens) {
      tf.set(t, (tf.get(t) || 0) + 1);
    }
    const maxTF = Math.max(...tf.values(), 1);

    // TF-IDF
    const vec = new Map();
    for (const [term, count] of tf) {
      const normalizedTF = count / maxTF;
      const idf = Math.log((this.docCount + 1) / ((this.df.get(term) || 0) + 1)) + 1;
      vec.set(term, normalizedTF * idf);
    }
    return vec;
  }

  /**
   * 序列化
   */
  toJSON() {
    return {
      docCount: this.docCount,
      df: Array.from(this.df.entries()),
    };
  }

  /**
   * 反序列化
   */
  static fromJSON(data) {
    const engine = new TfIdfEngine();
    engine.docCount = data.docCount || 0;
    engine.df = new Map(data.df || []);
    engine.vocabulary = new Set(engine.df.keys());
    return engine;
  }
}

// ============ 向量工具函数 ============

/**
 * 余弦相似度
 */
export function cosineSimilarity(vecA, vecB) {
  let dot = 0, normA = 0, normB = 0;
  for (const [k, v] of vecA) {
    normA += v * v;
    if (vecB.has(k)) dot += v * vecB.get(k);
  }
  for (const v of vecB.values()) normB += v * v;
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

/**
 * 序列化稀疏向量 → JSON字符串
 */
export function serializeVector(vec) {
  return JSON.stringify(Array.from(vec.entries()));
}

/**
 * 反序列化 JSON字符串 → Map
 */
export function deserializeVector(str) {
  try {
    return new Map(JSON.parse(str));
  } catch {
    return new Map();
  }
}
