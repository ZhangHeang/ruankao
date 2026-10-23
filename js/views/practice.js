import { state, resetExam } from '../state.js';
import { loadSubject } from '../loader.js';
import { renderTopbar } from '../components/topbar.js';
import { escapeHtml } from '../utils.js';
import {
  loadWrong, loadFavorites, loadAnsweredQuestionIds, loadCaseDraftKeys, caseDraftPrefix
} from '../storage.js';

const SESSION_LABEL = { h1: '上半年', h2: '下半年' };
const VARIANT_LABEL = {
  original: '原卷',
  recollection: '回忆版',
  transcription: '转录版',
  unknown: '来源待核验'
};

const chooserState = {
  method: '',
  subject: '',
  mockView: 'papers',
  caseView: 'papers'
};

export async function renderPracticeHub(subjectId, query = {}) {
  if (state.subjectId !== subjectId || (!state.questions.length && !state.cases.length)) {
    await loadSubject(subjectId);
  }
  resetExam();

  chooserState.method = ['mock', 'special'].includes(query.method) ? query.method : '';
  chooserState.subject = ['basic', 'case'].includes(query.subject) ? query.subject : '';
  chooserState.mockView = 'papers';
  chooserState.caseView = 'papers';

  drawHub(subjectId);
}

function drawHub(subjectId) {
  const basicCount = state.questions.length;
  const caseCount = completeCaseEntries().length;
  document.getElementById('app').innerHTML = `
    ${renderTopbar('practice')}
    <main>
      <section class="practice-hero">
        <div><span>练习中心</span><h1>先选方式，再选科目</h1><p>模拟考试用于完整卷或随机组卷，专项练习用于章节、知识点和薄弱项训练。</p></div>
        <div class="practice-hero-stats"><strong>${basicCount}</strong><span>基础知识题</span><strong>${caseCount}</strong><span>完整案例</span></div>
      </section>

      <section class="chooser-step">
        <div class="chooser-step-head"><span>第 1 步</span><h2>选择练习方式</h2></div>
        <div class="chooser-method-grid">
          ${renderMethodCard('mock', '模', '模拟考试', '按历年原卷练习，或从题库随机组成一份练习卷。')}
          ${renderMethodCard('special', '专', '专项练习', '按章节、知识点、来源和个人记录筛选。')}
        </div>
      </section>

      ${chooserState.method ? renderSubjectStep() : ''}
      ${chooserState.method && chooserState.subject ? renderOptionsStep(subjectId) : ''}
    </main>`;
  bindHub(subjectId);
}

function renderMethodCard(key, icon, title, description) {
  const active = chooserState.method === key;
  return `<button class="chooser-method ${active ? 'active' : ''}" type="button" data-choose-method="${key}" aria-pressed="${active}">
    <span class="chooser-method-icon">${icon}</span>
    <span><strong>${title}</strong><small>${description}</small></span>
  </button>`;
}

function renderSubjectStep() {
  return `
    <section class="chooser-step">
      <div class="chooser-step-head">
        <span>第 2 步</span><h2>选择科目</h2>
        <button class="chooser-back" type="button" data-choose-back="method">重选练习方式</button>
      </div>
      <div class="chooser-subject-grid">
        ${renderSubjectCard('basic', '基础知识', '客观题 · 75 题综合知识卷', `${state.questions.length} 道题`)}
        ${renderSubjectCard('case', '案例分析', '整案阅读 · 小问作答 · 参考答案', `${completeCaseEntries().length} 个完整案例`)}
      </div>
    </section>`;
}

function renderSubjectCard(key, title, description, count) {
  const active = chooserState.subject === key;
  return `<button class="chooser-subject ${active ? 'active' : ''}" type="button" data-choose-subject="${key}" aria-pressed="${active}">
    <strong>${title}</strong><span>${description}</span><em>${count}</em>
  </button>`;
}

