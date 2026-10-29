import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { generateFreshmen } from '../src/core/newcomers';
import { buildTeamProfile, simulateGame, type TeamProfile } from '../src/core/matchSim';
import {
  champion,
  generateBracket,
  nextPowerOfTwo,
  pendingMatches,
  playAll,
  reportResult,
  seedSlots,
  type TournamentTeam,
} from '../src/core/tournament';
import { createAbilities } from '../src/core/abilities';
import type { Player } from '../src/core/types';

function teamOfLevel(id: string, level: number, seed = 'm'): TeamProfile {
  const roster: Player[] = [];
  for (let y = 0; y < 3; y++) {
    const base = generateFreshmen({ id: `${id}${y}`, prefecture: '福岡県', baseRating: 50, stability: 60 }, 2000 + y, seed);
    for (const p of base) {
      for (const k of Object.keys(p.abilities) as (keyof typeof p.abilities)[]) p.abilities[k] = level;
      roster.push(p);
    }
  }
  return buildTeamProfile(id, id, roster);
}

describe('buildTeamProfile', () => {
  it('打順9人＋投手2人以上を編成する', () => {
    const t = teamOfLevel('A', 50);
    expect(t.lineup).toHaveLength(9);
    expect(t.pitchers.length).toBeGreaterThanOrEqual(2);
    expect(t.lineup.every((p) => p.position !== 'P')).toBe(true);
  });
  it('ケガ人は編成から外れる', () => {
    const roster = generateFreshmen({ id: 'z', prefecture: '福岡県', baseRating: 50, stability: 50 }, 2000, 'x');
    const more = [...roster, ...generateFreshmen({ id: 'z2', prefecture: '福岡県', baseRating: 50, stability: 50 }, 2001, 'x')];
    more[0].injury = { severity: 'MINOR', daysRemaining: 3, totalDays: 3 };
    const t = buildTeamProfile('z', 'z', more);
    expect([...t.lineup, ...t.pitchers].some((p) => p.id === more[0].id)).toBe(false);
  });
});

describe('simulateGame（他校試合のイニング単位シミュレーション）', () => {
  it('必ず決着し、スコアとラインスコアが整合する', () => {
    const a = teamOfLevel('A', 55);
    const b = teamOfLevel('B', 55);
    for (let i = 0; i < 300; i++) {
      const r = simulateGame(a, b, new Rng(`g${i}`));
      expect(r.lineScoreA.reduce((s, x) => s + x, 0)).toBe(r.scoreA);
      expect(r.lineScoreB.filter((x) => x >= 0).reduce((s, x) => s + x, 0)).toBe(r.scoreB);
      expect(r.innings).toBeGreaterThanOrEqual(9 - 0);
      expect([a.id, b.id]).toContain(r.winnerId);
      if (r.scoreA !== r.scoreB) expect(r.winnerId).toBe(r.scoreA > r.scoreB ? a.id : b.id);
    }
  });

  it('同じシードなら同じ結果（決定論的）', () => {
    const a = teamOfLevel('A', 55);
    const b = teamOfLevel('B', 55);
    expect(simulateGame(a, b, new Rng('d'))).toEqual(simulateGame(a, b, new Rng('d')));
  });

  it('平均的チーム同士の1試合あたり得点は高校野球らしい水準（片チーム約2〜6点）', () => {
    const a = teamOfLevel('A', 50);
    const b = teamOfLevel('B', 50);
    let runs = 0;
    const N = 600;
    for (let i = 0; i < N; i++) {
      const r = simulateGame(a, b, new Rng(`avg${i}`));
      runs += r.scoreA + r.scoreB;
    }
    const perTeam = runs / N / 2;
    expect(perTeam).toBeGreaterThan(2);
    expect(perTeam).toBeLessThan(6);
  });

  it('戦力が高いチームのほうが勝つが、弱いチームもたまに勝つ（作為的フラグなしでジャイアントキリング）', () => {
    const strong = teamOfLevel('S', 70);
    const weak = teamOfLevel('W', 45);
    let strongWins = 0;
    const N = 500;
    for (let i = 0; i < N; i++) {
      const r = simulateGame(strong, weak, new Rng(`gk${i}`));
      if (r.winnerId === 'S') strongWins++;
    }
    const rate = strongWins / N;
    expect(rate).toBeGreaterThan(0.65);
    expect(rate).toBeLessThan(0.995);
  });

  it('先攻・後攻の有利不利は小さい', () => {
    const a = teamOfLevel('A', 55);
    const b = teamOfLevel('B', 55);
    let aWins = 0;
    const N = 800;
    for (let i = 0; i < N; i++) if (simulateGame(a, b, new Rng(`ho${i}`)).winnerId === 'A') aWins++;
    expect(aWins / N).toBeGreaterThan(0.4);
    expect(aWins / N).toBeLessThan(0.6);
  });

  it('怪物投手のいるチームは失点が少ない', () => {
    const normal = teamOfLevel('N', 55);
    const opp = teamOfLevel('O', 55);
    const withMonster = teamOfLevel('M', 55);
    const ace = generateFreshmen({ id: 'mm', prefecture: '福岡県', baseRating: 50, stability: 50 }, 2000, 'x', {
      monster: { kind: 'PITCHER', slot: 0 },
    })[0];
    withMonster.pitchers.unshift(ace);
    let rN = 0;
    let rM = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      rN += simulateGame(normal, opp, new Rng(`mo${i}`)).scoreB;
      rM += simulateGame(withMonster, opp, new Rng(`mo${i}`)).scoreB;
    }
    expect(rM).toBeLessThan(rN);
  });
});

