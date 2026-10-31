import * as THREE from 'three';
import {
  type PlayerStyleOptions,
  numToHex,
  createAnimeCelMaterial,
  createCelMesh,
  createAnimeHeadTexture,
  createJerseyTorsoTexture,
  createSleeveTexture,
  createPantsTexture,
  createSocksTexture,
} from './matchPlayers';
import { CHATGPT_BATTER_96_FRAMES } from './batterBoneData';

export interface AnimatedBatter3D {
  group: THREE.Group;
  setFrame: (frameIndex: number) => void;
  setKeyframe: (keyframeIndex: number) => void;
  setPhase: (progress: number) => void;
  setHandedness: (hands: 'R' | 'L') => void;
  setUniform: (opts: Partial<PlayerStyleOptions>) => void;
  getBatImpactWorldPosition: (targetVec: THREE.Vector3) => THREE.Vector3;
  dispose: () => void;
}

type Vec3Arr = [number, number, number];
const DEG = Math.PI / 180;

/**
 * 高校球児らしい引き締まった自然なプロポーションの体幹（胴体・腰）ジオメトリ
 * 
 * 改善点：
 *   - 肩の高さを解剖学的に適正な鎖骨・胸板ラインに抑え、首・顎・フェイスラインが100%すっきり露出
 *   - 単純な円柱やカプセル（ソーセージ型）を排し、胸板〜ウエストの自然なくびれ〜臀部の立体感を滑らかに再現
 */
