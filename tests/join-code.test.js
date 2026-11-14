'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { joinUrl } = require('../join-code');

test('QR join links use the server origin and room, without host tokens or TV parameters', () => {
  assert.equal(joinUrl('http://192.168.1.20:4173/?tv=1&token=secret#session', 'ABCDE'), 'http://192.168.1.20:4173/?join=ABCDE');
  assert.equal(joinUrl('https://game.example', 'ABCDE'), 'https://game.example/?join=ABCDE');
  assert.equal(joinUrl('http://[fd00::2]:4173/', 'ABCDE'), 'http://[fd00::2]:4173/?join=ABCDE');
});

test('join links reject unsafe origins and invalid room codes', () => {
  for (const origin of ['javascript:alert(1)', 'file:///tmp/game', 'https://user:secret@game.example', 'not a URL']) {
    assert.throws(() => joinUrl(origin, 'ABCDE'));
  }
  for (const code of ['abcde', 'ABCDE&token=secret', '<svg>', 'ABCD', '00000']) {
    assert.throws(() => joinUrl('http://192.168.1.20:4173', code));
  }
});

test('online QR links preserve the GitHub Pages project directory', () => {
  assert.equal(joinUrl('https://nikeelnaidoo5518.github.io/word-shift/?tv=1','ABCDE'),'https://nikeelnaidoo5518.github.io/word-shift/?join=ABCDE');
});
