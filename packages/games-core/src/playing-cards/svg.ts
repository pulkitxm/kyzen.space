import type { JokerVariant, Rank, Suit } from "@kyzen/shared/types";

export const CARD_WIDTH = 360;
export const CARD_HEIGHT = 504;
export const CARD_VIEWBOX = `0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`;

const CX = 180;
const CY = 252;

const SUITS: Record<Suit, { color: string; name: string }> = {
  spades: { color: "#16161D", name: "Spades" },
  hearts: { color: "#C8102E", name: "Hearts" },
  clubs: { color: "#16161D", name: "Clubs" },
  diamonds: { color: "#C8102E", name: "Diamonds" },
};

const GOLD_BASE = "var(--pc-gold, var(--accent-warm, #c79a3e))";
const ROBE_BASE = "var(--pc-robe, var(--primary, #c8102e))";
const BACK_BASE = "var(--pc-back, var(--primary-dark, #6e1226))";

function mix(base: string, pct: number, other: string): string {
  return `color-mix(in srgb, ${base} ${pct}%, ${other})`;
}

const PIP = {
  heart:
    "M16 28 C16 28 4 20 4 12 C4 7.5 7.5 5 11 5 C13.6 5 15.3 6.6 16 8.2 C16.7 6.6 18.4 5 21 5 C24.5 5 28 7.5 28 12 C28 20 16 28 16 28 Z",
  diamond: "M16 2.5 L27.5 16 L16 29.5 L4.5 16 Z",
  spade:
    "M16 4 C13 11 4 13 4 20 C4 24 7.4 26.2 11 25.6 C13.5 25.2 15.1 24 16 22.2 C16.9 24 18.5 25.2 21 25.6 C24.6 26.2 28 24 28 20 C28 13 19 11 16 4 Z M12.6 29.2 C15.2 27.6 15.7 25 16 22.4 C16.3 25 16.8 27.6 19.4 29.2 Z",
};
function pipPathKey(suit: Suit): keyof typeof PIP {
  return suit === "hearts"
    ? "heart"
    : suit === "diamonds"
      ? "diamond"
      : "spade";
}

function pip(
  suit: Suit,
  cx: number,
  cy: number,
  s: number,
  rot = 0,
  color: string = SUITS[suit].color,
  flat = false,
): string {
  const t = `translate(${cx} ${cy}) scale(${s}) rotate(${rot}) translate(-16 -16)`;
  const f = flat ? "" : ' filter="url(#emboss)"';
  if (suit === "clubs") {
    return (
      `<g transform="${t}" fill="${color}"${f}>` +
      `<circle cx="16" cy="9.5" r="6.4"/><circle cx="8.6" cy="19" r="6.4"/><circle cx="23.4" cy="19" r="6.4"/>` +
      `<path d="M12.5 16.5 C12.5 23 11.4 27.8 8.4 30.4 L23.6 30.4 C20.6 27.8 19.5 23 19.5 16.5 Z"/></g>`
    );
  }
  return `<g transform="${t}" fill="${color}"${f}><path d="${PIP[pipPathKey(suit)]}"/></g>`;
}

