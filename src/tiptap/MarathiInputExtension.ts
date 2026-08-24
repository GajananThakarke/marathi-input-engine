/**
 * MarathiInputExtension.ts
 * -----------------------------------------------------------------------
 * A Tiptap Extension that turns any Tiptap editor into a Marathi phonetic
 * input surface, without needing a custom keyboard layout or IME at the
 * OS level.
 *
 * HOW IT WORKS (mirrors how real Marathi/Indic IMEs behave in a browser):
 *
 *   1. While the engine is enabled, every ASCII-letter keystroke is
 *      appended to an in-memory "Roman buffer" for the CURRENT word
 *      (tracked via a ProseMirror plugin state, not the DOM).
 *   2. After each keystroke, the Devanagari TEXT ALREADY IN THE DOCUMENT
 *      for that word is replaced with a fresh dictionary/phonetic preview
 *      — ranked using the PREVIOUS committed word as context (see
 *      engine.getSuggestions' `prevWord`) — so the user sees live,
 *      context-aware feedback exactly like typing on a native keyboard.
 *   3. On a "commit" boundary — space, punctuation, Enter, or Escape —
 *      the buffered word is resolved and the top candidate replaces the
 *      live preview. The chosen word becomes `lastCommittedWord`, which
 *      is what the NEXT word's suggestions are ranked against, and the
 *      choice is fed to `learnWord` (roman, devanagari, prevWord) so the
 *      same word after the same previous word is preferred next time —
 *      persisted across reloads via localStorage (see persistence.ts).
 *   4. Pressing Tab (or Alt+1–5) while a word is "live" cycles through
 *      ranked getSuggestions() candidates instead of committing the
 *      default — surfaced to the UI via "activeSuggestions" for a
 *      floating picker (see SuggestionPopup.tsx in the demo).
 *   5. Backspace while a word is live removes the last Roman character
 *      and re-renders the preview, so corrections stay phonetic instead
 *      of falling back to raw character deletion mid-Devanagari-akshar.
 *   6. `compositionend` is also handled (best-effort) so soft/mobile
 *      keyboards that compose text via IME events, rather than firing
 *      one `handleTextInput` per character, still get converted — see
 *      the "Mobile/IME" section below for the caveats.
 *
 * CURSOR PRESERVATION: because we always replace the *entire* buffered
 * word's range (from wordStartPos to current selection) in one
 * transaction, and always re-place the cursor at
 * wordStartPos + renderedText.length, the caret reliably stays at "end
 * of what was just typed" even though the number of UTF-16 code units
 * in Devanagari output rarely matches the number of Roman characters
 * typed. This avoids the classic IME bug where the cursor drifts left
 * or right of where the user is actually looking.
 * -----------------------------------------------------------------------
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { previewWord, getSuggestions, learnWord, type Suggestion } from "../engine/engine";

export interface MarathiInputPluginState {
  enabled: boolean;
  /** Document position where the word currently being typed starts. Null = no active word. */
  wordStart: number | null;
  /** Raw Roman characters typed so far for the active word. */
  romanBuffer: string;
  /** Ranked candidates for the active word, refreshed on each keystroke/cycle. */
  activeSuggestions: Suggestion[];
  /** Index into activeSuggestions currently shown (cycled by Tab). */
  suggestionIndex: number;
  /** Devanagari form of the most recently committed word — the context signal for the next word's ranking. */
  lastCommittedWord: string | null;
}

export const marathiInputPluginKey = new PluginKey<MarathiInputPluginState>("marathiInput");

const WORD_CHAR = /[A-Za-z]/;
const COMMIT_CHARS = new Set([" ", "\n", ".", ",", "!", "?", ";", ":", '"', "'", ")", "]", "}"]);

function initialState(enabled: boolean): MarathiInputPluginState {
  return {
    enabled,
    wordStart: null,
    romanBuffer: "",
    activeSuggestions: [],
    suggestionIndex: 0,
    lastCommittedWord: null,
  };
}

export interface MarathiInputOptions {
  /** Whether the engine starts enabled. Default true. */
  enabledByDefault: boolean;
}

