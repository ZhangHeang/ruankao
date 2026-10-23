import { state } from '../state.js';
import { escapeHtml, shuffle } from '../utils.js';
import { loadSubject } from '../loader.js';
import { renderTopbar } from '../components/topbar.js';
import { loadCaseDraftKeys, caseDraftPrefix } from '../storage.js';

const VARIANT_LABEL = {
  original: '原卷',
  recollection: '回忆版',
  transcription: '转录版',
  unknown: '来源待核验'
};

const SESSION_LABEL = { h1: '上半年', h2: '下半年' };

function paperTitle(paper) {
  const batch = paper.examBatch ? `第 ${paper.examBatch} 批` : '';
  const region = paper.region === 'gd' ? '广东卷' : '';
  return `${paper.examYear} 年${SESSION_LABEL[paper.examSession] || ''}${batch}${region} 案例分析`;
}

function draftKey(paperId, caseNo, problemNo) {
  return `case-draft:${state.subjectId}:${paperId}:${caseNo}:${problemNo}`;
}

function readDraft(key) {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}

function saveDraft(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage may be unavailable */ }
}

function normalizeStemLine(line) {
  return String(line || '').replace(/\s+/g, ' ').trim();
}

function tableColumnCore(column) {
  return normalizeStemLine(column).replace(/[（(].*$/, '').trim();
}

function looksLikeTableIntro(line) {
  return /如下表|下表|所示/.test(line) || /[：:]\s*$/.test(line);
}

function tableRange(lines, table) {
  const columns = (table.columns || [])
    .map(tableColumnCore)
    .filter(Boolean);
  const title = normalizeStemLine(table.title);
  let start = title
    ? lines.findIndex(line => line.includes(title))
    : -1;
  if (start === -1) {
    let bestCount = 0;
    lines.forEach((line, index) => {
      const count = columns.filter(column => line.includes(column)).length;
      if (count > bestCount) {
        bestCount = count;
        start = index;
      }
    });
    if (bestCount < 2) start = -1;
  }
  if (start === -1) {
    const firstCell = normalizeStemLine((table.rows || [])[0]?.[0]);
    if (!firstCell) return null;
    start = lines.findIndex(line => line.includes(firstCell));
    if (start === -1) return null;
  }
  if (looksLikeTableIntro(lines[start].trim())) {
    const firstCell = normalizeStemLine((table.rows || [])[0]?.[0]);
    const nextStart = lines.findIndex(
      (line, index) => index > start
        && index <= start + 4
        && (columns.some(column => line.includes(column))
          || (firstCell && line.includes(firstCell)))
    );
    if (nextStart !== -1) start = nextStart;
  }
  while (start > 0) {
    const previous = lines[start - 1].trim();
    if (!previous || previous.length > 8) break;
    const isHeaderFragment = columns.some(
      column => column.includes(previous) || previous.includes(column)
    );
    if (!isHeaderFragment) break;
    start -= 1;
  }

  const lastRow = (table.rows || []).at(-1) || [];
  const lastCell = normalizeStemLine(lastRow[0]);
  if (!lastCell) return null;
  const lastValues = lastRow.slice(1).map(normalizeStemLine).filter(Boolean);
  let end = -1;
  for (let index = lines.length - 1; index >= start; index -= 1) {
    const line = lines[index];
    if (!line.includes(lastCell)) continue;
    if (!lastValues.length || lastValues.some(value => line.includes(value))) {
      end = index;
      break;
    }
  }
  if (end === -1) {
    for (let index = lines.length - 1; index >= start; index -= 1) {
      if (lines[index].includes(lastCell)) {
        end = index;
        break;
      }
    }
  }
  return end >= start ? { start, end } : null;
}

function stemForDisplay(item) {
  if (item.stemDisplay) return item.stemDisplay;
  const text = item.stem || '';
  const tables = (item.tables || []).filter(
    table => (table.placement || 'stem') !== 'problem'
  );
  if (!tables.length) return text;

  const lines = text.split('\n');
  const ranges = tables
    .map(table => tableRange(lines, table))
    .filter(Boolean)
    .sort((left, right) => left.start - right.start);
  if (!ranges.length) return text;

  const merged = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end + 1) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  const display = [];
  let cursor = 0;
  for (const range of merged) {
    display.push(...lines.slice(cursor, range.start));
    display.push('（表格见下方结构化数据）');
    cursor = range.end + 1;
  }
  display.push(...lines.slice(cursor));
  return display.join('\n');
}

