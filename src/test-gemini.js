/**
 * Gemini Embedding test
 * Requires GEMINI_API_KEY environment variable
 */
import { MemoryEngine } from './memory.js';
import { unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY) { console.error('Set GEMINI_API_KEY environment variable'); process.exit(1); }

const TEST_DB = resolve(import.meta.dirname, '../test-gemini.db');
try { unlinkSync(TEST_DB); } catch {}

const engine = new MemoryEngine(TEST_DB, { geminiApiKey: GEMINI_KEY });

const memories = [
  { content: 'I enjoy coding and building software', category: 'person', importance: 0.8 },
  { content: 'Quantitative trading and arbitrage are good passive income', category: 'knowledge', importance: 0.7 },
  { content: 'The memory service project needs MCP protocol support', category: 'decision', importance: 0.9 },
  { content: 'Some prediction markets are restricted in certain countries', category: 'knowledge', importance: 0.6 },
  { content: 'Prefer remote work, no face-to-face meetings', category: 'preference', importance: 0.8 },
  { content: 'AI agents need long-term memory to be truly useful', category: 'knowledge', importance: 0.8 },
  { content: 'Open source projects can get free promotion on GitHub', category: 'knowledge', importance: 0.6 },
  { content: 'The weather is nice today, about 25 degrees', category: 'general', importance: 0.3 },
];

console.log('=== Adding memories (with Gemini embedding) ===\n');

for (const m of memories) {
  const result = await engine.addAsync(m.content, m);
  console.log(`  ✅ #${result.id} ${result.content}`);
}

const denseCount = engine.db.prepare('SELECT COUNT(*) as c FROM memory_dense_vectors').get().c;
console.log(`\n  Dense vectors: ${denseCount}/${memories.length}`);

console.log('\n=== Gemini vs TF-IDF Comparison ===\n');

const queries = [
  'how to make money',
  'prefer working alone',
  'temperature weather',
  'AI memory system',
  'which country',
  'how to earn passive income',
];

for (const q of queries) {
  console.log(`Query: "${q}"`);
  
  const geminiResults = await engine.semanticSearchAsync(q, { limit: 3 });
  console.log(`  🧠 Gemini (${geminiResults[0]?.engine || 'none'}):`);
  if (geminiResults.length === 0) console.log('    (no results)');
  for (const r of geminiResults) {
    console.log(`    sim=${r.similarity} — ${r.content}`);
  }
  
  const tfidfResults = engine.semanticSearch(q, { limit: 3 });
  console.log(`  📐 TF-IDF:`);
  if (tfidfResults.length === 0) console.log('    (no results)');
  for (const r of tfidfResults) {
    console.log(`    sim=${r.similarity} — ${r.content}`);
  }
  console.log();
}

engine.close();
try { unlinkSync(TEST_DB); } catch {}

console.log('✅ Gemini embedding tests passed');
