import * as THREE from 'three';

export type PitchingFormType =
  | 'OVERHAND_HIGH'
  | 'OVERHAND_LOW'
  | 'THREE_QUARTERS'
  | 'SIDEARM'
  | 'SUBMARINE';

export interface CustomFormModifiers {
  legLiftMod?: number;     // -0.5 .. +0.5 (足上げ高さ微調整)
  pelvisDropMod?: number;  // -0.3 .. +0.3 (沈み込み深さ微調整)
  armSlotModDeg?: number;  // -30 .. +30 (腕の振り出し角度微調整)
  torsoTiltModDeg?: number;// -20 .. +20 (上体の傾き微調整)
  legLiftHeight?: number;      // 0.2 .. 1.5 (1.0 = 標準)
  pelvisSinkDepth?: number;    // 0.5 .. 1.5 (1.0 = 標準)
  armSlotOffsetDeg?: number;   // -35 .. +35
  torsoTiltOffsetDeg?: number; // -25 .. +25
  strideLengthScale?: number;  // 0.7 .. 1.3
}

export type PitchFormModifiers = CustomFormModifiers;

export interface AnimatedPlayerBillboard {
  group: THREE.Group;
  setFrame: (frame: number) => void;
  /** 0.0 (①構え) 〜 1.0 (⑪フィニッシュ) の連続投球進捗を設定 */
  setPhase?: (progress: number) => void;
  setPitchingForm?: (form: PitchingFormType) => void;
  setThrows?: (throws: 'R' | 'L') => void;
  getThrows?: () => 'R' | 'L';
  setFormModifiers?: (mods: CustomFormModifiers) => void;
  setUniform?: (opts: Partial<PlayerStyleOptions>) => void;
  setViewAngle?: (angle: 'PITCH_VIEW' | 'SIDE_3B_VIEW' | 'FRONT_SUB_VIEW') => void;
  setColorMaskMode?: (enabled: boolean) => void;
  getReleaseWorldPosition?: (targetVec: THREE.Vector3) => THREE.Vector3;
  dispose: () => void;
}

export interface AnimatedPitcher3D extends AnimatedPlayerBillboard {
  setPhase: (progress: number) => void;
  setPitchingForm: (form: PitchingFormType) => void;
  setThrows: (throws: 'R' | 'L') => void;
  getThrows: () => 'R' | 'L';
  setFormModifiers: (mods: CustomFormModifiers) => void;
  setUniform: (opts: Partial<PlayerStyleOptions>) => void;
  setViewAngle?: (angle: 'PITCH_VIEW' | 'SIDE_3B_VIEW' | 'FRONT_SUB_VIEW') => void;
  setColorMaskMode?: (enabled: boolean) => void;
  getReleaseWorldPosition: (targetVec: THREE.Vector3) => THREE.Vector3;
}

export function numToHex(n: number): string {
  return '#' + (n & 0xffffff).toString(16).padStart(6, '0');
}

export interface PlayerStyleOptions {
  capColor: number;
  shirtColor: number;
  pantsColor: number;
  undershirtColor?: number;
  accentColor?: number;
  jerseyNumber?: number;
  uniformPattern?: 'NORMAL' | 'PINSTRIPE' | 'ACCENT_LINE';
  throws?: 'R' | 'L';
  bats?: 'R' | 'L';
  pitchingForm?: PitchingFormType;
}