function renderOptionsStep(subjectId) {
  const head = `
    <section class="chooser-step chooser-options">
      <div class="chooser-step-head">
        <span>第 3 步</span><h2>${chooserState.method === 'mock' ? '模拟考试设置' : '专项练习设置'}</h2>
        <button class="chooser-back" type="button" data-choose-back="subject">重选科目</button>
      </div>
      ${chooserState.method === 'mock'
        ? (chooserState.subject === 'basic' ? renderMockBasic(subjectId) : renderMockCase(subjectId))
        : (chooserState.subject === 'basic' ? renderSpecialBasic(subjectId) : renderSpecialCase(subjectId))}
    </section>`;
  return head;
}

/* ---------------- 模拟考试 · 基础知识 ---------------- */

function renderMockBasic(subjectId) {
  return `
    <div class="chooser-tabs" role="tablist" aria-label="模拟考试组卷方式">
      <button class="${chooserState.mockView === 'papers' ? 'active' : ''}" type="button" data-mock-view="papers" role="tab" aria-selected="${chooserState.mockView === 'papers'}">历年原卷</button>
      <button class="${chooserState.mockView === 'random' ? 'active' : ''}" type="button" data-mock-view="random" role="tab" aria-selected="${chooserState.mockView === 'random'}">随机模拟组卷</button>
    </div>
    ${chooserState.mockView === 'papers' ? renderOriginalObjectivePapers(subjectId) : renderRandomObjective(subjectId)}`;
}

function renderOriginalObjectivePapers(subjectId) {
  const papers = buildPapers().filter(paper => paper.complete);
  const skipped = buildPapers().filter(paper => !paper.complete);
  return `
    <div class="chooser-note">历年原卷按整套试卷进入，保持原题号、原始顺序和 75 题结构，不与其他试卷混卷。仅列出已发布且题量完整的试卷。</div>
    <div class="paper-filters" id="objectivePaperFilters">
      ${filterSelect('year', '年份', [...new Set(papers.map(paper => paper.year).filter(Boolean))].sort((a, b) => b - a).map(value => [String(value), `${value} 年`]))}
      ${filterSelect('session', '考期', [['h1', '上半年'], ['h2', '下半年']])}
      ${filterSelect('region', '地区', [['national', '全国卷'], ['gd', '广东卷']])}
      ${filterSelect('batch', '批次', [...new Set(papers.map(paper => paper.batch).filter(Boolean))].sort((a, b) => Number(a) - Number(b)).map(value => [String(value), `第 ${value} 批`]))}
    </div>
    <div class="paper-result-head"><strong id="objectivePaperCount">${papers.length}</strong><span>套试卷</span><small id="objectivePaperHint"></small></div>
    <div class="paper-list" id="objectivePaperList">${papers.map(paper => renderObjectivePaper(paper, subjectId)).join('') || '<div class="practice-empty">暂无可用的完整历年原卷。</div>'}</div>
    ${skipped.length ? `<p class="chooser-muted">另有 ${skipped.length} 套题目不完整或未通过展示条件，未列入练习。</p>` : ''}`;
}

function renderObjectivePaper(paper, subjectId) {
  const meta = paperMeta(paper);
  return `<article class="paper-card" data-paper-id="${paper.id}" data-year="${paper.year || ''}" data-session="${paper.session || ''}" data-region="${paper.region || 'national'}" data-batch="${paper.batch || ''}">
    <div>
      <span>${escapeHtml(meta)}</span>
      <h3>综合知识</h3>
      <p>${paper.questions} 题 · ${paper.complete ? '完整试卷' : '题目不完整'}${paper.pending ? ' · 题源待最终核验' : ''}${paper.variant ? ` · ${escapeHtml(VARIANT_LABEL[paper.variant] || paper.variant)}` : ''}</p>
    </div>
    <div>
      <a class="btn" href="#/${subjectId}/practice?kind=past&paper=${encodeURIComponent(paper.id)}&mode=practice">逐题解析</a>
      <a class="btn primary" href="#/${subjectId}/practice?kind=past&paper=${encodeURIComponent(paper.id)}&mode=exam">开始考试</a>
    </div>
  </article>`;
}

