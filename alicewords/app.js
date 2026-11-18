(function () {
  "use strict";

  const core = window.AlicewordsCore;
  const books = window.ALICE_BOOKS && window.ALICE_BOOKS.books;

  const STATS_KEY = "alicewords.stats.v1";
  const MODE_KEY = "alicewords.mode.v1";
  const LANG_KEY = "alicewords.lang.v1";
  const EASY_KEY = "alicewords.easy.v1";
  const DEFAULT_LANG = "ru";
  const RECENT_LIMIT = 8;

  const SOURCE_NOTES = {
    ru:
      "Игра идёт по русскому переводу А. Н. Рождественской (1908–1909). Предлоги, частицы, союзы и " +
      "местоимения не считаются значимыми словами — поэтому в режиме «3 слова» запросто может оказаться пять слов.",
    en:
      "Игра идёт по оригинальному английскому тексту. Предлоги, артикли, частицы, союзы и местоимения " +
      "не считаются значимыми словами — поэтому в режиме «3 слова» запросто может оказаться пять слов.",
  };

  const PLACEHOLDERS = {
    ru: "Введите фразу как в книге…",
    en: "Type the phrase from the book…",
  };

  const elements = {};
  const state = {
    mode: "three",
    lang: DEFAULT_LANG,
    easy: false,
    status: "idle",
    puzzle: null,
    stats: emptyStats(),
    pools: {},
    recent: {},
    startedAt: 0,
    elapsed: 0,
    timerId: null,
    advancing: false,
  };

  function emptyStats() {
    const result = {};
    const modes = core && core.MODE_ORDER ? core.MODE_ORDER : ["one", "three", "five"];
    modes.forEach((mode) => {
      result[mode] = { solved: 0, lost: 0, totalMs: 0, bestMs: null };
    });
    return result;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function cacheElements() {
    elements.gameCard = $("gameCard");
    elements.chapterTag = $("chapterTag");
    elements.chapterLabel = $("chapterLabel");
    elements.timer = $("timer");
    elements.timerWrap = $("timerWrap");
    elements.modeSwitch = $("modeSwitch");
    elements.modeButtons = Array.from(document.querySelectorAll(".mode-btn"));
    elements.langButtons = Array.from(document.querySelectorAll(".lang-btn"));
    elements.easyMode = $("easyMode");
    elements.easyToggle = $("easyToggle");
    elements.easyState = $("easyState");
    elements.wordSummary = $("wordSummary");
    elements.letters = $("letters");
    elements.answerForm = $("answerForm");
    elements.answerInput = $("answerInput");
    elements.inputShell = $("inputShell");
    elements.checkBtn = $("checkBtn");
    elements.giveUpBtn = $("giveUpBtn");
    elements.nextBtn = $("nextBtn");
    elements.feedback = $("feedback");
    elements.reveal = $("reveal");
    elements.revealLabel = $("revealLabel");
    elements.revealPhrase = $("revealPhrase");
    elements.revealContext = $("revealContext");
    elements.sourceNote = $("sourceNote");
    elements.resetStatsBtn = $("resetStatsBtn");
    elements.confetti = $("confetti");
    elements.statsBlocks = Array.from(document.querySelectorAll(".stat-mode"));
  }

  function safeStorageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      // The game still works when storage is blocked; stats simply won't persist.
    }
  }

  function safeStorageRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      // Ignore blocked storage.
    }
  }

  function asNonNegativeInteger(value) {
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  }

  function loadStats() {
    const fallback = emptyStats();
    const raw = safeStorageGet(STATS_KEY);
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return fallback;
      core.MODE_ORDER.forEach((mode) => {
        const item = parsed[mode];
        if (!item || typeof item !== "object") return;
        fallback[mode].solved = asNonNegativeInteger(item.solved);
        fallback[mode].lost = asNonNegativeInteger(item.lost);
        fallback[mode].totalMs = asNonNegativeInteger(item.totalMs);
        fallback[mode].bestMs =
          Number.isFinite(item.bestMs) && item.bestMs > 0 ? Math.round(item.bestMs) : null;
      });
      return fallback;
    } catch (error) {
      return fallback;
    }
  }

  function saveStats() {
    safeStorageSet(STATS_KEY, JSON.stringify(state.stats));
  }

  function loadMode() {
    const saved = safeStorageGet(MODE_KEY);
    return core.MODES[saved] ? saved : "three";
  }

  function loadLanguage() {
    const saved = safeStorageGet(LANG_KEY);
    return books && books[saved] ? saved : DEFAULT_LANG;
  }

  function loadEasy() {
    const saved = safeStorageGet(EASY_KEY);
    return saved === "1" || saved === "true";
  }

  function currentBook() {
    return books && books[state.lang];
  }

  function modeStateKey(mode) {
    return `${state.lang}:${state.easy ? "easy" : "normal"}:${mode || state.mode}`;
  }

  function recentKey(mode) {
    return modeStateKey(mode);
  }

  function poolKey(mode) {
    return modeStateKey(mode);
  }

  function recordResult(solved, durationMs) {
    const modeStats = state.stats[state.mode];
    if (solved) {
      modeStats.solved += 1;
      modeStats.totalMs += durationMs;
      modeStats.bestMs = modeStats.bestMs == null ? durationMs : Math.min(modeStats.bestMs, durationMs);
    } else {
      modeStats.lost += 1;
    }
    saveStats();
    renderStats();
  }

  function roundsLabel(count) {
    return `${count} ${core.plural(count, "раунд", "раунда", "раундов")}`;
  }

  function renderStats() {
    elements.statsBlocks.forEach((block) => {
      const mode = block.dataset.modeBlock;
      const item = state.stats[mode];
      if (!item) return;
      const active = mode === state.mode;
      block.classList.toggle("is-active", active);

      const average = item.solved > 0 ? item.totalMs / item.solved : null;
      const avgNode = block.querySelector('[data-stat="avg"]');
      const bestNode = block.querySelector('[data-stat="best"]');
      const solvedNode = block.querySelector('[data-stat="solved"]');
      const lostNode = block.querySelector('[data-stat="lost"]');
      const roundsNode = block.querySelector('[data-stat="rounds"]');

      avgNode.textContent = average == null ? "—" : core.formatDuration(average);
      bestNode.textContent = item.bestMs == null ? "—" : core.formatDuration(item.bestMs);
      avgNode.classList.toggle("is-empty", average == null);
      bestNode.classList.toggle("is-empty", item.bestMs == null);
      solvedNode.textContent = String(item.solved);
      lostNode.textContent = String(item.lost);
      roundsNode.textContent = roundsLabel(item.solved + item.lost);
    });
  }

  function updateModeControls() {
    elements.modeButtons.forEach((button) => {
      const active = button.dataset.mode === state.mode;
      button.setAttribute("aria-pressed", String(active));
    });
    renderStats();
  }

  function updateLanguageControls() {
    elements.langButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.lang === state.lang));
    });
    document.documentElement.dataset.bookLang = state.lang;
    if (elements.sourceNote) {
      elements.sourceNote.textContent = SOURCE_NOTES[state.lang] || SOURCE_NOTES.ru;
    }
    if (elements.answerInput) {
      elements.answerInput.lang = state.lang;
      elements.answerInput.placeholder = PLACEHOLDERS[state.lang] || PLACEHOLDERS.ru;
    }
    if (elements.letters) elements.letters.lang = state.lang;
    if (elements.revealPhrase) elements.revealPhrase.lang = state.lang;
    if (elements.revealContext) elements.revealContext.lang = state.lang;
  }

  function updateEasyControls() {
    if (!elements.easyToggle) return;
    elements.easyToggle.setAttribute("aria-checked", String(state.easy));
    elements.easyState.textContent = state.easy ? "Вкл" : "Выкл";
    elements.easyMode.classList.toggle("is-on", state.easy);
    elements.easyToggle.title = state.easy
      ? "Выключить лёгкий режим"
      : "Включить лёгкий режим: значимые слова не длиннее 6 букв";
  }

  function getPool(mode) {
    const key = poolKey(mode);
    if (!state.pools[key]) {
      const book = currentBook();
      if (!book) throw new Error(`Book ${state.lang} is missing`);
      const pool = core.buildPool(book, mode, state.lang, { easy: state.easy });
      if (!pool.length) throw new Error(`Empty pool for ${state.lang}/${mode}`);
      state.pools[key] = pool;
    }
    return state.pools[key];
  }

  function pickPuzzle() {
    const pool = getPool(state.mode);
    const history = state.recent[recentKey()] || [];
    const puzzle = core.choosePuzzle(pool, new Set(history));
    history.push(puzzle.key);
    if (history.length > RECENT_LIMIT) history.splice(0, history.length - RECENT_LIMIT);
    state.recent[recentKey()] = history;
    return puzzle;
  }

  function chapterName(puzzle) {
    const book = books[puzzle.lang] || currentBook();
    const chapter = book && book.chapters[puzzle.chapterIndex];
    if (!chapter) return puzzle.lang === "en" ? "Chapter from the book" : "Глава из книги";
    const prefix = puzzle.lang === "en" ? "Chapter" : "Глава";
    return `${prefix} ${chapter.n} · ${chapter.title}`;
  }

  function chapterTitle(puzzle) {
    const book = books[puzzle.lang] || currentBook();
    const chapter = book && book.chapters[puzzle.chapterIndex];
    if (!chapter) return "";
    const prefix = puzzle.lang === "en" ? "Chapter" : "Глава";
    return `${prefix} ${chapter.n}. ${chapter.title}`;
  }

  function clearFeedback() {
    elements.feedback.textContent = "";
    elements.feedback.className = "feedback";
  }

  function setFeedback(text, kind) {
    elements.feedback.textContent = text;
    elements.feedback.className = kind ? `feedback is-${kind}` : "feedback";
  }

  function renderLetters(puzzle) {
    const scramble = core.scrambleWords(puzzle.words);
    const fragment = document.createDocumentFragment();
    const ariaParts = [];
    const english = puzzle.lang === "en";
    let tileIndex = 0;
    const hasLongWord = puzzle.words.some((word) => core.countLetters([word]) >= 10);

    elements.letters.lang = puzzle.lang;
    elements.letters.classList.toggle("is-dense", puzzle.totalWords >= 7 || hasLongWord);

    scramble.forEach((group, wordIndex) => {
      const wordNode = document.createElement("span");
      wordNode.className = "word";
      wordNode.setAttribute("role", "group");
      wordNode.setAttribute("aria-label", english ? `Word ${wordIndex + 1}` : `Слово ${wordIndex + 1}`);

      group.letters.forEach((letter) => {
        const tile = document.createElement("span");
        tile.className = "tile";
        tile.textContent = letter;
        tile.style.setProperty("--tile-index", String(tileIndex));
        tile.setAttribute("aria-hidden", "true");
        wordNode.appendChild(tile);
        tileIndex += 1;
      });

      fragment.appendChild(wordNode);
      ariaParts.push(
        english
          ? `word ${wordIndex + 1}: ${group.letters.join(" ")}`
          : `слово ${wordIndex + 1}: ${group.letters.join(" ")}`
      );
    });

    elements.letters.replaceChildren(fragment);
    if (english) {
      const wordForm = ariaParts.length === 1 ? "word" : "words";
      elements.letters.setAttribute(
        "aria-label",
        `Scrambled letters, ${ariaParts.length} ${wordForm}: ${ariaParts.join("; ")}`
      );
    } else {
      elements.letters.setAttribute(
        "aria-label",
        `Перемешанные буквы, ${ariaParts.length} ${core.plural(
          ariaParts.length,
          "слово",
          "слова",
          "слов"
        )}: ${ariaParts.join("; ")}`
      );
    }
  }

  function resetRoundUi() {
    elements.answerInput.disabled = false;
    elements.answerInput.value = "";
    elements.answerInput.removeAttribute("aria-invalid");
    elements.checkBtn.hidden = false;
    elements.checkBtn.disabled = false;
    elements.giveUpBtn.hidden = false;
    elements.giveUpBtn.disabled = false;
    elements.nextBtn.hidden = true;
    elements.reveal.hidden = true;
    elements.revealLabel.textContent = "Правильный ответ";
    elements.revealPhrase.textContent = "";
    elements.revealContext.textContent = "";
    elements.inputShell.classList.remove("is-wrong", "is-solved", "is-revealed");
    elements.gameCard.classList.remove("is-won");
    clearFeedback();
    elements.timer.textContent = "0:00.0";
    elements.timerWrap.classList.remove("is-running");
  }

  function startTimer() {
    stopTimerTicker();
    state.startedAt = performance.now();
    state.elapsed = 0;
    state.timerId = window.setInterval(() => {
      if (state.status !== "playing") return;
      state.elapsed = performance.now() - state.startedAt;
      elements.timer.textContent = core.formatClock(state.elapsed);
    }, 100);
    elements.timerWrap.classList.add("is-running");
  }

  function stopTimerTicker() {
    if (state.timerId != null) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }
    elements.timerWrap.classList.remove("is-running");
  }

  function shouldFocusInput() {
    return typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;
  }

  function nextRound(options) {
    const opts = options || {};
    if (state.advancing && !opts.force) return;
    if (!opts.initial) {
      state.advancing = true;
      window.setTimeout(() => {
        state.advancing = false;
      }, 320);
    }
    stopTimerTicker();
    state.status = "loading";
    resetRoundUi();

    try {
      const puzzle = pickPuzzle();
      state.puzzle = puzzle;
      state.status = "playing";
      state.elapsed = 0;

      elements.chapterLabel.textContent = chapterName(puzzle);
      elements.chapterLabel.lang = puzzle.lang;
      elements.chapterTag.lang = puzzle.lang;
      elements.chapterTag.title = chapterTitle(puzzle);
      elements.answerInput.lang = puzzle.lang;
      elements.revealPhrase.lang = puzzle.lang;
      elements.revealContext.lang = puzzle.lang;
      elements.wordSummary.textContent = core.wordSummary(puzzle);
      elements.wordSummary.title =
        "Предлоги, артикли, частицы и другие служебные слова не входят в число значимых.";
      renderLetters(puzzle);
      startTimer();

      if (opts.focus && shouldFocusInput()) {
        window.requestAnimationFrame(() => {
          elements.answerInput.focus({ preventScroll: true });
        });
      }
    } catch (error) {
      state.status = "error";
      console.error(error);
      showFatalError("Не удалось подготовить фрагмент. Обновите страницу, пожалуйста.");
    }
  }

  function finishRound(kind) {
    if (state.status !== "playing" || !state.puzzle) return;

    const duration = Math.max(100, Math.round(performance.now() - state.startedAt));
    state.elapsed = duration;
    stopTimerTicker();
    elements.timer.textContent = core.formatClock(duration);

    const solved = kind === "solved";
    state.status = solved ? "solved" : "revealed";
    recordResult(solved, duration);

    elements.answerInput.disabled = true;
    elements.answerInput.removeAttribute("aria-invalid");
    elements.inputShell.classList.remove("is-wrong");
    elements.checkBtn.hidden = true;
    elements.giveUpBtn.hidden = true;
    elements.nextBtn.hidden = false;
    elements.reveal.hidden = false;
    elements.revealLabel.textContent = solved ? "Ваш фрагмент" : "Правильный ответ";
    elements.revealPhrase.textContent = state.puzzle.phrase;
    const context = state.puzzle.context;
    const contextIsJustThePhrase = core.normalizeAnswer(context) === state.puzzle.key;
    elements.revealContext.hidden = contextIsJustThePhrase;
    elements.revealContext.textContent = contextIsJustThePhrase ? "" : context;

    if (solved) {
      elements.gameCard.classList.add("is-won");
      elements.inputShell.classList.add("is-solved");
      setFeedback(`Верно! Фрагмент собран за ${core.formatDuration(duration)}.`, "success");
      celebrate();
    } else {
      elements.answerInput.value = state.puzzle.phrase;
      elements.inputShell.classList.add("is-revealed");
      setFeedback("Ничего страшного. Вот исходный фрагмент — он же в поле ответа.", "error");
    }

    window.requestAnimationFrame(() => {
      elements.nextBtn.focus({ preventScroll: true });
    });
  }

  function checkAnswer() {
    if (state.status !== "playing" || !state.puzzle) return;
    const value = elements.answerInput.value.trim();

    if (!core.normalizeAnswer(value)) {
      elements.answerInput.setAttribute("aria-invalid", "true");
      setFeedback("Сначала введите ответ — хотя бы одну букву.", "error");
      elements.answerInput.focus();
      return;
    }

    if (core.isCorrect(value, state.puzzle)) {
      finishRound("solved");
      return;
    }

    elements.answerInput.setAttribute("aria-invalid", "true");
    setFeedback("Пока не совпало. Сверьтесь с буквами и попробуйте ещё раз.", "error");
    elements.inputShell.classList.remove("is-wrong");
    void elements.inputShell.offsetWidth;
    elements.inputShell.classList.add("is-wrong");
    window.setTimeout(() => elements.inputShell.classList.remove("is-wrong"), 380);
    elements.answerInput.focus();
    elements.answerInput.select();
  }

  function celebrate() {
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const symbols = ["♥", "♦", "♣", "♠", "✦"];
    const colors = ["#b7473f", "#c3974d", "#677764", "#202b29", "#d9877f"];
    const fragment = document.createDocumentFragment();
    const count = 24;

    for (let index = 0; index < count; index += 1) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.textContent = symbols[Math.floor(Math.random() * symbols.length)];
      piece.style.setProperty("--x", `${Math.random() * 100}%`);
      piece.style.setProperty("--color", colors[Math.floor(Math.random() * colors.length)]);
      piece.style.setProperty("--size", `${12 + Math.random() * 16}px`);
      piece.style.setProperty("--rotate", `${Math.random() * 120 - 60}deg`);
      piece.style.setProperty("--duration", `${1.7 + Math.random() * 0.9}s`);
      piece.style.setProperty("--delay", `${Math.random() * 0.25}s`);
      piece.style.setProperty("--drift", `${Math.random() * 260 - 130}px`);
      fragment.appendChild(piece);
    }

    elements.confetti.replaceChildren(fragment);
    window.setTimeout(() => elements.confetti.replaceChildren(), 2900);
  }

  function resetStats() {
    const total = core.MODE_ORDER.reduce((sum, mode) => {
      return sum + state.stats[mode].solved + state.stats[mode].lost;
    }, 0);
    if (total === 0) return;

    const confirmed = window.confirm(
      "Сбросить статистику всех трёх режимов? Она общая для обоих языков и уровней сложности. Это действие нельзя отменить."
    );
    if (!confirmed) return;

    state.stats = emptyStats();
    safeStorageRemove(STATS_KEY);
    renderStats();
  }

  function showFatalError(message) {
    elements.chapterLabel.textContent = "Ошибка";
    elements.wordSummary.textContent = "Игра временно недоступна.";
    elements.letters.replaceChildren();
    elements.answerInput.disabled = true;
    elements.checkBtn.disabled = true;
    elements.giveUpBtn.disabled = true;
    setFeedback(message, "error");
  }

  function bindEvents() {
    elements.modeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.mode;
        if (!core.MODES[mode] || mode === state.mode) {
          button.blur();
          return;
        }
        state.mode = mode;
        safeStorageSet(MODE_KEY, mode);
        updateModeControls();
        nextRound({ focus: true, force: true });
      });
    });

    elements.langButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const lang = button.dataset.lang;
        if (!core.LANG_ORDER.includes(lang) || lang === state.lang) {
          button.blur();
          return;
        }
        state.lang = lang;
        safeStorageSet(LANG_KEY, lang);
        updateLanguageControls();
        nextRound({ focus: true, force: true });
      });
    });

    elements.easyToggle.addEventListener("click", () => {
      state.easy = !state.easy;
      safeStorageSet(EASY_KEY, state.easy ? "1" : "0");
      updateEasyControls();
      nextRound({ focus: true, force: true });
      prebuildOtherPools();
    });

    elements.answerForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (state.status === "playing") {
        checkAnswer();
      } else if (state.status === "solved" || state.status === "revealed") {
        nextRound({ focus: true });
      }
    });

    elements.giveUpBtn.addEventListener("click", () => finishRound("giveup"));
    elements.nextBtn.addEventListener("click", () => nextRound({ focus: true }));
    elements.resetStatsBtn.addEventListener("click", resetStats);

    elements.answerInput.addEventListener("input", () => {
      if (elements.answerInput.getAttribute("aria-invalid") === "true") {
        elements.answerInput.removeAttribute("aria-invalid");
        if (state.status === "playing") clearFeedback();
      }
    });
  }

  function prebuildOtherPools() {
    const idle = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 350));
    const easyKey = state.easy ? "easy" : "normal";
    idle(() => {
      core.LANG_ORDER.forEach((lang) => {
        core.MODE_ORDER.forEach((mode) => {
          const key = `${lang}:${easyKey}:${mode}`;
          if (state.pools[key]) return;
          try {
            state.pools[key] = core.buildPool(books[lang], mode, lang, { easy: state.easy });
          } catch (error) {
            // A failed prefetch is harmless; switching modes will retry and surface
            // any real problem through the normal error path.
          }
        });
      });
    });
  }

  function init() {
    cacheElements();
    if (
      !core ||
      !books ||
      !books.en ||
      !books.ru ||
      !Array.isArray(books.en.chapters) ||
      !Array.isArray(books.ru.chapters)
    ) {
      showFatalError("Не удалось загрузить текст книги. Проверьте, что файлы book.js и core.js на месте.");
      return;
    }

    state.mode = loadMode();
    state.lang = loadLanguage();
    state.easy = loadEasy();
    state.stats = loadStats();
    bindEvents();
    updateModeControls();
    updateLanguageControls();
    updateEasyControls();
    nextRound({ focus: false, initial: true });
    prebuildOtherPools();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
