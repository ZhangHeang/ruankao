import { state } from '../state.js';
import { loadSubject, chapterName } from '../loader.js';
import { renderTopbar } from '../components/topbar.js';
import { loadStats } from '../storage.js';

export async function renderStats(subjectId) {
  if (state.subjectId !== subjectId || !state.questions.length) {
    await loadSubject(subjectId);
  }
  const stats = loadStats(subjectId);
  const rate = stats.done ? Math.round(stats.correct / stats.done * 100) : 0;

  const chapters = Object.keys(stats.byChapter || {});
  const bars = chapters.length ? chapters.map(cid => {
    const d = stats.byChapter[cid];
    const p = d.done ? Math.round(d.correct / d.done * 100) : 0;
    return `<div class="chapter-bar">
        <div class="cb-top"><span>${chapterName(cid)}</span><span class="cb-pct">${d.correct}/${d.done} · ${p}%</span></div>
        <div class="cb-track"><div class="cb-fill" style="width:${p}%"></div></div>
      </div>`;
  }).join('') : '<div class="empty">暂无数据</div>';

  document.getElementById('app').innerHTML = `
    ${renderTopbar('stats')}
    <main>
      <div class="panel">
        <h3>总体数据</h3>
        <div class="result-grid">
          <div class="stat-big"><div class="stat-num">${stats.done}</div><div class="stat-label">累计答题</div></div>
          <div class="stat-big"><div class="stat-num">${stats.correct}</div><div class="stat-label">累计答对</div></div>
          <div class="stat-big"><div class="stat-num">${stats.done - stats.correct}</div><div class="stat-label">累计答错</div></div>
          <div class="stat-big"><div class="stat-num">${rate}<span>%</span></div><div class="stat-label">总正确率</div></div>
        </div>
      </div>
      <div class="panel">
        <h3>各章节正确率</h3>
        ${bars}
      </div>
    </main>
  `;
}