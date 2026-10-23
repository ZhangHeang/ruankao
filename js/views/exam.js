import { state, resetExam } from '../state.js';
import { loadSubject } from '../loader.js';
import { renderTopbar } from '../components/topbar.js';
import { renderQCard } from '../components/qcard.js';
import { renderSheet } from '../components/sheet.js';
import { renderProgress } from '../components/progress.js';
import {
  loadFavorites, saveFavorites, loadProgress, saveProgress, clearProgress,
  loadStats, saveStats, recordWrong, recordCorrect, loadWrong, loadAnsweredQuestionIds,
  recordAnsweredQuestions
} from '../storage.js';
import { fmtTime, isDisputed, shuffle } from '../utils.js';
import { renderResult } from './result.js';

let currentPoolKey = null;
let poolNotice = '';

export async function renderPractice(subjectId, mode = 'exam', query = {}) {
  if (state.subjectId !== subjectId || !state.questions.length) {
    await loadSubject(subjectId);
  }
  const bank = query.bank || '';
  const knowledgeIds = String(query.knowledge || '').split(',').filter(Boolean);
  const poolKey = [subjectId, mode, query.kind, bank, query.paper, query.chapter,
    query.knowledge, query.type, query.count, query.question, query.scope].map(item => item || '').join(':');
  if (!state.pool.length || state.submitted || currentPoolKey !== poolKey) {
    resetExam();
    state.mode = mode;
    let baseQuestions = [...state.questions];
    if (query.question) {
      baseQuestions = baseQuestions.filter(question => question.id === query.question);
    } else {
      if (query.kind === 'simulation') baseQuestions = baseQuestions.filter(question => !isDisputed(question));
      if (bank) baseQuestions = baseQuestions.filter(question => question.bankType === bank);
      if (query.paper) baseQuestions = baseQuestions.filter(question => question.paperId === query.paper);
      if (query.chapter) baseQuestions = baseQuestions.filter(question => question.chapterId === query.chapter);
      if (knowledgeIds.length) {
        baseQuestions = baseQuestions.filter(question =>
          knowledgeIds.some(id => question.knowledgeIds?.includes(id))
        );
      }
      if (query.type) baseQuestions = baseQuestions.filter(question => question.type === query.type);
    }

    let candidates = baseQuestions;
    if (!query.question) {
      if (query.scope === 'undone') {
        const answered = loadAnsweredQuestionIds(subjectId);
        candidates = candidates.filter(question => !answered.has(question.id));
      } else if (query.scope === 'wrong') {
        const wrong = new Set(Object.keys(loadWrong(subjectId)));
        candidates = candidates.filter(question => wrong.has(question.id));
      } else if (query.scope === 'favorite') {
        const favorites = loadFavorites(subjectId);
        candidates = candidates.filter(question => favorites.has(question.id));
      }
    }

    const saved = loadProgress(subjectId, poolKey);
    const requestedCount = query.count === 'all'
      ? baseQuestions.length
      : Number.parseInt(query.count, 10);
    const targetCount = query.kind === 'simulation' ? 75 : requestedCount;
    const expectedSavedCount = Number.isFinite(targetCount) && targetCount > 0
      ? Math.min(targetCount, baseQuestions.length)
      : baseQuestions.length;

    // 同一练习链接再次进入时，先按保存的题号恢复原题集；只有无法恢复时才重新抽题。
    // “未做/错题/收藏”是抽题时的筛选条件，不应把本次练习中已作答的题从已保存题集中剔除。
    const savedIds = Array.isArray(saved?.poolIds) ? saved.poolIds.filter(id => typeof id === 'string' && id) : [];
    const baseById = new Map(baseQuestions.map(question => [question.id, question]));
    const restored = savedIds.map(id => baseById.get(id));
    const restoredPool = savedIds.length
      && new Set(savedIds).size === savedIds.length
      && restored.every(Boolean)
      && restored.length === expectedSavedCount
      ? restored
      : null;

    const preserveOrder = query.kind === 'past' && Boolean(query.paper);
    let questions;
    if (restoredPool) {
      questions = restoredPool;
    } else {
      questions = preserveOrder
        ? [...candidates].sort((left, right) => (left.questionNo || 0) - (right.questionNo || 0))
        : shuffle(candidates);
      if (Number.isFinite(targetCount) && targetCount > 0) questions = questions.slice(0, targetCount);
    }

    poolNotice = '';
    if (query.kind === 'simulation' && questions.length < 75) {
      poolNotice = `当前筛选后仅有 ${questions.length} 题，不足 75 题。系统未重复抽题，也不能构成标准模拟考试；请返回练习中心调整题目来源。`;
    }
    state.pool = questions;
    currentPoolKey = poolKey;
    if (!state.pool.length) {
      document.getElementById('app').innerHTML = `
        ${renderTopbar('practice')}
        <main><div class="panel"><h3>暂无关联题目</h3><p>当前筛选条件没有可用题目，请返回练习中心调整条件。</p><p><a class="btn primary" href="#/${subjectId}/practice">返回练习中心</a></p></div></main>`;
      return;
    }
    state.answers = restoredPool ? saved?.answers || {} : {};
    state.revealed = restoredPool ? saved?.revealed || {} : {};
    state.index = restoredPool
      ? Math.min(Math.max(saved?.index || 0, 0), state.pool.length - 1)
      : 0;
    state.startAt = restoredPool && saved?.startAt ? saved.startAt : Date.now();
    persistExamProgress();
    startTimer();
  }
  drawExam();
  bindExam();
}

