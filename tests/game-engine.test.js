'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('../game-engine');

test('bundled word graph returns valid shortest routes for all seven round pairs', () => {
  for (let i = 0; i < 7; i++) {
    const puzzle = game.puzzleForRound(i);
    assert.ok(puzzle.route.length > 1);
    assert.equal(puzzle.route[0], puzzle.start);
    assert.equal(puzzle.route.at(-1), puzzle.target);
    for (let j = 1; j < puzzle.route.length; j++) {
      assert.equal(game.changedPositions(puzzle.route[j - 1], puzzle.route[j]), 1);
      assert.ok(game.dictionary.has(puzzle.route[j]));
    }
  }
});

test('one-letter validator rejects same, multiple, and different-length words', () => {
  assert.equal(game.changedPositions('soft', 'sort'), 1);
  assert.equal(game.changedPositions('soft', 'soft'), 0);
  assert.equal(game.changedPositions('soft', 'salt'), 2);
  assert.equal(game.changedPositions('soft', 'so'), -1);
});

test('target-match score helper counts position matches, not locked letters', () => {
  assert.equal(game.targetMatches('soft', 'hard'), 0);
  assert.equal(game.targetMatches('sort', 'hard'), 1);
  assert.equal(game.targetMatches('card', 'hard'), 3);
});

test('blocked words are not reused when finding an alternate route', () => {
  const blocked = new Set(['cord']);
  const route = game.shortestPath('cold', 'warm', blocked);
  assert.ok(route);
  assert.equal(route[0], 'cold');
  assert.equal(route.at(-1), 'warm');
  assert.ok(!route.slice(1, -1).some(word => blocked.has(word)));
});

test('computer opponents choose a valid unused one-letter move from the same word graph', () => {
  const used = new Set(['dogs', 'dots']);
  for (const level of Object.keys(game.BOT_DELAY_MS)) {
    const move = game.chooseAIMove('dots', 'cats', used, level);
    assert.ok(move);
    assert.equal(game.changedPositions('dots', move), 1);
    assert.ok(game.dictionary.has(move));
    assert.ok(!used.has(move));
  }
});
