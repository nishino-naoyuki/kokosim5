import { decodeFace } from '../core/face';

const SKIN_TONES = [
  { base: '#f4cdb0', shadow: '#d6a483', deep: '#a87556' },
  { base: '#eec19f', shadow: '#ce9772', deep: '#9c6848' },
  { base: '#f7d6be', shadow: '#daa98a', deep: '#ad7b5c' },
  { base: '#e5b591', shadow: '#c48b65', deep: '#945d3b' },
  { base: '#dca782', shadow: '#ba7d57', deep: '#8a5130' },
  { base: '#f1c7a8', shadow: '#d29c79', deep: '#a36e4d' },
  { base: '#d49b75', shadow: '#b2724b', deep: '#824725' },
  { base: '#eac0a2', shadow: '#ca9574', deep: '#996547' },
];

const HAIR_COLORS = [
  '#141619', '#1e2024', '#231c18', '#2c221c', '#18202c', '#291f1a',
];

const IRIS_COLORS = [
  '#1c1917', '#29201b', '#1e293b', '#3b281e', '#18181b', '#442f22',
];

export interface AvatarRenderOptions {
  /** 打者用ヘルメット（耳当て・光沢ハイライト付き）を描画するか */
  isHelmet?: boolean;
  /** 帽子・ヘルメット正面の校章文字（例: '青', '九', 'S'） */
  insignia?: string;
  /** TV中継カード用のダークスレート背景を使用するか */
  darkBg?: boolean;
}

/**
 * 64bit `faceSeed` から本格スポーツアニメ調（ダイヤのA / メジャー調 6.5〜7頭身バランス）の
 * 高校球児バストアップSVGを生成する（koshien_pitch_final.jpg / player_char_pitcher.jpg 準拠）。
 */
