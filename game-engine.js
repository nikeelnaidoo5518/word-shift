'use strict';

const words = require('./data/words-en.json');
const dictionary = new Set(words);
const indexes = new Map();
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const COMMON_WORDS = new Set('dogs dots cots cats cold cord word ward warm head heal teal tell tall tail wish wash cash cast cart cost cord card soft sort sore core care card hard'.split(' '));
const PUZZLES = [
  { start: 'dogs', target: 'cats' },
  { start: 'cold', target: 'warm' },
  { start: 'head', target: 'tail' },
  { start: 'wish', target: 'cold' },
  { start: 'soft', target: 'hard' },
  { start: 'good', target: 'warm' },
  { start: 'love', target: 'hate' },
];
COMMON_WORDS.add('good'); COMMON_WORDS.add('wood'); COMMON_WORDS.add('love'); COMMON_WORDS.add('hove'); COMMON_WORDS.add('have'); COMMON_WORDS.add('hate');
const ROUND_NAMES = ['Warm-Up', 'Speed Shift', 'Twist Round', 'Pressure Round', 'Grand Finale', 'Lightning Round', 'Mega Finale'];
const TURN_SECONDS = [40, 25, 25, 15, 15, 20, 15];
const MODIFIERS = ['Lightning Round', 'Memory Round', 'Double Trouble', 'Last Chance', 'Mega Finale', 'Surprise Timer', 'Mystery Bonus'];
const BOT_DELAY_MS = { Rookie: 1800, 'Quick Thinker': 1100, 'Word Wizard': 800, 'Brain Master': 550, 'Word Overlord': 300 };

function indexForLength(length) {
  if (indexes.has(length)) return indexes.get(length);
  const index = new Map();
  for (const word of words) {
    if (word.length !== length) continue;
    for (let i = 0; i < length; i++) {
      const key = `${word.slice(0, i)}*${word.slice(i + 1)}`;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(word);
    }
  }
  indexes.set(length, index);
  return index;
}

function neighbours(word) {
  const index = indexForLength(word.length);
  const found = new Set();
  for (let i = 0; i < word.length; i++) {
    const key = `${word.slice(0, i)}*${word.slice(i + 1)}`;
    for (const candidate of index.get(key) || []) if (candidate !== word) found.add(candidate);
  }
  return [...found];
}

function shortestPath(start, target, blocked = new Set(), allowed = null) {
  if (!dictionary.has(start) || !dictionary.has(target) || start.length !== target.length) return null;
  const queue = [start];
  const parent = new Map([[start, null]]);
  for (let head = 0; head < queue.length; head++) {
    const word = queue[head];
    if (word === target) {
      const path = [];
      for (let cursor = word; cursor !== null; cursor = parent.get(cursor)) path.push(cursor);
      return path.reverse();
    }
    for (const next of neighbours(word)) {
      if (parent.has(next) || (blocked.has(next) && next !== target) || (allowed && !allowed.has(next))) continue;
      parent.set(next, word);
      queue.push(next);
    }
  }
  return null;
}

function changedPositions(from, to) {
  if (typeof from !== 'string' || typeof to !== 'string' || from.length !== to.length) return -1;
  let changed = 0;
  for (let i = 0; i < from.length; i++) if (from[i] !== to[i]) changed++;
  return changed;
}

function targetMatches(word, target) {
  let count = 0;
  for (let i = 0; i < word.length; i++) if (word[i] === target[i]) count++;
  return count;
}

function puzzleForRound(roundIndex) {
  const pair = PUZZLES[roundIndex % PUZZLES.length];
  const path = shortestPath(pair.start, pair.target, new Set(), COMMON_WORDS) || shortestPath(pair.start, pair.target);
  if (!path) throw new Error(`No dictionary route for ${pair.start} → ${pair.target}`);
  return {
    ...pair,
    route: path,
    roundName: ROUND_NAMES[roundIndex % ROUND_NAMES.length],
    timerSeconds: TURN_SECONDS[roundIndex % TURN_SECONDS.length],
    difficulty: ['Easy', 'Medium', 'Medium', 'Hard', 'Hard', 'Hard', 'Super Hard'][roundIndex % 7],
    modifier: MODIFIERS[roundIndex % MODIFIERS.length],
  };
}

function chooseAIMove(current, target, used, difficulty = 'Quick Thinker') {
  const blocked = used instanceof Set ? used : new Set(used);
  const choices = neighbours(current).filter(word => !blocked.has(word) && dictionary.has(word)).map(word => {
    const path = shortestPath(word, target, blocked);
    return path ? { word, remaining: path.length - 1, matches: targetMatches(word, target), options: neighbours(word).filter(next => !blocked.has(next)).length } : null;
  }).filter(Boolean);
  if (!choices.length) return null;
  if (difficulty === 'Rookie') return choices.sort((a, b) => a.matches - b.matches || b.remaining - a.remaining || a.word.localeCompare(b.word))[0].word;
  if (difficulty === 'Quick Thinker') return choices.sort((a, b) => a.remaining - b.remaining || b.matches - a.matches)[0].word;
  if (difficulty === 'Word Wizard') return choices.sort((a, b) => a.remaining - b.remaining || b.options - a.options)[0].word;
  if (difficulty === 'Brain Master') return choices.sort((a, b) => a.remaining - b.remaining || b.matches - a.matches || b.options - a.options)[0].word;
  return choices.sort((a, b) => a.remaining - b.remaining || b.matches - a.matches || a.options - b.options)[0].word;
}

module.exports = {
  words,
  dictionary,
  PUZZLES,
  ROUND_NAMES,
  TURN_SECONDS,
  BOT_DELAY_MS,
  MODIFIERS,
  chooseAIMove,
  changedPositions,
  neighbours,
  puzzleForRound,
  shortestPath,
  targetMatches,
};
