/**
 * 语义搜索测试
 */
import { TfIdfEngine, tokenize, cosineSimilarity, serializeVector, deserializeVector } from './embedding.js';
import { MemoryEngine } from './memory.js';
import { resolve } from 'node:path';
import { unlinkSync } from 'node:fs';

const TEST_DB = resolve(import.meta.dirname, '../test-semantic.db');

// 清理旧测试数据
try { unlinkSync(TEST_DB); } catch {}

console.log('=== 测试分词 ===\n');

const tests = [
  '我喜欢搞钱搞好玩的搞数学',
  'AI memory service for agents',
  '新加坡天气很热但是我觉得还行',
  'MCP协议是Anthropic推出的标准',
];
for (const t of tests) {
  console.log(`  "${t}"`);
  console.log(`  → [${tokenize(t).join(', ')}]\n`);
}

console.log('=== 测试TF-IDF引擎 ===\n');

const engine = new TfIdfEngine();
const docs = [
  '我在新加坡，喜欢搞数学和编程',
  '今天天气很好，适合出去走走',
  '记忆服务项目需要支持MCP协议',
  'AI agent需要长期记忆才能真正有用',
  '量化交易和套利是不错的被动收入来源',
  'Polymarket在新加坡被封了不能用',
  '开源项目通过GitHub可以免费推广',
  '人不想社交就做不需要面对面的生意',
];

engine.buildFromDocs(docs);
console.log(`  文档数: ${engine.docCount}, 词汇量: ${engine.vocabulary.size}\n`);

// 测试向量化+相似度
const queries = [
  { q: '数学编程', expect: '新加坡数学编程' },
  { q: '赚钱方法', expect: '量化交易/被动收入' },
  { q: 'memory protocol', expect: 'MCP协议' },
  { q: '不想跟人打交道', expect: '不需要面对面' },
  { q: '天气怎么样', expect: '天气' },
];

const queryVecs = queries.map(q => ({ ...q, vec: engine.vectorize(q.q) }));
const docVecs = docs.map(d => ({ text: d, vec: engine.vectorize(d) }));

for (const q of queryVecs) {
  const scored = docVecs
    .map(d => ({ text: d.text, score: cosineSimilarity(q.vec, d.vec) }))
    .sort((a, b) => b.score - a.score);
  
  console.log(`  查询: "${q.q}" (期望: ${q.expect})`);
  console.log(`  Top 3:`);
  for (const r of scored.slice(0, 3)) {
    console.log(`    ${r.score.toFixed(3)} — ${r.text}`);
  }
  console.log();
}

// 测试序列化
console.log('=== 测试序列化/反序列化 ===\n');
const json = engine.toJSON();
const restored = TfIdfEngine.fromJSON(json);
const vec1 = engine.vectorize('测试向量化');
const vec2 = restored.vectorize('测试向量化');
const serialized = serializeVector(vec1);
const deserialized = deserializeVector(serialized);
console.log(`  原始向量维度: ${vec1.size}`);
console.log(`  还原向量维度: ${vec2.size}`);
console.log(`  序列化/反序列化: ${deserialized.size} 维`);
console.log(`  一致性: ${cosineSimilarity(vec1, vec2) === 1 ? '✅' : '❌'}\n`);

// 测试完整MemoryEngine语义搜索
console.log('=== 测试MemoryEngine语义搜索 ===\n');

const mem = new MemoryEngine(TEST_DB);

// 添加记忆
for (const d of docs) {
  mem.add(d, { importance: 0.7 });
}
console.log(`  添加了 ${docs.length} 条记忆\n`);

// 语义搜索
const semanticQueries = [
  '被动收入怎么搞',
  'AI需要记忆',
  '新加坡',
  'open source promotion',
];

for (const q of semanticQueries) {
  console.log(`  语义搜索: "${q}"`);
  const results = mem.semanticSearch(q, { limit: 3 });
  for (const r of results) {
    console.log(`    ${r.similarity.toFixed(3)} — ${r.content}`);
  }
  console.log();
}

// 对比：关键词搜索 vs 语义搜索
console.log('=== 关键词 vs 语义搜索对比 ===\n');

const testQ = '赚钱';
console.log(`  查询: "${testQ}"\n`);

console.log('  关键词搜索 (LIKE):');
const kwResults = mem.search(testQ, { limit: 3 });
if (kwResults.length === 0) console.log('    （无结果）');
for (const r of kwResults) console.log(`    ${r.content}`);

console.log('\n  语义搜索 (TF-IDF):');
const semResults = mem.semanticSearch(testQ, { limit: 3 });
if (semResults.length === 0) console.log('    （无结果）');
for (const r of semResults) console.log(`    ${r.similarity.toFixed(3)} — ${r.content}`);

mem.close();

// 清理
try { unlinkSync(TEST_DB); } catch {}

console.log('\n✅ 语义搜索测试完成');