function problemForDisplay(item, problem) {
  let text = problem.text || '';
  const hasTable = (item.tables || []).some(
    table => table.placement === 'problem' && table.problem === problem.number
  );
  if (!hasTable) return text;
  const match = text.match(/如下表|下表/);
  if (!match) return text;
  let cut = text.indexOf('\n', match.index + match[0].length);
  if (cut === -1) {
    const sentenceEnd = text.indexOf('。', match.index + match[0].length);
    cut = sentenceEnd === -1 ? -1 : sentenceEnd + 1;
  }
  if (cut === -1) return text;
  const rest = text.slice(cut);
  const nextSub = rest.search(/(^|\n)\s*[（(]\s*\d+\s*[)）]/);
  const tail = nextSub === -1 ? '' : rest.slice(nextSub).replace(/^\n/, '');
  return `${text.slice(0, cut)}\n（表格见下方结构化数据）${tail ? `\n${tail}` : ''}`;
}

function tablesFor(item, placement, problemNo) {
  return (item.tables || []).filter(table => {
    if (placement === 'problem') {
      return table.placement === 'problem' && table.problem === problemNo;
    }
    return table.placement !== 'problem';
  });
}

function renderStemMedia(item) {
  const unique = [];
  const seen = new Set();
  for (const media of item.stemMedia || []) {
    if (!media.src || seen.has(media.src)) continue;
    seen.add(media.src);
    unique.push(media);
  }
  if (!unique.length) return '';
  return `
    <div class="case-answer-media case-stem-media">
      <h4>题干图表（源页）</h4>
      ${unique.map(media => `
        <figure>
          <img src="${escapeHtml(media.src)}" alt="${escapeHtml(media.alt || '题干源页图表')}" loading="lazy">
          <figcaption>${escapeHtml(media.caption || `源页 ${media.sourcePage}`)}</figcaption>
        </figure>
      `).join('')}
    </div>
  `;
}

function renderAnswerMedia(item, uid = item.caseNo) {
  const unique = [];
  const seen = new Set();
  for (const media of item.answerMedia || []) {
    if (!media.src || seen.has(media.src)) continue;
    seen.add(media.src);
    unique.push(media);
  }
  if (!unique.length) return '';
  return `
    <div class="case-answer-media" id="case-media-${uid}" hidden>
      <h4>参考答案图表（源页）</h4>
      ${unique.map(media => `
        <figure>
          <img src="${escapeHtml(media.src)}" alt="${escapeHtml(media.alt || '参考答案源页')}" loading="lazy">
          <figcaption>${escapeHtml(media.caption || `源页 ${media.sourcePage}`)}</figcaption>
        </figure>
      `).join('')}
    </div>
  `;
}

function correctionBlocks(item, problem) {
  return (item.reviewCorrections || []).filter(
    correction => !correction.problem || correction.problem === problem.number
  );
}

function renderConflictWarnings(corrections) {
  return corrections
    .filter(correction => correction.type === 'source_internal_conflict')
    .map(correction => {
      const resolved = correction.resolutionStatus === 'resolved';
      return `
        <div class="case-conflict ${resolved ? '' : 'case-conflict-unresolved'}">
          <strong>${resolved ? '复核结论（以此为准，不改写源答案）' : '来源矛盾未解决（请勿作为判分依据）'}</strong>
          ${resolved && correction.resolvedAnswer ? `<p class="case-conflict-answer">${escapeHtml(correction.resolvedAnswer)}</p>` : ''}
          <p>${escapeHtml(correction.resolutionNote || correction.reviewNote || '')}</p>
          <details>
            <summary>查看源答案原文</summary>
            <p>${escapeHtml(correction.sourceText || '')}</p>
          </details>
        </div>
      `;
    })
    .join('');
}

