import { SCHOOL_SEEDS, type UniformPresetKey } from '../data/schoolSeeds';
import { Rng, clamp } from './rng';
import type { SchoolMaster, UniformDesign } from './types';

/**
 * 全国高校マスタ（47都道府県）。calendar_and_progression_specification.md 2章の加盟校数に準拠。
 */
export interface PrefectureInfo {
  name: string;
  block: string; // 地方ブロック（UIタブ）
  count: number; // 加盟校数
  districts: readonly string[]; // 県内地区（1つなら全県一斉）
  summer: string; // 夏季予選の方式（サマリ表示用）
}

const ALL = ['全県'] as const;

export const REGION_BLOCKS = ['北海道・東北', '関東', '北信越', '東海', '近畿', '中国', '四国', '九州・沖縄'] as const;

export const PREFECTURES: readonly PrefectureInfo[] = [
  { name: '北海道', block: '北海道・東北', count: 180, districts: ['北北海道', '南北海道'], summer: '支部予選 ➜ 南北海道大会（約100校）／北北海道大会（約80校）' },
  { name: '青森県', block: '北海道・東北', count: 55, districts: ALL, summer: '全県一斉トーナメント（約55校）' },
  { name: '岩手県', block: '北海道・東北', count: 60, districts: ALL, summer: '全県一斉トーナメント（約60校）' },
  { name: '秋田県', block: '北海道・東北', count: 40, districts: ALL, summer: '全県一斉トーナメント（約40校）' },
  { name: '山形県', block: '北海道・東北', count: 45, districts: ALL, summer: '全県一斉トーナメント（約45校）' },
  { name: '宮城県', block: '北海道・東北', count: 65, districts: ALL, summer: '全県一斉トーナメント（約65校）' },
  { name: '福島県', block: '北海道・東北', count: 70, districts: ALL, summer: '全県一斉トーナメント（約70校）' },
  { name: '茨城県', block: '関東', count: 90, districts: ALL, summer: '全県一斉トーナメント（約90校）' },
  { name: '栃木県', block: '関東', count: 60, districts: ALL, summer: '全県一斉トーナメント（シード制）' },
  { name: '群馬県', block: '関東', count: 65, districts: ALL, summer: '全県一斉トーナメント（シード制）' },
  { name: '埼玉県', block: '関東', count: 150, districts: ALL, summer: '全県一斉トーナメント（約150校）' },
  { name: '千葉県', block: '関東', count: 160, districts: ALL, summer: '全県一斉トーナメント（約160校）' },
  { name: '東京都', block: '関東', count: 255, districts: ['東東京', '西東京'], summer: '東東京大会（約130校）／西東京大会（約125校）' },
  { name: '神奈川県', block: '関東', count: 180, districts: ALL, summer: '全県一斉トーナメント（約180校・激戦区）' },
  { name: '山梨県', block: '関東', count: 35, districts: ALL, summer: '全県一斉トーナメント（シード制）' },
  { name: '新潟県', block: '北信越', count: 75, districts: ALL, summer: '全県一斉トーナメント（約75校）' },
  { name: '長野県', block: '北信越', count: 80, districts: ALL, summer: '全県一斉トーナメント（約80校）' },
  { name: '富山県', block: '北信越', count: 45, districts: ALL, summer: '全県一斉トーナメント（シード制）' },
  { name: '石川県', block: '北信越', count: 45, districts: ALL, summer: '全県一斉トーナメント（シード制）' },
  { name: '福井県', block: '北信越', count: 30, districts: ALL, summer: '全県一斉トーナメント（シード制）' },
  { name: '静岡県', block: '東海', count: 110, districts: ALL, summer: '全県一斉トーナメント（約110校）' },
  { name: '愛知県', block: '東海', count: 180, districts: ALL, summer: '全県一斉トーナメント（約180校・激戦区）' },
  { name: '岐阜県', block: '東海', count: 65, districts: ALL, summer: '全県一斉トーナメント（約65校）' },
  { name: '三重県', block: '東海', count: 60, districts: ALL, summer: '全県一斉トーナメント（約60校）' },
  { name: '滋賀県', block: '近畿', count: 50, districts: ALL, summer: '全県一斉トーナメント（シード制）' },
  { name: '京都府', block: '近畿', count: 75, districts: ALL, summer: '全府一斉トーナメント（約75校）' },
  { name: '大阪府', block: '近畿', count: 160, districts: ALL, summer: '全府一斉トーナメント（シード制）' },
  { name: '兵庫県', block: '近畿', count: 155, districts: ALL, summer: '全県一斉トーナメント（約155校）' },
  { name: '奈良県', block: '近畿', count: 35, districts: ALL, summer: '全県一斉トーナメント（シード制）' },
  { name: '和歌山県', block: '近畿', count: 40, districts: ALL, summer: '全県一斉トーナメント（約40校）' },
  { name: '鳥取県', block: '中国', count: 22, districts: ALL, summer: '全県一斉トーナメント（約22校・小規模）' },
  { name: '島根県', block: '中国', count: 38, districts: ALL, summer: '全県一斉トーナメント（シード制）' },
  { name: '岡山県', block: '中国', count: 55, districts: ALL, summer: '全県一斉トーナメント（約55校）' },
  { name: '広島県', block: '中国', count: 85, districts: ALL, summer: '全県一斉トーナメント（約85校）' },
  { name: '山口県', block: '中国', count: 55, districts: ALL, summer: '全県一斉トーナメント（約55校）' },
  { name: '香川県', block: '四国', count: 38, districts: ALL, summer: '全県一斉トーナメント（シード制）' },
  { name: '徳島県', block: '四国', count: 30, districts: ALL, summer: '全県一斉トーナメント（シード制）' },
  { name: '愛媛県', block: '四国', count: 55, districts: ALL, summer: '全県一斉トーナメント（約55校）' },
  { name: '高知県', block: '四国', count: 28, districts: ALL, summer: '全県一斉トーナメント（シード制）' },
  { name: '福岡県', block: '九州・沖縄', count: 135, districts: ['北部', '南部'], summer: '南北パート別抽選 ➜ 全県決勝（約135校）' },
  { name: '佐賀県', block: '九州・沖縄', count: 38, districts: ALL, summer: '全県一斉トーナメント（シード制）' },
  { name: '長崎県', block: '九州・沖縄', count: 55, districts: ALL, summer: '全県一斉トーナメント（約55校）' },
  { name: '熊本県', block: '九州・沖縄', count: 60, districts: ALL, summer: '全県一斉トーナメント（シード制）' },
  { name: '大分県', block: '九州・沖縄', count: 45, districts: ALL, summer: '全県一斉トーナメント（シード制）' },
  { name: '宮崎県', block: '九州・沖縄', count: 48, districts: ALL, summer: '全県一斉トーナメント（シード制）' },
  { name: '鹿児島県', block: '九州・沖縄', count: 70, districts: ALL, summer: '全県一斉トーナメント（約70校）' },
  { name: '沖縄県', block: '九州・沖縄', count: 60, districts: ALL, summer: '全県一斉トーナメント（全国最速6月中旬開幕）' },
];

