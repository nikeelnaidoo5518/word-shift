'use strict';

// Works in the browser and in Node's test runner. SVG data contains modules only.
(function(root) {
  function joinUrl(origin, code) {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP or HTTPS game server address.');
    if (!/^[A-HJ-NP-Z2-9]{5}$/.test(code)) throw new Error('Invalid room code.');
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    url.search = ''; url.hash = '';
    url.searchParams.set('join', code);
    return url.href;
  }
  function svgFor(text, encoder) {
    const qr = encoder.QrCode.encodeText(text, encoder.QrCode.Ecc.MEDIUM);
    const border = 4;
    const size = qr.size + border * 2;
    const paths = [];
    for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y)) paths.push(`M${x + border},${y + border}h1v1h-1z`);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="Scan to join this WORD SHIFT room" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${paths.join('')}" fill="#000"/></svg>`;
  }
  const api = { joinUrl, svgFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WordShiftJoin = api;
})(typeof window === 'undefined' ? globalThis : window);
