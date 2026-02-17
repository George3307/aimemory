# aimemory 开发进度

## 项目位置
- 代码: `/home/e/.openclaw/workspace/aimemory/`
- 源码: `aimemory/src/`
- 计划: `/home/e/.openclaw/workspace/memory/project-memory-service.md`

## 文件说明
| 文件 | 作用 | 状态 |
|------|------|------|
| `src/db.js` | SQLite数据库层（含向量表） | ✅ 完成 |
| `src/memory.js` | 记忆引擎（增删改查+衰减+语义搜索） | ✅ 完成 |
| `src/embedding.js` | TF-IDF向量引擎（中英文双语） | ✅ 完成 |
| `src/extractor.js` | 对话记忆提取器 | ✅ 完成 |
| `src/cli.js` | CLI工具（含语义搜索） | ✅ 完成 |
| `src/mcp-server.js` | MCP协议服务端 | 🔨 骨架 |
| `src/test.js` | 基础测试 | ✅ 通过 |
| `src/test-semantic.js` | 语义搜索测试 | ✅ 通过 |

## 语义搜索实现 (2026-02-17)

### 已完成
1. ✅ `embedding.js` — TF-IDF + 余弦相似度，纯JS零依赖
   - 中文：单字 + bigram分词
   - 英文：小写+去停用词
   - 中英文停用词表
   - 序列化/反序列化支持持久化
2. ✅ `db.js` — 新增 `memory_vectors` 和 `tfidf_index` 表
3. ✅ `memory.js` — 新增 `semanticSearch()` 和 `rebuildVectors()`
   - 添加记忆时自动向量化
   - 搜索时结合相似度×重要性×衰减评分
4. ✅ CLI — `aimem search -s <query>` 语义搜索

### 已知局限
- TF-IDF不懂同义词（"赚钱"≠"收入"），这是固有限制
- 跨语言搜索不行（英文查中文）
- **Phase 2解决方案：** 换成真正的embedding模型API（OpenAI/本地模型）

### 下一步
- [ ] 同义词表增强（手工补常见同义词对，提升召回率）
- [ ] CLI完善（export/import命令）
- [ ] MCP Server接入语义搜索
- [ ] README.md + 准备开源

## 2026-02-17 12:22 更新
- MCP Server已接入语义搜索（memory_semantic_search + memory_rebuild_index）
- 加了同义词扩展表，"赚钱"能找到"被动收入"了
- README.md 写好了
- 全部测试通过
- 下一步：CLI加export/import，准备npm发布

## 2026-02-17 12:48 更新
- 🚀 接入Gemini embedding（gemini-embedding-001，3072维）
- 新增 `gemini-embedding.js`（单条+批量embedding，base64序列化）
- `memory.js` 新增 `addAsync`、`semanticSearchAsync`、`rebuildVectorsAsync`
- 双引擎架构：Gemini优先，TF-IDF兜底（离线也能用）
- 测试结果：Gemini碾压TF-IDF，跨语言搜索直接能用
- db.js新增 `memory_dense_vectors` 表

## Phase 0 进度：~90%