function drawExam() {
  const q = state.pool[state.index];
  const total = state.pool.length;
  const userAns = state.answers[q.id] || [];
  const revealed = state.mode === 'practice' && state.revealed[q.id];
  const isFav = loadFavorites(state.subjectId).has(q.id);

  const app = document.getElementById('app');
  app.innerHTML = `
    ${renderTopbar('practice')}
    <main>
      ${poolNotice ? `<div class="practice-warning">${poolNotice}</div>` : ''}
      <div class="exam-meta">
        <span>${sessionTitle()}</span>
        <span>${state.index + 1} / ${total}</span>
        <span id="timer">00:00</span>
      </div>
      ${renderProgress(state.index + 1, total)}
      <div class="exam-body">
        <article class="qcard" id="qcard">
          ${renderQCard(q, userAns, revealed, state.index, total, isFav)}
          ${state.mode === 'practice' && q.type === 'multi' && !revealed
            ? '<button class="btn primary practice-check" id="checkBtn">提交答案</button>'
            : ''}
          <div class="q-nav">
            <button class="btn" id="prevBtn" ${state.index === 0 ? 'disabled' : ''}>← 上一题</button>
            <span class="nav-info">${state.index + 1} / ${total}</span>
            <button class="btn primary" id="nextBtn">
              ${state.index === total - 1 ? '交卷' : '下一题 →'}
            </button>
          </div>
        </article>
        <aside class="sheet">
          <h4>答题卡</h4>
          <div class="sheet-grid" id="sheet">${renderSheet(state.pool, state.answers, state.index, state.submitted)}</div>
          <button class="btn primary block" id="submitBtn">交卷</button>
        </aside>
      </div>
    </main>
  `;
  updateTimer();
}

function sessionTitle() {
  if (currentPoolKey?.includes(':past:')) return state.mode === 'exam' ? '历年真题 · 考试模式' : '历年真题 · 逐题解析';
  if (currentPoolKey?.includes(':simulation:')) return '75 题模拟考试';
  return state.mode === 'exam' ? '专项练习 · 统一交卷' : '专项练习 · 逐题解析';
}

