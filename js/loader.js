import { state } from './state.js';

async function tryFetchJSON(url) {
  try {
    const res = await fetch(url);
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

export async function loadSubjects() {
  const res = await fetch('./data/subjects.json');
  if (!res.ok) throw new Error('subjects.json 加载失败');
  state.subjects = await res.json();
  return state.subjects;
}

export async function loadSubject(subjectId) {
  if (!state.subjects.length) await loadSubjects();

  const meta = state.subjects.find(s => s.id === subjectId);
  if (!meta) throw new Error(`未找到科目：${subjectId}`);

  const [chapters, questions, outline, syllabi, syllabusCoverage, questionCoverage, knowledge, cases] = await Promise.all([
    tryFetchJSON(`./data/${subjectId}/chapters.json`),
    tryFetchJSON(`./data/${subjectId}/questions.json`),
    tryFetchJSON(`./data/${subjectId}/outline.json`),
    tryFetchJSON(`./data/${subjectId}/syllabi.json`),
    tryFetchJSON(`./data/${subjectId}/syllabus-coverage.json`),
    tryFetchJSON(`./data/${subjectId}/question-coverage.json`),
    tryFetchJSON(`./data/${subjectId}/knowledge.json`),
    tryFetchJSON(`./data/${subjectId}/cases.json`)
  ]);

  state.subjectId = subjectId;
  state.subjectMeta = meta;
  state.chapters = chapters || [];
  state.questions = questions || [];
  state.outline = outline || null;
  state.syllabi = syllabi || null;
  state.syllabusCoverage = syllabusCoverage || null;
  state.questionCoverage = questionCoverage || null;
  state.knowledge = knowledge || [];
  state.cases = (cases && cases.papers) || [];

  return meta;
}

/**
 * 只要有任意一类数据存在，就认为该科目已可进入。
 * 只有完全空白（没有任何数据文件）时才显示占位页。
 */
export function hasContent() {
  return state.questions.length > 0
      || state.chapters.length > 0
      || state.knowledge.length > 0
      || state.cases.length > 0
      || !!state.syllabi
      || !!state.outline;
}

/**
 * 各模块的可用性判断
 */
export function moduleAvailability() {
  return {
    outline: !!state.outline || !!state.syllabi,
    study: state.knowledge.length > 0,
    practice: (state.questions.length > 0 || state.cases.length > 0) && state.chapters.length > 0,
    cases: state.cases.length > 0,
    wrong: state.questions.length > 0,
    favorites: state.questions.length > 0,
    stats: state.questions.length > 0
  };
}

export function chapterName(id) {
  const c = state.chapters.find(c => c.id === id);
  return c ? c.name : id;
}
