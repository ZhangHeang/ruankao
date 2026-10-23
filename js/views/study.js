import { state } from '../state.js';
import { LETTERS, escapeHtml } from '../utils.js';
import { loadSubject, chapterName } from '../loader.js';
import { renderTopbar } from '../components/topbar.js';
import { renderQuestionFigure, renderQuestionMedia } from '../components/qcard.js';
import {
  loadFavorites, saveFavorites, loadStats, saveStats,
  loadStudyProgress, saveStudyProgress, loadProgress, saveProgress,
  recordWrong, recordCorrect
} from '../storage.js';

let currentKnowledgeId = null;
const inlineTabs = new Map();
const inlineIndexes = new Map();
const inlineAnswers = new Map();
const inlineChecked = new Set();
const inlineAnalysisOpen = new Set();
let hydratedSubjectId = null;
let navSubjectId = null;
const expandedChapters = new Set();
let mobileNavOpen = false;
let navKeyHandlerInstalled = false;

const SOURCE_ROLE_LABELS = {
  chapter_lecture: '章节讲义',
  historical_exam_explanation: '历年真题解析',
  structure_review: '结构复核',
  supplemental_lecture: '补充讲义',
  lecture_cross_check: '讲义交叉核对',
  process_reference: '过程参考',
};

function sourceDisplayName(path = '') {
  return path.split(/[\\/]/).pop().replace(/\.pdf$/i, '');
}

