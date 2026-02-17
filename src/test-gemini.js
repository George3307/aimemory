/**
 * Gemini Embedding 测试
 */
import { MemoryEngine } from './memory.js';
import { unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY) { console.error('请设置 GEMINI_API_KEY 环境变量'); process.exit(1); }
const TEST_DB = resolve(import.meta.dirname, '../test-gemini.db');

try { unlinkSync(TEST_DB); } catch {}

const engine = new MemoryEngine(TEST_DB, { geminiApiKey: GEMINI_KEY });

const memories = [
  { content: '我在新加坡，喜欢搞数学和编程', category: 'person', importance: 0.8 },
  { content: '量化交易和套利是不错的被动收入来源', category: 'knowledge', importance: 0.7 },
  { content: '记忆服务项目需要支持MCP协议', category: 'decision', importance: 0.9 },
  { content: 'Polymarket在新加坡被封了不能用', category: 'knowledge', importance: 0.6 },
  { content: '不想社交就做不需要面对面的生意', category: 'preference', importance: 0.8 },
  { content: 'AI agent需要长期记忆才能真正有用', category: 'knowledge', importance: 0.8 },
  { content: '开源项目通过GitHub可以免费推广', category: 'knowledge', importance: 0.6 },
  { content: '今天天气很好，30度', category: 'general', importance: 0.3 },
];

console.log('=== 添加记忆（含Gemini embedding）===\n');

for (const m of memories) {
  const result = await engine.addAsync(m.content, m);
  console.log(`  ✅ #${result.id} ${result.content}`);
}

// 验证dense vectors存在
const denseCount = engine.db.prepare('SELECT COUNT(*) as c FROM memory_dense_vectors').get().c;
console.log(`\n  Dense vectors: ${denseCount}/${memories.length}`);

console.log('\n=== Gemini语义搜索 vs TF-IDF对比 ===\n');

const queries = [
  '怎么赚钱',
  '不想跟人打交道',
  '天气温度',
  'AI记忆系统',
  '在哪个国家',
  'how to make passive income',  // 跨语言！
];

for (const q of queries) {
  console.log(`查询: "${q}"`);
  
  // Gemini搜索
  const geminiResults = await engine.semanticSearchAsync(q, { limit: 3 });
  console.log(`  🧠 Gemini (${geminiResults[0]?.engine || 'none'}):`);
  if (geminiResults.length === 0) console.log('    (无结果)');
  for (const r of geminiResults) {
    console.log(`    sim=${r.similarity} — ${r.content}`);
  }
  
  // TF-IDF搜索
  const tfidfResults = engine.semanticSearch(q, { limit: 3 });
  console.log(`  📐 TF-IDF:`);
  if (tfidfResults.length === 0) console.log('    (无结果)');
  for (const r of tfidfResults) {
    console.log(`    sim=${r.similarity} — ${r.content}`);
  }
  console.log();
}

engine.close();
try { unlinkSync(TEST_DB); } catch {}

console.log('✅ Gemini embedding测试完成');
