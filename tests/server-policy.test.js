'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { clientAddress, trustedAddresses, allowedOrigin, validatePublicOrigin } = require('../server-policy');
const request = (remote, headers = {}, encrypted = false) => ({ socket: {remoteAddress:remote, encrypted}, headers });

test('forwarded addresses are ignored unless the direct proxy is explicitly trusted', () => {
  const trusted = trustedAddresses('127.0.0.1, 10.0.0.2');
  assert.equal(clientAddress(request('192.168.1.5', {'x-forwarded-for':'1.2.3.4'}), trusted), '192.168.1.5');
  assert.equal(clientAddress(request('127.0.0.1', {'x-forwarded-for':'1.2.3.4, 192.168.1.5, 10.0.0.2'}), trusted), '192.168.1.5');
  assert.equal(clientAddress(request('::ffff:127.0.0.1', {'x-forwarded-for':'::ffff:192.168.1.5'}), trusted), '192.168.1.5');
  assert.equal(clientAddress(request('127.0.0.1', {'x-forwarded-for':'not an IP'}), trusted), '127.0.0.1');
  assert.throws(() => trustedAddresses('*'));
  assert.throws(() => trustedAddresses('10.0.0.0/8'));
});

test('browser mutations and event streams must come from the game origin', () => {
  assert.equal(allowedOrigin(request('127.0.0.1', {host:'192.168.1.2:4173', origin:'http://192.168.1.2:4173'})), true);
  assert.equal(allowedOrigin(request('127.0.0.1', {host:'internal:4173', origin:'https://game.example'}), 'https://game.example'), true);
  for (const origin of ['https://evil.example','null','http://192.168.1.2:4173/','http://192.168.1.2:4174']) {
    assert.equal(allowedOrigin(request('127.0.0.1', {host:'192.168.1.2:4173', origin})), false);
  }
  assert.equal(allowedOrigin(request('127.0.0.1', {host:'192.168.1.2:4173','sec-fetch-site':'cross-site'})), false);
  assert.equal(allowedOrigin(request('127.0.0.1', {host:'192.168.1.2:4173'})), true);
  assert.equal(validatePublicOrigin('https://game.example/'), 'https://game.example');
  for (const value of ['file:///tmp','https://name:secret@game.example','https://game.example/path']) assert.throws(() => validatePublicOrigin(value));
});
