/**
 * phoneticData.ts
 * -----------------------------------------------------------------------
 * Core phonetic lookup tables for the Marathi Input Engine.
 *
 * A "token" is the smallest Roman chunk the tokenizer tries to match
 * greedily (longest match first). Every token is tagged as either a
 * VOWEL (स्वर) or a CONSONANT (व्यंजन), and carries both:
 *   - its INDEPENDENT Devanagari form (used at the start of a syllable,
 *     e.g. after another vowel, or as the consonant's own "letter"), and
 *   - for vowels, the MATRA (मात्रा) form used when attached to a
 *     preceding consonant.
 *
 * This file is intentionally data-only so the phonetic scheme can be
 * extended/tuned without touching the engine logic in transliterate.ts.
 * -----------------------------------------------------------------------
 */

export type TokenType = "vowel" | "consonant" | "modifier";

export interface PhoneticToken {
  /** Roman spelling that triggers this token, e.g. "aa", "kh", "M" */
  roman: string;
  type: TokenType;
  /** Independent glyph (स्वर / मूळ व्यंजन) */
  independent: string;
  /** Matra glyph — only meaningful for vowels. Empty string = inherent अ (no visible matra) */
  matra?: string;
}

/**
 * VOWELS — चौदाखडी (the fourteen Marathi vowel sounds + अं / अः)
 * Ordered longest-roman-first is NOT required here; the tokenizer sorts
 * automatically by roman.length before matching.
 */
export const VOWELS: PhoneticToken[] = [
  { roman: "a", type: "vowel", independent: "अ", matra: "" },
  { roman: "aa", type: "vowel", independent: "आ", matra: "ा" },
  { roman: "A", type: "vowel", independent: "आ", matra: "ा" },
  { roman: "i", type: "vowel", independent: "इ", matra: "ि" },
  { roman: "ee", type: "vowel", independent: "ई", matra: "ी" },
  { roman: "I", type: "vowel", independent: "ई", matra: "ी" },
  { roman: "ii", type: "vowel", independent: "ई", matra: "ी" },
  { roman: "u", type: "vowel", independent: "उ", matra: "ु" },
  { roman: "oo", type: "vowel", independent: "ऊ", matra: "ू" },
  { roman: "U", type: "vowel", independent: "ऊ", matra: "ू" },
  { roman: "uu", type: "vowel", independent: "ऊ", matra: "ू" },
  { roman: "RRi", type: "vowel", independent: "ऋ", matra: "ृ" },
  { roman: "R^i", type: "vowel", independent: "ऋ", matra: "ृ" },
  { roman: "e", type: "vowel", independent: "ए", matra: "े" },
  { roman: "ai", type: "vowel", independent: "ऐ", matra: "ै" },
  { roman: "o", type: "vowel", independent: "ओ", matra: "ो" },
  { roman: "au", type: "vowel", independent: "औ", matra: "ौ" },
  { roman: "ow", type: "vowel", independent: "औ", matra: "ौ" },

  // English-loanword vowels. Marathi added these two Devanagari signs
  // specifically for transliterating English sounds that don't exist in
  // native Marathi phonology — they're NOT part of the classic चौदाखडी.
  // They're opt-in via these explicit spellings rather than triggered
  // automatically off plain "a"/"o", because auto-detecting "is this
  // word a loanword" from spelling alone isn't reliable — dictionary
  // entries (see dictionary.ts) cover the common loanwords by default;
  // these tokens are the phonetic escape hatch for anything not listed.
  { roman: "ae", type: "vowel", independent: "ॲ", matra: "ॅ" }, // English "a" as in bank/cab/man
  { roman: "aw", type: "vowel", independent: "ऑ", matra: "ॉ" }, // English "o" as in office/coffee/dog
];

/**
 * MODIFIERS — अनुस्वार / विसर्ग / चंद्रबिंदू
 * These attach to whatever akshar was just emitted; they never start
 * a syllable on their own.
 */
export const MODIFIERS: PhoneticToken[] = [
  { roman: "M", type: "modifier", independent: "ं" }, // अनुस्वार
  { roman: "ं", type: "modifier", independent: "ं" },
  { roman: "H", type: "modifier", independent: "ः" }, // विसर्ग
  { roman: "~", type: "modifier", independent: "ँ" }, // चंद्रबिंदू (rare in Marathi, kept for completeness)
];

/**
 * CONSONANTS — व्यंजन
 * `independent` here is the base consonant letter carrying the
 * inherent "अ" sound (क = "ka"), matching normal Devanagari usage.
 */