function defs(): string {
  return `<defs>
    <radialGradient id="card" cx="50%" cy="36%" r="85%"><stop offset="0%" stop-color="#FFFDF7"/><stop offset="62%" stop-color="#F8F1E1"/><stop offset="100%" stop-color="#EEE2C8"/></radialGradient>
    <radialGradient id="vignette" cx="50%" cy="48%" r="72%"><stop offset="58%" stop-color="#3A2A08" stop-opacity="0"/><stop offset="100%" stop-color="#3A2A08" stop-opacity="0.14"/></radialGradient>
    <linearGradient id="goldFoil" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${mix(GOLD_BASE, 60, "#241a04")}"/><stop offset="20%" stop-color="${mix(GOLD_BASE, 82, "#ffffff")}"/><stop offset="42%" stop-color="${GOLD_BASE}"/><stop offset="58%" stop-color="${mix(GOLD_BASE, 78, "#ffffff")}"/><stop offset="80%" stop-color="${GOLD_BASE}"/><stop offset="100%" stop-color="${mix(GOLD_BASE, 58, "#241a04")}"/></linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FCF8EE"/><stop offset="100%" stop-color="#F4EAD2"/></linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${mix(GOLD_BASE, 80, "#ffffff")}"/><stop offset="50%" stop-color="${GOLD_BASE}"/><stop offset="100%" stop-color="${mix(GOLD_BASE, 74, "#000000")}"/></linearGradient>
    <linearGradient id="hair" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#A85C3A"/><stop offset="100%" stop-color="#74391F"/></linearGradient>
    <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#F8D8B2"/><stop offset="100%" stop-color="#EBBA8C"/></linearGradient>
    <linearGradient id="cream" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FFFBEF"/><stop offset="100%" stop-color="#F2E2BF"/></linearGradient>
    <linearGradient id="flower" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#F9DD6E"/><stop offset="100%" stop-color="#E8B238"/></linearGradient>
    <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#EEF2F6"/><stop offset="50%" stop-color="#C2CBD6"/><stop offset="100%" stop-color="#8A97A8"/></linearGradient>
    <linearGradient id="robe" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${mix(ROBE_BASE, 78, "#ffffff")}"/><stop offset="55%" stop-color="${ROBE_BASE}"/><stop offset="100%" stop-color="${mix(ROBE_BASE, 70, "#000000")}"/></linearGradient>
    <linearGradient id="robeDark" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${mix(ROBE_BASE, 55, "#000000")}"/><stop offset="100%" stop-color="${mix(ROBE_BASE, 38, "#000000")}"/></linearGradient>
    <filter id="emboss" x="-45%" y="-45%" width="190%" height="190%"><feDropShadow dx="0" dy="0.5" stdDeviation="0.4" flood-color="#FFFFFF" flood-opacity="0.55"/></filter>
    <filter id="gild" x="-55%" y="-55%" width="210%" height="210%"><feDropShadow dx="0.5" dy="0.8" stdDeviation="0.5" flood-color="#B98D34" flood-opacity="0.6"/></filter>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" stitchTiles="stitch" result="t"/><feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.5 0.5 0.5 0 0"/></filter>
    <clipPath id="cardClip"><rect x="8" y="8" width="344" height="488" rx="22"/></clipPath>
    <clipPath id="topClip"><rect x="92" y="96" width="176" height="156"/></clipPath>
    <pattern id="diaper" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(45 0 0)">
      <path d="M13 4 L22 13 L13 22 L4 13 Z" fill="none" stroke="${GOLD_BASE}" stroke-width="0.8"/>
      <circle cx="13" cy="13" r="1.1" fill="${GOLD_BASE}"/>
    </pattern>
    <linearGradient id="backField" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${BACK_BASE}"/><stop offset="100%" stop-color="${mix(BACK_BASE, 68, "#000000")}"/></linearGradient>
    <pattern id="backPat" width="34" height="34" patternUnits="userSpaceOnUse" patternTransform="rotate(45 0 0)">
      <path d="M17 3 L31 17 L17 31 L3 17 Z" fill="none" stroke="${GOLD_BASE}" stroke-width="1" opacity="0.5"/>
      <circle cx="17" cy="17" r="2.3" fill="${GOLD_BASE}" opacity="0.45"/>
      <circle cx="0" cy="0" r="1.3" fill="${GOLD_BASE}" opacity="0.4"/><circle cx="34" cy="0" r="1.3" fill="${GOLD_BASE}" opacity="0.4"/><circle cx="0" cy="34" r="1.3" fill="${GOLD_BASE}" opacity="0.4"/><circle cx="34" cy="34" r="1.3" fill="${GOLD_BASE}" opacity="0.4"/>
    </pattern>
  </defs>`;
}

function frame(): string {
  return `<rect x="8" y="8" width="344" height="488" rx="22" fill="url(#card)"/>
  <g clip-path="url(#cardClip)">
    <rect x="8" y="8" width="344" height="488" fill="#000000" filter="url(#grain)" opacity="0.06"/>
    <rect x="8" y="8" width="344" height="488" fill="url(#vignette)"/>
  </g>
  <rect x="8.6" y="8.6" width="342.8" height="486.8" rx="21.4" fill="none" stroke="url(#goldFoil)" stroke-width="2.6"/>
  <rect x="13" y="13" width="334" height="478" rx="18" fill="none" stroke="${mix(GOLD_BASE, 70, "#000000")}" stroke-width="0.6" opacity="0.5"/>
  <rect x="17" y="17" width="326" height="470" rx="15" fill="none" stroke="url(#goldFoil)" stroke-width="1.1"/>`;
}

