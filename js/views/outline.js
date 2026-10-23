import { state } from '../state.js';
import { escapeHtml } from '../utils.js';
import { loadSubject } from '../loader.js';
import { renderTopbar } from '../components/topbar.js';

let selectedSyllabusVersion = null;

export async function renderOutline(subjectId) {
  if (state.subjectId !== subjectId || (!state.outline && !state.syllabi)) {
    await loadSubject(subjectId);
  }
  if (state.syllabi?.versions?.length) {
    renderSyllabi(subjectId);
    return;
  }
  const outline = state.outline;
  if (!outline) {
    document.getElementById('app').innerHTML = `
      ${renderTopbar('outline')}
      <main><div class="panel"><h3>暂无大纲数据</h3></div></main>`;
    return;
  }

  const exam = outline.exam || {};
  const chapters = outline.chapters || [];

  document.getElementById('app').innerHTML = `
    ${renderTopbar('outline')}
    <main>
      <section class="ol-hero">
        <div class="ol-hero-tag">考试大纲</div>
        <h1>${escapeHtml(exam.name || state.subjectMeta.name)}</h1>
        <p class="ol-hero-sub">${escapeHtml(exam.structure || '')}</p>
        <div class="ol-hero-meta">
          <div class="ol-meta-item">
            <span class="ol-meta-label">级别</span>
            <span class="ol-meta-val">${escapeHtml(exam.level || '')}</span>
          </div>
          <div class="ol-meta-item">
            <span class="ol-meta-label">科目</span>
            <span class="ol-meta-val">${(exam.subjects || []).length} 科</span>
          </div>
          <div class="ol-meta-item">
            <span class="ol-meta-label">合格线</span>
            <span class="ol-meta-val">${exam.passingScore || 45} 分</span>
          </div>
          <div class="ol-meta-item">
            <span class="ol-meta-label">考试时间</span>
            <span class="ol-meta-val">${escapeHtml((exam.examTime || '').replace('每年', ''))}</span>
          </div>
        </div>
      </section>

      <section class="ol-section">
        <div class="ol-section-head">
          <h2>章节串讲</h2>
          <span class="ol-section-desc">共 ${chapters.length} 章 · 点击卡片展开</span>
        </div>
        <div class="ol-timeline">
          ${chapters.map((ch, i) => renderChapter(ch, i + 1)).join('')}
        </div>
      </section>
    </main>
  `;

  document.querySelectorAll('.ol-chapter').forEach(el => {
    el.querySelector('.ol-ch-head').addEventListener('click', () => {
      el.classList.toggle('open');
    });
  });
}

