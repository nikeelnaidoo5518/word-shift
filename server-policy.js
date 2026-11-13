'use strict';
const { isIP } = require('node:net');

function normalizeIp(value) { return value?.startsWith('::ffff:') ? value.slice(7) : value; }
function trustedAddresses(value = '') {
  const addresses = value.split(',').map(value => normalizeIp(value.trim())).filter(Boolean);
  if (addresses.some(address => !isIP(address))) throw new Error('TRUST_PROXY_ADDRESSES must contain exact proxy IP addresses, separated by commas.');
  return new Set(addresses);
}
function clientAddress(req, trusted) {
  const remote = normalizeIp(req.socket.remoteAddress) || 'local';
  if (!trusted.has(remote)) return remote;
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded !== 'string' || forwarded.length > 1024) return remote;
  const chain = forwarded.split(',').map(value => normalizeIp(value.trim()));
  if (!chain.length || chain.some(address => !isIP(address))) return remote;
  for (let i = chain.length - 1; i >= 0; i--) if (!trusted.has(chain[i])) return chain[i];
  return chain[0];
}
function allowedOrigin(req, publicOrigin = '') {
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  if (origin === undefined) return true; // Native clients and same-origin GETs may omit it.
  if (typeof origin !== 'string' || origin === 'null') return false;
  try {
    const expected = publicOrigin || `${req.socket.encrypted ? 'https' : 'http'}://${req.headers.host}`;
    const parsed = new URL(origin);
    return parsed.origin === origin && parsed.origin === new URL(expected).origin;
  } catch { return false; }
}
function validatePublicOrigin(value = '') {
  if (!value) return '';
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin without a path or credentials.');
  return url.origin;
}
module.exports = { clientAddress, trustedAddresses, allowedOrigin, validatePublicOrigin };