export function prefectureInfo(name: string): PrefectureInfo {
  const p = PREFECTURES.find((x) => x.name === name);
  if (!p) throw new Error(`unknown prefecture: ${name}`);
  return p;
}

// ---------------------------------------------------------------------------
// ユニフォーム
// ---------------------------------------------------------------------------

/** ユニフォームエディタ共通のカラーパレット */
export const UNIFORM_COLORS: readonly { name: string; hex: string }[] = [
  { name: '純白', hex: '#ffffff' },
  { name: 'アイボリーホワイト', hex: '#f4efdc' },
  { name: 'グレー', hex: '#b3b9c4' },
  { name: '濃紺（ダークネイビー）', hex: '#14213d' },
  { name: 'つやありネイビー', hex: '#1e3a8a' },
  { name: '黒', hex: '#111827' },
  { name: '深紅（クリムゾン）', hex: '#b91c1c' },
  { name: 'エンジ', hex: '#7f1d1d' },
  { name: '緑', hex: '#166534' },
  { name: 'イエローゴールド', hex: '#f2c230' },
  { name: 'サックスブルー', hex: '#8cc8ee' },
  { name: '紫', hex: '#5b21b6' },
  { name: 'オレンジ', hex: '#ea580c' },
];

export function colorName(hex: string): string {
  return UNIFORM_COLORS.find((c) => c.hex === hex)?.name ?? hex;
}

const C = {
  white: '#ffffff', ivory: '#f4efdc', grey: '#b3b9c4', navy: '#14213d', blue: '#1e3a8a', black: '#111827',
  crimson: '#b91c1c', maroon: '#7f1d1d', green: '#166534', yellow: '#f2c230', sky: '#8cc8ee',
};

function uni(
  style: UniformDesign['style'], cap: string, shirt: string, pants: string, under: string,
  accent: string | undefined, socksType: UniformDesign['socksType'], socksBase: string, socksLine: string | undefined,
): UniformDesign {
  return {
    style, capColor: cap, helmetColor: cap, shirtColor: shirt, pantsColor: pants, underShirtColor: under,
    accentLineColor: accent, socksType, socksBaseColor: socksBase, socksLineColor: socksLine, numberColor: under === C.white ? C.navy : under,
  };
}