function renderRandomObjective(subjectId) {
  const counts = {
    mixed: simulationPool('').length,
    past: simulationPool('past').length,
    mock: simulationPool('mock').length
  };
  return `
    <div class="chooser-note">随机组卷只从当前题库抽取，不使用固定的官方权重，也不冒充某一套历年真题。基础知识随机卷固定为 75 题；不足 75 题时阻止组卷并说明缺口，不重复抽题。</div>
    <form class="chooser-form" id="randomObjectiveForm">
      <label>题目来源
        <select name="bank">
          <option value="">真题 + 模拟题（${counts.mixed} 题）</option>
          <option value="past">仅历年真题（${counts.past} 题）</option>
          <option value="mock">仅模拟题（${counts.mock} 题）</option>
        </select>
      </label>
      <div class="chooser-preview" id="randomObjectivePreview"></div>
      <button class="btn primary" type="submit" id="randomObjectiveStart">生成 75 题随机卷</button>
    </form>`;
}

function simulationPool(bank) {
  return state.questions.filter(question =>
    !question.reviewFlags?.includes('answer_disputed') &&
    (!bank || question.bankType === bank)
  );
}

/* ---------------- 模拟考试 · 案例分析 ---------------- */

function renderMockCase(subjectId) {
  return `
    <div class="chooser-tabs" role="tablist" aria-label="案例分析组卷方式">
      <button class="${chooserState.caseView === 'papers' ? 'active' : ''}" type="button" data-case-view="papers" role="tab" aria-selected="${chooserState.caseView === 'papers'}">历年原卷</button>
      <button class="${chooserState.caseView === 'random' ? 'active' : ''}" type="button" data-case-view="random" role="tab" aria-selected="${chooserState.caseView === 'random'}">随机案例练习</button>
    </div>
    ${chooserState.caseView === 'papers' ? renderOriginalCasePapers(subjectId) : renderRandomCase(subjectId)}`;
}

function renderOriginalCasePapers(subjectId) {
  const papers = buildCasePapers();
  return `
    <div class="chooser-note">案例原卷按整套进入，保留案例顺序、共享题干、全部小问和卷面分值。案例不自动判分，参考答案按完整案例展开，不会在小问之间提前泄露。</div>
    <div class="paper-filters" id="casePaperFilters">
      ${filterSelect('year', '年份', [...new Set(papers.map(paper => paper.year).filter(Boolean))].sort((a, b) => b - a).map(value => [String(value), `${value} 年`]))}
      ${filterSelect('session', '考期', [['h1', '上半年'], ['h2', '下半年']])}
      ${filterSelect('region', '地区', [['national', '全国卷'], ['gd', '广东卷']])}
      ${filterSelect('batch', '批次', [...new Set(papers.map(paper => paper.batch).filter(Boolean))].sort((a, b) => Number(a) - Number(b)).map(value => [String(value), `第 ${value} 批`]))}
    </div>
    <div class="paper-result-head"><strong id="casePaperCount">${papers.length}</strong><span>套案例卷</span><small id="casePaperHint"></small></div>
    <div class="paper-list" id="casePaperList">${papers.map(paper => renderCasePaper(paper, subjectId)).join('') || '<div class="practice-empty">暂无可用的已发布案例卷。</div>'}</div>`;
}

function renderCasePaper(paper, subjectId) {
  return `<article class="paper-card" data-case-paper-id="${paper.id}" data-year="${paper.year || ''}" data-session="${paper.session || ''}" data-region="${paper.region || 'national'}" data-batch="${paper.batch || ''}">
    <div>
      <span>${escapeHtml(paperMeta(paper))}</span>
      <h3>案例分析</h3>
      <p>${paper.cases} 个案例 · ${paper.problems} 个小问 · ${paper.totalScore} 分</p>
    </div>
    <div><a class="btn primary" href="#/${subjectId}/cases?paper=${encodeURIComponent(paper.id)}">进入案例卷</a></div>
  </article>`;
}

