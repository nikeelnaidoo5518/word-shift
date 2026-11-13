'use strict';

// Shared by the TV WebView and browser-based D-pad regression checks.
if (new URLSearchParams(location.search).get('tv') === '1') {
  document.documentElement.classList.add('tv-mode');
  const style = document.createElement('style');
  style.textContent = `
    .tv-mode :focus { outline: 4px solid #35cdba !important; outline-offset: 4px; }
    .tv-mode .screen { padding: 4vh 4vw; }
    .tv-mode .game-screen { padding: 4vh 4vw; }
    .tv-mode .lobby-aside .aside-details { font-size: 13px; }
    .tv-mode .topbar, .tv-mode .game-top { flex-shrink: 0; }
    .tv-mode .demo-label { display: none; }
    .tv-mode #victory .trophy { font-size: clamp(32px, 7vh, 76px); line-height: 1; }
    .tv-mode #victory h1 { font-size: clamp(28px, 6vh, 72px); overflow-wrap: anywhere; }
    .tv-mode #victory .center-stage > p { margin: 6px 0; }
    .tv-mode #victory .result-panel { margin: 8px auto 12px; }
    .tv-mode #victory .score-row { padding: 7px 0; }
    .tv-mode .slot strong, .tv-mode .player-card b { overflow-wrap: anywhere; }
    .tv-mode .player-card { min-width: 0; }
    .tv-mode .player-card > span:last-child { min-width: 0; }
    @media (max-height: 600px) {
      .tv-mode .room-share { gap: 3px; padding: 10px; }
    }
  `;
  document.head.appendChild(style);

  function controls() {
    return [...document.querySelectorAll('.screen.active button, .screen.active input, .screen.active select')]
      .filter(el => !el.disabled && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  }
  function focusDefault() {
    const items = controls();
    if (items.includes(document.activeElement)) return;
    const preferred = items.find(el => el.matches('.btn.primary, .btn.teal, .mode-card')) || items[0];
    if (preferred) preferred.focus();
  }
  window.wordShiftRemote = function(key) {
    const items = controls();
    if (!items.length) return '';
    if (!items.includes(document.activeElement)) focusDefault();
    const current = document.activeElement;
    if (key === 'Enter') {
      if (current.tagName === 'INPUT') { current.focus(); return 'edit'; }
      if (current.tagName === 'SELECT') {
        current.selectedIndex = (current.selectedIndex + 1) % current.options.length;
        current.dispatchEvent(new Event('change', { bubbles: true }));
      } else current.click();
      focusDefault();
      return '';
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) return '';
    if (current.tagName === 'SELECT' && ['ArrowLeft', 'ArrowRight'].includes(key)) {
      current.selectedIndex = (current.selectedIndex + (key === 'ArrowRight' ? 1 : current.options.length - 1)) % current.options.length;
      current.dispatchEvent(new Event('change', { bubbles: true }));
      return '';
    }
    const from = current.getBoundingClientRect();
    const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
    const sign = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1;
    let next = null, best = Infinity;
    for (const el of items) {
      if (el === current) continue;
      const to = el.getBoundingClientRect();
      const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
      const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
      const forward = (horizontal ? dx : dy) * sign;
      if (forward <= 1) continue;
      const cross = Math.abs(horizontal ? dy : dx);
      const score = Math.hypot(dx, dy) + cross * 2;
      if (score < best) { best = score; next = el; }
    }
    if (next) next.focus();
    return '';
  };
  document.addEventListener('keydown', event => {
    // Native keyboards retain text editing; Android forwards remote input separately.
    if (document.activeElement.tagName === 'INPUT') return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) {
      event.preventDefault(); window.wordShiftRemote(event.key);
    }
  });
  new MutationObserver(focusDefault).observe(document.querySelector('.app'), { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'disabled', 'style'] });
  focusDefault();
}
