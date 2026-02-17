/**
 * aimemory - 记忆自动提取器
 * 从对话文本中自动提取值得记住的信息
 * 不依赖外部LLM，用规则+模式匹配
 */

// 记忆分类
const CATEGORIES = {
  person: ['叫', '名字', '住在', '在', '岁', '喜欢', '不喜欢', '擅长', '工作', 'name', 'lives', 'age', 'likes'],
  preference: ['喜欢', '偏好', '最爱', '讨厌', '不想', '想要', 'prefer', 'like', 'hate', 'want', 'love'],
  decision: ['决定', '选择', '计划', '要做', '不做', 'decide', 'plan', 'will', 'chosen'],
  fact: ['是', '等于', '意味着', '定义', 'is', 'means', 'equals', 'defined'],
  event: ['发生', '完成', '开始', '结束', '今天', '昨天', 'happened', 'done', 'started', 'finished'],
  project: ['项目', '开发', '代码', '部署', '上线', 'project', 'build', 'deploy', 'launch', 'release'],
};

// 重要性信号词
const HIGH_IMPORTANCE = ['重要', '记住', '别忘', '关键', '必须', 'important', 'remember', 'must', 'critical', 'key'];
const LOW_IMPORTANCE = ['也许', '可能', '随便', '无所谓', 'maybe', 'perhaps', 'whatever', 'minor'];

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
    const analysis = analyzeSentence(sentence);
    if (analysis.worthRemembering) {
      memories.push({
        content: sentence,
        category: analysis.category,
        importance: analysis.importance,
        tags: analysis.tags,
        source
      });
    }
  }

  return dedup(memories);
}

function analyzeSentence(sentence) {
  const lower = sentence.toLowerCase();
  
  // 判断分类
  let category = 'general';
  let maxScore = 0;
  for (const [cat, keywords] of Object.entries(CATEGORIES)) {
    const score = keywords.filter(k => lower.includes(k)).length;
    if (score > maxScore) {
      maxScore = score;
      category = cat;
    }
  }

  // 判断重要性
  let importance = 0.5;
  if (HIGH_IMPORTANCE.some(w => lower.includes(w))) importance = 0.8;
  if (LOW_IMPORTANCE.some(w => lower.includes(w))) importance = 0.3;
  
  // 包含数字/日期/名字通常更重要
  if (/\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(sentence)) importance = Math.max(importance, 0.7);
  if (/\$[\d,]+|\d+[万亿k]/.test(lower)) importance = Math.max(importance, 0.7);
  
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
