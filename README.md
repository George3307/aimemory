# ✳️ aimemory

**让你的AI真正记住你。**

AI Agent 记忆服务 — 跨平台、跨模型、你完全掌控。

## 为什么需要这个？

ChatGPT、Claude等AI每次对话都从零开始。它们不记得你是谁、你喜欢什么、你做过什么决定。

aimemory 解决这个问题：
- 🧠 **智能记忆** — 自动从对话中提取值得记住的信息
- 🔍 **语义搜索** — 找到意思相近但用词不同的记忆（不只是关键词匹配）
- 📂 **分类管理** — 人物、偏好、决策、事件、知识自动归类
- ⏰ **记忆衰减** — 模拟人类遗忘曲线，重要的记得久，琐碎的会淡忘
- 🔌 **MCP协议** — 任何支持MCP的AI agent都能直接用
- 💰 **零成本** — 本地SQLite存储，纯JS零外部依赖

## 快速开始

```bash
# 添加记忆
aimem add "我在新加坡，喜欢搞数学和编程" --cat person --imp 0.8

# 关键词搜索
aimem search 新加坡

# 语义搜索（找意思相近的）
aimem search -s "怎么赚钱"

# 从文本自动提取记忆
aimem extract "今天决定做AI记忆项目，用MCP协议"

# 统计
aimem stats

# 应用记忆衰减
aimem decay
```

## MCP Server

让你的AI agent通过MCP协议访问记忆：

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

### 可用工具

| 工具 | 说明 |
|------|------|
| `memory_add` | 添加记忆 |
| `memory_search` | 关键词搜索 |
| `memory_semantic_search` | 语义搜索 |
| `memory_forget` | 删除记忆 |
| `memory_extract` | 从文本提取记忆 |
| `memory_rebuild_index` | 重建向量索引 |
| `memory_stats` | 统计信息 |

## 技术架构

```
CLI / MCP Server
      ↓
  MemoryEngine (memory.js)
   ├── 关键词搜索 (FTS5 + LIKE)
   ├── 语义搜索 (TF-IDF + 余弦相似度)
   ├── 记忆衰减 (遗忘曲线)
   └── 实体关系
      ↓
  SQLite (db.js)
```

- **语义搜索引擎**: 纯JS实现的TF-IDF + 余弦相似度，支持中英文双语
- **存储**: SQLite + FTS5全文搜索
- **零依赖**: 只用Node.js内置模块

## 数据存储

默认路径: `~/.aimemory/memories.db`

可通过环境变量修改:
```bash
export AIMEM_DB=/path/to/your/memories.db
```

## Roadmap

- [x] Phase 0: 核心引擎（存储+搜索+提取+衰减）
- [x] 语义搜索（TF-IDF）
- [x] MCP Server
- [ ] npm包发布
- [ ] Web Dashboard
- [ ] 真正的embedding模型（Phase 2）
- [ ] 云同步
- [ ] Chrome插件

## License

MIT
