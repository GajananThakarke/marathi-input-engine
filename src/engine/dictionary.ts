/**
 * dictionary.ts
 * -----------------------------------------------------------------------
 * Why a dictionary layer exists at all:
 *
 * Roman Marathi is phonetically AMBIGUOUS. "nav" could render phonetically
 * as नव, but the intended word (name) is नाव. "majha" could give माझा,
 * but colloquial Marathi ("majha nav gajanan aahe") wants माझं. Pure
 * grapheme-by-grapheme rules can never resolve this — real Marathi input
 * methods (Google Input Tools, Baraha, etc.) all lean on a ranked
 * dictionary of known words layered on top of the phonetic engine.
 *
 * This file is a hand-curated seed dictionary covering the highest
 * frequency Marathi words (pronouns, question words, common verbs,
 * connectors, a few place/person names) so the engine's output on
 * everyday sentences matches what a native speaker actually expects.
 *
 * In production this seed would be replaced/augmented by a large
 * frequency-ranked corpus and a per-user "learned words" store (see
 * engine.ts `learnWord`) — the data shape below is designed so that
 * swap is a drop-in.
 * -----------------------------------------------------------------------
 */

import { generateInflectedEntries } from "./inflect";

export interface DictionaryEntry {
  /** All the Roman spellings a user might type for this word. */
  romanForms: string[];
  /** Ranked Devanagari candidates, most likely first. */
  candidates: string[];
}

