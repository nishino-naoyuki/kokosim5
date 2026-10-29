import * as THREE from 'three';
import type { Rng } from '../core/rng';

/**
 * リアル球場寸法（設計書 4.1）。メートル単位で実寸再現。
 * ゲーム座標(X一塁側, Y中堅方向, Z上) → Three.js座標(x=X, y=Z, z=-Y) に変換して描画する。
 */
export interface StadiumSpec {
  name: string;
  /** 両翼（ファウルライン端）までの距離 m（左右対称時） */
  foulLine: number;
  /** 中堅までの距離 m */
  center: number;
  /** フェンス高 m */
  fenceHeight: number;
  /** 左右非対称時の左翼距離 m */
  leftFoulLine?: number;
  /** 左右非対称時の右翼距離 m */
  rightFoulLine?: number;
  /** 自校グラウンドフラグ（奥に校舎が見える） */
  isSchoolGround?: boolean;
  /** 牢獄球場フラグ（20m鉄壁） */
  isPrison?: boolean;
  /** 球場種別 */
  kind?: 'OFFICIAL' | 'PRACTICE' | 'RARE';
  /** 土の色 HEX */
  dirtColor?: number;
  /** フェンス色 HEX */
  fenceColor?: number;
  /** 特徴・解説メモ */
  note?: string;
}

export const BASE_DISTANCE = 27.431; // 塁間 90フィート
export const MOUND_DISTANCE = 18.44; // 投手板〜本塁
export const PITCHER_RELEASE_Y = 17.0;

/** ゲーム座標 → Three.js 座標 */
export function toThree(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, z, -y);
}

/**
 * フェアグラウンドの角度 φ（-45°〜+45°）におけるフェンスまでの距離。
 * 左右非対称球場（ヘンテコ球場など）にも完全対応。
 */
export function fenceDistance(spec: StadiumSpec, phiRad: number): number {
  const left = spec.leftFoulLine ?? spec.foulLine;
  const right = spec.rightFoulLine ?? spec.foulLine;
  // phiRad: -PI/4 (Left line) 〜 0 (Center) 〜 +PI/4 (Right line)
  if (phiRad < 0) {
    const t = (phiRad + Math.PI / 4) / (Math.PI / 4); // 0..1 (Left -> Center)
    return left + (spec.center - left) * Math.sin((Math.PI / 2) * t);
  } else {
    const t = phiRad / (Math.PI / 4); // 0..1 (Center -> Right)
    return spec.center + (right - spec.center) * Math.sin((Math.PI / 2) * t);
  }
}

// ---------------------------------------------------------------------------
// 練習試合球場 ＆ レア球場 定義
// ---------------------------------------------------------------------------
export const PRACTICE_STADIUMS = {
  practiceA: {
    name: '練習試合用球場A（標準地方球場）',
    foulLine: 90.0,
    center: 120.0,
    fenceHeight: 2.0,
    kind: 'PRACTICE',
    dirtColor: 0x6b4f35,
    fenceColor: 0x1e3a8a,
    note: '両翼90m・センター120m・フェンス2m。標準的な地方球場規格。',
  },
  practiceB: {
    name: '練習試合用球場B（狭小・高フェンス）',
    foulLine: 85.0,
    center: 118.0,
    fenceHeight: 3.0,
    kind: 'PRACTICE',
    dirtColor: 0x785338,
    fenceColor: 0x15803d,
    note: '両翼85m・センター118m・フェンス3m。狭いがフェンスが高く直撃二塁打が出やすい。',
  },
  schoolGround: {
    name: '学校の球場（校舎ビューグラウンド）',
    foulLine: 88.0,
    center: 116.0,
    fenceHeight: 2.2,
    isSchoolGround: true,
    kind: 'PRACTICE',
    dirtColor: 0x6b4f35,
    fenceColor: 0x334155,
    note: '奥に校舎と防球ネットが見える学校グラウンド。',
  },
  rarePrison: {
    name: '牢獄球場（監獄スタジアム）',
    foulLine: 70.0,
    center: 100.0,
    fenceHeight: 20.0,
    isPrison: true,
    kind: 'RARE',
    dirtColor: 0x3e3835,
    fenceColor: 0x1e2124,
    note: '出現率1%！両翼70m・センター100mだがフェンス20mの超高壁要塞。',
  },
  rareDeep: {
    name: '縦長球場（オーバルスタジアム）',
    foulLine: 120.0,
    center: 126.0,
    fenceHeight: 1.5,
    kind: 'RARE',
    dirtColor: 0x5a4632,
    fenceColor: 0x1e3a8a,
    note: '出現率1%！両翼120m・センター126m・フェンス1.5m。ポール際本塁打はほぼ不可能。',
  },
  rareWeird: {
    name: 'ヘンテコ球場（極端左右非対称）',
    leftFoulLine: 100.0,
    center: 115.0,
    rightFoulLine: 70.0,
    foulLine: 85.0,
    fenceHeight: 3.0,
    kind: 'RARE',
    dirtColor: 0x6b4f35,
    fenceColor: 0xb45309,
    note: '出現率1%！左100m・センター115m・右70m。極端な左右非対称で左打者天国。',
  },
  rareNeedle: {
    name: '長細球場（ニードルスタジアム）',
    foulLine: 80.0,
    center: 150.0,
    fenceHeight: 2.0,
    kind: 'RARE',
    dirtColor: 0x5a4632,
    fenceColor: 0x1e3a8a,
    note: '出現率1%！両翼80m・センター150m。センターが超深遠な針状球場。',
  },
} as const satisfies Record<string, StadiumSpec>;