function renderRandomCase(subjectId) {
  const counts = {
    past: filterCaseEntries({ bank: 'past', chapter: '', knowledgeIds: [], scope: 'all' }).length,
    mock: filterCaseEntries({ bank: 'mock', chapter: '', knowledgeIds: [], scope: 'all' }).length,
    all: filterCaseEntries({ bank: '', chapter: '', knowledgeIds: [], scope: 'all' }).length
  };
  return `
    <div class="chooser-warning"><strong>随机案例练习（不是标准模拟考试）</strong><span>当前案例库按案例抽取，无法还原某套标准案例卷的题量与分值结构。抽中的案例会整案保留共享题干和全部小问。</span></div>
    <form class="chooser-form" id="randomCaseForm">
      <label>题目来源
        <select name="bank">
          <option value="past">历年真题案例（${counts.past} 个）</option>
          <option value="mock">模拟案例（${counts.mock} 个）</option>
          <option value="">全部来源（${counts.all} 个）</option>
        </select>
      </label>
      <label>完整案例数量
        <select name="count">${[1, 2, 3, 4].map(count => `<option value="${count}" ${count === 2 ? 'selected' : ''}>${count} 个完整案例</option>`).join('')}</select>
      </label>
      <div class="chooser-preview" id="randomCasePreview"></div>
      <button class="btn primary" type="submit" id="randomCaseStart">开始随机案例练习</button>
    </form>`;
}

/* ---------------- 专项练习 · 基础知识 ---------------- */

function renderSpecialBasic(subjectId) {
  return `
    <div class="chooser-note">可同时选择多个知识点。多选知识点时，命中任一知识点的题目都会纳入；“未做、错题、收藏”基于本机已有作答与收藏记录。</div>
    <form class="chooser-form special-form" id="specialBasicForm">
      ${chapterSelect('basicChapter')}
      ${knowledgePicker('basicKnowledge')}
      <label>题目来源
        <select name="bank"><option value="">真题 + 模拟题</option><option value="past">历年真题</option><option value="mock">模拟题</option></select>
      </label>
      <label>练习范围
        <select name="scope">
          <option value="all">全部</option>
          <option value="undone">未做</option>
          <option value="wrong">错题</option>
          <option value="favorite">收藏</option>
        </select>
      </label>
      <label>题型
        <select name="type"><option value="">全部题型</option><option value="single">单选题</option><option value="multi">多选题</option></select>
      </label>
      <label>题量
        <select name="count"><option value="10">10 题</option><option value="20">20 题</option><option value="30">30 题</option><option value="50">50 题</option><option value="all">全部</option></select>
      </label>
      <label>查看解析
        <select name="mode"><option value="practice">每题作答后查看</option><option value="exam">交卷后统一查看</option></select>
      </label>
      <div class="chooser-preview" id="specialBasicPreview"></div>
      <div class="chooser-error" id="specialBasicError" hidden></div>
      <button class="btn primary" type="submit">开始专项练习</button>
    </form>`;
}

/* ---------------- 专项练习 · 案例分析 ---------------- */

function renderSpecialCase(subjectId) {
  return `
    <div class="chooser-note">案例按整案保留：只要案例关联到所选章节或任一知识点，就整案纳入，保留共享题干和全部小问。案例分值无法精确拆分到单个知识点，因此不把整案分值重复计入各知识点。</div>
    <div class="chooser-note">案例分析不自动判分，也没有错题和收藏记录。“未做”按是否保存过作答草稿判断；“已做”不表示已被评分。</div>
    <form class="chooser-form special-form" id="specialCaseForm">
      ${chapterSelect('caseChapter')}
      ${knowledgePicker('caseKnowledge')}
      <label>题目来源
        <select name="bank"><option value="">全部案例</option><option value="past">历年真题案例</option><option value="mock">模拟案例</option></select>
      </label>
      <label>练习范围
        <select name="scope"><option value="all">全部</option><option value="undone">未做（无草稿）</option></select>
      </label>
      <label>完整案例数量
        <select name="count">${[1, 2, 3, 4].map(count => `<option value="${count}" ${count === 2 ? 'selected' : ''}>${count} 个完整案例</option>`).join('')}</select>
      </label>
      <div class="chooser-preview" id="specialCasePreview"></div>
      <div class="chooser-error" id="specialCaseError" hidden></div>
      <button class="btn primary" type="submit">开始案例专项练习</button>
    </form>`;
}