// Each row: [ [roman spelling variants...], [devanagari candidates, ranked] ]
const RAW: [string[], string[]][] = [
  // --- Pronouns ---
  [["mi", "me"], ["मी"]],
  [["tu", "tuu"], ["तू"]],
  [["to"], ["तो"]],
  [["ti"], ["ती"]],
  [["te"], ["ते"]],
  [["amhi", "aamhi"], ["आम्ही"]],
  [["tumhi"], ["तुम्ही"]],
  [["tyanna", "tyanna"], ["त्यांना"]],
  [["mala"], ["मला"]],
  [["tula"], ["तुला"]],
  [["tyala"], ["त्याला"]],
  [["tila"], ["तिला"]],
  [["amhala", "aamhala"], ["आम्हाला"]],
  [["tumhala"], ["तुम्हाला"]],
  [["swatah", "swta"], ["स्वतः"]],

  // --- Possessives (the "majha" ambiguity lives here) ---
  [["majha", "mazha"], ["माझं", "माझा", "माझे"]],
  [["majhi", "mazhi"], ["माझी"]],
  [["tujha", "tuzha"], ["तुझं", "तुझा"]],
  [["tujhi", "tuzhi"], ["तुझी"]],
  [["tyacha"], ["त्याचं", "त्याचा"]],
  [["ticha"], ["तिचं", "तिचा"]],
  [["tichi"], ["तिची"]],
  [["apla", "aapla"], ["आपलं", "आपला"]],
  [["apli", "aapli"], ["आपली"]],
  [["tumcha"], ["तुमचं", "तुमचा"]],
  [["amcha", "aamcha"], ["आमचं", "आमचा"]],

  // --- Common nouns ---
  [["nav", "naav"], ["नाव"]],
  [["ghar"], ["घर"]],
  [["shala", "shaala"], ["शाळा"]],
  [["pustak"], ["पुस्तक"]],
  [["pani", "paani"], ["पाणी"]],
  [["jevan"], ["जेवण"]],
  [["kaam"], ["काम"]],
  [["gaav", "gav"], ["गाव"]],
  [["shahar"], ["शहर"]],
  [["desh"], ["देश"]],
  [["bhasha"], ["भाषा"]],
  [["divas"], ["दिवस"]],
  [["ratra", "raatra"], ["रात्र"]],
  [["vel"], ["वेळ"]],
  [["mitra"], ["मित्र"]],
  [["kutumb"], ["कुटुंब"]],
  [["aai"], ["आई"]],
  [["baba", "vadil"], ["बाबा"]],
  [["bhau"], ["भाऊ"]],
  [["bahin"], ["बहीण"]],

  // --- Be-verb / existence (very high frequency) ---
  [["aahe", "ahe"], ["आहे"]],
  [["aahet", "ahet"], ["आहेत"]],
  [["aahes", "ahes"], ["आहेस"]],
  [["nahi", "naahi"], ["नाही"]],
  [["hoto"], ["होतो"]],
  [["hoti"], ["होती"]],
  [["hote"], ["होते"]],
  [["hoin", "hoeen"], ["होईन"]],
  [["zala", "jhala"], ["झाला"]],
  [["zali", "jhali"], ["झाली"]],
  [["zale", "jhale"], ["झाले"]],

  // --- Common verbs ---
  [["karto"], ["करतो"]],
  [["karte"], ["करते"]],
  [["karaal", "karal"], ["कराल"]],
  [["karat"], ["करत"]],
  [["kartat"], ["करतात"]],
  [["jato"], ["जातो"]],
  [["jate"], ["जाते"]],
  [["yeto"], ["येतो"]],
  [["yete"], ["येते"]],
  [["bolto"], ["बोलतो"]],
  [["bolte"], ["बोलते"]],
  [["baghto", "baghato"], ["बघतो"]],
  [["khato"], ["खातो"]],
  [["khate"], ["खाते"]],
  [["deto"], ["देतो"]],
  [["ghetto", "gheto"], ["घेतो"]],
  [["samajhto", "samjhto"], ["समजतो"]],

  // --- Question words ---
  [["kay"], ["काय"]],
  [["kasa"], ["कसा"]],
  [["kashi"], ["कशी"]],
  [["kase"], ["कसे"]],
  [["kuthe"], ["कुठे"]],
  [["kadhi"], ["कधी"]],
  [["kiti"], ["किती"]],
  [["kon", "koN"], ["कोण"]],
  [["ka"], ["का"]],
  [["kashala"], ["कशाला"]],
  [["karan"], ["कारण"]],

  // --- Connectors / particles ---
  [["ki"], ["की"]],
  [["va"], ["व"]],
  [["ani", "aani"], ["आणि"]],
  [["pan"], ["पण"]],
  [["mhanun", "mhaNun"], ["म्हणून"]],
  [["jar"], ["जर"]],
  [["tar"], ["तर"]],
  [["pn"], ["पण"]],
  [["sathi"], ["साठी"]],

  // --- Adjectives ---
  [["changla", "changala"], ["चांगला"]],
  [["changli", "changali"], ["चांगली"]],
  [["mothha", "mota", "motha"], ["मोठा"]],
  [["mothi", "moti"], ["मोठी"]],
  [["lahan"], ["लहान"]],
  [["sundar"], ["सुंदर"]],
  [["nava", "navin"], ["नवीन"]],
  [["junaa", "juna"], ["जुना"]],

  // --- Retroflex-consonant words (ट/ठ/ड/ढ/ण) ---
  // "t"/"d"/"n" alone default to dental (त/द/न); the retroflex versions
  // (ट/ड/ण) need capital T/D/N (see README section 10 — this is a real
  // phonemic distinction, not a scheme quirk, and doubling can't be
  // repurposed as a marker since it's already used for gemination, e.g.
  // उत्तर). Seeding the common everyday words here means lowercase
  // typing resolves correctly without remembering the capital rule.
  [["neat", "nit"], ["नीट"]],
  [["vait", "vaeet"], ["वाईट"]],
  [["god", "goda"], ["गोड"]],
  [["zad", "jhad"], ["झाड"]],
  [["ghadyal"], ["घड्याळ"]],
  [["natak"], ["नाटक"]],
  [["batata"], ["बटाटा"]],
  [["road"], ["रोड"]],
  [["aath"], ["आठ"]],
  [["purna"], ["पूर्ण"]],

  // --- Time words ---
  [["aaj", "aj"], ["आज"]],
  [["udya"], ["उद्या"]],
  [["kal"], ["काल"]],
  [["sakali", "sakaali"], ["सकाळी"]],
  [["sandhyakali"], ["संध्याकाळी"]],
  [["ratri"], ["रात्री"]],
  [["roj"], ["रोज"]],

  // --- Places / proper nouns (seed set) ---
  [["mumbai"], ["मुंबई"]],
  [["pune", "puNe"], ["पुणे"]],
  [["nagpur"], ["नागपूर"]],
  [["maharashtra"], ["महाराष्ट्र"]],
  [["marathi"], ["मराठी"]],
  [["bharat"], ["भारत"]],
  [["gajanan"], ["गजानन"]],
  [["ganesh"], ["गणेश"]],
  [["sunil"], ["सुनील"]],
  [["sunita"], ["सुनीता"]],
  [["rahul"], ["राहुल"]],
  [["priya"], ["प्रिया"]],
  [["aalandi", "alandi"], ["आळंदी"]],
  [["nandi"], ["नंदी"]],
  [["ambika"], ["अंबिका"]],
  [["pandharpur"], ["पंढरपूर"]],
  [["shirdi"], ["शिर्डी"]],
  [["kolhapur"], ["कोल्हापूर"]],

  // --- English loanwords ---
  // These are extremely common in everyday and administrative Marathi,
  // but follow different phonology than native words: they use the
  // English-loanword vowels ऑ/ॲ (see phoneticData.ts) and often
  // nasalize (ँ) rather than spell out a full "n" consonant. Rather
  // than try to teach the general phonetic engine English orthography,
  // the correct spelling is looked up directly — the same approach
  // used for majha/nav earlier, applied to a different word class.
  [["bank"], ["बँक"]],
  [["office"], ["ऑफिस"]],
  [["offer"], ["ऑफर"]],
  [["operative"], ["ऑपरेटिव्ह"]],
  [["college"], ["कॉलेज"]],
  [["computer"], ["कॉम्प्युटर"]],
  [["doctor"], ["डॉक्टर"]],
  [["hospital"], ["हॉस्पिटल"]],
  [["station"], ["स्टेशन"]],
  [["ticket"], ["तिकीट"]],
  [["mobile"], ["मोबाईल"]],
  [["internet"], ["इंटरनेट"]],
  [["online"], ["ऑनलाइन"]],
  [["printer"], ["प्रिंटर"]],
  [["market"], ["मार्केट"]],
  [["bus"], ["बस"]],
  [["taxi"], ["टॅक्सी"]],
  [["hotel"], ["हॉटेल"]],
  [["department"], ["डिपार्टमेंट"]],
  [["report"], ["रिपोर्ट"]],
  [["project"], ["प्रोजेक्ट"]],
  [["meeting"], ["मीटिंग"]],
  [["manager"], ["मॅनेजर"]],
  [["officer"], ["ऑफिसर"]],
  [["password"], ["पासवर्ड"]],
  [["message"], ["मेसेज"]],
  [["number"], ["नंबर"]],
  [["form"], ["फॉर्म"]],
  [["xerox"], ["झेरॉक्स"]],
  [["pen"], ["पेन"]],
  [["file"], ["फाईल"]],
  [["table"], ["टेबल"]],
];

