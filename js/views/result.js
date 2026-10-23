import { state, resetExam } from '../state.js';
import { renderTopbar } from '../components/topbar.js';
import { loadWrong, saveWrong, loadStats, saveStats } from '../storage.js';
import { isCorrect, isDisputed, fmtTime, LETTERS, escapeHtml } from '../utils.js';
import { renderQuestionMedia } from '../components/qcard.js';

export function renderResult() {
  const subjectId = state.subjectId;
  const used = Math.floor((Date.now() - state.startAt) / 1000);
  const wrongMap = loadWrong(subjectId);
  const stats = loadStats(subjectId);
  stats.done = Number(stats.done) || 0;
  stats.correct = Number(stats.correct) || 0;
  stats.byChapter ||= {};

  let correct = 0;
  state.pool.forEach(q => {
    if (isDisputed(q)) return;
    const ok = isCorrect(q, state.answers[q.id]);

    if (ok) correct++;
    if (!state.revealed[q.id]) {
      if (ok) {
        if (wrongMap[q.id]) {
          wrongMap[q.id].count--;
          if (wrongMap[q.id].count <= 0) delete wrongMap[q.id];
        }
      } else {
        if (!wrongMap[q.id]) wrongMap[q.id] = { count: 0, lastWrong: 0 };
        wrongMap[q.id].count++;
        wrongMap[q.id].lastWrong = Date.now();
      }

      stats.done = (Number(stats.done) || 0) + 1;
      if (ok) stats.correct = (Number(stats.correct) || 0) + 1;
      if (!stats.byChapter[q.chapterId]) stats.byChapter[q.chapterId] = { done: 0, correct: 0 };
      stats.byChapter[q.chapterId].done = (Number(stats.byChapter[q.chapterId].done) || 0) + 1;
      if (ok) stats.byChapter[q.chapterId].correct = (Number(stats.byChapter[q.chapterId].correct) || 0) + 1;
    }
  });

  saveWrong(subjectId, wrongMap);
  saveStats(subjectId, stats);

  const total = state.pool.filter(q => !isDisputed(q)).length;
  const disputedCount = state.pool.length - total;
  const rate = total ? Math.round(correct / total * 100) : 0;

  const review = state.pool.map((q, i) => {
    const ans = state.answers[q.id] || [];
    const disputed = isDisputed(q);
    const ok = isCorrect(q, ans);
    const wrongInfo = wrongMap[q.id];
    const countBadge = !disputed && !ok && wrongInfo
      ? `<span class="rv-count">错 ${wrongInfo.count} 次</span>` : '';

    return `<details class="review-item ${disputed ? '' : ok ? 'ok' : 'bad'}">
        <summary>
          <span class="rv-idx">${i + 1}</span>
          <span class="rv-stem">${escapeHtml(q.stem)}</span>
          ${countBadge}
          <span class="rv-badge">${disputed ? '争议 · 不计分' : ok ? '正确' : '错误'}</span>
        </summary>
        <div class="rv-body">
          <p><strong>题目：</strong>${escapeHtml(q.stem)}</p>
          ${renderQuestionMedia(q, 'stem')}
          <div class="rv-options"><strong>选项：</strong>${q.options.map((o, j) =>
            `<div>${LETTERS[j]}. ${escapeHtml(o)}${renderQuestionMedia(q, 'option', j)}</div>`).join('')}</div>
          <p><strong>你的答案：</strong>${ans.length
            ? ans.map(j => LETTERS[j]).join('、') : '未作答'}</p>
          <p><strong>${disputed ? '来源参考答案' : '正确答案'}：</strong>${q.answer.map(j => LETTERS[j]).join('、')}</p>
          <p><strong>解析：</strong>${escapeHtml(q.analysis)}</p>
          ${renderQuestionMedia(q, 'analysis')}
        </div>
      </details>`;
  }).join('');

  document.getElementById('app').innerHTML = `
    ${renderTopbar('practice')}
    <main>
      <div class="panel">
        <div class="result-grid">
          <div class="stat-big"><div class="stat-num">${total ? `${rate}<span>%</span>` : '—'}</div><div class="stat-label">正确率</div></div>
          <div class="stat-big"><div class="stat-num">${correct}<span>/${total}</span></div><div class="stat-label">答对</div></div>
          <div class="stat-big"><div class="stat-num">${total - correct}</div><div class="stat-label">答错</div></div>
          <div class="stat-big"><div class="stat-num">${fmtTime(used)}</div><div class="stat-label">用时</div></div>
        </div>
        ${disputedCount ? `<p class="result-disputed">${disputedCount} 道争议题仅展示来源参考答案，不计入成绩或错题。</p>` : ''}
        <div class="actions" style="justify-content:center;margin-top:18px">
          <a class="btn primary" href="${escapeHtml(location.hash)}" id="againBtn">再来一组</a>
          <a class="btn" href="#/${subjectId}/wrong">查看错题</a>
          <a class="btn" href="#/${subjectId}">返回概览</a>
        </div>
      </div>
      <div class="panel">
        <h3>逐题解析</h3>
        ${review}
      </div>
    </main>
  `;

  document.getElementById('againBtn')?.addEventListener('click', event => {
    event.preventDefault();
    resetExam();
    const [path, query = ''] = location.hash.split('?');
    const params = new URLSearchParams(query);
    params.set('run', Date.now());
    location.hash = `${path}?${params}`;
  });
}
