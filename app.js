(function () {
  'use strict';

  const G = window.LinkGame;
  const $ = id => document.getElementById(id);
  const els = {
    home: $('home-screen'), game: $('game-screen'), board: $('board'), timer: $('timer-value'), timerPill: $('timer-pill'),
    remaining: $('remaining-value'), level: $('level-title'), species: $('species-count'), motion: $('motion-label'),
    hint: $('hint-button'), shuffle: $('shuffle-button'),
    hintCount: $('hint-count'), shuffleCount: $('shuffle-count'), score: $('score-value'), overlay: $('path-overlay'), message: $('board-message'),
    dialog: $('result-dialog'), toast: $('toast'), pause: $('pause-button'), pauseOverlay: $('pause-overlay')
  };

  const SAVE_KEY = 'pokemon-link-prototype-v1';
  const CREATURE_SPRITE = id => `./assets/creatures/${String(id).padStart(2, '0')}.png`;
  const CREATURE_NAMES = [
    '炭芽', '泡泡鰭', '苔團', '電栗', '霧鈴', '岩豆', '月絨', '糖盔', '泡泥', '葉哨',
    '熔角', '霜團', '磁豆', '砂面', '星翎', '夜蕈', '潮牙', '藤拳', '焰鬃', '雷翅',
    '冰角', '磚甲', '幻尾', '鏡靈', '煤翼', '雲羊', '琥珀蟹', '深歌', '花燈', '磁犀',
    '晶脈', '虹鰭', '日冕', '星核'
  ];
  let save = readSave();
  let state = null;
  let tickHandle = null;
  let toastHandle = null;
  let messageHandle = null;
  const mismatchTimers = new WeakMap();
  let installPrompt = null;

  function readSave() {
    try { return G.normalizeSave(JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); }
    catch (_) { return G.normalizeSave(); }
  }

  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) { /* Private browsing may block storage. */ }
    renderSavedProgress();
  }

  function renderSavedProgress() {
    const progress = save.clears ? `已完成 ${save.clears} 關 · 已解鎖至第 ${save.unlocked} 關` : '13 關冒險等你挑戰';
    $('saved-progress').textContent = `最高總分 ${save.bestScore.toLocaleString()} 分 · ${progress}`;
  }

  function startLevel(level, runScore) {
    stopTicker();
    if (els.dialog.open) els.dialog.close();
    const playableLevel = Math.max(1, Math.min(G.LEVELS, level));
    state = {
      level: playableLevel, board: G.createBoard(playableLevel), selected: null, hint: null,
      hints: 5, shuffles: 5, seconds: G.LEVEL_TIME_SECONDS, bonusSeconds: 0, remaining: G.PAIRS,
      moves: 0, levelScore: 0, runScore: runScore || 0, locked: false, paused: false, lastTick: Date.now()
    };
    els.home.classList.add('hidden');
    els.game.classList.remove('hidden');
    document.body.classList.add('playing');
    updateHeader();
    drawBoard();
    clearPath();
    els.message.classList.add('hidden');
    tickHandle = window.setInterval(tick, 200);
    if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
  }

  function updateHeader() {
    if (!state) return;
    els.level.textContent = `第 ${state.level} 關`;
    els.species.textContent = `生物 ${G.speciesCount(state.level)} 種`;
    els.motion.textContent = G.motionName(state.level);
    els.remaining.textContent = state.remaining;
    els.score.textContent = state.runScore.toLocaleString();
    els.hintCount.textContent = state.hints;
    els.shuffleCount.textContent = state.shuffles;
    els.hint.disabled = state.hints <= 0 || state.locked;
    els.shuffle.disabled = state.shuffles <= 0 || state.locked;
    els.pause.disabled = state.locked;
    els.pause.textContent = state.paused ? '▶' : 'Ⅱ';
    els.pause.setAttribute('aria-label', state.paused ? '繼續遊戲' : '暫停遊戲');
    els.pause.title = state.paused ? '繼續遊戲' : '暫停遊戲';
    els.pauseOverlay.classList.toggle('hidden', !state.paused);
    els.hint.disabled = state.hints <= 0 || state.locked || state.paused;
    els.shuffle.disabled = state.shuffles <= 0 || state.locked || state.paused;
    updateTimerDisplay();
  }

  function updateTimerDisplay() {
    const seconds = Math.max(0, Math.ceil(state ? state.seconds : 0));
    els.timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    els.timerPill.classList.toggle('timer-warning', seconds <= 30);
  }

  function tick() {
    if (!state || state.locked || state.paused || document.hidden) return;
    const now = Date.now();
    state.seconds -= (now - state.lastTick) / 1000;
    state.lastTick = now;
    updateTimerDisplay();
    if (state.seconds <= 0) {
      state.seconds = 0;
      endLevel(false);
    }
  }

  function stopTicker() { if (tickHandle) window.clearInterval(tickHandle); tickHandle = null; }

  function setPaused(paused) {
    if (!state || state.locked) return;
    state.paused = paused;
    state.lastTick = Date.now();
    if (paused) {
      state.selected = null;
      clearHint();
      clearPath();
      els.board.querySelectorAll('.tile-selected').forEach(tile => tile.classList.remove('tile-selected'));
    }
    updateHeader();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state && !state.locked) setPaused(true);
    else if (state) state.lastTick = Date.now();
  });

  function drawBoard() {
    if (els.board.children.length !== state.board.length) {
      const frag = document.createDocumentFragment();
      state.board.forEach((_, index) => {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.setAttribute('role', 'gridcell');
        cell.dataset.index = index;
        cell.addEventListener('click', () => onTile(index));
        frag.appendChild(cell);
      });
      els.board.replaceChildren(frag);
    }

    state.board.forEach((kind, index) => {
      const cell = els.board.children[index];
      cell.className = `tile${kind == null ? ' tile-empty' : ''}`;
      cell.disabled = kind == null;
      if (kind == null) {
        cell.setAttribute('aria-label', '空格');
        cell.querySelector('img')?.remove();
        delete cell.dataset.kind;
        delete cell.dataset.fallback;
        return;
      }

      const kindId = String(kind);
      cell.setAttribute('aria-label', CREATURE_NAMES[kind - 1] || `生物 ${kind}`);
      let img = cell.querySelector('img');
      const needsImage = !img;
      if (needsImage) {
        img = document.createElement('img');
        img.alt = '';
        img.loading = 'lazy';
        img.draggable = false;
        cell.appendChild(img);
      }
      if (needsImage || cell.dataset.kind !== kindId) {
        cell.dataset.kind = kindId;
        img.onerror = () => {
          if (!img.isConnected || cell.dataset.kind !== kindId) return;
          img.remove();
          cell.classList.add('sprite-missing');
          cell.dataset.fallback = '✦';
        };
        img.src = CREATURE_SPRITE(kind);
      }
    });
    updateHeader();
  }

  function tileAt(index) { return els.board.querySelector(`[data-index="${index}"]`); }

  function onTile(index) {
    if (!state || state.locked || state.paused || state.board[index] == null) return;
    clearHint();
    if (state.selected === index) {
      tileAt(index).classList.remove('tile-selected');
      state.selected = null;
      clearPath();
      return;
    }
    if (state.selected == null) {
      state.selected = index;
      tileAt(index).classList.add('tile-selected');
      return;
    }
    const first = state.selected;
    const second = index;
    if (state.board[first] === state.board[second]) {
      const path = G.findConnection(state.board, first, second);
      if (path) {
        state.board[first] = state.board[second] = null;
        state.remaining--;
        state.moves++;
        state.levelScore += G.POINTS_PER_PAIR;
        state.runScore += G.POINTS_PER_PAIR;
        awardReward();
        state.board = G.applyMotion(state.board, state.level);
        state.selected = null;
        drawBoard();
        clearPath();
        if (state.remaining === 0) endLevel(true);
        else if (!G.hasAnyMove(state.board)) {
          if (state.shuffles > 0) useShuffle(true);
          else endLevel(false, 'no-moves');
        }
      } else {
        mismatch(first, second, '路徑被擋住了');
      }
    } else {
      mismatch(first, second, '圖案不同，再找找看');
    }
  }

  function mismatch(first, second, text) {
    const old = tileAt(first);
    old && old.classList.remove('tile-selected');
    const next = tileAt(second);
    if (next) {
      const previousTimer = mismatchTimers.get(next);
      if (previousTimer) window.clearTimeout(previousTimer);
      next.classList.add('tile-selected', 'tile-wrong');
    }
    showToast(text);
    state.selected = null;
    clearPath();
    if (next) {
      const timer = window.setTimeout(() => {
        mismatchTimers.delete(next);
        next.classList.remove('tile-wrong');
        if (!next.isConnected || !state || state.selected !== second) next.classList.remove('tile-selected');
      }, 380);
      mismatchTimers.set(next, timer);
    }
  }

  function showPath(path) {
    const overlayRect = els.overlay.getBoundingClientRect();
    const columnCenters = Array.from({ length: G.COLS }, (_, x) => {
      const cellRect = tileAt(x).getBoundingClientRect();
      return cellRect.left + cellRect.width / 2 - overlayRect.left;
    });
    const rowCenters = Array.from({ length: G.ROWS }, (_, y) => {
      const cellRect = tileAt(y * G.COLS).getBoundingClientRect();
      return cellRect.top + cellRect.height / 2 - overlayRect.top;
    });
    const xAt = x => x < 0 ? columnCenters[0] + x * (columnCenters[1] - columnCenters[0])
      : x >= G.COLS ? columnCenters[G.COLS - 1] + (x - G.COLS + 1) * (columnCenters[G.COLS - 1] - columnCenters[G.COLS - 2])
      : columnCenters[x];
    const yAt = y => y < 0 ? rowCenters[0] + y * (rowCenters[1] - rowCenters[0])
      : y >= G.ROWS ? rowCenters[G.ROWS - 1] + (y - G.ROWS + 1) * (rowCenters[G.ROWS - 1] - rowCenters[G.ROWS - 2])
      : rowCenters[y];
    els.overlay.setAttribute('viewBox', `0 0 ${overlayRect.width} ${overlayRect.height}`);
    els.overlay.setAttribute('preserveAspectRatio', 'none');
    const points = path.map(point => `${xAt(point.x)},${yAt(point.y)}`).join(' ');
    els.overlay.innerHTML = `<polyline points="${points}" class="connection-line"/><polyline points="${points}" class="connection-glow"/>`;
    els.overlay.classList.add('path-visible');
  }

  function inside(point) { return point.x >= 0 && point.x < G.COLS && point.y >= 0 && point.y < G.ROWS; }
  function clearPath() { els.overlay.classList.remove('path-visible'); els.overlay.replaceChildren(); }

  function clearHint() {
    if (state && state.hint) {
      state.hint.forEach(index => { const tile = tileAt(index); tile && tile.classList.remove('tile-hint'); });
      state.hint = null;
    }
  }

  function useHint() {
    if (!state || state.locked || state.paused || state.hints <= 0) return;
    clearHint();
    for (let a = 0; a < state.board.length; a++) {
      if (state.board[a] == null) continue;
      for (let b = a + 1; b < state.board.length; b++) {
        if (state.board[a] === state.board[b] && G.findConnection(state.board, a, b)) {
          state.hints--;
          state.hint = [a, b];
          state.hint.forEach(index => tileAt(index).classList.add('tile-hint'));
          updateHeader();
          window.setTimeout(clearHint, 1800);
          return;
        }
      }
    }
    showBoardMessage('沒有可消除的組合，試試洗牌。', 3500);
  }

  function useShuffle(automatic = false) {
    if (!state || state.locked || state.paused || state.shuffles <= 0) return false;
    const values = state.board.filter(value => value != null);
    G.shuffle(values);
    let vi = 0;
    state.board = state.board.map(value => value == null ? null : values[vi++]);
    G.ensurePlayable(state.board);
    state.shuffles--;
    state.selected = null;
    clearPath();
    clearHint();
    drawBoard();
    showToast(automatic ? `沒有可連線的牌，自動洗牌（剩餘 ${state.shuffles} 次）` : '牌面已重新排列');
    return true;
  }

  function awardReward() {
    const reward = G.rollReward();
    if (reward === 'time') {
      state.seconds += 10;
      state.bonusSeconds += 10;
      showToast('時間獎勵 +10 秒！');
    } else if (reward === 'shuffle') {
      state.shuffles++;
      showToast('獲得洗牌次數 +1！');
    } else if (reward === 'hint') {
      state.hints++;
      showToast('獲得提示次數 +1！');
    }
  }

  function showBoardMessage(text, duration) {
    window.clearTimeout(messageHandle);
    els.message.textContent = text;
    els.message.classList.remove('hidden');
    messageHandle = window.setTimeout(() => els.message.classList.add('hidden'), duration);
  }

  function showToast(text, duration = 1400) {
    window.clearTimeout(toastHandle);
    els.toast.textContent = text;
    els.toast.classList.add('toast-visible');
    toastHandle = window.setTimeout(() => els.toast.classList.remove('toast-visible'), duration);
  }

  function endLevel(won, reason = '') {
    if (!state || state.locked) return;
    state.locked = true;
    stopTicker();
    const level = state.level;
    const stageScore = G.calculateStageScore(state.moves, state.seconds, won);
    state.runScore += stageScore.timeBonus;
    state.lastStageScore = stageScore;
    if (won) {
      save.clears++;
      save.unlocked = Math.max(save.unlocked, Math.min(G.LEVELS, level + 1));
      const elapsed = elapsedSeconds();
      if (save.bestTime == null || elapsed < save.bestTime) save.bestTime = Math.round(elapsed);
    }
    const allCleared = won && level === G.LEVELS;
    const runEnded = !won || allCleared;
    if (runEnded) {
      recordRun(allCleared);
    }
    if (won || runEnded) persist();
    $('dialog-art').classList.toggle('dialog-defeat', !won);
    $('dialog-eyebrow').textContent = allCleared ? 'ALL STAGES CLEAR' : won ? 'STAGE CLEAR' : reason === 'no-moves' ? 'NO MOVES' : 'TIME IS UP';
    $('dialog-title').textContent = allCleared ? '全關完成！' : won ? `第 ${level} 關完成！` : reason === 'no-moves' ? '沒有可連線的牌' : '時間到了';
    $('dialog-copy').textContent = won ? (allCleared ? '你完成了全部 13 關，太厲害了！' : `太棒了！第 ${level + 1} 關的盤面正在等你。`) : reason === 'no-moves' ? '沒有可連線牌組，而且洗牌次數已用完。本輪結束。' : '本輪已結束，再玩一輪可從第 1 關重新累積分數。';
    $('dialog-score-breakdown').innerHTML = `<div><b>${stageScore.pairScore.toLocaleString()}</b><span>本關配對分</span></div><div><b>+${stageScore.timeBonus.toLocaleString()}</b><span>過關時間獎勵</span></div><div><b>${stageScore.total.toLocaleString()}</b><span>本關得分</span></div><div class="run-score-cell"><b>${state.runScore.toLocaleString()}</b><span>本輪總分</span></div><div class="best-score-cell"><b>${save.bestScore.toLocaleString()}</b><span>最高總分</span></div>`;
    $('dialog-stats').innerHTML = `<div><b>${state.moves}</b><span>次配對</span></div><div><b>${formatTime(elapsedSeconds())}</b><span>實際用時</span></div>`;
    const primary = $('dialog-primary');
    primary.textContent = won && !allCleared ? '下一關' : '再玩一輪';
    primary.insertAdjacentHTML('beforeend', ' <span class="button-arrow">↗</span>');
    primary.onclick = () => won && !allCleared ? startLevel(level + 1, state.runScore) : startLevel(1, 0);
    $('dialog-secondary').onclick = goHome;
    els.dialog.showModal();
  }

  function formatTime(seconds) { const s = Math.max(0, Math.round(seconds)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  function elapsedSeconds() { return state ? Math.max(0, G.LEVEL_TIME_SECONDS + state.bonusSeconds - state.seconds) : 0; }

  function renderLeaderboard() {
    const list = $('leaderboard-list');
    list.replaceChildren();
    if (!save.leaderboard.length) {
      const empty = document.createElement('li');
      empty.className = 'leaderboard-empty';
      empty.textContent = '完成一輪後，成績會出現在這裡。';
      list.appendChild(empty);
      return;
    }
    save.leaderboard.forEach((entry, index) => {
      const row = document.createElement('li');
      row.className = `leaderboard-row${index === 0 ? ' leaderboard-first' : ''}`;
      const rank = document.createElement('span');
      rank.className = 'leaderboard-rank';
      rank.textContent = String(index + 1).padStart(2, '0');
      const info = document.createElement('span');
      info.className = 'leaderboard-info';
      const score = document.createElement('b');
      score.textContent = `${entry.score.toLocaleString()} 分`;
      const detail = document.createElement('small');
      const date = new Date(entry.endedAt).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
      detail.textContent = `${date} · ${entry.completedAll ? '全關通關' : `到達第 ${entry.reachedLevel} 關`}`;
      info.append(score, detail);
      row.append(rank, info);
      list.appendChild(row);
    });
  }

  function recordRun(completedAll = false) {
    if (!state || state.runRecorded) return;
    save.bestScore = G.updateBestScore(save.bestScore, state.runScore);
    save.leaderboard = G.addLeaderboardEntry(save.leaderboard, {
      score: state.runScore, endedAt: Date.now(), reachedLevel: state.level, completedAll
    });
    state.runRecorded = true;
    persist();
  }

  function goHome() {
    recordRun(false);
    stopTicker();
    if (els.dialog.open) els.dialog.close();
    state = null;
    els.game.classList.add('hidden');
    els.home.classList.remove('hidden');
    document.body.classList.remove('playing');
    renderSavedProgress();
  }

  const installButton = $('install-button');
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
  });
  window.addEventListener('appinstalled', () => { installPrompt = null; installButton.textContent = '已安裝'; installButton.disabled = true; });
  installButton.addEventListener('click', async () => {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      return;
    }
    const isAppleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    showToast(isAppleMobile ? '點選「分享」，再選「加入主畫面」即可安裝。' : '開啟瀏覽器選單，選擇「安裝生物連連看」或「加到主畫面」。', 5000);
  });  $('play-button').addEventListener('click', () => startLevel(1, 0));
  $('home-button').addEventListener('click', goHome);
  $('pause-button').addEventListener('click', () => setPaused(!state?.paused));
  $('resume-button').addEventListener('click', () => setPaused(false));
  $('hint-button').addEventListener('click', useHint);
  $('shuffle-button').addEventListener('click', useShuffle);
  $('leaderboard-button').addEventListener('click', () => {
    renderLeaderboard();
    $('leaderboard-dialog').showModal();
  });
  $('leaderboard-close').addEventListener('click', () => $('leaderboard-dialog').close());
  renderSavedProgress();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
  }
})();
