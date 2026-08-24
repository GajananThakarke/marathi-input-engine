/**
 * persistence.ts
 * -----------------------------------------------------------------------
 * Makes `learnWord` corrections durable across page reloads/sessions by
 * mirroring them into localStorage. The engine core stays usable outside
 * a browser (e.g. a Node CLI or test run) because every call here is
 * guarded — if `window`/`localStorage` isn't available, these become
 * harmless no-ops and the in-memory Maps just behave as session-only,
 * exactly like before.
 *
 * In a production deployment (per the project brief's Laravel backend),
 * swapping this module's two functions for API calls to a per-user
 * "learned words" endpoint is a drop-in replacement — nothing else in
 * the engine needs to change.
 * -----------------------------------------------------------------------
 */

const LEARNED_WORDS_KEY = "marathi-input-engine:learned-words:v1";
const BIGRAM_KEY = "marathi-input-engine:bigrams:v1";

function hasLocalStorage(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

export function loadLearnedWords(): Record<string, string> {
  if (!hasLocalStorage()) return {};
  try {
    const raw = window.localStorage.getItem(LEARNED_WORDS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveLearnedWords(entries: Record<string, string>): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(LEARNED_WORDS_KEY, JSON.stringify(entries));
  } catch {
    // Storage full/unavailable (e.g. private browsing) — fail silently,
    // learning just stays session-only for this run.
  }
}

export function loadBigrams(): Record<string, string> {
  if (!hasLocalStorage()) return {};
  try {
    const raw = window.localStorage.getItem(BIGRAM_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveBigrams(entries: Record<string, string>): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(BIGRAM_KEY, JSON.stringify(entries));
  } catch {
    // ignore
  }
}

export function clearPersistedLearning(): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(LEARNED_WORDS_KEY);
    window.localStorage.removeItem(BIGRAM_KEY);
  } catch {
    // ignore
  }
}
