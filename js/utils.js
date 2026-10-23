export const LETTERS = 'ABCDEFGH';

export function $(sel, root = document) {
  return root.querySelector(sel);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function isCorrect(q, ans) {
  if (!ans || !ans.length) return false;
  return [...q.answer].sort().join(',') === [...ans].sort().join(',');
}

export function isDisputed(q) {
  return q.reviewFlags?.includes('answer_disputed') || false;
}

export function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
