#!/usr/bin/env node
/**
 * aimemory MCP Server
 * 通过 Model Context Protocol 让任何AI agent使用记忆服务
 * 协议：JSON-RPC over stdio
 */
import { MemoryEngine } from './memory.js';
import { extractMemories } from './extractor.js';
const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY || null;
const engine = new MemoryEngine(undefined, { geminiApiKey: geminiKey });

const TOOLS = [
  {
    name: 'memory_add',
    description: 'Add a new memory. Use this to remember important information about the user, decisions, facts, or events.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The memory content to store' },
        category: { type: 'string', enum: ['person', 'preference', 'decision', 'fact', 'event', 'project', 'general'], description: 'Memory category' },
        importance: { type: 'number', minimum: 0, maximum: 1, description: 'Importance score 0-1' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for the memory' }
      },
      required: ['content']
    }
  },
  {
    name: 'memory_search',
    description: 'Search memories by keyword or phrase. Returns relevant stored memories.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        category: { type: 'string', description: 'Filter by category' },
        limit: { type: 'number', description: 'Max results (default 10)' }
      },
      required: ['query']
    }
  },
  {
    name: 'memory_forget',
    description: 'Delete a specific memory by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Memory ID to forget' }
      },
      required: ['id']
    }
  },
  {
    name: 'memory_extract',
    description: 'Automatically extract worth-remembering information from text.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to extract memories from' },
        source: { type: 'string', description: 'Source identifier' },
        auto_save: { type: 'boolean', description: 'Auto-save extracted memories (default false)' }
      },
      required: ['text']
    }
  },
  {
    name: 'memory_semantic_search',
    description: 'Semantic search — finds memories with similar meaning even if different words are used. Better than keyword search for natural language queries.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language query' },
        category: { type: 'string', description: 'Filter by category' },
        limit: { type: 'number', description: 'Max results (default 10)' },
        min_score: { type: 'number', description: 'Minimum similarity score 0-1 (default 0.05)' }
      },
      required: ['query']
    }
  },
  {
    name: 'memory_rebuild_index',
    description: 'Rebuild the semantic search vector index. Use after bulk imports or if search seems off.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'memory_stats',
    description: 'Get memory statistics.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'memory_auto',
    description: 'Automatically extract and save important memories from a conversation summary. Call this at the end of a conversation to persist key information. More convenient than manual memory_add — just pass in a summary and it handles extraction, categorization, and storage.',
    inputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Conversation summary or key points to extract memories from' },
        source: { type: 'string', description: 'Source identifier (e.g. "chat", "project-review")' }
      },
      required: ['summary']
    }
  }
];

function handleToolCall(name, args) {
  switch (name) {
    case 'memory_add': {
      const result = engine.add(args.content, {
        category: args.category || 'general',
        importance: args.importance || 0.5,
        tags: args.tags || []
      });
      return { content: [{ type: 'text', text: `Stored memory #${result.id}: "${result.content}" [${result.category}] importance:${result.importance}` }] };
    }
    case 'memory_search': {
      const results = engine.search(args.query, { limit: args.limit || 10, category: args.category });
      if (results.length === 0) return { content: [{ type: 'text', text: 'No memories found.' }] };
      const text = results.map(r => `[#${r.id}] (${r.category}, imp:${r.importance}) ${r.content}`).join('\n');
      return { content: [{ type: 'text', text: `Found ${results.length} memories:\n${text}` }] };
    }
    case 'memory_forget': {
      engine.forget(args.id);
      return { content: [{ type: 'text', text: `Forgot memory #${args.id}` }] };
    }
    case 'memory_extract': {
      const mems = extractMemories(args.text, args.source || 'extraction');
      if (args.auto_save) {
        for (const m of mems) engine.add(m.content, m);
      }
      const text = mems.map(m => `[${m.category}] imp:${m.importance} "${m.content}"`).join('\n');
      return { content: [{ type: 'text', text: mems.length > 0 ? `Extracted ${mems.length} memories${args.auto_save ? ' (saved)' : ''}:\n${text}` : 'No memorable content found.' }] };
    }
    case 'memory_semantic_search': {
      const results = engine.semanticSearch(args.query, {
        limit: args.limit || 10,
        category: args.category,
        minScore: args.min_score || 0.05
      });
      if (results.length === 0) return { content: [{ type: 'text', text: 'No semantically similar memories found.' }] };
      const text = results.map(r => `[#${r.id}] sim:${r.similarity} score:${r.score} (${r.category}) ${r.content}`).join('\n');
      return { content: [{ type: 'text', text: `Found ${results.length} similar memories:\n${text}` }] };
    }
    case 'memory_rebuild_index': {
      const count = engine.rebuildVectors();
      return { content: [{ type: 'text', text: `Rebuilt vector index for ${count} memories.` }] };
    }
    case 'memory_auto': {
      const mems = extractMemories(args.summary, args.source || 'auto');
      const saved = [];
      for (const m of mems) {
        const result = engine.add(m.content, m);
        saved.push(result);
      }
      if (saved.length === 0) {
        return { content: [{ type: 'text', text: 'No memorable content found in the summary.' }] };
      }
      const text = saved.map(s => `[#${s.id}] [${s.category}] imp:${s.importance} "${s.content}"`).join('\n');
      return { content: [{ type: 'text', text: `Auto-saved ${saved.length} memories:\n${text}` }] };
    }
    case 'memory_stats': {
      const s = engine.stats();
      return { content: [{ type: 'text', text: `Total: ${s.totalMemories} memories, ${s.totalEntities} entities\nBy category: ${s.byCategory.map(c => `${c.category}:${c.count}`).join(', ')}` }] };
    }
    default:
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  }
}

// JSON-RPC over stdio
function send(response) {
  const json = JSON.stringify(response);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
}

function handleMessage(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case 'initialize':
      send({ jsonrpc: '2.0', id, result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'aimemory', version: '0.1.0' }
      }});
      break;
    case 'tools/list':
      send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
      break;
    case 'tools/call':
      try {
        const result = handleToolCall(params.name, params.arguments || {});
        send({ jsonrpc: '2.0', id, result });
      } catch (e) {
        send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true } });
      }
      break;
    case 'notifications/initialized':
      break; // ack
    default:
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
}

// Proper Content-Length based stdio transport
let rawBuffer = Buffer.alloc(0);
let expectedLength = -1;

process.stdin.on('data', (chunk) => {
  rawBuffer = Buffer.concat([rawBuffer, chunk]);
  
  while (true) {
    if (expectedLength === -1) {
      // Look for Content-Length header
      const headerEnd = rawBuffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;
      const header = rawBuffer.slice(0, headerEnd).toString();
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) { rawBuffer = rawBuffer.slice(headerEnd + 4); continue; }
      expectedLength = parseInt(match[1], 10);
      rawBuffer = rawBuffer.slice(headerEnd + 4);
    }
    
    if (rawBuffer.length < expectedLength) break;
    
    const body = rawBuffer.slice(0, expectedLength).toString();
    rawBuffer = rawBuffer.slice(expectedLength);
    expectedLength = -1;
    
    try {
      const msg = JSON.parse(body);
      handleMessage(msg);
    } catch(e) {
      process.stderr.write(`Parse error: ${e.message}\n`);
    }
  }
});

process.stderr.write('aimemory MCP server started\n');
