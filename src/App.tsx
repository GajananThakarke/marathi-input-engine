import { useCallback, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { MarathiInputExtension, marathiInputPluginKey } from "./tiptap/MarathiInputExtension";
import { useMarathiInputState } from "./tiptap/useMarathiInputState";
import { resetLearning } from "./engine/engine";
import { SuggestionPopup } from "./components/SuggestionPopup";
import { PhoneticGuide } from "./components/PhoneticGuide";
import "./App.css";

const SAMPLE = "majha nav gajanan aahe";

function App() {
  const editorWrapRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(true);

  const extensions = useMemo(
    () => [StarterKit, MarathiInputExtension.configure({ enabledByDefault: true })],
    []
  );

  const editor = useEditor({
    extensions,
    content: "<p></p>",
    editorProps: {
      attributes: {
        class: "marathi-editor",
        spellCheck: "false",
      },
    },
  });

  const pluginState = useMarathiInputState(editor);

  const toggleEnabled = useCallback(() => {
    if (!editor) return;
    const next = !enabled;
    setEnabled(next);
    editor.commands.setMarathiInputEnabled(next);
  }, [editor, enabled]);

  const insertSample = useCallback(() => {
    if (!editor) return;
    editor.commands.clearContent(true);
    let i = 0;
    const type = () => {
      if (!editor || i >= SAMPLE.length) return;
      const ch = SAMPLE[i];
      editor.view.someProp("handleTextInput", (fn) => {
        const { from, to } = editor.state.selection;
        return fn(editor.view, from, to, ch, () => editor.state.tr);
      });
      if (ch === " ") {
        const tr = editor.state.tr;
        tr.setMeta(marathiInputPluginKey, { type: "commit" });
        editor.view.dispatch(tr);
        editor.commands.insertContent(" ");
      }
      i += 1;
      window.setTimeout(type, 55);
    };
    editor.commands.focus("end");
    type();
  }, [editor]);

  // Position the suggestion popup just under the caret.
  const popupStyle = useMemo(() => {
    if (!editor || !pluginState || pluginState.wordStart === null || pluginState.activeSuggestions.length === 0) {
      return null;
    }
    try {
      const coords = editor.view.coordsAtPos(editor.state.selection.from);
      const wrapRect = editorWrapRef.current?.getBoundingClientRect();
      if (!wrapRect) return null;
      return {
        left: coords.left - wrapRect.left,
        top: coords.bottom - wrapRect.top + 6,
      };
    } catch {
      return null;
    }
  }, [editor, pluginState]);

  return (
    <div className="page">
      <header className="masthead">
        <div className="masthead__eyebrow">Roman → Devanagari · phonetic input method</div>
        <h1 className="masthead__title">मराठी टंकलेखन यंत्र</h1>
        <p className="masthead__tagline">
          Type <span className="masthead__mono">majha nav gajanan aahe</span> on a plain QWERTY keyboard, get{" "}
          <span className="masthead__dev">माझं नाव गजानन आहे</span> — live, inside a Tiptap editor.
        </p>
      </header>

      <main className="layout">
        <section className="editor-card">
          <div className="editor-card__bar">
            <button
              type="button"
              className={`toggle ${enabled ? "is-on" : ""}`}
              onClick={toggleEnabled}
              aria-pressed={enabled}
            >
              <span className="toggle__dot" />
              मराठी इनपुट {enabled ? "चालू" : "बंद"}
            </button>
            <button type="button" className="sample-btn" onClick={insertSample}>
              ▸ उदाहरण टाइप करा
            </button>
            <button
              type="button"
              className="reset-btn"
              onClick={() => {
                resetLearning();
                window.location.reload();
              }}
              title="Clears learned words + context memory saved in this browser (localStorage) and reloads"
            >
              ↺ शिकलेले विसरा
            </button>
          </div>

          <div className="editor-wrap" ref={editorWrapRef}>
            <EditorContent editor={editor} />
            {pluginState && popupStyle && (
              <SuggestionPopup
                suggestions={pluginState.activeSuggestions}
                activeIndex={pluginState.suggestionIndex}
                romanBuffer={pluginState.romanBuffer}
                style={popupStyle}
              />
            )}
          </div>

          <div className="editor-card__footnote">
            स्पेस/एंटर = निश्चित करा (commit) · Tab = पुढचा पर्याय (next suggestion) · Backspace = अक्षर मागे (undo phonetically) ·
            Esc = रोमन कायम ठेवा (keep Roman as-is) · शब्दाच्या शेवटी <code>_</code> = हलंत सक्ती (force halant, e.g. bhagavaan_ → भगवान्)
          </div>
          <div className="editor-card__footnote editor-card__footnote--muted">
            निवडलेले शब्द व त्यांचा संदर्भ (context) या ब्राउझरमध्ये आपोआप जतन होतात — पुढच्या वेळी तोच शब्द आधी दिसेल.
          </div>
        </section>

        <aside className="side-rail">
          <PhoneticGuide />
          <div className="architecture-note">
            <h2>हे कसं काम करतं?</h2>
            <ol>
              <li>प्रत्येक अक्षर टाइप करताच शब्द रोमन बफरमध्ये जमा होतो.</li>
              <li>Phonetic engine + शब्दकोश + मागील शब्दाचा संदर्भ (context) तात्काळ अंदाज दाखवतात.</li>
              <li>Space/विरामचिन्हावर सर्वोत्तम पर्याय निश्चित होतो; कर्सर बरोबर जागी राहतो.</li>
              <li>निवडलेला शब्द व त्याआधीचा शब्द (bigram) दोन्ही लक्षात राहतात — आणि ब्राउझरमध्ये जतन होतात.</li>
              <li>नियमित नामांची विभक्ती (शाळा→शाळेत) व क्रियापदांची रूपे (कर→करतो/केला) आपोआप तयार होतात.</li>
            </ol>
          </div>
        </aside>
      </main>

      <footer className="page-footer">
        Marathi Intelligent Transliteration &amp; Typing Engine — client-side, framework: Tiptap / ProseMirror.
      </footer>
    </div>
  );
}

export default App;
