import * as THREE from 'three';
import type { CustomFormModifiers, PitchingFormType, PlayerStyleOptions } from './matchPlayers';
import { numToHex } from './matchPlayers';

export type PitcherViewAngle = 'PITCH_VIEW' | 'SIDE_3B_VIEW' | 'FRONT_SUB_VIEW';

type Vec3 = [number, number, number];

/**
 * 3Dマウンド座標系（右投げ基準、原点 (0,0,0) = 投手板プレート中央）
 *   +Z : 本塁（キャッチャー）方向
 *   -Z : 二塁（センターカメラ）方向
 *   +X : 投手の左側（一塁側）
 *   -X : 投手の右側（三塁側）
 *   +Y : 上方向（地面 = 0.0m）
 */
interface PoseKeypoints3D {
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
  /** 背中がカメラ（-Z）を向く角度（Yaw deg: 0=正面本塁向き、-75=背中が三塁側へ深く捻れる） */
  torsoYawDeg: number;
  hasBall: boolean;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function interpPose(a: PoseKeypoints3D, b: PoseKeypoints3D, rawT: number): PoseKeypoints3D {
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
    torsoYawDeg: lerp(a.torsoYawDeg, b.torsoYawDeg, t),
    hasBall: rawT < 0.5 ? a.hasBall : b.hasBall,
  };
}

/**
 * 骨盤・胸座標と体幹の捻り角（torsoYawDeg）から両肩・両股関節・首・頭を自然構築するヘルパー
 */
function buildPose(params: {
  pelvis: Vec3;
  chest: Vec3;
  headOffset?: Vec3;
  torsoYawDeg: number;
  shoulderTiltY?: number;
  rElbow: Vec3;
  rWrist: Vec3;
  lElbow: Vec3;
  lWrist: Vec3;
  rKnee: Vec3;
  rAnkle: Vec3;
  rToeOffset?: Vec3;
  lKnee: Vec3;
  lAnkle: Vec3;
  lToeOffset?: Vec3;
  hasBall: boolean;
}): PoseKeypoints3D {
  const { pelvis, chest, torsoYawDeg, shoulderTiltY = 0 } = params;
  const waist: Vec3 = [
    lerp(pelvis[0], chest[0], 0.34),
    lerp(pelvis[1], chest[1], 0.34),
    lerp(pelvis[2], chest[2], 0.34),
  ];
  const dx = chest[0] - pelvis[0];
  const dy = chest[1] - pelvis[1];
  const dz = chest[2] - pelvis[2];
  const spineLen = Math.hypot(dx, dy, dz) || 0.44;
  const ux = dx / spineLen;
  const uy = dy / spineLen;
  const uz = dz / spineLen;

  const neck: Vec3 = [chest[0] + ux * 0.11, chest[1] + uy * 0.11, chest[2] + uz * 0.11];
  const ho = params.headOffset || [0, 0.16, 0.03];
  const head: Vec3 = [neck[0] + ho[0], neck[1] + ho[1], neck[2] + ho[2]];

  const yawRad = (torsoYawDeg * Math.PI) / 180;
  // yaw=0 のとき左肩は +X (一塁側)、右肩は -X (三塁側)
  // yaw=-75°（ワインドアップで胸を三塁側に向ける）のとき、左肩は +Z（本塁側）、右肩は -Z（二塁側）へ回る
  const cosY = Math.cos(yawRad);
  const sinY = Math.sin(yawRad);
  const shHalf = 0.205;
  const lShoulder: Vec3 = [
    chest[0] + cosY * shHalf,
    chest[1] + 0.02 - shoulderTiltY,
    chest[2] - sinY * shHalf,
  ];
  const rShoulder: Vec3 = [
    chest[0] - cosY * shHalf,
    chest[1] + 0.02 + shoulderTiltY,
    chest[2] + sinY * shHalf,
  ];

  const hipYawRad = yawRad * 0.65;
  const cosH = Math.cos(hipYawRad);
  const sinH = Math.sin(hipYawRad);
  const hipHalf = 0.098;
  const lHip: Vec3 = [
    pelvis[0] + cosH * hipHalf,
    pelvis[1] - 0.03,
    pelvis[2] - sinH * hipHalf,
  ];
  const rHip: Vec3 = [
    pelvis[0] - cosH * hipHalf,
    pelvis[1] - 0.03,
    pelvis[2] + sinH * hipHalf,
  ];

  const rto = params.rToeOffset || [0, -0.02, 0.14];
  const lto = params.lToeOffset || [0, -0.02, 0.15];

  return {
    pelvis,
    waist,
    chest,
    neck,
    head,
    rShoulder,
    rElbow: params.rElbow,
    rWrist: params.rWrist,
    lShoulder,
    lElbow: params.lElbow,
    lWrist: params.lWrist,
    rHip,
    rKnee: params.rKnee,
    rAnkle: params.rAnkle,
    rToe: [params.rAnkle[0] + rto[0], Math.max(0.02, params.rAnkle[1] + rto[1]), params.rAnkle[2] + rto[2]],
    lHip,
    lKnee: params.lKnee,
    lAnkle: params.lAnkle,
    lToe: [params.lAnkle[0] + lto[0], Math.max(0.02, params.lAnkle[1] + lto[1]), params.lAnkle[2] + lto[2]],
    torsoYawDeg,
    hasBall: params.hasBall,
  };
}

/**
 * 実写連続写真（①オーバースロー今井投手11コマ、②スリークォーター大勢投手12コマ、
 * ③サイドスロー高校野球10コマ、④アンダースロー10コマ）を忠実にトレースした9段階キーフレーム
 * 特にリリース後（⑧ t=0.60 ➜ ⑨ t=0.74 ➜ ⑩ t=0.86 ➜ ⑪ t=1.00）のフォロースルーで：
 *   - 踏み出した前足（左足 lAnkle）が地面 (z = +0.96, y = 0.05) にしっかり固定されて絶対に浮かない
 *   - 右腕が後ろに逆回転せず、本塁側（+Z）から左膝・左脇（+X）へ自然に振り抜かれる
 *   - 右足（軸足）が各フォームの実写通りの高さ・軌道でフォロースルーし、最後に前へ着地する
 */