function bindExam() {
  const q = state.pool[state.index];

  // 收藏按钮
  document.getElementById('favBtn')?.addEventListener('click', e => {
    const favSet = loadFavorites(state.subjectId);
    if (favSet.has(q.id)) favSet.delete(q.id);
    else favSet.add(q.id);
    saveFavorites(state.subjectId, favSet);
    const active = favSet.has(q.id);
    e.currentTarget.classList.toggle('active', active);
    e.currentTarget.textContent = active ? '★' : '☆';
    e.currentTarget.title = active ? '取消收藏' : '收藏';
  });

  // 选项
  document.querySelectorAll('#qcard .option input').forEach(inp => {
    inp.addEventListener('change', e => {
      const i = parseInt(e.target.closest('.option').dataset.i, 10);
      if (state.mode === 'practice' && state.revealed[q.id]) return;
      let cur = state.answers[q.id] ? [...state.answers[q.id]] : [];
      if (q.type === 'multi') {
        if (e.target.checked) { if (!cur.includes(i)) cur.push(i); }
        else cur = cur.filter(x => x !== i);
      } else {
        cur = e.target.checked ? [i] : [];
      }
      state.answers[q.id] = cur;

      if (state.mode === 'practice' && q.type === 'single' && cur.length === 1) {
        gradePracticeQuestion(q);
        drawExam(); bindExam();
      } else if (q.type === 'single' && state.autoNext && cur.length === 1 && state.index < state.pool.length - 1) {
        persistExamProgress();
        setTimeout(goNext, 150);
      } else {
        persistExamProgress();
        drawExam(); bindExam();
      }
    });
  });

  document.getElementById('checkBtn')?.addEventListener('click', () => {
    if (!(state.answers[q.id] || []).length) {
      alert('请先选择答案。');
      return;
    }
    gradePracticeQuestion(q);
    drawExam(); bindExam();
  });

  document.getElementById('prevBtn').addEventListener('click', goPrev);
  document.getElementById('nextBtn').addEventListener('click', () => {
    if (state.index === state.pool.length - 1) submitExam();
    else goNext();
  });
  document.getElementById('submitBtn').addEventListener('click', submitExam);

  document.querySelectorAll('#sheet .sheet-item').forEach(b => {
    b.addEventListener('click', () => {
      state.index = parseInt(b.dataset.i, 10);
      drawExam(); bindExam();
    });
  });
}

function goNext() {
  if (state.index < state.pool.length - 1) {
    state.index++;
    persistExamProgress();
    drawExam(); bindExam();
    document.getElementById('qcard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
function goPrev() {
  if (state.index > 0) {
    state.index--;
    persistExamProgress();
    drawExam(); bindExam();
    document.getElementById('qcard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function submitExam() {
  if (state.submitted) return;
  const unanswered = state.pool.filter(q => !(state.answers[q.id] || []).length).length;
  if (unanswered > 0 && !confirm(`还有 ${unanswered} 题未作答，确定交卷吗？`)) return;
  // 交卷会删除临时进度；先把本题集里实际选过答案的题号写入持久记录，
  // 否则“未做”筛选会把刚交卷的题重新当成未做。
  const answeredIds = Object.keys(state.answers)
    .filter(id => Array.isArray(state.answers[id]) && state.answers[id].length);
  recordAnsweredQuestions(state.subjectId, answeredIds);
  state.submitted = true;
  stopTimer();
  clearProgress(state.subjectId, currentPoolKey);
  renderResult();
}

function gradePracticeQuestion(question) {
  if (state.revealed[question.id]) return;
  const selected = state.answers[question.id] || [];
  if (!selected.length) return;
  state.revealed[question.id] = true;
  if (isDisputed(question)) {
    persistExamProgress();
    return;
  }
  const correct = [...selected].sort().join(',') === [...question.answer].sort().join(',');
  if (correct) recordCorrect(state.subjectId, question.id);
  else recordWrong(state.subjectId, question.id);
  const stats = loadStats(state.subjectId);
  stats.done = Number(stats.done) || 0;
  stats.correct = Number(stats.correct) || 0;
  stats.byChapter ||= {};
  stats.done++;
  if (correct) stats.correct++;
  if (!stats.byChapter[question.chapterId]) stats.byChapter[question.chapterId] = { done: 0, correct: 0 };
  stats.byChapter[question.chapterId].done = (Number(stats.byChapter[question.chapterId].done) || 0) + 1;
  if (correct) stats.byChapter[question.chapterId].correct = (Number(stats.byChapter[question.chapterId].correct) || 0) + 1;
  saveStats(state.subjectId, stats);
  persistExamProgress();
}

function persistExamProgress() {
  if (!currentPoolKey || !state.pool.length || state.submitted) return;
  saveProgress(state.subjectId, currentPoolKey, {
    poolIds: state.pool.map(question => question.id),
    answers: state.answers,
    revealed: state.revealed,
    index: state.index,
    startAt: state.startAt,
  });
}

function startTimer() {
  stopTimer();
  state.timerId = setInterval(updateTimer, 1000);
}
function stopTimer() {
  if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
}
function updateTimer() {
  const el = document.getElementById('timer');
  if (!el) return;
  el.textContent = fmtTime(Math.floor((Date.now() - state.startAt) / 1000));
}

/* 键盘快捷键 */
document.addEventListener('keydown', e => {
  if (!document.getElementById('qcard')) return;
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
  if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
});
