import { LETTERS, escapeHtml, isDisputed } from '../utils.js';
import { chapterName } from '../loader.js';

export function questionMedia(q, placement = 'stem', optionIndex = null) {
  const media = Array.isArray(q.media) ? q.media : [];
  const matches = media.filter(item => {
    const itemPlacement = item.placement || 'stem';
    return itemPlacement === placement
      && (placement !== 'option' || Number(item.optionIndex) === Number(optionIndex));
  });
  if (placement === 'stem' && q.figure?.src && !matches.some(item => item.src === q.figure.src)) {
    matches.unshift({ ...q.figure, placement: 'stem' });
  }
  return matches;
}

export function renderQuestionMedia(q, placement = 'stem', optionIndex = null) {
  const media = questionMedia(q, placement, optionIndex);
  if (!media.length) return '';
  return media.map(item => `<figure class="q-figure q-media-${placement}">
      <img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.alt || '题目附图')}" loading="lazy" decoding="async">
      ${item.caption ? `<figcaption>${escapeHtml(item.caption)}</figcaption>` : ''}
    </figure>`).join('');
}

export function renderQuestionFigure(q) {
  return renderQuestionMedia(q, 'stem');
}

export function renderQCard(q, userAns, revealed, index, total, isFav = false) {
  const disputed = isDisputed(q);
  const revealedOK = revealed && userAns.length
    ? [...q.answer].sort().join(',') === [...userAns].sort().join(',')
    : false;

  let html = `<div class="q-head">
      <span class="tag">${escapeHtml(chapterName(q.chapterId))}</span>
      <span class="tag ghost">${q.type === 'multi' ? '多选题' : '单选题'}</span>
      ${disputed ? '<span class="tag ghost">答案有争议 · 不计分</span>' : ''}
      <span class="q-index">第 ${index + 1} 题</span>
      <button class="fav-btn ${isFav ? 'active' : ''}" id="favBtn" title="${isFav ? '取消收藏' : '收藏'}">${isFav ? '★' : '☆'}</button>
    </div>
    <div class="q-stem">${escapeHtml(q.stem)}</div>
    ${renderQuestionFigure(q)}
    <div class="options">`;

  q.options.forEach((opt, i) => {
    let cls = 'option';
    if (userAns.includes(i)) cls += ' selected';
    if (revealed && !disputed) {
      if (q.answer.includes(i)) cls += ' correct';
      else if (userAns.includes(i)) cls += ' wrong';
    }
    const inputType = q.type === 'multi' ? 'checkbox' : 'radio';
    html += `<label class="${cls}" data-i="${i}">
        <input type="${inputType}" ${userAns.includes(i) ? 'checked' : ''} ${revealed ? 'disabled' : ''}>
        <span class="letter">${LETTERS[i]}</span>
        <div class="text">${escapeHtml(opt)}${renderQuestionMedia(q, 'option', i)}</div>
      </label>`;
  });
  html += '</div>';

  if (revealed) {
    html += `<div class="feedback ${disputed ? '' : revealedOK ? 'ok' : 'bad'}">
        <div class="fb-title">${disputed ? '答案有争议 · 本题不计分' : revealedOK ? '✓ 回答正确' : '✗ 回答错误'}</div>
        <div class="fb-answer">${disputed ? '来源参考答案' : '正确答案'}：${q.answer.map(i => LETTERS[i]).join('、')}</div>
        <details class="fb-analysis"><summary>查看解析</summary><p>${escapeHtml(q.analysis)}</p>${renderQuestionMedia(q, 'analysis')}</details>
      </div>`;
  }
  return html;
}