export const CONSONANTS: PhoneticToken[] = [
  // Special conjuncts — must be matched before their component parts
  { roman: "ksh", type: "consonant", independent: "क्ष" },
  { roman: "x", type: "consonant", independent: "क्ष" },
  { roman: "dnya", type: "consonant", independent: "ज्ञ" },
  { roman: "dny", type: "consonant", independent: "ज्ञ" },
  { roman: "gnya", type: "consonant", independent: "ज्ञ" },
  { roman: "gy", type: "consonant", independent: "ज्ञ" },
  { roman: "tra", type: "consonant", independent: "त्र" },

  // Velars
  { roman: "kh", type: "consonant", independent: "ख" },
  { roman: "k", type: "consonant", independent: "क" },
  { roman: "gh", type: "consonant", independent: "घ" },
  { roman: "g", type: "consonant", independent: "ग" },
  { roman: "NG", type: "consonant", independent: "ङ" },
  { roman: "ng", type: "consonant", independent: "ङ" },
  // Bare "c" was previously unmapped (only ch/Ch/chh were), so any word
  // with a lone "c" — office, college, computer, card — left the Latin
  // letter untouched in the output. English loanword "c" overwhelmingly
  // reads as a hard /k/ in the words that actually get transliterated
  // (कॉलेज, कॉम्प्युटर, कार्ड), so it's mapped to क here. This is a
  // simplification — a soft "c" (city, cent) would need क too since
  // Devanagari क has no dedicated "soft c" letter; those words are rare
  // enough among common loanwords that this default is reasonable.
  { roman: "c", type: "consonant", independent: "क" },

  // Palatals
  { roman: "chh", type: "consonant", independent: "छ" },
  { roman: "Ch", type: "consonant", independent: "छ" },
  { roman: "ch", type: "consonant", independent: "च" },
  { roman: "jh", type: "consonant", independent: "झ" },
  { roman: "z", type: "consonant", independent: "झ" },
  { roman: "j", type: "consonant", independent: "ज" },
  { roman: "NY", type: "consonant", independent: "ञ" },
  { roman: "ny", type: "consonant", independent: "ञ" },

  // Retroflex (capitalised = retroflex convention)
  { roman: "Th", type: "consonant", independent: "ठ" },
  { roman: "T", type: "consonant", independent: "ट" },
  { roman: "Dh", type: "consonant", independent: "ढ" },
  { roman: "D", type: "consonant", independent: "ड" },
  { roman: "N", type: "consonant", independent: "ण" },

  // Dentals
  { roman: "th", type: "consonant", independent: "थ" },
  { roman: "t", type: "consonant", independent: "त" },
  { roman: "dh", type: "consonant", independent: "ध" },
  { roman: "d", type: "consonant", independent: "द" },
  { roman: "n", type: "consonant", independent: "न" },

  // Labials
  { roman: "ph", type: "consonant", independent: "फ" },
  { roman: "f", type: "consonant", independent: "फ" },
  { roman: "bh", type: "consonant", independent: "भ" },
  { roman: "p", type: "consonant", independent: "प" },
  { roman: "b", type: "consonant", independent: "ब" },
  { roman: "m", type: "consonant", independent: "म" },

  // Semi-vowels / sibilants / aspirate
  { roman: "y", type: "consonant", independent: "य" },
  { roman: "r", type: "consonant", independent: "र" },
  { roman: "l", type: "consonant", independent: "ल" },
  { roman: "L", type: "consonant", independent: "ळ" }, // Marathi-specific retroflex L
  { roman: "ld", type: "consonant", independent: "ळ" },
  { roman: "v", type: "consonant", independent: "व" },
  { roman: "w", type: "consonant", independent: "व" },
  { roman: "sh", type: "consonant", independent: "श" },
  { roman: "Sh", type: "consonant", independent: "ष" },
  { roman: "shh", type: "consonant", independent: "ष" },
  { roman: "s", type: "consonant", independent: "स" },
  { roman: "h", type: "consonant", independent: "ह" },
];

export const HALANT = "्";

export const DIGITS: Record<string, string> = {
  "0": "०",
  "1": "१",
  "2": "२",
  "3": "३",
  "4": "४",
  "5": "५",
  "6": "६",
  "7": "७",
  "8": "८",
  "9": "९",
};

/** All tokens, pre-sorted longest-roman-first for greedy matching. */
export const ALL_TOKENS: PhoneticToken[] = [...CONSONANTS, ...VOWELS, ...MODIFIERS].sort(
  (a, b) => b.roman.length - a.roman.length
);
