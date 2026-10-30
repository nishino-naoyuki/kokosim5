import * as THREE from 'three';
import { MOUND_DISTANCE, type StadiumSpec } from './stadium';
import type { PitchOutcome } from '../match/types';
import { PitchType, PitchParams, pitchPosition, flightTime } from '../core/pitch';
import {
  createAnimatedPitcher,
  createAnimatedBatter,
  createRealisticOfficial,
  type AnimatedPitcher3D,
  type AnimatedBatter3D,
  type PitchingFormType,
  type PitchFormModifiers,
  type PlayerStyleOptions,
} from './matchPlayers';

export type CameraViewMode =
  | 'PITCH_VIEW'
  | 'SIDE_3B_VIEW'
  | 'FRONT_SUB_VIEW'
  | 'IN_PLAY_WIDE'
  | 'INFIELD_CLOSEUP';

export interface Match3DScene {
  container: HTMLElement;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  ball: THREE.Mesh;
  pitcher: AnimatedPitcher3D;
  pitcherMesh: THREE.Group;
  batter: AnimatedBatter3D;
  batterMesh: THREE.Group;
  catcherMesh: THREE.Group;
  umpireMesh: THREE.Group;
  setCameraMode: (mode: CameraViewMode) => void;
  getCameraMode: () => CameraViewMode;
  setPitcherForm: (form: PitchingFormType) => void;
  setPitcherThrows: (throws: 'R' | 'L') => void;
  setPitcherPhase: (phase: number) => void;
  setPitcherModifiers: (mods: Partial<PitchFormModifiers>) => void;
  setPitcherUniform: (opts: Partial<PlayerStyleOptions>) => void;
  setPitcherColorMaskMode: (enabled: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  playContinuousFormPreview: (
    onPhaseUpdate?: (phase: number, stageLabel: string) => void,
    onComplete?: () => void
  ) => void;
  playPitchAnimation: (
    outcome: PitchOutcome,
    onComplete?: () => void,
    onImpact?: (outcome: PitchOutcome) => void
  ) => void;
  playDemoPitch: (
    pitchType: 'FOUR_SEAM' | 'SLIDER' | 'CURVE' | 'FORK',
    isHit?: boolean,
    onComplete?: () => void,
    onImpact?: (outcome: PitchOutcome) => void
  ) => void;
  setRealisticPitchEasing: (enabled: boolean) => void;
  isRealisticPitchEasing: () => boolean;
  dispose: () => void;
  resize: () => void;
}

// 選手・審判の描画処理は matchPlayers.ts に集約

/**
 * 球種名称を PitchType にマッピング
 */
function mapPitchType(typeStr: string): PitchType {
  const upper = (typeStr || '').toUpperCase();
  if (upper.includes('SLIDER') || (typeStr || '').includes('スライダー')) return 'SLIDER';
  if (upper.includes('CURVE') || (typeStr || '').includes('カーブ')) return 'CURVE';
  if (upper.includes('FORK') || (typeStr || '').includes('フォーク')) return 'FORK';
  if (upper.includes('CHANGEUP') || (typeStr || '').includes('チェンジアップ')) return 'CHANGEUP';
  if (upper.includes('SINKER') || (typeStr || '').includes('シンカー')) return 'SINKER';
  return 'FOUR_SEAM';
}

/**
 * 甲子園球場 リアルな観客席スタンド ＆ 観客テクスチャ生成
 * （整然とした座席列、通路階段、手すり、何万人ものファンの熱気を緻密に描画）
 */
function createGrandstandCrowdTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // 1. スタンド基礎コンクリート（日差しを受ける明るいスタジアムグレー）
  ctx.fillStyle = '#6b778d';
  ctx.fillRect(0, 0, 1024, 512);

  const rows = 18;
  const rowHeight = 512 / rows;
  const crowdShirtColors = [
    '#ffffff', '#f1f5f9', '#1e3a8a', '#2563eb', '#3b82f6',
    '#eab308', '#f59e0b', '#dc2626', '#ef4444', '#334155',
    '#ffffff', '#f8fafc', '#10b981', '#059669', '#475569'
  ];
  const capColors = ['#1e3a8a', '#dc2626', '#18181b', '#ffffff', '#eab308'];
  const skinTones = ['#fed7aa', '#fde047', '#ffedd5', '#fcd34d'];

  // 2. 段ごとの座席列と観客の描画
  for (let r = 0; r < rows; r++) {
    const y = r * rowHeight;

    // 段差の影（段の下部）
    ctx.fillStyle = '#3a4454';
    ctx.fillRect(0, y + rowHeight - 4, 1024, 4);

    // 段差のエッジ（太陽光が反射するコンクリート縁）
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(0, y, 1024, 2.5);

    // 座席ベース（スタジアムのグリーン／ネイビー座席）
    ctx.fillStyle = r % 2 === 0 ? '#27384e' : '#1e2c3d';
    ctx.fillRect(0, y + 2.5, 1024, rowHeight - 6.5);

    // 観客の描画（座席ごとに整然と並ぶ）
    const seatWidth = 14;
    const numSeats = Math.floor(1024 / seatWidth);

    for (let s = 0; s < numSeats; s++) {
      const x = s * seatWidth + 1;

      // 通路（一定間隔で階段通路を配置）
      if (s % 18 === 0 || s % 18 === 1) {
        // 通路階段（明るいコンクリート＋黄色安全ライン）
        ctx.fillStyle = '#78869c';
        ctx.fillRect(x, y + 2, seatWidth, rowHeight - 4);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(x + 2, y + rowHeight - 3, seatWidth - 4, 1.5);
        continue;
      }

      // 観客（85%の着席率でランダム性を持ちつつ密集）
      const hash = (r * 137 + s * 89) % 100;
      if (hash < 12) continue; // 空席

      const shirtCol = crowdShirtColors[(r * 7 + s * 13) % crowdShirtColors.length];
      const capCol = capColors[(r * 5 + s * 11) % capColors.length];
      const skinCol = skinTones[(r * 3 + s * 17) % skinTones.length];

      // 胴体・シャツ
      ctx.fillStyle = shirtCol;
      ctx.beginPath();
      ctx.roundRect(x + 1.5, y + 8, seatWidth - 3, rowHeight - 9, [3, 3, 0, 0]);
      ctx.fill();

      // 頭部・顔
      ctx.fillStyle = skinCol;
      ctx.beginPath();
      ctx.arc(x + seatWidth / 2, y + 6.5, 3.2, 0, Math.PI * 2);
      ctx.fill();

      // 帽子・キャップ
      ctx.fillStyle = capCol;
      ctx.beginPath();
      ctx.arc(x + seatWidth / 2, y + 5.5, 3.4, Math.PI, Math.PI * 2);
      ctx.fill();
    }
  }

