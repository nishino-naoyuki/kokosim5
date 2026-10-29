import { describe, expect, it } from 'vitest';
import { FACE_PART_COUNTS, decodeFace, faceCombinationCount, generateFaceSeed } from '../src/core/face';
import { Rng } from '../src/core/rng';
import { COMMON_SURNAMES, PREFECTURE_REGION, REGIONAL_SURNAMES, generateUniqueName, scoreboardNames } from '../src/core/names';
import { FRESHMEN_PER_SCHOOL, MONSTER_ANNUAL_PROBABILITY, monsterVelocity, rollAnnualMonster } from '../src/core/monster';
import { freshmanMean, freshmanSigma, generateFreshmen } from '../src/core/newcomers';
import { GROWTH_TYPE_TABLE, PERSONALITY_TABLE } from '../src/core/constants';
import type { SchoolMaster } from '../src/core/types';

const school = (id: string, baseRating = 60, stability = 60, prefecture = '福岡県') => ({
  id,
  prefecture,
  baseRating,
  stability,
});

describe('テーブル整合性', () => {
  it('性格の出現率は合計100%', () => {
    const total = Object.values(PERSONALITY_TABLE).reduce((s, p) => s + p.weight, 0);
    expect(total).toBe(100);
  });
  it('成長タイプの出現率は合計100%', () => {
    const total = Object.values(GROWTH_TYPE_TABLE).reduce((s, g) => s + g.weight, 0);
    expect(total).toBe(100);
  });
  it('47都道府県すべてに名字地域が定義されている', () => {
    expect(Object.keys(PREFECTURE_REGION).length).toBe(47);
    for (const r of new Set(Object.values(PREFECTURE_REGION))) expect(REGIONAL_SURNAMES[r].length).toBeGreaterThan(0);
  });
});

describe('フェイス生成', () => {
  it('離散パーツの総組み合わせ数が計算できる', () => {
    let expected = 1n;
    for (const v of Object.values(FACE_PART_COUNTS)) expected *= BigInt(v);
    expect(faceCombinationCount()).toBe(expected);
    // 40万人（10年分）に対して十分大きい
    expect(faceCombinationCount() > 400_000n * 1_000_000n).toBe(true);
  });
  it('faceSeed は16桁16進で、decodeFace は決定論的', () => {
    const seed = generateFaceSeed(new Rng('f'));
    expect(seed).toMatch(/^[0-9a-f]{16}$/);
    expect(decodeFace(seed)).toEqual(decodeFace(seed));
  });
  it('パーツIDは範囲内、オフセットも範囲内', () => {
    const rng = new Rng('range');
    for (let i = 0; i < 300; i++) {
      const f = decodeFace(generateFaceSeed(rng));
      for (const k of Object.keys(FACE_PART_COUNTS) as (keyof typeof FACE_PART_COUNTS)[]) {
        expect(f.parts[k]).toBeGreaterThanOrEqual(0);
        expect(f.parts[k]).toBeLessThan(FACE_PART_COUNTS[k]);
      }
      expect(Math.abs(f.offsets.browAngleDeg)).toBeLessThanOrEqual(8);
      expect(Math.abs(f.offsets.eyeSpacing)).toBeLessThanOrEqual(0.05);
    }
  });
  it('2万人生成しても同じ顔（パーツ完全一致）はまず出ない', () => {
    const rng = new Rng('dup');
    const seen = new Set<string>();
    let dup = 0;
    for (let i = 0; i < 20000; i++) {
      const f = decodeFace(generateFaceSeed(rng));
      const key = Object.values(f.parts).join('-');
      if (seen.has(key)) dup++;
      seen.add(key);
    }
    expect(dup).toBe(0);
  });
});