function panel(suit: Suit): string {
  return `<rect x="92" y="96" width="176" height="312" rx="11" fill="url(#panel)" stroke="url(#goldFoil)" stroke-width="1.6"/>
  <rect x="95.5" y="99.5" width="169" height="305" rx="8.5" fill="none" stroke="${mix(GOLD_BASE, 70, "#000000")}" stroke-width="0.5" opacity="0.4"/>
  <rect x="98" y="102" width="164" height="300" rx="6.5" fill="none" stroke="${SUITS[suit].color}" stroke-width="0.7" opacity="0.3"/>`;
}

function indexContent(rank: Rank, suit: Suit): string {
  const color = SUITS[suit].color;
  const fontSize = rank === "10" ? 30 : 40;
  const txt = `<text x="42" y="74" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}" font-weight="600" fill="${color}">${rank}</text>`;
  return txt + pip(suit, 42, 93, 0.72, 0, undefined, true);
}
function indices(rank: Rank, suit: Suit): string {
  const g = indexContent(rank, suit);
  return `<g filter="url(#gild)">${g}</g><g filter="url(#gild)" transform="rotate(180 ${CX} ${CY})">${g}</g>`;
}

const COL = { L: 130, C: 180, R: 230 };
const LAYOUTS: Record<string, ReadonlyArray<[keyof typeof COL, number]>> = {
  2: [
    ["C", 140],
    ["C", 364],
  ],
  3: [
    ["C", 140],
    ["C", 252],
    ["C", 364],
  ],
  4: [
    ["L", 140],
    ["R", 140],
    ["L", 364],
    ["R", 364],
  ],
  5: [
    ["L", 140],
    ["R", 140],
    ["C", 252],
    ["L", 364],
    ["R", 364],
  ],
  6: [
    ["L", 140],
    ["R", 140],
    ["L", 252],
    ["R", 252],
    ["L", 364],
    ["R", 364],
  ],
  7: [
    ["L", 140],
    ["R", 140],
    ["C", 196],
    ["L", 252],
    ["R", 252],
    ["L", 364],
    ["R", 364],
  ],
  8: [
    ["L", 140],
    ["R", 140],
    ["C", 196],
    ["L", 252],
    ["R", 252],
    ["C", 308],
    ["L", 364],
    ["R", 364],
  ],
  9: [
    ["L", 140],
    ["R", 140],
    ["L", 205],
    ["R", 205],
    ["C", 252],
    ["L", 299],
    ["R", 299],
    ["L", 364],
    ["R", 364],
  ],
  10: [
    ["L", 140],
    ["R", 140],
    ["C", 172],
    ["L", 205],
    ["R", 205],
    ["L", 299],
    ["R", 299],
    ["C", 332],
    ["L", 364],
    ["R", 364],
  ],
};
function numberPips(rank: Rank, suit: Suit): string {
  const s = 1.6;
  return (LAYOUTS[rank] ?? [])
    .map(([c, y]) => pip(suit, COL[c], y, s, y > CY ? 180 : 0))
    .join("");
}

function aceContent(suit: Suit): string {
  const big = suit === "spades" ? 4.3 : 3.7;
  const flourish = `<circle cx="180" cy="252" r="66" fill="none" stroke="#E0C98A" stroke-width="1.2" opacity="0.6"/>
    <circle cx="180" cy="252" r="59" fill="none" stroke="${SUITS[suit].color}" stroke-width="0.6" opacity="0.25"/>
    <circle cx="180" cy="186" r="2.2" fill="#E0C98A"/><circle cx="180" cy="318" r="2.2" fill="#E0C98A"/>
    <circle cx="114" cy="252" r="2.2" fill="#E0C98A"/><circle cx="246" cy="252" r="2.2" fill="#E0C98A"/>`;
  return flourish + pip(suit, 180, 252, big);
}