export async function renderStudy(subjectId, query = {}, options = {}) {
  if (state.subjectId !== subjectId || !state.knowledge.length) {
    await loadSubject(subjectId);
  }
  hydrateInlineProgress(subjectId);
  const knowledge = state.knowledge;
  if (!knowledge.length) {
    document.getElementById('app').innerHTML = `
      ${renderTopbar('study')}
      <main><div class="panel"><h3>暂无知识点数据</h3></div></main>`;
    return;
  }

  const progress = loadStudyProgress(subjectId);
  const readSet = new Set(progress.readIds || []);
  const current = selectCurrentKnowledge(knowledge, progress, query);
  currentKnowledgeId = current.id;

  if (navSubjectId !== subjectId) {
    expandedChapters.clear();
    mobileNavOpen = false;
    navSubjectId = subjectId;
  }
  if (!options.preserveNav) {
    if (query?.chapter) expandedChapters.add(query.chapter);
    expandedChapters.add(current.chapterId);
  }

  saveStudyProgress(subjectId, {
    readIds: [...readSet],
    lastId: current.id,
    lastByChapter: { ...(progress.lastByChapter || {}), [current.chapterId]: current.id }
  });

  const total = knowledge.length;
  const readCount = readSet.size;
  const pct = Math.round(readCount / total * 100);

  const currentIdx = knowledge.findIndex(k => k.id === current.id);
  const prev = currentIdx > 0 ? knowledge[currentIdx - 1] : null;
  const next = currentIdx < total - 1 ? knowledge[currentIdx + 1] : null;

  const grouped = state.chapters
    .map(ch => ({ chapter: ch, items: knowledge.filter(k => k.chapterId === ch.id) }))
    .filter(g => g.items.length);
  const chapter = state.chapters.find(item => item.id === current.chapterId);
  const chapterItems = knowledge.filter(k => k.chapterId === current.chapterId);
  const chapterHasBody = chapterItems.some(hasBody);

  document.getElementById('app').innerHTML = `
    ${renderTopbar('study')}
    <main class="study-page">
      <div class="study-progress">
        <div class="sp-info">
          <span class="sp-label">学习进度</span>
          <span class="sp-num"><strong>${readCount}</strong> / ${total} · ${pct}%</span>
        </div>
        <div class="sp-track"><div class="sp-fill" style="width:${pct}%"></div></div>
      </div>

      <button class="study-nav-toggle" id="studyNavToggle" type="button" aria-expanded="${mobileNavOpen}" aria-controls="studyNav">
        <span>章节目录</span>
        <small>${escapeHtml(chapter?.name || chapterName(current.chapterId))} · ${escapeHtml(current.title)}</small>
      </button>

      <div class="study-layout">
        <aside class="study-nav ${mobileNavOpen ? 'open' : ''}" id="studyNav" aria-label="章节目录">
          <div class="sn-toolbar">
            <button type="button" data-nav-action="expand" title="全部展开" aria-label="全部展开">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14M12 5v14"/></svg>
            </button>
            <button type="button" data-nav-action="collapse" title="全部收起" aria-label="全部收起">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14"/></svg>
            </button>
            <button type="button" data-nav-action="locate" title="定位当前知识点" aria-label="定位当前知识点">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></svg>
            </button>
          </div>
          ${grouped.map(g => {
            const gRead = g.items.filter(k => readSet.has(k.id)).length;
            const expanded = expandedChapters.has(g.chapter.id);
            return `
              <div class="sn-group" data-chapter="${g.chapter.id}">
                <button class="sn-group-head" type="button" data-chapter-toggle="${g.chapter.id}"
                        aria-expanded="${expanded}" aria-controls="sn-list-${g.chapter.id}">
                  <span class="sn-arrow" aria-hidden="true">${expanded ? '▾' : '▸'}</span>
                  <span class="sn-group-title">${escapeHtml(g.chapter.name)}</span>
                  <span class="sn-group-count">${gRead}/${g.items.length}</span>
                </button>
                <ul class="sn-list" id="sn-list-${g.chapter.id}" ${expanded ? '' : 'hidden'}>
                  ${g.items.map(k => `
                    <li>
                      <a class="sn-item ${k.id === current.id ? 'active' : ''} ${readSet.has(k.id) ? 'read' : ''}"
                         data-id="${k.id}"
                         href="#/${subjectId}/study?chapter=${encodeURIComponent(k.chapterId)}&knowledge=${encodeURIComponent(k.id)}"
                         ${k.id === current.id ? 'aria-current="page"' : ''}>
                        <span class="sn-dot"></span>
                        <span class="sn-text">${escapeHtml(k.title)}</span>
                      </a>
                    </li>`).join('')}
                </ul>
              </div>`;
          }).join('')}
        </aside>

        <article class="study-main">
          <div class="sm-location">
            <a href="#/${subjectId}/study?chapter=${encodeURIComponent(current.chapterId)}">${escapeHtml(chapter?.name || chapterName(current.chapterId))}</a>
            <span aria-hidden="true">›</span>
            <strong>${escapeHtml(current.title)}</strong>
          </div>
          <header class="sm-header">
            <div class="sm-meta">
              <span class="sm-chapter">${escapeHtml(chapterName(current.chapterId))}</span>
              ${current.examScope ? `<span class="sm-chip scope-${current.examScope}">${current.examScope === 'current' ? '现行考纲' : '历史考点'}</span>` : ''}
              ${current.level ? `<span class="sm-chip">${escapeHtml(current.level)}</span>` : ''}
              ${renderFrequencyChip(current)}
            </div>
            <h1 class="sm-title">${escapeHtml(current.title)}</h1>
            <button class="sm-read-btn ${readSet.has(current.id) ? 'done' : ''}" id="markReadBtn">
              ${readSet.has(current.id) ? '<span class="sm-check">✓</span> 已掌握' : '标记为已掌握'}
            </button>
          </header>

          ${!chapterHasBody ? `<div class="sm-empty">本章 ${chapterItems.length} 个知识点尚未发布正文，当前仅提供目录和建设状态。请先学习已有正文的章节。</div>` : ''}

          ${renderSyllabus(current.chapterId)}

          <div class="sm-content">${renderContent(current.content || '')}</div>

          ${renderStudyProfile(current)}

          ${renderInlinePractice(current, subjectId)}

          ${renderRelated(current)}

          <footer class="sm-footer">
            ${prev
              ? `<a class="sm-nav sm-nav-prev" href="#/${subjectId}/study?chapter=${encodeURIComponent(prev.chapterId)}&knowledge=${encodeURIComponent(prev.id)}">
                   <span class="sm-nav-label">← 上一节</span>
                   <span class="sm-nav-title">${escapeHtml(prev.title)}</span>
                 </a>`
              : '<div class="sm-nav-ghost"></div>'}
            ${next
              ? `<a class="sm-nav sm-nav-next" href="#/${subjectId}/study?chapter=${encodeURIComponent(next.chapterId)}&knowledge=${encodeURIComponent(next.id)}">
                   <span class="sm-nav-label">下一节 →</span>
                   <span class="sm-nav-title">${escapeHtml(next.title)}</span>
                 </a>`
              : '<div class="sm-nav-ghost"></div>'}
          </footer>
        </article>
      </div>
    </main>
  `;

  bindStudy(subjectId, current);
  if (options.revealNav !== false) {
    const reveal = () => {
      const active = document.querySelector('.sn-item.active');
      ensureNavItemVisible(active, false);
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(reveal);
    else reveal();
  }
}

function hasBody(item) {
  return item.status === 'published' && Boolean(item.content);
}

function selectCurrentKnowledge(knowledge, progress, query) {
  if (query?.knowledge) {
    const explicit = knowledge.find(k => k.id === query.knowledge);
    if (explicit) return explicit;
  }
  if (query?.chapter) {
    const items = knowledge.filter(k => k.chapterId === query.chapter);
    if (items.length) {
      const remembered = items.find(k => k.id === progress.lastByChapter?.[query.chapter]);
      return remembered || items.find(hasBody) || items[0];
    }
  }
  if (currentKnowledgeId) {
    const session = knowledge.find(k => k.id === currentKnowledgeId);
    if (session) return session;
  }
  const last = knowledge.find(k => k.id === progress.lastId);
  if (last) return last;
  return knowledge.find(hasBody) || knowledge[0];
}

function hydrateInlineProgress(subjectId) {
  if (hydratedSubjectId === subjectId) return;
  inlineAnswers.clear();
  inlineChecked.clear();
  const saved = loadProgress(subjectId, 'study-inline') || {};
  Object.entries(saved.answers || {}).forEach(([questionId, answers]) => inlineAnswers.set(questionId, answers));
  (saved.checked || []).forEach(questionId => inlineChecked.add(questionId));
  hydratedSubjectId = subjectId;
}

function persistInlineProgress(subjectId) {
  saveProgress(subjectId, 'study-inline', {
    answers: Object.fromEntries(inlineAnswers),
    checked: [...inlineChecked],
  });
}

function renderSyllabus(chapterId) {
  const chapter = state.chapters.find(item => item.id === chapterId);
  const syllabus = chapter?.syllabus;
  if (!syllabus) return '';
  return `
    <section class="sm-syllabus">
      <div class="sm-section-kicker">考试大纲</div>
      <div class="sm-syllabus-head"><strong>${escapeHtml(syllabus.version)}</strong><span>${escapeHtml(chapter.weight || '')}</span></div>
      <p>${escapeHtml(syllabus.requirement)}</p>
      <div class="sm-syllabus-grid">
        <div><h3>考试范围</h3><ul>${syllabus.scopePoints.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>
        <div><h3>常见考法</h3><div class="sm-syllabus-tags">${syllabus.examForms.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div></div>
      </div>
      ${syllabus.historyNote ? `<p class="sm-history-note">${escapeHtml(syllabus.historyNote)}</p>` : ''}
    </section>`;
}

function renderStudyProfile(knowledge) {
  const stats = knowledge.examStats || {};
  const sections = [
    ['重点速记', knowledge.keyPoints, item => `<li>${escapeHtml(item)}</li>`],
    ['易错辨析', knowledge.pitfalls, item => `<li>${escapeHtml(item)}</li>`],
    ['案例说明', knowledge.caseExamples, item => `<li><strong>${escapeHtml(item.scenario)}</strong><span>${escapeHtml(item.takeaway)}</span></li>`],
    ['法律与标准', knowledge.legalRules, item => `<li><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.point)}${item.version ? ` · ${escapeHtml(item.version)}` : ''}</span></li>`],
  ];
  const hasProfile = sections.some(([, items]) => items?.length)
    || knowledge.sprintCards?.length
    || knowledge.formulas?.length
    || knowledge.processes?.length
    || knowledge.inputsToolsOutputs?.length
    || knowledge.supportingSources?.length
    || knowledge.externalSources?.length
    || knowledge.sourceRefs?.length;
  if (!hasProfile) return knowledge.status === 'catalogued'
    ? '<div class="sm-empty">该知识点已纳入目录，正文和学习资料正在建设中。</div>'
    : '';

  return `
    <section class="sm-profile">
      <div class="sm-profile-head">
        <div><span class="sm-profile-label">学习档案</span>${knowledge.essential ? `<span class="sm-essential">${escapeHtml(knowledge.essential)}</span>` : ''}</div>
        <div class="sm-tags">${(knowledge.tags || []).map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
      </div>
      ${knowledge.summary ? `<p class="sm-profile-summary">${escapeHtml(knowledge.summary)}</p>` : ''}
      <div class="sm-exam-stat">
        <strong>${stats.questionCount || 0}</strong> 道已关联真题 · <strong>${stats.paperCount || 0}</strong> 套试卷
        ${stats.years?.length ? ` · 出现年份 ${stats.years.join('、')}` : ''}
        <small>${escapeHtml(stats.coverageNote || '')}</small>
      </div>
      ${sections.map(([title, items, render]) => items?.length ? `
        <div class="sm-profile-block"><h3>${title}</h3><ul>${items.map(render).join('')}</ul></div>` : '').join('')}
      ${knowledge.formulas?.length ? `<div class="sm-profile-block"><h3>公式</h3>${knowledge.formulas.map(item => `
        <div class="sm-formula"><strong>${escapeHtml(item.name)}</strong><code>${escapeHtml(item.expression)}</code><span>${escapeHtml(item.note || '')}</span></div>`).join('')}</div>` : ''}
      ${knowledge.processes?.length ? `<div class="sm-profile-block"><h3>流程</h3>${knowledge.processes.map(item => `
        <div class="sm-process"><strong>${escapeHtml(item.name)}</strong><div>${item.steps.map(step => `<span>${escapeHtml(step)}</span>`).join('<b>→</b>')}</div></div>`).join('')}</div>` : ''}
      ${knowledge.inputsToolsOutputs?.length ? `<div class="sm-profile-block"><h3>输入、工具与输出</h3>${knowledge.inputsToolsOutputs.map(item => `
        <div class="sm-ito"><strong>${escapeHtml(item.process)}</strong><span>输入：${escapeHtml((item.inputs || []).join('、'))}</span><span>工具：${escapeHtml((item.tools || []).join('、'))}</span><span>输出：${escapeHtml((item.outputs || []).join('、'))}</span></div>`).join('')}</div>` : ''}
      ${knowledge.sprintCards?.length ? `<div class="sm-profile-block"><h3>冲刺卡片</h3><div class="sm-cards">${knowledge.sprintCards.map(card => `
        <details><summary>${escapeHtml(card.question)}</summary><p>${escapeHtml(card.answer)}</p></details>`).join('')}</div></div>` : ''}
      ${(knowledge.supportingSources?.length || knowledge.externalSources?.length || knowledge.sourceRefs?.length) ? `<details class="sm-sources"><summary>内容来源与交叉资料</summary><ul>
        ${(knowledge.supportingSources || []).map(source => `
        <li>${escapeHtml(source.name)}${source.pages?.length ? `（第 ${source.pages.join('、')} 页）` : ''} · ${escapeHtml(source.role || '参考')}</li>`).join('')}
        ${(knowledge.externalSources || []).map(source => `
        <li>${escapeHtml(source.name)}${source.article ? ` · ${escapeHtml(source.article)}` : ''} · ${escapeHtml(source.publisher || '')} · ${escapeHtml(source.version || '')} · 核验日期 ${escapeHtml(source.verifiedAt || '')} · <a href="${escapeHtml(source.url || '')}" target="_blank" rel="noopener noreferrer">官方链接</a>${source.excerpt ? `<span class="sm-source-excerpt">${escapeHtml(source.excerpt)}</span>` : ''}</li>`).join('')}
        ${(knowledge.sourceRefs || []).map(source => `
        <li>${escapeHtml(sourceDisplayName(source.path))}${source.pages?.length ? `（第 ${source.pages.join('、')} 页）` : ''} · ${escapeHtml(SOURCE_ROLE_LABELS[source.role] || source.role || '资料')}</li>`).join('')}
      </ul></details>` : ''}
    </section>`;
}

function renderInlinePractice(knowledge, subjectId) {
  const pools = {
    mock: state.questions.filter(question => question.bankType === 'mock' && question.knowledgeIds?.includes(knowledge.id)),
    past: state.questions.filter(question => question.bankType === 'past' && question.knowledgeIds?.includes(knowledge.id)),
  };
  if (!pools.mock.length && !pools.past.length) {
    return `<section class="sm-inline-practice"><div class="sm-section-kicker">练习与真题</div><div class="sm-empty">该知识点暂时没有关联题目，题库正在补充中。</div></section>`;
  }
  let tab = inlineTabs.get(knowledge.id) || (pools.mock.length ? 'mock' : 'past');
  if (!pools[tab].length) tab = tab === 'mock' ? 'past' : 'mock';
  inlineTabs.set(knowledge.id, tab);
  const indexKey = `${knowledge.id}:${tab}`;
  const index = Math.min(inlineIndexes.get(indexKey) || 0, pools[tab].length - 1);
  inlineIndexes.set(indexKey, index);
  const question = pools[tab][index];
  const selected = inlineAnswers.get(question.id) || [];
  const checked = inlineChecked.has(question.id);
  const correct = checked && sameAnswer(selected, question.answer);
  const analysisOpen = inlineAnalysisOpen.has(question.id);
  const favorite = loadFavorites(subjectId).has(question.id);
  const sourceLabel = question.bankType === 'past'
    ? `${question.examYear}年${question.examSession === 'h1' ? '上半年' : question.examSession === 'h2' ? '下半年' : ''}真题 · 第${question.questionNo}题`
    : '原创章节练习';

  return `
    <section class="sm-inline-practice" data-knowledge="${knowledge.id}">
      <div class="sm-section-kicker">练习与真题</div>
      <div class="sm-practice-tabs">
        <button class="${tab === 'mock' ? 'active' : ''}" data-inline-tab="mock">章节练习 <span>${pools.mock.length}</span></button>
        <button class="${tab === 'past' ? 'active' : ''}" data-inline-tab="past">历年真题 <span>${pools.past.length}</span></button>
      </div>
      <div class="sm-inline-card" data-question="${question.id}">
        <div class="sm-inline-head">
          <div><span class="sm-bank ${question.bankType}">${question.bankType === 'past' ? '真题' : '模拟'}</span><span>${escapeHtml(sourceLabel)}</span></div>
          <button class="sm-inline-fav ${favorite ? 'active' : ''}" data-inline-fav="${question.id}" title="${favorite ? '取消收藏' : '加入收藏'}">${favorite ? '★ 已收藏' : '☆ 收藏'}</button>
        </div>
        <div class="sm-inline-stem">${escapeHtml(question.stem)}</div>
        ${renderQuestionFigure(question)}
        <div class="sm-inline-options">
          ${question.options.map((option, optionIndex) => {
            const chosen = selected.includes(optionIndex);
            let className = chosen ? 'selected' : '';
            if (checked && question.answer.includes(optionIndex)) className += ' correct';
            else if (checked && chosen) className += ' wrong';
            return `<label class="${className.trim()}">
              <input type="${question.type === 'multi' ? 'checkbox' : 'radio'}" name="inline-${question.id}" value="${optionIndex}" ${chosen ? 'checked' : ''} ${checked ? 'disabled' : ''}>
              <span>${LETTERS[optionIndex]}</span><div class="sm-inline-option-text">${escapeHtml(option)}${renderQuestionMedia(question, 'option', optionIndex)}</div>
            </label>`;
          }).join('')}
        </div>
        ${checked ? `<div class="sm-inline-result ${correct ? 'ok' : 'bad'}">
          <strong>${correct ? '✓ 回答正确' : '✗ 回答错误'}</strong>
          <span>正确答案：${question.answer.map(answer => LETTERS[answer]).join('、')}</span>
          <button data-inline-analysis="${question.id}">${analysisOpen ? '收起解析' : '查看解析'}</button>
        </div>` : `<button class="btn primary sm-inline-submit" data-inline-submit="${question.id}">提交答案</button>`}
        ${checked && analysisOpen ? `<div class="sm-inline-analysis"><p>${escapeHtml(question.analysis)}</p>${renderQuestionMedia(question, 'analysis')}${question.optionAnalysis?.length ? `<ul>${question.optionAnalysis.map((item, optionIndex) => `<li><strong>${LETTERS[optionIndex]}.</strong> ${escapeHtml(item)}</li>`).join('')}</ul>` : ''}</div>` : ''}
        <div class="sm-inline-nav">
          <button data-inline-move="-1" ${index === 0 ? 'disabled' : ''}>← 上一题</button>
          <span>${index + 1} / ${pools[tab].length}</span>
          <button data-inline-move="1" ${index === pools[tab].length - 1 ? 'disabled' : ''}>下一题 →</button>
        </div>
      </div>
    </section>`;
}

function sameAnswer(left, right) {
  return [...left].sort().join(',') === [...right].sort().join(',');
}

function gradeInlineQuestion(subjectId, question, selected) {
  if (inlineChecked.has(question.id)) return;
  inlineAnswers.set(question.id, selected);
  inlineChecked.add(question.id);
  const correct = sameAnswer(selected, question.answer);
  if (correct) recordCorrect(subjectId, question.id);
  else recordWrong(subjectId, question.id);
  const stats = loadStats(subjectId);
  stats.done = Number(stats.done) || 0;
  stats.correct = Number(stats.correct) || 0;
  stats.byChapter ||= {};
  stats.done++;
  if (correct) stats.correct++;
  if (!stats.byChapter[question.chapterId]) stats.byChapter[question.chapterId] = { done: 0, correct: 0 };
  stats.byChapter[question.chapterId].done = (Number(stats.byChapter[question.chapterId].done) || 0) + 1;
  if (correct) stats.byChapter[question.chapterId].correct = (Number(stats.byChapter[question.chapterId].correct) || 0) + 1;
  saveStats(subjectId, stats);
  persistInlineProgress(subjectId);
}

function renderRelated(k) {
  const relatedK = k.relatedKnowledge || [];
  const relatedQ = k.relatedQuestions || [];
  const relatedMockQ = k.relatedMockQuestions || [];
  const allK = state.knowledge;
  const questionById = new Map(state.questions.map(question => [question.id, question]));

  if (!relatedK.length && !relatedQ.length && !relatedMockQ.length) return '';

  return `
    <div class="sm-related">
      ${relatedK.length ? `
        <div class="sm-rel-block">
          <div class="sm-rel-title">相关知识点</div>
          <div class="sm-rel-links">
            ${relatedK.map(id => {
              const rk = allK.find(x => x.id === id);
              if (!rk) return '';
              return `<a class="sm-rel-link" href="#/${state.subjectId}/study?chapter=${encodeURIComponent(rk.chapterId)}&knowledge=${encodeURIComponent(id)}">
                ${escapeHtml(rk.title)} <span class="sm-rel-arrow">→</span>
              </a>`;
            }).join('')}
          </div>
        </div>` : ''}
      ${relatedQ.length ? `
        <div class="sm-rel-block">
          <div class="sm-rel-title">相关真题 <a class="sm-rel-practice" href="#/${state.subjectId}/practice?mode=practice&bank=past&knowledge=${k.id}">练习本知识点 →</a></div>
          <div class="sm-rel-links sm-rel-q-links">
            ${relatedQ.map(id => {
              const question = questionById.get(id);
              if (!question) return '';
              const session = question.examSession === 'h1' ? '上半年' : question.examSession === 'h2' ? '下半年' : question.examSession;
              return `<a class="sm-rel-q" href="#/${state.subjectId}/practice?mode=practice&question=${id}">${question.examYear}年${escapeHtml(session)} 第${question.questionNo}题</a>`;
            }).join('')}
          </div>
        </div>` : ''}
      ${relatedMockQ.length ? `
        <div class="sm-rel-block">
          <div class="sm-rel-title">模拟练习</div>
          <div class="sm-rel-links sm-rel-q-links">
            ${relatedMockQ.map(id => `<a class="sm-rel-q" href="#/${state.subjectId}/practice?mode=practice&question=${id}">模拟题</a>`).join('')}
          </div>
        </div>` : ''}
    </div>
  `;
}

function bindStudy(subjectId, current) {
  const nav = document.getElementById('studyNav');
  const rerender = () => renderStudy(subjectId, {}, { preserveNav: true, revealNav: false });

  function refreshGroup(chapterId, expanded) {
    const group = [...document.querySelectorAll('.sn-group')]
      .find(item => item.dataset.chapter === chapterId);
    if (!group) return;
    const button = group.querySelector('[data-chapter-toggle]');
    const list = group.querySelector('.sn-list');
    const arrow = group.querySelector('.sn-arrow');
    if (button) button.setAttribute('aria-expanded', String(expanded));
    if (list) list.hidden = !expanded;
    if (arrow) arrow.textContent = expanded ? '▾' : '▸';
  }

  function setExpanded(chapterId, expanded) {
    if (expanded) expandedChapters.add(chapterId);
    else expandedChapters.delete(chapterId);
    refreshGroup(chapterId, expanded);
  }

  document.querySelectorAll('[data-chapter-toggle]').forEach(button => {
    button.addEventListener('click', () => {
      const chapterId = button.dataset.chapterToggle;
      setExpanded(chapterId, !expandedChapters.has(chapterId));
    });
  });

  document.querySelectorAll('[data-nav-action]').forEach(button => {
    button.addEventListener('click', () => {
      const action = button.dataset.navAction;
      if (action === 'expand') {
        document.querySelectorAll('.sn-group').forEach(group => {
          setExpanded(group.dataset.chapter, true);
        });
      } else if (action === 'collapse') {
        expandedChapters.clear();
        document.querySelectorAll('.sn-group').forEach(group => {
          setExpanded(group.dataset.chapter, false);
        });
      } else if (action === 'locate') {
        setExpanded(current.chapterId, true);
        ensureNavItemVisible(document.querySelector('.sn-item.active'), true);
      }
    });
  });

  document.querySelectorAll('.sn-item').forEach(link => {
    link.addEventListener('click', () => {
      currentKnowledgeId = link.dataset.id;
      mobileNavOpen = false;
    });
  });

  const navToggle = document.getElementById('studyNavToggle');
  const positionMobileNav = () => {
    if (!nav || !mobileNavOpen) return;
    const topbar = document.querySelector('.topbar');
    const topbarBottom = topbar?.getBoundingClientRect?.().bottom || 64;
    const top = Math.round(topbarBottom + 8);
    nav.style.top = `${top}px`;
    nav.style.maxHeight = `${Math.max(240, window.innerHeight - top - 12)}px`;
  };
  navToggle?.addEventListener('click', () => {
    mobileNavOpen = !mobileNavOpen;
    navToggle.setAttribute('aria-expanded', String(mobileNavOpen));
    nav?.classList.toggle('open', mobileNavOpen);
    positionMobileNav();
  });
  if (mobileNavOpen) {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(positionMobileNav);
    else positionMobileNav();
  }

  if (!navKeyHandlerInstalled && typeof document.addEventListener === 'function') {
    navKeyHandlerInstalled = true;
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeMobileNav();
    });
  }

  document.getElementById('markReadBtn')?.addEventListener('click', () => {
    const s = loadStudyProgress(subjectId);
    const set = new Set(s.readIds || []);
    if (set.has(current.id)) set.delete(current.id);
    else set.add(current.id);
    saveStudyProgress(subjectId, {
      readIds: [...set],
      lastId: current.id,
      lastByChapter: { ...(s.lastByChapter || {}), [current.chapterId]: current.id }
    });
    rerender();
  });

  document.querySelectorAll('[data-inline-tab]').forEach(button => {
    button.addEventListener('click', () => {
      inlineTabs.set(current.id, button.dataset.inlineTab);
      rerender();
    });
  });

  document.querySelectorAll('.sm-inline-card input').forEach(input => {
    input.addEventListener('change', () => {
      const card = input.closest('.sm-inline-card');
      const questionId = card.dataset.question;
      const question = state.questions.find(item => item.id === questionId);
      const selected = [...card.querySelectorAll('input:checked')].map(item => Number(item.value));
      inlineAnswers.set(questionId, selected);
      persistInlineProgress(subjectId);
      card.querySelectorAll('.sm-inline-options label').forEach(label => {
        label.classList.toggle('selected', label.querySelector('input').checked);
      });
      if (question.type === 'single') {
        gradeInlineQuestion(subjectId, question, selected);
        rerender();
      }
    });
  });

  document.querySelector('[data-inline-submit]')?.addEventListener('click', buttonEvent => {
    const questionId = buttonEvent.currentTarget.dataset.inlineSubmit;
    const question = state.questions.find(item => item.id === questionId);
    const selected = [...document.querySelectorAll(`.sm-inline-card[data-question="${questionId}"] input:checked`)]
      .map(input => Number(input.value));
    if (!selected.length) {
      alert('请先选择答案。');
      return;
    }
    gradeInlineQuestion(subjectId, question, selected);
    rerender();
  });

  document.querySelector('[data-inline-analysis]')?.addEventListener('click', event => {
    const questionId = event.currentTarget.dataset.inlineAnalysis;
    if (inlineAnalysisOpen.has(questionId)) inlineAnalysisOpen.delete(questionId);
    else inlineAnalysisOpen.add(questionId);
    rerender();
  });

  document.querySelector('[data-inline-fav]')?.addEventListener('click', event => {
    const questionId = event.currentTarget.dataset.inlineFav;
    const favorites = loadFavorites(subjectId);
    if (favorites.has(questionId)) favorites.delete(questionId);
    else favorites.add(questionId);
    saveFavorites(subjectId, favorites);
    rerender();
  });

  document.querySelectorAll('[data-inline-move]').forEach(button => {
    button.addEventListener('click', () => {
      const tab = inlineTabs.get(current.id) || 'mock';
      const indexKey = `${current.id}:${tab}`;
      inlineIndexes.set(indexKey, (inlineIndexes.get(indexKey) || 0) + Number(button.dataset.inlineMove));
      rerender();
    });
  });
}

