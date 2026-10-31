import * as THREE from 'three';
import {
  type PlayerStyleOptions,
  numToHex,
  createAnimeCelMaterial,
  createCelMesh,
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
 * バッター専用の精悍なアニメ調フェイス・テクスチャ
 * @param isClenched スイング・インパクト時の歯を食いしばる気迫の表情
 */
function createAnimeBatterHeadTexture(skinHex = '#f1c29b', hairHex = '#1c1917', isClenched = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // 1. 肌ベース色
  ctx.fillStyle = skinHex;
  ctx.fillRect(0, 0, 512, 512);

  // 2. 側頭部・後頭部の精悍な刈り上げ
  ctx.fillStyle = hairHex;
  ctx.fillRect(0, 0, 512, 185);
  ctx.fillRect(0, 185, 148, 175);
  ctx.fillRect(364, 185, 148, 175);

  // もみあげ
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

  // 3. ヘルメットのツバ下のシャープなセルアニメ影
  ctx.fillStyle = 'rgba(160, 100, 68, 0.42)';
  ctx.fillRect(148, 175, 216, 52);

  // 4. アニメ調の鋭いキリッとした眉（闘志・集中）
  ctx.strokeStyle = '#18181b';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';

  if (!isClenched) {
    // 集中したキリッとした眉
    ctx.beginPath();
    ctx.moveTo(194, 222);
    ctx.lineTo(242, 236);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(318, 222);
    ctx.lineTo(270, 236);
    ctx.stroke();
  } else {
    // インパクト時：力強くつり上がった気迫の眉
    ctx.beginPath();
    ctx.moveTo(192, 218);
    ctx.lineTo(244, 240);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(320, 218);
    ctx.lineTo(268, 240);
    ctx.stroke();

    // 眉間の力強いシワ
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(250, 228);
    ctx.lineTo(252, 244);
    ctx.moveTo(262, 228);
    ctx.lineTo(260, 244);
    ctx.stroke();
  }

  // 5. アニメ調の鋭い瞳（斜め前方のマウンド・白球を鋭く睨む瞳孔・ハイライト）
  const drawBatterEye = (cx: number, cy: number, lookLeft: boolean) => {
    // 白目
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx - 22, cy + 2);
    ctx.quadraticCurveTo(cx, cy - 16, cx + 22, cy + 2);
    ctx.quadraticCurveTo(cx, cy + 14, cx - 22, cy + 2);
    ctx.closePath();
    ctx.fill();

    // 上まぶたの太い黒アイライン（アニメ風）
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx - 23, cy + 2);
    ctx.quadraticCurveTo(cx, cy - 16, cx + 23, cy + 2);
    ctx.stroke();

    // 二重まぶたライン
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.65)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - 16, cy - 12);
    ctx.quadraticCurveTo(cx, cy - 18, cx + 18, cy - 10);
    ctx.stroke();

    // 黒目（マウンドを見据えてやや左寄り・中心寄り）
    const eyeOffsetX = lookLeft ? -4 : -1;
    ctx.fillStyle = '#1e1b18';
    ctx.beginPath();
    ctx.arc(cx + eyeOffsetX, cy + 1, 10, 0, Math.PI * 2);
    ctx.fill();

    // 瞳のハイライト（大＋小でアニメ的な輝き）
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx + eyeOffsetX - 3, cy - 2, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + eyeOffsetX + 4, cy + 3, 1.8, 0, Math.PI * 2);
    ctx.fill();
  };

  drawBatterEye(218, 254, true);
  drawBatterEye(294, 254, true);

  // 6. アニメ調の鼻筋とセル影
  ctx.fillStyle = 'rgba(155, 95, 62, 0.6)';
  ctx.beginPath();
  ctx.moveTo(256, 258);
  ctx.lineTo(245, 302);
  ctx.lineTo(258, 305);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(256, 262);
  ctx.lineTo(248, 302);
  ctx.stroke();

  // 7. 口元
  if (!isClenched) {
    // 集中した一文字口
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(234, 338);
    ctx.quadraticCurveTo(256, 334, 278, 338);
    ctx.stroke();
  } else {
    // インパクト時：食いしばった白い歯と叫びの口
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(232, 330, 48, 16, 4);
    ctx.fill();
    ctx.stroke();

    // 歯の噛み合わせライン
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(234, 338);
    ctx.lineTo(278, 338);
    ctx.stroke();
    // 歯の縦筋
    ctx.beginPath();
    ctx.moveTo(246, 330); ctx.lineTo(246, 346);
    ctx.moveTo(256, 330); ctx.lineTo(256, 346);
    ctx.moveTo(266, 330); ctx.lineTo(266, 346);
    ctx.stroke();
  }

  // 頬の気迫の斜線（アニメ的演出）
  ctx.strokeStyle = 'rgba(180, 83, 9, 0.55)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(195, 290); ctx.lineTo(205, 300);
  ctx.moveTo(202, 288); ctx.lineTo(212, 298);
  ctx.moveTo(300, 290); ctx.lineTo(310, 300);
  ctx.moveTo(307, 288); ctx.lineTo(317, 298);
  ctx.stroke();

  // 顎下のセル影
  ctx.fillStyle = 'rgba(155, 95, 62, 0.45)';
  ctx.beginPath();
  ctx.ellipse(256, 395, 65, 24, 0, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 高校球児らしい引き締まった自然なプロポーションの体幹ジオメトリ
 */
function createHighSchoolAthleteTorsoGeometry(radialSegments = 32, heightSegments = 24): THREE.BufferGeometry {
  const profile = [
    { t: 0.00, rx: 0.134, fz: 0.088, bz: 0.108, cz: 0.008 },
    { t: 0.14, rx: 0.142, fz: 0.092, bz: 0.114, cz: 0.008 },
    { t: 0.24, rx: 0.138, fz: 0.088, bz: 0.102, cz: 0.006 },
    { t: 0.38, rx: 0.126, fz: 0.080, bz: 0.090, cz: -0.004 },
    { t: 0.54, rx: 0.142, fz: 0.096, bz: 0.094, cz: -0.008 },
    { t: 0.72, rx: 0.162, fz: 0.108, bz: 0.098, cz: -0.010 },
    { t: 0.88, rx: 0.166, fz: 0.096, bz: 0.088, cz: -0.005 },
    { t: 0.95, rx: 0.145, fz: 0.082, bz: 0.078, cz: 0.000 },
    { t: 1.00, rx: 0.095, fz: 0.072, bz: 0.070, cz: 0.004 },
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
 * 腕・脚の1本化（連続スプライン・ダイナミックチューブメッシュ）
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

  const mainMesh = new THREE.Mesh(geo, mat);

  const outlineMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      uOutlineColor: { value: new THREE.Color(0x0f172a) },
      uOutlineWidth: { value: (outlineScale - 1.0) * 0.08 },
    },
    vertexShader: `
      uniform float uOutlineWidth;
      void main() {
        vec3 norm = normalize(normal);
        vec3 pos = position + norm * uOutlineWidth;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uOutlineColor;
      void main() {
        gl_FragColor = vec4(uOutlineColor, 1.0);
      }
    `,
  });
  const outlineMesh = new THREE.Mesh(geo, outlineMat);

  const meshGroup = new THREE.Group();
  meshGroup.add(mainMesh);
  meshGroup.add(outlineMesh);

  const _vA = new THREE.Vector3();
  const _vB = new THREE.Vector3();
  const _vC = new THREE.Vector3();
  const _bone1 = new THREE.Vector3();
  const _bone2 = new THREE.Vector3();
  const _tan1 = new THREE.Vector3();
  const _tan2 = new THREE.Vector3();

  function update(start: Vec3Arr, mid: Vec3Arr, end: Vec3Arr) {
    _vA.set(start[0], start[1], start[2]);
    _vB.set(mid[0], mid[1], mid[2]);
    _vC.set(end[0], end[1], end[2]);

    _bone1.subVectors(_vB, _vA);
    _bone2.subVectors(_vC, _vB);
    _tan1.copy(_bone1).normalize();
    _tan2.copy(_bone2).normalize();

    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const normAttr = geo.attributes.normal as THREE.BufferAttribute;

    const getRingFrame = (u: number) => {
      const pt = new THREE.Vector3();
      const tan = new THREE.Vector3();
      let r: number;

      if (u < 0.46) {
        const t = u / 0.46;
        pt.lerpVectors(_vA, _vB, t);
        tan.copy(_tan1);
        r = rStart + (rMid - rStart) * t;
      } else if (u <= 0.54) {
        const t = (u - 0.46) / 0.08;
        // 関節部（膝・肘の屈曲点）
        pt.copy(_vB);
        tan.lerpVectors(_tan1, _tan2, t).normalize();
        r = rMid + Math.sin(t * Math.PI) * 0.005;
      } else {
        const t = (u - 0.54) / 0.46;
        pt.lerpVectors(_vB, _vC, t);
        tan.copy(_tan2);
        r = rMid + (rEnd - rMid) * t;
      }

      let nx = -tan.y, ny = tan.x, nz = 0;
      const nLen = Math.hypot(nx, ny, nz);
      const n = nLen > 0.01 ? new THREE.Vector3(nx / nLen, ny / nLen, 0) : new THREE.Vector3(1, 0, 0);
      const bn = new THREE.Vector3().crossVectors(tan, n).normalize();

      return { pt, tan, n, bn, r };
    };

    let writeIdx = 0;
    const writeRing = (
      center: THREE.Vector3,
      n: THREE.Vector3,
      bn: THREE.Vector3,
      tan: THREE.Vector3,
      radius: number,
      hemisphereAngle: number = 0
    ) => {
      const cosH = Math.cos(hemisphereAngle);
      const sinH = Math.sin(hemisphereAngle);
      const effRadius = radius * cosH;
      const offAlongTan = radius * sinH;

      for (let j = 0; j <= radialSegments; j++) {
        const v = (j / radialSegments) * Math.PI * 2;
        const cx = -Math.cos(v);
        const cy = Math.sin(v);

        const nx = cx * n.x + cy * bn.x;
        const ny = cx * n.y + cy * bn.y;
        const nz = cx * n.z + cy * bn.z;

        const px = center.x + nx * effRadius + tan.x * offAlongTan;
        const py = center.y + ny * effRadius + tan.y * offAlongTan;
        const pz = center.z + nz * effRadius + tan.z * offAlongTan;

        posAttr.setXYZ(writeIdx, px, py, pz);
        normAttr.setXYZ(writeIdx, nx * cosH + tan.x * sinH, ny * cosH + tan.y * sinH, nz * cosH + tan.z * sinH);
        writeIdx++;
      }
    };

    const frame0 = getRingFrame(0);
    for (let c = capSteps; c >= 1; c--) {
      const angle = -(c / (capSteps + 0.5)) * (Math.PI * 0.48);
      writeRing(frame0.pt, frame0.n, frame0.bn, frame0.tan, rStart, angle);
    }

    for (let i = 0; i <= tubularSegments; i++) {
      const u = i / tubularSegments;
      const fr = getRingFrame(u);
      writeRing(fr.pt, fr.n, fr.bn, fr.tan, fr.r, 0.0);
    }

    const frame1 = getRingFrame(1);
    for (let c = 1; c <= capSteps; c++) {
      const angle = (c / (capSteps + 0.5)) * (Math.PI * 0.48);
      writeRing(frame1.pt, frame1.n, frame1.bn, frame1.tan, rEnd, angle);
    }

    posAttr.needsUpdate = true;
    normAttr.needsUpdate = true;
  }

  return {
    group: meshGroup,
    geo,
    update,
    dispose: () => {
      geo.dispose();
      outlineMat.dispose();
    },
  };
}