/* ---------------- 公共表单片段 ---------------- */

function chapterSelect(id) {
  return `<label>章节
    <select name="chapter" id="${id}"><option value="">全部章节</option>${state.chapters.map(chapter => `<option value="${chapter.id}">${escapeHtml(chapter.name)}</option>`).join('')}</select>
  </label>`;
}

function knowledgePicker(id) {
  const groups = state.chapters
    .map(chapter => ({
      chapter,
      items: state.knowledge.filter(item => item.chapterId === chapter.id)
    }))
    .filter(group => group.items.length);
  if (!groups.length) return '<div class="chooser-muted">当前没有可筛选的知识点。</div>';
  return `<fieldset class="kn-picker" id="${id}">
    <legend>知识点（可多选）</legend>
    <div class="kn-picker-list">${groups.map(group => `
      <div class="kn-group" data-chapter="${group.chapter.id}">
        <strong>${escapeHtml(group.chapter.name)}</strong>
        ${group.items.map(item => `<label class="kn-option" data-chapter="${item.chapterId}">
          <input type="checkbox" name="knowledge" value="${item.id}">
          <span>${escapeHtml(item.title)}</span>
        </label>`).join('')}
      </div>`).join('')}</div>
  </fieldset>`;
}

function filterSelect(name, label, options) {
  return `<label>${label}<select data-paper-filter="${name}"><option value="">全部</option>${options.map(([value, text]) => `<option value="${value}">${text}</option>`).join('')}</select></label>`;
}

/* ---------------- 数据与筛选 ---------------- */

function buildPapers() {
  const groups = new Map();
  state.questions.filter(question => question.bankType === 'past' && question.paperId).forEach(question => {
    if (!groups.has(question.paperId)) groups.set(question.paperId, []);
    groups.get(question.paperId).push(question);
  });
  return [...groups.entries()].map(([id, items]) => {
    const first = items[0];
    const uniqueNumbers = new Set(items.map(item => item.questionNo).filter(Number.isFinite));
    return {
      id,
      year: first.examYear,
      session: first.examSession,
      region: first.region || null,
      batch: first.examBatch || null,
      variant: first.sourceVariant || '',
      questions: items.length,
      complete: items.length >= 75 && uniqueNumbers.size >= 75,
      pending: items.some(item => item.authenticityStatus !== 'verified')
    };
  }).sort((left, right) => (right.year || 0) - (left.year || 0)
    || String(right.session).localeCompare(String(left.session))
    || String(left.region || '').localeCompare(String(right.region || '')));
}

function buildCasePapers() {
  return state.cases.map(item => ({
    id: item.paper.id,
    year: item.paper.examYear,
    session: item.paper.examSession,
    region: item.paper.region || null,
    batch: item.paper.examBatch || null,
    variant: item.paper.sourceVariant || '',
    cases: item.paper.caseCount || item.cases.length,
    problems: item.paper.problemCount || 0,
    totalScore: item.paper.totalScore || 0
  })).sort((left, right) => (right.year || 0) - (left.year || 0)
    || String(right.session).localeCompare(String(left.session))
    || String(left.region || '').localeCompare(String(right.region || '')));
}

function paperMeta(paper) {
  return [
    paper.year || '年份待核',
    SESSION_LABEL[paper.session] || paper.session || '',
    paper.region === 'gd' ? '广东卷' : '全国卷',
    paper.batch ? `第 ${paper.batch} 批` : '',
    paper.variant && paper.variant !== 'original' ? VARIANT_LABEL[paper.variant] || paper.variant : ''
  ].filter(Boolean).join(' · ');
}

