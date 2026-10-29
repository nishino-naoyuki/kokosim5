import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { createAbilities, pitchVelocity } from '../src/core/abilities';
import { conditionMultiplier, dailyGain, applyDailyGrowth, personalityMultiplier } from '../src/core/growth';
import { fatigueZone, processFatigueDay, rollInjury } from '../src/core/fatigue';
import { processTrainingDay } from '../src/core/training';
import { ABILITY_KEYS, type Player } from '../src/core/types';

function makePlayer(over: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    name: { family: '宮本', given: '健太郎' },
    faceSeed: '0123456789abcdef',
    grade: 2,
    position: 'SS',
    throws: 'R',
    bats: 'R',
    personality: 'MYPACE',
    growthType: 'NORMAL',
    abilities: createAbilities(50),
    condition: 0,
    fatigue: 0,
    injury: null,
    traits: [],
    ...over,
  };
}

describe('Rng', () => {
  it('同じシードなら同じ系列', () => {
    const a = new Rng('seed');
    const b = new Rng('seed');
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
  });
  it('異なるシードは異なる系列', () => {
    expect(new Rng('a').next()).not.toBe(new Rng('b').next());
  });
  it('fork は親と独立かつ決定論的', () => {
    expect(new Rng('x').fork('y').next()).toBe(new Rng('x').fork('y').next());
  });
  it('int は範囲内（両端含む）', () => {
    const r = new Rng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(3, 5));
    expect([...seen].sort()).toEqual([3, 4, 5]);
  });
});

describe('pitchVelocity', () => {
  it('肩94×フォーム60 → 約146km/h（設計書の例）', () => {
    expect(pitchVelocity(94, 60)).toBeGreaterThan(144);
    expect(pitchVelocity(94, 60)).toBeLessThan(148);
  });
  it('平均的な新入生は125km/h前後', () => {
    const v = pitchVelocity(40, 35);
    expect(v).toBeGreaterThan(120);
    expect(v).toBeLessThan(132);
  });
  it('怪童は +5km/h', () => {
    expect(pitchVelocity(80, 80, ['怪童']) - pitchVelocity(80, 80)).toBeCloseTo(5);
  });
});

