import { state } from '../state.js';
import { escapeHtml } from '../utils.js';
import { loadSubjects } from '../loader.js';
import { renderTopbar } from '../components/topbar.js';

export async function renderHome() {
  if (!state.subjects.length) await loadSubjects();

  const cards = state.subjects.map(s => {
    const stats = s.stats || { questions: 0, knowledge: 0 };

    // 有数据显示数据，没数据显示"资料收集中"
    let statLine = '';
    if (stats.questions || stats.knowledge) {
      statLine = `<div class="sc-stats">
        ${stats.questions ? `<span>📝 题库 <strong>${stats.questions}</strong> 题</span>` : ''}
        ${stats.knowledge ? `<span>📖 知识点 <strong>${stats.knowledge}</strong> 个</span>` : ''}
      </div>`;
    } else {
      statLine = `<div class="sc-stats sc-stats-empty">
        <span>📚 资料收集中</span>
      </div>`;
    }

    return `
      <a class="subject-card" href="#/${s.id}">
        <div class="sc-head">
          <span class="sc-level ${s.level === '高级' ? 'lv-high' : 'lv-mid'}">${escapeHtml(s.level)}</span>
          <span class="sc-cat">${escapeHtml(s.category)}</span>
        </div>
        <h3>${escapeHtml(s.name)}</h3>
        <p class="sc-intro">${escapeHtml(s.intro)}</p>
        <div class="sc-meta">
          <span>🗓 ${escapeHtml(s.examTime)}</span>
          <span>🎯 ${escapeHtml(s.core)}</span>
        </div>
        ${statLine}
      </a>`;
  }).join('');

  document.getElementById('app').innerHTML = `
    ${renderTopbar()}
    <main>
      <div class="hero">
        <h2>软考多科目备考平台</h2>
        <p>共 <strong>${state.subjects.length}</strong> 个科目 · 题库 · 错题 · 收藏 · 统计</p>
      </div>
      <div class="subject-grid">${cards}</div>
    </main>
  `;
}