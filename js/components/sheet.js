import { isCorrect } from '../utils.js';

export function renderSheet(pool, answers, index, submitted) {
  return pool.map((q, i) => {
    const ans = answers[q.id] || [];
    let cls = 'sheet-item';
    if (ans.length) cls += ' answered';
    if (i === index) cls += ' current';
    if (submitted) {
      if (isCorrect(q, ans)) cls += ' right';
      else cls += ' wrong';
    }
    return `<button class="${cls}" data-i="${i}">${i + 1}</button>`;
  }).join('');
}