describe('GrowthEngine', () => {
  it('調子係数：+5=1.20, 0=1.00, -5=0.80、単調増加', () => {
    expect(conditionMultiplier(5)).toBeCloseTo(1.2);
    expect(conditionMultiplier(0)).toBe(1);
    expect(conditionMultiplier(-5)).toBeCloseTo(0.8);
    for (let c = -5; c < 5; c++) expect(conditionMultiplier(c + 1)).toBeGreaterThan(conditionMultiplier(c));
    expect(conditionMultiplier(1)).toBeCloseTo(1.05);
    expect(conditionMultiplier(4)).toBeCloseTo(1.15);
  });

  it('ΔP = 0.06 × M_menu × M_type × M_pers × M_cond × M_fac（標準ケース）', () => {
    const p = makePlayer({ growthType: 'NORMAL', grade: 2 }); // type 1.0
    expect(dailyGain(p, 'power', { menu: 'BATTING' })).toBeCloseTo(0.06);
    // サブ対象 judgment は 0.4 倍
    expect(dailyGain(p, 'judgment', { menu: 'BATTING' })).toBeCloseTo(0.06 * 0.4);
    // 無関係能力は 0
    expect(dailyGain(p, 'speed', { menu: 'BATTING' })).toBe(0);
  });

  it('休養では成長しない', () => {
    const p = makePlayer();
    for (const k of ABILITY_KEYS) expect(dailyGain(p, k, { menu: 'REST' })).toBe(0);
  });

  it('成長タイプ×学年：超早熟の1年は普通の1年より速く、3年は遅い', () => {
    const se1 = makePlayer({ growthType: 'SUPER_EARLY', grade: 1 });
    const n1 = makePlayer({ growthType: 'NORMAL', grade: 1 });
    expect(dailyGain(se1, 'power', { menu: 'BATTING' })).toBeGreaterThan(dailyGain(n1, 'power', { menu: 'BATTING' }));
    const sl3 = makePlayer({ growthType: 'SUPER_LATE', grade: 3 });
    expect(dailyGain(sl3, 'power', { menu: 'BATTING' })).toBeCloseTo(0.06 * 1.8);
  });

  it('性格補正：努力家+15%, 天才肌+30%, 熱血漢はフィジカルのみ+35%', () => {
    const base = dailyGain(makePlayer(), 'power', { menu: 'BATTING' });
    expect(dailyGain(makePlayer({ personality: 'DILIGENT' }), 'power', { menu: 'BATTING' })).toBeCloseTo(base * 1.15);
    expect(dailyGain(makePlayer({ personality: 'GENIUS' }), 'power', { menu: 'BATTING' })).toBeCloseTo(base * 1.3);
    const hot = makePlayer({ personality: 'HOTBLOODED' });
    expect(personalityMultiplier(hot, 'guts', { menu: 'PHYSICAL' })).toBeCloseTo(1.35);
    expect(personalityMultiplier(hot, 'power', { menu: 'BATTING' })).toBe(1);
  });

  it('性格補正：職人気質は得意-35%/専門外-15%、冷静は制球・選球・判断+30%', () => {
    const craft = makePlayer({ personality: 'CRAFTSMAN' });
    expect(personalityMultiplier(craft, 'contact', { menu: 'BATTING' })).toBeCloseTo(1.35);
    expect(personalityMultiplier(craft, 'power', { menu: 'BATTING' })).toBeCloseTo(0.85);
    const cool = makePlayer({ personality: 'COOL' });
    expect(personalityMultiplier(cool, 'eye', { menu: 'BATTING' })).toBeCloseTo(1.3);
    expect(personalityMultiplier(cool, 'power', { menu: 'BATTING' })).toBe(1);
  });

  it('ムードメーカー：絶好調+40% / 不調-20%', () => {
    expect(personalityMultiplier(makePlayer({ personality: 'MOODMAKER', condition: 4 }), 'power', { menu: 'BATTING' })).toBeCloseTo(1.4);
    expect(personalityMultiplier(makePlayer({ personality: 'MOODMAKER', condition: -4 }), 'power', { menu: 'BATTING' })).toBeCloseTo(0.8);
  });

  it('設備倍率・グラウンド整備が加算される', () => {
    const p = makePlayer();
    const g = dailyGain(p, 'power', { menu: 'BATTING', facility: { power: 1.25 }, groundBonus: 0.1 });
    expect(g).toBeCloseTo(0.06 * 1.35);
  });

  it('能力は100で頭打ち', () => {
    const p = makePlayer({ abilities: { ...createAbilities(50), power: 99.99 } });
    applyDailyGrowth(p, { menu: 'BATTING' });
    expect(p.abilities.power).toBeLessThanOrEqual(100);
  });

  it('普通タイプで毎日打撃練習すると3年間で30〜55ポイント程度成長する目安', () => {
    const p = makePlayer({ grade: 1, growthType: 'NORMAL', personality: 'MYPACE' });
    // 練習日数：年間約250日 × 3年（学年ごとに type 係数が変わる）
    for (const grade of [1, 2, 3] as const) {
      p.grade = grade;
      for (let d = 0; d < 250; d++) applyDailyGrowth(p, { menu: 'BATTING' });
    }
    const gained = p.abilities.power - 50;
    expect(gained).toBeGreaterThan(30);
    expect(gained).toBeLessThan(60);
  });
});

