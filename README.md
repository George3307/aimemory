# ✳️ aimemory

**Give your AI a real memory.**

AI Agent Memory Service — cross-platform, model-agnostic, fully under your control.

## Why?

ChatGPT, Claude, Gemini — they all start from scratch every conversation. They don't remember who you are, what you prefer, or what decisions you've made.

aimemory fixes that:
- 🧠 **Smart extraction** — automatically picks out worth-remembering info from conversations
- 🔍 **Semantic search** — finds memories by meaning, not just keywords (powered by Gemini embeddings + TF-IDF fallback)
- 📂 **Auto-categorization** — people, preferences, decisions, events, knowledge
- ⏰ **Memory decay** — simulates human forgetting curves: important things stick, trivial things fade
- 🔌 **MCP protocol** — any MCP-compatible AI agent can use it directly
- 🌍 **Bilingual** — full Chinese + English support, cross-language search
- 💰 **Zero cost** — local SQLite storage, zero npm dependencies

## Quick Start

```bash
# Add a memory
aimem add "User prefers dark mode and minimal UI" --cat preference --imp 0.8

# Keyword search
aimem search "dark mode"

# Semantic search (finds related meanings)
aimem search -s "what does the user like"

# Export all memories
aimem export backup.json

# Import memories
aimem import backup.json

# Stats
aimem stats

# Apply memory decay
aimem decay
```

## MCP Server

Let any AI agent access memories via MCP protocol:

```json
{
  "mcpServers": {
    "aimemory": {
      "command": "node",
      "args": ["path/to/aimemory/src/mcp-server.js"]
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `memory_add` | Store a new memory |
| `memory_search` | Keyword search |
| `memory_semantic_search` | Semantic similarity search |
| `memory_forget` | Delete a memory |
| `memory_extract` | Auto-extract memories from text |
| `memory_rebuild_index` | Rebuild vector index |
| `memory_stats` | Get statistics |

## Architecture

```
CLI / MCP Server
      ↓
  MemoryEngine (memory.js)
   ├── Keyword search (FTS5 + LIKE)
   ├── Semantic search (Gemini embedding + TF-IDF fallback)
   ├── Memory decay (forgetting curve)
   └── Entity relations
      ↓
  SQLite (db.js)
```

### Dual Search Engine
- **Gemini embedding** (3072-dim) — real semantic understanding, cross-language
- **TF-IDF fallback** — zero-dependency, works offline
- Gemini is used when API key is available; TF-IDF kicks in automatically otherwise

### Zero Dependencies
Only uses Node.js built-in modules. No `node_modules` needed for core functionality.

## Data Storage

Default: `~/.aimemory/memories.db`

Override with:
```bash
export AIMEM_DB=/path/to/your/memories.db
```

## Roadmap

- [x] Core engine (storage + search + extraction + decay)
- [x] Semantic search (dual engine)
- [x] MCP Server
- [x] CLI with export/import
- [ ] npm package publish
- [ ] Web Dashboard
- [ ] Cloud sync
- [ ] Chrome extension
- [ ] Obsidian plugin

## License

MIT

---

# 中文说明

**让你的AI真正记住你。**

AI Agent 记忆服务 — 跨平台、跨模型、你完全掌控。

### 功能

- 🧠 智能记忆提取 — 自动从对话中抽取值得记住的信息
- 🔍 语义搜索 — 双引擎：Gemini embedding（跨语言）+ TF-IDF（离线兜底）
- 📂 自动分类 — 人物、偏好、决策、事件、知识
- ⏰ 记忆衰减 — 模拟人类遗忘曲线
- 🔌 MCP协议 — 任何支持MCP的AI agent都能接入
- 💰 零成本 — 本地SQLite，零外部依赖

### 快速使用

```bash
aimem add "用户喜欢简洁的UI" --cat preference --imp 0.8
aimem search -s "用户喜欢什么"
aimem export backup.json
aimem import backup.json
```

详细用法见上方英文文档。
