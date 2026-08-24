import type { Suggestion } from "../engine/engine";
import "./SuggestionPopup.css";

interface Props {
  suggestions: Suggestion[];
  activeIndex: number;
  romanBuffer: string;
  style: React.CSSProperties;
}

export function SuggestionPopup({ suggestions, activeIndex, romanBuffer, style }: Props) {
  if (suggestions.length === 0) return null;

  return (
    <div className="suggestion-popup" style={style} role="listbox" aria-label="Marathi word suggestions">
      <div className="suggestion-popup__roman">{romanBuffer}</div>
      <ul>
        {suggestions.map((s, i) => (
          <li key={s.devanagari + i} className={i === activeIndex ? "is-active" : ""} role="option" aria-selected={i === activeIndex}>
            <span className="suggestion-popup__index">{i + 1}</span>
            <span className="suggestion-popup__word">{s.devanagari}</span>
            <span className={`suggestion-popup__source suggestion-popup__source--${s.source}`}>
              {s.source === "dictionary" ? "शब्दकोश" : "उच्चार"}
            </span>
          </li>
        ))}
      </ul>
      <div className="suggestion-popup__hint">Tab पुढचा पर्याय · Alt+1–5 निवडा · Space/Enter निश्चित</div>
    </div>
  );
}
