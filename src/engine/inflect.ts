/**
 * inflect.ts
 * -----------------------------------------------------------------------
 * Marathi is a heavily inflected language: nouns take case suffixes
 * (locative, dative, instrumental, ...) and verbs conjugate by person,
 * gender, and tense. A flat word list can never cover every inflected
 * form, so this module GENERATES the regular ones from a small set of
 * base words + productive suffix rules, and only hardcodes the
 * irregular/suppletive forms that break the rules (e.g. करणे -> केला,
 * not करला).
 *
 * This is deliberately scoped to the patterns that are both (a) very
 * regular and (b) very high frequency, rather than attempting a full
 * morphological analyzer:
 *
 *   - Feminine आ-ending nouns (शाळा, भाषा, कविता, ...): oblique stem
 *     replaces final आ -> ए before most case suffixes.
 *   - Regular verb roots: present habitual (-तो/-ते/-तात/-तोस),
 *     past (-ला/-ली/-ले), future (-ईन/-शील/-एल) built off the root,
 *     UNLESS an irregular stem is supplied.
 *
 * Output feeds into dictionary.ts as lower-priority candidates (a
 * hand-curated RAW entry always wins if one exists for the same roman
 * spelling).
 * -----------------------------------------------------------------------
 */

export interface GeneratedEntry {
  romanForms: string[];
  candidates: string[];
}

/* ------------------------------------------------------------------ */
/* Feminine आ-ending nouns                                             */
/* ------------------------------------------------------------------ */

interface ANoun {
  /** Roman spelling of the base (dictionary) word, e.g. "shala" */
  roman: string;
  /** Devanagari base word, e.g. "शाळा" */
  base: string;
}

const A_FEMININE_NOUNS: ANoun[] = [
  { roman: "shala", base: "शाळा" },
  { roman: "bhasha", base: "भाषा" },
  { roman: "kavita", base: "कविता" },
  { roman: "vidya", base: "विद्या" },
  { roman: "ganga", base: "गंगा" },
  { roman: "khurchi", base: "खुर्ची" },
  { roman: "gadi", base: "गाडी" },
  { roman: "vata", base: "वाटा" },
  { roman: "sabha", base: "सभा" },
  { roman: "pariksha", base: "परीक्षा" },
];

// [roman suffix, devanagari suffix] applied to the oblique (ए-ending) stem
const A_NOUN_CASE_SUFFIXES: [string, string][] = [
  ["t", "त"], // locative: शाळेत ("at/in school")
  ["la", "ला"], // dative: शाळेला
  ["ne", "ने"], // instrumental: शाळेने
  ["sathi", "साठी"], // purposive: शाळेसाठी
  ["kade", "कडे"], // allative: शाळेकडे
  ["cha", "चा"], // possessive (masc): शाळेचा
  ["chi", "ची"], // possessive (fem): शाळेची
  ["che", "चे"], // possessive (neut): शाळेचे
];

function generateANounInflections(): GeneratedEntry[] {
  const entries: GeneratedEntry[] = [];
  for (const noun of A_FEMININE_NOUNS) {
    // Oblique stem: drop the trailing roman "a" and the Devanagari आ-MATRA
    // (U+093E, े.g. the ा in शाळा) — NOT the independent vowel आ, which
    // never appears word-finally on a consonant-stem noun like this.
    const romanStem = noun.roman.replace(/a$/, "e");
    const devStem = noun.base.replace(/\u093E$/, "\u0947"); // ा -> े
    for (const [romanSuffix, devSuffix] of A_NOUN_CASE_SUFFIXES) {
      entries.push({
        romanForms: [romanStem + romanSuffix],
        candidates: [devStem + devSuffix],
      });
    }
  }
  return entries;
}

/* ------------------------------------------------------------------ */
/* Verb conjugation                                                    */
/* ------------------------------------------------------------------ */

interface VerbRoot {
  /** Roman root, e.g. "kar" (करणे), "bol" (बोलणे) */
  roman: string;
  /** Devanagari root consonant(s) before the "णे" infinitive ending, e.g. "कर" */
  root: string;
  /** Irregular past stem, if the regular root+ला rule doesn't apply (e.g. कर -> केला). */
  irregularPast?: string;
  /** Irregular past stem in roman, for generating the roman lookup key. */
  irregularPastRoman?: string;
}

const VERB_ROOTS: VerbRoot[] = [
  { roman: "kar", root: "कर", irregularPast: "के", irregularPastRoman: "ke" }, // करणे -> केला (irregular)
  { roman: "ja", root: "जा", irregularPast: "गे", irregularPastRoman: "ge" }, // जाणे -> गेला (suppletive)
  { roman: "ye", root: "ये", irregularPast: "आ", irregularPastRoman: "aa" }, // येणे -> आला (suppletive)
  { roman: "de", root: "दे", irregularPast: "दि", irregularPastRoman: "di" }, // देणे -> दिला
  { roman: "ghe", root: "घे", irregularPast: "घेत", irregularPastRoman: "ghet" }, // घेणे -> घेतला
  { roman: "ho", root: "हो", irregularPast: "झा", irregularPastRoman: "jha" }, // होणे -> झाला (suppletive)
  { roman: "bol", root: "बोल" }, // बोलणे -> बोलला (regular)
  { roman: "chal", root: "चाल" }, // चालणे -> चालला (regular)
  { roman: "baagh", root: "बघ" }, // बघणे -> बघितला (semi-regular; approximated below as बघला)
  { roman: "vach", root: "वाच" }, // वाचणे -> वाचला (regular)
  { roman: "lihi", root: "लिही" }, // लिहिणे -> लिहिला (regular, vowel-stem)
  { roman: "khel", root: "खेळ" }, // खेळणे -> खेळला (regular)
  { roman: "shik", root: "शिक" }, // शिकणे -> शिकला (regular)
];

// Present habitual: root + these endings (masc-sg / fem-sg / plural / masc-2p)
const PRESENT_SUFFIXES: [string, string][] = [
  ["to", "तो"],
  ["te", "ते"],
  ["tat", "तात"],
  ["tos", "तोस"],
];

// Past: (regular or irregular) stem + these endings
const PAST_SUFFIXES: [string, string][] = [
  ["la", "ला"],
  ["li", "ली"],
  ["le", "ले"],
];

// Future: root + these endings
const FUTURE_SUFFIXES: [string, string][] = [
  ["in", "ईन"],
  ["shil", "शील"],
  ["el", "एल"],
];

function generateVerbInflections(): GeneratedEntry[] {
  const entries: GeneratedEntry[] = [];

  for (const verb of VERB_ROOTS) {
    for (const [romanSuffix, devSuffix] of PRESENT_SUFFIXES) {
      entries.push({
        romanForms: [verb.roman + romanSuffix],
        candidates: [verb.root + devSuffix],
      });
    }

    const pastRoman = verb.irregularPastRoman ?? verb.roman;
    const pastDev = verb.irregularPast ?? verb.root;
    for (const [romanSuffix, devSuffix] of PAST_SUFFIXES) {
      entries.push({
        romanForms: [pastRoman + romanSuffix],
        candidates: [pastDev + devSuffix],
      });
    }

    for (const [romanSuffix, devSuffix] of FUTURE_SUFFIXES) {
      entries.push({
        romanForms: [verb.roman + romanSuffix],
        candidates: [verb.root + devSuffix],
      });
    }
  }

  return entries;
}

/** All rule-generated (roman -> ranked candidates) entries, for merging into the dictionary. */
export function generateInflectedEntries(): GeneratedEntry[] {
  return [...generateANounInflections(), ...generateVerbInflections()];
}