export function renderAvatarSvg(
  faceSeed: string,
  capColor = '#1e3a8a',
  size = 68,
  options?: AvatarRenderOptions,
): string {
  const spec = decodeFace(faceSeed);
  const { parts, offsets } = spec;

  const palette = SKIN_TONES[parts.skinTone % SKIN_TONES.length];
  const skin = palette.base;
  const skinShadow = palette.shadow;
  const skinDeep = palette.deep;
  const hair = HAIR_COLORS[parts.hairColor % HAIR_COLORS.length];
  const iris = IRIS_COLORS[parts.irisColor % IRIS_COLORS.length];

  const isHelmet = Boolean(options?.isHelmet);
  const insignia = options?.insignia || '';
  const darkBg = Boolean(options?.darkBg);

  // 骨格・輪郭タイプ（0:標準アスリート, 1:精悍シャープ, 2:骨格がっしり強打者, 3:端正バランス）
  const shapeType = parts.faceShape % 4;
  let jawW = 22.5;
  let cheekY = 53;
  let chinY = 74.5;
  let chinW = 7.5;

  if (shapeType === 1) {
    // シャープ・逆三角（エース投手・俊足巧打）
    jawW = 21.5;
    cheekY = 52.5;
    chinY = 75.0;
    chinW = 6.2;
  } else if (shapeType === 2) {
    // がっしり骨格（4番スラッガー・捕手）
    jawW = 23.8;
    cheekY = 54.0;
    chinY = 75.0;
    chinW = 9.5;
  } else if (shapeType === 3) {
    // 端正・やや若々しい輪郭
    jawW = 22.2;
    cheekY = 53.0;
    chinY = 73.8;
    chinW = 7.2;
  }

  const neckW = 16.5 + (parts.build % 4) * 1.4;
  const eyeDx = 10.6 * (1 + offsets.eyeSpacing * 0.65);
  const eyeY = 46.2 + offsets.eyeY * 6;
  const browTilt = offsets.browAngleDeg * 0.25;
  const noseY = 56.2 + offsets.noseY * 5;
  const mouthY = 65.2 + offsets.mouthY * 5;

  // -------------------------------------------------------------
  // 1. 輪郭パス ＆ セル画陰影（顎下・頬・バイザー影）
  // -------------------------------------------------------------
  const facePath = `
    M ${50 - jawW} 34
    L ${50 - jawW + 0.8} ${cheekY}
    Q ${50 - jawW + 3.2} ${chinY - 4.5} ${50 - chinW / 2} ${chinY}
    Q 50 ${chinY + 1.2} ${50 + chinW / 2} ${chinY}
    Q ${50 + jawW - 3.2} ${chinY - 4.5} ${50 + jawW - 0.8} ${cheekY}
    L ${50 + jawW} 34
    Z
  `;

  // 顔側面のセル影（立体感）
  const faceSideShadow = `
    <path d="M ${50 + jawW} 34 L ${50 + jawW - 0.8} ${cheekY} Q ${50 + jawW - 3.2} ${chinY - 4.5} ${50 + chinW / 2} ${chinY} L 50 ${chinY + 0.6} Q ${50 + jawW - 6.5} ${chinY - 5} ${50 + jawW - 4.2} ${cheekY - 1} L ${50 + jawW - 3.5} 34 Z" fill="${skinShadow}" opacity="0.55"/>
    <path d="M ${50 - jawW} 34 Q 50 40 ${50 + jawW} 34 L ${50 + jawW} 41 Q 50 36.5 ${50 - jawW} 41 Z" fill="#0f172a" opacity="0.22"/>
  `;

  // -------------------------------------------------------------
  // 2. 髪型（帽子・ヘルメットから覗く精悍な生え際・もみあげ・襟足）
  // -------------------------------------------------------------
  const hairType = parts.hairStyle % 6;
  let hairSvg = '';
  if (hairType === 0) {
    // 短髪スポーツ刈り・前髪シャープ
    hairSvg = `
      <path d="M ${50 - jawW} 39 L ${50 - jawW + 3} 34 L 38 37 L 44 33 L 50 36.5 L 56 33 L 63 37 L ${50 + jawW - 3} 34 L ${50 + jawW} 39 L ${50 + jawW} 33 L ${50 - jawW} 33 Z" fill="${hair}"/>
    `;
  } else if (hairType === 1) {
    // 爽やかショートレイヤー（斜め前髪）
    hairSvg = `
      <path d="M ${50 - jawW} 39 L 33 34 L 37 38.5 L 46 33.5 L 51 38 L 60 33.5 L 66 38 L ${50 + jawW} 39 L ${50 + jawW} 33 L ${50 - jawW} 33 Z" fill="${hair}"/>
    `;
  } else if (hairType === 2) {
    // 高校球児らしい精悍な五分刈り・坊主
    hairSvg = `
      <path d="M ${50 - jawW} 38 Q 50 31.5 ${50 + jawW} 38 L ${50 + jawW} 33 L ${50 - jawW} 33 Z" fill="${hair}" opacity="0.88"/>
    `;
  } else if (hairType === 3) {
    // センターパート風ショート
    hairSvg = `
      <path d="M ${50 - jawW} 40 Q 37 33 47 38 L 50 33.5 L 53 38 Q 63 33 ${50 + jawW} 40 L ${50 + jawW} 33 L ${50 - jawW} 33 Z" fill="${hair}"/>
    `;
  } else if (hairType === 4) {
    // ツーブロック風シャープ短髪
    hairSvg = `
      <path d="M ${50 - jawW} 39 L 35 35 L 42 38.5 L 52 34 L 61 38.5 L 68 35 L ${50 + jawW} 39 L ${50 + jawW} 33 L ${50 - jawW} 33 Z" fill="${hair}"/>
    `;
  } else {
    // 硬派な丸刈り・一分刈り
    hairSvg = `
      <path d="M ${50 - jawW} 37.5 Q 50 32.5 ${50 + jawW} 37.5 L ${50 + jawW} 33 L ${50 - jawW} 33 Z" fill="${hair}" opacity="0.65"/>
    `;
  }

  // シャープなもみあげ
  const sideburnsSvg = `
    <polygon points="${50 - jawW},36 ${50 - jawW - 0.5},48 ${50 - jawW + 1.8},46 ${50 - jawW + 2.2},36" fill="${hair}"/>
    <polygon points="${50 + jawW},36 ${50 + jawW + 0.5},48 ${50 + jawW - 1.8},46 ${50 + jawW - 2.2},36" fill="${hair}"/>
  `;

  // -------------------------------------------------------------
  // 3. 眉（力強く引き締まった本格アニメ眉）
  // -------------------------------------------------------------
  const browType = parts.eyebrow % 4;
  const browY = eyeY - 4.2;
  let browsSvg = '';
  if (browType === 0) {
    // 凛々しい剣眉（エース・正統派）
    browsSvg = `
      <path d="M ${50 - eyeDx - 5.8} ${browY + 0.5 - browTilt} L ${50 - eyeDx - 1} ${browY - 1.4 - browTilt} L ${50 - eyeDx + 5.5} ${browY + 0.8 - browTilt} L ${50 - eyeDx + 4.8} ${browY + 2.0 - browTilt} L ${50 - eyeDx - 1} ${browY + 0.4 - browTilt} Z" fill="${hair}"/>
      <path d="M ${50 + eyeDx + 5.8} ${browY + 0.5 - browTilt} L ${50 + eyeDx + 1} ${browY - 1.4 - browTilt} L ${50 + eyeDx - 5.5} ${browY + 0.8 - browTilt} L ${50 + eyeDx - 4.8} ${browY + 2.0 - browTilt} L ${50 + eyeDx + 1} ${browY + 0.4 - browTilt} Z" fill="${hair}"/>
    `;
  } else if (browType === 1) {
    // 力強い太眉（スラッガー・熱血）
    browsSvg = `
      <polygon points="${50 - eyeDx - 5.8},${browY - 0.4 - browTilt} ${50 - eyeDx + 5.4},${browY + 0.6 - browTilt} ${50 - eyeDx + 5.0},${browY + 2.4 - browTilt} ${50 - eyeDx - 5.5},${browY + 1.5 - browTilt}" fill="${hair}"/>
      <polygon points="${50 + eyeDx + 5.8},${browY - 0.4 - browTilt} ${50 + eyeDx - 5.4},${browY + 0.6 - browTilt} ${50 + eyeDx - 5.0},${browY + 2.4 - browTilt} ${50 + eyeDx + 5.5},${browY + 1.5 - browTilt}" fill="${hair}"/>
    `;
  } else if (browType === 2) {
    // シャープな切れ長眉（クール・巧打者）
    browsSvg = `
      <path d="M ${50 - eyeDx - 5.8} ${browY + 0.8 - browTilt} L ${50 - eyeDx + 5.5} ${browY + 0.2 - browTilt}" stroke="${hair}" stroke-width="2.1" stroke-linecap="round"/>
      <path d="M ${50 + eyeDx - 5.5} ${browY + 0.2 - browTilt} L ${50 + eyeDx + 5.8} ${browY + 0.8 - browTilt}" stroke="${hair}" stroke-width="2.1" stroke-linecap="round"/>
    `;
  } else {
    // 闘志を秘めた引き締まった眉
    browsSvg = `
      <path d="M ${50 - eyeDx - 5.6} ${browY - 0.2 - browTilt} Q ${50 - eyeDx} ${browY - 1.2 - browTilt} ${50 - eyeDx + 5.4} ${browY + 1.0 - browTilt}" stroke="${hair}" stroke-width="2.3" fill="none" stroke-linecap="round"/>
      <path d="M ${50 + eyeDx - 5.4} ${browY + 1.0 - browTilt} Q ${50 + eyeDx} ${browY - 1.2 - browTilt} ${50 + eyeDx + 5.6} ${browY - 0.2 - browTilt}" stroke="${hair}" stroke-width="2.3" fill="none" stroke-linecap="round"/>
    `;
  }

  // -------------------------------------------------------------
  // 4. 目（本格スポーツアニメの精悍なアーモンドアイ：丸目・ギャグ目を廃止）
  // -------------------------------------------------------------
  const eyeType = parts.eye % 4;
  const eH = eyeType === 1 ? 3.1 : eyeType === 2 ? 2.6 : 2.85;
  const tiltL = eyeType === 0 ? 0.6 : eyeType === 2 ? 0.9 : 0.2;

  const renderSingleEye = (cx: number, isRight: boolean) => {
    const dir = isRight ? -1 : 1;
    const outerX = cx - dir * 5.2;
    const innerX = cx + dir * 4.8;
    const outerY = eyeY - tiltL;
    const innerY = eyeY + 0.5;

    return `
      <!-- 二重まぶたライン -->
      <path d="M ${outerX + dir * 0.6} ${eyeY - eH - 1.2} Q ${cx} ${eyeY - eH - 2.1} ${innerX - dir * 0.5} ${eyeY - eH - 0.6}" stroke="${skinDeep}" stroke-width="0.9" fill="none"/>
      <!-- 白目ポリゴン（シャープな六角アーモンド形状） -->
      <path d="M ${outerX} ${outerY} Q ${cx} ${eyeY - eH} ${innerX} ${innerY} Q ${cx} ${eyeY + eH * 0.95} ${outerX} ${outerY} Z" fill="#ffffff"/>
      <!-- 虹彩（瞳） -->
      <ellipse cx="${cx + dir * 0.2}" cy="${eyeY - 0.1}" rx="2.35" ry="${eH * 0.88}" fill="${iris}"/>
      <!-- 瞳孔 -->
      <circle cx="${cx + dir * 0.2}" cy="${eyeY - 0.1}" r="1.15" fill="#090d16"/>
      <!-- ハイライト（鋭い眼光） -->
      <circle cx="${cx - dir * 0.65}" cy="${eyeY - 0.95}" r="0.85" fill="#ffffff"/>
      <circle cx="${cx + dir * 0.75}" cy="${eyeY + 0.75}" r="0.45" fill="#ffffff" opacity="0.8"/>
      <!-- 上まぶた黒主線 -->
      <path d="M ${outerX - dir * 0.3} ${outerY + 0.2} Q ${cx} ${eyeY - eH - 0.2} ${innerX + dir * 0.2} ${innerY}" stroke="#0f172a" stroke-width="2.1" fill="none" stroke-linecap="round"/>
      <!-- 下まぶた繊細ライン -->
      <path d="M ${outerX + dir * 0.5} ${outerY + 0.8} Q ${cx} ${eyeY + eH * 0.95} ${innerX - dir * 0.4} ${innerY + 0.2}" stroke="#1e293b" stroke-width="1.0" fill="none" stroke-linecap="round"/>
    `;
  };

  const eyesSvg = renderSingleEye(50 - eyeDx, false) + renderSingleEye(50 + eyeDx, true);

  // -------------------------------------------------------------
  // 5. 鼻（立体的なアニメセル画の鼻筋と影：点鼻を廃止）
  // -------------------------------------------------------------
  const noseSvg = `
    <!-- 鼻筋の立体セル影 -->
    <polygon points="49.6,${eyeY + 2} 48.0,${noseY + 1.5} 50.4,${noseY + 2.2} 50.4,${eyeY + 3.5}" fill="${skinShadow}" opacity="0.78"/>
    <!-- 鼻筋主線と鼻先 -->
    <path d="M 49.5 ${eyeY + 2.5} L 48.2 ${noseY + 1.3} L 50.5 ${noseY + 2.0}" stroke="${skinDeep}" stroke-width="1.35" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M 51.3 ${noseY + 1.6} L 52.3 ${noseY + 1.4}" stroke="${skinDeep}" stroke-width="1.2" stroke-linecap="round"/>
  `;

  // -------------------------------------------------------------
  // 6. 口（引き締まったアスリートの口元＋下唇の影：赤い楕円口を廃止）
  // -------------------------------------------------------------
  const mouthType = parts.mouth % 4;
  let mouthSvg = '';
  if (mouthType === 0) {
    // 引き締まった真剣な一文字口（koshien_pitch_final.jpg 準拠）
    mouthSvg = `
      <path d="M 44.2 ${mouthY + 0.3} Q 50 ${mouthY - 0.5} 55.8 ${mouthY + 0.3}" stroke="#3e2013" stroke-width="1.65" fill="none" stroke-linecap="round"/>
      <path d="M 47.2 ${mouthY + 2.5} Q 50 ${mouthY + 3.1} 52.8 ${mouthY + 2.5}" stroke="${skinShadow}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    `;
  } else if (mouthType === 1) {
    // 不敵で精悍な口元（わずかに口角が上がる）
    mouthSvg = `
      <path d="M 44.0 ${mouthY + 0.5} Q 50 ${mouthY + 0.2} 56.2 ${mouthY - 0.5}" stroke="#3e2013" stroke-width="1.65" fill="none" stroke-linecap="round"/>
      <path d="M 47.5 ${mouthY + 2.6} Q 50 ${mouthY + 3.0} 52.5 ${mouthY + 2.5}" stroke="${skinShadow}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    `;
  } else if (mouthType === 2) {
    // 落ち着いた自信の微笑み
    mouthSvg = `
      <path d="M 44.2 ${mouthY - 0.2} Q 50 ${mouthY + 1.4} 55.8 ${mouthY - 0.2}" stroke="#3e2013" stroke-width="1.65" fill="none" stroke-linecap="round"/>
      <path d="M 47.5 ${mouthY + 2.7} L 52.5 ${mouthY + 2.7}" stroke="${skinShadow}" stroke-width="1.4" stroke-linecap="round"/>
    `;
  } else {
    // 闘志を秘めた固い口元
    mouthSvg = `
      <path d="M 44.5 ${mouthY + 0.6} Q 50 ${mouthY - 0.8} 55.5 ${mouthY + 0.6}" stroke="#3e2013" stroke-width="1.75" fill="none" stroke-linecap="round"/>
      <path d="M 47.2 ${mouthY + 2.5} L 52.8 ${mouthY + 2.5}" stroke="${skinShadow}" stroke-width="1.5" stroke-linecap="round"/>
    `;
  }

  // -------------------------------------------------------------
  // 7. 帽子（Cap）または 打撃用ヘルメット（Helmet with Ear-Flap）
  // -------------------------------------------------------------
  const badgeChar = insignia ? insignia.slice(0, 1) : '';
  const emblemSvg = badgeChar
    ? `<text x="50" y="21.5" text-anchor="middle" dominant-baseline="central" fill="#f8fafc" stroke="#d97706" stroke-width="0.6" font-family="serif" font-weight="900" font-size="10.5">${badgeChar}</text>`
    : `<path d="M 46.5 22 L 50 15.5 L 53.5 22 L 51.5 22 L 50 19 L 48.5 22 Z" fill="#f8fafc" stroke="#d97706" stroke-width="0.5"/>`;

  let headwearSvg = '';
  if (isHelmet) {
    // 打者用：光沢バッティングヘルメット（耳当てイヤーフラップ付き：koshien_pitch_final.jpg 右カード完全準拠）
    headwearSvg = `
      <!-- ヘルメット本体ドーム -->
      <path d="M 23.5 36 Q 23 9.5 50 9.5 Q 77 9.5 76.5 36 Z" fill="${capColor}" stroke="#0f172a" stroke-width="1.8"/>
      <!-- ヘルメット光沢ハイライト（硬質プラスチックのツヤ） -->
      <path d="M 29 27 Q 34 14 50 13.5 Q 66 14 71 27 Q 63 17.5 50 17.5 Q 37 17.5 29 27 Z" fill="#ffffff" opacity="0.22"/>
      <!-- 右側イヤーフラップ（耳当てガード） -->
      <path d="M 72.5 33 L 77.5 34 L 77.0 52 Q 76.0 57.5 71.0 56.5 L 69.5 49 Q 72.5 44 72.5 33 Z" fill="${capColor}" stroke="#0f172a" stroke-width="1.6"/>
      <circle cx="73.8" cy="48.5" r="2.1" fill="#0f172a" opacity="0.65"/>
      <!-- 左側こめかみガード -->
      <path d="M 27.5 33 L 23.0 34 L 23.8 46 L 27.2 44 Z" fill="${capColor}" stroke="#0f172a" stroke-width="1.5"/>
      <!-- ヘルメットつば（バイザー） -->
      <path d="M 22 35 Q 50 27 78 35 Q 76 31.5 50 30 Q 24 31.5 22 35 Z" fill="${capColor}" stroke="#0f172a" stroke-width="1.7"/>
      <path d="M 23.5 35 Q 50 29.5 76.5 35 Q 50 32.8 23.5 35 Z" fill="#0f172a" opacity="0.55"/>
      ${emblemSvg}
    `;
  } else {
    // 投手・通常用：立体的な野球帽（クラウン＋カーブバイザー＋校章：koshien_pitch_final.jpg 左カード完全準拠）
    headwearSvg = `
      <!-- クラウン（帽体） -->
      <path d="M 25 35 Q 25.5 10.5 50 10.5 Q 74.5 10.5 75 35 Z" fill="${capColor}" stroke="#0f172a" stroke-width="1.8"/>
      <!-- クラウンの縫い目ラインと立体陰影 -->
      <path d="M 37 12.5 Q 34 22 35 33" stroke="#0f172a" stroke-width="0.8" opacity="0.35" fill="none"/>
      <path d="M 63 12.5 Q 66 22 65 33" stroke="#0f172a" stroke-width="0.8" opacity="0.35" fill="none"/>
      <path d="M 26 33 Q 50 26 74 33" fill="none" stroke="#ffffff" stroke-width="0.7" opacity="0.2"/>
      <!-- カーブバイザー（つば） -->
      <path d="M 22.5 35.5 Q 50 26.5 77.5 35.5 Q 75 31 50 29.5 Q 25 31 22.5 35.5 Z" fill="${capColor}" stroke="#0f172a" stroke-width="1.7"/>
      <!-- つば裏の濃影 -->
      <path d="M 24 35.5 Q 50 29 76 35.5 Q 50 32.5 24 35.5 Z" fill="#090d16" opacity="0.6"/>
      ${emblemSvg}
    `;
  }

  const bgStyle = darkBg
    ? 'background:linear-gradient(180deg,#4b627e 0%,#263547 100%);border-radius:5px'
    : 'background:linear-gradient(180deg,#dce8f5 0%,#eef4fa 100%);border-radius:8px;border:1px solid #cbd5e1';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" style="${bgStyle};flex-shrink:0;display:block">
    <!-- 1. ユニフォーム肩・襟・アンダーシャツ（本格高校野球ユニフォーム） -->
    <path d="M 10 100 Q 16 81 36 78 L 50 84 L 64 78 Q 84 81 90 100 Z" fill="#f8fafc" stroke="#0f172a" stroke-width="1.8"/>
    <!-- ユニフォーム襟元の阴影 -->
    <path d="M 14 100 Q 20 85 35 80 L 38 100 Z" fill="#cbd5e1" opacity="0.55"/>
    <path d="M 86 100 Q 80 85 65 80 L 62 100 Z" fill="#94a3b8" opacity="0.45"/>
    <!-- アンダーシャツ（首元） -->
    <path d="M 35 78.5 L 50 96 L 65 78.5 Q 50 82 35 78.5 Z" fill="${capColor}" stroke="#0f172a" stroke-width="1.4"/>
    <!-- ユニフォームVライン（ラケットライン） -->
    <path d="M 32.5 79.5 L 47 100 M 67.5 79.5 L 53 100" stroke="${capColor}" stroke-width="1.6" fill="none"/>

    <!-- 2. たくましい首筋 ＆ 顎下のセル影 -->
    <path d="M ${50 - neckW / 2} 66 L ${50 - neckW / 2 - 1.5} 82 Q 50 86.5 ${50 + neckW / 2 + 1.5} 82 L ${50 + neckW / 2} 66 Z" fill="${skin}" stroke="#291509" stroke-width="1.6"/>
    <!-- 顎下の濃い三角形セル影（アニメ調の立体感） -->
    <path d="M ${50 - neckW / 2 + 0.5} 68 Q 50 78.5 ${50 + neckW / 2 - 0.5} 68 L ${50 + neckW / 2 - 0.2} 75 Q 50 81.5 ${50 - neckW / 2 + 0.2} 75 Z" fill="${skinDeep}" opacity="0.68"/>
    <!-- 胸鎖乳突筋のシャープな筋ライン -->
    <line x1="${50 - neckW / 2 + 3.5}" y1="73" x2="${50 - 3.5}" y2="82" stroke="${skinDeep}" stroke-width="1.1" opacity="0.65"/>
    <line x1="${50 + neckW / 2 - 3.5}" y1="73" x2="${50 + 3.5}" y2="82" stroke="${skinDeep}" stroke-width="1.1" opacity="0.65"/>

    <!-- 3. 両耳（内耳のディテール付き） -->
    <path d="M ${50 - jawW + 0.5} 43 Q ${50 - jawW - 4.8} 42.5 ${50 - jawW - 4.2} 49.5 Q ${50 - jawW - 3.5} 55.5 ${50 - jawW + 1.2} 54.5 Z" fill="${skin}" stroke="#291509" stroke-width="1.5"/>
    <path d="M ${50 - jawW - 2.2} 45.5 Q ${50 - jawW - 3.0} 49 ${50 - jawW - 1.2} 52" stroke="${skinDeep}" stroke-width="1.1" fill="none"/>
    <path d="M ${50 + jawW - 0.5} 43 Q ${50 + jawW + 4.8} 42.5 ${50 + jawW + 4.2} 49.5 Q ${50 + jawW + 3.5} 55.5 ${50 + jawW - 1.2} 54.5 Z" fill="${skin}" stroke="#291509" stroke-width="1.5"/>
    <path d="M ${50 + jawW + 2.2} 45.5 Q ${50 + jawW + 3.0} 49 ${50 + jawW + 1.2} 52" stroke="${skinDeep}" stroke-width="1.1" fill="none"/>

    <!-- 4. 顔の輪郭 ＆ セル陰影 -->
    <path d="${facePath}" fill="${skin}" stroke="#291509" stroke-width="1.75"/>
    ${faceSideShadow}

    <!-- 5. 髪・もみあげ -->
    ${sideburnsSvg}
    ${hairSvg}

    <!-- 6. 眉・目・鼻・口 -->
    ${browsSvg}
    ${eyesSvg}
    ${noseSvg}
    ${mouthSvg}

    <!-- 7. 帽子 または 打撃用ヘルメット -->
    ${headwearSvg}
  </svg>`;
}
