/**
 * transliterate.ts
 * -----------------------------------------------------------------------
 * Pure, dependency-free Roman -> Devanagari (Marathi) phonetic renderer.
 *
 * Pipeline for a single "word" (no spaces):
 *   1. tokenize()  — greedy longest-match scan against ALL_TOKENS
 *   2. render()    — walk the token stream and apply Marathi orthography
 *                    rules: मात्रा attachment, हलंत insertion for
 *                    जोडाक्षर (consonant clusters), अनुस्वार/विसर्ग
 *                    attachment, and independent vs. matra vowel forms.
 *
 * This module has NO knowledge of dictionaries, ranking, or the editor —
 * it only knows phonetics. See dictionary.ts for known-word overrides and
 * engine.ts for the layer that combines both + produces ranked
 * suggestions.
 * -----------------------------------------------------------------------
 */

import { ALL_TOKENS, DIGITS, HALANT, type PhoneticToken } from "./phoneticData";

// Homorganic nasal + stop-consonant clusters (न्द, म्ब, न्त, ...) are
// conventionally spelled with अनुस्वार (ं) in modern Marathi, not a
// spelled-out nasal consonant + हलंत — संत not सन्त, अंत not अन्त, नंतर
// not नन्तर, मंद not मन्द, चंद्र not चन्द्र, कंटाळा not कन्टाळा, अंबिका
// not अम्बिका, नंदी not नन्दी, आळंदी not आळन्दी. This is reliable
// SPECIFICALLY for nasal-followed-by-STOP; it does NOT extend to
// nasal+semivowel/liquid/sibilant clusters (अन्याय keeps its explicit
// न्य conjunct, not अंयाय) — those stay lexically variable, so the
// default conjunct-forming behavior is left unchanged for them.
const NASAL_LETTERS = new Set(["न", "ण", "म", "ङ", "ञ"]);
const STOP_CONSONANT_LETTERS = new Set([
  "क", "ख", "ग", "घ",
  "च", "छ", "ज", "झ",
  "ट", "ठ", "ड", "ढ",
  "त", "थ", "द", "ध",
  "प", "फ", "ब", "भ",
]);
const ANUSWARA = "ं";

export interface Token {
  roman: string;
  token: PhoneticToken;
}

/**
 * Greedily tokenizes a Roman string into phonetic tokens.
 * At every position we try the longest possible match first so that,
 * e.g., "chh" is preferred over "ch" + "h", and "aa" over "a" + "a".
 */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  outer: while (i < input.length) {
    // Digits pass through as their own pseudo-token
    if (DIGITS[input[i]]) {
      tokens.push({
        roman: input[i],
        token: { roman: input[i], type: "modifier", independent: DIGITS[input[i]] },
      });
      i++;
      continue;
    }

    for (const t of ALL_TOKENS) {
      const len = t.roman.length;
      if (input.slice(i, i + len) === t.roman) {
        tokens.push({ roman: t.roman, token: t });
        i += len;
        continue outer;
      }
    }

    // Case-insensitive fallback for anything not matched exactly
    // (keeps the engine forgiving of stray capitalisation).
    const lower = input[i].toLowerCase();
    const fallback = ALL_TOKENS.find((t) => t.roman.toLowerCase() === lower);
    if (fallback) {
      tokens.push({ roman: input[i], token: fallback });
      i++;
      continue;
    }

    // Truly unknown character (punctuation caught upstream, but just in
    // case): pass it through unchanged so nothing is silently dropped.
    tokens.push({
      roman: input[i],
      token: { roman: input[i], type: "modifier", independent: input[i] },
    });
    i++;
  }

  return tokens;
}

/**
 * Renders a token stream into Devanagari text, applying:
 *  - मात्रा attachment (consonant + vowel -> single akshar)
 *  - हलंत insertion between two consecutive consonants (जोडाक्षर)
 *  - independent vowel forms at word-start / after another vowel
 *  - अनुस्वार/विसर्ग/चंद्रबिंदू as trailing modifiers on the last akshar
 */
export function render(tokens: Token[], options?: { forceFinalHalant?: boolean }): string {
  let out = "";
  // Tracks whether the *next* token should be treated as continuing a
  // syllable ("after-consonant", i.e. a following vowel attaches as a
  // matra) or starting fresh ("after-vowel/start", vowel is independent).
  let pendingConsonant = false;

  for (let i = 0; i < tokens.length; i++) {
    const { token } = tokens[i];
    const next = tokens[i + 1]?.token;

    if (token.type === "modifier") {
      out += token.independent;
      // A modifier doesn't change syllable state.
      continue;
    }

    if (token.type === "vowel") {
      if (pendingConsonant) {
        // Attaches as a matra to the consonant just emitted.
        out += token.matra ?? "";
      } else {
        out += token.independent;
      }
      pendingConsonant = false;
      continue;
    }

    // token.type === "consonant"
    if (next && next.type === "consonant") {
      if (NASAL_LETTERS.has(token.independent) && STOP_CONSONANT_LETTERS.has(next.independent)) {
        // Homorganic nasal + stop: अनुस्वार on the syllable so far, then
        // let the following stop consonant start its own fresh syllable
        // (it gets the usual inherent अ or an attached matra normally).
        out += ANUSWARA;
        pendingConsonant = false;
      } else {
        // Another (non-homorganic-stop) consonant follows directly ->
        // जोडाक्षर via हलंत.
        out += token.independent + HALANT;
        pendingConsonant = false; // the halant already "resolved" this slot
      }
    } else if (next && next.type === "vowel" && next.roman === "a") {
      // Explicit short "a": inherent vowel, nothing to append, but
      // consume it so it isn't re-rendered as an independent अ.
      out += token.independent;
      tokens[i + 1] = { roman: "", token: { roman: "", type: "modifier", independent: "" } };
      pendingConsonant = false;
    } else if (next && next.type === "vowel") {
      out += token.independent;
      pendingConsonant = true;
    } else if (i === tokens.length - 1 && options?.forceFinalHalant) {
      // Explicit opt-in (trailing "_" in the roman input, stripped before
      // tokenizing): mark this final consonant "dead" with हलंत instead of
      // the default inherent अ. Used for words like भगवान् typed as
      // "bhagvaan_".
      out += token.independent + HALANT;
      pendingConsonant = false;
    } else {
      // End of word, or followed by a modifier: keep the inherent अ
      // (standard Marathi orthography does not mark final schwa
      // deletion with हलंत).
      out += token.independent;
      pendingConsonant = false;
    }
  }

  return out;
}

/**
 * Convenience one-shot: Roman word -> Devanagari, pure phonetic rules only.
 * A trailing "_" is treated as an explicit request to mark the final
 * consonant as "dead" (हलंत) rather than carrying the default inherent अ —
 * e.g. "bhagvaan_" -> "भगवान्". The underscore itself is never rendered.
 */
export function phoneticTransliterate(word: string): string {
  if (!word) return "";
  const forceFinalHalant = word.endsWith("_");
  const cleanWord = forceFinalHalant ? word.slice(0, -1) : word;
  if (!cleanWord) return "";
  return render(tokenize(cleanWord), { forceFinalHalant });
}