// ===========================================================================
// 共通：本格スポーツアニメ調 GLSL 2階調セルシェーダー ＆ 外周シルエット黒主線シェーダー
// （ACESFilmicToneMapping による白飛び・色褪せを防ぎ、パキッとした2Dセル画の1影と主線を描画）
// ===========================================================================
export function createAnimeCelMaterial(options: {
  color?: THREE.Color | string | number;
  map?: THREE.Texture | null;
  shadowTint?: THREE.Vector3;
  isFlat?: boolean;
}): THREE.ShaderMaterial {
  const baseCol = new THREE.Color(options.color !== undefined ? options.color : 0xffffff);
  // 白ユニフォームが泥色・灰色ブロックにならないよう、アニメ本編に準拠した明るく清潔なソフトシャドウ
  const sTint = options.shadowTint || new THREE.Vector3(0.91, 0.93, 0.96);
  const isFlatVal = options.isFlat ? 1 : 0;

  return new THREE.ShaderMaterial({
    toneMapped: false,
    uniforms: {
      uColor: { value: baseCol },
      uMap: { value: options.map || null },
      uUseMap: { value: options.map ? 1 : 0 },
      uIsFlat: { value: isFlatVal },
      // カメラ前方斜め上（スタジアム照明・太陽光）から注ぐ自然なキーライト
      uLightDir: { value: new THREE.Vector3(-0.25, 0.78, 0.58).normalize() },
      uShadowTint: { value: sTint },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform sampler2D uMap;
      uniform int uUseMap;
      uniform int uIsFlat;
      uniform vec3 uLightDir;
      uniform vec3 uShadowTint;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec2 vUv;
      void main() {
        vec4 texCol = (uUseMap == 1) ? texture2D(uMap, vUv) : vec4(1.0);
        vec3 base = uColor * texCol.rgb;

        // 完全フラットモード（胴体など、3D曲面陰影による「四角い箱」の錯覚を100%根絶するアニメセル純白）
        if (uIsFlat == 1) {
          gl_FragColor = vec4(base, texCol.a);
          return;
        }

        float ndotl = dot(normalize(vNormal), uLightDir);
        // 滑らかで自然なアニメセル陰影階調
        float shadeStep = smoothstep(-0.25, 0.28, ndotl);
        vec3 shaded = mix(base * uShadowTint, base * 1.01, shadeStep);
        // 輪郭際立ちのアニメ調リムハイライト
        float rim = 1.0 - max(0.0, dot(normalize(vNormal), normalize(vViewDir)));
        float rimStep = smoothstep(0.76, 0.84, rim) * shadeStep;
        vec3 finalCol = mix(shaded, min(vec3(1.0), base * 1.14 + vec3(0.06)), rimStep * 0.45);
        gl_FragColor = vec4(finalCol, texCol.a);
      }
    `,
  });
}

/**
 * 関節内部に黒い輪っかが出ない「外周シルエット専用・法線押し出し黒インク主線」マテリアル
 */
function createAnimeOutlineMaterial(thickness: number = 0.011): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    toneMapped: false,
    side: THREE.BackSide,
    uniforms: {
      uThickness: { value: thickness },
      uOutlineColor: { value: new THREE.Color(0x111827) },
    },
    vertexShader: `
      uniform float uThickness;
      void main() {
        // Y軸（長手方向）へのハミ出しを抑え、X/Z外周法線方向へ押し出すことで関節の継ぎ目黒線を消去
        vec3 n = normalize(vec3(normal.x, normal.y * 0.25, normal.z));
        vec3 extruded = position + n * uThickness;
        vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(extruded, 1.0);
        // 深度バイアスをわずかに奥へ逃がし、隣接パーツ同士が重なる関節内部の黒線を隠す
        clipPos.z += 0.0022 * clipPos.w;
        gl_Position = clipPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uOutlineColor;
      void main() {
        gl_FragColor = vec4(uOutlineColor, 1.0);
      }
    `,
  });
}

export function createCelMesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  outlineScale: number = 1.04,
): THREE.Group {
  const grp = new THREE.Group();
  const mainMesh = new THREE.Mesh(geo, mat);
  grp.add(mainMesh);

  if (outlineScale > 1.0) {
    const thickness = Math.max(0.003, (outlineScale - 1.0) * 0.08);
    const outMesh = new THREE.Mesh(geo, createAnimeOutlineMaterial(thickness));
    grp.add(outMesh);
  }
  return grp;
}

/**
 * 2Dスポーツアニメ調の顔・表情・刈り上げ黒髪テクスチャ生成（『ダイヤのA』『MAJOR』風）
 * SphereGeometry の UV:
 *   正面 (+Z, キャッチャー方向) = u: 0.75 (x = 384) または rotateY(-Math.PI/2) 後に u: 0.5 (x = 256)
 *   ここでは headGeo.rotateY(-Math.PI / 2) を行い、u = 0.5 (x = 256) を顔正面 (+Z) に配置！
 */
export function createAnimeHeadTexture(skinHex: string = '#f1c29b', hairHex: string = '#1c1917'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // 1. 肌ベース色
  ctx.fillStyle = skinHex;
  ctx.fillRect(0, 0, 512, 512);

  // 2. 後頭部・側頭部の高校球児らしい刈り上げ・スポーツ刈り黒髪 (u=0..150, u=362..512, 上部 y=0..195)
  ctx.fillStyle = hairHex;
  ctx.fillRect(0, 0, 512, 185);
  // 後頭部〜襟足のグラデーション刈り上げ
  ctx.fillRect(0, 185, 148, 175);
  ctx.fillRect(364, 185, 148, 175);
  // もみあげ（シャープなアニメ調エッジ）
  ctx.beginPath();
  ctx.moveTo(148, 180);
  ctx.lineTo(166, 285);
  ctx.lineTo(148, 295);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(364, 180);
  ctx.lineTo(346, 285);
  ctx.lineTo(364, 295);
  ctx.closePath();
  ctx.fill();

  // 3. 帽子のツバ下のセルアニメ1影（額〜目元の上のシャープな影）
  ctx.fillStyle = 'rgba(168, 108, 74, 0.38)';
  ctx.fillRect(148, 175, 216, 48);

  // 4. 精悍なアニメ調の眉（太く力強い勝負師の眉）
  ctx.strokeStyle = '#18181b';
  ctx.lineWidth = 7.5;
  ctx.lineCap = 'round';
  // 右眉（向かって左 x=202..242）
  ctx.beginPath();
  ctx.moveTo(196, 224);
  ctx.lineTo(240, 234);
  ctx.stroke();
  // 左眉（向かって右 x=272..316）
  ctx.beginPath();
  ctx.moveTo(316, 224);
  ctx.lineTo(272, 234);
  ctx.stroke();

  // 5. アニメ調の鋭い瞳（白目＋黒目＋ハイライト）
  const drawAnimeEye = (cx: number, cy: number, dir: number) => {
    // 白目
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy + 2);
    ctx.quadraticCurveTo(cx, cy - 14, cx + 20, cy + 2);
    ctx.quadraticCurveTo(cx, cy + 13, cx - 20, cy + 2);
    ctx.closePath();
    ctx.fill();

    // 上まぶたの太い黒アイライン
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.moveTo(cx - 21, cy + 2);
    ctx.quadraticCurveTo(cx, cy - 14, cx + 21, cy + 2);
    ctx.stroke();

    // 虹彩・瞳孔
    ctx.fillStyle = '#1e1b18';
    ctx.beginPath();
    ctx.arc(cx + dir * 2, cy + 1, 9.5, 0, Math.PI * 2);
    ctx.fill();

    // 瞳の白ハイライト（アニメ特有の輝き）
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - 3, cy - 3, 3.5, 0, Math.PI * 2);
    ctx.fill();
  };
  drawAnimeEye(218, 254, 1);
  drawAnimeEye(294, 254, -1);

  // 6. アニメ調の鼻筋と三角影
  ctx.fillStyle = 'rgba(155, 95, 62, 0.55)';
  ctx.beginPath();
  ctx.moveTo(256, 258);
  ctx.lineTo(246, 302);
  ctx.lineTo(258, 305);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(256, 262);
  ctx.lineTo(250, 302);
  ctx.stroke();

  // 7. 引き締まった口元（闘志を秘めた一文字）
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(234, 338);
  ctx.quadraticCurveTo(256, 333, 278, 338);
  ctx.stroke();

  // あご下のセル影
  ctx.fillStyle = 'rgba(155, 95, 62, 0.42)';
  ctx.beginPath();
  ctx.ellipse(256, 395, 65, 24, 0, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 3Dユニフォーム上着（背中・胸・背番号・縦じま・ライン・アニメ服シワ）の動的Canvasテクスチャ生成
 * CylinderGeometry のデフォルト UV:
 *   u = 0.5 (x = 256) が -Z（背面＝センターカメラ側）！
 *   u = 0.0 / 1.0 (x = 0, 512) が +Z（胸正面＝本塁側）！
 */
export function createJerseyTorsoTexture(
  shirtHex: string,
  lineHex: string,
  pattern: 'NORMAL' | 'PINSTRIPE' | 'ACCENT_LINE',
  _jerseyNumber: number,
  _withWhitePatch: boolean = false,
  _isLefty: boolean = false,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // 1. ベース生地色
  ctx.fillStyle = shirtHex;
  ctx.fillRect(0, 0, 512, 512);

  // 2. デザインパターン（縦じま / 中央＆肩ライン）
  if (pattern === 'PINSTRIPE') {
    ctx.strokeStyle = lineHex;
    ctx.lineWidth = 4.5;
    for (let x = 8; x < 512; x += 22) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }
  }
  // ※ ACCENT_LINE の胸前立て縦ライン・ボタン列は、横向き打者の胸に縦長の「しかくい箱（灰色の帯）」として
  //   見えてしまうため胴体では描画しない（パンツ側のラインは維持）。

  // ※ 胴体テクスチャ上の幾何学的線画（背番号「4」の閉じた四角、ラグラン縫い目、ヨーク線、影ポリゴン）を
  // 100%完全撤廃。純白の無地生地にし、「四角い箱」に見える要素を完全に排除。

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.offset.x = 0.0;
  return tex;
}

/**
 * パンツ用テクスチャ（無地・縦じま・サイドライン ＋ アニメ調の膝・太ももシワ線）
 */
export function createPantsTexture(
  pantsHex: string,
  lineHex: string,
  pattern: 'NORMAL' | 'PINSTRIPE' | 'ACCENT_LINE',
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = pantsHex;
  ctx.fillRect(0, 0, 256, 256);

  if (pattern === 'PINSTRIPE') {
    ctx.strokeStyle = lineHex;
    ctx.lineWidth = 2.8;
    for (let x = 6; x < 256; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }
  } else if (pattern === 'ACCENT_LINE') {
    ctx.fillStyle = lineHex;
    ctx.fillRect(60, 0, 6, 256);
    ctx.fillRect(190, 0, 6, 256);
  }

  // アニメ調の太もも・膝裏シワ線
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
  ctx.lineWidth = 3.0;
  ctx.beginPath();
  ctx.moveTo(95, 165);
  ctx.lineTo(155, 178);
  ctx.moveTo(105, 195);
  ctx.lineTo(148, 188);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/**
 * ストッキング（ソックス）用テクスチャ（高校野球伝統の白2本ライン対応）
 */
export function createSocksTexture(underHex: string, shirtHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = underHex;
  ctx.fillRect(0, 0, 128, 128);

  // 白2本ライン
  ctx.fillStyle = shirtHex;
  ctx.fillRect(0, 32, 128, 10);
  ctx.fillRect(0, 50, 128, 10);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 半袖ユニフォーム袖用テクスチャ（無地・縦じま・袖口ライン ＋ アニメ調の袖シワ線）
 */
export function createSleeveTexture(
  shirtHex: string,
  lineHex: string,
  pattern: 'NORMAL' | 'PINSTRIPE' | 'ACCENT_LINE',
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = shirtHex;
  ctx.fillRect(0, 0, 128, 128);

  if (pattern === 'PINSTRIPE') {
    ctx.strokeStyle = lineHex;
    ctx.lineWidth = 2.5;
    for (let x = 6; x < 128; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 128);
      ctx.stroke();
    }
  } else if (pattern === 'ACCENT_LINE') {
    // 袖口のトリムライン
    ctx.fillStyle = lineHex;
    ctx.fillRect(0, 104, 128, 11);
  }

  // アニメ調の袖シワ主線
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.42)';
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(24, 52);
  ctx.lineTo(72, 66);
  ctx.moveTo(46, 80);
  ctx.lineTo(94, 72);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

// ===========================================================================
// 2. 案B：3D骨格ボーン ＋ セルアニメ調トゥーンシェーダー投手モデル
//    実写連続コマ（①オーバースロー11コマ、②スリークォーター12コマ、③サイドスロー10コマ、④アンダースロー10コマ）完全トレース
// ===========================================================================
export interface QuatBonePose {
  pelvisPos: THREE.Vector3;
  pelvisQ: THREE.Quaternion;
  spineQ: THREE.Quaternion;
  rShoulderQ: THREE.Quaternion;
  rElbowFlex: number;
  lShoulderQ: THREE.Quaternion;
  lElbowFlex: number;
  rHipQ: THREE.Quaternion;
  rKneeFlex: number;
  rAnkleQ: THREE.Quaternion;
  lHipQ: THREE.Quaternion;
  lKneeFlex: number;
  lAnkleQ: THREE.Quaternion;
  hasBall: boolean;
}

const DEG = Math.PI / 180;

function solveArmAnalytical(uDir: THREE.Vector3, vDir: THREE.Vector3): { q: THREE.Quaternion; flexDeg: number } {
  const u = uDir.clone().normalize();
  const v = vDir.clone().normalize();
  const dot = Math.max(-1, Math.min(1, u.dot(v)));
  const flexAngle = -Math.acos(dot);
  let zLocal = v.clone().sub(u.clone().multiplyScalar(dot));
  if (zLocal.lengthSq() < 1e-6) {
    zLocal = Math.abs(u.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    zLocal.sub(u.clone().multiplyScalar(zLocal.dot(u)));
  }
  zLocal.normalize();
  const yLocal = u.clone().negate();
  const xLocal = new THREE.Vector3().crossVectors(yLocal, zLocal).normalize();
  const mat = new THREE.Matrix4().makeBasis(xLocal, yLocal, zLocal);
  return { q: new THREE.Quaternion().setFromRotationMatrix(mat), flexDeg: flexAngle / DEG };
}

export function toQuatFromEuler(eulerArr: [number, number, number], order: THREE.EulerOrder = 'YXZ'): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(eulerArr[0] * DEG, eulerArr[1] * DEG, eulerArr[2] * DEG, order));
}

function interpolateQuatPoses(a: QuatBonePose, b: QuatBonePose, rawT: number): QuatBonePose {
  // キーフレーム間は線形補間（rawTそのまま）で接続！
  // ※ ここでsmoothstepを行うと、各キーフレーム境界（15箇所）で速度がゼロに落ちて「ひっかかる」原因になるため、
  //    全体の緩急制御（タメ・一気呵成）は外側のタイムイージング関数で一元管理する
  const t = rawT;
  return {
    pelvisPos: new THREE.Vector3().lerpVectors(a.pelvisPos, b.pelvisPos, t),
    pelvisQ: a.pelvisQ.clone().slerp(b.pelvisQ, t),
    spineQ: a.spineQ.clone().slerp(b.spineQ, t),
    rShoulderQ: a.rShoulderQ.clone().slerp(b.rShoulderQ, t),
    rElbowFlex: a.rElbowFlex + (b.rElbowFlex - a.rElbowFlex) * t,
    lShoulderQ: a.lShoulderQ.clone().slerp(b.lShoulderQ, t),
    lElbowFlex: a.lElbowFlex + (b.lElbowFlex - a.lElbowFlex) * t,
    rHipQ: a.rHipQ.clone().slerp(b.rHipQ, t),
    rKneeFlex: a.rKneeFlex + (b.rKneeFlex - a.rKneeFlex) * t,
    rAnkleQ: a.rAnkleQ.clone().slerp(b.rAnkleQ, t),
    lHipQ: a.lHipQ.clone().slerp(b.lHipQ, t),
    lKneeFlex: a.lKneeFlex + (b.lKneeFlex - a.lKneeFlex) * t,
    lAnkleQ: a.lAnkleQ.clone().slerp(b.lAnkleQ, t),
    hasBall: rawT < 0.5 ? a.hasBall : b.hasBall,
  };
}

// ---------------------------------------------------------------------------
// 軸足プレート固定＆地面接地（ボーク防止・放球まで絶対に足を蹴り上げない）2ボーン解析的IKソルバー
// 始動〜並進〜テイクバック〜トップ〜最大外旋(MER)〜放球(t=0.68)まで、軸足スパイクはプレート(Z <= 0.0)またはマウンド地面(Y=0.08m)に100%完全接地！
// 腰が本塁方向へ進んだ時は、靴底・爪先がマウンドの土を擦って自然に前方へ引きずる(Toe Drag)！
// ---------------------------------------------------------------------------
const _tmpHipWorld = new THREE.Vector3();
const _tmpFootDirWorld = new THREE.Vector3();
const _tmpFootDirLocal = new THREE.Vector3();
const _tmpInvPelvisQ = new THREE.Quaternion();

function solvePivotLegPinning(
  hipLocalPos: THREE.Vector3,
  pelvisPos: THREE.Vector3,
  pelvisQ: THREE.Quaternion,
  upperLen: number = 0.46,
  lowerLen: number = 0.44,
  isSub: boolean = false,
): { hipQ: THREE.Quaternion; kneeFlex: number; ankleQ: THREE.Quaternion } {
  // 骨盤の現在位置と回転から、軸足股関節（右股関節）のワールド座標を正確に算出
  _tmpHipWorld.copy(hipLocalPos).applyQuaternion(pelvisQ).add(pelvisPos);

  // マウンド地面接地高さ（土の上に靴底・爪先が接地 = 0.08m）
  const footY = 0.08;
  const maxReach = upperLen + lowerLen - 0.005;

  // 軸足は放球(t=0.68)までプレート(Z=0.0)にガッチリ固定！後方へピンと一直線に伸ばす！
  const targetFootWorld = new THREE.Vector3(_tmpHipWorld.x, footY, 0.0);

  // 股関節から足首へのベクトル
  _tmpFootDirWorld.copy(targetFootWorld).sub(_tmpHipWorld);
  const rawDist = _tmpFootDirWorld.length();
  const dist = Math.max(0.15, Math.min(maxReach, rawDist));

  // 骨盤ローカル座標系へ変換
  _tmpInvPelvisQ.copy(pelvisQ).invert();
  _tmpFootDirLocal.copy(_tmpFootDirWorld).applyQuaternion(_tmpInvPelvisQ).normalize();

  // 余弦定理による膝関節の屈曲角
  const cosKnee = Math.max(
    -1,
    Math.min(1, (upperLen * upperLen + lowerLen * lowerLen - dist * dist) / (2 * upperLen * lowerLen)),
  );
  const kneeInternalAngle = Math.acos(cosKnee);
  const kneeFlexDeg = (Math.PI - kneeInternalAngle) / DEG;

  // 大腿骨と股関節-足首直線の成す角
  const cosAlpha = Math.max(
    -1,
    Math.min(1, (upperLen * upperLen + dist * dist - lowerLen * lowerLen) / (2 * upperLen * dist)),
  );
  const alphaHip = Math.acos(cosAlpha);

  // 大腿基準方向 (0, -1, 0) を股関節-足首方向へ回転
  const baseThighQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), _tmpFootDirLocal);
  const pitchOffsetQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -alphaHip);

  let hipQ = baseThighQ.multiply(pitchOffsetQ);
  if (isSub) {
    // 膝が地中に沈まないよう、脚の屈曲面を地面と平行（外側）へ回転させてマウンド土の上に低く這わせるスイベル回転
    const swivelQ = new THREE.Quaternion().setFromAxisAngle(_tmpFootDirLocal, 60 * DEG);
    hipQ = swivelQ.multiply(hipQ);
  }

  // 接地足首角度（プレートに爪先・靴底が接地）
  const anklePitch = Math.max(-50, Math.min(10, kneeFlexDeg * 0.4 - 30));
  const ankleQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), anklePitch * DEG);

  return { hipQ, kneeFlex: kneeFlexDeg, ankleQ };
}

// ---------------------------------------------------------------------------
// 踏み出し足（左脚）着地・固定2ボーン解析的IKソルバー
// 着地(t >= 0.52)後、踏み出し足スパイクは本塁方向マウンド(X≈-0.10, Y=0.08, Z≈1.05)にガッチリ接地！
// 後退・めり込み・不自然なカニ股を100%根絶！
// ---------------------------------------------------------------------------
function solveLeftStrideGroundContact(
  hipLocalPos: THREE.Vector3,
  pelvisPos: THREE.Vector3,
  pelvisQ: THREE.Quaternion,
  targetFootWorld: THREE.Vector3,
  upperLen: number = 0.46,
  lowerLen: number = 0.44,
  isSub: boolean = false,
): { hipQ: THREE.Quaternion; kneeFlex: number; ankleQ: THREE.Quaternion } {
  _tmpHipWorld.copy(hipLocalPos).applyQuaternion(pelvisQ).add(pelvisPos);
  _tmpFootDirWorld.copy(targetFootWorld).sub(_tmpHipWorld);
  const rawDist = _tmpFootDirWorld.length();
  const maxReach = upperLen + lowerLen - 0.008;
  const dist = Math.min(maxReach, Math.max(0.15, rawDist));

  _tmpInvPelvisQ.copy(pelvisQ).invert();
  _tmpFootDirLocal.copy(_tmpFootDirWorld).applyQuaternion(_tmpInvPelvisQ).normalize();

  const cosKnee = Math.max(
    -1,
    Math.min(1, (upperLen * upperLen + lowerLen * lowerLen - dist * dist) / (2 * upperLen * lowerLen)),
  );
  const kneeFlexDeg = (Math.PI - Math.acos(cosKnee)) / DEG;

  const cosAlpha = Math.max(
    -1,
    Math.min(1, (upperLen * upperLen + dist * dist - lowerLen * lowerLen) / (2 * upperLen * dist)),
  );
  const alphaHip = Math.acos(cosAlpha);

  const baseThighQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), _tmpFootDirLocal);
  const pitchOffsetQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -alphaHip);
  let hipQ = baseThighQ.multiply(pitchOffsetQ);

  if (isSub) {
    const swivelQ = new THREE.Quaternion().setFromAxisAngle(_tmpFootDirLocal, -15 * DEG);
    hipQ = swivelQ.multiply(hipQ);
  }

  const ankleQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0);
  return { hipQ, kneeFlex: kneeFlexDeg, ankleQ };
}

/**
 * 4フォーム実写連続写真完全トレース・生体力学的15段階キーフレーム生成
 * （今井達也 11コマ、大勢 12コマ、高校野球サイド 10コマ、アンダー 10コマを完全包含・極上滑らか補間）
 */
function getFormTimeline(form: PitchingFormType): { times: number[]; poses: QuatBonePose[] } {
  // 15連続キーフレーム（着地〜放球の決定的瞬間を極小刻みで再現）
  const times = [0.00, 0.08, 0.16, 0.24, 0.32, 0.38, 0.45, 0.52, 0.58, 0.63, 0.68, 0.74, 0.80, 0.88, 1.00];

  const isHigh = form === 'OVERHAND_HIGH';
  const isLow = form === 'OVERHAND_LOW';
  const isThreeQ = form === 'THREE_QUARTERS';
  const isSide = form === 'SIDEARM';
  const isSub = form === 'SUBMARINE';

  // ① 構え (Set Stance: 三塁側を向いて直立、両手は胸の前でグラブにボールを収める)
  const armSetR = solveArmAnalytical(new THREE.Vector3(-0.35, -0.80, 0.45), new THREE.Vector3(-0.45, 0.65, 0.60));
  const armSetL = solveArmAnalytical(new THREE.Vector3(0.35, -0.80, 0.45), new THREE.Vector3(0.45, 0.65, 0.60));

  // ⑦ 腕の割れ・テイクバック
  const armGlideR = solveArmAnalytical(new THREE.Vector3(0.20, -0.80, -0.55), new THREE.Vector3(0.10, -0.40, -0.90));
  const armGlideSubR = solveArmAnalytical(new THREE.Vector3(0.35, -0.75, -0.55), new THREE.Vector3(0.20, -0.50, -0.85));
  const armGlideL = solveArmAnalytical(new THREE.Vector3(-0.25, 0.20, 0.94), new THREE.Vector3(-0.10, 0.40, 0.90));

  // ⑨ パワーL字トップ
  const armTopR = isSide
    ? solveArmAnalytical(new THREE.Vector3(0.90, -0.05, -0.30), new THREE.Vector3(0.15, 0.85, -0.50))
    : isSub
    ? solveArmAnalytical(new THREE.Vector3(0.40, -0.65, -0.40), new THREE.Vector3(0.25, -0.35, -0.90))
    : isThreeQ
    ? solveArmAnalytical(new THREE.Vector3(0.92, 0.10, -0.15), new THREE.Vector3(0.0, 0.95, 0.28))
    : solveArmAnalytical(new THREE.Vector3(0.95, 0.15, -0.25), new THREE.Vector3(-0.10, 0.95, 0.28));
  const armTopL = solveArmAnalytical(new THREE.Vector3(-0.30, 0.15, 0.94), new THREE.Vector3(-0.15, 0.35, 0.92));

  // ⑩ 最大外旋 (MER / Layback)
  const armMerR = isSide
    ? solveArmAnalytical(new THREE.Vector3(0.92, 0.20, 0.25), new THREE.Vector3(-0.10, 0.35, -0.92))
    : isSub
    ? solveArmAnalytical(new THREE.Vector3(0.45, -0.55, 0.35), new THREE.Vector3(0.15, -0.25, -0.95))
    : isThreeQ
    ? solveArmAnalytical(new THREE.Vector3(0.85, 0.25, 0.42), new THREE.Vector3(-0.20, 0.35, -0.88))
    : solveArmAnalytical(new THREE.Vector3(0.85, 0.35, 0.40), new THREE.Vector3(-0.20, 0.45, -0.85));
  const armMerL = solveArmAnalytical(new THREE.Vector3(-0.20, -0.25, 0.45), new THREE.Vector3(-0.40, 0.70, 0.55));

  // ⑪ ボール放球 (Release: まさに指先からボールを離す瞬間！腕がピーンと100%完全伸展(flexDeg=0)！)
  // ※ 前足（左足）に100%体重が乗り、体幹が前足の上へ深く前傾（佐々木朗希・ダルビッシュフォーム完全準拠）！
  let armRelU = new THREE.Vector3(0.50, 0.84, 0.18); // OVERHAND_HIGH: 頭上やや右外側から振り下ろす正統派フォーム！
  let armRelV = armRelU.clone();
  let relPelvisPos = [0.0, 0.54, 1.22];
  let relPelvisRot: [number, number, number] = [24, -12, -2];
  let relSpineRot: [number, number, number] = [46, -14, -2]; // 深い体幹屈曲！前足の上に胸が深く乗る！
  let folPelvisPos = [0.0, 0.66, 1.28];
  let folPelvisRot: [number, number, number] = [28, -24, 4];
  let folSpineRot: [number, number, number] = [40, -22, 4];

  let armFolU = new THREE.Vector3(-0.65, -0.65, 0.40); // 左膝外側へダイナミックに巻きつく振り抜き！
  let armFolV = new THREE.Vector3(-0.50, -0.20, -0.80);

  if (isLow) {
    // OVERHAND_LOW: やや寝かせた高角度 (約+65°)
    armRelU = new THREE.Vector3(0.56, 0.78, 0.24);
    armRelV = armRelU.clone();
    relPelvisPos = [0.0, 0.54, 1.22];
    relSpineRot = [46, -14, -2];
  } else if (isThreeQ) {
    // THREE_QUARTERS: 正統派スリークォーター (約+45°斜め、2時方向)
    armRelU = new THREE.Vector3(0.65, 0.65, 0.35);
    armRelV = armRelU.clone();
    relPelvisPos = [0.0, 0.54, 1.22];
    relPelvisRot = [24, -12, -4];
    relSpineRot = [44, -12, -4];
    folPelvisPos = [0.0, 0.66, 1.28];
    folPelvisRot = [28, -24, -4];
    folSpineRot = [40, -22, -4];
  } else if (isSide) {
    // SIDEARM: サイドスロー
    armRelU = new THREE.Vector3(0.94, 0.34, 0.01);
    armRelV = armRelU.clone();
    armFolU = new THREE.Vector3(-0.75, 0.10, 0.65);
    armFolV = new THREE.Vector3(-0.60, 0.20, 0.75);
    relPelvisPos = [0.0, 0.58, 1.20];
    relPelvisRot = [22, -10, -6];
    relSpineRot = [38, -10, -6];
    folPelvisPos = [0.0, 0.66, 1.26];
    folPelvisRot = [26, -22, -6];
    folSpineRot = [36, -22, -6];
  } else if (isSub) {
    // SUBMARINE: アンダースロー
    armRelU = new THREE.Vector3(0.35, 0.48, 0.82);
    armRelV = armRelU.clone();
    armFolU = new THREE.Vector3(-0.45, 0.75, 0.45);
    armFolV = new THREE.Vector3(-0.35, 0.85, 0.35);
    relPelvisPos = [0.0, 0.36, 1.15];
    relPelvisRot = [24, -8, -34];
    relSpineRot = [36, -8, -36];
    folPelvisPos = [0.0, 0.58, 1.22];
    folPelvisRot = [20, -22, -8];
    folSpineRot = [32, -22, -8];
  }

  const armRelR = solveArmAnalytical(armRelU, armRelV);
  // グラブ腕（左腕）：胸元・左肋骨へぴったり引きつけ、体の回転軸を安定させる
  const armRelL = solveArmAnalytical(new THREE.Vector3(-0.30, -0.60, 0.50), new THREE.Vector3(-0.40, 0.70, 0.55));

  // ⑫ 減速・回内腕 (Deceleration)
  const armDecU = isSub
    ? new THREE.Vector3(-0.35, 0.45, 0.80)
    : isSide
    ? new THREE.Vector3(-0.65, 0.15, 0.72)
    : new THREE.Vector3(-0.40, -0.40, 0.50);
  const armDecV = isSub
    ? new THREE.Vector3(-0.25, 0.60, 0.70)
    : isSide
    ? new THREE.Vector3(-0.50, 0.25, 0.80)
    : new THREE.Vector3(-0.48, -0.05, -0.78);
  const armDecR = solveArmAnalytical(armDecU, armDecV);

  // ⑬ 腕の巻き込み腕
  const armWrapU = isSub
    ? new THREE.Vector3(-0.40, 0.60, 0.65)
    : isSide
    ? new THREE.Vector3(-0.70, 0.20, 0.68)
    : new THREE.Vector3(-0.55, -0.55, 0.45);
  const armWrapV = isSub
    ? new THREE.Vector3(-0.30, 0.70, 0.55)
    : isSide
    ? new THREE.Vector3(-0.55, 0.30, 0.75)
    : new THREE.Vector3(-0.50, -0.15, -0.80);
  const armWrapR = solveArmAnalytical(armWrapU, armWrapV);

  // ⑭ フォロースルー腕
  const armFolR = solveArmAnalytical(armFolU, armFolV);
  const armFolL = solveArmAnalytical(new THREE.Vector3(-0.25, -0.35, 0.40), new THREE.Vector3(-0.35, 0.70, 0.55));

  // ⑮ 守備復帰腕 (Fielding Recovery: 胸の前に両手を構える)
  const armRecR = solveArmAnalytical(new THREE.Vector3(0.20, -0.65, 0.45), new THREE.Vector3(-0.20, 0.50, 0.60));
  const armRecL = solveArmAnalytical(new THREE.Vector3(-0.20, -0.65, 0.45), new THREE.Vector3(0.20, 0.50, 0.60));

  // ① セット構え (t=0.00)：胸を一塁側(+X)に向けて左肩を本塁(+Z)へ向ける正統な構え(yaw = +78°)
  const p0: QuatBonePose = {
    pelvisPos: new THREE.Vector3(0.0, isSub ? 0.94 : 0.96, 0.0),
    pelvisQ: toQuatFromEuler([0, 78, 0]),
    spineQ: toQuatFromEuler([2, 0, 0]),
    rShoulderQ: armSetR.q,
    rElbowFlex: armSetR.flexDeg,
    lShoulderQ: armSetL.q,
    lElbowFlex: armSetL.flexDeg,
    rHipQ: toQuatFromEuler([0, 0, 2]),
    rKneeFlex: 4,
    rAnkleQ: toQuatFromEuler([0, 0, 0]),
    lHipQ: toQuatFromEuler([-6, 0, -4]),
    lKneeFlex: 8,
    lAnkleQ: toQuatFromEuler([0, 0, 0]),
    hasBall: true,
  };

  // ② 重心タメ始動 (t=0.08)：軸足（右足）に全重心を乗せ始め、左足の爪先が浮き始める
  const p1: QuatBonePose = {
    pelvisPos: new THREE.Vector3(0.0, isSub ? 0.93 : 0.95, 0.0),
    pelvisQ: toQuatFromEuler(isSub ? [2, 79, -2] : [0, 79, 0]),
    spineQ: toQuatFromEuler(isSub ? [2, 1, -2] : [3, 1, -1]),
    rShoulderQ: armSetR.q,
    rElbowFlex: armSetR.flexDeg,
    lShoulderQ: armSetL.q,
    lElbowFlex: armSetL.flexDeg,
    rHipQ: toQuatFromEuler([0, 0, 2]),
    rKneeFlex: 5,
    rAnkleQ: toQuatFromEuler([0, 0, 0]),
    lHipQ: toQuatFromEuler([-20, 0, -4]),
    lKneeFlex: 22,
    lAnkleQ: toQuatFromEuler([6, 0, 0]),
    hasBall: true,
  };

  // ③ 足上げ開始 (t=0.16)：左膝がスルスルと胸元へ持ち上がる
  const p2: QuatBonePose = {
    pelvisPos: new THREE.Vector3(0.0, isSub ? 0.93 : 0.95, 0.0),
    pelvisQ: toQuatFromEuler(isSub ? [3, 81, -4] : [0, 80, 0]),
    spineQ: toQuatFromEuler([4, 2, -2]),
    rShoulderQ: armSetR.q,
    rElbowFlex: armSetR.flexDeg,
    lShoulderQ: armSetL.q,
    lElbowFlex: armSetL.flexDeg,
    rHipQ: toQuatFromEuler([0, 0, 2]),
    rKneeFlex: 6,
    rAnkleQ: toQuatFromEuler([0, 0, 0]),
    lHipQ: toQuatFromEuler([-60, 4, -4]),
    lKneeFlex: 65,
    lAnkleQ: toQuatFromEuler([10, 0, 0]),
    hasBall: true,
  };

  // ④ 足上げ最高点 (t=0.24)：右足（軸足）でプレート上に直立し、前側にある左膝を胸元へ高く引き上げる
  const p3: QuatBonePose = {
    pelvisPos: new THREE.Vector3(0.0, isSub ? 0.94 : 0.96, 0.0),
    pelvisQ: toQuatFromEuler([0, isSide ? 85 : 80, 0]),
    spineQ: toQuatFromEuler([4, 4, -2]),
    rShoulderQ: armSetR.q,
    rElbowFlex: armSetR.flexDeg,
    lShoulderQ: armSetL.q,
    lElbowFlex: armSetL.flexDeg,
    rHipQ: toQuatFromEuler([0, 0, 2]),
    rKneeFlex: 6,
    rAnkleQ: toQuatFromEuler([0, 0, 0]),
    lHipQ: toQuatFromEuler([isHigh ? -115 : isSub ? -104 : isLow ? -80 : -88, 8, -6]),
    lKneeFlex: isHigh ? 115 : isSub ? 102 : isLow ? 88 : 92,
    lAnkleQ: toQuatFromEuler([15, 0, 0]),
    hasBall: true,
  };

  // ⑤ ヒップファースト初動 (t=0.32)：骨盤を左腰先行で本塁方向へ並進開始。腰が沈み込むが軸足はプレート上に固定！
  const p4: QuatBonePose = {
    pelvisPos: new THREE.Vector3(0.0, isSub ? 0.78 : isSide ? 0.84 : 0.90, isSub ? 0.22 : 0.18),
    pelvisQ: toQuatFromEuler(isSub ? [8, 72, -10] : isSide ? [6, 78, -4] : [2, 78, -2]),
    spineQ: toQuatFromEuler(isSub ? [10, 16, -10] : isSide ? [6, 12, -4] : [4, 8, -2]),
    rShoulderQ: armSetR.q,
    rElbowFlex: armSetR.flexDeg,
    lShoulderQ: armSetL.q,
    lElbowFlex: armSetL.flexDeg,
    rHipQ: toQuatFromEuler([15, 0, 8]),
    rKneeFlex: isSub ? 35 : 24,
    rAnkleQ: toQuatFromEuler([-8, 0, 0]),
    lHipQ: toQuatFromEuler([-75, 4, -8]),
    lKneeFlex: 70,
    lAnkleQ: toQuatFromEuler([10, 0, 0]),
    hasBall: true,
  };

  // ⑥ 並進沈み込み (t=0.38)：腰を深く落とし本塁へ直進、軸足のタメを最大化！
  const p5: QuatBonePose = {
    pelvisPos: new THREE.Vector3(0.0, isSub ? 0.64 : isSide ? 0.74 : 0.80, isSub ? 0.40 : 0.36),
    pelvisQ: toQuatFromEuler(isSub ? [12, 64, -18] : isSide ? [10, 72, -8] : [4, 72, -3]),
    spineQ: toQuatFromEuler(isSub ? [14, 18, -18] : isSide ? [8, 14, -8] : [6, 12, -3]),
    rShoulderQ: armSetR.q,
    rElbowFlex: armSetR.flexDeg,
    lShoulderQ: armSetL.q,
    lElbowFlex: armSetL.flexDeg,
    rHipQ: toQuatFromEuler([25, 0, 12]),
    rKneeFlex: isSub ? 52 : 38,
    rAnkleQ: toQuatFromEuler([-14, 0, 0]),
    lHipQ: toQuatFromEuler([-60, 2, -8]),
    lKneeFlex: 45,
    lAnkleQ: toQuatFromEuler([10, 0, 0]),
    hasBall: true,
  };

  // ⑦ 腕の割れ・テイクバック (t=0.45)：腰がさらに本塁へ直進、軸足は強く地面を押す。右腕は円弧状テイクバック
  const p6: QuatBonePose = {
    pelvisPos: new THREE.Vector3(0.0, isSub ? 0.52 : isSide ? 0.68 : 0.72, isSub ? 0.62 : 0.58),
    pelvisQ: toQuatFromEuler(isSub ? [16, 52, -24] : isSide ? [14, 64, -12] : [6, 64, -4]),
    spineQ: toQuatFromEuler(isSub ? [16, 20, -24] : isSide ? [12, 18, -12] : [8, 18, -4]),
    rShoulderQ: isSub ? armGlideSubR.q : armGlideR.q,
    rElbowFlex: isSub ? armGlideSubR.flexDeg : armGlideR.flexDeg,
    lShoulderQ: armGlideL.q,
    lElbowFlex: armGlideL.flexDeg,
    rHipQ: toQuatFromEuler([38, 0, 16]),
    rKneeFlex: isSub ? 72 : 54,
    rAnkleQ: toQuatFromEuler([-22, 0, 0]),
    lHipQ: toQuatFromEuler([-46, 0, -10]),
    lKneeFlex: 22,
    lAnkleQ: toQuatFromEuler([12, 0, 0]),
    hasBall: true,
  };

  // ⑧ 踏み出し足着地 (t=0.52)：左足がマウンドに力強く着地（ステップ幅1.58mへ前進）、軸足はプレートに完全固定
  const p7: QuatBonePose = {
    pelvisPos: new THREE.Vector3(0.0, isSub ? 0.44 : 0.60, isSub ? 0.82 : 0.82),
    pelvisQ: toQuatFromEuler(isSub ? [20, 32, -30] : isSide ? [14, 36, -8] : [10, 35, 4]),
    spineQ: toQuatFromEuler(isSub ? [18, 20, -32] : isSide ? [14, 30, -8] : [12, 28, 4]),
    rShoulderQ: armTopR.q,
    rElbowFlex: armTopR.flexDeg,
    lShoulderQ: armTopL.q,
    lElbowFlex: armTopL.flexDeg,
    rHipQ: toQuatFromEuler([50, 0, 15]),
    rKneeFlex: isSub ? 86 : isSide ? 54 : 40,
    rAnkleQ: toQuatFromEuler([-30, 0, 0]),
    lHipQ: toQuatFromEuler(isSub ? [-46, 0, -6] : [-50, 0, -6]),
    lKneeFlex: isSub ? 62 : isSide ? 66 : 50,
    lAnkleQ: toQuatFromEuler([10, 0, 0]),
    hasBall: true,
  };

  // ⑨ パワーL字トップ形成 (t=0.58)：骨盤が回転を開始し前足へ体重が乗り始め、右腕が直角のトップを形成
  const p8: QuatBonePose = {
    pelvisPos: new THREE.Vector3(0.0, isSub ? 0.40 : 0.58, isSub ? 0.98 : 0.98),
    pelvisQ: toQuatFromEuler(isSub ? [22, 16, -32] : isSide ? [16, 18, -6] : [12, 18, 4]),
    spineQ: toQuatFromEuler(isSub ? [24, 12, -34] : isSide ? [18, 14, -6] : [20, 14, 2]),
    rShoulderQ: armTopR.q,
    rElbowFlex: armTopR.flexDeg,
    lShoulderQ: armTopL.q,
    lElbowFlex: armTopL.flexDeg,
    rHipQ: toQuatFromEuler([51, 0, 14]),
    rKneeFlex: isSub ? 94 : isSide ? 62 : 42,
    rAnkleQ: toQuatFromEuler([-35, 0, 0]),
    lHipQ: toQuatFromEuler(isSub ? [-47, 0, -5] : [-48, 0, -5]),
    lKneeFlex: isSub ? 63 : isSide ? 68 : 48,
    lAnkleQ: toQuatFromEuler([8, 0, 0]),
    hasBall: true,
  };

  // ⑩ 最大外旋 MER (t=0.63)：腰と胸が本塁へ一気に開き、肘が先行して前腕が大きくしなる（体重が前足へ力強く移動！）
  const p9: QuatBonePose = {
    pelvisPos: new THREE.Vector3(0.0, isSub ? 0.38 : 0.56, isSub ? 1.12 : 1.12),
    pelvisQ: toQuatFromEuler(isSub ? [22, 0, -34] : isSide ? [16, 0, -6] : [14, 0, 4]),
    spineQ: toQuatFromEuler(isSub ? [28, -4, -36] : isSide ? [26, -5, -6] : [30, -6, 2]),
    rShoulderQ: armMerR.q,
    rElbowFlex: armMerR.flexDeg,
    lShoulderQ: armMerL.q,
    lElbowFlex: armMerL.flexDeg,
    rHipQ: toQuatFromEuler([52, 0, 14]),
    rKneeFlex: isSub ? 98 : isSide ? 70 : 45,
    rAnkleQ: toQuatFromEuler([-40, 0, 0]),
    lHipQ: toQuatFromEuler(isSub ? [-48, 0, -4] : [-46, 0, -4]),
    lKneeFlex: isSub ? 64 : isSide ? 70 : 46,
    lAnkleQ: toQuatFromEuler([4, 0, 0]),
    hasBall: true,
  };

  // ⑪ ボール放球 (t=0.68)：まさにボールを離す瞬間！前足（左足）に100%体重が乗り、胸が前足膝上に深く乗る！
  const p10: QuatBonePose = {
    pelvisPos: new THREE.Vector3(relPelvisPos[0], relPelvisPos[1], relPelvisPos[2]),
    pelvisQ: toQuatFromEuler(relPelvisRot),
    spineQ: toQuatFromEuler(relSpineRot),
    rShoulderQ: armRelR.q,
    rElbowFlex: armRelR.flexDeg, // 0° flex = 完全伸展！
    lShoulderQ: armRelL.q,
    lElbowFlex: armRelL.flexDeg,
    rHipQ: toQuatFromEuler([50, 0, 10]),
    rKneeFlex: isSub ? 96 : isSide ? 72 : 50,
    rAnkleQ: toQuatFromEuler([-45, 0, 0]),
    lHipQ: toQuatFromEuler(isSub ? [-44, 0, -2] : [-42, 0, -2]),
    lKneeFlex: isSub ? 58 : isSide ? 68 : 38,
    lAnkleQ: toQuatFromEuler([0, 0, 0]),
    hasBall: true,
  };

  // ⑫ 減速・回内 (t=0.74)：球を放した直後、右腕が左膝外側へダイナミックに巻きつき、体幹がさらに深く前傾（52度）
  const p11: QuatBonePose = {
    pelvisPos: new THREE.Vector3(0.0, isSub ? 0.44 : 0.56, isSub ? 1.20 : 1.26),
    pelvisQ: toQuatFromEuler(isSub ? [22, -18, -20] : isSide ? [20, -18, -6] : [28, -20, 2]),
    spineQ: toQuatFromEuler(isSub ? [34, -18, -20] : isSide ? [36, -18, -6] : [52, -20, 0]),
    rShoulderQ: armDecR.q,
    rElbowFlex: armDecR.flexDeg,
    lShoulderQ: armFolL.q,
    lElbowFlex: armFolL.flexDeg,
    rHipQ: toQuatFromEuler([58, 6, 8]),
    rKneeFlex: isSub ? 70 : 66,
    rAnkleQ: toQuatFromEuler([-40, 0, 0]),
    lHipQ: toQuatFromEuler([-40, 0, -1]),
    lKneeFlex: isSub ? 50 : 34,
    lAnkleQ: toQuatFromEuler([0, 0, 0]),
    hasBall: false,
  };

  // ⑬ 腕の巻き込み (t=0.80)：左膝外側へ腕が巻きつき、軸足がフワッと浮き上がる
  const p12: QuatBonePose = {
    pelvisPos: new THREE.Vector3(0.0, isSub ? 0.54 : 0.60, isSub ? 1.22 : 1.28),
    pelvisQ: toQuatFromEuler(isSub ? [20, -22, -14] : isSide ? [24, -22, -6] : [32, -24, 4]),
    spineQ: toQuatFromEuler(isSub ? [32, -22, -14] : isSide ? [34, -22, -6] : [48, -24, 2]),
    rShoulderQ: armWrapR.q,
    rElbowFlex: armWrapR.flexDeg,
    lShoulderQ: armFolL.q,
    lElbowFlex: armFolL.flexDeg,
    rHipQ: toQuatFromEuler(isSub ? [64, 8, 7] : [64, 8, 7]),
    rKneeFlex: isSub ? 68 : 74,
    rAnkleQ: toQuatFromEuler([-38, 0, 0]),
    lHipQ: toQuatFromEuler([-39, 0, 0]),
    lKneeFlex: 32,
    lAnkleQ: toQuatFromEuler([0, 0, 0]),
    hasBall: false,
  };

  // ⑭ フォロースルー (t=0.88)：右腕が振り抜かれ、軸足（右足）が高く跳ね上がって靴底がカメラを向く！
  const p13: QuatBonePose = {
    pelvisPos: new THREE.Vector3(folPelvisPos[0], folPelvisPos[1], folPelvisPos[2]),
    pelvisQ: toQuatFromEuler(folPelvisRot),
    spineQ: toQuatFromEuler(folSpineRot),
    rShoulderQ: armFolR.q,
    rElbowFlex: armFolR.flexDeg,
    lShoulderQ: armFolL.q,
    lElbowFlex: armFolL.flexDeg,
    rHipQ: toQuatFromEuler(isSub ? [62, 10, 6] : [68, 10, 6]),
    rKneeFlex: isSub ? 66 : 70,
    rAnkleQ: toQuatFromEuler([-35, 0, 0]),
    lHipQ: toQuatFromEuler([-38, 0, 0]),
    lKneeFlex: 30,
    lAnkleQ: toQuatFromEuler([0, 0, 0]),
    hasBall: false,
  };

  // ⑮ フィニッシュ (t=1.00)：守備姿勢へ正対、両足を着地し捕球体勢へ
  const p14: QuatBonePose = {
    pelvisPos: new THREE.Vector3(0.0, isSub ? 0.84 : isSide ? 0.80 : 0.86, 1.16),
    pelvisQ: toQuatFromEuler([10, -5, 0]),
    spineQ: toQuatFromEuler([8, -5, 0]),
    rShoulderQ: armRecR.q,
    rElbowFlex: armRecR.flexDeg,
    lShoulderQ: armRecL.q,
    lElbowFlex: armRecL.flexDeg,
    rHipQ: toQuatFromEuler([-16, 0, 4]),
    rKneeFlex: 20,
    rAnkleQ: toQuatFromEuler([0, 0, 0]),
    lHipQ: toQuatFromEuler([-18, 0, -4]),
    lKneeFlex: 22,
    lAnkleQ: toQuatFromEuler([0, 0, 0]),
    hasBall: false,
  };

  return { times, poses: [p0, p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12, p13, p14] };
}

export function createAnimatedPitcher(options: PlayerStyleOptions): AnimatedPitcher3D {
  return create3DPitcherRig(options);
}

export function create3DPitcherRig(options: PlayerStyleOptions): AnimatedPitcher3D {
  const rootGroup = new THREE.Group();
  let curCapColor = options.capColor;
  let curShirtColor = options.shirtColor ?? 0xf8fafc;
  let curPantsColor = options.pantsColor ?? 0xf8fafc;
  let curUndershirtColor = options.undershirtColor ?? curCapColor;
  let curAccentColor = options.accentColor ?? curCapColor;
  let curJerseyNumber = options.jerseyNumber ?? 1;
  let curUniformPattern: 'NORMAL' | 'PINSTRIPE' | 'ACCENT_LINE' =
    options.uniformPattern ?? 'ACCENT_LINE';

  let currentForm: PitchingFormType = options.pitchingForm || 'OVERHAND_HIGH';
  let currentThrows: 'R' | 'L' = options.throws || 'R';
  let lastProgress = 0.0;
  let formMods: CustomFormModifiers = {
    legLiftMod: 0,
    pelvisDropMod: 0,
    armSlotModDeg: 0,
    torsoTiltModDeg: 0,
  };

  const capHex = numToHex(curCapColor);
  const shirtHex = numToHex(curShirtColor);
  const pantsHex = numToHex(curPantsColor);
  const underHex = numToHex(curUndershirtColor);
  const lineHex = numToHex(curAccentColor);

  const headTex = createAnimeHeadTexture('#f1c29b', '#1c1917');
  let torsoTexRight = createJerseyTorsoTexture(shirtHex, lineHex, curUniformPattern, curJerseyNumber, false, false);
  let torsoTexLeft = createJerseyTorsoTexture(shirtHex, lineHex, curUniformPattern, curJerseyNumber, false, true);
  let sleeveTex = createSleeveTexture(shirtHex, lineHex, curUniformPattern);
  let pantsTex = createPantsTexture(pantsHex, lineHex, curUniformPattern);
  let socksTex = createSocksTexture(underHex, shirtHex);

  const capMat = createAnimeCelMaterial({ color: capHex });
  const underMat = createAnimeCelMaterial({ color: underHex });
  const pantsMat = createAnimeCelMaterial({ color: 0xffffff, map: pantsTex });
  const shirtPlainMat = createAnimeCelMaterial({ color: 0xffffff, map: sleeveTex });
  const torsoMat = createAnimeCelMaterial({ color: 0xffffff, map: currentThrows === 'L' ? torsoTexLeft : torsoTexRight });
  const socksMat = createAnimeCelMaterial({ color: 0xffffff, map: socksTex });
  const headMat = createAnimeCelMaterial({
    color: 0xffffff,
    map: headTex,
    shadowTint: new THREE.Vector3(0.82, 0.72, 0.68),
  });
  const skinMat = createAnimeCelMaterial({
    color: '#f1c29b',
    shadowTint: new THREE.Vector3(0.82, 0.72, 0.68),
  });
  const beltMat = createAnimeCelMaterial({ color: '#18181b' });
  const gloveMat = createAnimeCelMaterial({ color: '#854d0e' });
  const cleatMat = createAnimeCelMaterial({ color: '#0f172a' });
  const whiteMat = createAnimeCelMaterial({ color: '#ffffff' });

  // -------------------------------------------------------------------------
  // 骨格ボーン階層（Hierarchy）の構築（関節球補間により継ぎ目のない2Dセルアニメ造形）
  // -------------------------------------------------------------------------
  const rigRoot = new THREE.Group();
  rootGroup.add(rigRoot);

  // マウンド上の落ち影（足元に追従）
  const shadowMesh = new THREE.Mesh(
    new THREE.CircleGeometry(0.44, 32),
    new THREE.MeshBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.36 }),
  );
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.set(0, 0.02, 0);
  rigRoot.add(shadowMesh);

  // 1. PelvisBone（骨盤・腰・ベルト：アスリートの引き締まった腰回り）
  const pelvisBone = new THREE.Group();
  rigRoot.add(pelvisBone);

  const pelvisGeo = new THREE.CylinderGeometry(0.140, 0.124, 0.18, 32);
  pelvisGeo.scale(1.10, 1.0, 0.84);
  const pelvisMesh = createCelMesh(pelvisGeo, pantsMat, 1.055);
  pelvisMesh.position.set(0, 0.0, 0);
  pelvisBone.add(pelvisMesh);

  // 黒革ベルト＋金色バックル（正面 +Z）
  const beltGeo = new THREE.CylinderGeometry(0.144, 0.144, 0.042, 32);
  beltGeo.scale(1.10, 1.0, 0.85);
  const beltMesh = createCelMesh(beltGeo, beltMat, 1.04);
  beltMesh.position.set(0, 0.082, 0);
  pelvisBone.add(beltMesh);

  // 2. SpineBone（逆三角形のアスリート体型上体・背番号キャンバス）
  const spineBone = new THREE.Group();
  spineBone.position.set(0, 0.09, 0);
  pelvisBone.add(spineBone);

  // CylinderGeometry はデフォルトで u = 0.5 (x = 256) が -Z（背面＝センターカメラ側）を向く！
  // ※ 32分割で滑らかにし、角張りを一掃
  const torsoGeo = new THREE.CylinderGeometry(0.165, 0.130, 0.44, 32);
  torsoGeo.scale(1.12, 1.0, 0.76);
  const torsoMesh = createCelMesh(torsoGeo, torsoMat, 1.055);
  torsoMesh.position.set(0, 0.225, 0);
  spineBone.add(torsoMesh);

  // 肩の丸み（ラグランショルダーのなだらかなライン：右 +X, 左 -X）
  const shoulderCapGeo = new THREE.SphereGeometry(0.062, 24, 20);
  const rShoulderCap = createCelMesh(shoulderCapGeo, shirtPlainMat, 1.05);
  rShoulderCap.position.set(0.160, 0.385, 0);
  const lShoulderCap = createCelMesh(shoulderCapGeo, shirtPlainMat, 1.05);
  lShoulderCap.position.set(-0.160, 0.385, 0);
  spineBone.add(rShoulderCap, lShoulderCap);

  // アンダーシャツのハイネック襟元
  const collarGeo = new THREE.CylinderGeometry(0.068, 0.076, 0.052, 32);
  const collarMesh = createCelMesh(collarGeo, underMat, 1.055);
  collarMesh.position.set(0, 0.44, 0);
  spineBone.add(collarMesh);

  // 3. Neck & HeadBone（2Dアニメ顔＆刈り上げ髪テクスチャ ＋ 野球帽 — 常に捕手へ LookAt ロック！）
  const neckBone = new THREE.Group();
  neckBone.position.set(0, 0.45, 0);
  spineBone.add(neckBone);

  const neckGeo = new THREE.CylinderGeometry(0.054, 0.060, 0.085, 24);
  const neckMesh = createCelMesh(neckGeo, skinMat, 1.06);
  neckMesh.position.set(0, 0.035, 0);
  neckBone.add(neckMesh);

  const headBone = new THREE.Group();
  headBone.position.set(0, 0.08, 0);
  neckBone.add(headBone);

  // 頭部（SphereGeometry は rotateY(-Math.PI/2) で u=0.5 が +Z 正面＝顔になる）
  const headGeo = new THREE.SphereGeometry(0.108, 28, 24);
  headGeo.rotateY(-Math.PI / 2);
  headGeo.scale(0.94, 1.07, 0.98);
  const headMesh = createCelMesh(headGeo, headMat, 1.06);
  headMesh.position.set(0, 0.062, 0);
  headBone.add(headMesh);

  // 両耳
  const earGeo = new THREE.SphereGeometry(0.024, 12, 12);
  earGeo.scale(0.55, 1.12, 0.8);
  const lEar = createCelMesh(earGeo, skinMat, 1.07);
  lEar.position.set(-0.098, 0.056, 0);
  const rEar = createCelMesh(earGeo, skinMat, 1.07);
  rEar.position.set(0.098, 0.056, 0);
  headBone.add(lEar, rEar);

  // 野球帽ドーム
  const capDomeGeo = new THREE.SphereGeometry(0.116, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.56);
  capDomeGeo.scale(0.96, 0.96, 1.04);
  const capDome = createCelMesh(capDomeGeo, capMat, 1.06);
  capDome.position.set(0, 0.084, 0);
  headBone.add(capDome);

  // 野球帽のツバ（正面 +Z 方向＝キャッチャー方向へシャープに突き出す）
  const visorGeo = new THREE.CylinderGeometry(0.110, 0.110, 0.016, 24, 1, false, -Math.PI * 0.42, Math.PI * 0.84);
  visorGeo.scale(0.94, 1.0, 1.38);
  const visorMesh = createCelMesh(visorGeo, capMat, 1.06);
  visorMesh.position.set(0, 0.082, 0.058);
  visorMesh.rotation.x = 0.14;
  headBone.add(visorMesh);

  // 4. 右腕（投球腕：右側 +X = +0.160、Shoulder_R -> Elbow_R -> Wrist_R + BallInHand）
  const rShoulderBone = new THREE.Group();
  rShoulderBone.position.set(0.160, 0.38, 0);
  spineBone.add(rShoulderBone);

  // ユニフォーム半袖（右上腕：筋肉の丸みを持つなだらかなテーパー造形）
  const sleeveGeo = new THREE.CylinderGeometry(0.052, 0.048, 0.23, 32, 1, true);
  const rSleeve = createCelMesh(sleeveGeo, shirtPlainMat, 1.06);
  rSleeve.position.set(0, -0.11, 0);
  rShoulderBone.add(rSleeve);

  const rElbowBone = new THREE.Group();
  rElbowBone.position.set(0, -0.225, 0);
  rShoulderBone.add(rElbowBone);

  // 肘関節球（曲げた時の隙間を完全に埋める）
  const elbowJointGeo = new THREE.SphereGeometry(0.042, 20, 16);
  const rElbowJoint = createCelMesh(elbowJointGeo, underMat, 1.05);
  rElbowBone.add(rElbowJoint);

  // アンダーシャツ長袖（右前腕：手首にかけて自然に絞り込まれる筋肉造形）
  const forearmGeo = new THREE.CylinderGeometry(0.044, 0.034, 0.24, 32, 1, true);
  const rForearm = createCelMesh(forearmGeo, underMat, 1.06);
  rForearm.position.set(0, -0.12, 0);
  rElbowBone.add(rForearm);

  const rWristBone = new THREE.Group();
  rWristBone.position.set(0, -0.24, 0);
  rElbowBone.add(rWristBone);

  const handGeo = new THREE.SphereGeometry(0.038, 16, 14);
  const rHand = createCelMesh(handGeo, skinMat, 1.065);
  rWristBone.add(rHand);

  const handBallMesh = createCelMesh(new THREE.SphereGeometry(0.039, 16, 14), whiteMat, 1.08);
  handBallMesh.position.set(0, -0.025, 0.026);
  rWristBone.add(handBallMesh);

  // 5. 左腕（グラブ腕：左側 -X = -0.160、Shoulder_L -> Elbow_L -> Wrist_L + FieldingGlove）
  const lShoulderBone = new THREE.Group();
  lShoulderBone.position.set(-0.160, 0.38, 0);
  spineBone.add(lShoulderBone);

  const lSleeve = createCelMesh(sleeveGeo, shirtPlainMat, 1.06);
  lSleeve.position.set(0, -0.11, 0);
  lShoulderBone.add(lSleeve);

  const lElbowBone = new THREE.Group();
  lElbowBone.position.set(0, -0.225, 0);
  lShoulderBone.add(lElbowBone);

  const lElbowJoint = createCelMesh(elbowJointGeo, underMat, 1.05);
  lElbowBone.add(lElbowJoint);

  const lForearm = createCelMesh(forearmGeo, underMat, 1.06);
  lForearm.position.set(0, -0.12, 0);
  lElbowBone.add(lForearm);

  const lWristBone = new THREE.Group();
  lWristBone.position.set(0, -0.24, 0);
  lElbowBone.add(lWristBone);

  // 立体的な茶革グローブ（親指・ウェブ・ポケット造形）
  const gloveGroup = new THREE.Group();
  const glovePalmGeo = new THREE.SphereGeometry(0.078, 20, 18);
  glovePalmGeo.scale(0.92, 1.20, 0.65);
  const glovePalm = createCelMesh(glovePalmGeo, gloveMat, 1.07);
  glovePalm.position.set(0, -0.045, 0.02);
  gloveGroup.add(glovePalm);

  const gloveThumbGeo = new THREE.CylinderGeometry(0.022, 0.028, 0.09, 16);
  const gloveThumb = createCelMesh(gloveThumbGeo, gloveMat, 1.07);
  gloveThumb.position.set(0.045, -0.035, 0.04);
  gloveThumb.rotation.z = 0.35;
  gloveGroup.add(gloveThumb);
  lWristBone.add(gloveGroup);

  // 6. 両脚（引き締まった太もも＋膝球＋野球パンツの自然なブラウジング＋2本ラインソックス＋黒スパイク）
  const hipJointGeo = new THREE.SphereGeometry(0.078, 20, 18);
  const thighGeo = new THREE.CylinderGeometry(0.088, 0.066, 0.42, 32, 1, true);
  const kneeJointGeo = new THREE.SphereGeometry(0.066, 20, 16);
  // 膝下のダボっとした野球パンツのブラウジング形状
  const upperCalfGeo = new THREE.CylinderGeometry(0.072, 0.056, 0.20, 32, 1, true);
  const sockGeo = new THREE.CylinderGeometry(0.048, 0.035, 0.24, 32, 1, true);
  // スパイク（つま先・甲・かかとが流線型の本格野球スパイク造形）
  const cleatCyl = new THREE.CylinderGeometry(0.038, 0.046, 0.22, 32);
  cleatCyl.rotateX(Math.PI / 2);
  cleatCyl.scale(1.0, 0.60, 1.0);
  const shoeGeo = cleatCyl;

  function buildLegHierarchy(hipX: number) {
    const hipBone = new THREE.Group();
    hipBone.position.set(hipX, -0.04, 0);
    pelvisBone.add(hipBone);

    const hipJoint = createCelMesh(hipJointGeo, pantsMat, 1.05);
    hipBone.add(hipJoint);

    const thighMesh = createCelMesh(thighGeo, pantsMat, 1.06);
    thighMesh.position.set(0, -0.22, 0);
    thighMesh.scale.set(1.0, 1.12, 1.0);
    hipBone.add(thighMesh);

    const kneeBone = new THREE.Group();
    kneeBone.position.set(0, -0.46, 0);
    hipBone.add(kneeBone);

    const kneeJoint = createCelMesh(kneeJointGeo, pantsMat, 1.05);
    kneeBone.add(kneeJoint);

    // パンツの膝下ブラウジング部分
    const calfPants = createCelMesh(upperCalfGeo, pantsMat, 1.06);
    calfPants.position.set(0, -0.105, 0);
    kneeBone.add(calfPants);

    // ストッキング（高校野球の2本ライン入りソックス）
    const sockMesh = createCelMesh(sockGeo, socksMat, 1.06);
    sockMesh.position.set(0, -0.29, 0);
    sockMesh.scale.set(1.0, 1.12, 1.0);
    kneeBone.add(sockMesh);

    const ankleBone = new THREE.Group();
    ankleBone.position.set(0, -0.44, 0);
    kneeBone.add(ankleBone);

    const footMesh = createCelMesh(shoeGeo, cleatMat, 1.065);
    footMesh.position.set(0, -0.025, 0.045);
    ankleBone.add(footMesh);

    // スパイク側面の白いアニメ調ライン＆靴底スタッド表現
    const stripeGeo = new THREE.BoxGeometry(0.102, 0.016, 0.11);
    const stripeMesh = new THREE.Mesh(stripeGeo, whiteMat);
    stripeMesh.position.set(0, -0.02, 0.04);
    ankleBone.add(stripeMesh);

    return { hipBone, kneeBone, ankleBone };
  }

  // 右足（軸足：+X = +0.084）、左足（踏み出し足：-X = -0.084）
  const rLeg = buildLegHierarchy(0.084);
  const lLeg = buildLegHierarchy(-0.084);

  // -------------------------------------------------------------------------
  // ボーン姿勢の適用（連続補間 ＋ 首の捕手ミット LookAt ロック ＋ 左投げミラー対応）
  // -------------------------------------------------------------------------
  const catcherLookTarget = new THREE.Vector3();

  function applyPhase(progress: number) {
    const clamped = Math.max(0, Math.min(1, progress));
    lastProgress = clamped;
    const { times, poses } = getFormTimeline(currentForm);

    let idx = 0;
    while (idx < times.length - 2 && clamped > times[idx + 1]) {
      idx++;
    }
    const t0 = times[idx];
    const t1 = times[idx + 1];
    const localT = t1 > t0 ? (clamped - t0) / (t1 - t0) : 0;

    const pose = interpolateQuatPoses(poses[idx], poses[idx + 1], localT);

    // フォームエディタ微調整パラメータの反映
    const liftWeight = Math.max(0, 1 - Math.abs(clamped - 0.18) / 0.18);
    const releaseWeight = Math.max(0, 1 - Math.abs(clamped - 0.58) / 0.22);

    const effLegMod =
      formMods.legLiftHeight !== undefined ? formMods.legLiftHeight - 1.0 : formMods.legLiftMod || 0;
    const effSinkMod =
      formMods.pelvisSinkDepth !== undefined ? -(formMods.pelvisSinkDepth - 1.0) : formMods.pelvisDropMod || 0;
    const effArmDeg =
      formMods.armSlotOffsetDeg !== undefined ? formMods.armSlotOffsetDeg : formMods.armSlotModDeg || 0;
    const effTiltDeg =
      formMods.torsoTiltOffsetDeg !== undefined ? formMods.torsoTiltOffsetDeg : formMods.torsoTiltModDeg || 0;

    // 左投げ（throws === 'L'）の場合は rigRoot.scale.x = -1 で骨格全体を左右反転し、
    // 背番号テクスチャはあらかじめ文字を反転描画した torsoTexLeft を適用することで
    // 背番号は絶対に鏡文字にならず、常に正しい向きでくっきり表示！
    const isLefty = currentThrows === 'L';
    rigRoot.scale.x = isLefty ? -1 : 1;
    torsoMat.uniforms.uMap.value = isLefty ? torsoTexLeft : torsoTexRight;

    // 骨盤の位置とクォータニオン回転
    const pelvisY = pose.pelvisPos.y + effSinkMod * 0.25 * releaseWeight;
    pelvisBone.position.set(pose.pelvisPos.x, pelvisY, pose.pelvisPos.z);
    pelvisBone.quaternion.copy(pose.pelvisQ);

    // 足元の影を追従
    shadowMesh.position.set(pose.pelvisPos.x, 0.02, pose.pelvisPos.z);

    // 背骨（上体）のクォータニオン回転
    spineBone.quaternion.copy(pose.spineQ);
    if (Math.abs(effTiltDeg) > 0.01) {
      const tiltQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), effTiltDeg * DEG * releaseWeight);
      spineBone.quaternion.multiply(tiltQ);
    }

    // 右腕（投球腕）
    rShoulderBone.quaternion.copy(pose.rShoulderQ);
    if (Math.abs(effArmDeg) > 0.01) {
      const armSlotQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -effArmDeg * DEG * releaseWeight);
      rShoulderBone.quaternion.multiply(armSlotQ);
    }
    rElbowBone.rotation.set(pose.rElbowFlex * DEG, 0, 0);
    handBallMesh.visible = pose.hasBall;

    // 左腕（グラブ腕）
    lShoulderBone.quaternion.copy(pose.lShoulderQ);
    lElbowBone.rotation.set(pose.lElbowFlex * DEG, 0, 0);

    // 右脚（軸足：プレートを踏む足）
    // 【ユーザー最重要要望：放球(t=0.68)まで軸足は絶対に蹴り上げない！】
    // 全フォーム共通で放球の瞬間(t=0.68)まで軸足スパイクはプレートまたはマウンド地面(Y=0.08m)に100%完全接地！
    // 足を空中に蹴り上げるのは放球後（t > 0.68 のフォロースルー期間）のみ！
    const isSub = currentForm === 'SUBMARINE';
    const isSide = currentForm === 'SIDEARM';
    const pinEndT = 0.68; // 全フォーム共通！放球まで地面に完全密着！
    const blendEndT = 0.88; // 放球後(0.68 -> 0.88)にかけて初めてダイナミックに空中へ跳ね上がる！

    if (clamped <= pinEndT) {
      const pinned = solvePivotLegPinning(
        new THREE.Vector3(0.084, -0.04, 0),
        pelvisBone.position,
        pelvisBone.quaternion,
        0.46,
        0.44,
        isSub,
      );
      rLeg.hipBone.quaternion.copy(pinned.hipQ);
      rLeg.kneeBone.rotation.set(pinned.kneeFlex * DEG, 0, 0);
      rLeg.ankleBone.quaternion.copy(pinned.ankleQ);
    } else if (clamped <= blendEndT) {
      const pinned = solvePivotLegPinning(
        new THREE.Vector3(0.084, -0.04, 0),
        pelvisBone.position,
        pelvisBone.quaternion,
        0.46,
        0.44,
        isSub,
      );
      const rawW = (clamped - pinEndT) / (blendEndT - pinEndT);
      const w = rawW * rawW * (3 - 2 * rawW);
      rLeg.hipBone.quaternion.copy(pinned.hipQ.slerp(pose.rHipQ, w));
      rLeg.kneeBone.rotation.set((pinned.kneeFlex + (pose.rKneeFlex - pinned.kneeFlex) * w) * DEG, 0, 0);
      rLeg.ankleBone.quaternion.copy(pinned.ankleQ.slerp(pose.rAnkleQ, w));
    } else {
      rLeg.hipBone.quaternion.copy(pose.rHipQ);
      rLeg.kneeBone.rotation.set(pose.rKneeFlex * DEG, 0, 0);
      rLeg.ankleBone.quaternion.copy(pose.rAnkleQ);
    }

    // 左脚（踏み出し足）：着地(t >= 0.52)後はマウンドにガッチリ固定し、後退やめり込み・不自然な歪みを100%防止！
    // 【ユーザー指摘対応】：ステップ幅をプロ・高校野球標準の6〜7歩分（約1.58m）へ拡大！
    if (clamped >= 0.52 && clamped <= 0.88) {
      const targetLFoot = isSub
        ? new THREE.Vector3(-0.12, 0.08, 1.55)
        : isSide
        ? new THREE.Vector3(-0.10, 0.08, 1.55)
        : new THREE.Vector3(-0.08, 0.08, 1.58);
      const planted = solveLeftStrideGroundContact(
        new THREE.Vector3(-0.084, -0.04, 0),
        pelvisBone.position,
        pelvisBone.quaternion,
        targetLFoot,
        0.46,
        0.44,
        isSub,
      );
      lLeg.hipBone.quaternion.copy(planted.hipQ);
      lLeg.kneeBone.rotation.set(planted.kneeFlex * DEG, 0, 0);
      lLeg.ankleBone.quaternion.copy(planted.ankleQ);
    } else if (clamped > 0.88 && clamped <= 1.00) {
      const targetLFoot = isSub
        ? new THREE.Vector3(-0.12, 0.08, 1.55)
        : isSide
        ? new THREE.Vector3(-0.10, 0.08, 1.55)
        : new THREE.Vector3(-0.08, 0.08, 1.58);
      const planted = solveLeftStrideGroundContact(
        new THREE.Vector3(-0.084, -0.04, 0),
        pelvisBone.position,
        pelvisBone.quaternion,
        targetLFoot,
        0.46,
        0.44,
        isSub,
      );
      const rawW = (clamped - 0.88) / 0.12;
      const w = rawW * rawW * (3 - 2 * rawW);
      lLeg.hipBone.quaternion.copy(planted.hipQ.slerp(pose.lHipQ, w));
      lLeg.kneeBone.rotation.set((planted.kneeFlex + (pose.lKneeFlex - planted.kneeFlex) * w) * DEG, 0, 0);
      lLeg.ankleBone.quaternion.copy(planted.ankleQ.slerp(pose.lAnkleQ, w));
    } else {
      lLeg.hipBone.quaternion.copy(pose.lHipQ);
      if (liftWeight > 0.01 && Math.abs(effLegMod) > 0.01) {
        const liftQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -effLegMod * 45 * DEG * liftWeight);
        lLeg.hipBone.quaternion.multiply(liftQ);
      }
      lLeg.kneeBone.rotation.set(pose.lKneeFlex * DEG, 0, 0);
      lLeg.ankleBone.quaternion.copy(pose.lAnkleQ);
    }

    // 【超重要】首・頭部ボーンの「常にキャッチャーミットを見る（Head LookAt）」制約！
    // アンダースローで上体が深く前傾しようが、サイドスローで背中をひねろうが、
    // 顔と帽子のツバは常に本塁（ワールド座標 (0, 1.15, 1.2)）を真っ直ぐ見据える！
    rootGroup.updateMatrixWorld(true);
    catcherLookTarget.set(0, 1.15, 1.2);
    headBone.lookAt(catcherLookTarget);
  }

  /**
   * ユニフォーム色・デザインパターン（無地/縦じま/中央ライン）・背番号の動的リアルタイム更新
   */
  function updateUniform(opts: Partial<PlayerStyleOptions>) {
    if (opts.capColor !== undefined) curCapColor = opts.capColor;
    if (opts.shirtColor !== undefined) curShirtColor = opts.shirtColor;
    if (opts.pantsColor !== undefined) curPantsColor = opts.pantsColor;
    if (opts.undershirtColor !== undefined) curUndershirtColor = opts.undershirtColor;
    if (opts.accentColor !== undefined) curAccentColor = opts.accentColor;
    if (opts.jerseyNumber !== undefined) curJerseyNumber = opts.jerseyNumber;
    if (opts.uniformPattern !== undefined) curUniformPattern = opts.uniformPattern;

    const cHex = numToHex(curCapColor);
    const sHex = numToHex(curShirtColor);
    const pHex = numToHex(curPantsColor);
    const uHex = numToHex(curUndershirtColor);
    const lHex = numToHex(curAccentColor);

    capMat.uniforms.uColor.value.set(cHex);
    underMat.uniforms.uColor.value.set(uHex);

    torsoTexRight.dispose();
    torsoTexLeft.dispose();
    torsoTexRight = createJerseyTorsoTexture(sHex, lHex, curUniformPattern, curJerseyNumber, false, false);
    torsoTexLeft = createJerseyTorsoTexture(sHex, lHex, curUniformPattern, curJerseyNumber, false, true);
    const isLefty = currentThrows === 'L';
    torsoMat.uniforms.uMap.value = isLefty ? torsoTexLeft : torsoTexRight;

    sleeveTex.dispose();
    sleeveTex = createSleeveTexture(sHex, lHex, curUniformPattern);
    shirtPlainMat.uniforms.uMap.value = sleeveTex;

    pantsTex.dispose();
    pantsTex = createPantsTexture(pHex, lHex, curUniformPattern);
    pantsMat.uniforms.uMap.value = pantsTex;

    socksTex.dispose();
    socksTex = createSocksTexture(uHex, sHex);
    socksMat.uniforms.uMap.value = socksTex;
  }

  // 初期姿勢（① セット構え）
  applyPhase(0.0);

  // 従来の4フレーム呼び出し (0, 1, 2, 3) にも互換対応（構え、足上げ、放球、フォロースルー）
  const legacyFrameMap = [0.00, 0.24, 0.68, 0.88];

  return {
    group: rootGroup,
    setFrame: (frame: number) => {
      const idx = Math.max(0, Math.min(legacyFrameMap.length - 1, Math.round(frame)));
      applyPhase(legacyFrameMap[idx]);
    },
    setPhase: (progress: number) => {
      applyPhase(progress);
    },
    setPitchingForm: (form: PitchingFormType) => {
      currentForm = form;
      applyPhase(lastProgress);
    },
    setThrows: (throws: 'R' | 'L') => {
      currentThrows = throws;
      applyPhase(lastProgress);
    },
    getThrows: () => currentThrows,
    setFormModifiers: (mods: CustomFormModifiers) => {
      formMods = { ...formMods, ...mods };
      applyPhase(lastProgress);
    },
    setUniform: (opts: Partial<PlayerStyleOptions>) => {
      updateUniform(opts);
    },
    setColorMaskMode: (enabled: boolean) => {
      if (enabled) {
        // uniform_and_number_proof.png 完全準拠の部位別5色カラーIDマスク
        capMat.uniforms.uColor.value.set('#FF3232');
        underMat.uniforms.uColor.value.set('#00DCFF');
        torsoMat.uniforms.uColor.value.set('#32E650');
        shirtPlainMat.uniforms.uColor.value.set('#32E650');
        pantsMat.uniforms.uColor.value.set('#3C6EFF');
        socksMat.uniforms.uColor.value.set('#F03CF0');
      } else {
        updateUniform({
          capColor: curCapColor,
          shirtColor: curShirtColor,
          pantsColor: curPantsColor,
          undershirtColor: curUndershirtColor,
          accentColor: curAccentColor,
          jerseyNumber: curJerseyNumber,
          uniformPattern: curUniformPattern,
        });
      }
    },
    setViewAngle: (_angle: 'PITCH_VIEW' | 'SIDE_3B_VIEW' | 'FRONT_SUB_VIEW') => {
      // 3Dボーン骨格モデルのため、カメラモードに応じてリアルタイム3D投影
    },
    getReleaseWorldPosition: (targetVec: THREE.Vector3) => {
      rootGroup.updateMatrixWorld(true);
      handBallMesh.getWorldPosition(targetVec);
      return targetVec;
    },
    dispose: () => {
      headTex.dispose();
      torsoTexRight.dispose();
      torsoTexLeft.dispose();
      sleeveTex.dispose();
      pantsTex.dispose();
      socksTex.dispose();
      capMat.dispose();
      underMat.dispose();
      pantsMat.dispose();
      shirtPlainMat.dispose();
      torsoMat.dispose();
      socksMat.dispose();
      headMat.dispose();
      skinMat.dispose();
      beltMat.dispose();
      gloveMat.dispose();
      cleatMat.dispose();
      whiteMat.dispose();
    },
  };
}

// ===========================================================================
// 3. 審判（UMPIRE）＆ 捕手（CATCHER）＆ 打者（BATTER）：本格2Dスポーツアニメセル画ビルボード
// ===========================================================================
export function createRealisticOfficial(role: 'UMPIRE' | 'CATCHER', options: PlayerStyleOptions): THREE.Group {
  const g = new THREE.Group();
  const { capColor, undershirtColor = 0x1e3a8a, pantsColor = 0xf8fafc } = options;
  const capHex = numToHex(capColor);
  const underHex = numToHex(undershirtColor);
  const pantsHex = numToHex(pantsColor);

  if (role === 'UMPIRE') {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 480;
    const ctx = canvas.getContext('2d')!;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // スラックス両脚
    ctx.fillStyle = '#3f4956';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(145, 250);
    ctx.lineTo(125, 355);
    ctx.lineTo(120, 445);
    ctx.lineTo(155, 445);
    ctx.lineTo(165, 355);
    ctx.lineTo(190, 275);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(255, 250);
    ctx.lineTo(275, 355);
    ctx.lineTo(280, 445);
    ctx.lineTo(245, 445);
    ctx.lineTo(235, 355);
    ctx.lineTo(210, 275);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 審判シューズ
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.ellipse(135, 452, 22, 11, 0, 0, Math.PI * 2);
    ctx.ellipse(265, 452, 22, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 審判半袖シャツ（甲子園特有のライトブルーグレー）
    ctx.fillStyle = '#8fa3b8';
    ctx.beginPath();
    ctx.moveTo(130, 145);
    ctx.quadraticCurveTo(200, 130, 270, 145);
    ctx.lineTo(285, 215);
    ctx.lineTo(255, 260);
    ctx.lineTo(145, 260);
    ctx.lineTo(115, 215);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // シャツのセル影
    ctx.fillStyle = '#6d8299';
    ctx.beginPath();
    ctx.moveTo(145, 220);
    ctx.quadraticCurveTo(200, 245, 255, 220);
    ctx.lineTo(255, 260);
    ctx.lineTo(145, 260);
    ctx.closePath();
    ctx.fill();

    // 両腕（前傾姿勢で膝に手を添える）
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(125, 195);
    ctx.lineTo(138, 295);
    ctx.lineTo(158, 295);
    ctx.lineTo(150, 195);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(275, 195);
    ctx.lineTo(262, 295);
    ctx.lineTo(242, 295);
    ctx.lineTo(250, 195);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 頭部・マスク
    ctx.fillStyle = '#d6a483';
    ctx.beginPath();
    ctx.arc(200, 112, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#18181b';
    ctx.beginPath();
    ctx.arc(200, 102, 28, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 3.5;
    ctx.strokeRect(176, 102, 48, 34);
    ctx.beginPath();
    ctx.moveTo(176, 114);
    ctx.lineTo(224, 114);
    ctx.moveTo(176, 125);
    ctx.lineTo(224, 125);
    ctx.moveTo(200, 102);
    ctx.lineTo(200, 136);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.48, 1.78),
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        alphaTest: 0.05,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    plane.position.set(0, 0.89, 0);
    g.add(plane);
    return g;
  }

  // CATCHER（2Dスポーツアニメセル画：プロテクター・レガース・マスク・キャッチャーミット）
  const canvas = document.createElement('canvas');
  canvas.width = 420;
  canvas.height = 440;
  const ctx = canvas.getContext('2d')!;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 4;

  // 太もも
  ctx.fillStyle = pantsHex;
  ctx.beginPath();
  ctx.moveTo(175, 275);
  ctx.lineTo(118, 295);
  ctx.lineTo(132, 340);
  ctx.lineTo(195, 315);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(245, 275);
  ctx.lineTo(302, 295);
  ctx.lineTo(288, 340);
  ctx.lineTo(225, 315);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // レガース
  ctx.fillStyle = '#17253b';
  ctx.beginPath();
  ctx.roundRect(108, 275, 38, 130, 14);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.roundRect(274, 275, 38, 130, 14);
  ctx.fill();
  ctx.stroke();

  // レガースの膝パッドハイライト
  ctx.fillStyle = '#293d5c';
  ctx.beginPath();
  ctx.arc(127, 295, 13, 0, Math.PI * 2);
  ctx.arc(293, 295, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // スパイク
  ctx.fillStyle = '#111827';
  ctx.beginPath();
  ctx.ellipse(125, 408, 22, 11, 0, 0, Math.PI * 2);
  ctx.ellipse(295, 408, 22, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 両肩・アンダーシャツ袖
  ctx.fillStyle = underHex;
  ctx.beginPath();
  ctx.moveTo(140, 155);
  ctx.lineTo(105, 205);
  ctx.lineTo(135, 220);
  ctx.lineTo(160, 175);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(280, 155);
  ctx.lineTo(315, 205);
  ctx.lineTo(285, 220);
  ctx.lineTo(260, 175);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // チェストプロテクター
  ctx.fillStyle = '#17253b';
  ctx.beginPath();
  ctx.moveTo(152, 145);
  ctx.lineTo(268, 145);
  ctx.lineTo(258, 285);
  ctx.lineTo(210, 302);
  ctx.lineTo(162, 285);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // クッションリブ
  ctx.strokeStyle = '#334968';
  ctx.lineWidth = 2.5;
  for (let py = 175; py <= 265; py += 28) {
    ctx.beginPath();
    ctx.moveTo(164, py);
    ctx.lineTo(256, py);
    ctx.stroke();
  }

  // 頭部 ＆ キャッチャーマスク
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 4;
  ctx.fillStyle = capHex;
  ctx.beginPath();
  ctx.arc(210, 105, 31, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#d6a483';
  ctx.beginPath();
  ctx.ellipse(210, 106, 18, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // キャッチャーミット（画面右側＝投手から見て左手でドッシリ構える）
  ctx.fillStyle = '#78350f';
  ctx.beginPath();
  ctx.arc(290, 230, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#92400e';
  ctx.beginPath();
  ctx.ellipse(284, 230, 22, 28, 0.1, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.55, 1.62),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.05,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  plane.position.set(0, 0.81, 0);
  g.add(plane);
  return g;
}

// ===========================================================================
// 4. 打者（BATTER）：ChatGPT pose_data_v6.json 骨格準拠 3Dセルアニメトゥーンリグ
//    投手（create3DPitcherRig）と同等の高品質3Dアニメ造形
//    ChatGPTが作成した96コマのバイオメカニクス実測ボーン座標により、
//    すり足（2.9cm）・割れ・インパクト・ハイフィニッシュをリアルタイム3D駆動
// ===========================================================================
import { create3DBatterRig, type AnimatedBatter3D } from './batterRig';
export { create3DBatterRig, type AnimatedBatter3D };

export function createAnimatedBatter(options: PlayerStyleOptions): AnimatedBatter3D {
  return create3DBatterRig(options);
}

