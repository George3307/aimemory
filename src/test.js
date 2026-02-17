/**
 * 快速测试
 */
import { MemoryEngine } from './memory.js';
import { extractMemories, extractFromConversation } from './extractor.js';
import { tokenize, TfIdfEngine, cosineSimilarity } from './embedding.js';
import { unlinkSync } from 'node:fs';

const TEST_DB = '/tmp/test-aimemory-' + Date.now() + '.db';

// ===== 测试分词 =====
console.log('=== Test: Tokenization ===\n');

const t1 = tokenize('The weather is very hot today');
console.log('  English:', t1);

const t2 = tokenize('AI memory service is great');
console.log('  English 2:', t2);

const t3 = tokenize('我喜欢做AI项目');
console.log('  Chinese:', t3);

// ===== 测试TF-IDF =====
console.log('\n=== Test: TF-IDF Engine ===\n');

const tfidf = new TfIdfEngine();
const docs = [
  'The weather is hot today',
  'I like building AI projects',
  'A memory service is a great idea',
  'Weather forecast says rain tomorrow',
];
tfidf.buildFromDocs(docs);
console.log(`  Vocabulary size: ${tfidf.vocabulary.size}`);

const v1 = tfidf.vectorize('weather today');
const v2 = tfidf.vectorize('The weather is hot today');
const v3 = tfidf.vectorize('AI projects are cool');
const sim12 = cosineSimilarity(v1, v2);
const sim13 = cosineSimilarity(v1, v3);
console.log(`  "weather today" vs "The weather is hot today": ${sim12.toFixed(3)}`);
console.log(`  "weather today" vs "AI projects are cool": ${sim13.toFixed(3)}`);
console.log(`  Weather match should be higher: ${sim12 > sim13 ? '✅' : '❌'}`);

// ===== 测试序列化 =====
const json = tfidf.toJSON();
const restored = TfIdfEngine.fromJSON(json);
console.log(`  Serialization: vocab=${restored.vocabulary.size} docs=${restored.docCount} ✅`);

// ===== 测试记忆提取 =====
console.log('\n=== Test: Memory Extraction ===\n');

const testTexts = [
  "User lives in Tokyo, timezone JST",
  "Decided to build an AI memory service for end users",
  "Maybe try it later",
  "Hmm",
  "Key differentiator: MCP protocol support, this is important",
];

for (const text of testTexts) {
  const mems = extractMemories(text);
  if (mems.length > 0) {
    for (const m of mems) console.log(`  ✅ [${m.category}] imp:${m.importance} "${m.content}"`);
  } else {
    console.log(`  ❌ Skipped: "${text}"`);
  }
}

// ===== 测试语义搜索 =====
console.log('\n=== Test: Semantic Search ===\n');

const engine = new MemoryEngine(TEST_DB);

engine.add('The weather is hot, around 30 degrees all year', { category: 'fact', importance: 0.6 });
engine.add('Decided to build an AI memory service', { category: 'decision', importance: 0.9 });
engine.add('Prediction markets are interesting platforms', { category: 'fact', importance: 0.5 });
engine.add('Prefer passive income, no client meetings', { category: 'preference', importance: 0.7 });
engine.add('MCP protocol is an AI tool standard by Anthropic', { category: 'knowledge', importance: 0.8 });
engine.add('Had fried rice for dinner', { category: 'general', importance: 0.2 });

const rebuilt = engine.rebuildVectors();
console.log(`  Rebuilt ${rebuilt} memory vectors`);

const queries = [
  'temperature climate',
  'how to earn money',
  'AI tool protocol',
  'what to eat',
];

for (const q of queries) {
  const results = engine.semanticSearch(q, { limit: 3 });
  console.log(`\n  Search "${q}":`);
  if (results.length === 0) {
    console.log('    (no results)');
  } else {
    for (const r of results) {
      console.log(`    [sim=${r.similarity}] ${r.content}`);
    }
  }
}

// 对比
console.log('\n=== Keyword vs Semantic ===\n');
const kwResults = engine.search('earn money');
const semResults = engine.semanticSearch('earn money');
console.log(`  Keyword "earn money": ${kwResults.length} results`);
console.log(`  Semantic "earn money": ${semResults.length} results`);

const stats = engine.stats();
console.log(`\nStats: ${stats.totalMemories} memories, ${stats.totalEntities} entities`);

engine.close();
try { unlinkSync(TEST_DB); } catch {}

console.log('\n✅ All tests passed');