const FACE = `<path d="M162,180 C162,161 170,152 180,152 C190,152 198,161 198,180 C198,200 190,213 180,213 C170,213 162,200 162,180 Z" fill="url(#skin)"/>`;
function faceFeatures({ lips = "red", blush = true } = {}): string {
  const lipMarkup =
    lips === "red"
      ? `<path d="M175,199 Q180,196 185,199 Q180,204 175,199 Z" fill="#C8102E"/><path d="M175,199 Q180,201 185,199" stroke="#9C0B23" stroke-width="0.7" fill="none"/>`
      : "";
  const blushMarkup = blush
    ? `<circle cx="169" cy="191" r="3.2" fill="#E89C9C" opacity="0.4"/><circle cx="191" cy="191" r="3.2" fill="#E89C9C" opacity="0.4"/>`
    : "";
  return `<path d="M169,176 Q174,172 179,176" stroke="#6E4326" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  <path d="M181,176 Q186,172 191,176" stroke="#6E4326" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  <path d="M170,183 Q174,179 179,183 Q174,187 170,183 Z" fill="#FFFFFF"/>
  <circle cx="174.4" cy="183" r="2" fill="#5A3A28"/><circle cx="175.2" cy="182.2" r="0.6" fill="#FFFFFF"/>
  <path d="M181,183 Q186,179 190,183 Q186,187 181,183 Z" fill="#FFFFFF"/>
  <circle cx="185.6" cy="183" r="2" fill="#5A3A28"/><circle cx="186.4" cy="182.2" r="0.6" fill="#FFFFFF"/>
  <path d="M180,185 C179,190 178,193 180,195 Q182,196 183,194" stroke="#D49A6E" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  ${blushMarkup}${lipMarkup}`;
}
const ROBE = `<path d="M148,214 C148,227 138,239 130,251 C128,253 127,256 126,258 L234,258 C233,256 232,253 230,251 C222,239 212,227 212,214 C198,229 162,229 148,214 Z" fill="url(#robe)" stroke="#000000" stroke-opacity="0.18" stroke-width="1"/>`;
const ROBE_TRIM = `<path d="M150,220 C146,234 140,248 135,257" stroke="${GOLD_BASE}" stroke-width="1.5" fill="none" opacity="0.85"/>
  <path d="M210,220 C214,234 220,248 225,257" stroke="${GOLD_BASE}" stroke-width="1.5" fill="none" opacity="0.85"/>`;
function bodicePanel(suit: Suit, p1 = 0.6, p2 = 0.5): string {
  return `<path d="M166,228 L194,228 L200,258 L160,258 Z" fill="#FBF3DD" stroke="#C9912A" stroke-width="0.8"/>
  <path d="M173,234 L187,234 M170,244 L190,244 M167,253 L193,253" stroke="#E0C98A" stroke-width="0.5" opacity="0.7"/>
  ${pip(suit, 180, 240, p1)}${pip(suit, 180, 253, p2)}`;
}