function renderOtherCorrections(corrections) {
  return corrections
    .filter(correction => correction.type !== 'source_internal_conflict')
    .map(correction => `
      <div class="case-correction">
        <strong>复核说明（不改写源答案）</strong>
        <p>源文：${escapeHtml(correction.sourceText || '')}</p>
        <p>${escapeHtml(correction.reviewNote || '')}</p>
      </div>
    `)
    .join('');
}

function renderTables(tables) {
  return (tables || []).map(table => `
    <div class="case-table-wrap">
      <div class="case-table-title">${escapeHtml(table.title || '表格')} <span class="tag ghost">源页 ${table.sourcePage}</span></div>
      <table class="case-table">
        <thead><tr>${(table.columns || []).map(cell => `<th>${escapeHtml(cell)}</th>`).join('')}</tr></thead>
        <tbody>${(table.rows || []).map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
  `).join('');
}

function renderProblems(item, paper, uid = item.caseNo) {
  return (item.problems || []).map(problem => {
    const key = draftKey(paper.id, item.caseNo, problem.number);
    const points = (problem.scoringPoints || []).length
      ? `<p class="case-muted">以下要点整理自源卷参考答案，非官方评分细则。</p><ul class="case-points">${problem.scoringPoints.map(point => `<li>${escapeHtml(point)}</li>`).join('')}</ul>`
      : '<p class="case-muted">源答案未分条标注答案要点，以上为源卷参考答案，仅供复盘对照。</p>';
    const corrections = correctionBlocks(item, problem);
    const hasConflict = corrections.some(correction => correction.type === 'source_internal_conflict');
    return `
      <div class="case-problem">
        <div class="case-problem-head">
          <strong>问题 ${problem.number}</strong>
          <span class="tag">${problem.score} 分</span>
        </div>
        <div class="case-problem-text">${escapeHtml(problemForDisplay(item, problem))}</div>
        ${renderTables(tablesFor(item, 'problem', problem.number))}
        <textarea class="case-input" data-key="${escapeHtml(key)}" rows="3" placeholder="在这里写下你的作答思路（仅保存在本机）"></textarea>
        <div class="case-answer" id="answer-${uid}-${problem.number}" hidden>
          ${renderConflictWarnings(corrections)}
          <div class="case-answer-title">${hasConflict ? '源答案原文（保留，存在已知矛盾）' : '参考答案'}</div>
          <div class="case-answer-body">${escapeHtml(problem.answerAnalysis || '源文件未提供参考答案')}</div>
          <div class="case-answer-title">参考答案 / 答案要点</div>
          ${points}
          ${renderOtherCorrections(corrections)}
        </div>
      </div>
    `;
  }).join('');
}

function renderCaseCard(item, paper, uid = item.caseNo, sourceLabel = '') {
  return `
    <section class="case-block" data-case-block="${uid}">
      <div class="case-block-head">
        <h3>${escapeHtml(item.label || `试题${item.caseNo}`)}</h3>
        <span class="tag">${item.score} 分</span>
      </div>
      ${sourceLabel ? `<p class="case-source">${escapeHtml(sourceLabel)}</p>` : ''}
      <p class="case-instruction">${escapeHtml(item.instruction || '')}</p>
      <div class="case-stem">${escapeHtml(stemForDisplay(item))}</div>
      ${renderStemMedia(item)}
      ${renderTables(tablesFor(item, 'stem'))}
      ${renderProblems(item, paper, uid)}
      ${renderAnswerMedia(item, uid)}
      ${(item.reviewNotes || []).length ? `
        <div class="case-notes" id="answer-${uid}-notes" hidden>
          <strong>案例复核备注</strong>
          <ul>${item.reviewNotes.map(note => `<li>${escapeHtml(note)}</li>`).join('')}</ul>
        </div>` : ''}
      <button class="btn primary case-reveal" data-case="${uid}">查看参考答案 / 答案要点</button>
    </section>
  `;
}