  // 3. 通路の手すり・フェンスライン
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 1.2;
  for (let s = 0; s < 1024; s += 18 * 14) {
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(s, 512);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(8, 1);
  return tex;
}

/**
 * 甲子園・地方球場の深緑フェンスパッド壁テクスチャ
 * （水平・垂直のパッドシーム・ステッチ・立体陰影）
 */
function createPaddedWallTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  // 深緑の球場フェンス基色（重厚で落ち着いたダークグリーン）
  ctx.fillStyle = '#1d472a';
  ctx.fillRect(0, 0, 512, 128);

  // パッドのクッション陰影（上下のふくらみ）
  const padH = 64;
  for (let p = 0; p < 2; p++) {
    const py = p * padH;
    // 上部ハイライト
    ctx.fillStyle = '#275c37';
    ctx.fillRect(0, py + 1, 512, 3);
    // 下部シャドウ（シーム溝）
    ctx.fillStyle = '#112b19';
    ctx.fillRect(0, py + padH - 3, 512, 3);
  }

  // 縦のパッド区切り線
  ctx.fillStyle = '#112b19';
  for (let x = 0; x < 512; x += 42) {
    ctx.fillRect(x, 0, 2, 128);
    ctx.fillStyle = 'rgba(45, 105, 63, 0.45)';
    ctx.fillRect(x + 2, 0, 1.5, 128);
    ctx.fillStyle = '#112b19';
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 1);
  return tex;
}

/**
 * 甲子園球場 バックネット裏の巨大すり鉢状スタンド ＆ 「阪神甲子園球場」壁面看板
 * （koshien_pitch_final.jpg の完全再現：TV中継視点正面 +Z 方向に正確に構築）
 */