/**
 * スイング軌跡（バットスウォッシュ / 残像エフェクト）メッシュ
 * スイングの通過した扇状の光の軌跡を白い半透明セル調で描画
 */
function createBatSwingTrail() {
  const maxSegments = 16;
  const positions = new Float32Array((maxSegments + 1) * 2 * 3);
  const uvs = new Float32Array((maxSegments + 1) * 2 * 2);
  const indices: number[] = [];

  for (let i = 0; i < maxSegments; i++) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = (i + 1) * 2;
    const d = (i + 1) * 2 + 1;
    indices.push(a, b, d);
    indices.push(a, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color('#ffffff') },
      uRimColor: { value: new THREE.Color('#38bdf8') },
      uOpacity: { value: 0.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform vec3 uRimColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        // vUv.x: 0 (バット根元) 〜 1 (バット先端)
        // vUv.y: 0 (軌跡の末尾・古い) 〜 1 (バット直近・最新)
        float trailFade = smoothstep(0.0, 1.0, vUv.y);
        float widthFade = smoothstep(0.1, 0.9, vUv.x);
        vec3 col = mix(uRimColor, uColor, vUv.x * 0.7 + 0.3);
        float alpha = trailFade * widthFade * uOpacity * 0.75;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.visible = false;

  return {
    mesh,
    geo,
    mat,
    update: (gripPoints: THREE.Vector3[], tipPoints: THREE.Vector3[], opacity: number) => {
      if (opacity <= 0.01 || gripPoints.length < 2) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      mat.uniforms.uOpacity.value = opacity;

      const posAttr = geo.attributes.position as THREE.BufferAttribute;
      const uvAttr = geo.attributes.uv as THREE.BufferAttribute;
      const count = Math.min(gripPoints.length, maxSegments + 1);

      for (let i = 0; i < count; i++) {
        const u = i / (count - 1);
        const grip = gripPoints[i];
        const tip = tipPoints[i];

        // 根元
        posAttr.setXYZ(i * 2 + 0, grip.x, grip.y, grip.z);
        uvAttr.setXY(i * 2 + 0, 0.0, u);

        // 先端
        posAttr.setXYZ(i * 2 + 1, tip.x, tip.y, tip.z);
        uvAttr.setXY(i * 2 + 1, 1.0, u);
      }
      posAttr.needsUpdate = true;
      uvAttr.needsUpdate = true;
    },
    dispose: () => {
      geo.dispose();
      mat.dispose();
    },
  };
}

/**
 * インパクト瞬間のアニメ調スパーク＆衝撃波リング
 */
function createImpactFlashFX() {
  const group = new THREE.Group();

  // 1. 十字光彩（Cross Spark）
  const sparkGeo = new THREE.BufferGeometry();
  const sLen = 0.32;
  const sWidth = 0.038;
  const sparkVerts = new Float32Array([
    // 横ブレード
    -sLen, 0, 0,   sLen, 0, 0,   0, sWidth, 0,
    -sLen, 0, 0,   0, -sWidth, 0,  sLen, 0, 0,
    // 縦ブレード
    0, -sLen, 0,   0, sLen, 0,   sWidth, 0, 0,
    0, -sLen, 0,   -sWidth, 0, 0,  0, sLen, 0,
  ]);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkVerts, 3));
  const sparkMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const sparkMesh = new THREE.Mesh(sparkGeo, sparkMat);
  group.add(sparkMesh);

  // 2. 衝撃波リング（Shockwave Ring）
  const ringGeo = new THREE.RingGeometry(0.04, 0.26, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  group.add(ringMesh);

  group.visible = false;

  return {
    group,
    setIntensity: (intensity: number, pos: THREE.Vector3) => {
      if (intensity <= 0.01) {
        group.visible = false;
        return;
      }
      group.visible = true;
      group.position.copy(pos);
      sparkMat.opacity = Math.min(1.0, intensity * 1.5);
      sparkMesh.scale.setScalar(0.7 + intensity * 0.8);
      ringMat.opacity = Math.min(0.85, intensity);
      ringMesh.scale.setScalar(0.4 + (1.0 - intensity) * 1.6);
    },
    dispose: () => {
      sparkGeo.dispose();
      sparkMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
    },
  };
}

