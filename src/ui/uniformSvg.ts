import { decodeFace } from '../core/face';
import type { UniformDesign } from '../core/types';

interface FigureOptions {
  /** 胸のロゴ文字（漢字2〜4字） */
  mark?: string;
  /** 背番号 */
  number?: number;
  /** 表示幅（px）。高さは 2.2 倍 */
  width?: number;
  /** 台座を描くか */
  stage?: boolean;
  /** 選手の個別顔シード（指定時はアバターと同じ顔・髪型・肌色・瞳色を適用） */
  faceSeed?: string;
}

const SKIN_TONES = [
  '#fde7d6', '#fbdcc4', '#f8cfa9', '#f3c193',
  '#ebb17d', '#dfa16a', '#f7d6be', '#eec3a3',
];

const HAIR_COLORS = [
  '#18181b', '#27272a', '#29211c', '#3b281e', '#1e293b', '#33241b',
];

const IRIS_COLORS = [
  '#1e1b18', '#3e2723', '#2d3748', '#4a3525', '#1a202c', '#5c4033',
];

/** 2段階の濃淡（輪郭線・影）を作るため、HEXを少し暗くする */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - amount))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** 明度から読みやすい文字色（白 or 濃紺）を返す */
export function contrastText(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const y = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return y > 0.62 ? '#14213d' : '#ffffff';
}

/**
 * ユニフォーム全身立ち姿（帽子の先からスパイクまで）を描画するSVG。
 * UniformDesign の全項目（帽子/ヘルメット/柄/上着/アンダー/パンツ/ソックス）を反映する。
 * faceSeed が指定された場合は、選手一覧と同じ肌色・髪型・瞳色・目・眉・鼻・口の造形を完全連動して再現する。
 */
