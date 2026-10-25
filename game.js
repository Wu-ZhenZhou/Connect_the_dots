(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LinkGame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const COLS = 18;
  const ROWS = 12;
  const PAIRS = COLS * ROWS / 2;
  const LEVELS = 13;
  const LEVEL_TIME_SECONDS = 300;
  const REWARD_CHANCE = 0.04;
  const POINTS_PER_PAIR = 100;
  const POINTS_PER_REMAINING_SECOND = 10;

  const motionNames = [
    '固定位置', '向下靠攏', '向上靠攏', '向左靠攏', '向右靠攏',
    '上下向中心', '上下向外側', '左右向中心', '左右向外側',
    '奇偶欄交替上下', '奇偶列交替左右', '四區向中心', '四區向角落'
  ];

  function speciesCount(level) {
    return 10 + (Math.max(1, Math.min(LEVELS, level)) - 1) * 2;
  }

  function motionName(level) {
    return motionNames[Math.max(1, Math.min(LEVELS, level)) - 1];
  }

  function shuffle(values, rng) {
    const random = rng || Math.random;
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  }

  function inside(x, y) { return x >= 0 && x < COLS && y >= 0 && y < ROWS; }

  // Breadth-first search over the board plus its one-cell outer border.
  // Direction is part of the state so the route can use at most two turns.
  function findConnection(board, first, second) {
    if (!board || first === second || board[first] == null || board[second] == null || board[first] !== board[second]) return null;
    const sx = first % COLS, sy = Math.floor(first / COLS);
    const tx = second % COLS, ty = Math.floor(second / COLS);
    const queue = [{ x: sx, y: sy, dir: -1, turns: 0, path: [{ x: sx, y: sy }] }];
    const seen = new Set();
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    while (queue.length) {
      const state = queue.shift();
      for (let d = 0; d < dirs.length; d++) {
        const turns = state.turns + (state.dir !== -1 && state.dir !== d ? 1 : 0);
        if (turns > 2) continue;
        const x = state.x + dirs[d][0], y = state.y + dirs[d][1];
        if (x < -1 || x > COLS || y < -1 || y > ROWS) continue;
        const isTarget = x === tx && y === ty;
        if (!isTarget && inside(x, y) && board[y * COLS + x] != null) continue;
        const path = state.path.concat([{ x, y }]);
        if (isTarget) return path;
        const key = `${x},${y},${d},${turns}`;
        if (seen.has(key)) continue;
        seen.add(key);
        queue.push({ x, y, dir: d, turns, path });
      }
    }
    return null;
  }

  function hasAnyMove(board) {
    const positions = new Map();
    board.forEach((kind, index) => {
      if (kind == null) return;
      if (!positions.has(kind)) positions.set(kind, []);
      positions.get(kind).push(index);
    });
    for (const indexes of positions.values()) {
      for (let i = 0; i < indexes.length; i++) {
        for (let j = i + 1; j < indexes.length; j++) {
          if (findConnection(board, indexes[i], indexes[j])) return true;
        }
      }
    }
    return false;
  }

  function buildRandomBoard(level, rng) {
    const kinds = speciesCount(level);
    const deck = [];
    const each = Math.floor(PAIRS / kinds);
    const extra = PAIRS % kinds;
    for (let kind = 0; kind < kinds; kind++) {
      const pairCount = each + (kind < extra ? 1 : 0);
      for (let n = 0; n < pairCount * 2; n++) deck.push(kind + 1);
    }
    return shuffle(deck, rng);
  }

  function ensurePlayable(board, rng) {
    const random = rng || Math.random;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (hasAnyMove(board)) return board;
      shuffle(board, random);
    }
    // Deterministic fallback: keep all counts and put one pair side-by-side.
    const kind = board.find(value => value != null);
    const indexes = [];
    for (let i = 0; i < board.length && indexes.length < 2; i++) if (board[i] === kind) indexes.push(i);
    if (indexes.length === 2) {
      const pair = [board[indexes[0]], board[indexes[1]]];
      board[indexes[0]] = board[indexes[1]] = null;
      const start = Math.floor(random() * (ROWS * (COLS - 1)));
      const row = Math.floor(start / (COLS - 1));
      const col = start % (COLS - 1);
      board[row * COLS + col] = pair[0];
      board[row * COLS + col + 1] = pair[1];
    }
    return board;
  }

  function createBoard(level, rng) {
    return ensurePlayable(buildRandomBoard(level, rng), rng);
  }

  function compact(board, x0, x1, y0, y1, axis, toward) {
    const laneCount = axis === 'vertical' ? x1 - x0 : y1 - y0;
    const laneLength = axis === 'vertical' ? y1 - y0 : x1 - x0;
    for (let lane = 0; lane < laneCount; lane++) {
      const coords = [];
      for (let offset = 0; offset < laneLength; offset++) {
        coords.push(axis === 'vertical' ? [x0 + lane, y0 + offset] : [x0 + offset, y0 + lane]);
      }
      const values = coords.map(([x, y]) => board[y * COLS + x]).filter(value => value != null);
      const gaps = Array(laneLength - values.length).fill(null);
      const ordered = toward > 0 ? gaps.concat(values) : values.concat(gaps);
      coords.forEach(([x, y], index) => { board[y * COLS + x] = ordered[index] ?? null; });
    }
  }

  function applyMotion(board, level) {
    const next = board.slice();
    const midX = COLS / 2, midY = ROWS / 2;
    switch (level) {
      case 1: break;
      case 2: compact(next, 0, COLS, 0, ROWS, 'vertical', 1); break;
      case 3: compact(next, 0, COLS, 0, ROWS, 'vertical', -1); break;
      case 4: compact(next, 0, COLS, 0, ROWS, 'horizontal', -1); break;
      case 5: compact(next, 0, COLS, 0, ROWS, 'horizontal', 1); break;
      case 6:
        compact(next, 0, COLS, 0, midY, 'vertical', 1);
        compact(next, 0, COLS, midY, ROWS, 'vertical', -1); break;
      case 7:
        compact(next, 0, COLS, 0, midY, 'vertical', -1);
        compact(next, 0, COLS, midY, ROWS, 'vertical', 1); break;
      case 8:
        compact(next, 0, midX, 0, ROWS, 'horizontal', 1);
        compact(next, midX, COLS, 0, ROWS, 'horizontal', -1); break;
      case 9:
        compact(next, 0, midX, 0, ROWS, 'horizontal', -1);
        compact(next, midX, COLS, 0, ROWS, 'horizontal', 1); break;
      case 10:
        for (let x = 0; x < COLS; x++) compact(next, x, x + 1, 0, ROWS, 'vertical', x % 2 ? 1 : -1); break;
      case 11:
        for (let y = 0; y < ROWS; y++) compact(next, 0, COLS, y, y + 1, 'horizontal', y % 2 ? 1 : -1); break;
      case 12:
        compact(next, 0, midX, 0, midY, 'vertical', 1); compact(next, 0, midX, 0, midY, 'horizontal', 1);
        compact(next, midX, COLS, 0, midY, 'vertical', 1); compact(next, midX, COLS, 0, midY, 'horizontal', -1);
        compact(next, 0, midX, midY, ROWS, 'vertical', -1); compact(next, 0, midX, midY, ROWS, 'horizontal', 1);
        compact(next, midX, COLS, midY, ROWS, 'vertical', -1); compact(next, midX, COLS, midY, ROWS, 'horizontal', -1); break;
      case 13:
        compact(next, 0, midX, 0, midY, 'vertical', -1); compact(next, 0, midX, 0, midY, 'horizontal', -1);
        compact(next, midX, COLS, 0, midY, 'vertical', -1); compact(next, midX, COLS, 0, midY, 'horizontal', 1);
        compact(next, 0, midX, midY, ROWS, 'vertical', 1); compact(next, 0, midX, midY, ROWS, 'horizontal', -1);
        compact(next, midX, COLS, midY, ROWS, 'vertical', 1); compact(next, midX, COLS, midY, ROWS, 'horizontal', 1); break;
    }
    return next;
  }

  function countRemainingPairs(board) {
    return board.reduce((n, value) => n + (value == null ? 0 : 0.5), 0);
  }

  function rollReward(rng) {
    const roll = (rng || Math.random)();
    if (roll < REWARD_CHANCE) return 'time';
    if (roll < REWARD_CHANCE * 2) return 'shuffle';
    if (roll < REWARD_CHANCE * 3) return 'hint';
    return null;
  }

  function calculateStageScore(pairCount, remainingSeconds, cleared) {
    const pairScore = Math.max(0, Math.floor(pairCount)) * POINTS_PER_PAIR;
    const timeBonus = cleared
      ? Math.max(0, Math.ceil(remainingSeconds)) * POINTS_PER_REMAINING_SECOND
      : 0;
    return { pairScore, timeBonus, total: pairScore + timeBonus };
  }

  function updateBestScore(bestScore, runScore) {
    return Math.max(0, Number(bestScore) || 0, Number(runScore) || 0);
  }

  function normalizeSave(data) {
    const normalized = Object.assign({ unlocked: 1, bestTime: null, clears: 0, bestScore: 0, leaderboard: [] }, data && typeof data === 'object' ? data : {});
    normalized.bestScore = Math.max(0, Number(normalized.bestScore) || 0);
    normalized.leaderboard = normalizeLeaderboard(normalized.leaderboard);
    return normalized;
  }

  function normalizeLeaderboard(entries) {
    if (!Array.isArray(entries)) return [];
    return entries.filter(entry => entry && Number.isFinite(Number(entry.score)))
      .map(entry => ({
        score: Math.max(0, Math.floor(Number(entry.score))),
        endedAt: Math.max(0, Number(entry.endedAt) || 0),
        reachedLevel: Math.max(1, Math.min(LEVELS, Math.floor(Number(entry.reachedLevel) || 1))),
        completedAll: Boolean(entry.completedAll)
      }))
      .sort((a, b) => b.score - a.score || b.endedAt - a.endedAt)
      .slice(0, 10);
  }

  function addLeaderboardEntry(entries, entry) {
    return normalizeLeaderboard((Array.isArray(entries) ? entries : []).concat(entry));
  }

  return { COLS, ROWS, PAIRS, LEVELS, LEVEL_TIME_SECONDS, motionNames, speciesCount, motionName,
    shuffle, findConnection, hasAnyMove, createBoard, buildRandomBoard, ensurePlayable, applyMotion, countRemainingPairs,
    REWARD_CHANCE, rollReward, POINTS_PER_PAIR, POINTS_PER_REMAINING_SECOND, calculateStageScore, updateBestScore,
    normalizeSave, normalizeLeaderboard, addLeaderboardEntry };
});
