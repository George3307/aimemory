/**
 * aimemory - 记忆自动提取器
 * 从对话文本中自动提取值得记住的信息
 * 不依赖外部LLM，用规则+模式匹配
 */

// 分类规则 — 按优先级排序，靠前的优先匹配
// 每个分类带权重关键词：weight越高越能确定分类
const CATEGORY_RULES = [
  {
    name: 'decision',
    keywords: ['决定', '选择', '方案', '计划', '要做', '不做', '打算', '决心', 'decide', 'plan', 'chosen', 'will do'],
    weight: 2,
  },
  {
    name: 'project',
    keywords: ['项目', '开发', '发布', '上线', '部署', '代码', '版本', 'v1', 'v2', 'release', 'deploy', 'launch', 'build', 'project', 'repo'],
    weight: 2,
  },
  {
    name: 'preference',
    keywords: ['喜欢', '不想', '偏好', '习惯', '最爱', '讨厌', '倾向', '风格', 'prefer', 'like', 'hate', 'love', 'want', 'dislike', 'favorite'],
    weight: 2,
  },
  {
    name: 'fact',
    keywords: ['发现', '学到', '知道', '原来', '其实', '等于', '意味着', '定义', 'learned', 'found', 'means', 'is defined', 'turns out'],
    weight: 1.5,
  },
  {
    name: 'event',
    keywords: ['今天', '昨天', '明天', '上周', '下周', '发生', '完成', '开始', '结束', 'happened', 'done', 'started', 'finished', 'yesterday', 'today'],
    weight: 1.5,
  },
  {
    name: 'person',
    keywords: ['叫', '名字', '他是', '她是', '住在', '岁', '老师', '同事', '朋友', '老板', 'name is', 'lives in', 'works at'],
    weight: 1,
  },
];

// 重要性规则 — 根据内容信号词判断 importance 区间
const IMPORTANCE_RULES = [
  { keywords: ['重要', '关键', '决定', '必须', '紧急', '核心', 'critical', 'must', 'important', 'crucial'], range: [0.8, 0.9] },
  { keywords: ['项目', '发布', '上线', '部署', '版本', '里程碑', 'release', 'deploy', 'launch', 'milestone'], range: [0.7, 0.8] },
  { keywords: ['发现', '学到', '知道', '原来', '等于', 'learned', 'found out'], range: [0.5, 0.6] },
  { keywords: ['也许', '可能', '随便', '无所谓', '顺便', 'maybe', 'perhaps', 'whatever', 'minor'], range: [0.3, 0.4] },
];

// 拆分标记 — 这些连接词表示前后是独立信息
const SPLIT_MARKERS = /[，,;；](?:还有|另外|而且|同时|并且|以及|然后|接着|此外|also|and also|besides|moreover|plus)/;
// 也按逗号+较长子句拆分
const CLAUSE_SPLIT = /[，,;；]/;

/**
 * 将一句话拆成多个独立信息片段
 */
function splitIntoClauses(sentence) {
  // 先按明确的拆分标记拆
  if (SPLIT_MARKERS.test(sentence)) {
    return sentence
      .split(SPLIT_MARKERS)
      .map(s => s.trim())
      .filter(s => s.length > 5);
  }
  
  // 按逗号/分号拆，但只在子句够长时才拆（避免把短修饰语拆出来）
  const parts = sentence.split(CLAUSE_SPLIT).map(s => s.trim()).filter(s => s.length > 5);
  if (parts.length >= 2 && parts.every(p => p.length > 10)) {
    // 检查每个子句是否都像独立信息（至少匹配一个分类关键词）
    const independent = parts.filter(p => {
      const lower = p.toLowerCase();
      return CATEGORY_RULES.some(rule => rule.keywords.some(k => lower.includes(k)));
    });
    if (independent.length >= 2) return independent;
  }
  
  return [sentence];
}