function queenFigure(suit: Suit): string {
  return `
  <path d="M165,156 C145,170 143,206 156,234 L169,229 C158,207 160,180 177,165 Z" fill="url(#hair)"/>
  <path d="M195,156 C215,170 217,206 204,234 L191,229 C202,207 200,180 183,165 Z" fill="url(#hair)"/>
  <path d="M165,159 Q180,149 195,159 L193,168 Q180,158 167,168 Z" fill="url(#hair)"/>
  <path d="M160,176 Q158,202 166,224" stroke="#C0764A" stroke-width="1.3" fill="none" opacity="0.55"/>
  <path d="M200,176 Q202,202 194,224" stroke="#C0764A" stroke-width="1.3" fill="none" opacity="0.55"/>
  ${FACE}
  ${faceFeatures({ lips: "red" })}
  <path d="M154,150 L158,116 L169,138 L180,108 L191,138 L202,116 L206,150 Z" fill="url(#gold)" stroke="#A87C2A" stroke-width="1"/>
  <path d="M150,148 Q180,160 210,148 L210,160 Q180,172 150,160 Z" fill="url(#gold)" stroke="#A87C2A" stroke-width="1"/>
  <circle cx="158" cy="116" r="3.4" fill="#FBF1D2" stroke="#C9912A" stroke-width="0.8"/>
  <circle cx="180" cy="107" r="3.8" fill="#FBF1D2" stroke="#C9912A" stroke-width="0.8"/>
  <circle cx="202" cy="116" r="3.4" fill="#FBF1D2" stroke="#C9912A" stroke-width="0.8"/>
  <circle cx="164" cy="154" r="2" fill="#2E7D4F"/><circle cx="196" cy="154" r="2" fill="#C8102E"/>
  ${pip(suit, 180, 155, 0.55)}
  <path d="M173,206 L173,214 Q180,219 187,214 L187,206 Z" fill="url(#skin)"/>
  ${ROBE}
  <ellipse cx="144" cy="230" rx="15" ry="13" fill="url(#robeDark)"/>
  <ellipse cx="216" cy="230" rx="15" ry="13" fill="url(#robeDark)"/>
  ${ROBE_TRIM}
  <g opacity="0.5">${pip(suit, 139, 246, 0.42, 0, "#F0CF73")}${pip(suit, 221, 246, 0.42, 0, "#F0CF73")}</g>
  <path d="M150,220 Q166,204 180,210 Q194,204 210,220 L205,233 Q193,224 180,224 Q167,224 155,233 Z" fill="url(#cream)" stroke="#C9912A" stroke-width="1"/>
  <g fill="url(#gold)"><circle cx="170" cy="221" r="1.3"/><circle cx="175" cy="223" r="1.3"/><circle cx="185" cy="223" r="1.3"/><circle cx="190" cy="221" r="1.3"/></g>
  <circle cx="180" cy="226" r="4.6" fill="url(#gold)" stroke="#A87C2A" stroke-width="0.6"/>${pip(suit, 180, 226, 0.26)}
  ${bodicePanel(suit)}
  <path d="M150,258 C150,250 149,244 147,239" stroke="#2E7D4F" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <path d="M150,250 Q142,248 143,241 Q151,243 150,250 Z" fill="#2E7D4F"/>
  <circle cx="147" cy="234" r="6" fill="url(#flower)" stroke="#D89B2E" stroke-width="0.6"/>
  <path d="M143,234 Q147,230 151,234 Q147,238 143,234 Z" fill="#F6C84A"/>
  <circle cx="147" cy="234" r="1.9" fill="#C8102E"/>`;
}

function kingFigure(suit: Suit): string {
  return `
  <path d="M163,158 C150,172 150,202 161,228 L171,224 C162,206 163,182 176,168 Z" fill="url(#hair)"/>
  <path d="M197,158 C210,172 210,202 199,228 L189,224 C198,206 197,182 184,168 Z" fill="url(#hair)"/>
  ${FACE}
  ${faceFeatures({ lips: "none", blush: false })}
  <path d="M167,196 Q174,200 180,199 Q186,200 193,196 Q190,205 180,205 Q170,205 167,196 Z" fill="url(#hair)"/>
  <path d="M163,193 C163,210 170,225 180,225 C190,225 197,210 197,193 C195,201 190,206 180,206 Q170,206 163,193 Z" fill="url(#hair)"/>
  <path d="M170,210 Q180,215 190,210" stroke="#5C2E18" stroke-width="0.8" fill="none" opacity="0.5"/>
  <path d="M152,148 L155,116 L168,136 L180,110 L192,136 L205,116 L208,148 Z" fill="url(#gold)" stroke="#A87C2A" stroke-width="1"/>
  <path d="M158,140 Q180,126 202,140" stroke="url(#gold)" stroke-width="3.2" fill="none" stroke-linecap="round"/>
  <path d="M148,146 Q180,158 212,146 L212,158 Q180,170 148,158 Z" fill="url(#gold)" stroke="#A87C2A" stroke-width="1"/>
  <circle cx="180" cy="108" r="4" fill="url(#gold)" stroke="#A87C2A" stroke-width="0.8"/>
  <rect x="178.4" y="94" width="3.2" height="13" rx="1" fill="url(#gold)"/><rect x="174" y="97.5" width="12" height="3.2" rx="1" fill="url(#gold)"/>
  <circle cx="155" cy="116" r="3" fill="#FBF1D2" stroke="#C9912A" stroke-width="0.8"/>
  <circle cx="205" cy="116" r="3" fill="#FBF1D2" stroke="#C9912A" stroke-width="0.8"/>
  <circle cx="162" cy="152" r="2" fill="#C8102E"/><circle cx="198" cy="152" r="2" fill="#2E7D4F"/>
  ${pip(suit, 180, 152, 0.55)}
  <path d="M173,206 L173,214 Q180,219 187,214 L187,206 Z" fill="url(#skin)"/>
  ${ROBE}
  <path d="M150,216 Q165,208 180,212 Q195,208 210,216 L214,234 Q198,225 180,225 Q162,225 146,234 Z" fill="#FBFBF6" stroke="#C9912A" stroke-width="1"/>
  <g fill="#2A2A2A"><circle cx="160" cy="222" r="1.2"/><circle cx="172" cy="219" r="1.2"/><circle cx="188" cy="219" r="1.2"/><circle cx="200" cy="222" r="1.2"/></g>
  <path d="M161,226 Q180,238 199,226" stroke="url(#gold)" stroke-width="2.4" fill="none"/>
  <circle cx="180" cy="237" r="5.5" fill="url(#gold)" stroke="#A87C2A" stroke-width="0.6"/>${pip(suit, 180, 237, 0.3)}
  ${bodicePanel(suit, 0.55, 0.46)}
  <path d="M138,150 L134,232 L142,232 Z" fill="url(#steel)" stroke="#8A97A8" stroke-width="0.6"/>
  <path d="M138,152 L138,230" stroke="#FFFFFF" stroke-width="0.6" opacity="0.5"/>
  <rect x="126" y="229" width="24" height="5" rx="2.4" fill="url(#gold)" stroke="#A87C2A" stroke-width="0.5"/>
  <rect x="134.5" y="233" width="7" height="13" rx="1.5" fill="#6B4A2A"/>
  <circle cx="138" cy="249" r="4" fill="url(#gold)" stroke="#A87C2A" stroke-width="0.6"/>`;
}