function completeCaseEntries() {
  return state.cases.flatMap(item =>
    (item.cases || [])
      .filter(entry => entry.problems?.length)
      .map(entry => ({ paper: item.paper, case: entry }))
  );
}

function caseHasDraft(entry, draftKeys) {
  const prefix = caseDraftPrefix(state.subjectId, entry.paper.id, entry.case.caseNo);
  return [...draftKeys].some(key => key.startsWith(prefix));
}

function filterCaseEntries({ bank, chapter, knowledgeIds, scope }) {
  const draftKeys = loadCaseDraftKeys(state.subjectId);
  return completeCaseEntries().filter(entry => {
    if (bank && entry.paper.bankType !== bank) return false;
    const mapping = entry.case.knowledgeMapping || {};
    const chapterIds = mapping.chapterIds || [];
    const mappedKnowledge = mapping.knowledgeIds || [];
    if (chapter && !chapterIds.includes(chapter)) return false;
    if (knowledgeIds.length && !knowledgeIds.some(id => mappedKnowledge.includes(id))) return false;
    if (scope === 'undone' && caseHasDraft(entry, draftKeys)) return false;
    return true;
  });
}

function filterObjective({ chapter, knowledgeIds, bank, scope, type }) {
  const answered = scope === 'undone' ? loadAnsweredQuestionIds(state.subjectId) : null;
  const wrong = scope === 'wrong' ? new Set(Object.keys(loadWrong(state.subjectId))) : null;
  const favorites = scope === 'favorite' ? loadFavorites(state.subjectId) : null;
  return state.questions.filter(question => {
    if (chapter && question.chapterId !== chapter) return false;
    if (knowledgeIds.length && !knowledgeIds.some(id => question.knowledgeIds?.includes(id))) return false;
    if (bank && question.bankType !== bank) return false;
    if (type && question.type !== type) return false;
    if (answered && answered.has(question.id)) return false;
    if (wrong && !wrong.has(question.id)) return false;
    if (favorites && !favorites.has(question.id)) return false;
    return true;
  });
}

/* ---------------- 绑定 ---------------- */

function bindHub(subjectId) {
  document.querySelectorAll('[data-choose-method]').forEach(button => {
    button.addEventListener('click', () => {
      chooserState.method = button.dataset.chooseMethod;
      chooserState.subject = '';
      drawHub(subjectId);
    });
  });
  document.querySelectorAll('[data-choose-subject]').forEach(button => {
    button.addEventListener('click', () => {
      chooserState.subject = button.dataset.chooseSubject;
      drawHub(subjectId);
    });
  });
  document.querySelectorAll('[data-choose-back]').forEach(button => {
    button.addEventListener('click', () => {
      if (button.dataset.chooseBack === 'method') {
        chooserState.method = '';
        chooserState.subject = '';
      } else {
        chooserState.subject = '';
      }
      drawHub(subjectId);
    });
  });
  document.querySelectorAll('[data-mock-view]').forEach(button => {
    button.addEventListener('click', () => {
      chooserState.mockView = button.dataset.mockView;
      drawHub(subjectId);
    });
  });
  document.querySelectorAll('[data-case-view]').forEach(button => {
    button.addEventListener('click', () => {
      chooserState.caseView = button.dataset.caseView;
      drawHub(subjectId);
    });
  });

  bindPaperFilters('objective');
  bindPaperFilters('case');
  bindRandomObjective(subjectId);
  bindRandomCase(subjectId);
  bindSpecialBasic(subjectId);
  bindSpecialCase(subjectId);
}