describe('Tournament', () => {
  const mk = (n: number, seeds = 0): TournamentTeam[] =>
    Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, name: `T${i + 1}`, seed: i < seeds ? i + 1 : undefined }));

  it('nextPowerOfTwo', () => {
    expect([1, 2, 3, 5, 64, 65, 135].map(nextPowerOfTwo)).toEqual([1, 2, 4, 8, 64, 128, 256]);
  });

  it('シード配置：1=最左上, 2=最右下, 3・4=中央', () => {
    expect(seedSlots(16, 4)).toEqual([0, 15, 8, 7]);
    expect(seedSlots(64, 2)).toEqual([0, 63]);
  });

  it('全チームが1回ずつ配置され、不戦勝数は枠数-チーム数', () => {
    for (const n of [2, 3, 5, 8, 13, 16, 31, 64, 100, 135]) {
      const b = generateBracket(mk(n), new Rng(`b${n}`));
      const placed = b.slots.filter(Boolean);
      expect(placed).toHaveLength(n);
      expect(new Set(placed.map((t) => t!.id)).size).toBe(n);
      expect(b.matches[0].filter((m) => m.isBye)).toHaveLength(b.size - n);
    }
  });

  it('1回戦に不戦勝同士の空試合ができない（片方は必ず実チーム）', () => {
    for (const n of [3, 5, 9, 17, 33, 65, 100, 135]) {
      const b = generateBracket(mk(n, 4), new Rng(`bye${n}`));
      for (const m of b.matches[0]) expect(m.a || m.b).toBeTruthy();
    }
  });

  it('シード校は準決勝まで互いに当たらない（4シード）', () => {
    for (let s = 0; s < 30; s++) {
      const teams = mk(64, 4);
      const b = generateBracket(teams, new Rng(`seed${s}`));
      // 4クォーターに各シードが1校ずつ
      const quarter = b.size / 4;
      const q = new Set<number>();
      for (let i = 0; i < b.size; i++) {
        const t = b.slots[i];
        if (t && t.seed) q.add(Math.floor(i / quarter));
      }
      expect(q.size).toBe(4);
    }
  });

  it('シード校は1回戦が不戦勝になりやすい（枠に余裕があるとき）', () => {
    const b = generateBracket(mk(48, 4), new Rng('seedbye'));
    // 48校→64枠で16の不戦勝。シード4校の相方は全て空き。
    for (const pos of seedSlots(64, 4)) expect(b.slots[pos ^ 1]).toBeNull();
  });

  it('全試合を消化して優勝校が決まり、試合数は n-1', () => {
    for (const n of [2, 7, 16, 33, 135]) {
      const teams = mk(n, 4);
      const b = generateBracket(teams, new Rng(`pl${n}`));
      let games = 0;
      const champ = playAll(b, (a, bb) => {
        games++;
        return a.id < bb.id ? a.id : bb.id;
      });
      expect(champ).not.toBeNull();
      expect(games).toBe(n - 1);
      expect(champion(b)?.id).toBe(champ!.id);
      expect(pendingMatches(b)).toHaveLength(0);
    }
  });

  it('参加校でない勝者は登録できない', () => {
    const b = generateBracket(mk(4), new Rng('x'));
    const m = pendingMatches(b)[0];
    expect(() => reportResult(b, m.round, m.index, 'nobody')).toThrow();
  });

  it('実際のシミュレーションで全国規模の大会が回る', () => {
    const teams = Array.from({ length: 16 }, (_, i) => ({ id: `s${i}`, name: `S${i}`, seed: i < 4 ? i + 1 : undefined }));
    const profiles = new Map(teams.map((t, i) => [t.id, teamOfLevel(t.id, 40 + i * 2)]));
    const b = generateBracket(teams, new Rng('real'));
    const champ = playAll(b, (a, bb) =>
      simulateGame(profiles.get(a.id)!, profiles.get(bb.id)!, new Rng(`${a.id}-${bb.id}`)).winnerId,
    );
    expect(champ).not.toBeNull();
  });

  it('createAbilities 補助', () => {
    expect(createAbilities(10).power).toBe(10);
  });
});