// ---------------------------------------------------------------------------
// 練習試合球場の抽選エンジン（レア球場 4種 各1%、通常3種 各32%）
// ---------------------------------------------------------------------------
export function choosePracticeStadium(rng: Rng, schoolName?: string): StadiumSpec {
  const roll = rng.float(0, 100);

  if (roll < 1.0) return { ...PRACTICE_STADIUMS.rarePrison };
  if (roll < 2.0) return { ...PRACTICE_STADIUMS.rareDeep };
  if (roll < 3.0) return { ...PRACTICE_STADIUMS.rareWeird };
  if (roll < 4.0) return { ...PRACTICE_STADIUMS.rareNeedle };

  if (roll < 36.0) return { ...PRACTICE_STADIUMS.practiceA };
  if (roll < 68.0) return { ...PRACTICE_STADIUMS.practiceB };

  const s: StadiumSpec = { ...PRACTICE_STADIUMS.schoolGround };
  if (schoolName) s.name = `${schoolName}グラウンド（校舎ビュー）`;
  return s;
}

// ---------------------------------------------------------------------------
// 全国47都道府県 メイン球場 ＆ サブ球場マスタ
// ---------------------------------------------------------------------------
export interface PrefStadiumPair {
  main: StadiumSpec;
  sub: StadiumSpec;
}

