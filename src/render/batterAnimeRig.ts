import * as THREE from 'three';
import type { PlayerStyleOptions } from './matchPlayers';
import { numToHex } from './matchPlayers';

export type BatterViewAngle = 'PITCH_FRONT_VIEW' | 'SIDE_3B_VIEW';

type Vec3 = [number, number, number];
interface Pt2D {
  x: number;
  y: number;
  z: number;
  scale: number;
}

/**
 * 3Dホームベース打席座標系（右打者基準、原点 (0,0,0) = 本塁ホームベース頂点）
 *   +Z : 投手マウンド（センターカメラ）方向 (マウンド = +18.44m)
 *   -Z : 捕手・バックネット方向 (捕手 = -1.1m)
 *   +X : 一塁側方向 (左打席側)
 *   -X : 三塁側方向 (右打席側: 右打者は X ≈ -0.72m 付近に立つ)
 *   +Y : 上方向（地面 = 0.0m）
 */
export interface BatterKeypoints3D {
  pelvis: Vec3;
  waist: Vec3;
  chest: Vec3;
  neck: Vec3;
  head: Vec3;
  rShoulder: Vec3;
  rElbow: Vec3;
  rWrist: Vec3;
  lShoulder: Vec3;
  lElbow: Vec3;
  lWrist: Vec3;
  rHip: Vec3;
  rKnee: Vec3;
  rAnkle: Vec3;
  rToe: Vec3;
  lHip: Vec3;
  lKnee: Vec3;
  lAnkle: Vec3;
  lToe: Vec3;
  batKnob: Vec3;
  batTip: Vec3;
  torsoYawDeg: number;
  ballPos?: Vec3;
  trailAlpha: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function interpBatterPose(a: BatterKeypoints3D, b: BatterKeypoints3D, rawT: number): BatterKeypoints3D {
  const t = rawT * rawT * (3 - 2 * rawT);
  return {
    pelvis: lerp3(a.pelvis, b.pelvis, t),
    waist: lerp3(a.waist, b.waist, t),
    chest: lerp3(a.chest, b.chest, t),
    neck: lerp3(a.neck, b.neck, t),
    head: lerp3(a.head, b.head, t),
    rShoulder: lerp3(a.rShoulder, b.rShoulder, t),
    rElbow: lerp3(a.rElbow, b.rElbow, t),
    rWrist: lerp3(a.rWrist, b.rWrist, t),
    lShoulder: lerp3(a.lShoulder, b.lShoulder, t),
    lElbow: lerp3(a.lElbow, b.lElbow, t),
    lWrist: lerp3(a.lWrist, b.lWrist, t),
    rHip: lerp3(a.rHip, b.rHip, t),
    rKnee: lerp3(a.rKnee, b.rKnee, t),
    rAnkle: lerp3(a.rAnkle, b.rAnkle, t),
    rToe: lerp3(a.rToe, b.rToe, t),
    lHip: lerp3(a.lHip, b.lHip, t),
    lKnee: lerp3(a.lKnee, b.lKnee, t),
    lAnkle: lerp3(a.lAnkle, b.lAnkle, t),
    lToe: lerp3(a.lToe, b.lToe, t),
    batKnob: lerp3(a.batKnob, b.batKnob, t),
    batTip: lerp3(a.batTip, b.batTip, t),
    torsoYawDeg: lerp(a.torsoYawDeg, b.torsoYawDeg, t),
    ballPos: a.ballPos && b.ballPos ? lerp3(a.ballPos, b.ballPos, t) : a.ballPos || b.ballPos,
    trailAlpha: lerp(a.trailAlpha, b.trailAlpha, t),
  };
}

// ============================================================================
// 岡本和真選手（11コマ連続写真）＆ 坂本勇人選手（Photo 3正面インパクト）の
// 実測バイオメカニクス骨格データ（全11キーフレーム定義）
// ============================================================================
export const BATTER_11_KEYFRAMES: { t: number; name: string; nameJa: string; pose: BatterKeypoints3D }[] = [
  // <1> セット構え (Stance)
  {
    t: 0.00,
    name: 'Stance',
    nameJa: '＜1＞ セット構え',
    pose: {
      pelvis: [-0.72, 0.84, -0.06],
      waist: [-0.72, 0.98, -0.05],
      chest: [-0.70, 1.24, -0.04],
      neck: [-0.68, 1.45, -0.02],
      head: [-0.66, 1.58, 0.04], // 顔を投手(+Z)へ向ける
      rShoulder: [-0.58, 1.25, -0.22], // 捕手側
      rElbow: [-0.56, 1.15, -0.36],
      rWrist: [-0.60, 1.35, -0.28], // 右耳横手元
      lShoulder: [-0.66, 1.26, 0.16], // 投手側（手前）
      lElbow: [-0.70, 1.08, 0.04],
      lWrist: [-0.64, 1.32, -0.25], // 両手でグリップを握る
      rHip: [-0.66, 0.82, -0.18],
      rKnee: [-0.65, 0.44, -0.22],
      rAnkle: [-0.66, 0.10, -0.24],
      rToe: [-0.72, 0.04, -0.16],
      lHip: [-0.70, 0.82, 0.08],
      lKnee: [-0.72, 0.44, 0.16],
      lAnkle: [-0.72, 0.10, 0.18],
      lToe: [-0.76, 0.04, 0.26],
      batKnob: [-0.62, 1.33, -0.26],
      batTip: [-0.54, 2.05, -0.48], // 角度65°直立気味に保持
      torsoYawDeg: 12, // 胸は本塁側(+X)を向き、左肩が投手側(+Z)
      trailAlpha: 0.0,
    },
  },

  // <2> 始動・脱力 (Pre-load)
  {
    t: 0.10,
    name: 'Pre-load',
    nameJa: '＜2＞ 始動・脱力',
    pose: {
      pelvis: [-0.72, 0.83, -0.08],
      waist: [-0.72, 0.97, -0.07],
      chest: [-0.70, 1.23, -0.06],
      neck: [-0.68, 1.44, -0.04],
      head: [-0.66, 1.58, 0.04],
      rShoulder: [-0.58, 1.25, -0.24],
      rElbow: [-0.56, 1.14, -0.38],
      rWrist: [-0.60, 1.34, -0.30],
      lShoulder: [-0.66, 1.25, 0.14],
      lElbow: [-0.70, 1.06, 0.02],
      lWrist: [-0.64, 1.31, -0.27],
      rHip: [-0.66, 0.81, -0.20],
      rKnee: [-0.65, 0.43, -0.24],
      rAnkle: [-0.66, 0.10, -0.24],
      rToe: [-0.72, 0.04, -0.16],
      lHip: [-0.70, 0.81, 0.06],
      lKnee: [-0.72, 0.44, 0.15],
      lAnkle: [-0.72, 0.10, 0.18],
      lToe: [-0.76, 0.04, 0.26],
      batKnob: [-0.62, 1.32, -0.28],
      batTip: [-0.53, 2.03, -0.52],
      torsoYawDeg: 10,
      trailAlpha: 0.0,
    },
  },

  // <3> 軸足タメ・ヒールアップ (Deep Load)
  {
    t: 0.20,
    name: 'Deep Load',
    nameJa: '＜3＞ 軸足タメ',
    pose: {
      pelvis: [-0.71, 0.82, -0.14], // 右股関節へ体重移動
      waist: [-0.71, 0.96, -0.13],
      chest: [-0.69, 1.22, -0.12],
      neck: [-0.67, 1.43, -0.08],
      head: [-0.66, 1.57, 0.03],
      rShoulder: [-0.56, 1.24, -0.28],
      rElbow: [-0.54, 1.12, -0.42],
      rWrist: [-0.58, 1.33, -0.34],
      lShoulder: [-0.65, 1.24, 0.10],
      lElbow: [-0.69, 1.04, -0.04],
      lWrist: [-0.62, 1.30, -0.31],
      rHip: [-0.65, 0.80, -0.25], // 軸足深く沈み込む
      rKnee: [-0.65, 0.42, -0.26],
      rAnkle: [-0.66, 0.10, -0.24],
      rToe: [-0.72, 0.04, -0.16],
      lHip: [-0.69, 0.81, 0.00],
      lKnee: [-0.72, 0.45, 0.12],
      lAnkle: [-0.72, 0.14, 0.17], // 左踵が3cm浮く（ヒールアップ）
      lToe: [-0.74, 0.04, 0.24],
      batKnob: [-0.60, 1.31, -0.32],
      batTip: [-0.50, 2.00, -0.58],
      torsoYawDeg: 6,
      trailAlpha: 0.0,
    },
  },

  // <4> 足上げ頂点 (Leg Lift - 岡本選手の腰高さ足上げ！)
  {
    t: 0.32,
    name: 'Leg Lift',
    nameJa: '＜4＞ 足上げ頂点',
    pose: {
      pelvis: [-0.71, 0.83, -0.15],
      waist: [-0.71, 0.97, -0.14],
      chest: [-0.69, 1.23, -0.13],
      neck: [-0.67, 1.44, -0.09],
      head: [-0.66, 1.58, 0.03],
      rShoulder: [-0.56, 1.25, -0.30],
      rElbow: [-0.53, 1.13, -0.44],
      rWrist: [-0.58, 1.35, -0.36],
      lShoulder: [-0.65, 1.25, 0.08],
      lElbow: [-0.68, 1.05, -0.06],
      lWrist: [-0.62, 1.32, -0.33],
      rHip: [-0.65, 0.81, -0.26],
      rKnee: [-0.65, 0.43, -0.26],
      rAnkle: [-0.66, 0.10, -0.24],
      rToe: [-0.72, 0.04, -0.16],
      lHip: [-0.70, 0.82, -0.02],
      lKnee: [-0.74, 0.68, 0.16], // 左膝が腰高さまで引き上がる！
      lAnkle: [-0.74, 0.32, 0.12], // 下腿が自然に垂れ下がる
      lToe: [-0.75, 0.22, 0.18],
      batKnob: [-0.60, 1.33, -0.34],
      batTip: [-0.48, 2.02, -0.62],
      torsoYawDeg: 4,
      trailAlpha: 0.0,
    },
  },

  // <5> ステップ並進 (Stride toward pitcher - 手前・投手方向へ並進！)
  {
    t: 0.44,
    name: 'Stride',
    nameJa: '＜5＞ ステップ並進',
    pose: {
      pelvis: [-0.71, 0.80, -0.04], // 骨盤が投手方向(+Z)へ平行移動
      waist: [-0.71, 0.94, -0.06],
      chest: [-0.70, 1.20, -0.08], // 上半身は後ろに残す（割れの初動）
      neck: [-0.68, 1.42, -0.06],
      head: [-0.66, 1.57, 0.04],
      rShoulder: [-0.57, 1.24, -0.28],
      rElbow: [-0.54, 1.12, -0.42],
      rWrist: [-0.59, 1.34, -0.34],
      lShoulder: [-0.66, 1.24, 0.10],
      lElbow: [-0.69, 1.04, -0.04],
      lWrist: [-0.63, 1.31, -0.31],
      rHip: [-0.66, 0.78, -0.16],
      rKnee: [-0.65, 0.42, -0.24],
      rAnkle: [-0.66, 0.10, -0.24],
      rToe: [-0.72, 0.04, -0.16],
      lHip: [-0.70, 0.79, 0.08],
      lKnee: [-0.73, 0.48, 0.38], // 左足が前（投手側）へ踏み出される！
      lAnkle: [-0.74, 0.20, 0.50],
      lToe: [-0.75, 0.12, 0.58],
      batKnob: [-0.61, 1.32, -0.32],
      batTip: [-0.49, 1.98, -0.62],
      torsoYawDeg: 6,
      trailAlpha: 0.0,
    },
  },

  // <6> 接地態勢 (Landing approach - 前足爪先が土寸前)
  {
    t: 0.54,
    name: 'Landing',
    nameJa: '＜6＞ 接地態勢',
    pose: {
      pelvis: [-0.71, 0.78, 0.02],
      waist: [-0.71, 0.92, -0.02],
      chest: [-0.70, 1.18, -0.04],
      neck: [-0.68, 1.40, -0.03],
      head: [-0.66, 1.56, 0.04],
      rShoulder: [-0.58, 1.22, -0.25],
      rElbow: [-0.55, 1.10, -0.40],
      rWrist: [-0.60, 1.32, -0.32],
      lShoulder: [-0.67, 1.23, 0.14],
      lElbow: [-0.70, 1.02, 0.00],
      lWrist: [-0.64, 1.29, -0.29],
      rHip: [-0.66, 0.76, -0.10],
      rKnee: [-0.65, 0.40, -0.20],
      rAnkle: [-0.66, 0.10, -0.24],
      rToe: [-0.72, 0.04, -0.16],
      lHip: [-0.70, 0.77, 0.14],
      lKnee: [-0.73, 0.42, 0.48],
      lAnkle: [-0.74, 0.12, 0.60], // 爪先が土スレスレ
      lToe: [-0.75, 0.05, 0.68],
      batKnob: [-0.62, 1.30, -0.30],
      batTip: [-0.50, 1.95, -0.60],
      torsoYawDeg: 8,
      trailAlpha: 0.0,
    },
  },

  // <7> 着地完了・パワートップ (Power Top - 最大の「割れ」)
  {
    t: 0.62,
    name: 'Power Top',
    nameJa: '＜7＞ パワートップ',
    pose: {
      pelvis: [-0.71, 0.77, 0.04],
      waist: [-0.71, 0.91, 0.01],
      chest: [-0.70, 1.17, -0.02],
      neck: [-0.68, 1.39, -0.01],
      head: [-0.66, 1.55, 0.04],
      rShoulder: [-0.58, 1.22, -0.24],
      rElbow: [-0.56, 1.09, -0.38],
      rWrist: [-0.60, 1.32, -0.30],
      lShoulder: [-0.68, 1.22, 0.16],
      lElbow: [-0.71, 1.01, 0.03],
      lWrist: [-0.65, 1.28, -0.27],
      rHip: [-0.66, 0.75, -0.08],
      rKnee: [-0.65, 0.39, -0.18],
      rAnkle: [-0.66, 0.10, -0.24],
      rToe: [-0.72, 0.04, -0.16],
      lHip: [-0.70, 0.76, 0.16],
      lKnee: [-0.74, 0.38, 0.54],
      lAnkle: [-0.74, 0.08, 0.64], // 前足（左足）が完全に接地！
      lToe: [-0.75, 0.04, 0.72],
      batKnob: [-0.62, 1.30, -0.28],
      batTip: [-0.52, 1.94, -0.58],
      torsoYawDeg: 12, // 骨盤が回り始め、上半身は残る最大の捻転差
      trailAlpha: 0.0,
    },
  },

  // <8> 骨盤回旋・バットラグ (Bat Lag - 下半身先行・グリップ先行)
  {
    t: 0.72,
    name: 'Bat Lag',
    nameJa: '＜8＞ 骨盤回旋',
    pose: {
      pelvis: [-0.70, 0.77, 0.06],
      waist: [-0.69, 0.91, 0.04],
      chest: [-0.66, 1.17, 0.03],
      neck: [-0.64, 1.39, 0.04],
      head: [-0.62, 1.55, 0.08],
      rShoulder: [-0.56, 1.20, -0.14],
      rElbow: [-0.58, 1.04, -0.16], // 肘が脇腹に引き込まれる
      rWrist: [-0.55, 1.15, -0.05],
      lShoulder: [-0.68, 1.21, 0.18],
      lElbow: [-0.66, 1.02, 0.14],
      lWrist: [-0.59, 1.13, -0.02],
      rHip: [-0.64, 0.75, -0.04],
      rKnee: [-0.62, 0.38, -0.10], // 軸足膝が内側へ倒れ込む
      rAnkle: [-0.63, 0.12, -0.20], // 踵がめくれ上がる
      rToe: [-0.70, 0.04, -0.16],
      lHip: [-0.70, 0.76, 0.16],
      lKnee: [-0.74, 0.38, 0.54],
      lAnkle: [-0.74, 0.08, 0.64],
      lToe: [-0.75, 0.04, 0.72],
      batKnob: [-0.56, 1.14, -0.04],
      batTip: [-0.58, 1.28, -0.82], // バットが水平に倒れて遅れて出てくる
      torsoYawDeg: 46, // 腰が正面（投手）へ約45°開く
      trailAlpha: 0.35,
    },
  },

  // <9> インパクト一閃！ (Impact - 【写真3 坂本勇人選手正面】完全合致！)
  {
    t: 0.80,
    name: 'Impact',
    nameJa: '＜9＞ インパクト！',
    pose: {
      pelvis: [-0.68, 0.78, 0.08],
      waist: [-0.65, 0.92, 0.08],
      chest: [-0.58, 1.18, 0.09], // 胸が正面（投手）を向く！
      neck: [-0.55, 1.40, 0.10],
      head: [-0.52, 1.54, 0.14], // 目線はホームベース上のボールを見下ろす
      rShoulder: [-0.50, 1.18, 0.00],
      rElbow: [-0.48, 1.05, 0.06], // 右肘が脇腹で力強く押し込む
      rWrist: [-0.34, 1.02, 0.22],
      lShoulder: [-0.66, 1.20, 0.16],
      lElbow: [-0.56, 1.10, 0.26],
      lWrist: [-0.38, 1.04, 0.25],
      rHip: [-0.60, 0.76, 0.00],
      rKnee: [-0.56, 0.38, 0.00],
      rAnkle: [-0.58, 0.16, -0.14], // 軸足つま先回転
      rToe: [-0.66, 0.04, -0.14],
      lHip: [-0.70, 0.76, 0.16],
      lKnee: [-0.74, 0.40, 0.54], // 前足突っ張り強固な支柱（壁）
      lAnkle: [-0.74, 0.08, 0.64],
      lToe: [-0.75, 0.04, 0.72],
      batKnob: [-0.40, 1.05, 0.26],
      batTip: [0.38, 0.98, 0.22], // ホームベース上を水平に切り裂く木製バット！
      ballPos: [-0.02, 1.00, 0.23], // 白球と芯が激突
      torsoYawDeg: 72, // 胸・ユニフォーム前面が正面（投手）を完全に向く
      trailAlpha: 1.0,
    },
  },

  // <10> 押し込み・両腕フル伸展 (Power Extension - 投手方向へ両腕ピンと伸展！)
  {
    t: 0.88,
    name: 'Extension',
    nameJa: '＜10＞ 両腕伸展',
    pose: {
      pelvis: [-0.66, 0.79, 0.08],
      waist: [-0.62, 0.93, 0.08],
      chest: [-0.54, 1.19, 0.10],
      neck: [-0.50, 1.41, 0.11],
      head: [-0.46, 1.55, 0.15],
      rShoulder: [-0.46, 1.18, 0.04],
      rElbow: [-0.32, 1.14, 0.28],
      rWrist: [-0.15, 1.12, 0.54], // 投手方向へ両腕が完全に伸びる！
      lShoulder: [-0.62, 1.20, 0.16],
      lElbow: [-0.42, 1.16, 0.36],
      lWrist: [-0.18, 1.14, 0.56],
      rHip: [-0.58, 0.77, 0.02],
      rKnee: [-0.54, 0.38, 0.04],
      rAnkle: [-0.56, 0.18, -0.10],
      rToe: [-0.64, 0.04, -0.12],
      lHip: [-0.70, 0.76, 0.16],
      lKnee: [-0.74, 0.40, 0.54],
      lAnkle: [-0.74, 0.08, 0.64],
      lToe: [-0.75, 0.04, 0.72],
      batKnob: [-0.19, 1.13, 0.55],
      batTip: [0.55, 1.28, 0.72], // バットがセンター方向へ突き出される
      ballPos: [0.08, 1.20, 1.10], // 打球が投手頭上へ飛翔
      torsoYawDeg: 84,
      trailAlpha: 0.45,
    },
  },

  // <11> 振り抜きハイフィニッシュ (High Finish - 左肩上へ優雅な巻き上がり)
  {
    t: 1.00,
    name: 'High Finish',
    nameJa: '＜11＞ フィニッシュ',
    pose: {
      pelvis: [-0.64, 0.83, 0.06],
      waist: [-0.60, 0.97, 0.06],
      chest: [-0.52, 1.23, 0.07],
      neck: [-0.48, 1.45, 0.08],
      head: [-0.44, 1.58, 0.14], // ツバを上げ打球を見送る
      rShoulder: [-0.44, 1.20, 0.08],
      rElbow: [-0.42, 1.34, 0.22],
      rWrist: [-0.54, 1.48, 0.16],
      lShoulder: [-0.60, 1.21, 0.08],
      lElbow: [-0.66, 1.36, 0.02],
      lWrist: [-0.58, 1.46, 0.14],
      rHip: [-0.56, 0.81, 0.04],
      rKnee: [-0.54, 0.44, 0.08],
      rAnkle: [-0.56, 0.20, -0.06],
      rToe: [-0.62, 0.04, -0.08],
      lHip: [-0.68, 0.80, 0.14],
      lKnee: [-0.72, 0.42, 0.50],
      lAnkle: [-0.74, 0.08, 0.60],
      lToe: [-0.75, 0.04, 0.68],
      batKnob: [-0.56, 1.47, 0.15],
      batTip: [-0.84, 1.95, -0.42], // 左肩上・背中へ美しく巻き上がる
      torsoYawDeg: 112, // 背中（背番号）が捕手側へ向く
      trailAlpha: 0.0,
    },
  },
];

// ============================================================================
// 2Dアニメ有機的四肢・関節レンダラー（pitcherAnimeRigと完全共通の筋肉・陰影描画）
// ============================================================================
export function drawOrganicSegment(
  ctx: CanvasRenderingContext2D,
  p1: Pt2D,
  p2: Pt2D,
  r1: number,
  rMid: number,
  r2: number,
  fillMain: string,
  fillShadow: string,
  outlineColor: string = '#111827',
  curveBulge: number = 0.12,
  withStartCap: boolean = true,
  withEndCap: boolean = true,
) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const nx = -dy / len;
  const ny = dx / len;