function renderCaseDetail(payload) {
  const paper = payload.paper;
  const cases = (payload.cases || []).map(item => renderCaseCard(item, paper)).join('');

  document.getElementById('app').innerHTML = `
    ${renderTopbar('practice')}
    <main>
      <p class="case-back"><a href="#/${state.subjectId}/cases">← 返回案例卷列表</a></p>
      <div class="hero">
        <h2>${escapeHtml(paperTitle(paper))}</h2>
        <p>
          <span class="tag">${escapeHtml(VARIANT_LABEL[paper.sourceVariant] || paper.sourceVariant)}</span>
          <span class="tag ghost">${paper.caseCount} 个案例 · ${paper.problemCount} 个小问 · ${paper.totalScore} 分</span>
        </p>
      </div>
      <div class="panel case-intro">
        <p>本页为自测复盘：请先独立作答，再展开参考答案。系统不自动判分，参考答案与答案要点整理自已复核的源卷解析，并非官方评分细则；来源真实性状态为 pending，不宣称官方原卷。</p>
      </div>
      ${cases}
    </main>
  `;

  bindCasePage();
}

function bindCasePage() {
  document.querySelectorAll('.case-input').forEach(input => {
    input.value = readDraft(input.dataset.key);
    input.addEventListener('input', () => saveDraft(input.dataset.key, input.value));
  });
  document.querySelectorAll('.case-reveal').forEach(button => {
    button.addEventListener('click', () => {
      const caseKey = button.dataset.case;
      const blocks = document.querySelectorAll(`[id^="answer-${caseKey}-"]`);
      const media = document.getElementById(`case-media-${caseKey}`);
      const willShow = button.textContent.startsWith('查看');
      blocks.forEach(block => { block.hidden = !willShow; });
      if (media) media.hidden = !willShow;
      button.textContent = willShow ? '收起参考答案 / 答案要点' : '查看参考答案 / 答案要点';
    });
  });
}

function completeCaseEntries() {
  return state.cases.flatMap(item =>
    (item.cases || [])
      .filter(entry => entry.problems?.length)
      .map(entry => ({ paper: item.paper, case: entry }))
  );
}

function caseMatches(entry, { chapter, knowledgeIds }) {
  const mapping = entry.case.knowledgeMapping || {};
  if (chapter && !(mapping.chapterIds || []).includes(chapter)) return false;
  if (knowledgeIds.length && !knowledgeIds.some(id => (mapping.knowledgeIds || []).includes(id))) return false;
  return true;
}

function caseHasDraft(entry, draftKeys) {
  const prefix = caseDraftPrefix(state.subjectId, entry.paper.id, entry.case.caseNo);
  return [...draftKeys].some(key => key.startsWith(prefix));
}

function filterCaseEntries(query) {
  const bank = query.bank || '';
  const chapter = query.chapter || '';
  const knowledgeIds = String(query.knowledge || '').split(',').filter(Boolean);
  const scope = query.scope || 'all';
  const draftKeys = loadCaseDraftKeys(state.subjectId);
  return completeCaseEntries().filter(entry => {
    if (bank && entry.paper.bankType !== bank) return false;
    if (!caseMatches(entry, { chapter, knowledgeIds })) return false;
    if (scope === 'undone' && caseHasDraft(entry, draftKeys)) return false;
    return true;
  });
}

function filterSummary(query) {
  const parts = [];
  const chapter = state.chapters.find(item => item.id === query.chapter);
  if (chapter) parts.push(chapter.name);
  const knowledgeIds = String(query.knowledge || '').split(',').filter(Boolean);
  if (knowledgeIds.length) parts.push(`${knowledgeIds.length} 个知识点`);
  if (query.bank === 'past') parts.push('历年真题案例');
  else if (query.bank === 'mock') parts.push('模拟案例');
  if (query.scope === 'undone') parts.push('仅未做（无草稿）');
  return parts.join(' · ') || '全部已发布案例';
}