/**
 * 从文本中提取记忆候选
 * @param {string} text - 对话文本
 * @param {string} source - 来源标识
 * @returns {Array<{content, category, importance, tags}>}
 */
export function extractMemories(text, source = 'conversation') {
  const memories = [];
  
  // 按句子分割（中英文标点）
  const sentences = text
    .split(/[。！？\n.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 5 && s.length < 500);

  for (const sentence of sentences) {
    // 尝试拆分成多个独立子句
    const clauses = splitIntoClauses(sentence);
    for (const clause of clauses) {
      const analysis = analyzeSentence(clause);
      if (analysis.worthRemembering) {
        memories.push({
          content: clause,
          category: analysis.category,
          importance: analysis.importance,
          tags: analysis.tags,
          source
        });
      }
    }
  }

  return dedup(memories);
}

function analyzeSentence(sentence) {
  const lower = sentence.toLowerCase();
  
  // 判断分类 — 按规则优先级，计算加权匹配分
  let category = 'general';
  let maxScore = 0;
  for (const rule of CATEGORY_RULES) {
    const hits = rule.keywords.filter(k => lower.includes(k)).length;
    const score = hits * rule.weight;
    if (score > maxScore) {
      maxScore = score;
      category = rule.name;
    }
  }
  
  // 日期模式也算 event
  if (category === 'general' && /\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(sentence)) {
    category = 'event';
    maxScore = Math.max(maxScore, 1);
  }
  // 包含中文人名模式（2-3个汉字+是/说/做等）也算 person
  if (category === 'general' && /[\u4e00-\u9fa5]{2,3}(?:是|说|做|在|去|来)/.test(sentence)) {
    category = 'person';
    maxScore = Math.max(maxScore, 1);
  }

  // 判断重要性 — 按规则匹配，取第一个命中的区间
  let importance = 0.5; // 默认普通事实
  let importanceSet = false;
  for (const rule of IMPORTANCE_RULES) {
    if (rule.keywords.some(k => lower.includes(k))) {
      const [lo, hi] = rule.range;
      // 在区间内根据匹配数量微调
      const hits = rule.keywords.filter(k => lower.includes(k)).length;
      importance = Math.min(hi, lo + (hi - lo) * Math.min(hits / 3, 1));
      importanceSet = true;
      break;
    }
  }
  
  // 包含数字/日期/金额通常更重要
  if (/\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(sentence)) importance = Math.max(importance, 0.7);
  if (/\$[\d,]+|\d+[万亿k]/.test(lower)) importance = Math.max(importance, 0.7);
  
  // 没有匹配任何重要性规则且没有分类匹配 → 日常琐事
  if (!importanceSet && maxScore === 0) importance = 0.35;
  
  // 太短的句子不太值得记
  const worthRemembering = sentence.length > 10 && (maxScore > 0 || importance > 0.5);

  // 提取标签
  const tags = [];
  if (/[A-Z][a-z]+(?:\s[A-Z][a-z]+)*/.test(sentence)) {
    const names = sentence.match(/[A-Z][a-z]+(?:\s[A-Z][a-z]+)*/g);
    if (names) tags.push(...names.slice(0, 3));
  }

  return { category, importance, worthRemembering, tags };
}

function dedup(memories) {
  const seen = new Set();
  return memories.filter(m => {
    const key = m.content.slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 从对话历史中批量提取
 * @param {Array<{role, content}>} messages
 */
export function extractFromConversation(messages, source = 'chat') {
  const allMemories = [];
  
  for (const msg of messages) {
    if (msg.role === 'user') {
      // 用户说的话更值得记
      const mems = extractMemories(msg.content, source);
      mems.forEach(m => m.importance = Math.min(1, m.importance + 0.1));
      allMemories.push(...mems);
    } else if (msg.role === 'assistant') {
      // AI的回答中的事实/决定也记
      const mems = extractMemories(msg.content, source);
      allMemories.push(...mems);
    }
  }

  return dedup(allMemories);
}