export const UNIFORM_PRESETS: Record<UniformPresetKey, UniformDesign> = {
  WHITE_NAVY: uni('NORMAL', C.navy, C.white, C.white, C.navy, undefined, 'TWO_LINE', C.navy, C.white),
  IVORY_LINE_NAVY: uni('ACCENT_LINE', C.navy, C.ivory, C.ivory, C.navy, C.navy, 'TWO_LINE', C.navy, C.white),
  YELLOW_NAVY: uni('NORMAL', C.navy, C.yellow, C.yellow, C.navy, undefined, 'ONE_LINE', C.navy, C.yellow),
  WHITE_CRIMSON: uni('ACCENT_LINE', C.white, C.white, C.white, C.crimson, C.crimson, 'TWO_LINE', C.crimson, C.white),
  PINSTRIPE_NAVY: uni('PINSTRIPE', C.navy, C.white, C.white, C.navy, C.blue, 'TWO_LINE', C.navy, C.white),
  IVORY_MAROON: uni('NORMAL', C.maroon, C.ivory, C.ivory, C.maroon, undefined, 'ONE_LINE', C.maroon, C.white),
  GREY_NAVY: uni('ACCENT_LINE', C.navy, C.grey, C.grey, C.navy, C.navy, 'TWO_LINE', C.navy, C.white),
  SKY_NAVY: uni('ACCENT_LINE', C.navy, C.sky, C.sky, C.navy, C.navy, 'TWO_LINE', C.navy, C.white),
  WHITE_GREEN: uni('NORMAL', C.green, C.white, C.white, C.green, undefined, 'TWO_LINE', C.green, C.white),
  WHITE_RED: uni('NORMAL', C.crimson, C.white, C.white, C.crimson, undefined, 'TWO_LINE', C.crimson, C.white),
  WHITE_BLACK: uni('NORMAL', C.black, C.white, C.white, C.black, undefined, 'TWO_LINE', C.black, C.white),
  IVORY_NAVY: uni('ACCENT_LINE', C.navy, C.ivory, C.ivory, C.navy, C.navy, 'TWO_LINE', C.navy, C.white),
};

/** 新規作成校の初期ユニフォーム（アイボリー×ネイビーの中央ライン） */
export const DEFAULT_NEW_UNIFORM: UniformDesign = { ...UNIFORM_PRESETS.IVORY_LINE_NAVY, helmetColor: C.blue };

// ---------------------------------------------------------------------------
// 学校エントリ（マスタ＋UI表示用の補助情報）
// ---------------------------------------------------------------------------

export interface SchoolEntry extends SchoolMaster {
  /** 備考（特徴コメント） */
  note: string;
  /** true = 実在校シード由来 / false = 自動生成の仮名（正式データ差し替え対象） */
  real: boolean;
  /** 投手力 / 打撃力 / 守備力（0〜100の表示用レーティング） */
  pitching: number;
  batting: number;
  defense: number;
}

export function ratingRank(value: number): 'S' | 'A' | 'B' | 'C' | 'D' | 'E' {
  if (value >= 90) return 'S';
  if (value >= 75) return 'A';
  if (value >= 60) return 'B';
  if (value >= 40) return 'C';
  if (value >= 20) return 'D';
  return 'E';
}

const STEMS = [
  '中央', '北', '南', '東', '西', '城東', '城南', '城北', '青葉', '桜丘', '緑ヶ丘', '港', '朝日', '若葉', '白鳥', '松風', '明星', '天神', '千代', '旭',
  '栄', '常盤', '双葉', '清流', '東雲', '紫苑', '若竹', '岬', '川越', '山手', '浜', '大和', '高台', '丘', '光陵', '神楽', '瑞穂', '日輪', '鶴', '松陵',
  '総合', '第一', '第二', '第三', '開成', '誠心', '精華', '成蹊', '新進', '至誠', '英明', '尚学', '修道', '育英', '桐陽', '翔陽', '楠', '柏', '杉', '桂',
];
const SUFFIXES = ['', '', '', '商', '工', '農', '学園', '商業', '工業', '附属', '南', '北', '東', '西', '実業', '情報'];

let cache: SchoolEntry[] | null = null;
let extraOverrides: Partial<SchoolEntry>[] = [];

/** 将来の正式データ（実名CSV/JSON）で上書きするための拡張点 */
export function registerSchoolOverrides(list: Partial<SchoolEntry>[]): void {
  extraOverrides = list;
  cache = null;
}