describe('Fatigue / Injury', () => {
  it('疲労帯: <60 安全 / 60-79 注意 / 80-99 危険 / 100 限界', () => {
    expect(fatigueZone(59)).toBe('SAFE');
    expect(fatigueZone(60)).toBe('CAUTION');
    expect(fatigueZone(80)).toBe('DANGER');
    expect(fatigueZone(100)).toBe('LIMIT');
  });

  it('安全域では絶対にケガをしない', () => {
    const rng = new Rng('safe');
    for (let i = 0; i < 5000; i++) expect(rollInjury(59, 'BATTING', rng)).toBeNull();
  });

  it('休養ではケガしない', () => {
    const rng = new Rng('rest');
    for (let i = 0; i < 2000; i++) expect(rollInjury(100, 'REST', rng)).toBeNull();
  });

  it('ケガ発生率: 危険域≈8%、限界≈25%（統計）', () => {
    const rng = new Rng('rate');
    const N = 20000;
    let danger = 0;
    let limit = 0;
    for (let i = 0; i < N; i++) {
      if (rollInjury(85, 'BATTING', rng)) danger++;
      if (rollInjury(100, 'BATTING', rng)) limit++;
    }
    expect(danger / N).toBeGreaterThan(0.07);
    expect(danger / N).toBeLessThan(0.09);
    expect(limit / N).toBeGreaterThan(0.23);
    expect(limit / N).toBeLessThan(0.27);
  });

  it('ケガの重さの比率と離脱日数: 軽傷3〜5日 / 中等度10〜21日 / 重傷30〜60日', () => {
    const rng = new Rng('sev');
    const counts = { MINOR: 0, MODERATE: 0, SEVERE: 0 };
    for (let i = 0; i < 30000; i++) {
      const inj = rollInjury(100, 'BATTING', rng);
      if (!inj) continue;
      counts[inj.severity]++;
      if (inj.severity === 'MINOR') expect(inj.totalDays).toBeGreaterThanOrEqual(3), expect(inj.totalDays).toBeLessThanOrEqual(5);
      if (inj.severity === 'MODERATE') expect(inj.totalDays).toBeGreaterThanOrEqual(10), expect(inj.totalDays).toBeLessThanOrEqual(21);
      if (inj.severity === 'SEVERE') expect(inj.totalDays).toBeGreaterThanOrEqual(30), expect(inj.totalDays).toBeLessThanOrEqual(60);
    }
    const total = counts.MINOR + counts.MODERATE + counts.SEVERE;
    expect(counts.MINOR / total).toBeGreaterThan(0.66);
    expect(counts.MINOR / total).toBeLessThan(0.74);
    expect(counts.SEVERE / total).toBeLessThan(0.04);
  });

  it('疲労は0〜100にクランプされ、休養で大きく回復する', () => {
    const p = makePlayer({ fatigue: 10 });
    processFatigueDay(p, 'REST', false, new Rng(1));
    expect(p.fatigue).toBe(0);
    const q = makePlayer({ fatigue: 0 });
    for (let i = 0; i < 10; i++) processFatigueDay(q, 'PHYSICAL', false, new Rng(i));
    expect(q.fatigue).toBeLessThanOrEqual(100);
  });

  it('日曜日は疲労が20回復', () => {
    const a = makePlayer({ fatigue: 50 });
    const b = makePlayer({ fatigue: 50 });
    processFatigueDay(a, 'BATTING', false, new Rng('s'));
    processFatigueDay(b, 'BATTING', true, new Rng('s'));
    expect(a.fatigue - b.fatigue).toBeCloseTo(20);
  });

  it('熱血漢は疲労が溜まりやすく、マイペースは溜まりにくい', () => {
    const run = (personality: Player['personality']) => {
      const p = makePlayer({ personality, fatigue: 0 });
      processFatigueDay(p, 'PHYSICAL', false, new Rng('same'));
      return p.fatigue;
    };
    expect(run('HOTBLOODED')).toBeGreaterThan(run('DILIGENT'));
    expect(run('MYPACE')).toBeLessThan(run('DILIGENT'));
  });

  it('ケガ中の選手は強制休養し、治療日数が減って完治する', () => {
    const p = makePlayer({ injury: { severity: 'MINOR', daysRemaining: 2, totalDays: 2 }, fatigue: 30 });
    processFatigueDay(p, 'BATTING', false, new Rng(1));
    expect(p.injury?.daysRemaining).toBe(1);
    processFatigueDay(p, 'BATTING', false, new Rng(2));
    expect(p.injury).toBeNull();
  });
});

describe('processTrainingDay', () => {
  it('ケガ中・休養の選手は成長しない', () => {
    const healthy = makePlayer({ id: 'a' });
    const injured = makePlayer({ id: 'b', injury: { severity: 'MINOR', daysRemaining: 3, totalDays: 3 } });
    const resting = makePlayer({ id: 'c' });
    const report = processTrainingDay(
      [healthy, injured, resting],
      new Map([['a', 'BATTING'], ['b', 'BATTING'], ['c', 'REST']] as const),
      { isSunday: false },
      new Rng('t'),
    );
    expect(report.gains.has('a')).toBe(true);
    expect(report.gains.has('b')).toBe(false);
    expect(report.gains.has('c')).toBe(false);
  });

  it('中等度以上のケガで safetyStop が立つ', () => {
    let stopped = false;
    for (let i = 0; i < 200 && !stopped; i++) {
      const p = makePlayer({ id: 'x', fatigue: 100 });
      const r = processTrainingDay([p], new Map([['x', 'BATTING']] as const), { isSunday: false }, new Rng(`s${i}`));
      stopped = r.safetyStop;
      if (r.safetyStop) expect(r.injuries[0].injury.severity).not.toBe('MINOR');
    }
    expect(stopped).toBe(true);
  });

  it('キャプテン肌が同じ練習枠にいると他の部員の成長率が+10%', () => {
    const leader = makePlayer({ id: 'l', personality: 'LEADER' });
    const mate = makePlayer({ id: 'm' });
    const solo = makePlayer({ id: 's' });
    const withLeader = processTrainingDay([leader, mate], new Map([['l', 'BATTING'], ['m', 'BATTING']] as const), { isSunday: false }, new Rng(1));
    const alone = processTrainingDay([solo], new Map([['s', 'BATTING']] as const), { isSunday: false }, new Rng(1));
    expect(withLeader.gains.get('m')!.power! / alone.gains.get('s')!.power!).toBeCloseTo(1.1);
  });
});
