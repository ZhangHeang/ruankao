import { state } from '../state.js';
import { escapeHtml } from '../utils.js';
import { loadSubject, hasContent, moduleAvailability } from '../loader.js';
import { renderTopbar } from '../components/topbar.js';
import { loadStats } from '../storage.js';

export async function renderSubject(subjectId) {
  if (state.subjectId !== subjectId) {
    await loadSubject(subjectId);
  }
  const meta = state.subjectMeta;

  // 完全空白 → 占位页
  if (!hasContent()) {
    document.getElementById('app').innerHTML = `
      ${renderTopbar('subject')}
      <main>
        <div class="hero">
          <h2>${escapeHtml(meta.name)}</h2>
          <p>${escapeHtml(meta.level)} · ${escapeHtml(meta.category)} · ${escapeHtml(meta.examTime)}</p>
        </div>
        <div class="panel placeholder-panel">
          <div class="placeholder-icon">📚</div>
          <h3>资料正在收集整理中</h3>
          <p class="placeholder-desc">
            该科目的题库、知识点与大纲正在建设中。<br>
            当前已上线的科目，请前往首页查看。
          </p>
          <div class="placeholder-actions">
            <a class="btn primary" href="#/">返回首页</a>
          </div>
        </div>
      </main>
    `;
    return;
  }

  // 有数据 → 正常渲染
  const stats = loadStats(subjectId);
  const avail = moduleAvailability();

  const quickItems = [
    { key: 'outline',   icon: '📖', label: '大纲串讲', href: `#/${subjectId}/outline` },
    { key: 'study',     icon: '📚', label: '学习模式', href: `#/${subjectId}/study` },
    { key: 'practice',  icon: '✏️', label: '开始练习', href: `#/${subjectId}/practice` },
    { key: 'wrong',     icon: '❌', label: '错题集',   href: `#/${subjectId}/wrong` },
    { key: 'favorites', icon: '⭐', label: '收藏夹',   href: `#/${subjectId}/favorites` },
    { key: 'stats',     icon: '📊', label: '统计',     href: `#/${subjectId}/stats` }
  ];

  const quickHTML = quickItems.map(item => {
    if (avail[item.key]) {
      return `<a class="quick-card" href="${item.href}">${item.icon} ${item.label}</a>`;
    }
    return `<div class="quick-card quick-card-disabled" data-label="${item.label}">
      <span class="quick-card-main">${item.icon} ${item.label}</span>
      <span class="quick-badge">建设中</span>
    </div>`;
  }).join('');

  const coverage = state.questionCoverage;
  const coverageByChapter = new Map((coverage?.chapters || []).map(item => [item.chapterId, item]));
  const caseCountByChapter = new Map();
  state.cases.forEach(paper => {
    (paper.cases || []).forEach(item => {
      const chapters = new Set(item.knowledgeMapping?.chapterIds || []);
      chapters.forEach(chapterId => caseCountByChapter.set(chapterId, (caseCountByChapter.get(chapterId) || 0) + 1));
    });
  });
  const sample = coverage?.sample;
  const yearRange = sample?.years?.length
    ? `${sample.years[0]}–${sample.years[sample.years.length - 1]}`
    : '样本年份待核';

  const chapters = state.chapters.length
    ? state.chapters.map(c => {
        const items = state.knowledge.filter(k => k.chapterId === c.id);
        const built = items.filter(k => k.status === 'published' && k.content).length;
        const stats = coverageByChapter.get(c.id);
        const share = Number.isFinite(stats?.questionShare) ? stats.questionShare : null;
        const caseCount = caseCountByChapter.get(c.id) || 0;
        const total = items.length;
        return `<a class="chapter-card" href="#/${subjectId}/study?chapter=${encodeURIComponent(c.id)}" aria-label="进入${escapeHtml(c.name)}学习">
          <div class="chapter-card-main">
            <div class="chapter-card-head">
              <span class="chapter-card-no">${String(c.order).padStart(2, '0')}</span>
              <div>
                <h4>${escapeHtml(c.name)}</h4>
                <p>${escapeHtml(c.intro || '')}</p>
              </div>
            </div>
            <div class="chapter-card-stats">
              <div><strong>${built}/${total}</strong><span>正文 / 知识点</span></div>
              <div><strong>${share == null ? '—' : `${share}%`}</strong><span>历史真题题量占比</span></div>
              <div title="按已复核案例知识点映射统计，不代表案例分值"><strong>${caseCount}</strong><span>相关案例</span></div>
            </div>
            <div class="chapter-card-bar"><i style="width:${share == null ? 0 : Math.min(share, 100)}%"></i></div>
          </div>
          <span class="chapter-card-enter">进入学习 →</span>
        </a>`;
      }).join('')
    : '<div class="empty">暂无章节数据</div>';

  document.getElementById('app').innerHTML = `
    ${renderTopbar('subject')}
    <main>
      <div class="hero">
        <h2>${escapeHtml(meta.name)}</h2>
        <p>${escapeHtml(meta.level)} · ${escapeHtml(meta.category)} · ${escapeHtml(meta.examTime)}</p>
      </div>

      <div class="panel">
        <h3>快捷入口</h3>
        <div class="quick-grid">${quickHTML}</div>
      </div>

      <div class="panel">
        <div class="chapter-panel-head">
          <h3>章节列表</h3>
          <p>“正文 x/y”为已发布正文的知识点数，不是目录条目数。</p>
        </div>
        ${coverage ? `<div class="chapter-coverage-note">
          <strong>历史真题样本分布</strong>
          <span>基于 ${sample?.completePaperCount || sample?.paperCount || 0} 套完整客观卷（${yearRange}）的 ${sample?.pastQuestions || 0} 道历年题，按章节客观题题数 ÷ 样本总题数计算。这是历史样本分布，不代表官方权重或未来命题概率；模拟题不计入。</span>
        </div>` : '<div class="chapter-coverage-note"><strong>历史真题样本分布</strong><span>暂未生成章节题量统计，本章节卡仅显示正文进度。</span></div>'}
        <div class="chapter-card-list">${chapters}</div>
      </div>

      <div class="panel">
        <h3>累计数据</h3>
        <p>已答题 <strong>${stats.done}</strong> 道 · 正确率 <strong>${stats.done ? Math.round(stats.correct / stats.done * 100) : 0}%</strong></p>
      </div>
    </main>
  `;

  // 绑定"建设中"点击提示
  document.querySelectorAll('.quick-card-disabled').forEach(el => {
    el.addEventListener('click', () => {
      const label = el.dataset.label || '该模块';
      alert(`${label} 资料正在整理中，敬请期待。`);
    });
  });
}