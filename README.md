# मराठी टंकलेखन यंत्र — Marathi Input Engine

A lightweight, client-side phonetic input method that lets people type Marathi using a plain
English QWERTY keyboard inside a **Tiptap** rich-text editor:

```
majha nav gajanan aahe   →   माझं नाव गजानन आहे
```

It is an **input method**, not a translator: Roman *Marathi* words in, Devanagari *Marathi*
text out — the same relationship a phonetic Hindi/Marathi keyboard app has to what you type.

Live demo: `npm install && npm run dev`, then type in the editor. Click **"▸ उदाहरण टाइप करा"**
to watch the exact example from the brief type itself out.

---

## 1. Architecture

```
Tiptap Editor (React)
  |
  |  MarathiInputExtension  (ProseMirror plugin)
  |  - handleTextInput -> buffer roman chars, render live preview
  |  - handleKeyDown   -> backspace / Tab-cycle / commit / escape
  |  - plugin state    -> { wordStart, romanBuffer, suggestions }
  |
  v  calls
engine.ts   (framework-agnostic, pure functions)
  - transliterateText / transliterateWord / getSuggestions
  - splitIntoWordsAndSeparators (preserves spacing/punctuation)
  - learnWord (feeds corrections back into the dictionary)
  |
  +--> dictionary.ts       known-word, multi-spelling, ranked candidates
  |
  +--> transliterate.ts    tokenize() + render(): pure phonetic rules
            |               (मात्रा / हलंत / जोडाक्षर)
            v
       phoneticData.ts     स्वर / व्यंजन lookup tables
```

The engine (`src/engine/*`) has **zero dependency on Tiptap or the DOM** — it's plain
TypeScript you could drop into a CLI, a mobile app, or a different editor entirely. The
Tiptap-specific code lives only in `src/tiptap/*`.

## 2. Why a dictionary layer, not just phonetic rules

Roman Marathi is genuinely ambiguous: `nav` is phonetically न+व (नव), but the *word* "name"
is नाव (long आ). `majha` phonetically renders माझा, but the colloquial word the brief asks
for is माझं. No grapheme-level rule set can resolve this — every real Indic input method
(Google Input Tools, Baraha, iOS Marathi keyboard) leans on a ranked dictionary of known
words layered on top of a phonetic fallback for anything unrecognised. That's the design
here:

1. **Dictionary hit** (`dictionary.ts`) → used first, ranked candidates shown.
2. **Phonetic fallback** (`transliterate.ts`) → used for any word the dictionary hasn't
   seen, plus a small set of vowel-length alternates (`a`↔`aa`, `i`↔`ee`, `u`↔`oo`) so the
   suggestion list still offers a plausible alternate reading.
3. **Learning** (`learnWord`) → whenever a word is committed, its top candidate is promoted,
   so repeated corrections stick for the rest of the session (a real deployment would persist
   this per-user, e.g. in the Laravel backend, instead of in memory).

## 3. Marathi orthography rules implemented (`transliterate.ts`)

| Requirement (from brief)      | Where it's handled                                            |
|--------------------------------|----------------------------------------------------------------|
| स्वर / चौदाखडी                  | `VOWELS` table, independent vs. matra forms in `render()`      |
| मात्रा                          | `render()` attaches the matra glyph when a vowel follows a consonant |
| अनुस्वार / विसर्ग / चंद्रबिंदू    | `MODIFIERS` table (`M`→ं, `H`→ः, `~`→ँ), always trail the last akshar |
| हलंत / विराम                    | inserted automatically whenever two consonant tokens are adjacent |
| जोडाक्षरे                       | emergent from the हलंत rule — chained consonants form real conjuncts (क्ष, त्र, ज्ञ get direct shortcuts too) |
| Marathi-specific phonemes      | `L`/`ld` → ळ (not present in Hindi phonetic schemes)            |
| Multiple Roman spellings       | `dictionary.ts` maps many spellings to one word (`ahe`/`aahe`, `changla`/`changala`, `nagpur`, …) |
| Word suggestions               | `getSuggestions()` — dictionary candidates + phonetic alternates, ranked |
| Context-aware ranking          | Session-level "last correction wins" via `learnWord`; see Roadmap for full context modelling |
| Cursor/selection preservation  | `MarathiInputExtension` always replaces the *whole* active word in one transaction and re-places the caret at `wordStart + renderedText.length` |
| Tiptap integration             | `MarathiInputExtension` (`addProseMirrorPlugins`, `addCommands`) |