function getFormKeyframes(form: PitchingFormType): { times: number[]; poses: PoseKeypoints3D[] } {
  const times = [0.0, 0.16, 0.30, 0.44, 0.53, 0.60, 0.74, 0.86, 1.0];

  // ① セット構え (t = 0.00)：右足でプレートを踏み、胸の前でグラブとボールを構える（uniform_and_number_proof.png 準拠）
  const p0_set = buildPose({
    pelvis: [0.0, 0.94, 0.0],
    chest: [0.0, 1.38, 0.02],
    torsoYawDeg: -10,
    rElbow: [-0.24, 1.14, 0.08],
    rWrist: [-0.06, 1.22, 0.18],
    lElbow: [0.22, 1.14, 0.10],
    lWrist: [0.04, 1.22, 0.20],
    rKnee: [-0.09, 0.48, 0.01],
    rAnkle: [-0.09, 0.05, 0.0],
    lKnee: [0.09, 0.48, 0.04],
    lAnkle: [0.09, 0.05, 0.04],
    hasBall: true,
  });

  if (form === 'OVERHAND_HIGH' || form === 'OVERHAND_LOW') {
    const isHigh = form === 'OVERHAND_HIGH';

    // ② 足上げ頂点 (t = 0.16)：今井達也投手 ②（右足1本でプレート上に真っ直ぐ立ち、左膝を引き上げる）
    const p1_lift = buildPose({
      pelvis: [-0.05, 0.95, 0.0],
      chest: [-0.05, 1.39, 0.0],
      torsoYawDeg: -68,
      rElbow: [-0.14, 1.16, -0.06],
      rWrist: [-0.08, 1.24, 0.12],
      lElbow: [-0.10, 1.16, 0.22],
      lWrist: [-0.06, 1.22, 0.16],
      rKnee: [-0.08, 0.48, 0.0],
      rAnkle: [-0.08, 0.05, 0.0],
      lKnee: isHigh ? [-0.06, 1.08, 0.24] : [-0.04, 0.84, 0.24],
      lAnkle: isHigh ? [-0.04, 0.66, 0.18] : [-0.02, 0.44, 0.18],
      lToeOffset: [0, -0.08, 0.12],
      hasBall: true,
    });

    // ③ ヒップファースト並進・両手の割れ (t = 0.30)：今井投手 ③〜④（右膝を曲げて沈み、右手を太もも裏へ下ろす）
    const p2_glide = buildPose({
      pelvis: [-0.02, 0.78, 0.38],
      chest: [-0.04, 1.20, 0.34],
      torsoYawDeg: -75,
      rElbow: [-0.14, 0.98, 0.12],
      rWrist: [-0.18, 0.74, -0.04],
      lElbow: [0.04, 1.06, 0.56],
      lWrist: [0.06, 0.98, 0.74],
      rKnee: [-0.08, 0.42, 0.18],
      rAnkle: [-0.08, 0.06, 0.02],
      lKnee: [0.04, 0.54, 0.66],
      lAnkle: [0.05, 0.20, 0.82],
      hasBall: true,
    });

    // ④ 左足着地・トップ形成 (t = 0.44)：今井投手 ⑤〜⑥（左足が着地し、胸を三塁側に残したまま右腕がトップへ上がる）
    const p3_top = buildPose({
      pelvis: [0.0, 0.73, 0.74],
      chest: [-0.02, 1.15, 0.72],
      torsoYawDeg: -52,
      shoulderTiltY: 0.03,
      rElbow: [-0.18, 1.24, 0.50],
      rWrist: [-0.22, 1.48, 0.46],
      lElbow: [0.10, 1.08, 0.92],
      lWrist: [0.12, 1.02, 1.08],
      rKnee: [-0.08, 0.38, 0.38],
      rAnkle: [-0.08, 0.08, 0.04],
      rToeOffset: [0, -0.06, 0.12],
      lKnee: [0.05, 0.45, 0.92],
      lAnkle: [0.05, 0.05, 0.96],
      hasBall: true,
    });

    // ⑤ 最大外旋・胸の張り (t = 0.53)：今井投手 ⑦（腰と胸が一気に本塁へ回り、右肘が先行して前腕が後ろへしなる）
    const p4_mer = buildPose({
      pelvis: [0.01, 0.75, 0.84],
      chest: [0.03, 1.17, 0.88],
      torsoYawDeg: -8,
      shoulderTiltY: 0.05,
      rElbow: [-0.22, 1.32, 0.86],
      rWrist: [-0.24, 1.38, 0.64],
      lElbow: [0.22, 0.98, 0.86],
      lWrist: [0.14, 1.02, 0.98],
      rKnee: [-0.09, 0.38, 0.46],
      rAnkle: [-0.09, 0.12, 0.08],
      rToeOffset: [0, -0.08, 0.10],
      lKnee: [0.05, 0.45, 0.94],
      lAnkle: [0.05, 0.05, 0.96],
      hasBall: true,
    });

    // ⑧ リリース (t = 0.60)：今井投手 ⑧（頭上斜め上 +62° で白球をリリース！左足は壁になり、右足は地面近くで浮き始める）
    const p5_release = buildPose({
      pelvis: [0.02, 0.77, 0.88],
      chest: [0.05, 1.16, 1.00],
      torsoYawDeg: 14,
      shoulderTiltY: 0.06,
      rElbow: [-0.20, 1.38, 1.02],
      rWrist: [-0.16, 1.58, 1.18],
      lElbow: [0.24, 0.94, 0.88],
      lWrist: [0.16, 0.98, 0.98],
      rKnee: [-0.10, 0.42, 0.50],
      rAnkle: [-0.10, 0.18, 0.14],
      rToeOffset: [0, -0.10, 0.08],
      lKnee: [0.05, 0.45, 0.95],
      lAnkle: [0.05, 0.05, 0.96],
      hasBall: true,
    });

    // ⑨ フォロースルー前半 (t = 0.74)：今井投手 ⑨（右腕が本塁方向へ真っ直ぐ伸びてから左斜め下へ振り下ろされ、上体が前傾する）
    const p6_follow1 = buildPose({
      pelvis: [0.02, 0.79, 0.91],
      chest: [0.04, 1.08, 1.16],
      headOffset: [0, 0.14, 0.08],
      torsoYawDeg: 26,
      shoulderTiltY: -0.02,
      rElbow: [-0.04, 1.08, 1.24],
      rWrist: [0.06, 0.96, 1.38],
      lElbow: [0.24, 0.92, 0.92],
      lWrist: [0.18, 0.92, 1.02],
      rKnee: [-0.09, 0.52, 0.56],
      rAnkle: [-0.10, 0.38, 0.20],
      rToeOffset: [0, -0.12, -0.04],
      lKnee: [0.05, 0.46, 0.95],
      lAnkle: [0.05, 0.05, 0.96],
      hasBall: false,
    });

    // ⑩ フォロースルー後半 (t = 0.86)：今井投手 ⑩（左足1本を支柱にして上体が深く前傾し、右腕は左太もも外側へ振り抜かれ、右脚は腰の高さで後ろへ自然に伸びる）
    const p7_follow2 = buildPose({
      pelvis: [0.02, 0.81, 0.93],
      chest: [0.02, 0.98, 1.26],
      headOffset: [0, 0.14, 0.10],
      torsoYawDeg: 32,
      shoulderTiltY: -0.04,
      rElbow: [0.06, 0.84, 1.16],
      rWrist: [0.16, 0.66, 1.04],
      lElbow: [0.24, 0.90, 0.96],
      lWrist: [0.20, 0.84, 1.04],
      // 今井投手 ⑩：右足は頭上まで跳ね上げず、腰〜太ももの高さ（Y ≈ 0.64m）で自然に後ろへ浮く
      rKnee: [-0.08, 0.62, 0.58],
      rAnkle: [-0.10, 0.64, 0.22],
      rToeOffset: [0, -0.12, -0.06],
      lKnee: [0.05, 0.46, 0.96],
      lAnkle: [0.05, 0.05, 0.96],
      hasBall: false,
    });

    // ⑪ フィニッシュ着地 (t = 1.00)：今井投手 ⑪（右足が左足の横へ着地し、上体がスッと起き上がって本塁を見る）
    const p8_finish = buildPose({
      pelvis: [-0.03, 0.88, 0.95],
      chest: [-0.03, 1.31, 0.99],
      torsoYawDeg: 10,
      rElbow: [-0.22, 1.08, 0.96],
      rWrist: [-0.16, 0.96, 1.06],
      lElbow: [0.22, 1.06, 0.98],
      lWrist: [0.16, 0.98, 1.08],
      rKnee: [-0.12, 0.46, 0.98],
      rAnkle: [-0.12, 0.05, 0.96],
      lKnee: [0.06, 0.46, 0.97],
      lAnkle: [0.05, 0.05, 0.96],
      hasBall: false,
    });

    return {
      times,
      poses: [p0_set, p1_lift, p2_glide, p3_top, p4_mer, p5_release, p6_follow1, p7_follow2, p8_finish],
    };
  }

  if (form === 'THREE_QUARTERS') {
    // スリークォーター（大勢投手 12コマ完全トレース）
    // ② 右膝の上に頭を乗せ、左膝を垂直に高く上げる
    const p1_lift = buildPose({
      pelvis: [-0.05, 0.95, 0.0],
      chest: [-0.05, 1.39, 0.0],
      torsoYawDeg: -70,
      rElbow: [-0.14, 1.18, -0.04],
      rWrist: [-0.08, 1.26, 0.12],
      lElbow: [-0.08, 1.18, 0.22],
      lWrist: [-0.04, 1.24, 0.16],
      rKnee: [-0.08, 0.48, 0.0],
      rAnkle: [-0.08, 0.05, 0.0],
      lKnee: [-0.04, 1.10, 0.22],
      lAnkle: [-0.04, 0.68, 0.18],
      lToeOffset: [0, -0.08, 0.12],
      hasBall: true,
    });

    // ③〜⑤ 右膝を深く曲げて沈み込み（ヒールアップのタメ）、両手を一度太もも付近へ下ろす
    const p2_glide = buildPose({
      pelvis: [-0.02, 0.72, 0.40],
      chest: [-0.04, 1.14, 0.38],
      torsoYawDeg: -76,
      rElbow: [-0.14, 0.92, 0.16],
      rWrist: [-0.16, 0.74, 0.04],
      lElbow: [0.04, 0.98, 0.56],
      lWrist: [0.06, 0.88, 0.72],
      rKnee: [-0.08, 0.38, 0.22],
      rAnkle: [-0.08, 0.07, 0.02],
      lKnee: [0.04, 0.50, 0.68],
      lAnkle: [0.05, 0.18, 0.84],
      hasBall: true,
    });

    // ⑥〜⑦ サイド気味のコンパクトなトップ（振り遅れ抑制）
    const p3_top = buildPose({
      pelvis: [0.0, 0.70, 0.76],
      chest: [-0.02, 1.11, 0.74],
      torsoYawDeg: -50,
      shoulderTiltY: 0.02,
      rElbow: [-0.22, 1.12, 0.52],
      rWrist: [-0.26, 1.30, 0.46],
      lElbow: [0.12, 1.04, 0.94],
      lWrist: [0.14, 0.98, 1.08],
      rKnee: [-0.08, 0.34, 0.40],
      rAnkle: [-0.08, 0.09, 0.05],
      lKnee: [0.05, 0.44, 0.94],
      lAnkle: [0.05, 0.05, 0.98],
      hasBall: true,
    });

    // ⑧ 最大外旋（斜め横から肘が出る）
    const p4_mer = buildPose({
      pelvis: [0.01, 0.72, 0.86],
      chest: [0.02, 1.12, 0.92],
      torsoYawDeg: -6,
      shoulderTiltY: 0.03,
      rElbow: [-0.28, 1.18, 0.86],
      rWrist: [-0.30, 1.24, 0.64],
      lElbow: [0.22, 0.94, 0.88],
      lWrist: [0.14, 0.96, 1.00],
      rKnee: [-0.09, 0.34, 0.46],
      rAnkle: [-0.09, 0.16, 0.10],
      lKnee: [0.05, 0.44, 0.96],
      lAnkle: [0.05, 0.05, 0.98],
      hasBall: true,
    });

    // ⑨ 赤枠：スリークォーター・リリース（斜め上 +38°、右膝が90°に曲がりすねが地面と平行な低い位置！）
    const p5_release = buildPose({
      pelvis: [0.02, 0.73, 0.90],
      chest: [0.03, 1.10, 1.04],
      torsoYawDeg: 16,
      shoulderTiltY: 0.03,
      rElbow: [-0.28, 1.20, 1.00],
      rWrist: [-0.30, 1.34, 1.22],
      lElbow: [0.22, 0.90, 0.90],
      lWrist: [0.14, 0.92, 1.00],
      // 大勢投手 ⑨：右すねが地面と平行な低い位置
      rKnee: [-0.10, 0.34, 0.50],
      rAnkle: [-0.10, 0.24, 0.14],
      rToeOffset: [0, -0.10, 0.04],
      lKnee: [0.05, 0.44, 0.97],
      lAnkle: [0.05, 0.05, 0.98],
      hasBall: true,
    });

    // ⑩ フォロースルー前半：大勢投手 ⑩（上体が深く前傾し、右腕が顔の前から左膝方向へ振り抜かれる）
    const p6_follow1 = buildPose({
      pelvis: [0.02, 0.75, 0.92],
      chest: [0.02, 1.00, 1.20],
      headOffset: [0, 0.14, 0.08],
      torsoYawDeg: 28,
      rElbow: [-0.04, 1.00, 1.24],
      rWrist: [0.10, 0.88, 1.34],
      lElbow: [0.22, 0.88, 0.94],
      lWrist: [0.16, 0.86, 1.02],
      rKnee: [-0.09, 0.44, 0.56],
      rAnkle: [-0.10, 0.42, 0.22],
      rToeOffset: [0, -0.12, -0.04],
      lKnee: [0.05, 0.45, 0.97],
      lAnkle: [0.05, 0.05, 0.98],
      hasBall: false,
    });

    // ⑪ フォロースルー後半：大勢投手 ⑪（左脚が伸びて支柱になり、上体が水平近くまで倒れ、右腕が左膝下へ伸びる）
    const p7_follow2 = buildPose({
      pelvis: [0.02, 0.78, 0.94],
      chest: [0.02, 0.92, 1.28],
      headOffset: [0, 0.14, 0.10],
      torsoYawDeg: 34,
      rElbow: [0.06, 0.78, 1.18],
      rWrist: [0.16, 0.58, 1.08],
      lElbow: [0.22, 0.86, 0.98],
      lWrist: [0.18, 0.80, 1.04],
      rKnee: [-0.08, 0.56, 0.60],
      rAnkle: [-0.10, 0.58, 0.26],
      rToeOffset: [0, -0.12, -0.06],
      lKnee: [0.05, 0.46, 0.98],
      lAnkle: [0.05, 0.05, 0.98],
      hasBall: false,
    });

    // ⑫ フィニッシュ着地：大勢投手 ⑫（右足が左足の横に着地し、上体が起き上がる）
    const p8_finish = buildPose({
      pelvis: [-0.03, 0.88, 0.96],
      chest: [-0.03, 1.31, 1.00],
      torsoYawDeg: 12,
      rElbow: [-0.20, 1.06, 0.98],
      rWrist: [-0.14, 0.94, 1.08],
      lElbow: [0.20, 1.04, 1.00],
      lWrist: [0.14, 0.96, 1.08],
      rKnee: [-0.11, 0.46, 1.00],
      rAnkle: [-0.11, 0.05, 0.98],
      lKnee: [0.05, 0.46, 0.98],
      lAnkle: [0.05, 0.05, 0.98],
      hasBall: false,
    });

    return {
      times,
      poses: [p0_set, p1_lift, p2_glide, p3_top, p4_mer, p5_release, p6_follow1, p7_follow2, p8_finish],
    };
  }

  if (form === 'SIDEARM') {
    // サイドスロー（高校野球 背番号1 連続10コマ完全トレース）
    // コマ5〜6：左膝を腰の高さまで上げ、背中（背番号1）が三塁側へ見えるほど深く捻る
    const p1_lift = buildPose({
      pelvis: [-0.05, 0.93, 0.0],
      chest: [-0.05, 1.36, 0.0],
      torsoYawDeg: -85,
      rElbow: [-0.12, 1.14, -0.06],
      rWrist: [-0.06, 1.20, 0.10],
      lElbow: [-0.08, 1.14, 0.20],
      lWrist: [-0.04, 1.20, 0.14],
      rKnee: [-0.08, 0.47, 0.0],
      rAnkle: [-0.08, 0.05, 0.0],
      lKnee: [-0.06, 0.88, 0.22],
      lAnkle: [-0.04, 0.48, 0.18],
      lToeOffset: [0, -0.06, 0.12],
      hasBall: true,
    });

    // コマ7：腰をグッと落としながら左足を前へ踏み出し、左腕を本塁・右腕を二塁へ水平に大きく広げる！
    const p2_glide = buildPose({
      pelvis: [-0.02, 0.68, 0.42],
      chest: [-0.03, 1.08, 0.40],
      torsoYawDeg: -82,
      rElbow: [-0.16, 1.02, 0.08],
      rWrist: [-0.26, 0.96, -0.18],
      lElbow: [0.08, 1.04, 0.68],
      lWrist: [0.14, 1.00, 0.92],
      rKnee: [-0.09, 0.34, 0.22],
      rAnkle: [-0.09, 0.07, 0.02],
      lKnee: [0.05, 0.48, 0.72],
      lAnkle: [0.06, 0.16, 0.88],
      hasBall: true,
    });

    // コマ7.5：左足着地・水平テイクバック（後ろの右膝が地面近くまで沈み始める）
    const p3_top = buildPose({
      pelvis: [0.0, 0.63, 0.74],
      chest: [0.0, 1.04, 0.76],
      torsoYawDeg: -52,
      rElbow: [-0.28, 1.02, 0.56],
      rWrist: [-0.46, 1.02, 0.40],
      lElbow: [0.14, 1.00, 0.94],
      lWrist: [0.16, 0.96, 1.08],
      rKnee: [-0.10, 0.24, 0.40],
      rAnkle: [-0.10, 0.09, 0.05],
      lKnee: [0.06, 0.42, 0.94],
      lAnkle: [0.06, 0.05, 0.96],
      hasBall: true,
    });

    // コマ8直前：腰が本塁へ開き、右腕が真横からしなる（上体は横に倒れず真っ直ぐ起きている！）
    const p4_mer = buildPose({
      pelvis: [0.01, 0.62, 0.80],
      chest: [0.01, 1.04, 0.84],
      torsoYawDeg: -8,
      rElbow: [-0.34, 1.02, 0.78],
      rWrist: [-0.48, 1.02, 0.58],
      lElbow: [0.20, 0.90, 0.88],
      lWrist: [0.12, 0.92, 0.98],
      // 後ろの右膝が地面すれすれ（Y = 0.18m）まで深く沈む！
      rKnee: [-0.10, 0.18, 0.44],
      rAnkle: [-0.11, 0.11, 0.08],
      lKnee: [0.06, 0.42, 0.96],
      lAnkle: [0.06, 0.05, 0.96],
      hasBall: true,
    });

    // コマ8：サイドスロー・リリース（上体は直立し、肩の高さ 0° 水平で右腕を鞭のように振り抜く！）
    const p5_release = buildPose({
      pelvis: [0.01, 0.63, 0.82],
      chest: [0.01, 1.05, 0.88],
      torsoYawDeg: 14,
      rElbow: [-0.34, 1.04, 0.90],
      rWrist: [-0.56, 1.04, 1.02],
      lElbow: [0.22, 0.88, 0.90],
      lWrist: [0.12, 0.90, 0.98],
      // コマ8：前の左膝が90°、後ろの右膝が地面すれすれまで折れる深いランジ姿勢
      rKnee: [-0.10, 0.18, 0.46],
      rAnkle: [-0.12, 0.12, 0.10],
      rToeOffset: [0, -0.08, 0.04],
      lKnee: [0.06, 0.42, 0.96],
      lAnkle: [0.06, 0.05, 0.96],
      hasBall: true,
    });

    // コマ8.5：フォロースルー前半（右腕が水平に体の前を横切る）
    const p6_follow1 = buildPose({
      pelvis: [0.02, 0.68, 0.88],
      chest: [0.02, 1.09, 0.96],
      torsoYawDeg: 28,
      rElbow: [-0.10, 1.02, 1.12],
      rWrist: [0.12, 1.00, 1.18],
      lElbow: [0.22, 0.86, 0.94],
      lWrist: [0.12, 0.86, 1.02],
      rKnee: [-0.10, 0.30, 0.58],
      rAnkle: [-0.12, 0.20, 0.26],
      lKnee: [0.06, 0.44, 0.96],
      lAnkle: [0.06, 0.05, 0.96],
      hasBall: false,
    });

    // コマ9：サイドスロー・フォロースルー（左足1本に立ち上がり、右腕が左胸へ水平に巻きつき、右足は低い位置で後ろから回る）
    const p7_follow2 = buildPose({
      pelvis: [0.02, 0.74, 0.92],
      chest: [0.02, 1.14, 1.02],
      torsoYawDeg: 38,
      rElbow: [0.02, 1.00, 1.10],
      rWrist: [0.22, 0.98, 1.02],
      lElbow: [0.22, 0.86, 0.96],
      lWrist: [0.14, 0.84, 1.04],
      // コマ9：右足は高く跳ね上げず、膝を曲げて低い位置（足首 Y=0.24m）で前へ回る
      rKnee: [-0.10, 0.40, 0.72],
      rAnkle: [-0.14, 0.24, 0.46],
      lKnee: [0.06, 0.45, 0.96],
      lAnkle: [0.06, 0.05, 0.96],
      hasBall: false,
    });

    // コマ10：サイドスロー・フィニッシュ（右足を三塁側へ広く着地し、腰を落とした低い守備構え！）
    const p8_finish = buildPose({
      pelvis: [-0.06, 0.68, 0.94],
      chest: [-0.06, 1.06, 1.04],
      torsoYawDeg: 8,
      rElbow: [-0.26, 0.88, 1.00],
      rWrist: [-0.30, 0.76, 1.06],
      lElbow: [0.14, 0.82, 1.02],
      lWrist: [0.02, 0.68, 1.08],
      rKnee: [-0.20, 0.38, 0.96],
      rAnkle: [-0.22, 0.05, 0.94],
      lKnee: [0.10, 0.38, 0.98],
      lAnkle: [0.10, 0.05, 0.96],
      hasBall: false,
    });

    return {
      times,
      poses: [p0_set, p1_lift, p2_glide, p3_top, p4_mer, p5_release, p6_follow1, p7_follow2, p8_finish],
    };
  }

  // SUBMARINE（アンダースロー 10コマ ＋ リリース拡大写真 完全トレース）
  // コマ4：右足1本で立ち、左膝を高く上げる
  const s1_lift = buildPose({
    pelvis: [-0.05, 0.93, 0.0],
    chest: [-0.05, 1.35, 0.04],
    torsoYawDeg: -65,
    rElbow: [-0.14, 1.12, -0.02],
    rWrist: [-0.06, 1.18, 0.14],
    lElbow: [-0.08, 1.12, 0.22],
    lWrist: [-0.04, 1.18, 0.16],
    rKnee: [-0.08, 0.47, 0.0],
    rAnkle: [-0.08, 0.05, 0.0],
    lKnee: [-0.04, 1.02, 0.24],
    lAnkle: [-0.04, 0.60, 0.18],
    lToeOffset: [0, -0.08, 0.12],
    hasBall: true,
  });

  // コマ5：お尻を後ろへ突き出し、上体を前（三塁側）へ深くお辞儀するように前屈して沈み込む！
  const s2_glide = buildPose({
    pelvis: [-0.04, 0.68, 0.34],
    chest: [-0.08, 0.92, 0.50],
    headOffset: [0.02, 0.14, 0.08],
    torsoYawDeg: -72,
    shoulderTiltY: -0.06,
    rElbow: [-0.16, 0.82, 0.32],
    rWrist: [-0.18, 0.62, 0.22],
    lElbow: [0.02, 0.78, 0.62],
    lWrist: [0.04, 0.62, 0.72],
    rKnee: [-0.09, 0.34, 0.20],
    rAnkle: [-0.09, 0.07, 0.02],
    lKnee: [0.04, 0.48, 0.64],
    lAnkle: [0.05, 0.16, 0.78],
    hasBall: true,
  });

  // コマ6：左足を踏み出しながら、右腕を一度「背中側（天井方向）へ高く引き上げ」、左グラブを地面近くへ下げる！
  const s3_top = buildPose({
    pelvis: [-0.02, 0.56, 0.70],
    chest: [-0.08, 0.76, 0.86],
    headOffset: [0.02, 0.14, 0.10],
    torsoYawDeg: -45,
    shoulderTiltY: -0.10,
    // コマ6の特徴：右腕が背中の後ろで天井方向（Y=1.24m）へ高く引き上げられる！
    rElbow: [-0.20, 1.00, 0.66],
    rWrist: [-0.24, 1.24, 0.52],
    // 左グラブは左膝の前（地面近く）へ低く下がる
    lElbow: [0.12, 0.68, 0.92],
    lWrist: [0.14, 0.48, 0.98],
    rKnee: [-0.10, 0.20, 0.38],
    rAnkle: [-0.10, 0.09, 0.05],
    lKnee: [0.06, 0.42, 0.92],
    lAnkle: [0.06, 0.05, 0.94],
    hasBall: true,
  });

  // リリース直前（4枚目拡大写真直前）：右肩が極限まで低く沈み、右手が地面すれすれへ降りてくる
  const s4_mer = buildPose({
    pelvis: [0.0, 0.52, 0.76],
    chest: [-0.08, 0.70, 0.94],
    headOffset: [0.02, 0.15, 0.10],
    torsoYawDeg: -6,
    shoulderTiltY: -0.13,
    rElbow: [-0.24, 0.44, 0.84],
    rWrist: [-0.28, 0.26, 0.72],
    lElbow: [0.18, 0.72, 0.92],
    lWrist: [0.12, 0.66, 1.00],
    // 後ろの右膝がマウンドの土すれすれ（Y = 0.14m）まで落ち、すねが地面と平行に寝る！
    rKnee: [-0.10, 0.14, 0.42],
    rAnkle: [-0.12, 0.11, 0.08],
    lKnee: [0.06, 0.42, 0.95],
    lAnkle: [0.06, 0.05, 0.94],
    hasBall: true,
  });

  // コマ7 ＆ 4枚目拡大写真（アンダースロー・リリース瞬間）：
  // 地面すれすれ（Y = 0.22m）の最下点を通過し、左足の前の低い位置でボールをリリース！頭と視線は真っ直ぐ捕手を見る！
  const s5_release = buildPose({
    pelvis: [0.0, 0.52, 0.78],
    chest: [-0.08, 0.70, 0.98],
    headOffset: [0.02, 0.15, 0.10],
    torsoYawDeg: 12,
    shoulderTiltY: -0.14,
    rElbow: [-0.24, 0.42, 0.96],
    rWrist: [-0.26, 0.22, 1.10],
    lElbow: [0.18, 0.72, 0.94],
    lWrist: [0.12, 0.66, 1.02],
    rKnee: [-0.10, 0.14, 0.44],
    rAnkle: [-0.12, 0.12, 0.10],
    rToeOffset: [0, -0.08, 0.04],
    lKnee: [0.06, 0.42, 0.95],
    lAnkle: [0.06, 0.05, 0.94],
    hasBall: true,
  });

  // コマ8（アンダースロー・フォロースルー前半）：
  // 上体は前傾したまま右腕が下から左肩の前へすくい上げられ、右足は高く跳ね上げず低い位置で後ろへ伸びる！
  const s6_follow1 = buildPose({
    pelvis: [0.0, 0.64, 0.84],
    chest: [0.0, 0.84, 1.12],
    headOffset: [0, 0.15, 0.08],
    torsoYawDeg: 26,
    shoulderTiltY: -0.04,
    rElbow: [0.0, 0.82, 1.16],
    rWrist: [0.14, 0.94, 1.16],
    lElbow: [0.16, 0.70, 0.96],
    lWrist: [0.08, 0.54, 1.00],
    // コマ8：右足は低い位置（足首 Y=0.20m）で後ろへ伸びる
    rKnee: [-0.09, 0.34, 0.52],
    rAnkle: [-0.10, 0.20, 0.18],
    lKnee: [0.06, 0.44, 0.95],
    lAnkle: [0.06, 0.05, 0.94],
    hasBall: false,
  });

  // コマ9（フォロースルー後半：右足が前へ踏み出されて膝を曲げた姿勢で上体が起き始める）
  const s7_follow2 = buildPose({
    pelvis: [-0.02, 0.74, 0.88],
    chest: [-0.02, 1.10, 1.00],
    torsoYawDeg: 18,
    rElbow: [-0.08, 0.96, 1.06],
    rWrist: [0.06, 1.04, 1.04],
    lElbow: [0.18, 0.86, 1.00],
    lWrist: [0.14, 0.80, 1.08],
    rKnee: [-0.10, 0.42, 0.82],
    rAnkle: [-0.12, 0.06, 0.74],
    lKnee: [0.06, 0.44, 0.95],
    lAnkle: [0.06, 0.05, 0.94],
    hasBall: false,
  });

  // コマ10（フィニッシュ：両足でバランスよく立ち上がる）
  const s8_finish = buildPose({
    pelvis: [-0.02, 0.82, 0.90],
    chest: [-0.02, 1.24, 0.96],
    torsoYawDeg: 10,
    rElbow: [-0.18, 1.06, 0.98],
    rWrist: [-0.12, 1.14, 1.02],
    lElbow: [0.20, 0.94, 0.98],
    lWrist: [0.16, 0.78, 1.04],
    rKnee: [-0.10, 0.44, 0.88],
    rAnkle: [-0.11, 0.05, 0.84],
    lKnee: [0.06, 0.45, 0.95],
    lAnkle: [0.06, 0.05, 0.94],
    hasBall: false,
  });

  return {
    times,
    poses: [p0_set, s1_lift, s2_glide, s3_top, s4_mer, s5_release, s6_follow1, s7_follow2, s8_finish],
  };
}