function buildBackstopGrandstand(_stadiumName?: string): THREE.Group {
  const group = new THREE.Group();

  // 1. バックネット壁（深緑のパッド壁：高さ3.4m、本塁後方を半円弧で包む）
  const wallRadius = 18.0;
  const wallArc = Math.PI * 0.78;
  const wallGeo = new THREE.CylinderGeometry(
    wallRadius,
    wallRadius,
    3.4,
    64,
    1,
    true,
    -wallArc / 2,
    wallArc,
  );
  const wallTex = createPaddedWallTexture();
  const wallMat = new THREE.MeshStandardMaterial({
    map: wallTex,
    roughness: 0.7,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.set(0, 1.7, 0);
  group.add(wall);

  // 壁上部のパッドトップレール（濃紺グリーンの厚みある縁取り）
  const topRailGeo = new THREE.CylinderGeometry(
    wallRadius + 0.08,
    wallRadius + 0.08,
    0.16,
    64,
    1,
    true,
    -wallArc / 2,
    wallArc,
  );
  const topRailMat = new THREE.MeshStandardMaterial({ color: 0x0f2918, roughness: 0.5 });
  const topRail = new THREE.Mesh(topRailGeo, topRailMat);
  topRail.position.set(0, 3.48, 0);
  group.add(topRail);

  // 2. 防球ネット（細やかなダークワイヤーネット）
  const netGeo = new THREE.CylinderGeometry(
    wallRadius,
    wallRadius + 2.5,
    12,
    48,
    1,
    true,
    -wallArc / 2,
    wallArc,
  );
  const netMat = new THREE.MeshBasicMaterial({
    color: 0x1f2937,
    wireframe: true,
    transparent: true,
    opacity: 0.22,
  });
  const net = new THREE.Mesh(netGeo, netMat);
  net.position.set(0, 9.4, 0);
  group.add(net);

  // 3. 超巨大すり鉢状スタンド（満員の観客・整然とした座席列）
  const tiers = 7;
  const crowdTex = createGrandstandCrowdTexture();

  for (let t = 0; t < tiers; t++) {
    const r1 = wallRadius + 0.3 + t * 4.4;
    const r2 = wallRadius + 0.3 + (t + 1) * 4.4;
    const y1 = 3.5 + t * 3.6;
    const y2 = 3.5 + (t + 1) * 3.6;

    // スタンド幾何形状（傾斜面）
    const standGeo = new THREE.CylinderGeometry(
      r2,
      r1,
      y2 - y1,
      64,
      1,
      true,
      -wallArc / 2,
      wallArc,
    );

    // 観客テクスチャマテリアル（太陽光に照らされるリアルなスタンド）
    const standMat = new THREE.MeshStandardMaterial({
      map: crowdTex,
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    const stand = new THREE.Mesh(standGeo, standMat);
    stand.position.set(0, (y1 + y2) / 2, 0);
    group.add(stand);
  }

  // 4. スタンド最上部の大屋根（甲子園の銀傘：重厚なスレートシルバー屋根）
  const roofArc = Math.PI * 0.76;
  const roofGeo = new THREE.CylinderGeometry(
    56,
    50,
    4.5,
    64,
    1,
    true,
    -roofArc / 2,
    roofArc,
  );
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x5a6878,
    roughness: 0.6,
    metalness: 0.2,
    side: THREE.DoubleSide,
  });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.set(0, 31, 0);
  group.add(roof);

  return group;
}

/**
 * 太く鮮明な白線リボンメッシュを生成（DirectXの1px制限を回避）
 */
function createChalkRibbon(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  width: number = 0.08,
  y: number = 0.03,
): THREE.Mesh {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const angle = Math.atan2(dx, dz);

  const geo = new THREE.PlaneGeometry(width, len);
  const mat = new THREE.MeshBasicMaterial({ color: 0xf8fafc, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = angle;
  mesh.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
  return mesh;
}

/**
 * 球場フィールド（鮮やかなファウル芝生 ＆ 明るい内野土 ＆ マウンド ＆ 太い白線・ダートサークル）
 * 練習試合用球場・地方球場（茶土）と甲子園（黒土）の両方に完全対応し、色乗算による黒潰れを排除
 */
function buildBaseballField(stadiumSpec: StadiumSpec): THREE.Group {
  const g = new THREE.Group();
  const isDarkSoil = stadiumSpec.name.includes('甲子園') || Boolean(stadiumSpec.isPrison);

  // 1. 全面ベース：鮮やかな緑の芝生（ファウルゾーン・バックネット前ターフ）
  const turfCanvas = document.createElement('canvas');
  turfCanvas.width = 512;
  turfCanvas.height = 512;
  const tCtx = turfCanvas.getContext('2d')!;
  // 芝生の刈り込みストライプ
  for (let i = 0; i < 8; i++) {
    tCtx.fillStyle = i % 2 === 0 ? '#3f843c' : '#489144';
    tCtx.fillRect(0, i * 64, 512, 64);
  }
  // 芝の細かな粒子感
  for (let i = 0; i < 2000; i++) {
    tCtx.fillStyle = i % 2 === 0 ? '#367534' : '#529e4e';
    tCtx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  const turfTex = new THREE.CanvasTexture(turfCanvas);
  turfTex.colorSpace = THREE.SRGBColorSpace;
  turfTex.wrapS = THREE.RepeatWrapping;
  turfTex.wrapT = THREE.RepeatWrapping;
  turfTex.repeat.set(14, 14);

  const turfGeo = new THREE.PlaneGeometry(160, 160);
  const turfMat = new THREE.MeshBasicMaterial({ map: turfTex });
  const turf = new THREE.Mesh(turfGeo, turfMat);
  turf.rotation.x = -Math.PI / 2;
  turf.position.set(0, 0.002, 0);
  g.add(turf);

  // 2. 内野〜本塁の土エリア（バックネット手前 Z > +4.3m および左右端に緑の芝生を残す楕円形状）
  const dirtCanvas = document.createElement('canvas');
  dirtCanvas.width = 1024;
  dirtCanvas.height = 1024;
  const dCtx = dirtCanvas.getContext('2d')!;

  // 太陽光・カクテル光線を受けた明るい土グラデーション（黒潰れゼロ）
  const grad = dCtx.createRadialGradient(512, 540, 60, 512, 540, 520);
  if (isDarkSoil) {
    // 甲子園の黒土（日差しを受けて明るく立体感のあるチャコールブラウン）
    grad.addColorStop(0.0, '#78685a');
    grad.addColorStop(0.55, '#635549');
    grad.addColorStop(1.0, '#4a3f36');
  } else {
    // 練習試合用球場・地方球場の明るい茶土（真砂土・赤土ブレンド）
    grad.addColorStop(0.0, '#9a7959');
    grad.addColorStop(0.55, '#846548');
    grad.addColorStop(1.0, '#684e37');
  }
  dCtx.fillStyle = grad;
  dCtx.fillRect(0, 0, 1024, 1024);

  // 土の細かな粒子とブラシ整備跡
  for (let i = 0; i < 6000; i++) {
    dCtx.fillStyle =
      i % 2 === 0
        ? isDarkSoil
          ? 'rgba(140, 122, 105, 0.35)'
          : 'rgba(180, 145, 110, 0.35)'
        : 'rgba(55, 42, 30, 0.35)';
    dCtx.fillRect(Math.random() * 1024, Math.random() * 1024, 3, 3);
  }

  const dirtTex = new THREE.CanvasTexture(dirtCanvas);
  dirtTex.colorSpace = THREE.SRGBColorSpace;

  // 楕円形の土メッシュ（中心 Z=-14.2, 半径Z=18.6 → 本塁後方 Z=+4.4m で鮮やかに芝生と切り替わる）
  const dirtGeo = new THREE.CircleGeometry(18.6, 96);
  const dirtMat = new THREE.MeshBasicMaterial({ map: dirtTex });
  const dirt = new THREE.Mesh(dirtGeo, dirtMat);
  dirt.rotation.x = -Math.PI / 2;
  dirt.scale.set(1.12, 1.0, 1.0); // 横幅約20.8m、奥行き18.6m
  dirt.position.set(0, 0.01, -14.2);
  g.add(dirt);

  // 3. 投手マウンド（周囲の土より一段明るく立体的な傾斜円丘 ＋ 投手の落ち影 ＋ 踏み跡）
  const moundCanvas = document.createElement('canvas');
  moundCanvas.width = 512;
  moundCanvas.height = 512;
  const mCtx = moundCanvas.getContext('2d')!;
  const mGrad = mCtx.createRadialGradient(240, 240, 20, 256, 256, 256);
  if (isDarkSoil) {
    mGrad.addColorStop(0.0, '#857464');
    mGrad.addColorStop(0.7, '#6b5c4f');
    mGrad.addColorStop(0.95, '#4d4137');
    mGrad.addColorStop(1.0, '#5a4c40');
  } else {
    mGrad.addColorStop(0.0, '#ab8866');
    mGrad.addColorStop(0.7, '#8f6f50');
    mGrad.addColorStop(0.95, '#6b5139');
    mGrad.addColorStop(1.0, '#7a5d42');
  }
  mCtx.fillStyle = mGrad;
  mCtx.fillRect(0, 0, 512, 512);

  // マウンド上の投手の足元から右へ伸びるリアルな落ち影（koshien_pitch_final.jpg 準拠）
  mCtx.fillStyle = 'rgba(20, 15, 10, 0.48)';
  mCtx.beginPath();
  mCtx.ellipse(195, 250, 75, 22, -0.15, 0, Math.PI * 2);
  mCtx.fill();

  const moundTex = new THREE.CanvasTexture(moundCanvas);
  moundTex.colorSpace = THREE.SRGBColorSpace;

  const moundGeo = new THREE.CylinderGeometry(2.75, 3.05, 0.24, 48);
  const moundMat = new THREE.MeshBasicMaterial({ map: moundTex });
  const mound = new THREE.Mesh(moundGeo, moundMat);
  mound.position.set(0, 0.12, -MOUND_DISTANCE);
  g.add(mound);

  // ピッチャープレート（白色ゴム板）
  const plateMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.04, 0.16), plateMat);
  plate.position.set(0.12, 0.25, -MOUND_DISTANCE - 0.15);
  g.add(plate);

  // マウンド前方の白い踏み出し跡プレート（koshien_pitch_final.jpg 手前の白いスパイク跡エリア）
  const stepCanvas = document.createElement('canvas');
  stepCanvas.width = 128;
  stepCanvas.height = 128;
  const stCtx = stepCanvas.getContext('2d')!;
  stCtx.fillStyle = '#ddd6cc';
  stCtx.fillRect(0, 0, 128, 128);
  stCtx.fillStyle = '#4a3f35';
  for (let r = 16; r < 112; r += 22) {
    stCtx.fillRect(18, r, 36, 8);
    stCtx.fillRect(74, r, 36, 8);
  }
  const stepTex = new THREE.CanvasTexture(stepCanvas);
  stepTex.colorSpace = THREE.SRGBColorSpace;
  const stepPatch = new THREE.Mesh(
    new THREE.PlaneGeometry(0.38, 0.56),
    new THREE.MeshBasicMaterial({ map: stepTex }),
  );
  stepPatch.rotation.x = -Math.PI / 2;
  stepPatch.position.set(-0.22, 0.245, -MOUND_DISTANCE + 0.72);
  g.add(stepPatch);

  // 4. ホームベース（五角形）
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc, side: THREE.DoubleSide });
  const homeShape = new THREE.Shape();
  homeShape.moveTo(-0.215, 0);
  homeShape.lineTo(0.215, 0);
  homeShape.lineTo(0.215, 0.215);
  homeShape.lineTo(0, 0.43);
  homeShape.lineTo(-0.215, 0.215);
  homeShape.closePath();
  const homeMesh = new THREE.Mesh(new THREE.ShapeGeometry(homeShape), lineMat);
  homeMesh.rotation.x = -Math.PI / 2;
  homeMesh.position.set(0, 0.03, 0);
  g.add(homeMesh);

  // 5. 一塁ファウルライン ＆ 三塁ファウルライン（太く鮮やかな白線が画面左右へ伸びる）
  // 一塁線（+X, -Z 方向＝画面左下方向）
  g.add(createChalkRibbon(0.45, -0.02, 26.0, -25.57, 0.09, 0.028));
  // 三塁線（-X, -Z 方向＝画面右下方向）
  g.add(createChalkRibbon(-0.45, -0.02, -26.0, -25.57, 0.09, 0.028));

  // 6. ホームベース周囲の白いダートサークル円弧（koshien_pitch_final.jpg の白線アーク）
  const circleArcGeo = new THREE.RingGeometry(4.05, 4.14, 64);
  const circleArc = new THREE.Mesh(circleArcGeo, lineMat);
  circleArc.rotation.x = -Math.PI / 2;
  circleArc.position.set(0, 0.026, 0.2);
  g.add(circleArc);

  // 7. 左右バッターボックス ＆ キャッチャーボックス（太さ6cmの鮮明な白線枠）
  for (const sign of [-1, 1]) {
    const xIn = sign * 0.45;
    const xOut = sign * 1.35;
    const zFront = -0.45;
    const zBack = 0.85;
    g.add(createChalkRibbon(xIn, zFront, xOut, zFront, 0.06, 0.03));
    g.add(createChalkRibbon(xOut, zFront, xOut, zBack, 0.06, 0.03));
    g.add(createChalkRibbon(xOut, zBack, xIn, zBack, 0.06, 0.03));
    g.add(createChalkRibbon(xIn, zBack, xIn, zFront, 0.06, 0.03));
  }

  // キャッチャーボックス枠
  g.add(createChalkRibbon(-0.65, 0.85, -0.65, 1.95, 0.06, 0.03));
  g.add(createChalkRibbon(0.65, 0.85, 0.65, 1.95, 0.06, 0.03));
  g.add(createChalkRibbon(-0.65, 1.95, 0.65, 1.95, 0.06, 0.03));

  return g;
}

// ===========================================================================
// 投球モーションの生体力学（バイオメカニクス）緩急イージング
// - 0.00 〜 0.46: ワインドアップ・足上げ〜頂点タメ（スムーズに立ち上がり、頂点でフワッと静止）
// - 0.46 〜 0.76: ヒップファーストの重心移動・前足ステップ（重力加速）
// - 0.76 〜 0.90: 前足着地〜胸の張り・腕の強烈なしなり（レイトコッキング）
// - 0.90 〜 1.00: 蓄積エネルギー爆発！一瞬で前方へ腕を振り抜く超加速リリース！
// ===========================================================================

/** リアル投球緩急の有効化フラグ（NG時に即座に旧線形動作へ戻せる安全弁） */
export let isRealisticPitchEasingActive = true;

export function setRealisticPitchEasing(enabled: boolean): void {
  isRealisticPitchEasingActive = enabled;
}

export function calcBiomechanicsWindupPhase(u: number): number {
  const t = Math.max(0, Math.min(1, u));
  if (t <= 0.46) {
    // 足上げ〜頂点タメ: 0.00 -> 0.25 (頂点付近の角速度がゼロに近づくタメ)
    const s = t / 0.46;
    const ease = Math.sin((s * Math.PI) / 2);
    return 0.25 * ease;
  } else if (t <= 0.76) {
    // ステップ・重心移動: 0.25 -> 0.52 (前方に重力加速しながら沈み込む)
    const s = (t - 0.46) / 0.30;
    const ease = s * s * (3 - 2 * s);
    return 0.25 + 0.27 * ease;
  } else if (t <= 0.90) {
    // 着地〜腕のしなり（レイトコッキング）: 0.52 -> 0.62
    const s = (t - 0.76) / 0.14;
    return 0.52 + 0.10 * s;
  } else {
    // 腕の振り〜リリース一閃！: 0.62 -> 0.68 (爆発的超加速スナップ)
    const s = (t - 0.90) / 0.10;
    const ease = Math.pow(s, 2.2);
    return 0.62 + 0.06 * ease;
  }
}

export function calcBiomechanicsFollowThroughPhase(p: number): number {
  const t = Math.max(0, Math.min(1, p));
  if (t <= 0.35) {
    // 放球直後の鋭い腕の振り抜き: 0.68 -> 0.88
    const s = t / 0.35;
    const ease = 1 - Math.pow(1 - s, 2.0);
    return 0.68 + 0.20 * ease;
  } else {
    // 減速フィニッシュ: 0.88 -> 1.00
    const s = (t - 0.35) / 0.65;
    const ease = Math.sin((s * Math.PI) / 2);
    return 0.88 + 0.12 * ease;
  }
}

// フォームエディタプレビュー用（全0.0〜1.0）
export function calcFullPitchSequencePhase(p: number): number {
  const t = Math.max(0, Math.min(1, p));
  const splitT = 0.58; // 0.00〜0.58がワインドアップ、0.58〜1.00がフォロースルー
  if (t <= splitT) {
    const u = t / splitT;
    return calcBiomechanicsWindupPhase(u);
  } else {
    const v = (t - splitT) / (1 - splitT);
    return calcBiomechanicsFollowThroughPhase(v);
  }
}

/**
 * 3D試合ビューの初期化
 */
export function initMatch3D(
  container: HTMLElement,
  stadiumSpec: StadiumSpec,
  capColorA: string = '#1e3a8a',
  capColorB: string = '#dc2626',
): Match3DScene {
  const width = container.clientWidth || 1376;
  const height = container.clientHeight || 768;

  const scene = new THREE.Scene();
  // 鮮やかな真夏のスタジアムの青空
  scene.background = new THREE.Color(0x6ba4d9);

  // TV中継センター超望遠レンズ画角（koshien_pitch_final.jpg 完全準拠: FOV 18.5°）
  const camera = new THREE.PerspectiveCamera(18.5, width / height, 0.5, 700);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerHeight < 550 ? 1.35 : 2));
  renderer.shadowMap.enabled = true;
  // ガンマ補正・sRGB色空間・フィルム調トーンマッピング（黒潰れを解消し鮮やかな日光を再現）
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  container.appendChild(renderer.domElement);

  // 1. 球場フィールド（緑の芝生ターフ ＆ 明るい土 ＆ マウンド ＆ ファウルライン白線）
  const fieldGroup = buildBaseballField(stadiumSpec);
  scene.add(fieldGroup);

  // 2. バックネット裏の超巨大すり鉢状スタンド ＆ 球場銘板
  const grandstand = buildBackstopGrandstand(stadiumSpec.name);
  scene.add(grandstand);

  // 3. ライティング（真夏の強烈な太陽光 ＆ スカイライト環境光）
  const sunLight = new THREE.DirectionalLight(0xfff7e8, 2.5);
  sunLight.position.set(-20, 52, -26);
  scene.add(sunLight);

  const hemiLight = new THREE.HemisphereLight(0x90caf9, 0x4a3f36, 1.25);
  scene.add(hemiLight);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
  scene.add(ambientLight);

  const capA = parseInt(capColorA.replace('#', '0x'), 16) || 0x1e3a8a;
  const capB = parseInt(capColorB.replace('#', '0x'), 16) || 0xdc2626;

  // 4. 投手（案B：3D骨格ボーン ＋ セルアニメ調トゥーンシェーダー連続11コマエンジン）
  const pitcher = createAnimatedPitcher({
    capColor: capA,
    shirtColor: 0xf8fafc,
    pantsColor: 0xf8fafc,
    undershirtColor: capA,
    jerseyNumber: 1,
    throws: 'R',
    pitchingForm: 'OVERHAND_HIGH',
    uniformPattern: 'ACCENT_LINE',
    accentColor: capA,
  });
  // マウンド頂上プレート位置 (y = 0.25m, z = -MOUND_DISTANCE)
  // 3D骨格モデルでは +Z がホーム方向、-Z（背面）がセンターカメラ方向のため rotation.y = 0
  pitcher.group.position.set(0.12, 0.25, -MOUND_DISTANCE);
  pitcher.group.rotation.y = 0;
  scene.add(pitcher.group);

  // 5. 打者（ChatGPT pose_data_v6.json 骨格準拠 3Dセルアニメ調打者）
  const batter = createAnimatedBatter({
    capColor: capB,
    shirtColor: 0xf8fafc,
    pantsColor: 0xf8fafc,
    undershirtColor: capB,
    jerseyNumber: 4,
  });
  // 右打席（x = -0.92, z = 0.18）に配置。左肩を投手（-Z）に向けて自然に構えるため rotation.y = 0
  batter.group.position.set(-0.92, 0.02, 0.18);
  batter.group.rotation.y = 0;
  scene.add(batter.group);

  // 6. 捕手人形（ホーム後方でしゃがむ）
  const catcherMesh = createRealisticOfficial('CATCHER', {
    capColor: capA,
    shirtColor: 0xf8fafc,
    pantsColor: 0xf8fafc,
    undershirtColor: capA,
    jerseyNumber: 2,
  });
  catcherMesh.position.set(0.05, 0.02, 1.22);
  catcherMesh.rotation.y = Math.PI; // カメラ（-Z）に正対
  scene.add(catcherMesh);

  // 7. 球審人形（捕手後方）
  const umpireMesh = createRealisticOfficial('UMPIRE', {
    capColor: 0x1e293b,
    shirtColor: 0x1e293b,
    pantsColor: 0x334155,
  });
  umpireMesh.position.set(-0.18, 0.02, 2.05);
  umpireMesh.rotation.y = Math.PI; // カメラ（-Z）に正対
  scene.add(umpireMesh);

  // 8. 投球ボール（白球＋リリース前は非表示、リリース前は投手の手のひらのボールが表示される）
  const ballGeo = new THREE.SphereGeometry(0.075, 16, 16);
  const ballMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const ball = new THREE.Mesh(ballGeo, ballMat);
  ball.position.set(0.18, 1.82, -MOUND_DISTANCE + 1.2);
  ball.visible = false;
  scene.add(ball);

  // -------------------------------------------------------------
  // カメラ視点制御（TV中継センター背面 / 三塁側真横 / 本塁側斜め正面）
  // -------------------------------------------------------------
  let currentCameraMode: CameraViewMode = 'PITCH_VIEW';
  let cameraTarget = new THREE.Vector3(0.35, 0.95, 0.2);
  camera.position.set(-1.85, 3.38, -33.2);
  camera.lookAt(cameraTarget);

  function setCameraMode(mode: CameraViewMode) {
    currentCameraMode = mode;
    if (mode === 'PITCH_VIEW') {
      // koshien_pitch_final.jpg: バックスクリーン横センターからの超望遠画角
      camera.fov = 18.5;
      camera.position.set(-1.85, 3.38, -33.2);
      cameraTarget = new THREE.Vector3(0.35, 0.95, 0.2);
      pitcher.setViewAngle?.('PITCH_VIEW');
    } else if (mode === 'SIDE_3B_VIEW') {
      // 連続写真比較用（今井投手・大勢投手・サイドスロー高校野球の三塁側真横アングル）
      camera.fov = 22;
      camera.position.set(-5.35, 1.32, -MOUND_DISTANCE + 0.52);
      cameraTarget = new THREE.Vector3(0.12, 1.12, -MOUND_DISTANCE + 0.52);
      pitcher.setViewAngle?.('SIDE_3B_VIEW');
    } else if (mode === 'FRONT_SUB_VIEW') {
      // アンダースロー連続写真比較用（ホーム・三塁側斜め前方からマウンドを見るアングル）
      camera.fov = 22;
      camera.position.set(-2.35, 1.05, -MOUND_DISTANCE + 4.85);
      cameraTarget = new THREE.Vector3(0.12, 0.98, -MOUND_DISTANCE + 0.55);
      pitcher.setViewAngle?.('FRONT_SUB_VIEW');
    } else if (mode === 'IN_PLAY_WIDE') {
      // infield_ground_wide.jpg: ホームベース後方スタンド上段からのハイアングル内野全景俯瞰
      camera.fov = 34;
      camera.position.set(0, 10.5, 12.5);
      cameraTarget = new THREE.Vector3(0, 1.0, -25);
      pitcher.setViewAngle?.('PITCH_VIEW');
    } else if (mode === 'INFIELD_CLOSEUP') {
      // infield_ground_closeup.jpg: ショートの足元ローアングル至近距離クローズアップ
      camera.fov = 22;
      camera.position.set(4.2, 1.15, -13.5);
      cameraTarget = new THREE.Vector3(7.2, 0.45, -18.2);
      pitcher.setViewAngle?.('PITCH_VIEW');
    }
    camera.updateProjectionMatrix();
    camera.lookAt(cameraTarget);
  }

  function getCameraMode(): CameraViewMode {
    return currentCameraMode;
  }

  let playbackSpeed = 1.0;

  function setPitcherForm(form: PitchingFormType) {
    pitcher.setPitchingForm(form);
  }

  function setPitcherThrows(throws: 'R' | 'L') {
    pitcher.setThrows(throws);
  }

  function setPitcherPhase(phase: number) {
    if (currentTweenId !== null) {
      cancelAnimationFrame(currentTweenId);
      currentTweenId = null;
    }
    ball.visible = false;
    pitcher.setPhase(phase);
  }

  function setPitcherModifiers(mods: Partial<PitchFormModifiers>) {
    pitcher.setFormModifiers(mods);
  }

  function setPitcherUniform(opts: Partial<PlayerStyleOptions>) {
    pitcher.setUniform(opts);
  }

  function setPitcherColorMaskMode(enabled: boolean) {
    pitcher.setColorMaskMode?.(enabled);
  }

  function setPlaybackSpeed(speed: number) {
    playbackSpeed = Math.max(0.1, Math.min(2.0, speed));
  }

  function getStageLabelForPhase(p: number): string {
    if (p < 0.04) return '① セット構え (軸足プレート接地・静止)';
    if (p < 0.12) return '② 始動・重心移動 (軸足タメ開始)';
    if (p < 0.20) return '③ 足上げ始動 (左膝リフト開始)';
    if (p < 0.28) return '④ 足上げ頂点 (最高到達点タメ)';
    if (p < 0.35) return '⑤ 並進初動 (ヒップファースト始動)';
    if (p < 0.41) return '⑥ 沈み込み並進 (軸足プレート固定・沈み込み)';
    if (p < 0.48) return '⑦ 腕の割れ (軸足地面蹴り・テイクバック)';
    if (p < 0.55) return '⑧ 踏み出し足着地 (左足接地・体幹並進完了)';
    if (p < 0.60) return '⑨ パワーL字トップ (前腕直立・胸の張り)';
    if (p < 0.65) return '⑩ 最大外旋 MER (肘先行・前腕しなり)';
    if (p < 0.71) return '⑪ まさに放球 (腕伸展・指先から白球発射！)';
    if (p < 0.77) return '⑫ 減速・回内 (前腕プロネーション・体幹屈曲)';
    if (p < 0.84) return '⑬ 腕の巻き込み (左脇締め・グラブ密着)';
    if (p < 0.94) return '⑭ ダイナミック蹴り上げ (右脚ハイキック・靴底表示)';
    return '⑮ フィニッシュ・守備復帰 (両足着地・捕球体勢)';
  }

  function playContinuousFormPreview(
    onPhaseUpdate?: (phase: number, stageLabel: string) => void,
    onComplete?: () => void
  ) {
    if (currentTweenId !== null) cancelAnimationFrame(currentTweenId);
    ball.visible = false;
    pitcher.setPhase(0);
    const totalDurationMs = 1550 / playbackSpeed;
    const startTime = performance.now();

    function loop(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / totalDurationMs);
      const effectivePhase = isRealisticPitchEasingActive
        ? calcFullPitchSequencePhase(progress)
        : progress;
      pitcher.setPhase(effectivePhase);
      if (onPhaseUpdate) {
        onPhaseUpdate(effectivePhase, getStageLabelForPhase(effectivePhase));
      }
      if (progress < 1.0) {
        currentTweenId = requestAnimationFrame(loop);
      } else {
        currentTweenId = null;
        if (onComplete) onComplete();
      }
    }
    currentTweenId = requestAnimationFrame(loop);
  }

  // アニメーションループ
  let animId = 0;
  function animate() {
    animId = requestAnimationFrame(animate);
    camera.lookAt(cameraTarget);
    renderer.render(scene, camera);
  }
  animate();

  // 投球・打球アニメーション再生（Phase 1 物理エンジン pitch.ts ＆ 案B 連続60fpsボーン補間連動）
  let currentTweenId: number | null = null;
  function playPitchAnimation(
    outcome: PitchOutcome,
    onComplete?: () => void,
    onImpact?: (outcome: PitchOutcome) => void
  ) {
    if (currentTweenId !== null) cancelAnimationFrame(currentTweenId);

    let impactFired = false;

    if (currentCameraMode === 'IN_PLAY_WIDE' || currentCameraMode === 'INFIELD_CLOSEUP') {
      setCameraMode('PITCH_VIEW');
    }

    // 1. 球種判定 ＆ 物理演算パラメータ設定 (src/core/pitch.ts)
    const pType = mapPitchType(outcome.pitchType);
    const velKmh = Math.max(90, Math.min(160, outcome.speedKmh || 142));

    let targetX = 0;
    if (outcome.tracking.pitchZone.includes('OUT')) targetX = 0.22;
    else if (outcome.tracking.pitchZone.includes('IN')) targetX = -0.22;

    let targetZ = 0.72; // ストライクゾーン中央の高さ (m)
    if (outcome.tracking.pitchZone.includes('HIGH')) targetZ = 0.98;
    else if (outcome.tracking.pitchZone.includes('LOW')) targetZ = 0.46;

    // 3D骨格のリリース瞬間の手首ワールド座標から物理弾道の初期位置を算出
    const releaseWorld = new THREE.Vector3();
    pitcher.setPhase(0.68);
    scene.updateMatrixWorld(true);
    pitcher.getReleaseWorldPosition(releaseWorld);

    const releaseDistY = Math.max(15.5, Math.min(18.2, 0.2 - releaseWorld.z));
    const pParams: PitchParams = {
      type: pType,
      velocityKmh: velKmh,
      release: {
        x: releaseWorld.x,
        y: releaseDistY,
        z: Math.max(0.32, releaseWorld.y),
      },
      target: { x: targetX, z: targetZ },
      breaking: 80,
      throws: pitcher.getThrows(),
    };

    const realFlightSec = flightTime(releaseDistY, velKmh);
    const flightMs = (realFlightSec * 1000) / playbackSpeed;

    // 初期化：投手構え(0.0)、打者構え(0.0)、ボールはリリースまで非表示
    pitcher.setPhase(0);
    batter.setPhase(0);
    ball.visible = false;

    const isSwing =
      outcome.ballResult === 'IN_PLAY' ||
      outcome.ballResult === 'SWINGING_STRIKE' ||
      outcome.ballResult === 'FOUL';

    const animStart = performance.now();
    const windupDurationMs = 800 / playbackSpeed; // ①構え(0.00) 〜 ⑪放球(0.68) までの連続モーション時間
    const flightDurationMs = flightMs;            // 放球 〜 ホームベース到達までの飛行時間
    // 空振り・ファウル・安打時のフォロースルー（インパクト〜背中巻き付きハイフィニッシュ）専用時間
    const followThroughMs = isSwing ? 380 / playbackSpeed : 0;

    function pitchLoop(now: number) {
      const elapsed = now - animStart;

      // -------------------------------------------------------------
      // 1. 投手のワインドアップフェーズ (0 <= elapsed < windupDurationMs)
      // -------------------------------------------------------------
      if (elapsed < windupDurationMs) {
        // 投手：0.00 (①構え) -> 0.68 (⑪放球) まで生体力学緩急または線形補間
        const windupProgress = Math.min(1.0, elapsed / windupDurationMs);
        const pitchPhase = isRealisticPitchEasingActive
          ? calcBiomechanicsWindupPhase(windupProgress)
          : windupProgress * 0.68;
        pitcher.setPhase(pitchPhase);
        ball.visible = false;

        // 打者：投手の足上げと完全に同調し、軸足にタメてすり足でトップ姿勢へ（Frame 0 ➜ Frame 41: phase 0.00 ➔ 0.4316）
        const loadProgress = Math.min(1.0, elapsed / (windupDurationMs * 0.92));
        const easeLoad = loadProgress * loadProgress * (3 - 2 * loadProgress);
        batter.setPhase(easeLoad * 0.4316);

        currentTweenId = requestAnimationFrame(pitchLoop);
        return;
      }

      // -------------------------------------------------------------
      // 2. ボール飛行フェーズ (windupDurationMs <= elapsed < windupDurationMs + flightDurationMs)
      // -------------------------------------------------------------
      const flightElapsed = elapsed - windupDurationMs;
      const progress = Math.min(1.0, flightElapsed / flightDurationMs);
      const curT = progress * realFlightSec;

      // 投手：⑪放球(0.68) ➜ ⑭フォロースルー(0.88) ➜ ⑮フィニッシュ(1.00) まで生体力学緩急または線形補間
      const followPhase = isRealisticPitchEasingActive
        ? calcBiomechanicsFollowThroughPhase(progress)
        : 0.68 + progress * 0.32;
      pitcher.setPhase(followPhase);

      // ボール：src/core/pitch.ts の真の物理演算（重力＋マグヌス効果＋球種変化曲線）
      ball.visible = true;
      const pos = pitchPosition(pParams, curT);
      // Three.js 座標系: x = pos.x, y = pos.z (高さ), z = 0.2 - pos.y (距離)
      ball.position.set(pos.x, pos.z, 0.2 - pos.y);

      // 打者：
      if (!isSwing) {
        // 見送り：Frame 41（トップ姿勢）でボールの軌道を見極める
        batter.setPhase(0.4316);
      } else {
        // 爆発的スイング緩急（静のタメ ➜ 限界の割れ ➜ インパクト直前の超急加速スナップ！）：
        // progress 0.00 ~ 0.48: 前足力強い踏み込み・着地・手元の粘り（Frame 41 ➜ 68: phase 0.4316 ➔ 0.7158）
        // progress 0.48 ~ 1.00: 骨盤解放からインパクト一閃！指数パワー曲線（u^2.7）で最高速のままボールを一閃！
        let bPhase = 0.4316;
        if (progress < 0.48) {
          const t = progress / 0.48;
          // 前足踏み込み・着地のタメ
          const easePlant = t * t * (3 - 2 * t);
          bPhase = 0.4316 + easePlant * (0.7158 - 0.4316);
        } else {
          const u = (progress - 0.48) / 0.52;
          // 爆発的加速：インパクト瞬間に最高速（最大角速度）へ達する指数パワー曲線
          const easeSwing = Math.pow(u, 2.7);
          bPhase = 0.7158 + easeSwing * (0.8737 - 0.7158);
        }
        batter.setPhase(bPhase);
      }

      if (progress < 1.0) {
        currentTweenId = requestAnimationFrame(pitchLoop);
        return;
      }

      // インパクト（捕球または打撃）瞬間のコールバック発火
      if (!impactFired) {
        impactFired = true;
        onImpact?.(outcome);
      }

      // -------------------------------------------------------------
      // 3. ボール到達後・フォロースルーフェーズ (ホーム到達 〜 +380ms)
      // -------------------------------------------------------------
      // ボールはミット到達位置（ホームベース）に固定
      const finalPos = pitchPosition(pParams, realFlightSec);
      ball.position.set(finalPos.x, finalPos.z, 0.2 - finalPos.y);

      if (isSwing && followThroughMs > 0) {
        const postFlightElapsed = elapsed - (windupDurationMs + flightDurationMs);
        if (postFlightElapsed < followThroughMs) {
          const ftProgress = Math.min(1.0, postFlightElapsed / followThroughMs);
          // インパクト直後の最高速度から、慣性で打者右側（一塁側）へ突き抜けて滑らかに静止（Cubic Ease-Out）
          // （Frame 83 ➜ Frame 95: phase 0.8737 ➔ 1.0000）
          const easeFT = 1 - Math.pow(1 - ftProgress, 3);
          const bPhase = 0.8737 + easeFT * (1.0 - 0.8737);
          batter.setPhase(bPhase);

          currentTweenId = requestAnimationFrame(pitchLoop);
          return;
        } else {
          // フォロースルー完全到達！
          batter.setPhase(1.0);
        }
      }

      // -------------------------------------------------------------
      // 4. モーション完了・リザルト演出
      // -------------------------------------------------------------
      if (outcome.ballResult === 'IN_PLAY' && currentCameraMode === 'PITCH_VIEW') {
        batter.setPhase(1.0); // 振り抜きの豪快なハイフィニッシュ
        playBattedBallAnimation(outcome, onComplete);
      } else {
        if (isSwing) {
          // 豪快な空振りフィニッシュ（腰110度回旋、バット背中巻き付き）ポーズで静止！
          batter.setPhase(1.0);
        } else {
          batter.setPhase(0.4316);
        }

        // 豪快なフィニッシュ姿勢をユーザーがしっかり視認できるよう余韻時間を確保
        const finishHoldMs = isSwing ? (900 / playbackSpeed) : (450 / playbackSpeed);
        setTimeout(() => {
          pitcher.setPhase(0);
          if (!isSwing) {
            batter.setPhase(0);
          }
          ball.visible = false;
          ball.position.set(0.18, 1.82, -MOUND_DISTANCE + 1.2);
          if (onComplete) onComplete();
        }, finishHoldMs);
      }
    }

    currentTweenId = requestAnimationFrame(pitchLoop);
  }

  function playDemoPitch(
    pitchType: 'FOUR_SEAM' | 'SLIDER' | 'CURVE' | 'FORK',
    isHit = false,
    onComplete?: () => void,
    onImpact?: (outcome: PitchOutcome) => void
  ) {
    const speedMap = {
      FOUR_SEAM: 146,
      SLIDER: 134,
      CURVE: 116,
      FORK: 130,
    };
    const nameMap = {
      FOUR_SEAM: 'ストレート',
      SLIDER: 'スライダー',
      CURVE: 'カーブ',
      FORK: 'フォーク',
    };
    const syntheticOutcome: PitchOutcome = {
      pitchType: nameMap[pitchType],
      speedKmh: speedMap[pitchType],
      ballResult: isHit ? 'IN_PLAY' : 'SWINGING_STRIKE',
      runsScored: isHit ? 1 : 0,
      outsAdded: isHit ? 0 : 1,
      inPlayOutcome: isHit ? '1B' : undefined,
      description: `${nameMap[pitchType]} (${speedMap[pitchType]} km/h)`,
      tracking: {
        pitchType: nameMap[pitchType],
        pitchSpeedKmh: speedMap[pitchType],
        pitchZone: pitchType === 'FORK' || pitchType === 'CURVE' ? 'LOW_OUT' : pitchType === 'SLIDER' ? 'HIGH_OUT' : 'CENTER',
        exitVelocityKmh: isHit ? 148 : undefined,
        launchAngleDeg: isHit ? 14 : undefined,
        trajectoryType: isHit ? 'LINER' : undefined,
      },
    };
    playPitchAnimation(syntheticOutcome, onComplete, onImpact);
  }

  function playBattedBallAnimation(outcome: PitchOutcome, onComplete?: () => void) {
    setCameraMode('IN_PLAY_WIDE');
    const startPos = new THREE.Vector3(0, 0.7, 0.2);
    const isHR = outcome.inPlayOutcome === 'HR';
    const isExtra = outcome.inPlayOutcome === '2B' || outcome.inPlayOutcome === '3B';
    const isGrounder = outcome.tracking.trajectoryType === 'GROUNDER';

    const dist = isHR
      ? -(stadiumSpec.center + 6)
      : isExtra
        ? -(stadiumSpec.foulLine * 0.75)
        : isGrounder
          ? -22
          : -60;
    const phi = (Math.PI / 4) * (Math.random() - 0.5);
    const targetX = dist * Math.sin(phi);
    const targetZ = dist * Math.cos(phi);
    const targetY = isGrounder ? 0.1 : 0.2;
    const endPos = new THREE.Vector3(targetX, targetY, targetZ);

    const durationMs = isHR ? 1500 : isGrounder ? 600 : 950;
    const startTime = performance.now();

    function battedLoop(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / durationMs);

      const cur = new THREE.Vector3().lerpVectors(startPos, endPos, progress);
      if (!isGrounder) {
        const peak = isHR ? 26 : 14;
        cur.y += Math.sin(progress * Math.PI) * peak;
      } else {
        cur.y = 0.1 + Math.abs(Math.sin(progress * Math.PI * 4)) * 0.35 * (1 - progress);
      }
      ball.position.copy(cur);

      if (progress >= 0.45 && isGrounder) {
        setCameraMode('INFIELD_CLOSEUP');
      }

      if (progress < 1.0) {
        currentTweenId = requestAnimationFrame(battedLoop);
      } else {
        setTimeout(() => {
          setCameraMode('PITCH_VIEW');
          pitcher.setPhase(0);
          batter.setFrame(0);
          ball.visible = false;
          ball.position.set(0.18, 1.82, -MOUND_DISTANCE + 1.2);
          if (onComplete) onComplete();
        }, 450);
      }
    }
    currentTweenId = requestAnimationFrame(battedLoop);
  }

  function resize() {
    const host = renderer.domElement.parentElement || container;
    const w = host.clientWidth || 1376;
    const h = host.clientHeight || 768;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  window.addEventListener('resize', resize);

  function dispose() {
    cancelAnimationFrame(animId);
    if (currentTweenId !== null) cancelAnimationFrame(currentTweenId);
    window.removeEventListener('resize', resize);
    pitcher.dispose();
    batter.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  }

  return {
    container,
    renderer,
    scene,
    camera,
    ball,
    pitcher,
    pitcherMesh: pitcher.group,
    batter,
    batterMesh: batter.group,
    catcherMesh,
    umpireMesh,
    setCameraMode,
    getCameraMode,
    setPitcherForm,
    setPitcherThrows,
    setPitcherPhase,
    setPitcherModifiers,
    setPitcherUniform,
    setPitcherColorMaskMode,
    setPlaybackSpeed,
    playContinuousFormPreview,
    playPitchAnimation,
    playDemoPitch,
    setRealisticPitchEasing,
    isRealisticPitchEasing: () => isRealisticPitchEasingActive,
    dispose,
    resize,
  };
}
