/**
 * Semantic search test
 */
import { TfIdfEngine, tokenize, cosineSimilarity, serializeVector, deserializeVector } from './embedding.js';
import { MemoryEngine } from './memory.js';
import { resolve } from 'node:path';
import { unlinkSync } from 'node:fs';

const TEST_DB = resolve(import.meta.dirname, '../test-semantic.db');
try { unlinkSync(TEST_DB); } catch {}

console.log('=== Test: Tokenization ===\n');

const tests = [
  'I like building things and coding',
  'AI memory service for agents',
  'The weather is hot but I think it is fine',
  'MCP protocol is a standard by Anthropic',
];
for (const t of tests) {
  console.log(`  "${t}"`);
  console.log(`  → [${tokenize(t).join(', ')}]\n`);
}

console.log('=== Test: TF-IDF Engine ===\n');

const engine = new TfIdfEngine();
const docs = [
  'I like coding and building software',
  'The weather is nice today, good for a walk',
  'The memory service project needs MCP protocol support',
  'AI agents need long-term memory to be truly useful',
  'Quantitative trading and arbitrage are good passive income sources',
  'Some prediction markets are blocked in certain regions',
  'Open source projects can be promoted for free on GitHub',
  'Prefer remote work, no face-to-face client meetings needed',
];

engine.buildFromDocs(docs);
console.log(`  Documents: ${engine.docCount}, Vocabulary: ${engine.vocabulary.size}\n`);

const queries = [
  { q: 'coding software', expect: 'coding/building' },
  { q: 'making money', expect: 'passive income' },
  { q: 'memory protocol', expect: 'MCP protocol' },
  { q: 'prefer working alone', expect: 'no face-to-face' },
  { q: 'how is the weather', expect: 'weather' },
];

const queryVecs = queries.map(q => ({ ...q, vec: engine.vectorize(q.q) }));
const docVecs = docs.map(d => ({ text: d, vec: engine.vectorize(d) }));

for (const q of queryVecs) {
  const scored = docVecs
    .map(d => ({ text: d.text, score: cosineSimilarity(q.vec, d.vec) }))
    .sort((a, b) => b.score - a.score);
  
  console.log(`  Query: "${q.q}" (expect: ${q.expect})`);
  console.log(`  Top 3:`);
  for (const r of scored.slice(0, 3)) {
    console.log(`    ${r.score.toFixed(3)} — ${r.text}`);
  }
  console.log();
}

// Serialization test
console.log('=== Test: Serialization ===\n');
const json = engine.toJSON();
const restored = TfIdfEngine.fromJSON(json);
const vec1 = engine.vectorize('test vector');
const vec2 = restored.vectorize('test vector');
const serialized = serializeVector(vec1);
const deserialized = deserializeVector(serialized);
console.log(`  Original dims: ${vec1.size}`);
console.log(`  Restored dims: ${vec2.size}`);
console.log(`  Serialized/deserialized: ${deserialized.size} dims`);

// Full MemoryEngine test
console.log('\n=== Test: MemoryEngine Semantic Search ===\n');

const mem = new MemoryEngine(TEST_DB);
for (const d of docs) {
  mem.add(d, { importance: 0.7 });
}
console.log(`  Added ${docs.length} memories\n`);

const semanticQueries = [
  'passive income strategies',
  'AI needs memory',
  'open source promotion',
  'remote work preference',
];

for (const q of semanticQueries) {
  console.log(`  Semantic search: "${q}"`);
  const results = mem.semanticSearch(q, { limit: 3 });
  for (const r of results) {
    console.log(`    ${r.similarity.toFixed(3)} — ${r.content}`);
  }
  console.log();
}

mem.close();
try { unlinkSync(TEST_DB); } catch {}

console.log('✅ Semantic search tests passed');