// ===========================================================================
// 2Dアニメ人体造形 ＆ カラーIDマスク（uniform_and_number_proof.png 方式）レンダラー
// ===========================================================================
interface Pt2D {
  x: number;
  y: number;
  z: number; // カメラからの奥行き（大きいほど奥）
  scale: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shadeHex(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  const nr = Math.min(255, Math.max(0, Math.round(r * factor)));
  const ng = Math.min(255, Math.max(0, Math.round(g * factor)));
  const nb = Math.min(255, Math.max(0, Math.round(b * factor)));
  return `rgb(${nr},${ng},${nb})`;
}

/**
 * 2点間を結ぶ有機的な人体部位（太もも・ふくらはぎ・上腕・前腕）を2次ベジェ曲線で滑らかに描画する
 * （角ばった直線やカプセル感を完全に排除し、筋肉の膨らみと2階調セルアニメ陰影を描画）
 */
function drawOrganicLimbSegment(
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

  // 2階調アニメセル影（片側35%にシャープなセルシェード）
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

  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 4.2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

export function createAnimePitcherRig(options: PlayerStyleOptions) {
  const rootGroup = new THREE.Group();

  let curCapColor = options.capColor;
  let curShirtColor = options.shirtColor ?? 0xf6eed8;
  let curPantsColor = options.pantsColor ?? 0xf6eed8;
  let curUndershirtColor = options.undershirtColor ?? curCapColor;
  let curAccentColor = options.accentColor ?? curCapColor;
  let curJerseyNumber = options.jerseyNumber ?? 1;
  let curUniformPattern: 'NORMAL' | 'PINSTRIPE' | 'ACCENT_LINE' =
    options.uniformPattern ?? 'ACCENT_LINE';

  let currentForm: PitchingFormType = options.pitchingForm || 'OVERHAND_HIGH';
  let currentThrows: 'R' | 'L' = options.throws || 'R';
  let currentViewAngle: PitcherViewAngle = 'PITCH_VIEW';
  let colorMaskMode = false;
  let lastProgress = 0.0;

  let formMods: CustomFormModifiers = {
    legLiftHeight: 1.0,
    pelvisSinkDepth: 1.0,
    armSlotOffsetDeg: 0,
    torsoTiltOffsetDeg: 0,
    strideLengthScale: 1.0,
  };

  // 高解像度 2Dアニメキャンバス（640×760）
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 760;
  const ctx = canvas.getContext('2d')!;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;

  const planeMat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.03,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

  // ビルボードサイズ（マウンド上で7頭身の高校球児が自然なスケールで立つ）
  const planeGeo = new THREE.PlaneGeometry(2.35, 2.79);
  const planeMesh = new THREE.Mesh(planeGeo, planeMat);
  planeMesh.position.set(0, 1.16, 0.45);
  planeMesh.rotation.y = Math.PI; // 初期はセンターカメラ（-Z）に正対
  rootGroup.add(planeMesh);

  // リリース位置計算用の3Dダミーノード
  const releaseNode = new THREE.Object3D();
  rootGroup.add(releaseNode);

  /**
   * 現在のフォーム・進捗・フォームエディタ補正値・利き腕から3Dキーポイントを算出
   */
  function computeCurrentPose3D(progress: number): PoseKeypoints3D {
    const clamped = Math.max(0, Math.min(1, progress));
    const { times, poses } = getFormKeyframes(currentForm);

    let idx = 0;
    while (idx < times.length - 2 && clamped > times[idx + 1]) {
      idx++;
    }
    const t0 = times[idx];
    const t1 = times[idx + 1];
    const localT = t1 > t0 ? (clamped - t0) / (t1 - t0) : 0;

    const pose = interpPose(poses[idx], poses[idx + 1], localT);

    // フォームエディタ（足上げ高さ・沈み込み・腕の角度・体幹傾き）のリアルタイム反映
    const liftWeight = Math.max(0, 1 - Math.abs(clamped - 0.16) / 0.16);
    const glideReleaseWeight = Math.max(0, 1 - Math.abs(clamped - 0.52) / 0.28);
    const releaseWeight = Math.max(0, 1 - Math.abs(clamped - 0.58) / 0.18);

    const legScale =
      formMods.legLiftHeight !== undefined ? formMods.legLiftHeight : 1.0 + (formMods.legLiftMod || 0);
    const sinkScale =
      formMods.pelvisSinkDepth !== undefined ? formMods.pelvisSinkDepth : 1.0 + (formMods.pelvisDropMod || 0);
    const armDeg =
      formMods.armSlotOffsetDeg !== undefined ? formMods.armSlotOffsetDeg : formMods.armSlotModDeg || 0;
    const tiltDeg =
      formMods.torsoTiltOffsetDeg !== undefined ? formMods.torsoTiltOffsetDeg : formMods.torsoTiltModDeg || 0;

    if (liftWeight > 0 && Math.abs(legScale - 1.0) > 0.01) {
      const dyLift = (legScale - 1.0) * 0.32 * liftWeight;
      pose.lKnee[1] = Math.max(0.25, pose.lKnee[1] + dyLift);
      pose.lAnkle[1] = Math.max(0.05, pose.lAnkle[1] + dyLift);
      pose.lToe[1] = Math.max(0.02, pose.lToe[1] + dyLift);
    }

    if (glideReleaseWeight > 0 && Math.abs(sinkScale - 1.0) > 0.01) {
      const dySink = -(sinkScale - 1.0) * 0.18 * glideReleaseWeight;
      pose.pelvis[1] += dySink;
      pose.waist[1] += dySink;
      pose.chest[1] += dySink;
      pose.neck[1] += dySink;
      pose.head[1] += dySink;
      pose.rShoulder[1] += dySink;
      pose.lShoulder[1] += dySink;
      pose.rHip[1] += dySink;
      pose.lHip[1] += dySink;
    }

    if (glideReleaseWeight > 0 && Math.abs(tiltDeg) > 0.1) {
      const tiltShiftX = (tiltDeg / 25) * 0.12 * glideReleaseWeight;
      pose.chest[0] -= tiltShiftX;
      pose.neck[0] -= tiltShiftX;
      pose.head[0] -= tiltShiftX * 0.7;
      pose.rShoulder[0] -= tiltShiftX;
      pose.lShoulder[0] -= tiltShiftX;
    }

    if (releaseWeight > 0 && Math.abs(armDeg) > 0.1) {
      const rad = (armDeg * Math.PI) / 180 * releaseWeight;
      const sh = pose.rShoulder;
      for (const pt of [pose.rElbow, pose.rWrist]) {
        const dx = pt[0] - sh[0];
        const dy = pt[1] - sh[1];
        const c = Math.cos(rad);
        const s = Math.sin(rad);
        pt[0] = sh[0] + dx * c - dy * s;
        pt[1] = sh[1] + dx * s + dy * c;
      }
    }

    // 左投げ（throws === 'L'）の場合は X 座標と torsoYawDeg の符号を反転（鏡像骨格）
    // ※ 背番号は最後に正方向で描画するため絶対に鏡文字にならない！
    if (currentThrows === 'L') {
      const flipX = (v: Vec3): Vec3 => [-v[0], v[1], v[2]];
      pose.pelvis = flipX(pose.pelvis);
      pose.waist = flipX(pose.waist);
      pose.chest = flipX(pose.chest);
      pose.neck = flipX(pose.neck);
      pose.head = flipX(pose.head);
      pose.rShoulder = flipX(pose.rShoulder);
      pose.rElbow = flipX(pose.rElbow);
      pose.rWrist = flipX(pose.rWrist);
      pose.lShoulder = flipX(pose.lShoulder);
      pose.lElbow = flipX(pose.lElbow);
      pose.lWrist = flipX(pose.lWrist);
      pose.rHip = flipX(pose.rHip);
      pose.rKnee = flipX(pose.rKnee);
      pose.rAnkle = flipX(pose.rAnkle);
      pose.rToe = flipX(pose.rToe);
      pose.lHip = flipX(pose.lHip);
      pose.lKnee = flipX(pose.lKnee);
      pose.lAnkle = flipX(pose.lAnkle);
      pose.lToe = flipX(pose.lToe);
      pose.torsoYawDeg = -pose.torsoYawDeg;
    }

    return pose;
  }

  /**
   * 3Dマウンド座標 (X, Y, Z) を現在のカメラアングル（センター背面 / 三塁側真横 / 本塁斜め前）から
   * 640×760 2Dアニメキャンバス座標へ投影する
   */
  function projectPoint(pt: Vec3): Pt2D {
    const [x, y, z] = pt;
    const baseScale = 315; // 1m = 315px

    if (currentViewAngle === 'SIDE_3B_VIEW') {
      // 三塁側（-X）から真横を見るアングル：左がプレート(z=0)、右が本塁(z=+1.0)
      // 実写連続写真（今井投手・大勢投手・高校サイドスロー）と100%同じ向き！
      const depth = x + 3.5;
      const pScale = 3.5 / Math.max(1.5, depth);
      const sx = 225 + z * baseScale * 0.92;
      const sy = 648 - y * baseScale * 0.95 + x * 14;
      return { x: sx, y: sy, z: depth, scale: pScale };
    }

    if (currentViewAngle === 'FRONT_SUB_VIEW') {
      // 本塁・三塁側斜め前（アンダースロー連続写真アングル）からマウンドを見る
      const ang = 0.42; // 約24°斜め前
      const rx = -x * Math.cos(ang) + (z - 0.5) * Math.sin(ang);
      const rz = -x * Math.sin(ang) - (z - 0.5) * Math.cos(ang);
      const depth = rz + 4.5;
      const pScale = 4.5 / Math.max(2.0, depth);
      const sx = 320 + rx * baseScale * pScale;
      const sy = 645 - y * baseScale * pScale + (0.5 - z) * 28;
      return { x: sx, y: sy, z: depth, scale: pScale };
    }

    // PITCH_VIEW（TV中継センターカメラ背面視点：-Z から +Z 本塁方向を見る）
    // 画面左が +X（一塁側・左グラブ）、画面右が -X（三塁側・右投球腕）
    const depth = 14.0 + z * 1.35;
    const pScale = 14.0 / depth;
    const sx = 320 - x * baseScale * pScale;
    // マウンドの傾斜とカメラ俯角により、奥（+Z 本塁方向）へ踏み出すほど足元が自然に位置する
    const sy = 645 - y * baseScale * pScale - z * 24;
    return { x: sx, y: sy, z: depth, scale: pScale };
  }

  /**
   * 2Dアニメ人体 ＋ カラーIDマスク合成によるフレーム描画（uniform_and_number_proof.png ＆ pitching_forms_proof.png 完全準拠）
   */
  function renderAnimePitcherCanvas(progress: number) {
    const pose = computeCurrentPose3D(progress);
    releaseNode.position.set(pose.rWrist[0], pose.rWrist[1], pose.rWrist[2]);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // カラーパレット解決（通常ユニフォーム描画モード vs カラーIDマスク実証モード）
    // Region 1: Outline / Hair / Belt / Cleats (#141414)
    // Region 2: Skin / Leather Glove / Baseball (#d2a078 in mask)
    // Region 3: Cap (Red #ff3232 in mask)
    // Region 4: Undershirt (Cyan #00dcff in mask)
    // Region 5: Jersey Shirt (Green #32e650 in mask)
    // Region 6: Jersey Pants (Blue #3c6eff in mask)
    // Region 7: Socks (Magenta #f03cf0 in mask)
    const outlineCol = '#111827';
    const capMain = colorMaskMode ? '#ff3232' : numToHex(curCapColor);
    const capShadow = colorMaskMode ? '#d92626' : shadeHex(capMain, 0.76);
    const underMain = colorMaskMode ? '#00dcff' : numToHex(curUndershirtColor);
    const underShadow = colorMaskMode ? '#00b4d8' : shadeHex(underMain, 0.75);
    const shirtMain = colorMaskMode ? '#32e650' : numToHex(curShirtColor);
    const shirtShadow = colorMaskMode ? '#25b83d' : shadeHex(shirtMain, 0.85);
    const pantsMain = colorMaskMode ? '#3c6eff' : numToHex(curPantsColor);
    const pantsShadow = colorMaskMode ? '#2b52cc' : shadeHex(pantsMain, 0.85);
    const socksMain = colorMaskMode ? '#f03cf0' : numToHex(curUndershirtColor);
    const socksShadow = colorMaskMode ? '#c229c2' : shadeHex(socksMain, 0.76);
    const lineHex = colorMaskMode ? '#141414' : numToHex(curAccentColor);
    const skinMain = colorMaskMode ? '#d2a078' : '#e6b48e';
    const skinShadow = colorMaskMode ? '#b88660' : '#c5926c';
    const gloveMain = colorMaskMode ? '#d2a078' : '#7c4718';
    const gloveShadow = colorMaskMode ? '#b88660' : '#562f0d';
    const gloveHighlight = colorMaskMode ? '#e2b590' : '#9c5b23';

    // 全3Dキーポイントを2D投影
    const P = {
      pelvis: projectPoint(pose.pelvis),
      waist: projectPoint(pose.waist),
      chest: projectPoint(pose.chest),
      neck: projectPoint(pose.neck),
      head: projectPoint(pose.head),
      rShoulder: projectPoint(pose.rShoulder),
      rElbow: projectPoint(pose.rElbow),
      rWrist: projectPoint(pose.rWrist),
      lShoulder: projectPoint(pose.lShoulder),
      lElbow: projectPoint(pose.lElbow),
      lWrist: projectPoint(pose.lWrist),
      rHip: projectPoint(pose.rHip),
      rKnee: projectPoint(pose.rKnee),
      rAnkle: projectPoint(pose.rAnkle),
      rToe: projectPoint(pose.rToe),
      lHip: projectPoint(pose.lHip),
      lKnee: projectPoint(pose.lKnee),
      lAnkle: projectPoint(pose.lAnkle),
      lToe: projectPoint(pose.lToe),
    };

    // 1. マウンド上の接地影（両足と骨盤の下に柔らかな楕円影）
    const groundCenter = projectPoint([pose.pelvis[0], 0.01, pose.pelvis[2]]);
    const rFootGround = projectPoint([pose.rAnkle[0], 0.01, pose.rAnkle[2]]);
    const lFootGround = projectPoint([pose.lAnkle[0], 0.01, pose.lAnkle[2]]);
    const shadowMinX = Math.min(groundCenter.x, rFootGround.x, lFootGround.x) - 34;
    const shadowMaxX = Math.max(groundCenter.x, rFootGround.x, lFootGround.x) + 34;
    const shadowY = Math.max(rFootGround.y, lFootGround.y) + 6;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.42)';
    ctx.beginPath();
    ctx.ellipse(
      (shadowMinX + shadowMaxX) * 0.5,
      Math.min(735, shadowY),
      Math.max(48, (shadowMaxX - shadowMinX) * 0.52),
      14,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // -----------------------------------------------------------------------
    // 脚描画関数（ストッキング Region 7 ＋ スパイク Region 1 ＋ 野球パンツ Region 6）
    // -----------------------------------------------------------------------
    function drawAnimeLeg(hip: Pt2D, knee: Pt2D, ankle: Pt2D, toe: Pt2D, isRightLeg: boolean) {
      const s = knee.scale;
      // 膝下のパンツ裾（ふくらはぎ中央でダボっとブラウジングする位置）
      const cuff: Pt2D = {
        x: lerp(knee.x, ankle.x, 0.52),
        y: lerp(knee.y, ankle.y, 0.52),
        z: lerp(knee.z, ankle.z, 0.52),
        scale: s,
      };

      // A. 高校野球ストッキング（Region 7: Socks）＋ 白2本ライン ＋ 足首の白アンダースターのぞき
      drawOrganicLimbSegment(
        ctx,
        cuff,
        ankle,
        17 * s,
        14.5 * s,
        11.5 * s,
        socksMain,
        socksShadow,
        outlineCol,
        isRightLeg ? -0.05 : 0.05,
        false,
        true,
      );

      // ストッキングの白2本ライン（uniform_and_number_proof.png 完全再現）
      if (!colorMaskMode) {
        const sdx = ankle.x - cuff.x;
        const sdy = ankle.y - cuff.y;
        const slen = Math.hypot(sdx, sdy) || 1;
        const snx = -sdy / slen;
        const sny = sdx / slen;
        for (const frac of [0.28, 0.46]) {
          const lx = lerp(cuff.x, ankle.x, frac);
          const ly = lerp(cuff.y, ankle.y, frac);
          const lw = lerp(15.5, 13.0, frac) * s;
          ctx.strokeStyle = shirtMain;
          ctx.lineWidth = 4.2 * s;
          ctx.beginPath();
          ctx.moveTo(lx - snx * lw, ly - sny * lw);
          ctx.lineTo(lx + snx * lw, ly + sny * lw);
          ctx.stroke();
        }
      }

      // 足首の白いアンダースターのぞき（uniform_and_number_proof.png の足首白三角）
      const whiteStirrupCol = colorMaskMode ? '#d2a078' : '#f8fafc';
      ctx.fillStyle = whiteStirrupCol;
      ctx.strokeStyle = outlineCol;
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(ankle.x - 5 * s, ankle.y - 16 * s);
      ctx.lineTo(ankle.x - 9 * s, ankle.y + 4 * s);
      ctx.lineTo(ankle.x + 8 * s, ankle.y + 4 * s);
      ctx.lineTo(ankle.x + 5 * s, ankle.y - 16 * s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // B. 黒革スパイク（Region 1: Cleats — 踵・甲・つま先の有機的シルエット＋白ライン）
      const fdx = toe.x - ankle.x;
      const fdy = toe.y - ankle.y;
      const flen = Math.hypot(fdx, fdy);
      ctx.save();
      ctx.fillStyle = '#141821';
      ctx.strokeStyle = outlineCol;
      ctx.lineWidth = 4.0;
      ctx.beginPath();
      if (flen < 18 * s) {
        // 正面・背面方向を向いたスパイク
        ctx.moveTo(ankle.x - 13 * s, ankle.y - 4 * s);
        ctx.quadraticCurveTo(ankle.x - 17 * s, ankle.y + 18 * s, ankle.x, ankle.y + 20 * s);
        ctx.quadraticCurveTo(ankle.x + 17 * s, ankle.y + 18 * s, ankle.x + 13 * s, ankle.y - 4 * s);
        ctx.quadraticCurveTo(ankle.x, ankle.y - 9 * s, ankle.x - 13 * s, ankle.y - 4 * s);
      } else {
        // 横・斜め方向を向いたスパイク（踵からつま先まで流線型）
        const ux = fdx / flen;
        const uy = fdy / flen;
        const nx = -uy;
        const ny = ux;
        const heelX = ankle.x - ux * 11 * s;
        const heelY = ankle.y - uy * 11 * s;
        const tipX = toe.x + ux * 12 * s;
        const tipY = toe.y + uy * 12 * s;
        ctx.moveTo(heelX + nx * 10 * s, heelY + ny * 10 * s);
        ctx.quadraticCurveTo(
          (ankle.x + tipX) * 0.5 + nx * 13 * s,
          (ankle.y + tipY) * 0.5 + ny * 13 * s,
          tipX + nx * 5 * s,
          tipY + ny * 5 * s,
        );
        ctx.quadraticCurveTo(tipX + ux * 6 * s, tipY + uy * 6 * s, tipX - nx * 8 * s, tipY - ny * 8 * s);
        ctx.lineTo(heelX - nx * 9 * s, heelY - ny * 9 * s);
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();

      // スパイクの白サイドライン
      if (!colorMaskMode) {
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 2.4 * s;
        ctx.beginPath();
        ctx.moveTo(ankle.x - 8 * s, ankle.y + 5 * s);
        ctx.lineTo(lerp(ankle.x, toe.x, 0.65) + 6 * s, lerp(ankle.y, toe.y, 0.65) + 7 * s);
        ctx.stroke();
      }
      ctx.restore();

      // C. 太もも〜膝〜ふくらはぎブラウジング（Region 6: Pants）
      const bulgeSign = isRightLeg ? -1 : 1;
      drawOrganicLimbSegment(
        ctx,
        hip,
        knee,
        30 * s,
        27.5 * s,
        21.5 * s,
        pantsMain,
        pantsShadow,
        outlineCol,
        bulgeSign * 0.10,
        true,
        true,
      );

      // 膝下のダボっとした裾（ブラウジング）
      drawOrganicLimbSegment(
        ctx,
        knee,
        cuff,
        21.5 * s,
        23.5 * s,
        18.5 * s,
        pantsMain,
        pantsShadow,
        outlineCol,
        bulgeSign * 0.08,
        true,
        true,
      );

      // パンツのサイドライン／縦じま ＆ 膝のアニメ服シワ主線
      ctx.save();
      ctx.strokeStyle = outlineCol;
      ctx.lineWidth = 2.4 * s;
      ctx.beginPath();
      ctx.moveTo(knee.x - 10 * s, knee.y - 3 * s);
      ctx.quadraticCurveTo(knee.x, knee.y + 4 * s, knee.x + 11 * s, knee.y - 2 * s);
      ctx.moveTo(cuff.x - 11 * s, cuff.y - 4 * s);
      ctx.quadraticCurveTo(cuff.x, cuff.y + 3 * s, cuff.x + 11 * s, cuff.y - 4 * s);
      ctx.stroke();

      if (!colorMaskMode && curUniformPattern === 'ACCENT_LINE') {
        const ldx = knee.x - hip.x;
        const ldy = knee.y - hip.y;
        const llen = Math.hypot(ldx, ldy) || 1;
        const lnx = (-ldy / llen) * bulgeSign;
        const lny = (ldx / llen) * bulgeSign;
        ctx.strokeStyle = lineHex;
        ctx.lineWidth = 4.2 * s;
        ctx.beginPath();
        ctx.moveTo(hip.x + lnx * 20 * s, hip.y + lny * 20 * s);
        ctx.quadraticCurveTo(
          (hip.x + knee.x) * 0.5 + lnx * 22 * s,
          (hip.y + knee.y) * 0.5 + lny * 22 * s,
          cuff.x + lnx * 14 * s,
          cuff.y + lny * 14 * s,
        );
        ctx.stroke();
      }
      ctx.restore();
    }

    // -----------------------------------------------------------------------
    // 骨盤・お尻・股下のシームレスな野球パンツ座面部（Region 6: Pants）＆ ベルト（Region 1）
    // -----------------------------------------------------------------------
    function drawPelvisAndBelt() {
      const s = P.pelvis.scale;
      const cx = P.pelvis.x;
      const cy = P.pelvis.y;
      const wx = P.waist.x;
      const wy = P.waist.y;

      const hipSpan = Math.max(54 * s, Math.hypot(P.rHip.x - P.lHip.x, P.rHip.y - P.lHip.y) + 36 * s);
      const halfW = hipSpan * 0.52;
      const waistHalfW = halfW * 0.88;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(wx - waistHalfW, wy - 6 * s);
      ctx.lineTo(wx + waistHalfW, wy - 6 * s);
      // 右腰〜右お尻の丸み
      ctx.bezierCurveTo(
        cx + halfW * 1.08,
        cy - 8 * s,
        P.rHip.x + 28 * s,
        P.rHip.y + 18 * s,
        P.rHip.x + 8 * s,
        P.rHip.y + 28 * s,
      );
      // 股下の自然なアーチ曲線
      ctx.quadraticCurveTo(cx, cy + 32 * s, P.lHip.x - 8 * s, P.lHip.y + 28 * s);
      // 左お尻〜左腰の丸み
      ctx.bezierCurveTo(
        P.lHip.x - 28 * s,
        P.lHip.y + 18 * s,
        cx - halfW * 1.08,
        cy - 8 * s,
        wx - waistHalfW,
        wy - 6 * s,
      );
      ctx.closePath();

      ctx.fillStyle = pantsMain;
      ctx.fill();

      // お尻下部・股下の2階調アニメセル影
      ctx.save();
      ctx.clip();
      if (!colorMaskMode && curUniformPattern === 'PINSTRIPE') {
        ctx.strokeStyle = lineHex;
        ctx.lineWidth = 2.2 * s;
        for (let px = cx - halfW - 10; px <= cx + halfW + 10; px += 10 * s) {
          ctx.beginPath();
          ctx.moveTo(px, wy - 20 * s);
          ctx.lineTo(px, cy + 45 * s);
          ctx.stroke();
        }
      }
      ctx.fillStyle = pantsShadow;
      ctx.beginPath();
      ctx.moveTo(cx - halfW, cy + 6 * s);
      ctx.quadraticCurveTo(cx, cy + 20 * s, cx + halfW, cy + 4 * s);
      ctx.lineTo(cx + halfW, cy + 45 * s);
      ctx.lineTo(cx - halfW, cy + 45 * s);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = outlineCol;
      ctx.lineWidth = 4.2;
      ctx.stroke();

      // お尻中央の縫い目・ポケット・股下シワ線（uniform_and_number_proof.png 完全再現！）
      ctx.strokeStyle = outlineCol;
      ctx.lineWidth = 2.6 * s;
      ctx.beginPath();
      ctx.moveTo(cx, wy + 4 * s);
      ctx.quadraticCurveTo(cx + 2 * s, cy + 12 * s, cx, cy + 26 * s);
      // 左右バックポケット線
      ctx.moveTo(cx - waistHalfW * 0.68, wy + 14 * s);
      ctx.lineTo(cx - waistHalfW * 0.25, wy + 16 * s);
      ctx.moveTo(cx + waistHalfW * 0.25, wy + 16 * s);
      ctx.lineTo(cx + waistHalfW * 0.68, wy + 14 * s);
      ctx.stroke();

      // 黒革ベルト（Region 1）＋ 3本のベルトループ（Region 5/6）
      const bAngle = Math.atan2(P.rHip.y - P.lHip.y, P.rHip.x - P.lHip.x) * 0.35;
      ctx.save();
      ctx.translate(wx, wy - 2 * s);
      ctx.rotate(bAngle);
      ctx.fillStyle = '#141821';
      ctx.strokeStyle = outlineCol;
      ctx.lineWidth = 3.6;
      ctx.beginPath();
      ctx.roundRect(-waistHalfW, -7 * s, waistHalfW * 2, 14 * s, 4 * s);
      ctx.fill();
      ctx.stroke();

      // 3本のベルトループ（uniform_and_number_proof.png 準拠）
      ctx.fillStyle = colorMaskMode ? shirtMain : pantsMain;
      ctx.lineWidth = 2.4;
      for (const lx of [-waistHalfW * 0.52, 0, waistHalfW * 0.52]) {
        ctx.fillRect(lx - 3.5 * s, -8 * s, 7 * s, 16 * s);
        ctx.strokeRect(lx - 3.5 * s, -8 * s, 7 * s, 16 * s);
      }
      ctx.restore();
      ctx.restore();
    }

    // -----------------------------------------------------------------------
    // 腕描画関数（アンダーシャツ長袖 Region 4 ＋ 半袖袖口 Region 5 ＋ 手・グラブ・白球 Region 2）
    // -----------------------------------------------------------------------
    function drawAnimeArm(
      shoulder: Pt2D,
      elbow: Pt2D,
      wrist: Pt2D,
      isRightArm: boolean,
      hasBall: boolean,
    ) {
      const s = elbow.scale;
      const isThrowingArm =
        (currentThrows === 'R' && isRightArm) || (currentThrows === 'L' && !isRightArm);

      // 半袖の袖口位置（上腕の68%地点）
      const sleeveEnd: Pt2D = {
        x: lerp(shoulder.x, elbow.x, 0.68),
        y: lerp(shoulder.y, elbow.y, 0.68),
        z: lerp(shoulder.z, elbow.z, 0.68),
        scale: s,
      };

      // A. アンダーシャツ前腕（Region 4: Undershirt）
      drawOrganicLimbSegment(
        ctx,
        elbow,
        wrist,
        15.5 * s,
        14.0 * s,
        10.5 * s,
        underMain,
        underShadow,
        outlineCol,
        isRightArm ? 0.06 : -0.06,
        true,
        true,
      );

      // 肘〜半袖内のアンダーシャツ接続部
      drawOrganicLimbSegment(
        ctx,
        sleeveEnd,
        elbow,
        17.5 * s,
        16.5 * s,
        15.5 * s,
        underMain,
        underShadow,
        outlineCol,
        0,
        true,
        true,
      );

      // B. ユニフォーム半袖（Region 5: Shirt — ゆったりした高校野球の半袖シルエット）
      drawOrganicLimbSegment(
        ctx,
        shoulder,
        sleeveEnd,
        24 * s,
        23 * s,
        21.5 * s,
        shirtMain,
        shirtShadow,
        outlineCol,
        isRightArm ? -0.06 : 0.06,
        true,
        true,
      );

      // 半袖袖口のトリムライン ＆ シワ線
      if (!colorMaskMode && curUniformPattern === 'ACCENT_LINE') {
        const adx = sleeveEnd.x - shoulder.x;
        const ady = sleeveEnd.y - shoulder.y;
        const alen = Math.hypot(adx, ady) || 1;
        const anx = -ady / alen;
        const any = adx / alen;
        const tx = lerp(shoulder.x, sleeveEnd.x, 0.86);
        const ty = lerp(shoulder.y, sleeveEnd.y, 0.86);
        ctx.strokeStyle = lineHex;
        ctx.lineWidth = 4.2 * s;
        ctx.beginPath();
        ctx.moveTo(tx - anx * 19 * s, ty - any * 19 * s);
        ctx.lineTo(tx + anx * 19 * s, ty + any * 19 * s);
        ctx.stroke();
      }

      // C. 先端：投球手＋白球 または 本格茶革グローブ（Region 2）
      if (isThrowingArm) {
        // 投球手（指と手のひら）
        ctx.fillStyle = skinMain;
        ctx.strokeStyle = outlineCol;
        ctx.lineWidth = 3.6;
        ctx.beginPath();
        ctx.arc(wrist.x, wrist.y, 12.5 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // リリース前〜リリース瞬間の白球（赤い縫い目付き）
        if (hasBall) {
          ctx.fillStyle = colorMaskMode ? '#d2a078' : '#ffffff';
          ctx.strokeStyle = outlineCol;
          ctx.lineWidth = 3.2;
          ctx.beginPath();
          ctx.arc(wrist.x + 4 * s, wrist.y - 6 * s, 11.5 * s, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          if (!colorMaskMode) {
            ctx.strokeStyle = '#dc2626';
            ctx.lineWidth = 1.8 * s;
            ctx.beginPath();
            ctx.arc(wrist.x + 4 * s, wrist.y - 6 * s, 7.5 * s, 0.3, 2.4);
            ctx.stroke();
          }
        }
      } else {
        // グラブ腕：立体的な茶革グローブ（ウェブ・親指・ポケット陰影・革紐ディテール）
        ctx.save();
        ctx.translate(wrist.x, wrist.y);
        const gAngle = Math.atan2(wrist.y - elbow.y, wrist.x - elbow.x);
        ctx.rotate(gAngle * 0.35);

        // グローブ本体
        ctx.fillStyle = gloveMain;
        ctx.strokeStyle = outlineCol;
        ctx.lineWidth = 4.0;
        ctx.beginPath();
        ctx.ellipse(0, 0, 26 * s, 30 * s, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // グローブ内側の深いポケット影
        ctx.fillStyle = gloveShadow;
        ctx.beginPath();
        ctx.ellipse(-3 * s, 4 * s, 16 * s, 19 * s, -0.2, 0, Math.PI * 2);
        ctx.fill();

        // 指背のハイライト＆革ウェブの編み目（uniform_and_number_proof.png 準拠）
        ctx.strokeStyle = gloveHighlight;
        ctx.lineWidth = 3.0 * s;
        for (let fi = -2; fi <= 1; fi++) {
          ctx.beginPath();
          ctx.arc(fi * 6 * s, -6 * s, 14 * s, -Math.PI * 0.75, -Math.PI * 0.2);
          ctx.stroke();
        }
        ctx.strokeStyle = outlineCol;
        ctx.lineWidth = 2.4 * s;
        ctx.beginPath();
        ctx.arc(0, -2 * s, 18 * s, -Math.PI * 0.8, 0.2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // -----------------------------------------------------------------------
    // 上半身ユニフォーム（Region 5: Shirt — なだらかな僧帽筋・逆三角形の背中・服のシワ・背番号）
    // -----------------------------------------------------------------------
    function drawTorsoAndJerseyNumber() {
      const s = P.chest.scale;
      const nx = P.neck.x;
      const ny = P.neck.y;
      const wx = P.waist.x;
      const wy = P.waist.y;

      // 左右の肩先（見かけの肩幅が極端に潰れないよう最低幅を確保しつつ3D回転を反映）
      let leftShX = Math.min(P.lShoulder.x, P.rShoulder.x);
      let rightShX = Math.max(P.lShoulder.x, P.rShoulder.x);
      const leftShY = P.lShoulder.x < P.rShoulder.x ? P.lShoulder.y : P.rShoulder.y;
      const rightShY = P.lShoulder.x < P.rShoulder.x ? P.rShoulder.y : P.lShoulder.y;
      const midShX = (leftShX + rightShX) * 0.5;
      const minSpan = 88 * s;
      if (rightShX - leftShX < minSpan) {
        leftShX = midShX - minSpan * 0.5;
        rightShX = midShX + minSpan * 0.5;
      }

      const waistSpan = Math.max(62 * s, (rightShX - leftShX) * 0.66);
      const lWaistX = wx - waistSpan * 0.5;
      const rWaistX = wx + waistSpan * 0.5;

      // 1. ハイネック・アンダーシャツの襟元（Region 4: Undershirt）
      ctx.fillStyle = underMain;
      ctx.strokeStyle = outlineCol;
      ctx.lineWidth = 3.8;
      ctx.beginPath();
      ctx.ellipse(nx, ny + 4 * s, 21 * s, 11 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 2. 上着本体シルエット（僧帽筋のなだらかな傾斜 ➜ 肩先 ➜ 広背筋のVテーパー ➜ 腰のブラウジング）
      ctx.save();
      ctx.beginPath();
      // 襟元のラウンド
      ctx.moveTo(nx - 21 * s, ny + 4 * s);
      ctx.quadraticCurveTo(nx, ny + 12 * s, nx + 21 * s, ny + 4 * s);
      // 右僧帽筋から右肩へ
      ctx.quadraticCurveTo(
        lerp(nx + 21 * s, rightShX, 0.5),
        lerp(ny + 4 * s, rightShY, 0.35) - 4 * s,
        rightShX + 8 * s,
        rightShY + 6 * s,
      );
      // 右脇から右腰（ベルト上部のふくらみ）へ
      ctx.bezierCurveTo(
        rightShX + 12 * s,
        lerp(rightShY, wy, 0.42),
        rWaistX + 12 * s,
        wy - 22 * s,
        rWaistX,
        wy - 4 * s,
      );
      // ベルト上端に沿う裾ライン
      ctx.quadraticCurveTo(wx, wy + 4 * s, lWaistX, wy - 4 * s);
      // 左腰から左脇・左肩へ
      ctx.bezierCurveTo(
        lWaistX - 12 * s,
        wy - 22 * s,
        leftShX - 12 * s,
        lerp(leftShY, wy, 0.42),
        leftShX - 8 * s,
        leftShY + 6 * s,
      );
      // 左肩から左僧帽筋・襟元へ
      ctx.quadraticCurveTo(
        lerp(leftShX, nx - 21 * s, 0.5),
        lerp(leftShY, ny + 4 * s, 0.35) - 4 * s,
        nx - 21 * s,
        ny + 4 * s,
      );
      ctx.closePath();

      ctx.fillStyle = shirtMain;
      ctx.fill();

      // クリップ内部：2階調セル影 ＋ デザインパターン（縦じま / 中央＆肩ライン）＋ 背番号
      ctx.save();
      ctx.clip();

      // A. 縦じま（PINSTRIPE）
      if (!colorMaskMode && curUniformPattern === 'PINSTRIPE') {
        const spineAng = Math.atan2(wx - nx, wy - ny);
        ctx.save();
        ctx.translate((nx + wx) * 0.5, (ny + wy) * 0.5);
        ctx.rotate(-spineAng);
        ctx.strokeStyle = lineHex;
        ctx.lineWidth = 2.4 * s;
        for (let sx = -110 * s; sx <= 110 * s; sx += 10 * s) {
          ctx.beginPath();
          ctx.moveTo(sx, -140 * s);
          ctx.lineTo(sx, 140 * s);
          ctx.stroke();
        }
        ctx.restore();
      }

      // B. 2階調アニメセル陰影（広背筋の立体影とベルト上のブラウジング影）
      ctx.fillStyle = shirtShadow;
      ctx.beginPath();
      ctx.moveTo(lWaistX - 15 * s, wy - 30 * s);
      ctx.quadraticCurveTo(wx, wy - 10 * s, rWaistX + 15 * s, wy - 28 * s);
      ctx.lineTo(rWaistX + 20 * s, wy + 15 * s);
      ctx.lineTo(lWaistX - 20 * s, wy + 15 * s);
      ctx.closePath();
      ctx.fill();

      // 脇〜背中片側のセル影
      ctx.beginPath();
      ctx.moveTo(leftShX - 6 * s, leftShY + 12 * s);
      ctx.quadraticCurveTo(lWaistX + 18 * s, lerp(leftShY, wy, 0.55), lWaistX + 22 * s, wy - 6 * s);
      ctx.lineTo(lWaistX - 15 * s, wy - 6 * s);
      ctx.closePath();
      ctx.fill();

      // C. 中央ライン ＆ 背中の肩ヨークライン（ACCENT_LINE — uniform_and_number_proof.png 完全再現！）
      if (!colorMaskMode && curUniformPattern === 'ACCENT_LINE') {
        ctx.strokeStyle = lineHex;
        ctx.lineWidth = 5.0 * s;
        // 肩ヨークの横アーチライン
        ctx.beginPath();
        ctx.moveTo(leftShX - 4 * s, ny + 32 * s);
        ctx.quadraticCurveTo((nx + wx) * 0.5, ny + 40 * s, rightShX + 4 * s, ny + 32 * s);
        ctx.stroke();
        // 背中中央の縦ライン
        ctx.beginPath();
        ctx.moveTo(nx, ny + 10 * s);
        ctx.lineTo(wx, wy);
        ctx.stroke();
      }

      // D. ラグラン袖の縫い目とアニメ服シワ線（uniform_and_number_proof.png 準拠）
      ctx.strokeStyle = outlineCol;
      ctx.lineWidth = 2.6 * s;
      ctx.beginPath();
      ctx.moveTo(nx - 18 * s, ny + 8 * s);
      ctx.quadraticCurveTo(leftShX + 14 * s, leftShY + 26 * s, leftShX + 8 * s, leftShY + 54 * s);
      ctx.moveTo(nx + 18 * s, ny + 8 * s);
      ctx.quadraticCurveTo(rightShX - 14 * s, rightShY + 26 * s, rightShX - 8 * s, rightShY + 54 * s);
      // 腰上のシワ主線
      ctx.moveTo(wx - 26 * s, wy - 22 * s);
      ctx.lineTo(wx - 8 * s, wy - 10 * s);
      ctx.moveTo(wx + 24 * s, wy - 26 * s);
      ctx.lineTo(wx + 6 * s, wy - 12 * s);
      ctx.stroke();

      // E. 背番号（#1, #10, #11, #18）＆ 白ゼッケン布パッチ（カラーIDマスク表示時は非表示にして純粋なマスクを見せる）
      if (!colorMaskMode) {
        // カメラから背中がどの程度見えているかを判定
        let backVisibility = 1.0;
        let horizShift = 0.0;
        if (currentViewAngle === 'PITCH_VIEW') {
          // センターカメラ背面視点：常に背中が正面に見え、体幹の捻りに応じて少し左右へシフト
          backVisibility = Math.max(0.45, Math.cos((pose.torsoYawDeg * Math.PI) / 180 * 0.55));
          horizShift = Math.sin((pose.torsoYawDeg * Math.PI) / 180) * 16 * s;
        } else if (currentViewAngle === 'SIDE_3B_VIEW') {
          // 三塁側真横視点：ワインドアップで背中を三塁側へ捻った時（torsoYaw < -35°）やフォロースルー前傾時に背番号が見える
          backVisibility =
            pose.torsoYawDeg < -25
              ? Math.min(0.9, (-pose.torsoYawDeg - 20) / 65)
              : progress > 0.65 && progress < 0.92
                ? 0.65
                : 0.0;
          horizShift = -10 * s;
        } else {
          // 本塁斜め前視点：ワインドアップの捻り時のみ背中が少し見える
          backVisibility = pose.torsoYawDeg < -45 ? 0.55 : 0.0;
        }

        if (backVisibility > 0.15) {
          const backCenterX = lerp(nx, wx, 0.45) + horizShift;
          const backCenterY = lerp(ny, wy, 0.46);
          const spineTilt = Math.atan2(wx - nx, wy - ny) * -0.75;

          ctx.save();
          ctx.translate(backCenterX, backCenterY);
          ctx.rotate(spineTilt);
          ctx.scale(Math.max(0.38, backVisibility), 1.0);

          const patchW = 68 * s;
          const patchH = 70 * s;
          // 白布ゼッケンパッチ（uniform_and_number_proof.png 完全再現）
          ctx.fillStyle = '#fafaf9';
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = 2.6 * s;
          ctx.fillRect(-patchW * 0.5, -patchH * 0.5, patchW, patchH);
          ctx.strokeRect(-patchW * 0.5, -patchH * 0.5, patchW, patchH);

          // 背番号フォント描画
          const numStr = String(curJerseyNumber);
          const fontSize = Math.round((numStr.length > 1 ? 42 : 52) * s);
          ctx.fillStyle = '#0f172a';
          ctx.font = `900 ${fontSize}px "Impact", "Arial Black", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(numStr, 0, 3 * s);
          ctx.restore();
        }
      }

      ctx.restore(); // end clip

      // 上着の外周主線（黒アウトライン）
      ctx.strokeStyle = outlineCol;
      ctx.lineWidth = 4.2;
      ctx.stroke();
      ctx.restore();
    }

    // -----------------------------------------------------------------------
    // 頭部・刈り上げ襟足・耳・6パネル野球帽（常に本塁キャッチャーを見据える LookAt 対応）
    // -----------------------------------------------------------------------
    function drawHeadAndCap() {
      const s = P.head.scale;
      const hx = P.head.x;
      const hy = P.head.y;
      const nx = P.neck.x;
      const ny = P.neck.y;

      ctx.save();
      // 1. 首筋（Region 2: Skin）
      ctx.fillStyle = skinMain;
      ctx.strokeStyle = outlineCol;
      ctx.lineWidth = 3.8;
      ctx.beginPath();
      ctx.moveTo(nx - 14 * s, ny + 4 * s);
      ctx.lineTo(hx - 15 * s, hy + 14 * s);
      ctx.lineTo(hx + 15 * s, hy + 14 * s);
      ctx.lineTo(nx + 14 * s, ny + 4 * s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 首のセル影
      ctx.fillStyle = skinShadow;
      ctx.beginPath();
      ctx.moveTo(nx - 12 * s, ny + 3 * s);
      ctx.lineTo(hx - 13 * s, hy + 14 * s);
      ctx.lineTo(hx + 2 * s, hy + 14 * s);
      ctx.lineTo(nx + 2 * s, ny + 3 * s);
      ctx.closePath();
      ctx.fill();

      if (currentViewAngle === 'PITCH_VIEW') {
        // センター背面視点（uniform_and_number_proof.png 完全再現：両耳＋刈り上げ襟足＋6パネル野球帽＋右横へ覗くツバ）
        // 両耳
        ctx.fillStyle = skinMain;
        ctx.strokeStyle = outlineCol;
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.ellipse(hx - 23 * s, hy + 2 * s, 6 * s, 11 * s, -0.15, 0, Math.PI * 2);
        ctx.ellipse(hx + 23 * s, hy + 2 * s, 6 * s, 11 * s, 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 頭部の輪郭（うなじ）
        ctx.fillStyle = skinMain;
        ctx.beginPath();
        ctx.arc(hx, hy - 2 * s, 23 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 高校球児の刈り上げ黒髪（襟足のシャープな毛束ディテール）
        ctx.fillStyle = '#18181b';
        ctx.beginPath();
        ctx.moveTo(hx - 23 * s, hy - 6 * s);
        ctx.lineTo(hx + 23 * s, hy - 6 * s);
        ctx.lineTo(hx + 20 * s, hy + 14 * s);
        ctx.lineTo(hx + 13 * s, hy + 10 * s);
        ctx.lineTo(hx + 8 * s, hy + 15 * s);
        ctx.lineTo(hx, hy + 11 * s);
        ctx.lineTo(hx - 8 * s, hy + 15 * s);
        ctx.lineTo(hx - 14 * s, hy + 10 * s);
        ctx.lineTo(hx - 20 * s, hy + 14 * s);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 野球帽のツバ（少し斜め前＝キャッチャー方向へ覗くツバ）
        const visorDir = currentThrows === 'L' ? -1 : 1;
        ctx.fillStyle = capMain;
        ctx.beginPath();
        ctx.moveTo(hx + visorDir * 16 * s, hy - 14 * s);
        ctx.quadraticCurveTo(
          hx + visorDir * 36 * s,
          hy - 11 * s,
          hx + visorDir * 34 * s,
          hy - 4 * s,
        );
        ctx.lineTo(hx + visorDir * 16 * s, hy - 4 * s);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 野球帽クラウン（Region 3: Cap）
        ctx.fillStyle = capMain;
        ctx.beginPath();
        ctx.arc(hx, hy - 6 * s, 25 * s, Math.PI * 0.96, Math.PI * 2.04);
        ctx.quadraticCurveTo(hx, hy - 2 * s, hx - 25 * s, hy - 6 * s);
        ctx.closePath();
        ctx.fill();

        // 帽子の2階調セル影
        ctx.save();
        ctx.clip();
        ctx.fillStyle = capShadow;
        ctx.fillRect(hx - 28 * s, hy - 34 * s, 20 * s, 34 * s);
        ctx.restore();

        ctx.strokeStyle = outlineCol;
        ctx.lineWidth = 4.0;
        ctx.stroke();

        // 帽子の6パネル縫い目線
        ctx.strokeStyle = outlineCol;
        ctx.lineWidth = 1.8 * s;
        ctx.beginPath();
        ctx.moveTo(hx, hy - 31 * s);
        ctx.lineTo(hx, hy - 4 * s);
        ctx.moveTo(hx, hy - 31 * s);
        ctx.quadraticCurveTo(hx - 14 * s, hy - 22 * s, hx - 18 * s, hy - 5 * s);
        ctx.moveTo(hx, hy - 31 * s);
        ctx.quadraticCurveTo(hx + 14 * s, hy - 22 * s, hx + 18 * s, hy - 5 * s);
        ctx.stroke();
      } else {
        // 三塁側真横（SIDE_3B_VIEW）または本塁斜め前（FRONT_SUB_VIEW）：
        // 常に本塁方向（右方向）を鋭く見据える精悍な2Dアニメ横顔＋野球帽
        const faceDir = currentViewAngle === 'SIDE_3B_VIEW' ? 1 : 0.6;
        ctx.fillStyle = skinMain;
        ctx.strokeStyle = outlineCol;
        ctx.lineWidth = 3.8;
        ctx.beginPath();
        ctx.arc(hx, hy - 2 * s, 23 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 襟足・もみあげの黒髪
        ctx.fillStyle = '#18181b';
        ctx.beginPath();
        ctx.arc(hx, hy - 4 * s, 23.5 * s, Math.PI * 0.65, Math.PI * 1.45);
        ctx.lineTo(hx - 4 * s, hy + 6 * s);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // アニメ調の鋭い目・眉・口元（常に本塁方向を見据える）
        if (!colorMaskMode) {
          const ex = hx + faceDir * 11 * s;
          const ey = hy - 2 * s;
          ctx.strokeStyle = '#18181b';
          ctx.lineWidth = 3.0 * s;
          ctx.beginPath();
          ctx.moveTo(ex - 6 * s, ey - 5 * s);
          ctx.lineTo(ex + 6 * s, ey - 3 * s);
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.ellipse(ex, ey, 5 * s, 3.5 * s, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(ex + 1.5 * s, ey, 2.5 * s, 0, Math.PI * 2);
          ctx.fill();
        }

        // 野球帽クラウン＆前へ突き出すツバ（Region 3: Cap）
        ctx.fillStyle = capMain;
        ctx.beginPath();
        ctx.arc(hx, hy - 7 * s, 25 * s, Math.PI * 0.92, Math.PI * 2.05);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 本塁方向（右）へ突き出すシャープなツバ
        ctx.beginPath();
        ctx.moveTo(hx + 10 * s, hy - 12 * s);
        ctx.lineTo(hx + 38 * s, hy - 7 * s);
        ctx.lineTo(hx + 12 * s, hy - 5 * s);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // -----------------------------------------------------------------------
    // 3D奥行き（Zソート）に基づくパーツ描画順序の決定
    // カメラから遠い（zが大きい）部位を先に描き、手前の部位を後に重ねる
    // -----------------------------------------------------------------------
    type DrawItem = { z: number; draw: () => void };
    const items: DrawItem[] = [
      {
        z: (P.rKnee.z + P.rAnkle.z) * 0.5,
        draw: () => drawAnimeLeg(P.rHip, P.rKnee, P.rAnkle, P.rToe, true),
      },
      {
        z: (P.lKnee.z + P.lAnkle.z) * 0.5,
        draw: () => drawAnimeLeg(P.lHip, P.lKnee, P.lAnkle, P.lToe, false),
      },
      {
        z: P.pelvis.z,
        draw: () => drawPelvisAndBelt(),
      },
      {
        z: P.chest.z,
        draw: () => drawTorsoAndJerseyNumber(),
      },
      {
        z: (P.rElbow.z + P.rWrist.z) * 0.5,
        draw: () => drawAnimeArm(P.rShoulder, P.rElbow, P.rWrist, true, pose.hasBall),
      },
      {
        z: (P.lElbow.z + P.lWrist.z) * 0.5,
        draw: () => drawAnimeArm(P.lShoulder, P.lElbow, P.lWrist, false, pose.hasBall),
      },
      {
        z: P.head.z - 0.08, // 頭部は常に体幹のすぐ上に重なる
        draw: () => drawHeadAndCap(),
      },
    ];

    // 奥（zが大きい）から手前（zが小さい）へソートして描画
    items.sort((a, b) => b.z - a.z);
    for (const item of items) {
      item.draw();
    }

    tex.needsUpdate = true;
  }

  function applyPhase(progress: number) {
    lastProgress = Math.max(0, Math.min(1, progress));
    renderAnimePitcherCanvas(lastProgress);
  }

  function updateViewOrientation(angle: PitcherViewAngle) {
    currentViewAngle = angle;
    if (angle === 'SIDE_3B_VIEW') {
      // 三塁側カメラ (-5.35, 1.32, -MOUND_DISTANCE + 0.52) に正対させる
      planeMesh.rotation.y = -Math.PI / 2;
      planeMesh.position.set(0, 1.16, 0.45);
    } else if (angle === 'FRONT_SUB_VIEW') {
      // 本塁斜め前カメラ (-2.35, 1.05, -MOUND_DISTANCE + 4.85) に正対させる
      planeMesh.rotation.y = -0.46;
      planeMesh.position.set(0, 1.16, 0.45);
    } else {
      // センターカメラ（-Z）に正対させる
      planeMesh.rotation.y = Math.PI;
      planeMesh.position.set(0, 1.16, 0.45);
    }
    renderAnimePitcherCanvas(lastProgress);
  }

  // 初期描画（① セット構え）
  applyPhase(0.0);

  const legacyFrameMap = [0.0, 0.16, 0.60, 0.86];

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
      if (opts.capColor !== undefined) curCapColor = opts.capColor;
      if (opts.shirtColor !== undefined) curShirtColor = opts.shirtColor;
      if (opts.pantsColor !== undefined) curPantsColor = opts.pantsColor;
      if (opts.undershirtColor !== undefined) curUndershirtColor = opts.undershirtColor;
      if (opts.accentColor !== undefined) curAccentColor = opts.accentColor;
      if (opts.jerseyNumber !== undefined) curJerseyNumber = opts.jerseyNumber;
      if (opts.uniformPattern !== undefined) curUniformPattern = opts.uniformPattern;
      applyPhase(lastProgress);
    },
    setViewAngle: (angle: PitcherViewAngle) => {
      updateViewOrientation(angle);
    },
    setColorMaskMode: (enabled: boolean) => {
      colorMaskMode = enabled;
      applyPhase(lastProgress);
    },
    getColorMaskMode: () => colorMaskMode,
    getReleaseWorldPosition: (targetVec: THREE.Vector3) => {
      rootGroup.updateMatrixWorld(true);
      releaseNode.getWorldPosition(targetVec);
      return targetVec;
    },
    dispose: () => {
      tex.dispose();
      planeGeo.dispose();
      planeMat.dispose();
    },
  };
}