export function uniformFigureSvg(u: UniformDesign, opt: FigureOptions): string {
  const w = opt.width ?? 260;
  const h = Math.round(w * 2.15);
  const ink = '#1b1f2a';

  // faceSeed による個別顔復元（未指定時は標準アスリート）
  let skin = '#f7d3b4';
  let hair = '#1f1a17';
  let iris = '#24303f';
  let hairType = 3;
  let eyeType = 1;
  let browType = 1;
  let noseType = 0;
  let mouthType = 1;
  let browTilt = 0;

  if (opt.faceSeed) {
    const spec = decodeFace(opt.faceSeed);
    skin = SKIN_TONES[spec.parts.skinTone % SKIN_TONES.length];
    hair = HAIR_COLORS[spec.parts.hairColor % HAIR_COLORS.length];
    iris = IRIS_COLORS[spec.parts.irisColor % IRIS_COLORS.length];
    hairType = spec.parts.hairStyle % 8;
    eyeType = spec.parts.eye % 8;
    browType = spec.parts.eyebrow % 8;
    noseType = spec.parts.nose % 6;
    mouthType = spec.parts.mouth % 6;
    browTilt = spec.offsets.browAngleDeg * 0.45;
  }

  const shirtLine = shade(u.shirtColor, 0.32);
  const pantsLine = shade(u.pantsColor, 0.32);
  const accent = u.accentLineColor ?? shade(u.shirtColor, 0.5);
  const helmet = u.helmetColor ?? u.capColor;
  const num = opt.number !== undefined ? String(opt.number) : '';
  const logoColor = u.numberColor;
  const markText = opt.mark ?? '';

  // 縦じま（ピンストライプ）：シャツ・パンツのクリップ内に描画
  const stripes = (x0: number, x1: number, y0: number, y1: number, color: string): string => {
    let s = '';
    for (let x = x0; x <= x1; x += 7) s += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="${color}" stroke-width="1.1" opacity="0.7"/>`;
    return s;
  };

  const sockLines =
    u.socksType === 'TWO_LINE'
      ? (x: number) => `<rect x="${x}" y="371" width="23" height="4" fill="${u.socksLineColor ?? '#fff'}"/><rect x="${x}" y="380" width="23" height="4" fill="${u.socksLineColor ?? '#fff'}"/>`
      : u.socksType === 'ONE_LINE'
        ? (x: number) => `<rect x="${x}" y="375" width="23" height="5" fill="${u.socksLineColor ?? '#fff'}"/>`
        : () => '';

  const pinstripe = u.style === 'PINSTRIPE';
  const accentLine = u.style === 'ACCENT_LINE';

  // 髪型パス（帽子下の前髪・もみあげ）
  let bangsSvg = '';
  if (hairType <= 1) {
    // 坊主・丸刈り
    bangsSvg = `<path d="M84 54 Q120 46 156 54" stroke="${hair}" stroke-width="${hairType === 0 ? 1.8 : 3.2}" opacity="${hairType === 0 ? 0.35 : 0.75}"/>`;
  } else if (hairType === 2) {
    // 角刈り・スポーツ刈り
    bangsSvg = `<path d="M84 56 L94 48 L104 54 L114 46 L124 54 L136 46 L146 54 L156 50 L156 60 L84 60 Z" fill="${hair}"/>`;
  } else if (hairType === 3) {
    // 短髪ツンツン
    bangsSvg = `<path d="M84 56 L90 44 L98 52 L108 42 L118 52 L128 42 L138 52 L146 44 L154 56 Z" fill="${hair}"/>`;
  } else if (hairType === 4) {
    // センター分け
    bangsSvg = `<path d="M84 56 Q94 44 116 50 L120 44 L124 50 Q146 44 156 56 L150 62 Q136 50 120 54 Q104 50 90 62 Z" fill="${hair}"/>`;
  } else if (hairType === 5) {
    // 斜め流し
    bangsSvg = `<path d="M84 56 Q106 42 144 48 L156 56 L146 62 Q116 52 92 62 Z" fill="${hair}"/>`;
  } else if (hairType === 6) {
    // くせ毛ショート
    bangsSvg = `<path d="M84 56 Q92 46 102 52 Q112 44 124 52 Q138 46 156 56 L150 62 Q134 54 122 60 Q108 54 90 62 Z" fill="${hair}"/>`;
  } else {
    // ギザギザ前髪
    bangsSvg = `<path d="M84 56 L92 48 L100 56 L110 46 L120 56 L130 46 L140 56 L148 48 L156 56 Z" fill="${hair}"/>`;
  }

  // もみあげ
  const sideburns = `
    <polygon points="82,56 82,74 86,72 86,58" fill="${hair}"/>
    <polygon points="158,56 158,74 154,72 154,58" fill="${hair}"/>
  `;

  // 眉の形状（8タイプ）
  const browBaseY = 71;
  let browSvg = '';
  if (browType === 0) {
    // 剛毛太眉
    browSvg = `
      <polygon points="90,${browBaseY - browTilt} 114,${browBaseY - 2 - browTilt} 115,${browBaseY + 3 - browTilt} 91,${browBaseY + 3 - browTilt}" fill="${hair}"/>
      <polygon points="150,${browBaseY - browTilt} 126,${browBaseY - 2 - browTilt} 125,${browBaseY + 3 - browTilt} 149,${browBaseY + 3 - browTilt}" fill="${hair}"/>
    `;
  } else if (browType === 1) {
    // キリッとした凛々しい太三角眉
    browSvg = `
      <polygon points="90,${browBaseY + 2 - browTilt} 103,${browBaseY - 4 - browTilt} 115,${browBaseY - 1 - browTilt} 104,${browBaseY - browTilt}" fill="${hair}"/>
      <polygon points="150,${browBaseY + 2 - browTilt} 137,${browBaseY - 4 - browTilt} 125,${browBaseY - 1 - browTilt} 136,${browBaseY - browTilt}" fill="${hair}"/>
    `;
  } else if (browType === 2) {
    // 細上がり眉
    browSvg = `
      <path d="M90 ${browBaseY + 2 - browTilt} L114 ${browBaseY - 3 - browTilt}" stroke="${hair}" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M150 ${browBaseY + 2 - browTilt} L126 ${browBaseY - 3 - browTilt}" stroke="${hair}" stroke-width="2.6" stroke-linecap="round"/>
    `;
  } else if (browType === 3) {
    // への字眉
    browSvg = `
      <path d="M90 ${browBaseY - 2 - browTilt} Q102 ${browBaseY - 4 - browTilt} 114 ${browBaseY + 2 - browTilt}" stroke="${hair}" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      <path d="M150 ${browBaseY - 2 - browTilt} Q138 ${browBaseY - 4 - browTilt} 126 ${browBaseY + 2 - browTilt}" stroke="${hair}" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    `;
  } else {
    // 平行太眉
    browSvg = `
      <line x1="90" y1="${browBaseY - browTilt}" x2="114" y2="${browBaseY - browTilt}" stroke="${hair}" stroke-width="3.8" stroke-linecap="round"/>
      <line x1="150" y1="${browBaseY - browTilt}" x2="126" y2="${browBaseY - browTilt}" stroke="${hair}" stroke-width="3.8" stroke-linecap="round"/>
    `;
  }

  // 目の形状（8タイプ）
  const eyeBaseY = 84;
  let eyesSvg = '';
  if (eyeType === 0) {
    // 鋭いツリ目
    eyesSvg = `
      <path d="M93 ${eyeBaseY + 2} Q103 ${eyeBaseY - 5} 113 ${eyeBaseY - 2}" stroke="${ink}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <path d="M96 ${eyeBaseY + 3} Q103 ${eyeBaseY + 6} 111 ${eyeBaseY + 1}" stroke="${ink}" stroke-width="1.4" fill="none"/>
      <ellipse cx="103" cy="${eyeBaseY}" rx="4.8" ry="4.5" fill="#fff"/>
      <circle cx="104" cy="${eyeBaseY}" r="3.4" fill="${iris}"/>
      <circle cx="102" cy="${eyeBaseY - 1}" r="1.3" fill="#fff"/>

      <path d="M147 ${eyeBaseY + 2} Q137 ${eyeBaseY - 5} 127 ${eyeBaseY - 2}" stroke="${ink}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <path d="M144 ${eyeBaseY + 3} Q137 ${eyeBaseY + 6} 129 ${eyeBaseY + 1}" stroke="${ink}" stroke-width="1.4" fill="none"/>
      <ellipse cx="137" cy="${eyeBaseY}" rx="4.8" ry="4.5" fill="#fff"/>
      <circle cx="136" cy="${eyeBaseY}" r="3.4" fill="${iris}"/>
      <circle cx="134" cy="${eyeBaseY - 1}" r="1.3" fill="#fff"/>
    `;
  } else if (eyeType === 1) {
    // パッチリ二重
    eyesSvg = `
      <path d="M95 ${eyeBaseY - 7} Q103 ${eyeBaseY - 9} 111 ${eyeBaseY - 7}" stroke="#a86a45" stroke-width="1.4" fill="none"/>
      <path d="M145 ${eyeBaseY - 7} Q137 ${eyeBaseY - 9} 129 ${eyeBaseY - 7}" stroke="#a86a45" stroke-width="1.4" fill="none"/>
      
      <ellipse cx="103" cy="${eyeBaseY}" rx="7" ry="6.8" fill="#fff" stroke="${ink}" stroke-width="2.2"/>
      <circle cx="104" cy="${eyeBaseY}" r="4.6" fill="${iris}"/>
      <circle cx="102" cy="${eyeBaseY - 1.8}" r="1.8" fill="#fff"/>
      <circle cx="105" cy="${eyeBaseY + 1.8}" r="1" fill="#fff"/>

      <ellipse cx="137" cy="${eyeBaseY}" rx="7" ry="6.8" fill="#fff" stroke="${ink}" stroke-width="2.2"/>
      <circle cx="136" cy="${eyeBaseY}" r="4.6" fill="${iris}"/>
      <circle cx="134" cy="${eyeBaseY - 1.8}" r="1.8" fill="#fff"/>
      <circle cx="137" cy="${eyeBaseY + 1.8}" r="1" fill="#fff"/>
    `;
  } else if (eyeType === 2) {
    // タレ目
    eyesSvg = `
      <path d="M94 ${eyeBaseY - 3} Q103 ${eyeBaseY - 5} 113 ${eyeBaseY + 3}" stroke="${ink}" stroke-width="2.8" fill="none" stroke-linecap="round"/>
      <ellipse cx="103" cy="${eyeBaseY}" rx="6" ry="5.5" fill="#fff"/>
      <circle cx="103" cy="${eyeBaseY + 0.5}" r="3.8" fill="${iris}"/>
      <circle cx="101" cy="${eyeBaseY - 1}" r="1.4" fill="#fff"/>

      <path d="M146 ${eyeBaseY - 3} Q137 ${eyeBaseY - 5} 127 ${eyeBaseY + 3}" stroke="${ink}" stroke-width="2.8" fill="none" stroke-linecap="round"/>
      <ellipse cx="137" cy="${eyeBaseY}" rx="6" ry="5.5" fill="#fff"/>
      <circle cx="137" cy="${eyeBaseY + 0.5}" r="3.8" fill="${iris}"/>
      <circle cx="135" cy="${eyeBaseY - 1}" r="1.4" fill="#fff"/>
    `;
  } else if (eyeType === 3) {
    // 三白眼
    eyesSvg = `
      <path d="M94 ${eyeBaseY - 2} L112 ${eyeBaseY - 2}" stroke="${ink}" stroke-width="3"/>
      <path d="M95 ${eyeBaseY + 4} L111 ${eyeBaseY + 4}" stroke="${ink}" stroke-width="1.8"/>
      <ellipse cx="103" cy="${eyeBaseY + 1}" rx="6" ry="4.5" fill="#fff"/>
      <circle cx="103" cy="${eyeBaseY}" r="2.8" fill="${iris}"/>
      <circle cx="101.5" cy="${eyeBaseY - 1}" r="0.9" fill="#fff"/>

      <path d="M146 ${eyeBaseY - 2} L128 ${eyeBaseY - 2}" stroke="${ink}" stroke-width="3"/>
      <path d="M145 ${eyeBaseY + 4} L129 ${eyeBaseY + 4}" stroke="${ink}" stroke-width="1.8"/>
      <ellipse cx="137" cy="${eyeBaseY + 1}" rx="6" ry="4.5" fill="#fff"/>
      <circle cx="137" cy="${eyeBaseY}" r="2.8" fill="${iris}"/>
      <circle cx="135.5" cy="${eyeBaseY - 1}" r="0.9" fill="#fff"/>
    `;
  } else if (eyeType === 5) {
    // 糸目 ^ ^
    eyesSvg = `
      <path d="M94 ${eyeBaseY + 1} Q103 ${eyeBaseY - 4.5} 112 ${eyeBaseY + 1}" stroke="${ink}" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      <path d="M146 ${eyeBaseY + 1} Q137 ${eyeBaseY - 4.5} 128 ${eyeBaseY + 1}" stroke="${ink}" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    `;
  } else {
    // 涼しげな切れ長・標準
    eyesSvg = `
      <ellipse cx="103" cy="${eyeBaseY}" rx="6.5" ry="5.5" fill="#fff" stroke="${ink}" stroke-width="2.2"/>
      <circle cx="104" cy="${eyeBaseY}" r="4" fill="${iris}"/>
      <circle cx="102" cy="${eyeBaseY - 1.2}" r="1.5" fill="#fff"/>

      <ellipse cx="137" cy="${eyeBaseY}" rx="6.5" ry="5.5" fill="#fff" stroke="${ink}" stroke-width="2.2"/>
      <circle cx="136" cy="${eyeBaseY}" r="4" fill="${iris}"/>
      <circle cx="134" cy="${eyeBaseY - 1.2}" r="1.5" fill="#fff"/>
    `;
  }

  // 鼻の形状（6タイプ）
  let noseSvg = '';
  if (noseType === 0) {
    // 筋の通った高い鼻
    noseSvg = `
      <path d="M119 86 L117 97 L123 97" fill="none" stroke="#a86a45" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <polygon points="119,87 117,97 120,96" fill="#a86a45" opacity="0.25"/>
    `;
  } else if (noseType === 1) {
    // 鷲鼻
    noseSvg = `<path d="M119 85 Q115 91 117 98 L123 97" fill="none" stroke="#a86a45" stroke-width="2.2" stroke-linecap="round"/>`;
  } else if (noseType === 2) {
    // 団子鼻
    noseSvg = `
      <path d="M114 96 Q120 92 126 96" fill="none" stroke="#a86a45" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="115" cy="96.5" r="1.2" fill="#a86a45"/>
      <circle cx="125" cy="96.5" r="1.2" fill="#a86a45"/>
    `;
  } else if (noseType === 3) {
    // 小鼻・点鼻
    noseSvg = `<circle cx="118" cy="96" r="1.1" fill="#a86a45"/><circle cx="122" cy="96" r="1.1" fill="#a86a45"/>`;
  } else {
    // 直線シャドウ鼻
    noseSvg = `<polygon points="119,86 117,97 122,97" fill="#a86a45"/>`;
  }

  // 口の形状（6タイプ）
  let mouthSvg = '';
  if (mouthType === 0) {
    // 歯を見せてニカッ
    mouthSvg = `
      <path d="M108 103 Q120 114 132 103 Z" fill="#881337" stroke="#7a3a2a" stroke-width="1.8"/>
      <path d="M110 103 Q120 106 130 103 L129 105.5 Q120 108 111 105.5 Z" fill="#fff"/>
    `;
  } else if (mouthType === 1) {
    // 真剣一文字
    mouthSvg = `<path d="M110 105 L130 105" fill="none" stroke="#7a3a2a" stroke-width="2.8" stroke-linecap="round"/>`;
  } else if (mouthType === 2) {
    // 爽やかな微笑み
    mouthSvg = `<path d="M109 104 Q120 111 131 104" fill="none" stroke="#7a3a2a" stroke-width="2.6" stroke-linecap="round"/>`;
  } else if (mouthType === 3) {
    // 不敵なニヤリ笑い
    mouthSvg = `<path d="M110 107 Q119 107 131 101" fill="none" stroke="#7a3a2a" stroke-width="2.8" stroke-linecap="round"/>`;
  } else if (mouthType === 4) {
    // 開口咆哮
    mouthSvg = `<ellipse cx="120" cy="106" rx="6.5" ry="4.5" fill="#881337" stroke="#7a3a2a" stroke-width="2"/>`;
  } else {
    // への字口
    mouthSvg = `<path d="M110 107 Q120 102 130 107" fill="none" stroke="#7a3a2a" stroke-width="2.6" stroke-linecap="round"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 516" width="${w}" height="${h}" role="img" aria-label="ユニフォーム全身プレビュー">
  <defs>
    <clipPath id="clipShirt"><path d="M62 128 Q120 112 178 128 L190 178 L172 182 L170 262 L70 262 L68 182 L50 178 Z"/></clipPath>
    <clipPath id="clipPants"><path d="M70 258 L170 258 L176 380 L124 380 L120 296 L116 380 L64 380 Z"/></clipPath>
    <radialGradient id="stageG" cx="50%" cy="40%" r="60%"><stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#d9dfe9"/></radialGradient>
  </defs>
  ${opt.stage === false ? '' : `<ellipse cx="120" cy="486" rx="108" ry="22" fill="url(#stageG)" stroke="#c3cad6" stroke-width="2"/><ellipse cx="120" cy="480" rx="100" ry="17" fill="#f3f5f9"/>`}

  <!-- スパイク -->
  <path d="M66 462 Q62 448 70 442 L92 442 Q96 452 102 460 Q104 468 92 470 L70 470 Q64 470 66 462 Z" fill="#14161c" stroke="${ink}" stroke-width="2"/>
  <path d="M138 460 Q144 452 148 442 L170 442 Q178 448 174 462 Q176 470 170 470 L148 470 Q136 468 138 460 Z" fill="#14161c" stroke="${ink}" stroke-width="2"/>
  <path d="M74 458 L88 450 M80 462 L92 456 M150 450 L164 458 M146 456 L160 462" stroke="#e7eaf0" stroke-width="2" stroke-linecap="round"/>

  <!-- ソックス（ふくらはぎ〜足首） -->
  <rect x="73" y="362" width="23" height="84" rx="8" fill="${u.socksBaseColor}" stroke="${ink}" stroke-width="2"/>
  <rect x="144" y="362" width="23" height="84" rx="8" fill="${u.socksBaseColor}" stroke="${ink}" stroke-width="2"/>
  ${sockLines(73)}${sockLines(144)}

  <!-- パンツ -->
  <path d="M70 258 L170 258 L176 384 L124 384 L120 296 L116 384 L64 384 Z" fill="${u.pantsColor}" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"/>
  <g clip-path="url(#clipPants)">
    ${pinstripe ? stripes(66, 176, 258, 384, accent) : ''}
    ${accentLine ? `<line x1="73" y1="262" x2="68" y2="384" stroke="${accent}" stroke-width="5"/><line x1="167" y1="262" x2="172" y2="384" stroke="${accent}" stroke-width="5"/>` : ''}
  </g>
  <path d="M120 296 L120 384" stroke="${pantsLine}" stroke-width="1.6"/>
  <path d="M64 384 L116 384 M124 384 L176 384" stroke="${pantsLine}" stroke-width="3"/>

  <!-- ベルト -->
  <rect x="68" y="254" width="104" height="11" rx="2" fill="#15171d" stroke="${ink}" stroke-width="1.6"/>
  <rect x="113" y="255" width="14" height="9" rx="1.5" fill="#cfd4dc" stroke="${ink}" stroke-width="1"/>

  <!-- 長袖アンダーシャツ（腕） -->
  <path d="M52 170 Q36 214 38 262 L58 266 Q60 222 68 186 Z" fill="${u.underShirtColor}" stroke="${ink}" stroke-width="2.2"/>
  <path d="M188 170 Q202 214 198 258 L178 258 Q178 222 172 186 Z" fill="${u.underShirtColor}" stroke="${ink}" stroke-width="2.2"/>
  <!-- 手 -->
  <ellipse cx="46" cy="272" rx="12" ry="13" fill="${skin}" stroke="${ink}" stroke-width="2"/>
  <ellipse cx="188" cy="266" rx="12" ry="13" fill="${skin}" stroke="${ink}" stroke-width="2"/>

  <!-- ヘルメット（小脇に抱える） -->
  <g transform="translate(8 238)">
    <path d="M4 22 Q4 -4 30 -4 Q58 -4 58 24 L52 34 L12 34 Z" fill="${helmet}" stroke="${ink}" stroke-width="2.2"/>
    <path d="M30 -4 Q58 -4 58 24 L52 34 L44 34 Q50 14 30 -4" fill="#000" opacity="0.18"/>
    <ellipse cx="22" cy="6" rx="9" ry="4.5" fill="#fff" opacity="0.4"/>
    <path d="M4 22 L-6 26 Q-4 34 8 34 L14 34" fill="${helmet}" stroke="${ink}" stroke-width="2.2"/>
  </g>
  <ellipse cx="46" cy="272" rx="12" ry="13" fill="${skin}" stroke="${ink}" stroke-width="2"/>

  <!-- 首＆アンダーシャツ襟 -->
  <rect x="106" y="106" width="28" height="30" rx="6" fill="${skin}" stroke="${ink}" stroke-width="2"/>
  <path d="M96 122 Q120 150 144 122 L144 134 Q120 154 96 134 Z" fill="${u.underShirtColor}" stroke="${ink}" stroke-width="2"/>

  <!-- 上着（半袖） -->
  <path d="M62 128 Q120 112 178 128 L190 178 L172 182 L170 262 L70 262 L68 182 L50 178 Z" fill="${u.shirtColor}" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"/>
  <g clip-path="url(#clipShirt)">
    ${pinstripe ? stripes(52, 190, 120, 262, accent) : ''}
    ${accentLine ? `<line x1="120" y1="132" x2="120" y2="262" stroke="${accent}" stroke-width="5"/>` : ''}
  </g>
  <!-- 袖口ライン -->
  <path d="M50 178 L68 182 M190 178 L172 182" stroke="${accentLine || pinstripe ? accent : shirtLine}" stroke-width="5"/>
  <path d="M96 124 Q120 156 144 124" fill="none" stroke="${shirtLine}" stroke-width="2"/>
  <!-- ボタン列 -->
  ${[150, 170, 190, 210, 230].map((y) => `<circle cx="120" cy="${y}" r="2" fill="${shirtLine}"/>`).join('')}
  
  <!-- 胸ロゴ -->
  ${markText ? `<text x="120" y="184" font-size="${markText.length > 3 ? 16 : 20}" font-weight="900" text-anchor="middle" fill="${logoColor}" stroke="${shade(u.shirtColor, 0.5)}" stroke-width="0.3" font-family="'Hiragino Sans','Yu Gothic UI','Meiryo',sans-serif" letter-spacing="1">${markText}</text>` : ''}
  ${num ? `<text x="150" y="238" font-size="22" font-weight="900" text-anchor="middle" fill="${logoColor}" font-family="Arial,sans-serif" opacity="0.9">${num}</text>` : ''}

  <!-- 頭部（顔の輪郭） -->
  <ellipse cx="82" cy="70" rx="7" ry="10" fill="${skin}" stroke="${ink}" stroke-width="2"/>
  <ellipse cx="158" cy="70" rx="7" ry="10" fill="${skin}" stroke="${ink}" stroke-width="2"/>
  <path d="M84 52 L86 84 Q92 112 120 116 Q148 112 154 84 L156 52 Z" fill="${skin}" stroke="${ink}" stroke-width="2.2" stroke-linejoin="round"/>
  
  <!-- もみあげ＆前髪 -->
  ${sideburns}
  ${bangsSvg}

  <!-- 眉・目（faceSeedに完全連動した多彩なアーキタイプ） -->
  ${browSvg}
  ${eyesSvg}
  
  <!-- 鼻（faceSeed連動） -->
  ${noseSvg}
  
  <!-- 口（faceSeed連動） -->
  ${mouthSvg}

  <!-- 野球帽 -->
  <path d="M80 56 Q80 18 120 18 Q160 18 160 56 Z" fill="${u.capColor}" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M120 18 Q160 18 160 56 L150 56 Q150 30 120 18" fill="#000" opacity="0.16"/>
  <path d="M74 58 Q120 44 166 58 Q166 66 158 66 Q120 56 82 66 Q74 66 74 58 Z" fill="${u.capBrimColor ?? shade(u.capColor, 0.12)}" stroke="${ink}" stroke-width="2.2"/>
  <text x="120" y="46" font-size="20" font-weight="900" text-anchor="middle" fill="${contrastText(u.capColor)}" font-family="Arial,sans-serif">${((markText[0] ?? opt.mark?.[0] ?? 'S'))}</text>
</svg>`;
}

/** 小さなユニフォームチップ（一覧用）：帽子・シャツ・パンツの3色を丸で示す */
export function uniformChip(u: UniformDesign): string {
  const dot = (c: string) => `<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${c};border:1px solid #94a3b8;margin-right:2px"></span>`;
  return `${dot(u.capColor)}${dot(u.shirtColor)}${dot(u.underShirtColor)}${dot(u.pantsColor)}`;
}