## 4. Editing model (how typing actually behaves)

- Every ASCII letter is intercepted by `handleTextInput`, appended to a per-word Roman
  buffer, and the **live phonetic/dictionary preview** replaces the word in the document
  immediately — this is what makes it feel like a real keyboard, not a "convert after the
  fact" tool.
- **Space / Enter / punctuation** commits the top-ranked candidate and lets the character
  itself insert normally.
- **Backspace** pops the last Roman character and re-renders, so corrections stay phonetic
  instead of deleting half a Devanagari akshar.
- **Tab** (Shift+Tab to go back) cycles through ranked suggestions without leaving the word;
  **Alt+1…5** jumps straight to a suggestion, mirroring common IME conventions.
- **Escape** reverts the active word back to plain Roman text — an explicit opt-out.
- Toggling the engine off (`setMarathiInputEnabled(false)`) turns the editor back into a
  completely normal Tiptap instance.

## 5. Project layout

```
src/
  engine/
    phoneticData.ts     # स्वर/व्यंजन lookup tables (data only)
    transliterate.ts     # tokenizer + orthography renderer (pure functions)
    dictionary.ts        # known-word overrides, multi-spelling, learnWord()
    inflect.ts            # rule-generated noun-case & verb-conjugation forms
    persistence.ts        # localStorage-backed learned-word/context storage
    engine.ts             # public API: transliterateText, getSuggestions, ...
    index.ts
  tiptap/
    MarathiInputExtension.ts   # ProseMirror plugin: buffering, commit, cursor mgmt
    useMarathiInputState.ts    # React hook exposing live plugin state
  components/
    SuggestionPopup.tsx/.css   # floating candidate picker
    PhoneticGuide.tsx/.css     # Roman->Devanagari cheat sheet panel
  App.tsx / App.css / index.css
```

## 6. Using the engine outside this demo

```ts
import { transliterateText, getSuggestions } from "./src/engine/engine";

transliterateText("majha nav gajanan aahe");
// -> "माझं नाव गजानन आहे"

getSuggestions("nav");
// -> [{ devanagari: "नाव", source: "dictionary" }, { devanagari: "नव", source: "phonetic" }]
```

Dropping the extension into another Tiptap-based app (e.g. the existing Laravel + Tiptap
application referenced in the brief) is a two-line change:

```ts
import { MarathiInputExtension } from "./tiptap/MarathiInputExtension";

useEditor({
  extensions: [StarterKit, MarathiInputExtension],
});
```

The Laravel backend is untouched — it keeps doing document storage/app logic exactly as
today; the engine only ever runs client-side and hands Tiptap ordinary Devanagari text.

## 7. Known limitations & roadmap

The v1 gaps have been addressed (see below); this section now tracks what's still simplified
by design and where a production hardening pass would go next.

### Fixed in this version

1. **Inflection coverage.** `inflect.ts` now *generates* regular inflected forms instead of
   requiring every one to be hardcoded: feminine आ-ending nouns get their oblique-stem case
   suffixes (शाळा → शाळेत/शाळेला/शाळेने/...), and verb roots get regular present-habitual,
   past, and future conjugations — with irregular/suppletive past stems (कर→केला, जा→गेला,
   ये→आला, दे→दिला, घे→घेतला, हो→झाला) hardcoded since they genuinely break the regular
   pattern. A hand-curated entry always outranks a generated one for the same spelling.
2. **Explicit word-final हलंत.** A trailing `_` in the roman word now forces हलंत on the
   final consonant instead of the default inherent अ — e.g. `bhagavaan_` → भगवान्. (Note the
   medial vowel between ग and व still needs to be typed explicitly, same as everywhere else
   in the scheme: two consonants with no vowel token between them form a जोडाक्षर by design,
   so `bhagvaan_` alone gives भग्वान्, not भगवान्.)