export const PREFECTURE_STADIUMS: Record<string, PrefStadiumPair> = {
  福岡県: {
    main: { name: '北九州市民球場', foulLine: 92.0, center: 120.0, fenceHeight: 3.2, kind: 'OFFICIAL' },
    sub: { name: '春日公園野球場', foulLine: 93.0, center: 120.0, fenceHeight: 3.0, kind: 'OFFICIAL' },
  },
  佐賀県: {
    main: { name: 'さがみどりの森球場', foulLine: 97.6, center: 122.0, fenceHeight: 3.2, kind: 'OFFICIAL' },
    sub: { name: '鳥栖市民球場', foulLine: 91.4, center: 120.0, fenceHeight: 3.0, kind: 'OFFICIAL' },
  },
  長崎県: {
    main: { name: '長崎ビッグNスタジアム', foulLine: 99.1, center: 122.0, fenceHeight: 3.2, kind: 'OFFICIAL' },
    sub: { name: '佐世保市総合グラウンド野球場', foulLine: 91.4, center: 120.0, fenceHeight: 3.0, kind: 'OFFICIAL' },
  },
  熊本県: {
    main: { name: 'リブワーク藤崎台球場', foulLine: 91.4, center: 120.0, fenceHeight: 3.2, kind: 'OFFICIAL' },
    sub: { name: '県南運動公園野球場', foulLine: 95.0, center: 120.0, fenceHeight: 3.0, kind: 'OFFICIAL' },
  },
  大分県: {
    main: { name: '別大興産スタジアム', foulLine: 99.1, center: 122.0, fenceHeight: 3.2, kind: 'OFFICIAL' },
    sub: { name: '臼杵市民球場', foulLine: 92.0, center: 120.0, fenceHeight: 3.0, kind: 'OFFICIAL' },
  },
  宮崎県: {
    main: { name: 'ひなたサンマリンスタジアム宮崎', foulLine: 100.0, center: 122.0, fenceHeight: 3.2, kind: 'OFFICIAL' },
    sub: { name: 'ひなたアイビースタジアム', foulLine: 99.1, center: 122.0, fenceHeight: 3.0, kind: 'OFFICIAL' },
  },
  鹿児島県: {
    main: { name: '平和リース球場', foulLine: 91.4, center: 120.0, fenceHeight: 3.2, kind: 'OFFICIAL' },
    sub: { name: '鴨池市民球場', foulLine: 91.4, center: 120.0, fenceHeight: 3.0, kind: 'OFFICIAL' },
  },
  沖縄県: {
    main: { name: '沖縄セルラースタジアム那覇', foulLine: 99.0, center: 122.0, fenceHeight: 3.2, kind: 'OFFICIAL' },
    sub: { name: 'コザしんきんスタジアム', foulLine: 96.0, center: 120.0, fenceHeight: 3.0, kind: 'OFFICIAL' },
  },
  東京都: {
    main: { name: '明治神宮野球場', foulLine: 91.9, center: 120.0, fenceHeight: 3.3, kind: 'OFFICIAL' },
    sub: { name: 'スリーボンドスタジアム八王子', foulLine: 98.0, center: 122.0, fenceHeight: 3.0, kind: 'OFFICIAL' },
  },
  神奈川県: {
    main: { name: '横浜スタジアム', foulLine: 94.2, center: 118.0, fenceHeight: 5.0, kind: 'OFFICIAL' },
    sub: { name: 'サーティーフォー保土ケ谷球場', foulLine: 95.0, center: 120.0, fenceHeight: 3.2, kind: 'OFFICIAL' },
  },
  埼玉県: {
    main: { name: '埼玉県営大宮公園野球場', foulLine: 99.0, center: 122.0, fenceHeight: 3.2, kind: 'OFFICIAL' },
    sub: { name: '上尾市民球場', foulLine: 95.0, center: 120.0, fenceHeight: 3.0, kind: 'OFFICIAL' },
  },
  千葉県: {
    main: { name: 'ZOZOマリンスタジアム', foulLine: 99.5, center: 122.0, fenceHeight: 3.0, kind: 'OFFICIAL' },
    sub: { name: 'ゼットエーボールパーク', foulLine: 98.0, center: 122.0, fenceHeight: 3.0, kind: 'OFFICIAL' },
  },
  茨城県: {
    main: { name: 'ノーブルホームスタジアム水戸', foulLine: 100.0, center: 122.0, fenceHeight: 3.0, kind: 'OFFICIAL' },
    sub: { name: 'J:COMスタジアム土浦', foulLine: 99.1, center: 122.0, fenceHeight: 3.0, kind: 'OFFICIAL' },
  },
  栃木県: {
    main: { name: 'エイジェックスタジアム', foulLine: 95.0, center: 120.0, fenceHeight: 3.5, kind: 'OFFICIAL' },
    sub: { name: '清原球場', foulLine: 98.0, center: 122.0, fenceHeight: 3.2, kind: 'OFFICIAL' },
  },
  群馬県: {
    main: { name: '上毛新聞敷島球場', foulLine: 98.6, center: 122.0, fenceHeight: 3.0, kind: 'OFFICIAL' },
    sub: { name: '高崎市城南球場', foulLine: 95.0, center: 120.0, fenceHeight: 3.0, kind: 'OFFICIAL' },
  },
  大阪府: {
    main: { name: '大阪シティ信用金庫スタジアム', foulLine: 97.0, center: 122.0, fenceHeight: 3.2, kind: 'OFFICIAL' },
    sub: { name: '南港中央野球場', foulLine: 98.0, center: 122.0, fenceHeight: 3.0, kind: 'OFFICIAL' },
  },
  兵庫県: {
    main: { name: 'ほっともっとフィールド神戸', foulLine: 99.1, center: 122.0, fenceHeight: 3.0, kind: 'OFFICIAL' },
    sub: { name: '明石トーカロ球場', foulLine: 95.0, center: 120.0, fenceHeight: 3.2, kind: 'OFFICIAL' },
  },
  京都府: {
    main: { name: 'わかさスタジアム京都', foulLine: 91.4, center: 120.0, fenceHeight: 3.2, kind: 'OFFICIAL' },
    sub: { name: '太陽が丘球場', foulLine: 91.4, center: 120.0, fenceHeight: 3.0, kind: 'OFFICIAL' },
  },
  愛知県: {
    main: { name: '岡崎レッドダイヤモンドスタジアム', foulLine: 98.0, center: 122.0, fenceHeight: 3.3, kind: 'OFFICIAL' },
    sub: { name: '熱田愛知時計120スタジアム', foulLine: 91.4, center: 116.0, fenceHeight: 3.2, kind: 'OFFICIAL' },
  },
  静岡県: {
    main: { name: '静岡草薙球場', foulLine: 91.4, center: 122.0, fenceHeight: 3.2, kind: 'OFFICIAL' },
    sub: { name: '浜松球場', foulLine: 91.4, center: 118.0, fenceHeight: 3.0, kind: 'OFFICIAL' },
  },
  広島県: {
    main: { name: 'MAZDA Zoom-Zoom スタジアム', foulLine: 100.0, center: 122.0, fenceHeight: 3.2, kind: 'OFFICIAL' },
    sub: { name: 'ぶんちゃんしまなみ球場', foulLine: 98.0, center: 122.0, fenceHeight: 3.2, kind: 'OFFICIAL' },
  },
  宮城県: {
    main: { name: '楽天モバイルパーク宮城', foulLine: 100.1, center: 122.0, fenceHeight: 3.2, kind: 'OFFICIAL' },
    sub: { name: '仙台市民球場', foulLine: 100.0, center: 122.0, fenceHeight: 3.0, kind: 'OFFICIAL' },
  },
  北海道: {
    main: { name: 'エスコンフィールドHOKKAIDO', foulLine: 100.0, center: 122.0, fenceHeight: 3.2, kind: 'OFFICIAL' },
    sub: { name: '札幌市円山球場', foulLine: 98.0, center: 117.0, fenceHeight: 3.0, kind: 'OFFICIAL' },
  },
};

