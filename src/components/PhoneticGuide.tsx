import "./PhoneticGuide.css";

const ROWS: { label: string; pairs: [string, string][] }[] = [
  {
    label: "स्वर · vowels",
    pairs: [
      ["a", "अ"],
      ["aa / A", "आ"],
      ["i", "इ"],
      ["ee / I", "ई"],
      ["u", "उ"],
      ["oo / U", "ऊ"],
      ["e", "ए"],
      ["ai", "ऐ"],
      ["o", "ओ"],
      ["au", "औ"],
    ],
  },
  {
    label: "विशेष · Marathi-specific",
    pairs: [
      ["L / ld", "ळ"],
      ["M", "ं"],
      ["H", "ः"],
      ["Sh / shh", "ष"],
      ["ksh / x", "क्ष"],
      ["dnya / gy", "ज्ञ"],
    ],
  },
  {
    label: "व्यंजन नमुना · consonant sample",
    pairs: [
      ["k / kh", "क / ख"],
      ["g / gh", "ग / घ"],
      ["ch / Ch", "च / छ"],
      ["T / D", "ट / ड"],
      ["t / d", "त / द"],
      ["p / ph", "प / फ"],
      ["sh / s", "श / स"],
    ],
  },
];

export function PhoneticGuide() {
  return (
    <div className="phonetic-guide">
      <h2 className="phonetic-guide__title">उच्चार कोश</h2>
      <p className="phonetic-guide__sub">Roman → Devanagari key</p>
      {ROWS.map((row) => (
        <div className="phonetic-guide__row" key={row.label}>
          <div className="phonetic-guide__row-label">{row.label}</div>
          <div className="phonetic-guide__keys">
            {row.pairs.map(([roman, dev]) => (
              <div className="keycap" key={roman}>
                <span className="keycap__roman">{roman}</span>
                <span className="keycap__dev">{dev}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
