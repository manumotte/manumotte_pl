/*
 * alicewords — pure game logic.
 * No DOM access lives in this file, so it can be unit-tested in Node.
 */
(function (global) {
  "use strict";

  const MODES = {
    one: {
      id: "one",
      contentWords: 1,
      label: "1 слово",
      accusative: "одно слово",
      totalMin: 1,
      totalMax: 1,
      clauseBased: false,
    },
    three: {
      id: "three",
      contentWords: 3,
      label: "3 слова",
      accusative: "три слова",
      totalMin: 3,
      totalMax: 8,
      clauseBased: true,
    },
    five: {
      id: "five",
      contentWords: 5,
      label: "5 слов",
      accusative: "пять слов",
      totalMin: 5,
      totalMax: 13,
      clauseBased: true,
    },
  };

  const MODE_ORDER = ["one", "three", "five"];
  const LANG_ORDER = ["ru", "en"];
  const EASY_MAX_CONTENT_LETTERS = 5;

  // Longer Russian words are allowed than English ones; the tile layout can
  // still accommodate a twelve-letter Cyrillic word on a phone.
  const LIMITS = {
    en: {
      maxWordLetters: 10,
      lettersMin: { one: 3, three: 8, five: 16 },
      lettersMax: { one: 10, three: 42, five: 60 },
    },
    ru: {
      maxWordLetters: 12,
      lettersMin: { one: 3, three: 8, five: 16 },
      lettersMax: { one: 12, three: 50, five: 72 },
    },
  };

  // Function words do not count toward the puzzle's difficulty. The lists are
  // deliberately broad: articles, pronouns, prepositions, conjunctions,
  // particles, auxiliaries/modals and common intensifiers.
  const EN_FUNCTION_WORDS = new Set(
    `
    a an the this that these those some any no every each either neither both all
    another such what which whose my your his her its our their mine yours hers
    ours theirs
    about above across after against along amid among around as at before behind
    below beneath beside between beyond by despite down during except for from in
    inside into like near of off on onto out outside over past since through
    throughout till to toward towards under underneath until up upon with within
    without via per round
    and or but nor so yet because although though while whereas unless if than
    whether
    not n't oh ah well now then just only even still too very quite rather almost
    enough perhaps
    i you he she it we they me him us them myself yourself himself herself itself
    ourselves themselves there here when where why how who whom
    am is are was were be been being have has had having do does did doing will
    would shall should can could may might must ought need dare let used
    `.split(/\s+/).filter(Boolean)
  );

  // Inflected Russian pronouns and other function forms are listed explicitly.
  // The forms are stored without "ё" because normalisation folds ё to е.
  const RU_FUNCTION_WORDS = new Set(
    `
    я меня мне мной мною ты тебя тебе тобой тобою он его ему им нем него она ее
    ей ею ней нее оно мы нас нам нами вы вас вам вами они их им ими них себя
    себе собой собою

    весь вся все всех всем всеми всю всей всего этому этот эта это эти этого
    этой этих тому тем тот та то те такая такое такие такой таков таково таковы
    самый самая самое самые самого самой самых самым самыми сам сама само сами
    самого самой самим самих свой своя свое свои своего своей своих своим своими
    мой моя мое мои моего моей моих моим моими твой твоя твое твои твоего твоей
    твоих твоим твоими наш наша наше наши нашего нашей наших нашим нашими ваш
    ваша ваше ваши вашего вашей ваших вашим вашими чей чья чье чьи чьего чьей
    чьих чьим чьими который которая которое которые которого которой которых
    которым которыми кто кого кому кем чем что чего чему никто никого никому
    никем ничто ничего ничему ничем некто нечто некий некая некое некие
    некоторый некоторая некоторое некоторые некоторого некоторой некоторых
    каждый каждая каждое каждые каждого каждой каждых каждым всякий всякая
    всякое всякие всякого всякой всяких любой любая любое любые любого любой
    любых иной иная иное иные иного иной иных

    в во без безо для до из изо к ко на над надо о об обо от ото по под подо при
    про с со у через между перед передо ради сквозь среди возле около вокруг мимо
    после кроме благодаря вопреки согласно навстречу вследствие ввиду вроде
    наподобие сверх вдоль поперек относительно касательно вместо за из-за из-под
    по-над по-за близ подле окрест сзади впереди

    и а но или либо да зато однако же ж если хотя хоть пока чтобы чтоб что как
    потому поэтому так тоже также причем притом поскольку будто словно точно чем
    нежели ли ль не ни вот вон ведь даже именно только лишь уже еще уж хоть пусть
    пускай бы б да нет таки нибудь

    очень слишком совсем почти чуть едва лишь только уже еще теперь сейчас потом
    всегда никогда часто редко иногда здесь там туда сюда оттуда отсюда так как
    когда где куда откуда почему отчего зачем поэтому потому затем тогда вообще
    конечно пожалуй возможно наверное вероятно действительно именно прямо просто
    особенно даже также тоже вместе вдруг опять снова сначала наконец довольно
    достаточно немного сколько столько насколько поскольку

    ах ох эх ну ой ай гм ба увы ура боже господи

    быть был была было были буду будешь будет будем будете будут бывало есть
    мочь могу можешь может можем можете могут мог могла могло могли должен должна
    должно должны нужно надо можно нельзя
    `.split(/\s+/).filter(Boolean)
  );

  const WORD_RE = /[A-Za-zА-Яа-яЁё]+(?:['’\-][A-Za-zА-Яа-яЁё]+)*/g;
  const CLAUSE_SPLIT_RE = /[.!?;:,\u2014]+/g;
  const CYRILLIC_RE = /[А-Яа-яЁё]/;
  const LATIN_RE = /[A-Za-z]/;
  const LETTER_RE = /[^A-Za-zА-Яа-яЁё]/g;
  const LEADING_FILLER = new Set([
    "and", "but", "or", "nor", "so", "for", "yet", "then", "now", "well", "oh", "ah", "however", "besides",
    "и", "а", "но", "или", "либо", "да", "зато", "однако", "так", "потом", "тогда", "вот", "ну", "то",
    "что", "чтоб", "чем", "потому", "поэтому", "когда", "если", "хотя", "пока", "чтобы", "будто",
    "словно", "поскольку",
  ]);

  function lowerWord(word) {
    return String(word).toLowerCase().replace(/’/g, "'");
  }

  function normalizeRussian(word) {
    return lowerWord(word).replace(/ё/g, "е");
  }

  function baseEnglishForm(word) {
    const normalized = lowerWord(word);
    if (!normalized.includes("'")) return normalized;
    const stem = normalized.split("'")[0];
    const irregular = {
      don: "do",
      doesn: "does",
      didn: "did",
      isn: "is",
      wasn: "was",
      aren: "are",
      weren: "were",
      won: "will",
      wouldn: "would",
      couldn: "could",
      shouldn: "should",
      haven: "have",
      hasn: "has",
      hadn: "had",
      mustn: "must",
      shan: "shall",
      needn: "need",
      oughtn: "ought",
      mightn: "might",
      daren: "dare",
    };
    return irregular[stem] || stem;
  }

  function isFunctionPart(part, lang) {
    if (!part) return true;
    if (part.length === 1) return true;
    if (lang === "ru") {
      if (CYRILLIC_RE.test(part)) return RU_FUNCTION_WORDS.has(normalizeRussian(part));
      if (LATIN_RE.test(part)) return EN_FUNCTION_WORDS.has(baseEnglishForm(part));
      return false;
    }
    return EN_FUNCTION_WORDS.has(baseEnglishForm(part));
  }

  function isContentWord(word, lang) {
    const code = lang === "ru" ? "ru" : "en";
    // A hyphenated compound counts as content if at least one part is content.
    return lowerWord(word)
      .split("-")
      .some((part) => !isFunctionPart(part, code));
  }

  function isNativeWord(word, lang) {
    const hasCyrillic = CYRILLIC_RE.test(word);
    const hasLatin = LATIN_RE.test(word);
    return lang === "ru" ? hasCyrillic && !hasLatin : hasLatin && !hasCyrillic;
  }

  function lettersIn(word) {
    return String(word).replace(LETTER_RE, "");
  }

  function countLetters(words) {
    return words.reduce((sum, word) => sum + lettersIn(word).length, 0);
  }

  function normalizeAnswer(value) {
    // Word boundaries and punctuation are deliberately forgiving: the game is
    // about putting the letters back in order, not about typing punctuation.
    // Russian players commonly type е instead of ё, so those are equivalent.
    return String(value)
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[^a-zа-я0-9]+/g, "");
  }

  function isCorrect(value, puzzle) {
    const answer = normalizeAnswer(value);
    return answer.length > 0 && answer === puzzle.key;
  }

  function tokenize(text, lang) {
    const code = lang === "ru" ? "ru" : "en";
    WORD_RE.lastIndex = 0;
    const tokens = [];
    let match;
    while ((match = WORD_RE.exec(text)) !== null) {
      const word = match[0];
      tokens.push({
        word,
        lower: lowerWord(word),
        native: isNativeWord(word, code),
        content: isContentWord(word, code),
        start: match.index,
        end: match.index + word.length,
      });
    }
    return tokens;
  }

  function sentenceAround(text, start, end) {
    let left = 0;
    for (let index = start - 1; index >= 0; index -= 1) {
      if (/[.!?]/.test(text[index])) {
        left = index + 1;
        break;
      }
    }
    let right = text.length;
    for (let index = end; index < text.length; index += 1) {
      if (/[.!?]/.test(text[index])) {
        right = index + 1;
        break;
      }
    }
    let sentence = text.slice(left, right).replace(/\s+/g, " ").trim();
    if (sentence.length > 260) {
      let from = Math.max(left, start - 90);
      let to = Math.min(right, end + 90);
      while (from > left && /[A-Za-zА-Яа-яЁё]/.test(text[from - 1])) from += 1;
      while (to < right && /[A-Za-zА-Яа-яЁё]/.test(text[to])) to += 1;
      sentence = `…${text.slice(from, to).replace(/\s+/g, " ").trim()}…`;
    }
    return sentence
      .replace(/^[\s)\]}'"”’.,;:—]+/, "")
      .replace(/[(\[{'"“«\s]+$/, "");
  }

  function segmentClauses(text) {
    const segments = [];
    let last = 0;
    CLAUSE_SPLIT_RE.lastIndex = 0;
    let match;
    while ((match = CLAUSE_SPLIT_RE.exec(text)) !== null) {
      segments.push({ text: text.slice(last, match.index), start: last });
      last = match.index + match[0].length;
    }
    segments.push({ text: text.slice(last), start: last });
    return segments;
  }

  function makeCandidate(words, chapterIndex, context, config, lang, easy) {
    const phrase = words.join(" ");
    const key = normalizeAnswer(phrase);
    if (!key) return null;
    return {
      key,
      phrase,
      words: words.slice(),
      significant: config.contentWords,
      totalWords: words.length,
      letters: countLetters(words),
      chapterIndex,
      context,
      mode: config.id,
      lang,
      easy: Boolean(easy),
    };
  }

  function buildPool(book, modeId, lang, options) {
    const config = MODES[modeId];
    if (!config) throw new Error(`Unknown mode: ${modeId}`);
    if (!book || !Array.isArray(book.chapters)) {
      throw new Error("Book data is missing");
    }
    const opts = options || {};
    const easy = Boolean(opts.easy);
    const code = lang === "ru" || book.lang === "ru" ? "ru" : "en";
    const limits = LIMITS[code];
    const minLetters = limits.lettersMin[modeId];
    const maxLetters = limits.lettersMax[modeId];
    const candidates = [];
    const seen = new Set();

    book.chapters.forEach((chapter, chapterIndex) => {
      const paragraphs = chapter.paragraphs || chapter.p || [];
      paragraphs.forEach((paragraph) => {
        if (!config.clauseBased) {
          const tokens = tokenize(paragraph, code);
          tokens.forEach((token) => {
            const word = lettersIn(token.word);
            if (!token.native || !token.content) return;
            if (token.word !== token.word.toLowerCase() && token.word === token.word.toUpperCase()) return;
            if (word.length !== token.word.length) return; // skip contractions and hyphenated words
            if (word.length < minLetters || word.length > limits.maxWordLetters) return;
            if (easy && word.length > EASY_MAX_CONTENT_LETTERS) return;
            const key = normalizeAnswer(token.word);
            if (!key || seen.has(key)) return;
            seen.add(key);
            const candidate = makeCandidate(
              [token.word],
              chapterIndex,
              sentenceAround(paragraph, token.start, token.end),
              config,
              code,
              easy
            );
            if (candidate) candidates.push(candidate);
          });
          return;
        }

        segmentClauses(paragraph).forEach((segment) => {
          const tokens = tokenize(segment.text, code);
          if (!tokens.length || tokens.some((token) => !token.native)) return;
          while (tokens.length > 2 && LEADING_FILLER.has(tokens[0].lower)) {
            tokens.shift();
          }

          const words = tokens.map((token) => token.word);
          if (words.some((word) => lettersIn(word).length > limits.maxWordLetters)) return;
          const contentTokens = tokens.filter((token) => token.content);
          if (
            easy &&
            contentTokens.some((token) => lettersIn(token.word).length > EASY_MAX_CONTENT_LETTERS)
          ) {
            return;
          }
          const contentCount = contentTokens.length;
          if (contentCount !== config.contentWords) return;
          if (words.length < config.totalMin || words.length > config.totalMax) return;
          const letters = countLetters(words);
          if (letters < minLetters || letters > maxLetters) return;

          const first = tokens[0];
          const last = tokens[tokens.length - 1];
          const key = normalizeAnswer(words.join(" "));
          if (!key || seen.has(key)) return;
          seen.add(key);
          const candidate = makeCandidate(
            words,
            chapterIndex,
            sentenceAround(paragraph, segment.start + first.start, segment.start + last.end),
            config,
            code,
            easy
          );
          if (candidate) candidates.push(candidate);
        });

        // The six-letter ceiling makes exact matching clauses scarce, especially
        // for the five-word level. In easy mode only, supplement them with
        // contiguous windows inside a sentence. Windows never cross . ! or ?.
        if (easy) {
          const tokens = tokenize(paragraph, code);
          for (let start = 0; start < tokens.length; start += 1) {
            if (!tokens[start].content) continue;
            let contentCount = 0;
            let end = -1;
            for (let index = start; index < tokens.length; index += 1) {
              if (tokens[index].content) contentCount += 1;
              if (contentCount === config.contentWords) {
                end = index;
                break;
              }
              if (contentCount > config.contentWords) break;
            }
            if (end < 0) continue;

            const windowTokens = tokens.slice(start, end + 1);
            if (windowTokens.some((token) => !token.native)) continue;
            const contentTokens = windowTokens.filter((token) => token.content);
            if (
              contentTokens.some(
                (token) => lettersIn(token.word).length > EASY_MAX_CONTENT_LETTERS
              )
            ) {
              continue;
            }

            const words = windowTokens.map((token) => token.word);
            if (words.some((word) => lettersIn(word).length > limits.maxWordLetters)) continue;
            if (words.length < config.totalMin || words.length > config.totalMax) continue;

            let crossesSentence = false;
            for (let index = start; index < end; index += 1) {
              if (/[.!?]/.test(paragraph.slice(tokens[index].end, tokens[index + 1].start))) {
                crossesSentence = true;
                break;
              }
            }
            if (crossesSentence) continue;

            const letters = countLetters(words);
            if (letters < minLetters || letters > maxLetters) continue;
            const key = normalizeAnswer(words.join(" "));
            if (!key || seen.has(key)) continue;
            seen.add(key);

            const candidate = makeCandidate(
              words,
              chapterIndex,
              sentenceAround(
                paragraph,
                tokens[start].start,
                tokens[end].end
              ),
              config,
              code,
              easy
            );
            if (candidate) candidates.push(candidate);
          }
        }
      });
    });

    return candidates;
  }

  function choosePuzzle(pool, recentKeys, random) {
    if (!Array.isArray(pool) || pool.length === 0) {
      throw new Error("Puzzle pool is empty");
    }
    const rng = typeof random === "function" ? random : Math.random;
    const recent = recentKeys instanceof Set ? recentKeys : new Set(recentKeys || []);
    let available = pool.filter((candidate) => !recent.has(candidate.key));
    if (available.length === 0) available = pool;
    return available[Math.floor(rng() * available.length)];
  }

  function shuffleLetters(word) {
    const letters = lettersIn(word).toLowerCase().split("");
    if (letters.length < 2) return letters;
    const original = letters.join("");
    for (let attempt = 0; attempt < 20; attempt += 1) {
      for (let index = letters.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(Math.random() * (index + 1));
        [letters[index], letters[swap]] = [letters[swap], letters[index]];
      }
      if (letters.join("") !== original) break;
    }
    return letters;
  }

  function scrambleWords(words) {
    return words.map((word) => ({
      original: word,
      letters: shuffleLetters(word),
    }));
  }

  function formatDuration(milliseconds) {
    if (milliseconds == null || !Number.isFinite(milliseconds)) return "—";
    const seconds = Math.max(0, milliseconds) / 1000;
    if (seconds < 60) {
      return `${seconds.toFixed(1).replace(".", ",")} с`;
    }
    const wholeSeconds = Math.floor(seconds);
    const minutes = Math.floor(wholeSeconds / 60);
    const rest = wholeSeconds % 60;
    return `${minutes} мин ${String(rest).padStart(2, "0")} с`;
  }

  function formatClock(milliseconds) {
    const totalTenths = Math.max(0, Math.floor(milliseconds / 100));
    const minutes = Math.floor(totalTenths / 600);
    const seconds = Math.floor((totalTenths % 600) / 10);
    const tenths = totalTenths % 10;
    return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
  }

  function plural(number, one, few, many) {
    const mod100 = Math.abs(number) % 100;
    const mod10 = mod100 % 10;
    if (mod100 >= 11 && mod100 <= 14) return many;
    if (mod10 === 1) return one;
    if (mod10 >= 2 && mod10 <= 4) return few;
    return many;
  }

  function wordSummary(puzzle) {
    if (!puzzle) return "";
    const significant = `${puzzle.significant} ${plural(
      puzzle.significant,
      "значимое слово",
      "значимых слова",
      "значимых слов"
    )}`;
    if (puzzle.totalWords === puzzle.significant) return significant;
    return `${significant} · ${puzzle.totalWords} ${plural(
      puzzle.totalWords,
      "слово",
      "слова",
      "слов"
    )} всего`;
  }

  const api = {
    MODES,
    MODE_ORDER,
    LANG_ORDER,
    EASY_MAX_CONTENT_LETTERS,
    FUNCTION_WORDS: { en: EN_FUNCTION_WORDS, ru: RU_FUNCTION_WORDS },
    buildPool,
    choosePuzzle,
    scrambleWords,
    normalizeAnswer,
    isCorrect,
    formatDuration,
    formatClock,
    plural,
    wordSummary,
    countLetters,
    isContentWord,
    isNativeWord,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    global.AlicewordsCore = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
