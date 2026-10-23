import { state } from '../state.js';
import { escapeHtml, LETTERS } from '../utils.js';
import { loadSubject } from '../loader.js';
import { renderTopbar } from '../components/topbar.js';
import { renderQuestionFigure } from '../components/qcard.js';
import { loadFavorites } from '../storage.js';

export async function renderFavorites(subjectId) {
  if (state.subjectId !== subjectId || !state.questions.length) {
    await loadSubject(subjectId);
  }
  const favSet = loadFavorites(subjectId);
  const list = state.questions.filter(q => favSet.has(q.id));

  const items = list.length ? list.map((q, i) => `
    <div class="wrong-item">
      <div class="w-idx" style="background:#fef3c7;color:#b45309">★</div>
      <div class="w-body">
        <div class="w-stem">${escapeHtml(q.stem)}</div>
        ${renderQuestionFigure(q)}
        <div class="w-meta">正确答案：${q.answer.map(j => LETTERS[j]).join('、')}</div>
      </div>
    </div>`).join('') : '<div class="empty">还没有收藏的题目，去练习中点击 ☆ 收藏</div>';

  document.getElementById('app').innerHTML = `
    ${renderTopbar('favorites')}
    <main>
      <div class="panel">
        <h3>收藏夹（${list.length}）</h3>
        ${items}
      </div>
    </main>
  `;
}