/** roman (lowercased) -> ranked Devanagari candidates */
export const DICTIONARY: Map<string, string[]> = new Map();

function mergeEntry(forms: string[], candidates: string[]): void {
  for (const form of forms) {
    const key = form.toLowerCase();
    const existing = DICTIONARY.get(key);
    if (existing) {
      for (const c of candidates) {
        if (!existing.includes(c)) existing.push(c);
      }
    } else {
      DICTIONARY.set(key, [...candidates]);
    }
  }
}

for (const [forms, candidates] of RAW) {
  mergeEntry(forms, candidates);
}

// Rule-generated inflected forms (noun cases, verb conjugations) are merged
// in AFTER the hand-curated list above, so a manually specified word always
// keeps its top ranking and the generated form only adds coverage for
// spellings the seed list doesn't already know about.
for (const generated of generateInflectedEntries()) {
  mergeEntry(generated.romanForms, generated.candidates);
}

/** Looks up ranked candidates for a lowercase roman word, or undefined. */
export function lookupWord(roman: string): string[] | undefined {
  return DICTIONARY.get(roman.toLowerCase());
}

/**
 * Adds/reinforces a user-confirmed (roman -> devanagari) pair, promoting
 * it to the top candidate next time. This is the hook `engine.learnWord`
 * uses so the input method improves with usage, the same way phone
 * keyboards learn corrections.
 */
export function learnWord(roman: string, devanagari: string): void {
  const key = roman.toLowerCase();
  const existing = DICTIONARY.get(key) ?? [];
  const withoutDup = existing.filter((c) => c !== devanagari);
  DICTIONARY.set(key, [devanagari, ...withoutDup]);
}