3. **Context-aware ranking is now a real bigram model**, not just "last correction wins"
   globally. `getSuggestions(word, { prevWord })` checks whether this roman word was
   previously chosen right after the same preceding word and, if so, ranks that choice first
   with `source: "context"`. The Tiptap extension tracks `lastCommittedWord` in plugin state
   and passes it through automatically.
4. **Learning is persisted.** `persistence.ts` mirrors both learned words and bigram context
   into `localStorage` (guarded so the engine still works outside a browser, e.g. in a Node
   test). A "↺ शिकलेले विसरा" (forget learned words) button in the demo calls
   `resetLearning()` and clears it. Swapping this module for calls to a per-user Laravel
   endpoint is the natural next step for cross-device persistence.
5. **Mobile/IME composition** is now handled via a `compositionend` listener that folds
   composed text into the same roman-buffer pipeline as `handleTextInput`. **Caveat, stated
   plainly:** this was implemented against the DOM Composition Event spec and covered by the
   same engine-level tests as everything else, but this sandbox has no physical
   Android/iOS device or mobile browser to verify against — treat it as a solid first pass
   that needs real-device QA before shipping, not a verified guarantee.

### Still simplified by design (honest gaps)

1. **Dictionary/inflection breadth.** The seed dictionary (~150 words) plus generated
   inflections (10 nouns × 8 cases, 13 verbs × 10 forms) covers common pronouns, verbs, and
   the brief's example sentence well, but Marathi has far more noun-declension classes
   (this covers only feminine आ-stems) and irregular verbs than are modeled here. Scaling
   this to production means either a much larger frequency-ranked corpus or a proper
   morphological analyzer.
2. **Context model is bigram-only.** It looks one word back. A real language-model-based
   ranker (trigrams+, or a small neural LM) would resolve more ambiguity but is a
   meaningfully bigger system than fits here — the `Suggestion`/`getSuggestions` shape was
   kept generic specifically so that swap doesn't require touching the Tiptap layer.
3. **`localStorage` is per-browser, not per-account.** Two devices for the same user won't
   share learned words until this is wired to a backend endpoint.

## 8. English loanwords (bank, office, college, ...)

Marathi text is full of assimilated English loanwords, and they follow different rules than
native Marathi phonology — this needed a separate fix pass after the initial build:

- **A real bug**: bare `c` was never mapped to any consonant (only `ch`/`Ch`/`chh` were), so
  words like "offi**c**e" or "**c**ollege" left a literal Latin `c` sitting inside the
  Devanagari output. Fixed — `c` → क.
- **Two Devanagari vowel signs Marathi added specifically for English sounds** — ऑ (the
  open "o" in *office/coffee*) and ॲ (the flat "a" in *bank/cab*) — aren't part of the
  native चौदाखडी and weren't in the phonetic table at all. They're now available as opt-in
  tokens `aw` and `ae` respectively (see `phoneticData.ts`) for any loanword not already in
  the dictionary.
- **A loanword seed list** (`dictionary.ts`) now covers ~30 common ones — bank, office,
  offer, operative, college, computer, doctor, hospital, mobile, and more — the same
  "dictionary overrides ambiguous phonetics" approach used for native words like नाव/माझं.

**Deliberately not fixed: automatic double-consonant collapsing.** English spelling doubles
letters that don't reflect gemination ("offer" → single फ sound), but Marathi native words
can have *phonemic* doubled consonants that must stay as real conjuncts — e.g. पक्का
("pakka", meaning "definite/sure") is a different word from पका if the क्क conjunct
collapses to a single क. A blanket rule to "collapse doubled consonants" would silently
corrupt native Marathi words to fix English loanwords, which is a worse trade than the
current behavior (unlisted loanwords with doubled letters render literally as conjuncts
until added to the dictionary). This is exactly the same reasoning as the vowel-length
ambiguity documented in section 2 — resolved per-word via the dictionary, not by changing
the general phonetic rules.

## 9. Nasal + stop clusters now default to अनुस्वार (आळंदी, नंदी, अंबिका, संत, चंद्र, ...)

