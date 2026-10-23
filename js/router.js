import { renderHome } from './views/home.js';
import { renderSubject } from './views/subject.js';
import { renderOutline } from './views/outline.js';
import { renderStudy } from './views/study.js';
import { renderPractice as renderExamSession } from './views/exam.js';
import { renderPracticeHub } from './views/practice.js';
import { renderCases } from './views/cases.js';
import { renderWrong } from './views/wrong.js';
import { renderFavorites } from './views/favorites.js';
import { renderStats } from './views/stats.js';
import { escapeHtml } from './utils.js';

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(queryPart || ''));
  return { parts, query };
}

export async function route() {
  const app = document.getElementById('app');

  try {
    const { parts, query } = parseHash();
    if (parts.length === 0) { await renderHome(); return; }

    const [subjectId, view] = parts;

    switch (view) {
      case undefined:   await renderSubject(subjectId); break;
      case 'outline':   await renderOutline(subjectId); break;
      case 'study':     await renderStudy(subjectId, query); break;
      case 'practice':
        if (query.kind || query.bank || query.knowledge || query.question) {
          await renderExamSession(subjectId, query.mode === 'practice' ? 'practice' : 'exam', query);
        } else {
          await renderPracticeHub(subjectId, query);
        }
        break;
      case 'wrong':     await renderWrong(subjectId); break;
      case 'favorites': await renderFavorites(subjectId); break;
      case 'stats':     await renderStats(subjectId); break;
      case 'cases':     await renderCases(subjectId, query); break;
      default:
        app.innerHTML = `<main><div class="panel"><h3>页面不存在</h3><p><a href="#/">返回首页</a></p></div></main>`;
    }
  } catch (err) {
    console.error(err);
    app.innerHTML = `<main><div class="panel"><h3>加载失败</h3><p>${escapeHtml(err.message || '未知错误')}</p></div></main>`;
  }
}

export function startRouter() {
  window.addEventListener('hashchange', route);
  route();
}