export const STADIUMS = {
  koshien: { name: '阪神甲子園球場', foulLine: 95.0, center: 118.0, fenceHeight: 3.2, kind: 'OFFICIAL', dirtColor: 0x4a3828, note: '春・夏の全国大会開催。伝統の浜風と黒土。' },
  jingu: { name: '明治神宮野球場', foulLine: 91.9, center: 120.0, fenceHeight: 3.3, kind: 'OFFICIAL', dirtColor: 0x475569, note: '秋季明治神宮野球大会開催。学生野球の聖地。' },
  localA: PRACTICE_STADIUMS.practiceA,
  localB: PRACTICE_STADIUMS.practiceB,
} as const satisfies Record<string, StadiumSpec>;

// ---------------------------------------------------------------------------
// 秋季地区大会 10ブロック ＆ 持ち回り当番県定義
// ---------------------------------------------------------------------------
export const DISTRICT_PREFECTURES: Record<string, string[]> = {
  北海道: ['北海道'],
  東北: ['青森県', '岩手県', '秋田県', '山形県', '宮城県', '福島県'],
  関東: ['茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '神奈川県', '山梨県'],
  東京: ['東京都'],
  北信越: ['新潟県', '長野県', '富山県', '石川県', '福井県'],
  東海: ['静岡県', '愛知県', '岐阜県', '三重県'],
  近畿: ['滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県'],
  中国: ['鳥取県', '島根県', '岡山県', '広島県', '山口県'],
  四国: ['徳島県', '香川県', '愛媛県', '高知県'],
  九州: ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'],
};

/** 所属都道府県から秋季地区ブロック名を取得 */
export function getDistrictName(prefecture: string): string {
  for (const [dist, prefs] of Object.entries(DISTRICT_PREFECTURES)) {
    if (prefs.includes(prefecture)) return dist;
  }
  return '九州';
}

/** 秋季地区大会の持ち回り開催県を年度から算出 */
export function getDistrictHostPrefecture(districtName: string, year: number): string {
  const prefs = DISTRICT_PREFECTURES[districtName] ?? DISTRICT_PREFECTURES['九州'];
  const index = Math.abs(year) % prefs.length;
  return prefs[index];
}

export type MatchKind = 'OFFICIAL' | 'PRACTICE' | 'KOSHIEN' | 'DISTRICT' | 'JINGU';

/**
 * 試合タイプ・都道府県・ラウンドに応じた球場選定
 * - 春・夏・秋の県大会: その県のメイン球場（準決・決勝）またはサブ球場（1回戦〜準々決勝）
 * - 夏・春の全国大会: 阪神甲子園球場
 * - 秋季地区大会: 地区内の県で持ち回り。当番県のメイン球場（準決・決勝）またはサブ球場
 * - 明治神宮野球大会: 明治神宮野球場
 * - 練習試合: 通常3種（各32%）＋レア4種（各1%）
 */
export function chooseMatchStadium(
  kind: MatchKind,
  prefecture: string,
  isFinalOrSemi: boolean,
  rng: Rng,
  schoolName?: string,
  hostPrefecture?: string,
): StadiumSpec {
  if (kind === 'KOSHIEN') {
    return { ...STADIUMS.koshien };
  }
  if (kind === 'JINGU') {
    return { ...STADIUMS.jingu };
  }
  if (kind === 'DISTRICT') {
    const targetPref = hostPrefecture ?? prefecture;
    const pair = PREFECTURE_STADIUMS[targetPref] ?? PREFECTURE_STADIUMS['福岡県'];
    return isFinalOrSemi ? { ...pair.main } : { ...pair.sub };
  }
  if (kind === 'PRACTICE') {
    return choosePracticeStadium(rng, schoolName);
  }
  // OFFICIAL (地方予選)
  const pair = PREFECTURE_STADIUMS[prefecture] ?? PREFECTURE_STADIUMS['福岡県'];
  return isFinalOrSemi ? { ...pair.main } : { ...pair.sub };
}

// ---------------------------------------------------------------------------
// 3D球場ビルダー（Three.js）
// ---------------------------------------------------------------------------
export function buildStadium(spec: StadiumSpec): THREE.Group {
  const group = new THREE.Group();

  // 外周の地面
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500),
    new THREE.MeshLambertMaterial({ color: 0x4a7a3a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  group.add(ground);

  // 外野芝（扇形：原点→フェンス曲線）
  const N = 64;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  for (let i = 0; i <= N; i++) {
    const phi = -Math.PI / 4 + (Math.PI / 2) * (i / N);
    const r = fenceDistance(spec, phi);
    shape.lineTo(r * Math.sin(phi), r * Math.cos(phi));
  }
  shape.lineTo(0, 0);
  const grass = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshLambertMaterial({ color: 0x3f8f3a, side: THREE.DoubleSide }),
  );
  grass.rotation.x = -Math.PI / 2;
  group.add(grass);

  // 内野土
  const dirtCol = spec.dirtColor ?? (spec.isPrison ? 0x3e3835 : 0x6b4f35);
  const dirtMat = new THREE.MeshLambertMaterial({ color: dirtCol });
  const infield = new THREE.Mesh(new THREE.CircleGeometry(28.5, 48, Math.PI / 4, Math.PI / 2), dirtMat);
  infield.rotation.x = -Math.PI / 2;
  infield.position.y = 0.01;
  group.add(infield);

  // 内野芝ダイヤモンド
  const diamondShape = new THREE.Shape();
  const b = BASE_DISTANCE;
  diamondShape.moveTo(0, 0.0);
  diamondShape.lineTo(b / Math.SQRT2, b / Math.SQRT2);
  diamondShape.lineTo(0, b * Math.SQRT2);
  diamondShape.lineTo(-b / Math.SQRT2, b / Math.SQRT2);
  diamondShape.lineTo(0, 0);
  const diamond = new THREE.Mesh(
    new THREE.ShapeGeometry(diamondShape),
    new THREE.MeshLambertMaterial({ color: 0x3f8f3a, side: THREE.DoubleSide }),
  );
  diamond.rotation.x = -Math.PI / 2;
  diamond.position.y = 0.02;
  group.add(diamond);

  // ベース
  const baseMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const bases: [number, number][] = [
    [b / Math.SQRT2, b / Math.SQRT2],
    [0, b * Math.SQRT2],
    [-b / Math.SQRT2, b / Math.SQRT2],
  ];
  for (const [x, y] of bases) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.38), baseMat);
    m.position.copy(toThree(x, y, 0.06));
    group.add(m);
  }
  const home = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 5), baseMat);
  home.position.copy(toThree(0, 0, 0.06));
  group.add(home);

  // マウンド
  const mound = new THREE.Mesh(
    new THREE.CylinderGeometry(2.74, 2.74, 0.25, 32),
    dirtMat,
  );
  mound.position.copy(toThree(0, MOUND_DISTANCE, 0.12));
  group.add(mound);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.15), baseMat);
  plate.position.copy(toThree(0, MOUND_DISTANCE, 0.26));
  group.add(plate);

  // バッターボックス
  const boxMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const side of [-1, 1]) {
    const box = new THREE.Mesh(new THREE.PlaneGeometry(1.22, 1.83), boxMat);
    box.rotation.x = -Math.PI / 2;
    box.position.copy(toThree(side * 1.0, 0, 0.03));
    group.add(box);
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.71), dirtMat);
    inner.rotation.x = -Math.PI / 2;
    inner.position.copy(toThree(side * 1.0, 0, 0.035));
    group.add(inner);
  }

  // 外野フェンス
  const positions: number[] = [];
  const indices: number[] = [];
  const hFence = spec.fenceHeight;

  for (let i = 0; i <= N; i++) {
    const phi = -Math.PI / 4 + (Math.PI / 2) * (i / N);
    const r = fenceDistance(spec, phi);
    const x = r * Math.sin(phi);
    const y = r * Math.cos(phi);
    const lo = toThree(x, y, 0);
    const hi = toThree(x, y, hFence);
    positions.push(lo.x, lo.y, lo.z, hi.x, hi.y, hi.z);
    if (i < N) {
      const k = i * 2;
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const fenceGeo = new THREE.BufferGeometry();
  fenceGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  fenceGeo.setIndex(indices);
  fenceGeo.computeVertexNormals();

  const fenceCol = spec.fenceColor ?? (spec.isPrison ? 0x22262c : 0x1e3a8a);
  const fence = new THREE.Mesh(
    fenceGeo,
    new THREE.MeshLambertMaterial({ color: fenceCol, side: THREE.DoubleSide }),
  );
  group.add(fence);

  // ファウルライン
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
  for (const sign of [-1, 1]) {
    const end = fenceDistance(spec, (sign * Math.PI) / 4);
    const pts = [toThree(0, 0, 0.05), toThree(sign * end * Math.SQRT1_2, end * Math.SQRT1_2, 0.05)];
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
  }

  // -------------------------------------------------------------
  // ギミックA：学校の球場（奥に3階建て校舎が見える）
  // -------------------------------------------------------------
  if (spec.isSchoolGround) {
    const schoolGroup = new THREE.Group();
    // 校舎本体（幅70m、高さ16m、奥行き12m）
    const bldgGeo = new THREE.BoxGeometry(70, 16, 12);
    const bldgMat = new THREE.MeshLambertMaterial({ color: 0xf3ede2 });
    const bldg = new THREE.Mesh(bldgGeo, bldgMat);
    bldg.position.set(0, 8, -(spec.center + 24));
    schoolGroup.add(bldg);

    // 校舎屋根
    const roofGeo = new THREE.BoxGeometry(72, 1.2, 14);
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x475569 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(0, 16.6, -(spec.center + 24));
    schoolGroup.add(roof);

    // 教室窓列
    const winMat = new THREE.MeshBasicMaterial({ color: 0x93c5fd });
    for (let floor = 0; floor < 3; floor++) {
      for (let col = -6; col <= 6; col++) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.4), winMat);
        win.position.set(col * 5.0, 3.5 + floor * 4.8, -(spec.center + 17.9));
        schoolGroup.add(win);
      }
    }

    // 防球ネット（高さ12m）
    const netGeo = new THREE.PlaneGeometry(80, 12);
    const netMat = new THREE.MeshBasicMaterial({ color: 0x334155, wireframe: true });
    const net = new THREE.Mesh(netGeo, netMat);
    net.position.set(0, 6, -(spec.center + 4));
    schoolGroup.add(net);

    group.add(schoolGroup);
  }

  // -------------------------------------------------------------
  // ギミックB：牢獄球場（20m鉄格子・要塞支柱）
  // -------------------------------------------------------------
  if (spec.isPrison) {
    const prisonPillars = new THREE.Group();
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0x181a1e });
    for (let i = 0; i <= 16; i++) {
      const phi = -Math.PI / 4 + (Math.PI / 2) * (i / 16);
      const r = fenceDistance(spec, phi);
      const x = r * Math.sin(phi);
      const y = r * Math.cos(phi);
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 21, 8), pillarMat);
      pillar.position.copy(toThree(x, y, 10.5));
      prisonPillars.add(pillar);
    }
    group.add(prisonPillars);
  }

  // ライティング
  group.add(new THREE.AmbientLight(0xffffff, 0.78));
  const sun = new THREE.DirectionalLight(0xffffff, 0.92);
  sun.position.set(-40, 80, 40);
  group.add(sun);

  return group;
}