function jackFigure(suit: Suit): string {
  return `
  <path d="M164,162 C153,174 153,200 163,224 L172,220 C165,202 166,182 177,170 Z" fill="url(#hair)"/>
  <path d="M196,162 C207,174 207,200 197,224 L188,220 C195,202 194,182 183,170 Z" fill="url(#hair)"/>
  ${FACE}
  ${faceFeatures({ lips: "red" })}
  <path d="M204,150 C222,144 228,122 221,104 C214,122 210,136 199,148 Z" fill="#FBFBF6" stroke="#C9912A" stroke-width="0.7"/>
  <path d="M209,140 Q215,128 219,112" stroke="#D9C28A" stroke-width="0.6" fill="none"/>
  <path d="M154,158 Q156,130 182,130 Q207,132 205,160 Q190,150 180,150 Q165,150 154,158 Z" fill="url(#robe)" stroke="#000000" stroke-opacity="0.18" stroke-width="1"/>
  <path d="M152,157 Q180,149 206,159 L204,167 Q180,157 154,165 Z" fill="url(#gold)" stroke="#A87C2A" stroke-width="0.7"/>
  <circle cx="171" cy="142" r="4" fill="url(#gold)" stroke="#A87C2A" stroke-width="0.5"/>${pip(suit, 171, 142, 0.24)}
  <path d="M173,206 L173,214 Q180,219 187,214 L187,206 Z" fill="url(#skin)"/>
  ${ROBE}
  <ellipse cx="144" cy="231" rx="14" ry="12" fill="url(#robeDark)"/><ellipse cx="216" cy="231" rx="14" ry="12" fill="url(#robeDark)"/>
  ${ROBE_TRIM}
  <path d="M156,218 Q170,211 180,216 Q190,211 204,218 L196,233 L188,224 L180,231 L172,224 L164,233 Z" fill="url(#cream)" stroke="#C9912A" stroke-width="1"/>
  ${bodicePanel(suit, 0.58, 0.48)}
  <rect x="140" y="150" width="3" height="108" rx="1" fill="#6B4A2A"/>
  <path d="M141.5,150 L150,124 L131,134 Z" fill="url(#steel)" stroke="#8A97A8" stroke-width="0.5"/>
  <path d="M141.5,128 L141.5,114" stroke="url(#steel)" stroke-width="3" stroke-linecap="round"/>
  <circle cx="141.5" cy="150" r="2.2" fill="url(#gold)"/>`;
}