  const mx = (p1.x + p2.x) * 0.5 + nx * len * curveBulge;
  const my = (p1.y + p2.y) * 0.5 + ny * len * curveBulge;
  const m2x = (p1.x + p2.x) * 0.5 - nx * len * (curveBulge * 0.35);
  const m2y = (p1.y + p2.y) * 0.5 - ny * len * (curveBulge * 0.35);

  const L1x = p1.x + nx * r1;
  const L1y = p1.y + ny * r1;
  const R1x = p1.x - nx * r1;
  const R1y = p1.y - ny * r1;

  const LMx = mx + nx * rMid;
  const LMy = my + ny * rMid;
  const RMx = m2x - nx * rMid;
  const RMy = m2y - ny * rMid;

  const L2x = p2.x + nx * r2;
  const L2y = p2.y + ny * r2;
  const R2x = p2.x - nx * r2;
  const R2y = p2.y - ny * r2;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(L1x, L1y);
  ctx.quadraticCurveTo(LMx, LMy, L2x, L2y);
  if (withEndCap) {
    ctx.quadraticCurveTo(p2.x + (dx / len) * (r2 * 0.55), p2.y + (dy / len) * (r2 * 0.55), R2x, R2y);
  } else {
    ctx.lineTo(R2x, R2y);
  }
  ctx.quadraticCurveTo(RMx, RMy, R1x, R1y);
  if (withStartCap) {
    ctx.quadraticCurveTo(p1.x - (dx / len) * (r1 * 0.55), p1.y - (dy / len) * (r1 * 0.55), L1x, L1y);
  } else {
    ctx.closePath();
  }

