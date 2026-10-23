const K = {
  wrong: id => `ruankao_wrong_${id}`,
  fav:   id => `ruankao_fav_${id}`,
  stats: id => `ruankao_stats_${id}`,
  study: id => `ruankao_study_${id}`,
  progress: (id, mode) => `ruankao_progress_${id}_${mode}`,
  answered: id => `ruankao_answered_${id}`
};

function readJSON(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v == null ? fallback : v;
  } catch { return fallback; }
}
function writeJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

/* 错题 */
export function loadWrong(subjectId) {
  const raw = readJSON(K.wrong(subjectId), {});
  if (Array.isArray(raw)) {
    const obj = {};
    raw.forEach(id => { obj[id] = { count: 1, lastWrong: 0 }; });
    return obj;
  }
  return raw;
}
export function saveWrong(subjectId, obj) { writeJSON(K.wrong(subjectId), obj); }

export function recordWrong(subjectId, qid) {
  const map = loadWrong(subjectId);
  if (!map[qid]) map[qid] = { count: 0, lastWrong: 0 };
  map[qid].count++;
  map[qid].lastWrong = Date.now();
  saveWrong(subjectId, map);
  return map[qid].count;
}
export function recordCorrect(subjectId, qid) {
  const map = loadWrong(subjectId);
  if (!map[qid]) return true;
  map[qid].count--;
  if (map[qid].count <= 0) {
    delete map[qid];
    saveWrong(subjectId, map);
    return true;
  }
  saveWrong(subjectId, map);
  return false;
}
export function wrongCount(subjectId) {
  return Object.keys(loadWrong(subjectId)).length;
}

/* 收藏 */
export function loadFavorites(subjectId) {
  return new Set(readJSON(K.fav(subjectId), []));
}
export function saveFavorites(subjectId, set) {
  writeJSON(K.fav(subjectId), [...set]);
}

/* 统计 */
export function loadStats(subjectId) {
  return readJSON(K.stats(subjectId), { done: 0, correct: 0, byChapter: {} });
}
export function saveStats(subjectId, s) { writeJSON(K.stats(subjectId), s); }

/* 学习进度（已读知识点） */
export function loadStudyProgress(subjectId) {
  return readJSON(K.study(subjectId), { readIds: [], lastId: null });
}
export function saveStudyProgress(subjectId, data) {
  writeJSON(K.study(subjectId), data);
}

/* 答题进度（暂时保留接口） */
export function loadProgress(subjectId, mode) {
  return readJSON(K.progress(subjectId, mode), null);
}
export function saveProgress(subjectId, mode, data) {
  writeJSON(K.progress(subjectId, mode), data);
}
export function clearProgress(subjectId, mode) {
  try { localStorage.removeItem(K.progress(subjectId, mode)); } catch {}
}

/**
 * 已作答题目：持久记录 ∪ 当前练习进度。
 * 交卷会删除临时进度，因此交卷前必须先把已作答题目写入持久记录；
 * 学习页随堂练习等仍写入 progress 的入口也继续计入“已做”。
 */
export function recordAnsweredQuestions(subjectId, questionIds) {
  const ids = loadAnsweredQuestionIds(subjectId);
  let added = 0;
  (questionIds || []).forEach(id => {
    if (typeof id === 'string' && id) {
      if (!ids.has(id)) added++;
      ids.add(id);
    }
  });
  // 交卷时答题记录已存在于临时进度中，added 可能为 0；只要本次有待持久化的题号就必须落盘。
  if (added || (questionIds || []).some(id => typeof id === 'string' && id)) {
    try { localStorage.setItem(K.answered(subjectId), JSON.stringify([...ids].sort())); } catch {}
  }
  return ids;
}

export function loadAnsweredQuestionIds(subjectId) {
  const ids = new Set();
  const persisted = readJSON(K.answered(subjectId), []);
  if (Array.isArray(persisted)) {
    persisted.forEach(id => {
      if (typeof id === 'string' && id) ids.add(id);
    });
  }
  const prefix = K.progress(subjectId, '');
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const saved = readJSON(key, null);
      Object.entries(saved?.answers || {}).forEach(([questionId, answer]) => {
        if (Array.isArray(answer) && answer.length) ids.add(questionId);
      });
    }
  } catch { /* storage enumeration may be unavailable */ }
  return ids;
}

/** 案例分析草稿键。案例分析没有自动判分，未做以“是否保存过草稿”判断。 */
export function caseDraftPrefix(subjectId, paperId, caseNo) {
  return `case-draft:${subjectId}:${paperId}:${caseNo}:`;
}

export function loadCaseDraftKeys(subjectId) {
  const keys = new Set();
  const prefix = `case-draft:${subjectId}:`;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) keys.add(key);
    }
  } catch { /* storage enumeration may be unavailable */ }
  return keys;
}