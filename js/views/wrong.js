import { state } from '../state.js';
import { escapeHtml, LETTERS } from '../utils.js';
import { loadSubject, chapterName } from '../loader.js';
import { renderTopbar } from '../components/topbar.js';
import { renderQuestionFigure, renderQuestionMedia } from '../components/qcard.js';
import { loadWrong, saveWrong } from '../storage.js';

export async function renderWrong(subjectId) {
  if (state.subjectId !== subjectId || !state.questions.length) {
    await loadSubject(subjectId);
  }

  const wrongMap = loadWrong(subjectId);
  const list = state.questions
    .filter(q => wrongMap[q.id])
    .map(q => ({ q, count: wrongMap[q.id].count, lastWrong: wrongMap[q.id].lastWrong }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;   // 错误次数多的在前
      return (b.lastWrong || 0) - (a.lastWrong || 0);      // 最近出错的在前
    });

  const items = list.length ? list.map(({ q, count }, i) => `
    <div class="wrong-item">
      <div class="w-idx">${i + 1}</div>
      <div class="w-body">
        <div class="w-head">
          <span class="w-tag">${escapeHtml(chapterName(q.chapterId))}</span>
          <span class="w-count">错 ${count} 次</span>
        </div>
        <div class="w-stem">${escapeHtml(q.stem)}</div>
        ${renderQuestionFigure(q)}
        <div class="w-options">
          ${q.options.map((opt, j) => {
            const isAns = q.answer.includes(j);
            return `<div class="w-opt ${isAns ? 'right' : ''}">
                <span class="w-letter">${LETTERS[j]}</span>
                <div class="w-text">${escapeHtml(opt)}${renderQuestionMedia(q, 'option', j)}</div>
              </div>`;
          }).join('')}
        </div>
        <div class="w-analysis"><strong>解析：</strong>${escapeHtml(q.analysis)}${renderQuestionMedia(q, 'analysis')}</div>
      </div>
    </div>`).join('') : '<div class="empty">🎉 错题集为空，继续保持！</div>';

  document.getElementById('app').innerHTML = `
    ${renderTopbar('wrong')}
    <main>
      <div class="panel">
        <h3>错题集（${list.length}）</h3>
        <p class="wrong-tip">按出错次数从高到低排序 · 答对一次自动减少一次记录</p>
        ${items}
        ${list.length ? `
          <div class="actions">
            <button class="btn danger" id="clearWrong">清空错题集</button>
          </div>` : ''}
      </div>
    </main>
  `;

  document.getElementById('clearWrong')?.addEventListener('click', () => {
    if (!confirm('确定清空全部错题吗？此操作不可恢复。')) return;
    saveWrong(subjectId, {});
    renderWrong(subjectId);
  });
}