function prefersReducedMotion() {
  return typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function closeMobileNav() {
  if (!mobileNavOpen) return;
  mobileNavOpen = false;
  document.getElementById('studyNavToggle')?.setAttribute('aria-expanded', 'false');
  document.getElementById('studyNav')?.classList.remove('open');
}

/**
 * 只滚动目录自身，且仅在目标项不在可视区域时做最小移动。
 * 绝不调用 scrollIntoView 或 window.scrollTo，避免正文/页面被带动。
 */
function ensureNavItemVisible(item, smooth = true) {
  const nav = document.getElementById('studyNav');
  if (!nav || !item || typeof nav.getBoundingClientRect !== 'function') return;
  const navRect = nav.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  if (!navRect.height || !itemRect.height) return;

  const toolbar = nav.querySelector('.sn-toolbar');
  const toolbarHeight = toolbar?.getBoundingClientRect().height || 0;
  const visibleTop = navRect.top + toolbarHeight;
  const visibleBottom = navRect.bottom;
  let delta = 0;
  if (itemRect.top < visibleTop) {
    delta = itemRect.top - visibleTop - 8;
  } else if (itemRect.bottom > visibleBottom) {
    delta = itemRect.bottom - visibleBottom + 8;
  }
  if (!delta) return;

  const behavior = smooth && !prefersReducedMotion() ? 'smooth' : 'auto';
  if (typeof nav.scrollTo === 'function') {
    nav.scrollTo({ top: nav.scrollTop + delta, behavior });
  } else {
    nav.scrollTop += delta;
  }
}

function renderContent(text) {
  if (!text) return '';
  return text.split('\n\n').map(p => {
    let html = escapeHtml(p).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    if (/^### /.test(p)) return `<h4 class="sm-h4">${html.replace(/^### /, '')}</h4>`;
    if (/^## /.test(p)) return `<h3 class="sm-h3">${html.replace(/^## /, '')}</h3>`;

    if (/^- /m.test(p) || /^&gt; /m.test(p)) {
      const items = html.split('\n')
        .filter(l => l.trim().startsWith('- ') || l.trim().startsWith('&gt; '))
        .map(l => l.replace(/^(-\s+|&gt;\s+)/, '').trim())
        .filter(Boolean);
      if (items.length) return `<ul class="sm-ul">${items.map(t => `<li>${t}</li>`).join('')}</ul>`;
    }

    return `<p class="sm-p">${html.replace(/\n/g, '<br>')}</p>`;
  }).join('');
}

function renderFrequencyChip(item) {
  const stats = item.examStats;
  if (stats && Number(stats.paperCount) < 5) {
    const paperCount = Number(stats.paperCount) || 0;
    const questionCount = Number(stats.questionCount) || 0;
    const label = paperCount === 0 ? '暂无历史真题样本' : `历史样本命中 ${questionCount} 题`;
    return `<span class="sm-chip freq-sample" title="历史真题样本少于 5 套，不据此标注考试频次">${label}</span>`;
  }
  return item.frequency
    ? `<span class="sm-chip ${freqToClass(item.frequency)}">${escapeHtml(item.frequency)}</span>`
    : '';
}

function freqToClass(freq) {
  if (!freq) return '';
  if (freq.includes('高频')) return 'freq-high';
  if (freq.includes('中高')) return 'freq-midhigh';
  if (freq.includes('中频')) return 'freq-mid';
  return '';
}