function bindPaperFilters(kind) {
  const root = document.getElementById(kind === 'objective' ? 'objectivePaperFilters' : 'casePaperFilters');
  if (!root) return;
  const list = document.getElementById(kind === 'objective' ? 'objectivePaperList' : 'casePaperList');
  const count = document.getElementById(kind === 'objective' ? 'objectivePaperCount' : 'casePaperCount');
  const hint = document.getElementById(kind === 'objective' ? 'objectivePaperHint' : 'casePaperHint');
  const cards = [...list.querySelectorAll('.paper-card')];
  const update = () => {
    const filters = {};
    root.querySelectorAll('[data-paper-filter]').forEach(select => { filters[select.dataset.paperFilter] = select.value; });
    const visible = cards.filter(card => {
      if (filters.year && card.dataset.year !== filters.year) return false;
      if (filters.session && card.dataset.session !== filters.session) return false;
      if (filters.region && card.dataset.region !== filters.region) return false;
      if (filters.batch && card.dataset.batch !== filters.batch) return false;
      return true;
    });
    cards.forEach(card => { card.hidden = !visible.includes(card); });
    count.textContent = String(visible.length);
    hint.textContent = visible.length
      ? (filters.region === 'gd' ? '当前为广东卷，保留地区标记' : '')
      : '没有符合筛选条件的试卷，请放宽条件。';
  };
  root.addEventListener('change', update);
  update();
}

function bindRandomObjective(subjectId) {
  const form = document.getElementById('randomObjectiveForm');
  if (!form) return;
  const preview = document.getElementById('randomObjectivePreview');
  const start = document.getElementById('randomObjectiveStart');
  const update = () => {
    const available = simulationPool(form.elements.bank.value).length;
    preview.textContent = available >= 75
      ? `当前可用 ${available} 题，可生成 75 题随机卷。`
      : `当前仅有 ${available} 题，不足 75 题，无法生成标准 75 题随机卷；不会重复抽题。`;
    preview.classList.toggle('warn', available < 75);
    start.disabled = available < 75;
  };
  form.addEventListener('change', update);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const available = simulationPool(form.elements.bank.value).length;
    if (available < 75) return;
    const query = new URLSearchParams({ kind: 'simulation', mode: 'exam', count: '75' });
    if (form.elements.bank.value) query.set('bank', form.elements.bank.value);
    location.hash = `#/${subjectId}/practice?${query}`;
  });
  update();
}

function bindRandomCase(subjectId) {
  const form = document.getElementById('randomCaseForm');
  if (!form) return;
  const preview = document.getElementById('randomCasePreview');
  const start = document.getElementById('randomCaseStart');
  const update = () => {
    const bank = form.elements.bank.value;
    const available = filterCaseEntries({ bank, chapter: '', knowledgeIds: [], scope: 'all' }).length;
    const requested = Number(form.elements.count.value);
    const enough = available >= requested;
    preview.textContent = enough
      ? `当前可用 ${available} 个完整案例，将随机抽取 ${requested} 个。`
      : `当前仅有 ${available} 个完整案例，不足 ${requested} 个；开始后只使用全部 ${available} 个，不会重复抽取。`;
    preview.classList.toggle('warn', !enough);
    start.disabled = available === 0;
  };
  form.addEventListener('change', update);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!filterCaseEntries({ bank: form.elements.bank.value, chapter: '', knowledgeIds: [], scope: 'all' }).length) return;
    const query = new URLSearchParams({ set: 'random', count: form.elements.count.value });
    if (form.elements.bank.value) query.set('bank', form.elements.bank.value);
    location.hash = `#/${subjectId}/cases?${query}`;
  });
  update();
}