describe('名前生成', () => {
  it('同一校内で同姓同名が出ない（30名）', () => {
    const rng = new Rng('names');
    const taken = new Set<string>();
    for (let i = 0; i < 30; i++) generateUniqueName('福岡県', taken, rng);
    expect(taken.size).toBe(30);
  });
  it('福岡校では地元名字が約70%（統計）', () => {
    const rng = new Rng('regional');
    let local = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const n = generateUniqueName('福岡県', new Set(), rng);
      if (REGIONAL_SURNAMES.kyushu.includes(n.family) && !COMMON_SURNAMES.includes(n.family)) local++;
    }
    expect(local / N).toBeGreaterThan(0.6);
    expect(local / N).toBeLessThan(0.8);
  });
  it('同姓がいる場合のスコアボード表記は名の頭文字付き', () => {
    const r = scoreboardNames([
      { family: '宮本', given: '健' },
      { family: '宮本', given: '翔' },
      { family: '橘', given: '慎之介' },
    ]);
    expect(r).toEqual(['宮本健', '宮本翔', '橘']);
  });
});

describe('怪物（10年に1人 = 全国40万人に1人）', () => {
  const schools = Array.from({ length: 4000 }, (_, i) => ({ id: `s${i}` }));

  it('年間発生確率は10%（シミュレーション）', () => {
    let hit = 0;
    const Y = 4000;
    for (let y = 0; y < Y; y++) if (rollAnnualMonster(schools, y, 'w')) hit++;
    expect(hit / Y).toBeGreaterThan(MONSTER_ANNUAL_PROBABILITY - 0.02);
    expect(hit / Y).toBeLessThan(MONSTER_ANNUAL_PROBABILITY + 0.02);
  });

  it('投手/打者はほぼ50:50、枠は0〜9', () => {
    let p = 0;
    let b = 0;
    for (let y = 0; y < 8000; y++) {
      const m = rollAnnualMonster(schools, y, 'w2');
      if (!m) continue;
      expect(m.slot).toBeGreaterThanOrEqual(0);
      expect(m.slot).toBeLessThan(FRESHMEN_PER_SCHOOL);
      if (m.kind === 'PITCHER') p++;
      else b++;
    }
    expect(p / (p + b)).toBeGreaterThan(0.44);
    expect(p / (p + b)).toBeLessThan(0.56);
  });

  it('決定論的：同じ世界・年なら同じ結果', () => {
    expect(rollAnnualMonster(schools, 2030, 'seed')).toEqual(rollAnnualMonster(schools, 2030, 'seed'));
  });

  it('怪物投手の初期スペック（球速150〜155km/h・制球B〜A・スタミナA・金特3種・天才肌）', () => {
    for (let i = 0; i < 50; i++) {
      const ps = generateFreshmen(school('x'), 2030 + i, 'm', { monster: { kind: 'PITCHER', slot: 3 } });
      const m = ps[3];
      expect(m.monster).toBe('PITCHER');
      expect(m.position).toBe('P');
      expect(m.personality).toBe('GENIUS');
      expect(['SUPER_EARLY', 'NORMAL']).toContain(m.growthType);
      expect(m.traits).toEqual(['怪童', 'ドクターK', 'マウンドの威圧感']);
      const v = monsterVelocity(m);
      expect(v).toBeGreaterThanOrEqual(149);
      expect(v).toBeLessThanOrEqual(156);
      expect(m.abilities.control).toBeGreaterThanOrEqual(75);
      expect(m.abilities.control).toBeLessThanOrEqual(82);
      expect(m.abilities.stamina).toBeGreaterThanOrEqual(82);
      expect(m.abilities.stamina).toBeLessThanOrEqual(88);
    }
  });

  it('怪物打者の初期スペック（長打S・ミートA・選球眼/度胸A〜S・金特3種）', () => {
    for (let i = 0; i < 50; i++) {
      const m = generateFreshmen(school('y'), 2030 + i, 'm', { monster: { kind: 'BATTER', slot: 5 } })[5];
      expect(m.monster).toBe('BATTER');
      expect(m.position).not.toBe('P');
      expect(m.abilities.power).toBeGreaterThanOrEqual(88);
      expect(m.abilities.contact).toBeGreaterThanOrEqual(76);
      expect(m.abilities.eye).toBeGreaterThanOrEqual(85);
      expect(m.abilities.guts).toBeGreaterThanOrEqual(85);
      expect(m.traits).toEqual(['怪力アーチスト', 'スラッガーの威圧感', '勝負師']);
    }
  });
});