/**
 * アニメ調打者モデル（ChatGPT 96フレーム骨格完全同期）
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

  // 高品質アニメテクスチャ（通常時＆食いしばり時の2種）
  const headTexFocused = createAnimeBatterHeadTexture('#f1c29b', '#1c1917', false);
  const headTexClenched = createAnimeBatterHeadTexture('#f1c29b', '#1c1917', true);

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
    map: headTexFocused,
    shadowTint: new THREE.Vector3(0.82, 0.72, 0.68),
  });
  const beltMat = createAnimeCelMaterial({ color: '#18181b' });
  const cleatMat = createAnimeCelMaterial({ color: '#0f172a' });

  // バッティンググローブ・リストバンド・防具マテリアル
  const battingGloveWhiteMat = createAnimeCelMaterial({ color: '#ffffff', shadowTint: new THREE.Vector3(0.85, 0.88, 0.92) });
  const battingGloveAccentMat = createAnimeCelMaterial({ color: '#1e3a8a', shadowTint: new THREE.Vector3(0.6, 0.6, 0.7) });
  const wristbandMat = createAnimeCelMaterial({ color: '#dc2626' }); // 情熱的な赤のリストバンド
  const guardMat = createAnimeCelMaterial({ color: '#1e293b', shadowTint: new THREE.Vector3(0.5, 0.55, 0.65) }); // エルボー＆レッグガード
  const guardTrimMat = createAnimeCelMaterial({ color: '#cbd5e1' });

  const batGoldMat = createAnimeCelMaterial({ color: '#f59e0b', shadowTint: new THREE.Vector3(0.75, 0.55, 0.25) }); // 金属バット（ゴールド）
  const batGripMat = createAnimeCelMaterial({ color: '#f8fafc' }); // 白グリップテープ
  const buckleMat = createAnimeCelMaterial({ color: '#cbd5e1' }); // 銀バックル
  const highlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.82 }); // アニメ光沢線

  // -------------------------------------------------------------------------
  // 1. 足元落ち影
  // -------------------------------------------------------------------------
  const shadowGeo = new THREE.CircleGeometry(0.52, 32);
  const shadowMesh = new THREE.Mesh(
    shadowGeo,
    new THREE.MeshBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.40 }),
  );
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.set(0, 0.015, 0);
  rigRoot.add(shadowMesh);

  // -------------------------------------------------------------------------
  // 2. 体幹（高校球児アスリート曲線美ジオメトリ ＋ 首・前立て・ボタン・襟）
  // -------------------------------------------------------------------------
  const torsoGroup = new THREE.Group();
  rigRoot.add(torsoGroup);

  const torsoGeo = createHighSchoolAthleteTorsoGeometry(36, 28);
  const torsoMesh = createCelMesh(torsoGeo, torsoMat, 1.055);
  torsoGroup.add(torsoMesh);

  const neckGeo = new THREE.CylinderGeometry(0.068, 0.074, 0.18, 20);
  const neckMesh = createCelMesh(neckGeo, underMat, 1.055);
  neckMesh.position.set(0, 0.22, 0);
  torsoGroup.add(neckMesh);

  // 立体前立て＆立体ボタン
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

  // 立体Vネック襟
  const vCollarGeo = new THREE.CylinderGeometry(0.088, 0.096, 0.024, 28, 1, true, -Math.PI * 0.42, Math.PI * 0.84);
  const vCollarMesh = createCelMesh(vCollarGeo, shirtPlainMat, 1.06);
  vCollarMesh.position.set(0, 0.205, 0.012);
  vCollarMesh.rotation.x = 0.14;
  torsoGroup.add(vCollarMesh);

  // 骨盤・ベルト
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
  const rArmHelper = createDynamicContinuousLimb(0.078, 0.058, 0.046, shirtPlainMat, 1.055);
  const lArmHelper = createDynamicContinuousLimb(0.078, 0.058, 0.046, shirtPlainMat, 1.055);
  rigRoot.add(rArmHelper.group);
  rigRoot.add(lArmHelper.group);

  const rLegHelper = createDynamicContinuousLimb(0.112, 0.084, 0.058, pantsMat, 1.055);
  const lLegHelper = createDynamicContinuousLimb(0.112, 0.084, 0.058, pantsMat, 1.055);
  rigRoot.add(rLegHelper.group);
  rigRoot.add(lLegHelper.group);

  // -------------------------------------------------------------------------
  // 4. アニメ調バッティンググローブ ＆ リストバンド
  // -------------------------------------------------------------------------
  function createBattingHand(isRight: boolean) {
    const g = new THREE.Group();

    // 手袋本体（白レザーベース）
    const handGeo = new THREE.BoxGeometry(0.068, 0.076, 0.042);
    const handMesh = createCelMesh(handGeo, battingGloveWhiteMat, 1.06);
    g.add(handMesh);

    // 手の甲のプロテクターガードプレート（アクセントカラー）
    const guardPlateGeo = new THREE.BoxGeometry(0.054, 0.052, 0.012);
    const guardPlate = createCelMesh(guardPlateGeo, battingGloveAccentMat, 1.06);
    guardPlate.position.set(0, 0, isRight ? 0.022 : -0.022);
    g.add(guardPlate);

    // 手首のリストバンド（赤：強打者スタイル）
    const wristbandGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.038, 16);
    const wristbandMesh = createCelMesh(wristbandGeo, wristbandMat, 1.06);
    wristbandMesh.position.set(0, -0.045, 0);
    g.add(wristbandMesh);

    return g;
  }

  const rHandGroup = createBattingHand(true);
  const lHandGroup = createBattingHand(false);
  rigRoot.add(rHandGroup);
  rigRoot.add(lHandGroup);

  // -------------------------------------------------------------------------
  // 5. アニメ調プロテクター（エルボーガード ＆ レッグガード）
  // -------------------------------------------------------------------------
  // エルボーガード（投手側の肘に装着：右打者は左肘、左打者は右肘）
  const elbowGuardGroup = new THREE.Group();
  const elbowGuardGeo = new THREE.CylinderGeometry(0.068, 0.074, 0.12, 16, 1, false, -Math.PI * 0.45, Math.PI * 0.9);
  const elbowGuardMesh = createCelMesh(elbowGuardGeo, guardMat, 1.06);
  elbowGuardGroup.add(elbowGuardMesh);
  // エルボーガードのベルト
  const elbowStrapGeo = new THREE.CylinderGeometry(0.070, 0.076, 0.02, 16);
  const elbowStrap = new THREE.Mesh(elbowStrapGeo, guardTrimMat);
  elbowGuardGroup.add(elbowStrap);
  rigRoot.add(elbowGuardGroup);

  // レッグガード（投手側の前足すね〜足の甲に装着）
  const legGuardGroup = new THREE.Group();
  const shinGuardGeo = new THREE.CylinderGeometry(0.088, 0.072, 0.28, 16, 1, false, 0, Math.PI);
  const shinGuardMesh = createCelMesh(shinGuardGeo, guardMat, 1.06);
  shinGuardMesh.position.set(0, 0.14, 0.02);
  legGuardGroup.add(shinGuardMesh);
  // 足の甲ガードフラップ
  const instepGeo = new THREE.BoxGeometry(0.078, 0.095, 0.02);
  const instepMesh = createCelMesh(instepGeo, guardMat, 1.06);
  instepMesh.position.set(0, 0.015, 0.075);
  instepMesh.rotation.x = 0.52;
  legGuardGroup.add(instepMesh);
  rigRoot.add(legGuardGroup);

  // -------------------------------------------------------------------------
  // 6. スパイク（黒＋サイドホワイトライン＆白ソール）
  // -------------------------------------------------------------------------
  function createAnimeCleat() {
    const g = new THREE.Group();
    const cleatGeo = new THREE.CapsuleGeometry(0.052, 0.12, 12, 16);
    cleatGeo.rotateX(Math.PI / 2);
    const cleatMain = createCelMesh(cleatGeo, cleatMat, 1.055);
    g.add(cleatMain);

    // 白い靴底（ソール）
    const soleGeo = new THREE.BoxGeometry(0.108, 0.016, 0.21);
    const soleMat = createAnimeCelMaterial({ color: '#f8fafc' });
    const sole = new THREE.Mesh(soleGeo, soleMat);
    sole.position.set(0, -0.046, 0);
    g.add(sole);

    return g;
  }
  const rCleatGroup = createAnimeCleat();
  const lCleatGroup = createAnimeCleat();
  rigRoot.add(rCleatGroup);
  rigRoot.add(lCleatGroup);

  // -------------------------------------------------------------------------
  // 7. 頭部・ヘルメット（アニメハイライト ＆ 曲面イヤーガード ＆ 立体前髪）
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

  // アニメ特有のヘルメット光沢ハイライト（頭頂部〜斜めに走る白い反射光ストライプ）
  const helmetHighlightGeo = new THREE.TorusGeometry(0.131, 0.007, 8, 24, Math.PI * 0.42);
  const helmetHighlightMesh = new THREE.Mesh(helmetHighlightGeo, highlightMat);
  helmetHighlightMesh.rotation.x = Math.PI * 0.45;
  helmetHighlightMesh.rotation.y = -Math.PI * 0.25;
  helmetHighlightMesh.position.set(0.01, 0.07, 0.03);
  headGroup.add(helmetHighlightMesh);

  // ヘルメットバイザー（ツバ）
  const visorGeo = new THREE.CylinderGeometry(0.138, 0.152, 0.024, 24, 1, false, 0, Math.PI * 0.65);
  const visorMesh = createCelMesh(visorGeo, helmetMat, 1.055);
  visorMesh.rotation.y = -Math.PI * 0.325;
  visorMesh.position.set(0, 0.038, 0.095);
  headGroup.add(visorMesh);

  // ツバのエッジの白いアニメ反射ライン
  const visorRimGeo = new THREE.TorusGeometry(0.153, 0.004, 6, 20, Math.PI * 0.62);
  const visorRimMesh = new THREE.Mesh(visorRimGeo, highlightMat);
  visorRimMesh.rotation.x = Math.PI * 0.5;
  visorRimMesh.rotation.z = -Math.PI * 0.31;
  visorRimMesh.position.set(0, 0.030, 0.098);
  headGroup.add(visorRimMesh);

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

  const bangCenterGeo = new THREE.ConeGeometry(0.020, 0.065, 4);
  bangCenterGeo.rotateX(Math.PI);
  bangCenterGeo.scale(1.0, 1.0, 0.45);
  const bangCenter = createCelMesh(bangCenterGeo, hairMat, 1.06);
  bangCenter.position.set(0, 0.036, 0.118);
  bangCenter.rotation.x = 0.20;
  bangsGroup.add(bangCenter);

  const bangLeftGeo = new THREE.ConeGeometry(0.017, 0.055, 4);
  bangLeftGeo.rotateX(Math.PI);
  bangLeftGeo.scale(1.0, 1.0, 0.4);
  const bangLeft = createCelMesh(bangLeftGeo, hairMat, 1.06);
  bangLeft.position.set(-0.038, 0.038, 0.114);
  bangLeft.rotation.x = 0.18;
  bangLeft.rotation.z = -0.24;
  bangsGroup.add(bangLeft);

  const bangRightGeo = new THREE.ConeGeometry(0.017, 0.055, 4);
  bangRightGeo.rotateX(Math.PI);
  bangRightGeo.scale(1.0, 1.0, 0.4);
  const bangRight = createCelMesh(bangRightGeo, hairMat, 1.06);
  bangRight.position.set(0.038, 0.038, 0.114);
  bangRight.rotation.x = 0.18;
  bangRight.rotation.z = 0.24;
  bangsGroup.add(bangRight);

  headGroup.add(bangsGroup);

  // 滑らかな曲面イヤーガード（耳当て）
  const earflapGroup = new THREE.Group();
  const earUpperGeo = new THREE.CylinderGeometry(0.065, 0.075, 0.09, 16, 1, false, 0, Math.PI * 0.85);
  const earUpperMesh = createCelMesh(earUpperGeo, helmetMat, 1.055);
  earUpperMesh.rotation.z = Math.PI * 0.5;
  earUpperMesh.position.set(0.075, -0.010, 0.01);
  earflapGroup.add(earUpperMesh);

  const earFlapLowerGeo = new THREE.BoxGeometry(0.024, 0.075, 0.068);
  const earFlapLowerMesh = createCelMesh(earFlapLowerGeo, helmetMat, 1.055);
  earFlapLowerMesh.position.set(0.124, -0.035, 0.015);
  earflapGroup.add(earFlapLowerMesh);
  headGroup.add(earflapGroup);

  // -------------------------------------------------------------------------
  // 8. 金属バット（ゴールドバレル ＋ アニメ光沢線 ＋ 白グリップテープ）
  // -------------------------------------------------------------------------
  const batGroup = new THREE.Group();
  rigRoot.add(batGroup);

  const batBarrelGeo = new THREE.CylinderGeometry(0.034, 0.018, 0.58, 24);
  const batBarrelMesh = createCelMesh(batBarrelGeo, batGoldMat, 1.055);
  batBarrelMesh.position.set(0, 0.48, 0);
  batGroup.add(batBarrelMesh);

  // 金属バットのアニメハイライトライン（バレルに走る白いシャインライン）
  const batShineGeo = new THREE.CylinderGeometry(0.0345, 0.0185, 0.56, 4, 1, false, -0.15, 0.3);
  const batShineMesh = new THREE.Mesh(batShineGeo, highlightMat);
  batShineMesh.position.set(0, 0.48, 0);
  batGroup.add(batShineMesh);

  // バットトップキャップ
  const batTopGeo = new THREE.SphereGeometry(0.034, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const batTopMesh = createCelMesh(batTopGeo, batGoldMat, 1.055);
  batTopMesh.position.set(0, 0.77, 0);
  batGroup.add(batTopMesh);

  // バットグリップ部
  const batGripGeo = new THREE.CylinderGeometry(0.017, 0.017, 0.28, 16);
  const batGripMesh = createCelMesh(batGripGeo, batGripMat, 1.055);
  batGripMesh.position.set(0, 0.14, 0);
  batGroup.add(batGripMesh);

  // バットノブ
  const batKnobGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.028, 16);
  const batKnobMesh = createCelMesh(batKnobGeo, batGoldMat, 1.055);
  batKnobMesh.position.set(0, 0.0, 0);
  batGroup.add(batKnobMesh);

  // -------------------------------------------------------------------------
  // 9. アニメ演出エフェクト：スイング軌跡 ＆ インパクト閃光
  // -------------------------------------------------------------------------
  const swingTrail = createBatSwingTrail();
  rigRoot.add(swingTrail.mesh);

  const impactFX = createImpactFlashFX();
  rigRoot.add(impactFX.group);

  const _upAxis = new THREE.Vector3(0, 1, 0);
  const _batDir = new THREE.Vector3();
  const _batQ = new THREE.Quaternion();
  const prevBatQ = new THREE.Quaternion();

  // -------------------------------------------------------------------------
  // 10. フレーム適用ロジック（96フレーム完全補間 ＋ 表情・エフェクト連動）
  // -------------------------------------------------------------------------
  // スイング軌跡のサンプリング用履歴
  const trailGripHistory: THREE.Vector3[] = [];
  const trailTipHistory: THREE.Vector3[] = [];

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

    // ★ 承認済み：肩の高さ 案B (+13cm引き上げ: 鎖骨・僧帽筋トップ Y ≈ 1.52m)
    shR[1] += 0.13;
    shL[1] += 0.13;

    const hipR = interpJoint('hip_R');
    const knR = interpJoint('knee_R');
    const akR = interpJoint('ankle_R');
    const toeR = interpJoint('toe_R');

    const hipL = interpJoint('hip_L');
    const knL = interpJoint('knee_L');
    const akL = interpJoint('ankle_L');
    const toeL = interpJoint('toe_L');

    const batTip = interpJoint('bat_tip');
    const grip = interpJoint('grip');

    const currentFrameFloat = frameIdx0 + alpha;

    // ★ 構え時の自然な膝関節屈曲（30cm前方に湾曲していたゴム脚を、前傾14cmの引き締まった関節屈曲へ）
    // および肩案Bに合わせた構え手首・バット位置の連動調整
    if (currentFrameFloat < 42) {
      const blend = Math.max(0, 1 - (currentFrameFloat - 32) / 10);
      knR[2] = knR[2] - 0.15 * blend;
      knL[2] = knL[2] - 0.15 * blend;
      wrR[1] += 0.08 * blend;
      wrL[1] += 0.08 * blend;
      batTip[1] += 0.10 * blend;
    }

    // ① 体幹・骨盤の回旋連動（腰先行・胸遅れ）
    const pelvisOpenDeg = f0.rot.pelvis_open + (f1.rot.pelvis_open - f0.rot.pelvis_open) * alpha;
    const chestOpenDeg = f0.rot.chest_open + (f1.rot.chest_open - f0.rot.chest_open) * alpha;

    pelvisGroup.position.set(pelvis[0], pelvis[1] - 0.02, pelvis[2]);
    pelvisGroup.rotation.y = pelvisOpenDeg * DEG;

    const torsoMidY = (pelvis[1] + chest[1]) * 0.5;
    torsoGroup.position.set((pelvis[0] + chest[0]) * 0.5, torsoMidY, (pelvis[2] + chest[2]) * 0.5);
    torsoGroup.rotation.y = chestOpenDeg * DEG;

    // ② 腕・脚の1本化（連続スプラインチューブ更新）
    // 利き腕（右肘）の過剰な上向き跳ね上がり防止（解剖学拘束：肩の高さより上に突き出ないよう胸前〜脇腹の自然なラインに保持）
    const maxElbowY = shR[1] - 0.06;
    if (elR[1] > maxElbowY) {
      elR[1] = maxElbowY;
    }

    rArmHelper.update(shR, elR, wrR);
    lArmHelper.update(shL, elL, wrL);

    rLegHelper.update(hipR, knR, akR);
    lLegHelper.update(hipL, knL, akL);

    // ③ バッティング手袋・リストバンド位置更新
    rHandGroup.position.set(wrR[0], wrR[1], wrR[2]);
    lHandGroup.position.set(wrL[0], wrL[1], wrL[2]);

    // ④ スパイク位置更新
    rCleatGroup.position.set(
      (akR[0] + toeR[0]) * 0.5,
      Math.max(0.04, (akR[1] + toeR[1]) * 0.5),
      (akR[2] + toeR[2]) * 0.5
    );
    lCleatGroup.position.set(
      (akL[0] + toeL[0]) * 0.5,
      Math.max(0.04, (akL[1] + toeL[1]) * 0.5),
      (akL[2] + toeL[2]) * 0.5
    );

    // ⑤ 防具（エルボーガード＆レッグガード）位置更新
    if (!isLefty) {
      // 右打者：左肘にエルボーガード、左足にレッグガード
      elbowGuardGroup.position.set(elL[0], elL[1], elL[2]);
      elbowGuardGroup.rotation.y = (chestOpenDeg + 90) * DEG;
      legGuardGroup.position.set(akL[0], akL[1], akL[2]);
      legGuardGroup.rotation.y = (pelvisOpenDeg + 45) * DEG;
    } else {
      // 左打者：右肘にエルボーガード、右足にレッグガード
      elbowGuardGroup.position.set(elR[0], elR[1], elR[2]);
      elbowGuardGroup.rotation.y = (chestOpenDeg - 90) * DEG;
      legGuardGroup.position.set(akR[0], akR[1], akR[2]);
      legGuardGroup.rotation.y = (pelvisOpenDeg - 45) * DEG;
    }

    // ⑥ 頭部・ヘルメット
    const headCenterY = neck[1] + (head[1] - neck[1]) * 0.52;
    headGroup.position.set(head[0], headCenterY, head[2]);

    if (currentFrameFloat < 70) {
      headGroup.rotation.set(0, Math.PI * 0.38, 0);
      headMat.uniforms.uMap.value = headTexFocused;
    } else if (currentFrameFloat <= 80) {
      // インパクトゾーン：食いしばり表情＆強烈な視線
      const t = (currentFrameFloat - 70) / 10;
      headGroup.rotation.set(0.12 * t, Math.PI * (0.38 - 0.28 * t), -0.08 * t);
      headMat.uniforms.uMap.value = headTexClenched;
    } else {
      const t = Math.min(1.0, (currentFrameFloat - 80) / 15);
      headGroup.rotation.set(0.08, Math.PI * 0.10 + 0.15 * t, -0.05);
      headMat.uniforms.uMap.value = headTexFocused;
    }

    // ⑦ 金属バット（手元 wrist_R から bat_tip への滑らかで連続な回転）
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

      // 右手（上）と左手（下）で白いグリップテープを包み込む自然な配置
      // ノブ（0cm）から14cm上に右手を合わせることで、左手（下）もノブ直上（6cm）に密着
      batGroup.position.set(
        wrR[0] - _batDir.x * 0.14,
        wrR[1] - _batDir.y * 0.14,
        wrR[2] - _batDir.z * 0.14
      );
    }

    // ⑧ 足元落ち影（骨盤直下）
    shadowMesh.position.set(pelvis[0], 0.015, pelvis[2]);

    // ⑨ アニメ調スイング軌跡（スウォッシュ残像）更新
    // スイング加速からフォロースルー（Frame 52〜86）で弧を描く
    if (currentFrameFloat >= 50 && currentFrameFloat <= 88) {
      // スイング区間内の全フレーム（あるいは補間）で過去8コマ分の軌跡を生成
      const stepFrames = 10;
      trailGripHistory.length = 0;
      trailTipHistory.length = 0;

      for (let f = 0; f <= stepFrames; f++) {
        const pastFrame = Math.max(50, currentFrameFloat - (stepFrames - f) * 1.8);
        const pf0 = Math.floor(pastFrame);
        const pf1 = Math.min(95, pf0 + 1);
        const pa = pastFrame - pf0;
        const pG0 = CHATGPT_BATTER_96_FRAMES[pf0].joints['grip'] || [0,0,0];
        const pG1 = CHATGPT_BATTER_96_FRAMES[pf1].joints['grip'] || pG0;
        const pT0 = CHATGPT_BATTER_96_FRAMES[pf0].joints['bat_tip'] || [0,0,0];
        const pT1 = CHATGPT_BATTER_96_FRAMES[pf1].joints['bat_tip'] || pT0;

        trailGripHistory.push(new THREE.Vector3(
          pG0[0] + (pG1[0] - pG0[0]) * pa,
          pG0[1] + (pG1[1] - pG0[1]) * pa,
          pG0[2] + (pG1[2] - pG0[2]) * pa
        ));
        trailTipHistory.push(new THREE.Vector3(
          pT0[0] + (pT1[0] - pT0[0]) * pa,
          pT0[1] + (pT1[1] - pT0[1]) * pa,
          pT0[2] + (pT1[2] - pT0[2]) * pa
        ));
      }

      // 不透明度計算：50〜73でフェードイン、73〜88でフェードアウト
      let op = 0;
      if (currentFrameFloat < 73) {
        op = (currentFrameFloat - 50) / 23;
      } else {
        op = 1.0 - (currentFrameFloat - 73) / 15;
      }
      swingTrail.update(trailGripHistory, trailTipHistory, op * 0.95);
    } else {
      swingTrail.update([], [], 0.0);
    }

    // ⑩ インパクト時の閃光＆衝撃波リング (Frame 71〜76 / 最盛期73)
    if (currentFrameFloat >= 71 && currentFrameFloat <= 77) {
      const impDist = Math.abs(currentFrameFloat - 73);
      const intensity = Math.max(0, 1.0 - impDist / 3.0);
      // バット芯位置（gripからbat_tipへ約65%の場所）
      const sweetSpot = new THREE.Vector3(
        grip[0] + (batTip[0] - grip[0]) * 0.65,
        grip[1] + (batTip[1] - grip[1]) * 0.65,
        grip[2] + (batTip[2] - grip[2]) * 0.65
      );
      impactFX.setIntensity(intensity, sweetSpot);
    } else {
      impactFX.setIntensity(0, new THREE.Vector3());
    }
  }

  // 左右打席の向き調整（自然なオープンスタンス角度：78度）
  function updateHandedness() {
    if (isLefty) {
      rigRoot.rotation.y = -78 * DEG;
      rigRoot.scale.x = -1;
      torsoMat.uniforms.uMap.value = torsoTexLeft;
      earflapGroup.position.x = -0.01;
    } else {
      rigRoot.rotation.y = 78 * DEG;
      rigRoot.scale.x = 1;
      torsoMat.uniforms.uMap.value = torsoTexRight;
      earflapGroup.position.x = 0;
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
      rCleatGroup.clear();
      lCleatGroup.clear();
      rHandGroup.clear();
      lHandGroup.clear();
      elbowGuardGroup.clear();
      legGuardGroup.clear();
      headGeo.dispose();
      capDomeGeo.dispose();
      visorGeo.dispose();
      earflapGroup.clear();
      batBarrelGeo.dispose();
      batTopGeo.dispose();
      batGripGeo.dispose();
      batKnobGeo.dispose();
      shadowGeo.dispose();
      swingTrail.dispose();
      impactFX.dispose();

      helmetMat.dispose();
      underMat.dispose();
      pantsMat.dispose();
      shirtPlainMat.dispose();
      torsoMat.dispose();
      socksMat.dispose();
      headMat.dispose();
      beltMat.dispose();
      cleatMat.dispose();
      battingGloveWhiteMat.dispose();
      battingGloveAccentMat.dispose();
      wristbandMat.dispose();
      guardMat.dispose();
      guardTrimMat.dispose();
      batGoldMat.dispose();
      batGripMat.dispose();
      buckleMat.dispose();
      highlightMat.dispose();
    },
  };
}