function renderSyllabi(subjectId) {
  const dataset = state.syllabi;
  const versions = dataset.versions || [];
  if (!versions.some(version => version.id === selectedSyllabusVersion)) {
    selectedSyllabusVersion = dataset.defaultVersionId || versions[versions.length - 1]?.id;
  }
  const version = versions.find(item => item.id === selectedSyllabusVersion) || versions[0];
  const exam = version.exam || {};
  const sources = version.sources || [];

  document.getElementById('app').innerHTML = `
    ${renderTopbar('outline')}
    <main>
      <section class="ol-hero syllabus-hero">
        <div class="ol-hero-tag">多版本考试大纲</div>
        <h1>${escapeHtml(state.subjectMeta.name)}</h1>
        <p class="ol-hero-sub">默认展示现行大纲，可切换历年版本并查看修订趋势。</p>
        <div class="syllabus-version-tabs">
          ${versions.map(item => `<button class="${item.id === version.id ? 'active' : ''}" data-syllabus-version="${item.id}">
            ${escapeHtml(item.label)}${item.status === 'current' ? '<span>现行</span>' : ''}
          </button>`).join('')}
        </div>
        <div class="ol-hero-meta">
          <div class="ol-meta-item"><span class="ol-meta-label">版本</span><span class="ol-meta-val">第 ${version.edition} 版</span></div>
          <div class="ol-meta-item"><span class="ol-meta-label">审定年份</span><span class="ol-meta-val">${version.approvalYear}</span></div>
          <div class="ol-meta-item"><span class="ol-meta-label">适用区间</span><span class="ol-meta-val">${escapeHtml(formatEffectiveRange(version))}</span></div>
          <div class="ol-meta-item"><span class="ol-meta-label">大纲条目</span><span class="ol-meta-val">${version.entryCount}</span></div>
        </div>
      </section>

      <section class="syllabus-notice ${version.verification === 'secondary_transcription' ? 'pending' : ''}">
        <strong>${version.verification === 'secondary_transcription' ? '公开转录版' : '已与官方出版信息交叉核验'}</strong>
        <span>${escapeHtml(version.sourceNote || '')}</span>
      </section>

      <section class="ol-section syllabus-overview">
        <div class="ol-section-head"><h2>考试说明</h2><span class="ol-section-desc">目标、能力要求与科目设置</span></div>
        <details class="syllabus-goal"><summary>考试目标</summary><p>${escapeHtml(exam.goal || '暂无')}</p></details>
        <div class="syllabus-info-grid">
          <div class="panel"><h3>考试要求</h3><ol>${(exam.requirements || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol></div>
          <div class="panel"><h3>考试科目</h3><ol>${(exam.subjects || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol></div>
        </div>
      </section>

      <section class="ol-section">
        <div class="ol-section-head"><h2>考试范围</h2><span class="ol-section-desc">按官方层级展开 · 共 ${version.entryCount} 条</span></div>
        ${(version.papers || []).map(renderSyllabusPaper).join('')}
      </section>

      ${version.id === dataset.defaultVersionId ? renderCoverage(state.syllabusCoverage) : ''}

      ${version.id === dataset.defaultVersionId ? renderQuestionCoverage(state.questionCoverage) : ''}

      ${renderEvolution(dataset, version.id)}

      <section class="ol-section syllabus-sources">
        <div class="ol-section-head"><h2>版本来源</h2><span class="ol-section-desc">来源状态与访问日期随数据保存</span></div>
        <ul>${sources.map(source => `<li><span class="source-type ${source.type}">${source.type === 'official' ? '官方' : '转录'}</span><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.url)}</a><time>${escapeHtml(source.accessedAt || '')}</time></li>`).join('')}</ul>
      </section>
    </main>`;

  document.querySelectorAll('[data-syllabus-version]').forEach(button => {
    button.addEventListener('click', () => {
      selectedSyllabusVersion = button.dataset.syllabusVersion;
      renderSyllabi(subjectId);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

function renderCoverage(coverage) {
  if (!coverage?.summary) return '';
  const summary = coverage.summary;
  const statusText = { profiled: '正文已建设', catalogued: '已有知识目录', missing: '待建知识点' };
  return `<section class="ol-section syllabus-coverage">
    <div class="ol-section-head"><h2>内容建设覆盖</h2><span class="ol-section-desc">大纲 → 章节 → 知识点 → 题目</span></div>
    <div class="coverage-summary">
      <div><strong>${summary.syllabusEntries}</strong><span>大纲条目</span></div>
      <div><strong>${summary.entriesWithChapterBody}</strong><span>所在章节已有正文</span></div>
      <div><strong>${summary.chaptersProfiled}</strong><span>已建设正文章节</span></div>
      <div><strong>${summary.knowledgeMappedEntries}</strong><span>精确关联知识点</span></div>
    </div>
    <p class="coverage-policy">${escapeHtml(coverage.mappingPolicy?.knowledge || '')}</p>
    <div class="coverage-chapters">${coverage.chapters.map(chapter => `
      <article class="status-${chapter.status}">
        <div class="coverage-chapter-head"><span>第 ${chapter.syllabusCode} 章</span><em>${statusText[chapter.status] || chapter.status}</em></div>
        <h3>${escapeHtml(chapter.chapterName)}</h3>
        <div class="coverage-counts">
          <span>大纲 ${chapter.syllabusEntries}</span><span>正文 ${chapter.publishedKnowledge}/${chapter.knowledgePoints}</span>
          <span>真题 ${chapter.pastQuestions}</span><span>模拟 ${chapter.mockQuestions}</span>
        </div>
        <div class="coverage-bar"><i style="width:${chapter.syllabusEntries ? Math.round(chapter.exactMappedEntries / chapter.syllabusEntries * 100) : 0}%"></i></div>
        <small>精确映射 ${chapter.exactMappedEntries}/${chapter.syllabusEntries}</small>
        <a href="#/${state.subjectId}/study?chapter=${chapter.chapterId}">进入章节 →</a>
      </article>`).join('')}</div>
  </section>`;
}

function renderQuestionCoverage(data) {
  if (!data?.sample || !data?.coverage) return '';
  const sample = data.sample;
  const coverage = data.coverage;
  const confidenceText = {
    insufficient: '样本不足',
    limited: '有限参考',
    sufficient: '可作历史统计'
  };
  const maxQuestions = Math.max(...(data.chapters || []).map(item => item.questionCount), 1);
  const typeNames = { single: '单选题', multiple: '多选题', case: '案例题', essay: '论文题' };
  return `<section class="ol-section question-coverage">
    <div class="ol-section-head"><h2>真题覆盖统计</h2><span class="ol-section-desc">仅统计历年真题，不含模拟题</span></div>
    <div class="question-confidence status-${sample.confidence}">
      <strong>${confidenceText[sample.confidence] || sample.confidence}</strong>
      <span>${escapeHtml(data.notice || '')}</span>
    </div>
    <div class="coverage-summary question-summary">
      <div><strong>${sample.pastQuestions}</strong><span>已收录真题</span></div>
      <div><strong>${sample.completePaperCount}</strong><span>完整试卷</span></div>
      <div><strong>${coverage.chaptersHit}/${coverage.chaptersTotal}</strong><span>覆盖章节</span></div>
      <div><strong>${coverage.knowledgeHit}/${coverage.knowledgeTotal}</strong><span>覆盖知识点</span></div>
    </div>
    <div class="question-stat-grid">
      <article class="panel question-types">
        <h3>题型分布</h3>
        ${(data.questionTypes || []).map(item => `<div class="question-type-row">
          <span>${escapeHtml(typeNames[item.type] || item.type)}</span>
          <div><i style="width:${item.share}%"></i></div>
          <strong>${item.count} 题 · ${item.share}%</strong>
        </div>`).join('') || '<p class="muted">暂无题型数据</p>'}
      </article>
      <article class="panel question-method">
        <h3>统计口径</h3>
        <p><b>题量占比</b>：${escapeHtml(data.methodology?.questionShare || '')}</p>
        <p><b>历史出现率</b>：${escapeHtml(data.methodology?.appearanceRate || '')}</p>
        <p><b>趋势判断</b>：至少 ${data.methodology?.trendMinimumSample || 10} 套完整试卷后再分析升降趋势。</p>
      </article>
    </div>
    <div class="question-chapter-table">
      <div class="question-chapter-head"><span>章节</span><span>题量分布</span><span>题量占比</span><span>历史出现率</span></div>
      ${(data.chapters || []).map(chapter => `<div class="question-chapter-row">
        <span><b>${escapeHtml(chapter.chapterName)}</b><small>${chapter.knowledgeCovered}/${chapter.knowledgeTotal} 个知识点</small></span>
        <span class="question-bar"><i style="width:${Math.round(chapter.questionCount / maxQuestions * 100)}%"></i><em>${chapter.questionCount} 题</em></span>
        <span>${chapter.questionShare}%</span>
        <span class="rate-${chapter.appearanceRate == null ? 'pending' : 'ready'}">${chapter.appearanceRate == null ? '样本不足' : `${chapter.appearanceRate}%`}</span>
      </div>`).join('')}
    </div>
  </section>`;
}

function renderSyllabusPaper(paper) {
  const groups = [];
  let current = null;
  (paper.entries || []).forEach(entry => {
    if (entry.kind === 'heading' && entry.level === 1) {
      current = { head: entry, children: [] };
      groups.push(current);
    } else {
      if (!current) {
        current = { head: { code: '', title: '总体要求' }, children: [] };
        groups.push(current);
      }
      current.children.push(entry);
    }
  });
  return `<div class="syllabus-paper">
    <h3>${escapeHtml(paper.title)}</h3>
    <div class="syllabus-scope-list">${groups.map((group, index) => `
      <details ${index === 0 ? 'open' : ''}>
        <summary><strong>${escapeHtml(group.head.code || '')}</strong>${escapeHtml(group.head.title)}</summary>
        <div class="syllabus-scope-entries">${group.children.map(entry => `
          <div class="syllabus-entry level-${Math.min(entry.level || 2, 4)} ${entry.kind}">
            ${entry.code ? `<span>${escapeHtml(entry.code)}</span>` : '<i></i>'}<p>${escapeHtml(entry.title)}</p>
          </div>`).join('')}</div>
      </details>`).join('')}</div>
  </div>`;
}

function renderEvolution(dataset, selectedId) {
  const comparisons = dataset.comparisons || [];
  const trends = dataset.trends || [];
  return `<section class="ol-section syllabus-evolution">
    <div class="ol-section-head"><h2>大纲演变与趋势</h2><span class="ol-section-desc">事实变化与趋势判断分开展示</span></div>
    <div class="syllabus-comparisons">${comparisons.map(item => `
      <article class="${item.to === selectedId || item.from === selectedId ? 'related' : ''}">
        <span>${escapeHtml(versionLabel(dataset, item.from))} → ${escapeHtml(versionLabel(dataset, item.to))}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <ul>${item.changes.map(change => `<li>${escapeHtml(change)}</li>`).join('')}</ul>
        <a href="${escapeHtml(item.source)}" target="_blank" rel="noreferrer">查看修订依据</a>
      </article>`).join('')}</div>
    <div class="syllabus-trends">${trends.map(item => `<article class="${item.confidence === 'boundary' ? 'boundary' : ''}">
      <div><span>${item.confidence === 'high' ? '高可信' : '方法边界'}</span><small>${escapeHtml(item.basis)}</small></div>
      <h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p>
    </article>`).join('')}</div>
  </section>`;
}

function versionLabel(dataset, id) {
  return dataset.versions.find(version => version.id === id)?.label || id;
}

function formatEffectiveRange(version) {
  const from = String(version.effectiveFrom || '').replace('-h1', '上半年').replace('-h2', '下半年');
  const to = version.effectiveTo
    ? String(version.effectiveTo).replace('-h1', '上半年').replace('-h2', '下半年')
    : '至今';
  return `${from}—${to}`;
}

function renderChapter(ch, idx) {
  const mainLine = ch.mainLine || [];
  const keyPoints = ch.keyPoints || [];
  const freqClass = freqToClass(ch.frequency);

  return `
    <article class="ol-chapter" data-id="${ch.id}">
      <div class="ol-ch-line"></div>
      <div class="ol-ch-num">${String(idx).padStart(2, '0')}</div>
      <div class="ol-ch-body">
        <div class="ol-ch-head">
          <div class="ol-ch-title-wrap">
            <h3 class="ol-ch-title">${escapeHtml(ch.title)}</h3>
            <div class="ol-ch-tags">
              ${ch.frequency ? `<span class="ol-chip ${freqClass}">${escapeHtml(ch.frequency)}</span>` : ''}
              ${ch.weight ? `<span class="ol-chip ghost">${escapeHtml(ch.weight)}</span>` : ''}
            </div>
          </div>
          <span class="ol-ch-arrow">▾</span>
        </div>
        <div class="ol-ch-detail">
          <p class="ol-ch-intro">${escapeHtml(ch.intro || '')}</p>
          <div class="ol-ch-grid">
            ${mainLine.length ? `
              <div class="ol-ch-block">
                <div class="ol-ch-block-title"><span class="ol-icon">📌</span>知识主线</div>
                <ol class="ol-ch-list">${mainLine.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ol>
              </div>` : ''}
            ${keyPoints.length ? `
              <div class="ol-ch-block">
                <div class="ol-ch-block-title"><span class="ol-icon">🎯</span>高频考点</div>
                <ul class="ol-ch-list ol-ch-list-bullet">${keyPoints.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
              </div>` : ''}
          </div>
          <a class="ol-ch-cta" href="#/${state.subjectId}/study?chapter=${ch.id}">
            进入本章学习 <span class="ol-arrow">→</span>
          </a>
        </div>
      </div>
    </article>
  `;
}

function freqToClass(freq) {
  if (!freq) return 'ghost';
  if (freq.includes('高频')) return 'freq-high';
  if (freq.includes('中高')) return 'freq-midhigh';
  if (freq.includes('中频')) return 'freq-mid';
  return 'ghost';
}
