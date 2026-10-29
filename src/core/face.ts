import { Rng } from './rng';

/**
 * 選手フェイス（アバター）生成。player_character_design.md 5章。
 * 64bit の faceSeed から決定論的にパーツIDと微調整オフセットを復元する。
 */

/** 離散パーツの種類数 */
export const FACE_PART_COUNTS = {
  faceShape: 12, // 輪郭
  skinTone: 8, // 肌トーン
  hairStyle: 32, // 髪型
  hairColor: 6, // 髪色
  eyebrow: 18, // 眉
  eye: 28, // 目
  irisColor: 6, // 瞳色
  nose: 14, // 鼻
  mouth: 18, // 口
  mark: 12, // ほくろ・傷など
  build: 5, // 体格・首の太さ
} as const;

export type FacePartKey = keyof typeof FACE_PART_COUNTS;

export interface FaceSpec {
  parts: Record<FacePartKey, number>;
  /** 連続値の微調整（±5〜8%） */
  offsets: {
    eyeSpacing: number; // ±5%
    eyeY: number; // ±5%
    browAngleDeg: number; // ±8°
    noseSize: number; // ±5%
    noseY: number; // ±5%
    mouthY: number; // ±5%
  };
}

/** 離散パーツの総組み合わせ数 */
export function faceCombinationCount(): bigint {
  let n = 1n;
  for (const v of Object.values(FACE_PART_COUNTS)) n *= BigInt(v);
  return n;
}

/** 64bit の faceSeed（16桁16進）を新しく生成する */
export function generateFaceSeed(rng: Rng): string {
  const hi = rng.int(0, 0xffffffff).toString(16).padStart(8, '0');
  const lo = rng.int(0, 0xffffffff).toString(16).padStart(8, '0');
  return hi + lo;
}

/** faceSeed から顔パラメータを決定論的に復元する */
export function decodeFace(faceSeed: string): FaceSpec {
  const rng = new Rng(`face:${faceSeed}`);
  const parts = {} as Record<FacePartKey, number>;
  for (const key of Object.keys(FACE_PART_COUNTS) as FacePartKey[]) {
    parts[key] = rng.int(0, FACE_PART_COUNTS[key] - 1);
  }
  const offsets = {
    eyeSpacing: rng.float(-0.05, 0.05),
    eyeY: rng.float(-0.05, 0.05),
    browAngleDeg: rng.float(-8, 8),
    noseSize: rng.float(-0.05, 0.05),
    noseY: rng.float(-0.05, 0.05),
    mouthY: rng.float(-0.05, 0.05),
  };
  return { parts, offsets };
}