Words like आळंदी, नंदी, and अंबिका exposed a real gap in the phonetic rules, not just missing
dictionary entries: modern Marathi spells homorganic nasal+stop clusters with **अनुस्वार**
(ं) — संत, अंत, नंतर, मंद, चंद्र, कंटाळा — never with the nasal letter spelled out + हलंत
(सन्त, अन्त, etc.). The engine previously always built the explicit conjunct, which was wrong
across this entire word class, not just three names.

**Fix (`transliterate.ts`):** when a nasal consonant (न/ण/म/ङ/ञ) is immediately followed by
a stop consonant (क–भ, i.e. any plosive), render अनुस्वार instead of nasal+हलंत+consonant.
This is scoped deliberately narrow — **only nasal-followed-by-stop**, not nasal followed by
just anything:

```
sant    -> संत     ✓ (was सन्त)
ant     -> अंत     ✓ (was अन्त)
chandra -> चंद्र    ✓ exact match (was चन्द्र)
nantar  -> नंतर    ✓ (was नन्तर)
```

Nasal + semivowel/liquid/sibilant clusters (न्य, न्व, न्ह...) are lexically variable in real
Marathi spelling — अन्याय keeps its explicit न्य conjunct rather than becoming अंयाय — so
those are deliberately left out of the rule and still form explicit conjuncts as before.

**Caveat surfaced while verifying this**: testing "anyay" to confirm nasal+semivowel clusters
still work turned out to exercise a *different*, pre-existing ambiguity instead — `ny` was
already registered as its own two-letter token (→ ञ, for words like विज्ञान), so "anyay"
tokenizes as a single ञ before this new rule ever runs, rather than as separate न + य tokens.
The new rule never fires there either way (no regression), but that check didn't actually
prove what it was written to prove. Flagging it here rather than a comment nobody reads: `ny`
being ambiguous between "ñ" and "n+y" is a genuine open issue, unresolved by this pass.

Remaining gaps in this same family, still resolved per-word via the dictionary rather than a
general rule (documented in section 2's vowel-length discussion, same reasoning applies): ल
vs ळ requires the capital `L` convention, and word-final vowel length (ambika → needs long
आ) is inherently ambiguous from "a" alone.

## 10. Retroflex ट/ड require capital T/D — and can't not

Marathi (like Hindi) has a real phonemic distinction English doesn't: dental त/द/न vs.
retroflex ट/ड/ण are different consonants, not a spelling variant of the same sound. Since
plain ASCII only has one `t`/`d`/`n`, *something* has to mark the retroflex ones — this
engine follows the same convention as Google Input Tools, Baraha, and ITRANS: lowercase
defaults to dental, **capital marks retroflex** (T→ट, D→ड, N→ण), exactly like `L`→ळ
elsewhere in this scheme.

Two alternatives were considered and rejected, not overlooked:

- **Doubling as a retroflex marker** (`tt`→ट, `dd`→ड) — already taken. Marathi genuinely
  doubles dental consonants for gemination, e.g. **उत्तर** ("uttar", answer/north) needs
  त्त, not ट. Repurposing doubling would silently corrupt every word like this — same class
  of mistake as the double-consonant-collapsing idea rejected in section 8.
- **A digit or symbol marker** — the live-typing buffer in `MarathiInputExtension.ts` only
  captures `[A-Za-z]` per keystroke, and digits are already reserved (they pass through as
  Devanagari numerals ०–९), so neither is available without a bigger rework of the buffering
  model.

So this isn't fixable the way the bare-`c` bug was — it's a genuine phonemic distinction with
no safe unclaimed ASCII marker. The phonetic guide panel in the demo UI already surfaces the
`T/D → ट/ड` convention for exactly this reason. What *is* fixable: the same dictionary
approach used everywhere else in this doc — common retroflex words (नीट, वाईट, गोड, झाड,
घड्याळ, नाटक, बटाटा, आठ, पूर्ण, कारण, साठी, and more) are now seeded directly, so lowercase
typing resolves correctly for the words people actually type most, without needing to
remember the capital-letter rule at all.