function renderCaseSet(subjectId, query) {
  const isSpecial = query.set === 'special';
  const entries = filterCaseEntries(query);
  const requested = Number.parseInt(query.count, 10) || 2;
  const selected = shuffle(entries).slice(0, requested);
  const title = isSpecial ? '案例专项练习' : '随机案例练习';
  const insufficient = entries.length < requested;

  if (!selected.length) {
    document.getElementById('app').innerHTML = `
      ${renderTopbar('practice')}
      <main>
        <p class="case-back"><a href="#/${subjectId}/practice">← 返回练习中心</a></p>
        <div class="panel">
          <h3>没有可用的完整案例</h3>
          <p>筛选条件：${escapeHtml(filterSummary(query))}。</p>
          <p>当前没有匹配的完整案例。请返回练习中心减少知识点、切换来源或把范围改为“全部”；系统不会用不完整案例或重复案例凑数。</p>
          <p><a class="btn primary" href="#/${subjectId}/practice">返回练习中心</a></p>
        </div>
      </main>`;
    return;
  }

  const cards = selected.map((entry, index) =>
    renderCaseCard(entry.case, entry.paper, `set${index + 1}`, `摘自 ${paperTitle(entry.paper)} · 案例 ${entry.case.caseNo}`)
  ).join('');

  document.getElementById('app').innerHTML = `
    ${renderTopbar('practice')}
    <main>
      <p class="case-back"><a href="#/${subjectId}/practice">← 返回练习中心</a></p>
      <div class="hero">
        <h2>${title}</h2>
        <p>${escapeHtml(filterSummary(query))}${isSpecial ? ' · 整案保留' : ' · 随机抽取完整案例'}</p>
      </div>
      ${insufficient ? `<div class="practice-warning">当前可用 ${entries.length} 个完整案例，少于所选 ${requested} 个；本页使用全部 ${entries.length} 个，未重复抽取。</div>` : ''}
      <div class="panel case-intro">
        <p>${isSpecial ? '专项案例按整案保留：只要案例关联到所选章节或任一知识点，就纳入共享题干和全部小问。' : '随机案例练习按整案抽取，不按标准案例卷的题量与分值结构重组，因此不称为标准模拟考试。'}</p>
        <p>案例分析不自动判分；作答草稿仅保存在本机。参考答案按完整案例展开，展开前不会显示答案要点或复核备注。答案要点整理自源卷参考答案，并非官方评分细则。</p>
      </div>
      ${cards}
    </main>
  `;

  bindCasePage();
}

function renderCaseList(subjectId) {
  const papers = state.cases;
  const rows = papers.map(paper => `
    <a class="case-paper" href="#/${subjectId}/cases?paper=${encodeURIComponent(paper.paper.id)}">
      <div>
        <strong>${escapeHtml(paperTitle(paper.paper))}</strong>
        <p class="case-muted">${paper.paper.caseCount} 个案例 · ${paper.paper.problemCount} 个小问 · ${paper.paper.totalScore} 分 · ${escapeHtml(VARIANT_LABEL[paper.paper.sourceVariant] || paper.paper.sourceVariant)}</p>
      </div>
      <span class="btn">进入</span>
    </a>
  `).join('');

  document.getElementById('app').innerHTML = `
    ${renderTopbar('practice')}
    <main>
      <div class="hero">
        <h2>案例分析</h2>
        <p>按考试批次练习案例小问，作答后对照参考答案与答案要点复盘。</p>
      </div>
      <div class="panel">
        <h3>已发布案例卷</h3>
        ${rows || '<div class="empty">暂无已发布案例卷</div>'}
      </div>
    </main>
  `;
}

export async function renderCases(subjectId, query = {}) {
  if (state.subjectId !== subjectId || !state.cases.length) {
    await loadSubject(subjectId);
  }
  if (!state.cases.length) {
    document.getElementById('app').innerHTML = `
      ${renderTopbar('practice')}
      <main><div class="panel"><h3>案例练习</h3><p>该科目暂未发布案例卷。</p></div></main>
    `;
    return;
  }
  const paperId = query.paper;
  if (query.set === 'random' || query.set === 'special') {
    renderCaseSet(subjectId, query);
    return;
  }
  if (!paperId) {
    renderCaseList(subjectId);
    return;
  }
  const paper = state.cases.find(item => item.paper.id === paperId);
  if (!paper) {
    document.getElementById('app').innerHTML = `
      ${renderTopbar('practice')}
      <main><div class="panel"><h3>未找到案例卷</h3><p><a href="#/${subjectId}/cases">返回列表</a></p></div></main>
    `;
    return;
  }
  renderCaseDetail(paper);
}
