/**
 * engine.ts
 * -----------------------------------------------------------------------
 * The public surface of the Marathi Input Engine. Combines:
 *   1. dictionary.ts    — known-word overrides, ranked candidate lists
 *                          (seed list + rule-generated inflections)
 *   2. transliterate.ts — phonetic fallback + candidate generation for
 *                          words the dictionary hasn't seen
 *   3. bigram context    — "given the previous committed word, which
 *                          candidate did the user pick last time for
 *                          this roman word?" — the actual context-aware
 *                          ranking signal (see getSuggestions' `prevWord`)
 *   4. persistence.ts    — mirrors learned words/bigrams into
 *                          localStorage so corrections survive reloads
 * into a single `transliterateWord` / `getSuggestions` API, plus a
 * sentence-level helper that walks whitespace-separated words while
 * preserving punctuation exactly as typed.
 * -----------------------------------------------------------------------
 */

import { lookupWord, learnWord as dictLearnWord } from "./dictionary";
import { phoneticTransliterate } from "./transliterate";
import { loadLearnedWords, saveLearnedWords, loadBigrams, saveBigrams, clearPersistedLearning } from "./persistence";

export interface Suggestion {
  devanagari: string;
  /**
   * "context"    = chosen before, right after this same previous word
   * "dictionary" = known word, no context match
   * "phonetic"   = rule-generated fallback, word not in the dictionary
   */
  source: "context" | "dictionary" | "phonetic";
}

export interface SuggestionOptions {
  /** The Devanagari form of the immediately preceding committed word, if any. */
  prevWord?: string;
  limit?: number;
}

/* ------------------------------------------------------------------ */
/* Bigram context memory + persisted learning bootstrap                */
/* ------------------------------------------------------------------ */

/** `${prevWordDevanagari}\u0001${romanLower}` -> devanagari the user picked */
const bigramMemory: Map<string, string> = new Map();
/** roman (lowercase) -> devanagari, mirrors what's promoted in the dictionary, kept so we can re-serialize the whole set to storage */
const learnedWordsMemory: Map<string, string> = new Map();

function bigramKey(prevWord: string | undefined, roman: string): string | null {
  if (!prevWord) return null;
  return `${prevWord}\u0001${roman.toLowerCase()}`;
}

(function bootstrapPersistedState() {
  for (const [roman, devanagari] of Object.entries(loadLearnedWords())) {
    learnedWordsMemory.set(roman, devanagari);
    dictLearnWord(roman, devanagari);
  }
  for (const [key, devanagari] of Object.entries(loadBigrams())) {
    bigramMemory.set(key, devanagari);
  }
})();

/* ------------------------------------------------------------------ */
/* Phonetic alternates for ambiguous romanizations                     */
/* ------------------------------------------------------------------ */

const AMBIGUOUS_SWAPS: [RegExp, string][] = [
  [/a/g, "aa"], // short a <-> long aa (very common ambiguity, e.g. nav/naav)
  [/i$/g, "ee"], // trailing i <-> ee
  [/u$/g, "oo"], // trailing u <-> oo
];

function phoneticCandidates(word: string): string[] {
  const primary = phoneticTransliterate(word);
  const alternates = new Set<string>();

  for (const [pattern, replacement] of AMBIGUOUS_SWAPS) {
    const swapped = word.replace(pattern, replacement);
    if (swapped !== word) {
      const candidate = phoneticTransliterate(swapped);
      if (candidate && candidate !== primary) alternates.add(candidate);
    }
  }

  return [primary, ...alternates].filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Returns ranked Devanagari suggestions for a single Roman word.
 * Ranking order: bigram context match (if `prevWord` given and this
 * roman word was previously chosen right after that word) > dictionary
 * hits > phonetic fallback candidates.
 */
export function getSuggestions(word: string, options?: SuggestionOptions): Suggestion[] {
  if (!word) return [];
  const limit = options?.limit ?? 5;

  const results: Suggestion[] = [];
  const seen = new Set<string>();

  const bKey = bigramKey(options?.prevWord, word);
  if (bKey) {
    const contextHit = bigramMemory.get(bKey);
    if (contextHit) {
      results.push({ devanagari: contextHit, source: "context" });
      seen.add(contextHit);
    }
  }

  const dictHits = lookupWord(word);
  if (dictHits) {
    for (const d of dictHits) {
      if (!seen.has(d)) {
        seen.add(d);
        results.push({ devanagari: d, source: "dictionary" });
      }
    }
  }

  for (const p of phoneticCandidates(word)) {
    if (!seen.has(p)) {
      seen.add(p);
      results.push({ devanagari: p, source: "phonetic" });
    }
  }

  return results.slice(0, limit);
}

/** Best single candidate for a Roman word — what gets committed by default. */
export function transliterateWord(word: string, prevWord?: string): string {
  const suggestions = getSuggestions(word, { prevWord, limit: 1 });
  return suggestions[0]?.devanagari ?? word;
}

/**
 * Splits a raw string into alternating "word" and "separator" chunks so
 * punctuation/whitespace is preserved verbatim. A "word" chunk is any
 * maximal run of ASCII letters (optionally followed by a single trailing
 * "_" — the explicit हलंत convention, see transliterate.ts); everything
 * else passes through untouched.
 */
export function splitIntoWordsAndSeparators(text: string): { text: string; isWord: boolean }[] {
  const chunks: { text: string; isWord: boolean }[] = [];
  const re = /[A-Za-z]+_?/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text))) {
    if (match.index > lastIndex) {
      chunks.push({ text: text.slice(lastIndex, match.index), isWord: false });
    }
    chunks.push({ text: match[0], isWord: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    chunks.push({ text: text.slice(lastIndex), isWord: false });
  }
  return chunks;
}

/**
 * Sentence-level transliteration: every Roman word is replaced with its
 * top candidate — using the previous *output* word as context for the
 * next lookup — while spacing/punctuation is preserved exactly.
 */
export function transliterateText(text: string): string {
  let prevWord: string | undefined;
  return splitIntoWordsAndSeparators(text)
    .map((chunk) => {
      if (!chunk.isWord) return chunk.text;
      const result = transliterateWord(chunk.text, prevWord);
      prevWord = result;
      return result;
    })
    .join("");
}

/** Live/partial phonetic preview for a word still being typed (pure phonetics, dictionary-independent). */
export function previewWord(word: string): string {
  return phoneticTransliterate(word);
}

/**
 * Records a user's chosen correction so future typing of this word
 * prefers it — both in the flat dictionary (session promotion) and, if
 * `prevWord` is given, as a bigram so the SAME word after the SAME
 * previous word is preferred next time (the actual context-aware
 * ranking signal). Persists to localStorage when available.
 */
export function learnWord(roman: string, devanagari: string, prevWord?: string): void {
  dictLearnWord(roman, devanagari);

  const key = roman.toLowerCase();
  learnedWordsMemory.set(key, devanagari);
  saveLearnedWords(Object.fromEntries(learnedWordsMemory));

  const bKey = bigramKey(prevWord, roman);
  if (bKey) {
    bigramMemory.set(bKey, devanagari);
    saveBigrams(Object.fromEntries(bigramMemory));
  }
}

/** Clears all learned words + bigram context, both in memory and in localStorage. */
export function resetLearning(): void {
  learnedWordsMemory.clear();
  bigramMemory.clear();
  clearPersistedLearning();
}

export type { PhoneticToken } from "./phoneticData";
