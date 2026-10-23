export function renderProgress(cur, total) {
  const pct = total ? Math.round(cur / total * 100) : 0;
  return `<div class="progress"><div class="progress-fill" style="width:${pct}%"></div></div>`;
}