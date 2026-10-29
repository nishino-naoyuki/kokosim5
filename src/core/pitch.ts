/**
 * 投球軌道計算：物理演算（重力・マグヌス効果）＋ 3次変位（u³）のハイブリッド。
 * 設計書 4.2 / match_system_specification.md。
 *
 * 座標系: 原点=ホームベース後端、X=一塁側(+)/三塁側(-)、Y=センター方向(+)、Z=上方向(+)。
 * 投手はマウンド(Y≈17m)から -Y 方向へ投げる。
 */

export type PitchType = 'FOUR_SEAM' | 'SLIDER' | 'CURVE' | 'FORK' | 'CHANGEUP' | 'SINKER';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const GRAVITY = 9.80665;
/** 平均速度 / リリース速度（空気抵抗による減速を含む） */
const AVG_SPEED_RATIO = 0.96;

export interface PitchParams {
  type: PitchType;
  /** リリース時の球速 km/h */
  velocityKmh: number;
  release: Vec3;
  /** ホームベース通過時の最終到達位置（X, Z）。Y は 0 */
  target: { x: number; z: number };
  /** 変化球キレ 0〜100 */
  breaking: number;
  throws: 'R' | 'L';
}

/** ホームベース到達までの時間（秒）。150km/h≈0.43s, 130km/h≈0.49s */
export function flightTime(releaseY: number, velocityKmh: number): number {
  return releaseY / ((velocityKmh / 3.6) * AVG_SPEED_RATIO);
}

interface BreakSpec {
  /** 利き腕のグラブ側(+1)／腕側(-1)への横変化（m、キレ100） */
  glove: number;
  /** 縦変化（m、負=落ちる、キレ100） */
  drop: number;
  /** 変化が始まる位置（u^exponent） */
  exponent: number;
  /** 序盤の浮き上がり（カーブ用） */
  rise?: number;
}

const BREAK_SPECS: Record<PitchType, BreakSpec> = {
  FOUR_SEAM: { glove: 0, drop: 0.18, exponent: 2, rise: 0 }, // 正の drop = 浮き上がり（ホップ）
  SLIDER: { glove: 0.3, drop: -0.15, exponent: 3 },
  CURVE: { glove: 0.2, drop: -0.8, exponent: 2, rise: 0.15 },
  FORK: { glove: 0, drop: -0.55, exponent: 4 },
  CHANGEUP: { glove: -0.1, drop: -0.25, exponent: 3 },
  SINKER: { glove: -0.25, drop: -0.25, exponent: 3 },
};

/** 球種ごとの総変化量ベクトル（キレ反映・左右投手の反転込み） */
export function breakVector(p: Pick<PitchParams, 'type' | 'breaking' | 'throws'>): { dx: number; dz: number } {
  const s = BREAK_SPECS[p.type];
  const b = Math.max(0, Math.min(100, p.breaking)) / 100;
  // RHP のグラブ側 = +X（一塁側）。LHP は反転。
  const side = p.throws === 'R' ? 1 : -1;
  return { dx: s.glove * b * side, dz: s.drop * b };
}

/**
 * 時刻 t（秒、0〜T）におけるボール位置。
 * 変化前の直線的な経路（重力放物線）に、u^n で加速する変化変位を加算する。
 * u=1 では必ず target に一致する。
 */
export function pitchPosition(p: PitchParams, t: number): Vec3 {
  const T = flightTime(p.release.y, p.velocityKmh);
  const u = Math.max(0, Math.min(1, t / T));
  const spec = BREAK_SPECS[p.type];
  const br = breakVector(p);

  // 変化前の狙い点（最終到達点から変化量を引く）
  const aim = { x: p.target.x - br.dx, z: p.target.z - br.dz };

  const x = p.release.x + (aim.x - p.release.x) * u + br.dx * Math.pow(u, spec.exponent);
  const y = p.release.y * (1 - u);
  // 重力放物線：弦に対して 0.5 g T² u(1-u) だけ膨らむ
  const sag = 0.5 * GRAVITY * T * T * u * (1 - u);
  const rise = (spec.rise ?? 0) * (p.breaking / 100) * Math.sin(Math.PI * u);
  const z =
    p.release.z + (aim.z - p.release.z) * u + sag + br.dz * Math.pow(u, spec.exponent) + rise;
  return { x, y, z };
}

/** 軌道を N 分割した位置列（描画・当たり判定用） */
export function samplePitchPath(p: PitchParams, steps = 30): Vec3[] {
  const T = flightTime(p.release.y, p.velocityKmh);
  const out: Vec3[] = [];
  for (let i = 0; i <= steps; i++) out.push(pitchPosition(p, (T * i) / steps));
  return out;
}