function courtCard(rank: Rank, suit: Suit): string {
  const fig =
    rank === "K"
      ? kingFigure(suit)
      : rank === "J"
        ? jackFigure(suit)
        : queenFigure(suit);
  const half = `<g clip-path="url(#topClip)">${fig}</g>`;
  const damask = `<rect x="98" y="102" width="164" height="300" rx="7" fill="url(#diaper)" opacity="0.22"/>`;
  return `${damask}${half}
  <g transform="rotate(180 ${CX} ${CY})">${half}</g>
  <g stroke="${mix(GOLD_BASE, 80, "#ffffff")}" stroke-width="1"><line x1="100" y1="250" x2="260" y2="250"/><line x1="100" y1="254" x2="260" y2="254"/></g>
  <circle cx="180" cy="252" r="11" fill="url(#cream)" stroke="${mix(GOLD_BASE, 80, "#ffffff")}" stroke-width="1.4"/>
  ${pip(suit, 180, 252, 0.6)}`;
}

function cardContent(rank: Rank, suit: Suit): string {
  if (rank === "A") return aceContent(suit);
  if (rank === "J" || rank === "Q" || rank === "K")
    return courtCard(rank, suit);
  return numberPips(rank, suit);
}

function jesterMarkup(variant: JokerVariant): string {
  const accent = variant === "black" ? "#16161D" : "#C8102E";
  const lobeA = accent;
  const lobeB = "#2E7D4F";
  const word = "JOKER"
    .split("")
    .map(
      (ch, i) =>
        `<text x="40" y="${118 + i * 30}" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-size="22" font-weight="700" fill="${accent}">${ch}</text>`,
    )
    .join("");
  const jester = `
    <path d="M168,234 C148,230 136,210 139,192 C146,203 158,210 171,216 Z" fill="${lobeB}" stroke="#000" stroke-opacity="0.15"/>
    <path d="M192,234 C212,230 224,210 221,192 C214,203 202,210 189,216 Z" fill="${lobeB}" stroke="#000" stroke-opacity="0.15"/>
    <path d="M171,222 C167,202 176,186 180,178 C184,186 193,202 189,222 Z" fill="${lobeA}" stroke="#000" stroke-opacity="0.15"/>
    <circle cx="138" cy="190" r="5" fill="url(#gold)" stroke="#A87C2A" stroke-width="0.7"/>
    <circle cx="222" cy="190" r="5" fill="url(#gold)" stroke="#A87C2A" stroke-width="0.7"/>
    <circle cx="180" cy="176" r="5" fill="url(#gold)" stroke="#A87C2A" stroke-width="0.7"/>
    <path d="M160,236 Q180,226 200,236 L197,246 Q180,238 163,246 Z" fill="url(#gold)" stroke="#A87C2A" stroke-width="0.8"/>
    <ellipse cx="180" cy="248" rx="16" ry="18" fill="url(#skin)"/>
    <path d="M170,244 Q174,242 178,244" stroke="#7A4A2E" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <path d="M182,244 Q186,242 190,244" stroke="#7A4A2E" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <circle cx="174" cy="247" r="1.6" fill="#5A3A28"/><circle cx="186" cy="247" r="1.6" fill="#5A3A28"/>
    <circle cx="169" cy="253" r="3" fill="#E89C9C" opacity="0.55"/><circle cx="191" cy="253" r="3" fill="#E89C9C" opacity="0.55"/>
    <path d="M172,255 Q180,263 188,255" stroke="${accent}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M156,268 Q164,260 172,268 Q180,260 188,268 Q196,260 204,268 Q199,278 180,278 Q161,278 156,268 Z" fill="url(#cream)" stroke="#C9912A" stroke-width="1"/>
    <path d="M160,276 C150,292 146,312 146,330 L214,330 C214,312 210,292 200,276 Q180,286 160,276 Z" fill="url(#robe)" stroke="#000" stroke-opacity="0.18"/>
    <path d="M180,278 L180,330" stroke="#FBF3DD" stroke-width="1" opacity="0.5"/>
    <g fill="url(#flower)"><path d="M170,294 l5,6 l-5,6 l-5,-6 Z"/><path d="M190,294 l5,6 l-5,6 l-5,-6 Z"/><path d="M180,310 l5,6 l-5,6 l-5,-6 Z"/></g>
    <rect x="210" y="270" width="2.6" height="40" rx="1" fill="#6B4A2A" transform="rotate(18 211 290)"/>
    <circle cx="222" cy="266" r="7" fill="url(#skin)"/>
    <path d="M215,262 q1,-7 7,-6 q6,-1 7,6 q-7,-3 -14,0 Z" fill="${accent}"/>
    <circle cx="216" cy="258" r="2" fill="url(#gold)"/><circle cx="228" cy="258" r="2" fill="url(#gold)"/>`;
  const corners = `<g>${word}</g><g transform="rotate(180 ${CX} ${CY})">${word}</g>`;
  return `${corners}
${jester}
<text x="180" y="372" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-size="20" font-weight="700" letter-spacing="3" fill="${accent}">JOKER</text>`;
}

