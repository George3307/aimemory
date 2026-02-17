#!/usr/bin/env node
/**
 * aimemory CLI
 * Usage: aimem <command> [options]
 */
import { MemoryEngine } from './memory.js';
import { extractMemories, extractFromConversation } from './extractor.js';
import { parseArgs } from 'node:util';

const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const engine = new MemoryEngine(undefined, { geminiApiKey: geminiKey });

const command = process.argv[2];
const args = process.argv.slice(3);

const commands = {
  async add() {
    const content = args.join(' ');
    if (!content) { console.log('用法: aimem add <内容> [--cat 类别] [--imp 重要性]'); return; }
    
    let category = 'general', importance = 0.5;
    const catIdx = args.indexOf('--cat');
    if (catIdx >= 0) category = args[catIdx + 1];
    const impIdx = args.indexOf('--imp');
    if (impIdx >= 0) importance = parseFloat(args[impIdx + 1]);
    
    // 去掉flag
    const cleanContent = content.replace(/--cat\s+\S+/g, '').replace(/--imp\s+\S+/g, '').trim();
    
    const mem = geminiKey
      ? await engine.addAsync(cleanContent, { category, importance })
      : engine.add(cleanContent, { category, importance });
    console.log(`✅ 记住了 (id:${mem.id}) [${mem.category}] imp:${mem.importance}`);
    console.log(`   ${mem.content}`);
  },

  async search() {
    const semantic = args.includes('--semantic') || args.includes('-s');
    const query = args.filter(a => a !== '--semantic' && a !== '-s').join(' ');
    
    if (semantic) {
      const results = geminiKey
        ? await engine.semanticSearchAsync(query, { limit: 10 })
        : engine.semanticSearch(query, { limit: 10 });
      if (results.length === 0) {
        console.log('🧠 语义搜索：没找到相关记忆');
        return;
      }
      const eng = results[0]?.engine || 'tfidf';
      console.log(`🧠 语义搜索 "${query}" [${eng}] — 找到 ${results.length} 条:\n`);
      for (const r of results) {
        console.log(`  [${r.id}] 相似度:${r.similarity} 分数:${r.score} 📂${r.category}`);
        console.log(`      ${r.content}`);
        console.log();
      }
    } else {
      const results = engine.search(query || null, { limit: 10 });
      if (results.length === 0) {
        console.log('🔍 没找到相关记忆');
        return;
      }
      console.log(`🔍 找到 ${results.length} 条记忆:\n`);
      for (const r of results) {
        const age = timeSince(r.created_at);
        console.log(`  [${r.id}] ⭐${r.importance} 🔄${r.decay_score.toFixed(2)} 📂${r.category} (${age})`);
        console.log(`      ${r.content}`);
        if (r.tags.length) console.log(`      🏷️ ${r.tags.join(', ')}`);
        console.log();
      }
    }
  },

  rebuild() {
    const count = engine.rebuildVectors();
    console.log(`🔄 已重建 ${count} 条记忆的向量索引`);
  },

  forget() {
    const id = parseInt(args[0]);
    if (!id) { console.log('用法: aimem forget <id>'); return; }
    engine.forget(id);
    console.log(`🗑️ 已遗忘记忆 #${id}`);
  },

  stats() {
    const s = engine.stats();
    console.log(`📊 记忆统计:`);
    console.log(`   总记忆: ${s.totalMemories}`);
    console.log(`   总实体: ${s.totalEntities}`);
    console.log(`   分类:`);
    for (const c of s.byCategory) {
      console.log(`     ${c.category}: ${c.count}`);
    }
  },

  decay() {
    engine.applyDecay();
    console.log('⏰ 记忆衰减已应用');
  },

  async extract() {
    const text = args.join(' ');
    if (!text) { console.log('用法: aimem extract <文本>'); return; }
    
    const save = args.includes('--save');
    const cleanText = text.replace('--save', '').trim();
    const mems = extractMemories(cleanText);
    
    if (mems.length === 0) {
      console.log('🔍 没有找到值得记忆的内容');
      return;
    }
    
    console.log(`🧠 提取了 ${mems.length} 条记忆${save ? '（已保存）' : '（预览，加 --save 保存）'}:\n`);
    for (const m of mems) {
      if (save) {
        const saved = geminiKey
          ? await engine.addAsync(m.content, m)
          : engine.add(m.content, m);
        console.log(`  ✅ [${saved.id}] [${m.category}] imp:${m.importance} ${m.content}`);
      } else {
        console.log(`  📝 [${m.category}] imp:${m.importance} ${m.content}`);
      }
    }
  },

  async export() {
    const filePath = args[0] || 'memories-export.json';
    const all = engine.db.prepare('SELECT * FROM memories ORDER BY id').all();
    const entities = engine.db.prepare('SELECT * FROM entities ORDER BY id').all();
    const data = {
      version: '0.1.0',
      exportedAt: new Date().toISOString(),
      memories: all.map(m => ({ ...m, tags: JSON.parse(m.tags || '[]') })),
      entities: entities.map(e => ({ ...e, attributes: JSON.parse(e.attributes || '{}') })),
    };
    const fs = await import('node:fs');
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`📦 已导出 ${all.length} 条记忆, ${entities.length} 个实体 → ${filePath}`);
  },

  import: async function() {
    const filePath = args[0];
    if (!filePath) { console.log('用法: aimem import <文件路径>'); return; }
    const fs = await import('node:fs');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    
    let count = 0;
    for (const m of (data.memories || [])) {
      engine.add(m.content, {
        category: m.category || 'general',
        importance: m.importance || 0.5,
        source: m.source,
        tags: m.tags || []
      });
      count++;
    }
    
    let entityCount = 0;
    for (const e of (data.entities || [])) {
      engine.addEntity(e.name, e.type, e.attributes || {});
      entityCount++;
    }
    
    console.log(`📥 已导入 ${count} 条记忆, ${entityCount} 个实体`);
    console.log('💡 建议运行 aimem rebuild 重建向量索引');
  },

  help() {
    console.log(`
✳️ aimemory - AI记忆管家 v0.1.0

命令:
  aimem add <内容> [--cat 类别] [--imp 0-1]  添加记忆
  aimem search [关键词]                       搜索记忆（关键词）
  aimem search -s [查询]                     语义搜索（找意思相近的）
  aimem extract <文本> [--save]               从文本提取记忆
  aimem rebuild                              重建向量索引
  aimem forget <id>                          遗忘一条记忆
  aimem stats                                统计信息
  aimem export [文件路径]                     导出所有记忆为JSON
  aimem import <文件路径>                     从JSON导入记忆
  aimem decay                                应用记忆衰减
  aimem help                                 帮助
    `);
  }
};

function timeSince(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr + 'Z').getTime()) / 1000);
  if (seconds < 60) return `${seconds}秒前`;
  if (seconds < 3600) return `${Math.floor(seconds/60)}分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds/3600)}小时前`;
  return `${Math.floor(seconds/86400)}天前`;
}

if (commands[command]) {
  await Promise.resolve(commands[command]());
} else {
  await Promise.resolve(commands.help());
}

engine.close();
