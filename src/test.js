/**
 * 快速测试
 */
import { MemoryEngine } from './memory.js';
import { extractMemories, extractFromConversation } from './extractor.js';
import { tokenize, TfIdfEngine, cosineSimilarity } from './embedding.js';
import { unlinkSync } from 'node:fs';

const TEST_DB = '/tmp/test-aimemory-' + Date.now() + '.db';

// ===== 测试分词 =====
console.log('=== 测试分词 ===\n');

const t1 = tokenize('新加坡天气很热');
console.log('  中文:', t1);

const t2 = tokenize('AI memory service is great');
console.log('  英文:', t2);

const t3 = tokenize('1住在新加坡，做AI项目');
console.log('  混合:', t3);

// ===== 测试TF-IDF =====
console.log('\n=== 测试TF-IDF引擎 ===\n');

const tfidf = new TfIdfEngine();
const docs = [
  '新加坡天气很热',
  '我喜欢做AI项目',
  '记忆服务是一个好主意',
  '天气预报说明天下雨',
];
tfidf.buildFromDocs(docs);
console.log(`  词表大小: ${tfidf.vocabulary.size}`);

const v1 = tfidf.vectorize('天气怎么样');
const v2 = tfidf.vectorize('新加坡天气很热');
const v3 = tfidf.vectorize('AI项目很好');
const sim12 = cosineSimilarity(v1, v2);
const sim13 = cosineSimilarity(v1, v3);
console.log(`  "天气怎么样" vs "新加坡天气很热": ${sim12.toFixed(3)}`);
console.log(`  "天气怎么样" vs "AI项目很好": ${sim13.toFixed(3)}`);
console.log(`  天气相关应该更高: ${sim12 > sim13 ? '✅' : '❌'}`);

// ===== 测试序列化 =====
const json = tfidf.toJSON();
const restored = TfIdfEngine.fromJSON(json);
console.log(`  序列化恢复: 词表=${restored.vocabulary.size} 文档=${restored.docCount} ✅`);

// ===== 测试记忆提取 =====
console.log('\n=== 测试记忆提取 ===\n');

const testTexts = [
  "1住在新加坡，时区GMT+8",
  "决定做AI记忆服务项目，面向终端用户",
  "也许以后可以试试",
  "嗯",
  "关键差异化：支持MCP协议，这很重要",
];

for (const text of testTexts) {
  const mems = extractMemories(text);
  if (mems.length > 0) {
    for (const m of mems) console.log(`  ✅ [${m.category}] imp:${m.importance} "${m.content}"`);
  } else {
    console.log(`  ❌ 跳过: "${text}"`);
  }
}

// ===== 测试语义搜索 =====
console.log('\n=== 测试语义搜索 ===\n');

const engine = new MemoryEngine(TEST_DB);

// 添加一批记忆
engine.add('新加坡天气很热，全年30度', { category: 'fact', importance: 0.6 });
engine.add('决定做AI记忆服务项目', { category: 'decision', importance: 0.9 });
engine.add('Polymarket是一个预测市场平台', { category: 'fact', importance: 0.5 });
engine.add('1不想社交谈客户，想找被动收入', { category: 'preference', importance: 0.7 });
engine.add('MCP协议是Anthropic推的AI工具标准', { category: 'knowledge', importance: 0.8 });
engine.add('晚餐吃了炒饭', { category: 'general', importance: 0.2 });

// 重建向量索引（让TF-IDF全局一致）
const rebuilt = engine.rebuildVectors();
console.log(`  重建了 ${rebuilt} 条记忆的向量`);

// 语义搜索测试
const queries = [
  '温度气候',       // 应该找到天气相关
  '赚钱方式',       // 应该找到被动收入
  'AI工具协议',     // 应该找到MCP
  '吃什么',         // 应该找到炒饭
];

for (const q of queries) {
  const results = engine.semanticSearch(q, { limit: 3 });
  console.log(`\n  搜索 "${q}":`);
  if (results.length === 0) {
    console.log('    (无结果)');
  } else {
    for (const r of results) {
      console.log(`    [sim=${r.similarity}] ${r.content}`);
    }
  }
}

// 对比关键词搜索 vs 语义搜索
console.log('\n=== 关键词 vs 语义 对比 ===\n');
const kwResults = engine.search('赚钱');
const semResults = engine.semanticSearch('赚钱');
console.log(`  关键词"赚钱": ${kwResults.length}条`);
console.log(`  语义"赚钱": ${semResults.length}条`);

const stats = engine.stats();
console.log(`\n统计: ${stats.totalMemories}条记忆, ${stats.totalEntities}个实体`);

engine.close();

// 清理
try { unlinkSync(TEST_DB); } catch {}

console.log('\n✅ 所有测试通过');