function backMarkup(): string {
  const gold = "#E7C36B";
  const medallion = `
    <circle cx="180" cy="252" r="66" fill="url(#backField)" stroke="url(#goldFoil)" stroke-width="2.2"/>
    <circle cx="180" cy="252" r="57" fill="none" stroke="${GOLD_BASE}" stroke-width="0.9" opacity="0.7"/>
    <circle cx="180" cy="252" r="51" fill="none" stroke="${GOLD_BASE}" stroke-width="0.4" opacity="0.45"/>
    ${pip("spades", 180, 221, 0.78, 0, gold, true)}
    ${pip("hearts", 211, 252, 0.78, 0, gold, true)}
    ${pip("diamonds", 180, 283, 0.78, 0, gold, true)}
    ${pip("clubs", 149, 252, 0.78, 0, gold, true)}
    <circle cx="180" cy="252" r="14" fill="url(#goldFoil)" stroke="${mix(GOLD_BASE, 70, "#000000")}" stroke-width="0.6"/>
    <circle cx="180" cy="252" r="5.5" fill="${mix(BACK_BASE, 80, "#000000")}"/>`;
  return `<rect x="24" y="24" width="312" height="456" rx="16" fill="url(#backField)" stroke="url(#goldFoil)" stroke-width="1.8"/>
<rect x="28" y="28" width="304" height="448" rx="13" fill="url(#backPat)"/>
<rect x="31" y="31" width="298" height="442" rx="11" fill="none" stroke="${GOLD_BASE}" stroke-width="0.8" opacity="0.55"/>
${medallion}`;
}

function prefixIds(markup: string, prefix: string): string {
  if (!prefix) return markup;
  return markup
    .replace(/id="([A-Za-z][\w-]*)"/g, `id="${prefix}$1"`)
    .replace(/url\(#([A-Za-z][\w-]*)\)/g, `url(#${prefix}$1)`);
}

function svgDocument(label: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="${CARD_VIEWBOX}" role="img" aria-label="${label}">${body}</svg>`;
}

export function cardInner(suit: Suit, rank: Rank, idPrefix = ""): string {
  const body = `${defs()}${frame()}${panel(suit)}${indices(rank, suit)}${cardContent(rank, suit)}`;
  return prefixIds(body, idPrefix);
}

export function cardLabel(suit: Suit, rank: Rank): string {
  return `${rank} of ${SUITS[suit].name}`;
}

export function cardSvg(suit: Suit, rank: Rank, idPrefix = ""): string {
  return svgDocument(cardLabel(suit, rank), cardInner(suit, rank, idPrefix));
}

export function jokerInner(variant: JokerVariant, idPrefix = ""): string {
  const body = `${defs()}${frame()}${panel("hearts")}${jesterMarkup(variant)}`;
  return prefixIds(body, idPrefix);
}

export function jokerLabel(variant: JokerVariant): string {
  return `${variant} Joker`;
}

export function jokerSvg(variant: JokerVariant, idPrefix = ""): string {
  return svgDocument(jokerLabel(variant), jokerInner(variant, idPrefix));
}

export function cardBackInner(idPrefix = ""): string {
  const body = `${defs()}${frame()}${backMarkup()}`;
  return prefixIds(body, idPrefix);
}

export function cardBackSvg(idPrefix = ""): string {
  return svgDocument("Card back", cardBackInner(idPrefix));
}