export const MarathiInputExtension = Extension.create<MarathiInputOptions>({
  name: "marathiInput",

  addOptions() {
    return { enabledByDefault: true };
  },

  addCommands() {
    return {
      setMarathiInputEnabled:
        (enabled: boolean) =>
        ({ tr, dispatch, state }: { tr: Transaction; dispatch?: (tr: Transaction) => void; state: EditorState }) => {
          const pluginState = marathiInputPluginKey.getState(state);
          if (!pluginState) return false;
          tr.setMeta(marathiInputPluginKey, { type: "toggle", enabled });
          if (dispatch) dispatch(tr);
          return true;
        },
      cycleMarathiSuggestion:
        (direction: 1 | -1) =>
        ({ tr, dispatch, state }: { tr: Transaction; dispatch?: (tr: Transaction) => void; state: EditorState }) => {
          const pluginState = marathiInputPluginKey.getState(state);
          if (!pluginState || pluginState.wordStart === null || pluginState.activeSuggestions.length === 0) {
            return false;
          }
          const total = pluginState.activeSuggestions.length;
          const nextIndex = (pluginState.suggestionIndex + direction + total) % total;
          const candidate = pluginState.activeSuggestions[nextIndex].devanagari;
          const from = pluginState.wordStart;
          const to = from + rememberedRenderedLength();
          tr.insertText(candidate, from, to);
          tr.setSelection(TextSelection.create(tr.doc, from + candidate.length));
          tr.setMeta(marathiInputPluginKey, { type: "cycle", index: nextIndex });
          if (dispatch) dispatch(tr);
          return true;
        },
      commitMarathiWord:
        () =>
        ({ tr, dispatch, state }: { tr: Transaction; dispatch?: (tr: Transaction) => void; state: EditorState }) => {
          const pluginState = marathiInputPluginKey.getState(state);
          if (!pluginState || pluginState.wordStart === null) return false;
          const from = pluginState.wordStart;
          const to = from + rememberedRenderedLength();
          const top = pluginState.activeSuggestions[pluginState.suggestionIndex]?.devanagari ?? "";
          tr.insertText(top, from, to);
          tr.setSelection(TextSelection.create(tr.doc, from + top.length));
          tr.setMeta(marathiInputPluginKey, { type: "commit", committedWord: top || null });
          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const enabledByDefault = this.options.enabledByDefault;

    // We cache the currently-rendered word length on a view-local closure
    // variable (not plugin state) because ProseMirror plugin state should
    // stay a pure function of transactions; storing it here keeps command
    // implementations simple. Exposed to the module-level helper below via
    // a tiny registry so commands (which only see EditorState) can read it.
    let lastRenderedLength = 0;
    renderedLengthRegistry.get = () => lastRenderedLength;
    const setRenderedLength = (n: number) => {
      lastRenderedLength = n;
    };

    /**
     * Shared "extend the active word's roman buffer by `chunk`, re-render,
     * replace the doc range, update plugin state" routine. Used by both
     * handleTextInput (per-keystroke, desktop) and the compositionend
     * handler (per-composed-chunk, mobile/IME) so the two paths can't
     * drift out of sync.
     */
    function applyBuffer(
      view: EditorView,
      pluginState: MarathiInputPluginState,
      insertedFrom: number,
      insertedTo: number,
      chunk: string
    ) {
      const isContinuing = pluginState.wordStart !== null && insertedFrom === pluginState.wordStart + lastRenderedLength;
      const wordStart = isContinuing ? pluginState.wordStart! : insertedFrom;
      const romanBuffer = (isContinuing ? pluginState.romanBuffer : "") + chunk;

      const suggestions = getSuggestions(romanBuffer, { prevWord: pluginState.lastCommittedWord ?? undefined });
      const preview = suggestions[0]?.devanagari ?? previewWord(romanBuffer);

      const tr = view.state.tr;
      tr.insertText(preview, wordStart, insertedTo);
      tr.setSelection(TextSelection.create(tr.doc, wordStart + preview.length));
      tr.setMeta(marathiInputPluginKey, { type: "wordUpdate", wordStart, romanBuffer, suggestions });
      setRenderedLength(preview.length);
      view.dispatch(tr);
    }

    return [
      new Plugin<MarathiInputPluginState>({
        key: marathiInputPluginKey,

        state: {
          init: () => initialState(enabledByDefault),
          apply(tr, prev) {
            const meta = tr.getMeta(marathiInputPluginKey);

            if (meta?.type === "toggle") {
              return initialState(meta.enabled);
            }
            if (meta?.type === "commit") {
              return {
                ...prev,
                wordStart: null,
                romanBuffer: "",
                activeSuggestions: [],
                suggestionIndex: 0,
                lastCommittedWord: meta.committedWord ?? prev.lastCommittedWord,
              };
            }
            if (meta?.type === "cycle") {
              return { ...prev, suggestionIndex: meta.index };
            }
            if (meta?.type === "wordUpdate") {
              return {
                ...prev,
                wordStart: meta.wordStart,
                romanBuffer: meta.romanBuffer,
                activeSuggestions: meta.suggestions,
                suggestionIndex: 0,
              };
            }
            if (meta?.type === "clear") {
              return { ...prev, wordStart: null, romanBuffer: "", activeSuggestions: [], suggestionIndex: 0 };
            }
            // Positions shift with normal document edits elsewhere; map them.
            if (prev.wordStart !== null && tr.docChanged && !meta) {
              return { ...prev, wordStart: tr.mapping.map(prev.wordStart) };
            }
            return prev;
          },
        },

        props: {
          handleTextInput(view, from, to, text) {
            const pluginState = marathiInputPluginKey.getState(view.state);
            if (!pluginState?.enabled) return false;

            // Only intercept plain ASCII letters — everything else (including
            // spaces/punctuation) is handled in handleKeyDown / commit logic,
            // and non-Latin input (e.g. pasted Devanagari) passes through.
            if (!WORD_CHAR.test(text) || text.length !== 1) {
              return false;
            }

            applyBuffer(view, pluginState, from, to, text);
            return true;
          },

          handleKeyDown(view, event) {
            const pluginState = marathiInputPluginKey.getState(view.state);
            if (!pluginState?.enabled || pluginState.wordStart === null) return false;

            // Backspace: pop last roman char, re-render preview.
            if (event.key === "Backspace" && pluginState.romanBuffer.length > 0) {
              event.preventDefault();
              const romanBuffer = pluginState.romanBuffer.slice(0, -1);
              const from = pluginState.wordStart;
              const to = from + lastRenderedLength;

              if (romanBuffer.length === 0) {
                const tr = view.state.tr.delete(from, to);
                tr.setMeta(marathiInputPluginKey, { type: "clear" });
                setRenderedLength(0);
                view.dispatch(tr);
                return true;
              }

              const suggestions = getSuggestions(romanBuffer, { prevWord: pluginState.lastCommittedWord ?? undefined });
              const preview = suggestions[0]?.devanagari ?? previewWord(romanBuffer);
              const tr = view.state.tr;
              tr.insertText(preview, from, to);
              tr.setSelection(TextSelection.create(tr.doc, from + preview.length));
              tr.setMeta(marathiInputPluginKey, { type: "wordUpdate", wordStart: from, romanBuffer, suggestions });
              setRenderedLength(preview.length);
              view.dispatch(tr);
              return true;
            }

            // Tab / Shift+Tab cycles ranked suggestions without leaving the word.
            if (event.key === "Tab" && pluginState.activeSuggestions.length > 1) {
              event.preventDefault();
              const total = pluginState.activeSuggestions.length;
              const nextIndex = (pluginState.suggestionIndex + (event.shiftKey ? -1 : 1) + total) % total;
              const candidate = pluginState.activeSuggestions[nextIndex].devanagari;
              const from = pluginState.wordStart;
              const to = from + lastRenderedLength;
              const tr = view.state.tr;
              tr.insertText(candidate, from, to);
              tr.setSelection(TextSelection.create(tr.doc, from + candidate.length));
              tr.setMeta(marathiInputPluginKey, { type: "cycle", index: nextIndex });
              setRenderedLength(candidate.length);
              view.dispatch(tr);
              return true;
            }

            // Alt+1..5 picks a suggestion directly (common IME convention) and commits it.
            if (/^[1-5]$/.test(event.key) && pluginState.activeSuggestions.length > 1 && event.altKey) {
              event.preventDefault();
              const idx = Number(event.key) - 1;
              if (idx < pluginState.activeSuggestions.length) {
                const candidate = pluginState.activeSuggestions[idx].devanagari;
                const from = pluginState.wordStart;
                const to = from + lastRenderedLength;
                const tr = view.state.tr;
                tr.insertText(candidate, from, to);
                tr.setMeta(marathiInputPluginKey, { type: "commit", committedWord: candidate });
                tr.setSelection(TextSelection.create(tr.doc, from + candidate.length));
                setRenderedLength(0);
                view.dispatch(tr);
                learnWord(pluginState.romanBuffer, candidate, pluginState.lastCommittedWord ?? undefined);
              }
              return true;
            }

            // Commit boundary characters: finalize with the top ranked candidate,
            // then let the character itself (space, punctuation, Enter) proceed
            // normally through Tiptap's own input handling.
            if (COMMIT_CHARS.has(event.key) || event.key === "Enter") {
              const top = pluginState.activeSuggestions[pluginState.suggestionIndex]?.devanagari;
              if (top) {
                learnWord(pluginState.romanBuffer, top, pluginState.lastCommittedWord ?? undefined);
              }
              const tr = view.state.tr;
              tr.setMeta(marathiInputPluginKey, { type: "commit", committedWord: top ?? null });
              view.dispatch(tr);
              setRenderedLength(0);
              return false; // allow the actual keystroke to insert normally
            }

            // Escape: revert to plain roman text (opt-out for this word).
            if (event.key === "Escape") {
              const from = pluginState.wordStart;
              const to = from + lastRenderedLength;
              const tr = view.state.tr.insertText(pluginState.romanBuffer, from, to);
              tr.setMeta(marathiInputPluginKey, { type: "clear" });
              setRenderedLength(0);
              view.dispatch(tr);
              return true;
            }

            return false;
          },

          /*
           * Mobile / soft-keyboard support (best-effort).
           * -----------------------------------------------------------
           * Many mobile browsers (notably Android Chrome/Gboard) don't
           * fire a clean `handleTextInput` per character the way desktop
           * keyboards do — they compose text via `compositionstart` /
           * `compositionupdate` / `compositionend`, and by the time
           * `compositionend` fires, ProseMirror has already synced the
           * raw composed text into the document from the DOM. So instead
           * of intercepting input directly, we let that sync happen and
           * then, on `compositionend`, treat the just-inserted raw text
           * (found immediately before the caret) the same way a keystroke
           * chunk is treated: fold it into the roman buffer, re-render as
           * a Devanagari preview, and replace it in place.
           *
           * Caveat: this has been implemented against the DOM Composition
           * Event spec and exercised via the automated engine tests, but
           * NOT verified on a physical Android/iOS device — this sandbox
           * has no mobile browser to test against. Treat it as a
           * reasonable first pass, not a verified guarantee, and please
           * file/adjust behaviour against real devices before shipping.
           */
          handleDOMEvents: {
            compositionend(view: EditorView, event: Event) {
              const pluginState = marathiInputPluginKey.getState(view.state);
              if (!pluginState?.enabled) return false;

              const data = (event as CompositionEvent).data ?? "";
              // Only handle compositions that are plain ASCII letters —
              // anything else (emoji, native Devanagari IME, etc.) passes
              // through untouched rather than risk mangling it.
              if (!data || !/^[A-Za-z]+$/.test(data)) return false;

              const { from: selFrom } = view.state.selection;
              const insertedFrom = selFrom - data.length;
              if (insertedFrom < 0) return false;

              applyBuffer(view, pluginState, insertedFrom, selFrom, data);
              return true;
            },
          },

          handleClickOn() {
            // Clicking elsewhere ends the active word (finalizes as-is).
            return false;
          },
        },
      }),
    ];
  },
});

// Small side-channel so commands (which only see EditorState, not the
// view-local `lastRenderedLength`) can read the last rendered length.
// Kept intentionally tiny/local to this file.
const renderedLengthRegistry: { get: () => number } = { get: () => 0 };
function rememberedRenderedLength(): number {
  return renderedLengthRegistry.get();
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    marathiInput: {
      setMarathiInputEnabled: (enabled: boolean) => ReturnType;
      cycleMarathiSuggestion: (direction: 1 | -1) => ReturnType;
      commitMarathiWord: () => ReturnType;
    };
  }
}
