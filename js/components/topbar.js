import { state } from '../state.js';
import { escapeHtml } from '../utils.js';

export function renderTopbar(active = '') {
  const meta = state.subjectMeta;
  const subjLabel = meta
    ? `${escapeHtml(meta.shortName || meta.name)}`
    : '软考题库';

  const nav = meta ? `
    <nav class="tabs">
      <a class="tab ${active === 'subject'   ? 'active' : ''}" href="#/${state.subjectId}">概览</a>
      <a class="tab ${active === 'outline'   ? 'active' : ''}" href="#/${state.subjectId}/outline">大纲</a>
      <a class="tab ${active === 'study'     ? 'active' : ''}" href="#/${state.subjectId}/study">学习</a>
      <a class="tab ${active === 'practice'  ? 'active' : ''}" href="#/${state.subjectId}/practice">练习</a>
      <a class="tab ${active === 'wrong'     ? 'active' : ''}" href="#/${state.subjectId}/wrong">错题</a>
      <a class="tab ${active === 'favorites' ? 'active' : ''}" href="#/${state.subjectId}/favorites">收藏</a>
      <a class="tab ${active === 'stats'     ? 'active' : ''}" href="#/${state.subjectId}/stats">统计</a>
    </nav>` : '';

  return `
    <header class="topbar">
      <a class="brand" href="#/">
        <div class="logo">软</div>
        <div>
          <h1>${subjLabel}</h1>
          <p>${meta ? escapeHtml(meta.level + ' · ' + meta.category) : '多科目备考平台'}</p>
        </div>
      </a>
      ${nav}
    </header>
  `;
}