  ctx.fillStyle = fillMain;
  ctx.fill();

  // 2階調セルアニメ陰影
  ctx.save();
  ctx.clip();
  ctx.fillStyle = fillShadow;
  ctx.beginPath();
  ctx.moveTo(p1.x - nx * (r1 * 0.15), p1.y - ny * (r1 * 0.15));
  ctx.quadraticCurveTo(
    m2x - nx * (rMid * 0.15),
    m2y - ny * (rMid * 0.15),
    p2.x - nx * (r2 * 0.15),
    p2.y - ny * (r2 * 0.15),
  );
  ctx.lineTo(R2x - nx * 6, R2y - ny * 6);
  ctx.lineTo(R1x - nx * 6, R1y - ny * 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // クッキリとしたアニメ主線
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 4.2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

/**
 * 3D打者座標 (X, Y, Z) をカメラアングルから 2D キャンバス座標 (640×760) へ投影
 */
export function projectBatterPoint(pt: Vec3, viewAngle: BatterViewAngle): Pt2D {
  const [x, y, z] = pt;
  const baseScale = 320; // 1m = 320px

  if (viewAngle === 'SIDE_3B_VIEW') {
    // 三塁側（-X）から本塁を見るアングル（岡本和真選手・写真1準拠）
    // 画面左が投手側(+Z)、画面右が捕手側(-Z)
    const depth = -x + 3.2;
    const pScale = 3.2 / Math.max(1.2, depth);
    const sx = 320 - z * baseScale * 0.92;
    const sy = 665 - y * baseScale * 0.95 - x * 10;
    return { x: sx, y: sy, z: depth, scale: pScale };
  }

  // PITCH_FRONT_VIEW: TV中継センターカメラ正面視点（投手 +Z から本塁 0 を見る・写真3 坂本勇人選手合致！）
  // 画面中央がホームベース。画面右が右打者(-X)、画面左が一塁側(+X)。
  const depth = 5.2 - z * 0.85;
  const pScale = 5.2 / Math.max(2.0, depth);
  const sx = 330 + x * baseScale * pScale * 0.95;
  const sy = 660 - y * baseScale * pScale - z * 18;
  return { x: sx, y: sy, z: depth, scale: pScale };
}

/**
 * 2D本格セルアニメ調打者キャンバスレンダラー
 */
export function renderAnimeBatterToCanvas(
  ctx: CanvasRenderingContext2D,
  pose: BatterKeypoints3D,
  viewAngle: BatterViewAngle,
  options: Partial<PlayerStyleOptions> = {},
) {
  const capColor = options.capColor ? numToHex(options.capColor) : '#1e3a8a'; // 濃紺
  const shirtColor = options.shirtColor ? numToHex(options.shirtColor) : '#f8fafc'; // アイボリー
  const pantsColor = options.pantsColor ? numToHex(options.pantsColor) : '#f8fafc';
  const underColor = options.undershirtColor ? numToHex(options.undershirtColor) : capColor;
  const beltColor = '#111827';
  const cleatColor = '#111827';
  const skinColor = '#f5c9a4';
  // const _skinShadow = '#e2ab82';
  const shirtShadow = '#cbd5e1';
  const underShadow = '#172554';
  const capShadow = '#0f172a';
  const batWoodMain = '#c49660';
  const batWoodShadow = '#9a6b36';

  // 投影計算
  const P = {
    pelvis: projectBatterPoint(pose.pelvis, viewAngle),
    waist: projectBatterPoint(pose.waist, viewAngle),
    chest: projectBatterPoint(pose.chest, viewAngle),
    neck: projectBatterPoint(pose.neck, viewAngle),
    head: projectBatterPoint(pose.head, viewAngle),
    rShoulder: projectBatterPoint(pose.rShoulder, viewAngle),
    rElbow: projectBatterPoint(pose.rElbow, viewAngle),
    rWrist: projectBatterPoint(pose.rWrist, viewAngle),
    lShoulder: projectBatterPoint(pose.lShoulder, viewAngle),
    lElbow: projectBatterPoint(pose.lElbow, viewAngle),
    lWrist: projectBatterPoint(pose.lWrist, viewAngle),
    rHip: projectBatterPoint(pose.rHip, viewAngle),
    rKnee: projectBatterPoint(pose.rKnee, viewAngle),
    rAnkle: projectBatterPoint(pose.rAnkle, viewAngle),
    rToe: projectBatterPoint(pose.rToe, viewAngle),
    lHip: projectBatterPoint(pose.lHip, viewAngle),
    lKnee: projectBatterPoint(pose.lKnee, viewAngle),
    lAnkle: projectBatterPoint(pose.lAnkle, viewAngle),
    lToe: projectBatterPoint(pose.lToe, viewAngle),
    batKnob: projectBatterPoint(pose.batKnob, viewAngle),
    batTip: projectBatterPoint(pose.batTip, viewAngle),
    ballPos: pose.ballPos ? projectBatterPoint(pose.ballPos, viewAngle) : undefined,
  };

  // 足（ズボン＋ソックス＋スパイク）
  function drawLeg(hip: Pt2D, knee: Pt2D, ankle: Pt2D, toe: Pt2D, _isRight: boolean) {
    const s = knee.scale;
    // 太もも
    drawOrganicSegment(ctx, hip, knee, 26 * s, 28 * s, 21 * s, pantsColor, shirtShadow, '#111827', 0.12);
    // すね（ソックス・アンダーシャツ同色）
    drawOrganicSegment(ctx, knee, ankle, 20 * s, 18 * s, 15 * s, underColor, underShadow, '#111827', 0.08);

    // スパイク
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ankle.x - 14 * s, ankle.y - 2);
    ctx.lineTo(toe.x + 16 * s, toe.y + 4);
    ctx.lineTo(toe.x + 12 * s, toe.y + 16);
    ctx.lineTo(ankle.x - 12 * s, ankle.y + 14);
    ctx.closePath();
    ctx.fillStyle = cleatColor;
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3.6;
    ctx.stroke();
    ctx.restore();
  }

  // 骨盤・ベルト
  function drawPelvis() {
    const s = P.pelvis.scale;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(P.pelvis.x, P.pelvis.y, 42 * s, 22 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = pantsColor;
    ctx.fill();
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 4.0;
    ctx.stroke();

    // ベルト
    ctx.beginPath();
    ctx.ellipse(P.pelvis.x, P.pelvis.y - 10 * s, 40 * s, 8 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = beltColor;
    ctx.fill();

    // バックル
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(P.pelvis.x - 7 * s, P.pelvis.y - 14 * s, 14 * s, 10 * s);
    ctx.restore();
  }

  // 体幹・ユニフォーム胸郭
  function drawTorso() {
    const s = P.chest.scale;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(P.lShoulder.x, P.lShoulder.y);
    ctx.lineTo(P.rShoulder.x, P.rShoulder.y);
    ctx.lineTo(P.pelvis.x + 36 * s, P.pelvis.y - 12 * s);
    ctx.lineTo(P.pelvis.x - 36 * s, P.pelvis.y - 12 * s);
    ctx.closePath();
    ctx.fillStyle = shirtColor;
    ctx.fill();

    // セル陰影
    ctx.save();
    ctx.clip();
    ctx.fillStyle = shirtShadow;
    ctx.beginPath();
    ctx.moveTo(P.chest.x - 10 * s, P.chest.y - 30 * s);
    ctx.lineTo(P.rShoulder.x, P.rShoulder.y);
    ctx.lineTo(P.pelvis.x + 36 * s, P.pelvis.y - 12 * s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 4.2;
    ctx.stroke();

    // アンダーシャツ襟元
    ctx.beginPath();
    ctx.moveTo(P.neck.x - 14 * s, P.neck.y + 6 * s);
    ctx.lineTo(P.neck.x, P.neck.y + 22 * s);
    ctx.lineTo(P.neck.x + 14 * s, P.neck.y + 6 * s);
    ctx.closePath();
    ctx.fillStyle = underColor;
    ctx.fill();
    ctx.stroke();

    // 背番号（正面視点ではフィニッシュ時に背中が見える、横視点では背番号が見える）
    if (viewAngle === 'SIDE_3B_VIEW' || pose.torsoYawDeg > 95) {
      ctx.fillStyle = '#0f172a';
      ctx.font = `bold ${Math.round(28 * s)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('4', P.chest.x + 2 * s, P.chest.y + 12 * s);
    }
    ctx.restore();
  }

  // 腕（袖＋アンダーシャツ前腕＋バッティンググローブ）
  function drawArm(shoulder: Pt2D, elbow: Pt2D, wrist: Pt2D, _isLeading: boolean) {
    const s = elbow.scale;
    // 半袖ユニフォーム上腕
    drawOrganicSegment(ctx, shoulder, elbow, 18 * s, 19 * s, 15 * s, shirtColor, shirtShadow, '#111827', 0.1);
    // アンダーシャツ長袖前腕
    drawOrganicSegment(ctx, elbow, wrist, 15 * s, 14 * s, 11 * s, underColor, underShadow, '#111827', 0.08);

    // バッティンググローブ手袋（白）
    ctx.save();
    ctx.beginPath();
    ctx.arc(wrist.x, wrist.y, 13 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3.6;
    ctx.stroke();
    ctx.restore();
  }

  // 頭部・バッティングヘルメット（ツバ・耳当て）
  function drawHead() {
    const s = P.head.scale;
    ctx.save();

    // 首
    ctx.fillStyle = skinColor;
    ctx.fillRect(P.neck.x - 10 * s, P.neck.y - 12 * s, 20 * s, 24 * s);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3.8;
    ctx.strokeRect(P.neck.x - 10 * s, P.neck.y - 12 * s, 20 * s, 24 * s);

    // 顔輪郭（顎ライン）
    ctx.beginPath();
    ctx.moveTo(P.head.x - 18 * s, P.head.y);
    ctx.lineTo(P.head.x, P.head.y + 24 * s);
    ctx.lineTo(P.head.x + 18 * s, P.head.y);
    ctx.closePath();
    ctx.fillStyle = skinColor;
    ctx.fill();
    ctx.stroke();

    // ヘルメットドーム
    ctx.beginPath();
    ctx.arc(P.head.x, P.head.y - 4 * s, 26 * s, Math.PI * 0.85, Math.PI * 2.15);
    ctx.closePath();
    ctx.fillStyle = capColor;
    ctx.fill();

    // セル陰影
    ctx.save();
    ctx.clip();
    ctx.fillStyle = capShadow;
    ctx.beginPath();
    ctx.arc(P.head.x + 8 * s, P.head.y - 4 * s, 26 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4.2;
    ctx.stroke();

    // ヘルメットツバ
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(P.head.x - 16 * s, P.head.y + 4 * s);
    ctx.lineTo(P.head.x + 18 * s, P.head.y + 4 * s);
    ctx.lineTo(P.head.x + 28 * s, P.head.y + 10 * s);
    ctx.lineTo(P.head.x - 8 * s, P.head.y + 10 * s);
    ctx.closePath();
    ctx.fillStyle = capColor;
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 右打者の耳当て（投手側 = 左耳）
    ctx.beginPath();
    ctx.ellipse(P.head.x - 18 * s, P.head.y + 10 * s, 8 * s, 14 * s, 0.2, 0, Math.PI * 2);
    ctx.fillStyle = capColor;
    ctx.fill();
    ctx.stroke();

    // アニメ目・眉（精悍な高校球児）
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.ellipse(P.head.x + 4 * s, P.head.y + 10 * s, 3.5 * s, 2 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // 眉
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(P.head.x, P.head.y + 5 * s);
    ctx.lineTo(P.head.x + 10 * s, P.head.y + 7 * s);
    ctx.stroke();

    ctx.restore();
  }

  // 木製バット
  function drawBat() {
    const s = P.chest.scale;
    const dx = P.batTip.x - P.batKnob.x;
    const dy = P.batTip.y - P.batKnob.y;
    const len = Math.hypot(dx, dy);
    if (len < 5) return;
    const nx = -dy / len;
    const ny = dx / len;

    // バット外形
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(P.batKnob.x + nx * (5 * s), P.batKnob.y + ny * (5 * s));
    ctx.lineTo(P.batTip.x + nx * (14 * s), P.batTip.y + ny * (14 * s));
    ctx.arc(P.batTip.x, P.batTip.y, 14 * s, Math.atan2(ny, nx), Math.atan2(-ny, -nx));
    ctx.lineTo(P.batKnob.x - nx * (5 * s), P.batKnob.y - ny * (5 * s));
    ctx.closePath();

    const batGrad = ctx.createLinearGradient(P.batKnob.x, P.batKnob.y, P.batTip.x, P.batTip.y);
    batGrad.addColorStop(0, '#f1f5f9'); // グリップテープ白
    batGrad.addColorStop(0.28, '#f1f5f9');
    batGrad.addColorStop(0.32, batWoodMain); // メイプル木目
    batGrad.addColorStop(1, batWoodMain);
    ctx.fillStyle = batGrad;
    ctx.fill();

    // 木製バット陰影
    ctx.save();
    ctx.clip();
    ctx.fillStyle = batWoodShadow;
    ctx.beginPath();
    ctx.moveTo(P.batKnob.x - nx * (2 * s), P.batKnob.y - ny * (2 * s));
    ctx.lineTo(P.batTip.x - nx * (4 * s), P.batTip.y - ny * (4 * s));
    ctx.lineTo(P.batTip.x - nx * (14 * s), P.batTip.y - ny * (14 * s));
    ctx.lineTo(P.batKnob.x - nx * (5 * s), P.batKnob.y - ny * (5 * s));
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4.0;
    ctx.stroke();

    // グリップエンドノブ
    ctx.beginPath();
    ctx.arc(P.batKnob.x, P.batKnob.y, 8 * s, 0, Math.PI * 2);
    ctx.fillStyle = batWoodMain;
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // スピードライン（インパクト時）
    if (pose.trailAlpha > 0.05) {
      ctx.save();
      ctx.strokeStyle = `rgba(56, 189, 248, ${pose.trailAlpha * 0.75})`;
      ctx.lineWidth = 12 * s;
      ctx.beginPath();
      ctx.arc(P.chest.x, P.chest.y, len * 0.9, -0.4, 0.4);
      ctx.stroke();

      ctx.strokeStyle = `rgba(255, 255, 255, ${pose.trailAlpha * 0.9})`;
      ctx.lineWidth = 6 * s;
      ctx.stroke();
      ctx.restore();
    }

    // 白球（インパクトコマ）
    if (P.ballPos) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(P.ballPos.x, P.ballPos.y, 14 * s, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3.6;
      ctx.stroke();

      // 縫い目赤
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.arc(P.ballPos.x - 4 * s, P.ballPos.y, 10 * s, -0.7, 0.7);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Z-ソートによる前後レイヤー描画
  type LayerItem = { z: number; draw: () => void };
  const layers: LayerItem[] = [
    { z: P.rKnee.z, draw: () => drawLeg(P.rHip, P.rKnee, P.rAnkle, P.rToe, true) },
    { z: P.lKnee.z, draw: () => drawLeg(P.lHip, P.lKnee, P.lAnkle, P.lToe, false) },
    { z: P.pelvis.z, draw: () => drawPelvis() },
    { z: P.chest.z, draw: () => drawTorso() },
    { z: P.head.z, draw: () => drawHead() },
    { z: P.rWrist.z, draw: () => drawArm(P.rShoulder, P.rElbow, P.rWrist, false) },
    { z: P.lWrist.z, draw: () => drawArm(P.lShoulder, P.lElbow, P.lWrist, true) },
    { z: (P.batKnob.z + P.batTip.z) * 0.5, draw: () => drawBat() },
  ];

  // 深度（カメラに近い順/奥から手前へ）ソート
  // depthが大きいほど手前
  layers.sort((a, b) => b.z - a.z);
  layers.forEach((l) => l.draw());
}

/**
 * Three.js 用アニメ打者リグファクトリ
 */
export function createOrganicAnimeBatter(options: PlayerStyleOptions) {
  const rootGroup = new THREE.Group();

  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 760;
  const ctx = canvas.getContext('2d')!;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const planeMat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,
  });

  const planeGeo = new THREE.PlaneGeometry(2.35, 2.79);
  const planeMesh = new THREE.Mesh(planeGeo, planeMat);
  planeMesh.position.set(-0.72, 1.18, 0.15); // 右打席位置
  rootGroup.add(planeMesh);

  let currentViewAngle: BatterViewAngle = 'PITCH_FRONT_VIEW';
  let curKeyframe = 0;

  function render(frameIdx: number) {
    curKeyframe = Math.max(0, Math.min(BATTER_11_KEYFRAMES.length - 1, frameIdx));
    const pose = BATTER_11_KEYFRAMES[curKeyframe].pose;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    renderAnimeBatterToCanvas(ctx, pose, currentViewAngle, options);
    tex.needsUpdate = true;
  }

  render(0);

  return {
    group: rootGroup,
    setKeyframe: (kIdx: number) => {
      render(kIdx);
    },
    setViewAngle: (angle: BatterViewAngle) => {
      currentViewAngle = angle;
      if (angle === 'SIDE_3B_VIEW') {
        planeMesh.rotation.y = Math.PI / 2;
      } else {
        planeMesh.rotation.y = 0;
      }
      render(curKeyframe);
    },
    renderToCanvas: (targetCtx: CanvasRenderingContext2D, kIdx: number, angle: BatterViewAngle) => {
      const pose = BATTER_11_KEYFRAMES[Math.max(0, Math.min(10, kIdx))].pose;
      renderAnimeBatterToCanvas(targetCtx, pose, angle, options);
    },
    dispose: () => {
      tex.dispose();
      planeMat.dispose();
      planeGeo.dispose();
    },
  };
}