function deriveDisplayRatings(rng: Rng, base: number): { pitching: number; batting: number; defense: number } {
  const j = () => Math.round(clamp(base + rng.normal(0, 4), 5, 99));
  return { pitching: j(), batting: j(), defense: j() };
}

function generate(): SchoolEntry[] {
  const out: SchoolEntry[] = [];
  const seedsByPref = new Map<string, number>();
  for (const s of SCHOOL_SEEDS) seedsByPref.set(s[1], (seedsByPref.get(s[1]) ?? 0) + 1);

  PREFECTURES.forEach((pref, pIdx) => {
    const rng = new Rng(`schoolmaster/${pref.name}`);
    const used = new Set<string>();
    let serial = 0;
    const districtOf = (): string => pref.districts[rng.int(0, pref.districts.length - 1)];

    // 1) 実在校シード
    for (const [name, prefName, isPublic, base, stab, uniKey, note] of SCHOOL_SEEDS) {
      if (prefName !== pref.name) continue;
      used.add(name);
      const r = new Rng(`schoolmaster/${pref.name}/${name}`);
      out.push({
        id: `p${String(pIdx + 1).padStart(2, '0')}_${String(++serial).padStart(3, '0')}`,
        name, prefecture: pref.name, district: districtOf(), isPublic: isPublic === 1,
        baseRating: base, stability: stab, reputation: clamp(base - 4 + r.normal(0, 3), 10, 99),
        uniform: { ...UNIFORM_PRESETS[uniKey] }, note: note ?? '', real: true,
        ...deriveDisplayRatings(r, base),
      });
    }

    // 2) 残りは自動生成（仮名）
    const palette: UniformPresetKey[] = ['WHITE_NAVY', 'WHITE_GREEN', 'WHITE_RED', 'WHITE_BLACK', 'IVORY_NAVY', 'IVORY_LINE_NAVY', 'PINSTRIPE_NAVY', 'WHITE_CRIMSON'];
    const prefShort = pref.name.replace(/[都道府県]$/, '');
    while (out.filter((s) => s.prefecture === pref.name).length < pref.count) {
      let name = '';
      for (let t = 0; t < 60; t++) {
        const stem = rng.pick(STEMS);
        const suf = rng.pick(SUFFIXES);
        const pre = rng.chance(0.35) ? prefShort : '';
        const cand = `${pre}${stem}${suf}`;
        if (cand && !used.has(cand)) { name = cand; break; }
      }
      if (!name) name = `${prefShort}第${++serial}`;
      used.add(name);
      const isPublic = rng.chance(0.62);
      const base = Math.round(clamp(rng.normal(isPublic ? 40 : 46, 13), 12, 68));
      const stab = Math.round(clamp(rng.normal(46, 12), 18, 72));
      const r = new Rng(`schoolmaster/${pref.name}/${name}`);
      out.push({
        id: `p${String(pIdx + 1).padStart(2, '0')}_${String(++serial).padStart(3, '0')}`,
        name, prefecture: pref.name, district: districtOf(), isPublic,
        baseRating: base, stability: stab, reputation: clamp(base - 6 + r.normal(0, 4), 5, 80),
        uniform: { ...UNIFORM_PRESETS[rng.pick(palette)] }, note: '', real: false,
        ...deriveDisplayRatings(r, base),
      });
    }
  });

  for (const o of extraOverrides) {
    const t = out.find((s) => (o.id && s.id === o.id) || (o.name && s.name === o.name && (!o.prefecture || s.prefecture === o.prefecture)));
    if (t) Object.assign(t, o);
  }
  return out;
}

export function allSchools(): SchoolEntry[] {
  if (!cache) cache = generate();
  return cache;
}

export function schoolsOf(prefecture: string): SchoolEntry[] {
  return allSchools().filter((s) => s.prefecture === prefecture);
}

export function findSchool(id: string): SchoolEntry | undefined {
  return allSchools().find((s) => s.id === id);
}

/** 新規高校（オリジナル校）を参入させる：Rank D（新規参入・挑戦校） */
export function createCustomSchool(
  name: string, prefecture: string, isPublic: boolean, uniform: UniformDesign, motto: string,
): SchoolEntry {
  const info = prefectureInfo(prefecture);
  return {
    id: 'custom', name, prefecture, district: info.districts[0], isPublic,
    baseRating: 32, stability: 38, reputation: 25, uniform: { ...uniform },
    note: motto || '新規参入・挑戦校', real: false, pitching: 30, batting: 32, defense: 32,
  };
}