describe('新入生生成', () => {
  it('1学年10名・全員1年生・IDが一意', () => {
    const ps = generateFreshmen(school('a'), 2026, 'w');
    expect(ps).toHaveLength(10);
    expect(new Set(ps.map((p) => p.id)).size).toBe(10);
    for (const p of ps) expect(p.grade).toBe(1);
  });
  it('ポジション構成：投3・捕1・内野3・外野3', () => {
    const ps = generateFreshmen(school('a'), 2026, 'w');
    expect(ps.filter((p) => p.position === 'P')).toHaveLength(3);
    expect(ps.filter((p) => p.position === 'C')).toHaveLength(1);
    expect(ps.filter((p) => ['1B', '2B', '3B', 'SS'].includes(p.position))).toHaveLength(3);
    expect(ps.filter((p) => ['LF', 'CF', 'RF'].includes(p.position))).toHaveLength(3);
  });
  it('決定論的に再現できる', () => {
    expect(generateFreshmen(school('a'), 2026, 'w')).toEqual(generateFreshmen(school('a'), 2026, 'w'));
  });
  it('既存部員と同姓同名にならない', () => {
    const first = generateFreshmen(school('a'), 2026, 'w');
    const existing = new Set(first.map((p) => p.name.family + p.name.given));
    const next = generateFreshmen(school('a'), 2027, 'w', { existingNames: existing });
    for (const p of next) expect(existing.has(p.name.family + p.name.given)).toBe(false);
  });
  it('名門校（高基準・高安定）は弱小校より平均能力が明確に高く、ばらつきも小さい', () => {
    const avg = (ps: ReturnType<typeof generateFreshmen>) =>
      ps.reduce((s, p) => s + (p.abilities.power + p.abilities.contact + p.abilities.fielding) / 3, 0) / ps.length;
    let elite = 0;
    let weak = 0;
    for (let y = 0; y < 40; y++) {
      elite += avg(generateFreshmen(school('e', 92, 93), 2000 + y, 'w'));
      weak += avg(generateFreshmen(school('w', 30, 30), 2000 + y, 'w'));
    }
    expect(elite / 40).toBeGreaterThan(weak / 40 + 15);
    expect(freshmanSigma(93)).toBeLessThan(freshmanSigma(30));
    expect(freshmanMean(92)).toBeGreaterThan(freshmanMean(30));
  });
  it('全国敏腕スカウトは基準戦力+10相当で新入生が強くなる', () => {
    let a = 0;
    let b = 0;
    for (let y = 0; y < 60; y++) {
      const base = generateFreshmen(school('s', 50, 50), 2000 + y, 'w');
      const scouted = generateFreshmen(school('s', 50, 50), 2000 + y, 'w', { scout: 'NATIONAL' });
      a += base.reduce((s, p) => s + p.abilities.power, 0);
      b += scouted.reduce((s, p) => s + p.abilities.power, 0);
    }
    expect(b).toBeGreaterThan(a);
  });
  it('元プロ名スカウトは天才肌の特級新入生を確実に1名以上獲得', () => {
    for (let y = 0; y < 30; y++) {
      const ps = generateFreshmen(school('t', 40, 40), 2000 + y, 'w', { scout: 'ELITE' });
      expect(ps.some((p) => p.personality === 'GENIUS' && p.traits.length > 0)).toBe(true);
    }
  });
  it('平均的な新入生の球速は125km/h前後（怪物以外が150km/hを超えない）', () => {
    for (let y = 0; y < 100; y++) {
      for (const p of generateFreshmen(school('n', 55, 55), 1000 + y, 'w')) {
        if (p.position !== 'P') continue;
        const v = 105 + 0.24 * p.abilities.arm + 0.31 * p.abilities.form;
        expect(v).toBeLessThan(150);
      }
    }
  });
});

describe('型の整合', () => {
  it('SchoolMaster 型が参照できる', () => {
    const s: Pick<SchoolMaster, 'id'> = { id: 'x' };
    expect(s.id).toBe('x');
  });
});