function bindSpecialBasic(subjectId) {
  const form = document.getElementById('specialBasicForm');
  if (!form) return;
  const preview = document.getElementById('specialBasicPreview');
  const error = document.getElementById('specialBasicError');
  const update = () => {
    syncKnowledgePicker(form);
    const options = currentObjectiveOptions(form);
    const available = filterObjective(options).length;
    const requested = form.elements.count.value === 'all' ? available : Number(form.elements.count.value);
    if (!available) {
      preview.textContent = '当前条件下没有可用题目。';
      preview.classList.add('warn');
      error.hidden = false;
      error.textContent = '没有匹配的题目：请减少知识点、切换来源或把范围改为“全部”。';
    } else if (requested > available) {
      preview.textContent = `当前可用 ${available} 题，少于所选 ${requested} 题；开始后使用全部 ${available} 题，不会重复抽取。`;
      preview.classList.add('warn');
      error.hidden = true;
    } else {
      preview.textContent = `当前可用 ${available} 题${options.knowledgeIds.length ? ` · ${options.knowledgeIds.length} 个知识点` : ''}。`;
      preview.classList.remove('warn');
      error.hidden = true;
    }
    form.querySelector('button[type="submit"]').disabled = available === 0;
  };
  form.addEventListener('change', update);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const options = currentObjectiveOptions(form);
    if (!filterObjective(options).length) return;
    const query = new URLSearchParams({ kind: 'special', mode: form.elements.mode.value || 'practice' });
    if (options.chapter) query.set('chapter', options.chapter);
    if (options.knowledgeIds.length) query.set('knowledge', options.knowledgeIds.join(','));
    if (options.bank) query.set('bank', options.bank);
    if (options.scope !== 'all') query.set('scope', options.scope);
    if (options.type) query.set('type', options.type);
    if (form.elements.count.value) query.set('count', form.elements.count.value);
    location.hash = `#/${subjectId}/practice?${query}`;
  });
  update();
}

function bindSpecialCase(subjectId) {
  const form = document.getElementById('specialCaseForm');
  if (!form) return;
  const preview = document.getElementById('specialCasePreview');
  const error = document.getElementById('specialCaseError');
  const update = () => {
    syncKnowledgePicker(form);
    const options = currentCaseOptions(form);
    const available = filterCaseEntries(options).length;
    const requested = Number(form.elements.count.value);
    if (!available) {
      preview.textContent = '当前条件下没有可用完整案例。';
      preview.classList.add('warn');
      error.hidden = false;
      error.textContent = '没有匹配的完整案例：请减少知识点、切换来源或把范围改为“全部”。';
    } else if (requested > available) {
      preview.textContent = `当前可用 ${available} 个完整案例，少于所选 ${requested} 个；开始后只使用全部 ${available} 个，不会重复抽取。`;
      preview.classList.add('warn');
      error.hidden = true;
    } else {
      preview.textContent = `当前可用 ${available} 个完整案例，整案保留题干与全部小问。`;
      preview.classList.remove('warn');
      error.hidden = true;
    }
    form.querySelector('button[type="submit"]').disabled = available === 0;
  };
  form.addEventListener('change', update);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const options = currentCaseOptions(form);
    if (!filterCaseEntries(options).length) return;
    const query = new URLSearchParams({ set: 'special', count: form.elements.count.value });
    if (options.chapter) query.set('chapter', options.chapter);
    if (options.knowledgeIds.length) query.set('knowledge', options.knowledgeIds.join(','));
    if (options.bank) query.set('bank', options.bank);
    if (options.scope !== 'all') query.set('scope', options.scope);
    location.hash = `#/${subjectId}/cases?${query}`;
  });
  update();
}

function syncKnowledgePicker(form) {
  const chapter = form.elements.chapter.value;
  form.querySelectorAll('.kn-option').forEach(option => {
    const visible = !chapter || option.dataset.chapter === chapter;
    option.hidden = !visible;
    if (!visible) option.querySelector('input').checked = false;
  });
  form.querySelectorAll('.kn-group').forEach(group => {
    group.hidden = Boolean(chapter && group.dataset.chapter !== chapter);
  });
}

function selectedKnowledge(form) {
  return [...form.querySelectorAll('input[name="knowledge"]:checked')].map(input => input.value);
}

function currentObjectiveOptions(form) {
  return {
    chapter: form.elements.chapter.value,
    knowledgeIds: selectedKnowledge(form),
    bank: form.elements.bank.value,
    scope: form.elements.scope.value,
    type: form.elements.type.value
  };
}

function currentCaseOptions(form) {
  return {
    chapter: form.elements.chapter.value,
    knowledgeIds: selectedKnowledge(form),
    bank: form.elements.bank.value,
    scope: form.elements.scope.value
  };
}