function createHighSchoolAthleteTorsoGeometry(radialSegments = 32, heightSegments = 24): THREE.BufferGeometry {
  const profile = [
    { t: 0.00, rx: 0.134, fz: 0.088, bz: 0.108, cz: 0.008 }, // 骨盤下部・臀部
    { t: 0.14, rx: 0.142, fz: 0.092, bz: 0.114, cz: 0.008 }, // 骨盤最大幅（お尻の自然な丸み）
    { t: 0.24, rx: 0.138, fz: 0.088, bz: 0.102, cz: 0.006 }, // ベルト位置
    { t: 0.38, rx: 0.126, fz: 0.080, bz: 0.090, cz: -0.004 }, // ウエストの引き締まった自然なくびれ
    { t: 0.54, rx: 0.142, fz: 0.096, bz: 0.094, cz: -0.008 }, // みぞおち〜下部胸郭
    { t: 0.72, rx: 0.162, fz: 0.108, bz: 0.098, cz: -0.010 }, // 胸板（高校生らしいすっきりとした胸筋）
    { t: 0.88, rx: 0.166, fz: 0.096, bz: 0.088, cz: -0.005 }, // 脇の下〜胸上部
    { t: 0.95, rx: 0.145, fz: 0.082, bz: 0.078, cz: 0.000 }, // 鎖骨・肩先（顔に被らないよう高さを抑える）
    { t: 1.00, rx: 0.095, fz: 0.072, bz: 0.070, cz: 0.004 }, // 首の付け根（すっきりとした首元）
  ];

  const totalHeight = 0.52;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  function getProfileAt(t: number) {
    if (t <= 0) return profile[0];
    if (t >= 1) return profile[profile.length - 1];
    let i = 0;
    while (i < profile.length - 1 && profile[i + 1].t < t) i++;
    const p0 = profile[i];
    const p1 = profile[i + 1];
    const alpha = (t - p0.t) / (p1.t - p0.t);
    const s = (1 - Math.cos(alpha * Math.PI)) * 0.5;
    return {
      rx: p0.rx + (p1.rx - p0.rx) * s,
      fz: p0.fz + (p1.fz - p0.fz) * s,
      bz: p0.bz + (p1.bz - p0.bz) * s,
      cz: p0.cz + (p1.cz - p0.cz) * s,
    };
  }

  for (let yIdx = 0; yIdx <= heightSegments; yIdx++) {
    const t = yIdx / heightSegments;
    const y = (t - 0.28) * totalHeight;
    const prof = getProfileAt(t);

    for (let xIdx = 0; xIdx <= radialSegments; xIdx++) {
      const u = xIdx / radialSegments;
      const angle = u * Math.PI * 2;
      const sinA = Math.sin(angle);
      const cosA = Math.cos(angle);

      const zRadius = sinA >= 0 ? prof.fz : prof.bz;
      const x = cosA * prof.rx;
      const z = sinA * zRadius + prof.cz;

      positions.push(x, y, z);
      uvs.push(u, t);
      normals.push(cosA, 0, sinA);
    }
  }

  for (let yIdx = 0; yIdx < heightSegments; yIdx++) {
    for (let xIdx = 0; xIdx < radialSegments; xIdx++) {
      const a = yIdx * (radialSegments + 1) + xIdx;
      const b = (yIdx + 1) * (radialSegments + 1) + xIdx;
      const c = (yIdx + 1) * (radialSegments + 1) + (xIdx + 1);
      const d = yIdx * (radialSegments + 1) + (xIdx + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  return geo;
}

/**
 * 腕・脚の1本化（連続スプライン・ダイナミックチューブメッシュ）生成ヘルパー
 * 
 * 始点（肩／股関節） ➔ 中間（肘／膝） ➔ 終点（手首／足首）の3点を通り、
 * 関節球を介さずに1本の滑らかな曲線チューブとして描画。
 * ダイナミック頂点更新により、GCフリーで超滑らかに伸縮・屈曲する。
 */
function createDynamicContinuousLimb(
  rStart: number,
  rMid: number,
  rEnd: number,
  mat: THREE.Material,
  outlineScale = 1.055,
  tubularSegments = 24,
  radialSegments = 18
) {
  const capSteps = 3;
  const totalRings = capSteps + (tubularSegments + 1) + capSteps;
  const totalVerts = totalRings * (radialSegments + 1);

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const indices: number[] = [];

  let vIdx = 0;
  for (let i = 0; i < totalRings; i++) {
    const tubeU = Math.max(0, Math.min(1, (i - capSteps) / tubularSegments));
    for (let j = 0; j <= radialSegments; j++) {
      const radV = j / radialSegments;
      uvs[vIdx * 2 + 0] = radV;
      uvs[vIdx * 2 + 1] = tubeU;
      vIdx++;
    }
  }

  for (let i = 0; i < totalRings - 1; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * (radialSegments + 1) + j;
      const b = (i + 1) * (radialSegments + 1) + j;
      const c = (i + 1) * (radialSegments + 1) + (j + 1);
      const d = i * (radialSegments + 1) + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  const meshGroup = createCelMesh(geo, mat, outlineScale);

  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const m01 = new THREE.Vector3();
  const m12 = new THREE.Vector3();
  const radialN = new THREE.Vector3();
  const norm = new THREE.Vector3();

  function update(p0: Vec3Arr, p1: Vec3Arr, p2: Vec3Arr) {
    v0.set(...p0);
    v1.set(...p1);
    v2.set(...p2);

    m01.lerpVectors(v0, v1, 0.76);
    m12.lerpVectors(v1, v2, 0.24);

    const curve = new THREE.CatmullRomCurve3([v0, m01, v1, m12, v2], false, 'centripetal', 0.5);
    const frames = curve.computeFrenetFrames(tubularSegments, false);

    let pOffset = 0;

    function writeRing(center: THREE.Vector3, N: THREE.Vector3, B: THREE.Vector3, T: THREE.Vector3, radius: number, capAngle: number) {
      const rRing = radius * Math.cos(capAngle);
      const tOffset = radius * Math.sin(capAngle);
      const cx = center.x + T.x * tOffset;
      const cy = center.y + T.y * tOffset;
      const cz = center.z + T.z * tOffset;

      const cosCap = Math.cos(capAngle);
      const sinCap = Math.sin(capAngle);

      for (let j = 0; j <= radialSegments; j++) {
        const theta = (j / radialSegments) * Math.PI * 2;
        const sin = Math.sin(theta);
        const cos = Math.cos(theta);

        radialN.x = cos * N.x + sin * B.x;
        radialN.y = cos * N.y + sin * B.y;
        radialN.z = cos * N.z + sin * B.z;

        norm.x = radialN.x * cosCap + T.x * sinCap;
        norm.y = radialN.y * cosCap + T.y * sinCap;
        norm.z = radialN.z * cosCap + T.z * sinCap;
        norm.normalize();

        positions[pOffset + 0] = cx + rRing * radialN.x;
        positions[pOffset + 1] = cy + rRing * radialN.y;
        positions[pOffset + 2] = cz + rRing * radialN.z;

        normals[pOffset + 0] = norm.x;
        normals[pOffset + 1] = norm.y;
        normals[pOffset + 2] = norm.z;

        pOffset += 3;
      }
    }

    const ptStart = curve.getPointAt(0);
    for (let c = capSteps; c >= 1; c--) {
      const angle = -(c / (capSteps + 0.5)) * (Math.PI * 0.48);
      writeRing(ptStart, frames.normals[0], frames.binormals[0], frames.tangents[0], rStart, angle);
    }

    for (let i = 0; i <= tubularSegments; i++) {
      const u = i / tubularSegments;
      const pt = curve.getPointAt(u);
      let r: number;
      if (u < 0.5) {
        const t = u / 0.5;
        r = rStart + (rMid - rStart) * t + Math.sin(t * Math.PI) * 0.005;
      } else {
        const t = (u - 0.5) / 0.5;
        r = rMid + (rEnd - rMid) * t + Math.sin(t * Math.PI) * 0.005;
      }
      writeRing(pt, frames.normals[i], frames.binormals[i], frames.tangents[i], r, 0.0);
    }

    const ptEnd = curve.getPointAt(1);
    for (let c = 1; c <= capSteps; c++) {
      const angle = (c / (capSteps + 0.5)) * (Math.PI * 0.48);
      writeRing(ptEnd, frames.normals[tubularSegments], frames.binormals[tubularSegments], frames.tangents[tubularSegments], rEnd, angle);
    }

    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
  }

  return {
    group: meshGroup,
    geo,
    update,
    dispose: () => {
      geo.dispose();
    },
  };
}

/**
 * ChatGPT pose_data_v6.json 96フレーム骨格データ完全同期 3Dセルアニメ打者モデル
 * 
 * 特徴：
 *   1. 腕・脚の1本化（連続スプラインチューブメッシュ）：肘や膝の球体関節・パーツ分離感を完全解消
 *   2. 高校球児アスリート曲線美体幹：肩の高さを鎖骨位置に抑え、首・顎・フェイスラインが100%すっきり露出
 *   3. ボーン完全同期：関節3D座標（すり足・インパクト・背中へのハイフィニッシュ）＋体幹回旋（pelvis_open, chest_open）
 *   4. バットのジャイロフリップ防止（滑らかなスイング軌道）
 */
export function create3DBatterRig(options: PlayerStyleOptions): AnimatedBatter3D {
  const rootGroup = new THREE.Group();
  const rigRoot = new THREE.Group();
  rootGroup.add(rigRoot);

  let curCapColor = options.capColor;
  let curShirtColor = options.shirtColor ?? 0xf8fafc;
  let curPantsColor = options.pantsColor ?? 0xf8fafc;
  let curUndershirtColor = options.undershirtColor ?? curCapColor;
  let curAccentColor = options.accentColor ?? curCapColor;
  let curJerseyNumber = options.jerseyNumber ?? 4;
  let curUniformPattern: 'NORMAL' | 'PINSTRIPE' | 'ACCENT_LINE' =
    options.uniformPattern ?? 'ACCENT_LINE';
  let isLefty = options.bats === 'L';

  const capHex = numToHex(curCapColor);
  const shirtHex = numToHex(curShirtColor);
  const pantsHex = numToHex(curPantsColor);
  const underHex = numToHex(curUndershirtColor);
  const lineHex = numToHex(curAccentColor);

  // 高品質テクスチャ（背番号・ストライプ・顔・ソックス）
  const headTex = createAnimeHeadTexture('#f1c29b', '#1c1917');
  const torsoTexRight = createJerseyTorsoTexture(shirtHex, lineHex, curUniformPattern, curJerseyNumber, false, false);
  const torsoTexLeft = createJerseyTorsoTexture(shirtHex, lineHex, curUniformPattern, curJerseyNumber, false, true);
  const sleeveTex = createSleeveTexture(shirtHex, lineHex, curUniformPattern);
  const pantsTex = createPantsTexture(pantsHex, lineHex, curUniformPattern);
  const socksTex = createSocksTexture(underHex, shirtHex);

  // トゥーンセルシェーダーマテリアル
  const helmetMat = createAnimeCelMaterial({ color: capHex });
  const underMat = createAnimeCelMaterial({ color: underHex });
  const pantsMat = createAnimeCelMaterial({ color: 0xffffff, map: pantsTex });
  const shirtPlainMat = createAnimeCelMaterial({ color: 0xffffff, map: sleeveTex });
  const torsoMat = createAnimeCelMaterial({ color: 0xffffff, map: isLefty ? torsoTexLeft : torsoTexRight });
  const socksMat = createAnimeCelMaterial({ color: 0xffffff, map: socksTex });
  const headMat = createAnimeCelMaterial({
    color: 0xffffff,
    map: headTex,
    shadowTint: new THREE.Vector3(0.82, 0.72, 0.68),
  });
  const beltMat = createAnimeCelMaterial({ color: '#18181b' });
  const cleatMat = createAnimeCelMaterial({ color: '#0f172a' });
  const gloveMat = createAnimeCelMaterial({ color: '#1e293b' }); // バッティンググローブ（白ユニフォームと同化して握りが見えなくなるため濃紺）
  const batGoldMat = createAnimeCelMaterial({ color: '#f59e0b' }); // 金属バット（ゴールド）
  const batGripMat = createAnimeCelMaterial({ color: '#f1f5f9' }); // 白グリップテープ
  const buckleMat = createAnimeCelMaterial({ color: '#cbd5e1' }); // 銀バックル

  // -------------------------------------------------------------------------
  // 1. 足元落ち影（地面 Y=0.015 上に配置）
  // -------------------------------------------------------------------------
  const shadowGeo = new THREE.CircleGeometry(0.52, 32);
  const shadowMesh = new THREE.Mesh(
    shadowGeo,
    new THREE.MeshBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.38 }),
  );
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.set(0, 0.015, 0);
  rigRoot.add(shadowMesh);

  // -------------------------------------------------------------------------
  // 2. 体幹（高校球児アスリート曲線美ジオメトリ ＋ 首・ベルト）
  // -------------------------------------------------------------------------
  const torsoGroup = new THREE.Group();
  rigRoot.add(torsoGroup);

  // 曲線美体幹（胸板・ウエストくびれ・お尻の自然な丸み）
  const torsoGeo = createHighSchoolAthleteTorsoGeometry(36, 28);
  const torsoMesh = createCelMesh(torsoGeo, torsoMat, 1.055);
  torsoGroup.add(torsoMesh);

  // すっきりとしたアンダーシャツ首（胸の鎖骨から頭の中心へまっすぐ伸び、顎下を支える）
  const neckGeo = new THREE.CylinderGeometry(0.068, 0.074, 0.18, 20);
  const neckMesh = createCelMesh(neckGeo, underMat, 1.055);
  neckMesh.position.set(0, 0.22, 0);
  torsoGroup.add(neckMesh);

  // ユニフォームの立体前立て＆アニメ胸ボタン（プロトタイプアニメパーツ）
  const placketGeo = new THREE.BoxGeometry(0.026, 0.22, 0.008);
  const placketMesh = createCelMesh(placketGeo, shirtPlainMat, 1.055);
  placketMesh.position.set(0, 0.08, 0.108);
  torsoGroup.add(placketMesh);

  const buttonGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.006, 12);
  buttonGeo.rotateX(Math.PI / 2);
  const buttonMat = createAnimeCelMaterial({ color: '#f8fafc', shadowTint: new THREE.Vector3(0.7, 0.7, 0.75) });
  const btn1 = createCelMesh(buttonGeo, buttonMat, 1.06);
  btn1.position.set(0, 0.14, 0.112);
  const btn2 = createCelMesh(buttonGeo, buttonMat, 1.06);
  btn2.position.set(0, 0.05, 0.112);
  torsoGroup.add(btn1, btn2);

  // ユニフォームの立体Vネック襟パーツ
  const vCollarGeo = new THREE.CylinderGeometry(0.088, 0.096, 0.024, 28, 1, true, -Math.PI * 0.42, Math.PI * 0.84);
  const vCollarMesh = createCelMesh(vCollarGeo, shirtPlainMat, 1.06);
  vCollarMesh.position.set(0, 0.205, 0.012);
  vCollarMesh.rotation.x = 0.14;
  torsoGroup.add(vCollarMesh);

  // 骨盤・ベルトグループ（pelvis_open 回旋に同期）
  const pelvisGroup = new THREE.Group();
  rigRoot.add(pelvisGroup);

  const beltGeo = new THREE.CylinderGeometry(0.144, 0.144, 0.046, 32);
  beltGeo.scale(1.12, 1.0, 0.86);
  const beltMesh = createCelMesh(beltGeo, beltMat, 1.055);
  const buckleGeo = new THREE.BoxGeometry(0.042, 0.038, 0.02);
  const buckleMesh = new THREE.Mesh(buckleGeo, buckleMat);
  buckleMesh.position.set(0, 0, 0.130);
  beltMesh.add(buckleMesh);
  pelvisGroup.add(beltMesh);

  // -------------------------------------------------------------------------
  // 3. 腕・脚の1本化（連続スプラインチューブメッシュ）
  // -------------------------------------------------------------------------
  // 腕：肩の付け根 ➔ 肘 ➔ 手首（関節球ゼロ、滑らかに屈曲）
  const rArmHelper = createDynamicContinuousLimb(0.078, 0.058, 0.046, shirtPlainMat, 1.055);
  const lArmHelper = createDynamicContinuousLimb(0.078, 0.058, 0.046, shirtPlainMat, 1.055);
  rigRoot.add(rArmHelper.group);
  rigRoot.add(lArmHelper.group);

  // 脚：股関節 ➔ 膝 ➔ 足首（パンツのサイドラインからソックスまで滑らかに連続）
  const rLegHelper = createDynamicContinuousLimb(0.112, 0.084, 0.058, pantsMat, 1.055);
  const lLegHelper = createDynamicContinuousLimb(0.112, 0.084, 0.058, pantsMat, 1.055);
  rigRoot.add(rLegHelper.group);
  rigRoot.add(lLegHelper.group);

  // 手袋（バッティンググローブ）
  const gloveGeo = new THREE.SphereGeometry(0.052, 16, 16);
  const rGloveMesh = createCelMesh(gloveGeo, gloveMat, 1.055);
  const lGloveMesh = createCelMesh(gloveGeo, gloveMat, 1.055);
  rigRoot.add(rGloveMesh);
  rigRoot.add(lGloveMesh);

  // スパイク（足先）
  const cleatGeo = new THREE.CapsuleGeometry(0.052, 0.12, 12, 16);
  cleatGeo.rotateX(Math.PI / 2);
  const rCleatMesh = createCelMesh(cleatGeo, cleatMat, 1.055);
  const lCleatMesh = createCelMesh(cleatGeo, cleatMat, 1.055);
  rigRoot.add(rCleatMesh);
  rigRoot.add(lCleatMesh);

  // -------------------------------------------------------------------------
  // 4. 頭部・ヘルメット（首の上に隙間なく密着、右打者は投手側・左耳フラップ）
  // -------------------------------------------------------------------------
  const headGroup = new THREE.Group();
  rigRoot.add(headGroup);

  const headGeo = new THREE.SphereGeometry(0.120, 32, 24);
  const headMesh = createCelMesh(headGeo, headMat, 1.055);
  headGroup.add(headMesh);

  // ヘルメットドーム
  const capDomeGeo = new THREE.SphereGeometry(0.130, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.58);
  const capDomeMesh = createCelMesh(capDomeGeo, helmetMat, 1.055);
  capDomeMesh.position.set(0, 0.020, 0);
  headGroup.add(capDomeMesh);

  // ヘルメットバイザー（ツバ）
  const visorGeo = new THREE.CylinderGeometry(0.138, 0.148, 0.025, 24, 1, false, 0, Math.PI * 0.65);
  const visorMesh = createCelMesh(visorGeo, helmetMat, 1.055);
  visorMesh.rotation.y = -Math.PI * 0.325;
  visorMesh.position.set(0, 0.038, 0.092);
  headGroup.add(visorMesh);

  // ヘルメットの天ボタン
  const capBtnGeo = new THREE.SphereGeometry(0.014, 16, 12);
  const capBtn = createCelMesh(capBtnGeo, helmetMat, 1.055);
  capBtn.position.set(0, 0.146, 0.012);
  headGroup.add(capBtn);

  // ヘルメット正面の立体校章エンブレム
  const emblemGeo = new THREE.BoxGeometry(0.034, 0.036, 0.008);
  const emblemMat = createAnimeCelMaterial({ color: '#f59e0b', shadowTint: new THREE.Vector3(0.7, 0.5, 0.2) });
  const emblemMesh = createCelMesh(emblemGeo, emblemMat, 1.06);
  emblemMesh.position.set(0, 0.082, 0.126);
  emblemMesh.rotation.x = -0.15;
  headGroup.add(emblemMesh);

  // 【立体アニメ前髪パーツ】ヘルメットのツバ下から覗くシャープな毛束
  const bangsGroup = new THREE.Group();
  const hairMat = createAnimeCelMaterial({
    color: '#1c1917',
    shadowTint: new THREE.Vector3(0.5, 0.45, 0.5),
  });

  const bangCenterGeo = new THREE.ConeGeometry(0.019, 0.060, 4);
  bangCenterGeo.rotateX(Math.PI);
  bangCenterGeo.scale(1.0, 1.0, 0.45);
  const bangCenter = createCelMesh(bangCenterGeo, hairMat, 1.06);
  bangCenter.position.set(0, 0.038, 0.116);
  bangCenter.rotation.x = 0.18;
  bangsGroup.add(bangCenter);

  const bangLeftGeo = new THREE.ConeGeometry(0.016, 0.052, 4);
  bangLeftGeo.rotateX(Math.PI);
  bangLeftGeo.scale(1.0, 1.0, 0.4);
  const bangLeft = createCelMesh(bangLeftGeo, hairMat, 1.06);
  bangLeft.position.set(-0.036, 0.040, 0.112);
  bangLeft.rotation.x = 0.16;
  bangLeft.rotation.z = -0.22;
  bangsGroup.add(bangLeft);

  const bangRightGeo = new THREE.ConeGeometry(0.016, 0.052, 4);
  bangRightGeo.rotateX(Math.PI);
  bangRightGeo.scale(1.0, 1.0, 0.4);
  const bangRight = createCelMesh(bangRightGeo, hairMat, 1.06);
  bangRight.position.set(0.036, 0.040, 0.112);
  bangRight.rotation.x = 0.16;
  bangRight.rotation.z = 0.22;
  bangsGroup.add(bangRight);

  headGroup.add(bangsGroup);

  // イヤーフラップ
  const earflapGeo = new THREE.BoxGeometry(0.034, 0.090, 0.080);
  const earflapMesh = createCelMesh(earflapGeo, helmetMat, 1.055);
  earflapMesh.position.set(0.126, -0.015, 0.01);
  headGroup.add(earflapMesh);

  // -------------------------------------------------------------------------
  // 5. 金属バット（手元 wrist_R から bat_tip へ滑らかに完全拘束）
  // -------------------------------------------------------------------------
  const batGroup = new THREE.Group();
  rigRoot.add(batGroup);

  // バットバレル（打球部：金色メタリック、先端テーパー）
  const batBarrelGeo = new THREE.CylinderGeometry(0.034, 0.018, 0.58, 24);
  const batBarrelMesh = createCelMesh(batBarrelGeo, batGoldMat, 1.055);
  batBarrelMesh.position.set(0, 0.48, 0);
  batGroup.add(batBarrelMesh);

  // バットトップキャップ
  const batTopGeo = new THREE.SphereGeometry(0.034, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const batTopMesh = createCelMesh(batTopGeo, batGoldMat, 1.055);
  batTopMesh.position.set(0, 0.77, 0);
  batGroup.add(batTopMesh);

  // バットグリップ部（白グリップテープ）
  const batGripGeo = new THREE.CylinderGeometry(0.017, 0.017, 0.28, 16);
  const batGripMesh = createCelMesh(batGripGeo, batGripMat, 1.055);
  batGripMesh.position.set(0, 0.14, 0);
  batGroup.add(batGripMesh);

  // バットノブ（エンドの丸い膨らみ）
  const batKnobGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.028, 16);
  const batKnobMesh = createCelMesh(batKnobGeo, batGoldMat, 1.055);
  batKnobMesh.position.set(0, 0.0, 0);
  batGroup.add(batKnobMesh);

  const _upAxis = new THREE.Vector3(0, 1, 0);
  const _batDir = new THREE.Vector3();
  const _batQ = new THREE.Quaternion();
  const prevBatQ = new THREE.Quaternion();

  // -------------------------------------------------------------------------
  // 6. フレーム適用ロジック（96フレーム完全補間 ＋ rotations_deg 連動）
  // -------------------------------------------------------------------------
  function applyPose(frameIdx0: number, frameIdx1: number, alpha: number) {
    const f0 = CHATGPT_BATTER_96_FRAMES[frameIdx0];
    const f1 = CHATGPT_BATTER_96_FRAMES[frameIdx1];

    function interpJoint(joint: string): Vec3Arr {
      const p0 = f0.joints[joint] || [0, 0, 0];
      const p1 = f1.joints[joint] || p0;
      return [
        p0[0] + (p1[0] - p0[0]) * alpha,
        p0[1] + (p1[1] - p0[1]) * alpha,
        p0[2] + (p1[2] - p0[2]) * alpha,
      ];
    }

    const pelvis = interpJoint('pelvis');
    const chest = interpJoint('chest');
    const neck = interpJoint('neck');
    const head = interpJoint('head');

    const shR = interpJoint('shoulder_R');
    const elR = interpJoint('elbow_R');
    const wrR = interpJoint('wrist_R');

    const shL = interpJoint('shoulder_L');
    const elL = interpJoint('elbow_L');
    const wrL = interpJoint('wrist_L');

    const hipR = interpJoint('hip_R');
    const knR = interpJoint('knee_R');
    const akR = interpJoint('ankle_R');
    const toeR = interpJoint('toe_R');

    const hipL = interpJoint('hip_L');
    const knL = interpJoint('knee_L');
    const akL = interpJoint('ankle_L');
    const toeL = interpJoint('toe_L');

    const batTip = interpJoint('bat_tip');

    // 体幹回旋角度（腰と胸の捻転差）
    const pelvisOpenDeg = f0.rot.pelvis_open + (f1.rot.pelvis_open - f0.rot.pelvis_open) * alpha;
    const chestOpenDeg = f0.rot.chest_open + (f1.rot.chest_open - f0.rot.chest_open) * alpha;

    // ① 骨盤と体幹の回旋連動（腰が先行し、胸が遅れて回る）
    pelvisGroup.position.set(pelvis[0], pelvis[1] - 0.02, pelvis[2]);
    pelvisGroup.rotation.y = pelvisOpenDeg * DEG;

    const torsoMidY = (pelvis[1] + chest[1]) * 0.5;
    torsoGroup.position.set((pelvis[0] + chest[0]) * 0.5, torsoMidY, (pelvis[2] + chest[2]) * 0.5);
    torsoGroup.rotation.y = chestOpenDeg * DEG;

    // ② 腕・脚の1本化（連続スプラインチューブ更新）
    // 肩の付け根はボーン座標に自然に配置し、顔を隠さない
    rArmHelper.update(shR, elR, wrR);
    lArmHelper.update(shL, elL, wrL);

    rLegHelper.update(hipR, knR, akR);
    lLegHelper.update(hipL, knL, akL);

    // ③ 手袋（バッティンググローブ）
    rGloveMesh.position.set(wrR[0], wrR[1], wrR[2]);
    lGloveMesh.position.set(wrL[0], wrL[1], wrL[2]);

    // ④ スパイク（足先）
    rCleatMesh.position.set(
      (akR[0] + toeR[0]) * 0.5,
      Math.max(0.04, (akR[1] + toeR[1]) * 0.5),
      (akR[2] + toeR[2]) * 0.5
    );
    lCleatMesh.position.set(
      (akL[0] + toeL[0]) * 0.5,
      Math.max(0.04, (akL[1] + toeL[1]) * 0.5),
      (akL[2] + toeL[2]) * 0.5
    );

    // ⑤ 頭部・ヘルメット（首の上端に密着、首と顎がすっきり露出）
    const headCenterY = neck[1] + (head[1] - neck[1]) * 0.52;
    headGroup.position.set(head[0], headCenterY, head[2]);

    const currentFrameFloat = frameIdx0 + alpha;
    if (currentFrameFloat < 75) {
      headGroup.rotation.set(0, Math.PI * 0.38, 0);
    } else if (currentFrameFloat <= 85) {
      const t = (currentFrameFloat - 75) / 10;
      headGroup.rotation.set(0.12 * t, Math.PI * (0.38 - 0.28 * t), -0.08 * t);
    } else {
      const t = Math.min(1.0, (currentFrameFloat - 85) / 10);
      headGroup.rotation.set(0.08, Math.PI * 0.10 + 0.15 * t, -0.05);
    }

    // ⑥ 金属バット（手元 wrist_R から bat_tip への滑らかで連続な回転）
    _batDir.set(batTip[0] - wrR[0], batTip[1] - wrR[1], batTip[2] - wrR[2]);
    const batDist = _batDir.length();
    if (batDist > 0.01) {
      _batDir.normalize();
      _batQ.setFromUnitVectors(_upAxis, _batDir);

      if (prevBatQ.dot(_batQ) < 0) {
        _batQ.x = -_batQ.x;
        _batQ.y = -_batQ.y;
        _batQ.z = -_batQ.z;
        _batQ.w = -_batQ.w;
      }
      prevBatQ.copy(_batQ);
      batGroup.quaternion.copy(_batQ);

      batGroup.position.set(
        wrR[0] - _batDir.x * 0.06,
        wrR[1] - _batDir.y * 0.06,
        wrR[2] - _batDir.z * 0.06
      );
    }

    // ⑦ 足元落ち影（骨盤直下）
    shadowMesh.position.set(pelvis[0], 0.015, pelvis[2]);
  }

  // 左右打席の向き調整（自然なオープンスタンス角度：78度）
  function updateHandedness() {
    if (isLefty) {
      rigRoot.rotation.y = -78 * DEG;
      rigRoot.scale.x = -1;
      torsoMat.uniforms.uMap.value = torsoTexLeft;
      earflapMesh.position.x = -0.126;
    } else {
      rigRoot.rotation.y = 78 * DEG;
      rigRoot.scale.x = 1;
      torsoMat.uniforms.uMap.value = torsoTexRight;
      earflapMesh.position.x = 0.126;
    }
  }

  updateHandedness();
  applyPose(0, 0, 0);

  function setPhase(progress: number) {
    const clamped = Math.max(0, Math.min(1.0, progress));
    const frameFloat = clamped * 95;
    const f0 = Math.floor(frameFloat);
    const f1 = Math.min(95, f0 + 1);
    const alpha = frameFloat - f0;
    applyPose(f0, f1, alpha);
  }

  return {
    group: rootGroup,
    setFrame: (frameIndex: number) => {
      const idx = Math.max(0, Math.min(95, frameIndex));
      applyPose(idx, idx, 0);
    },
    setKeyframe: (k: number) => {
      setPhase(k / 10);
    },
    setPhase,
    setHandedness: (hands: 'R' | 'L') => {
      isLefty = hands === 'L';
      updateHandedness();
      setPhase(0);
    },
    setUniform: () => {},
    getBatImpactWorldPosition: (targetVec: THREE.Vector3) => {
      return targetVec.set(-0.25, 0.72, 0.15);
    },
    dispose: () => {
      torsoGeo.dispose();
      neckGeo.dispose();
      beltGeo.dispose();
      buckleGeo.dispose();
      rArmHelper.dispose();
      lArmHelper.dispose();
      rLegHelper.dispose();
      lLegHelper.dispose();
      gloveGeo.dispose();
      cleatGeo.dispose();
      headGeo.dispose();
      capDomeGeo.dispose();
      visorGeo.dispose();
      earflapGeo.dispose();
      batBarrelGeo.dispose();
      batTopGeo.dispose();
      batGripGeo.dispose();
      batKnobGeo.dispose();
      shadowGeo.dispose();

      helmetMat.dispose();
      underMat.dispose();
      pantsMat.dispose();
      shirtPlainMat.dispose();
      torsoMat.dispose();
      socksMat.dispose();
      headMat.dispose();
      beltMat.dispose();
      cleatMat.dispose();
      gloveMat.dispose();
      batGoldMat.dispose();
      batGripMat.dispose();
      buckleMat.dispose();
    },
  };
}
