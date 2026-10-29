import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { Player } from '../src/core/types';
import {
  changePitcher,
  createLiveMatch,
  pinchHit,
  sendMessenger,
  stepPitch,
} from '../src/match/engine';
import { PRACTICE_STADIUMS } from '../src/render/stadium';

function createDummyRoster(teamPrefix: string): Player[] {
  const positions: Player['position'][] = ['P', 'P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'P', 'C', '1B'];
  return positions.map((pos, idx) => ({
    id: `${teamPrefix}_${idx + 1}`,
    name: { family: teamPrefix, given: `選手${idx + 1}` },
    grade: ((idx % 3) + 1) as 1 | 2 | 3,
    position: pos,
    throws: 'R',
    bats: 'R',
    personality: 'COOL',
    growthType: 'NORMAL',
    faceSeed: `seed_${teamPrefix}_${idx}`,
    abilities: {
      power: 65,
      contact: 70,
      eye: 65,
      speed: 70,
      accel: 65,
      fielding: 70,
      arm: pos === 'P' ? 80 : 70,
      reaction: 65,
      judgment: 65,
      control: pos === 'P' ? 75 : 50,
      stamina: pos === 'P' ? 80 : 50,
      breaking: pos === 'P' ? 70 : 30,
      form: 60,
      guts: 70,
    },
    fatigue: 0,
    injury: null,
    traits: pos === 'P' ? ['マウンドの威圧感'] : [],
    condition: 1,
  }));
}

describe('3D試合進行 ＆ リアルタイム采配エンジン（Phase 3）', () => {
  it('初期試合状態の構築が仕様通り（両軍9人スタメン・投手スタミナ・0-0開始）', () => {
    const rosterA = createDummyRoster('青雲');
    const rosterB = createDummyRoster('九国大付');
    const stadium = PRACTICE_STADIUMS.practiceA;

    const match = createLiveMatch({
      matchId: 'm-test-1',
      tournamentTitle: '秋季県大会',
      roundName: '決勝',
      stadium,
      teamA: {
        id: 'seiun',
        name: '青雲高校',
        prefecture: '福岡県',
        isPlayerTeam: true,
        roster: rosterA,
        uniform: { capColor: '#1e3a8a', shirtColor: '#fff', pantsColor: '#fff', underShirtColor: '#1e3a8a' },
      },
      teamB: {
        id: 'kyukoku',
        name: '九国大付',
        prefecture: '福岡県',
        isPlayerTeam: false,
        roster: rosterB,
        uniform: { capColor: '#dc2626', shirtColor: '#fff', pantsColor: '#fff', underShirtColor: '#dc2626' },
      },
    });

    expect(match.inning).toBe(1);
    expect(match.isBottom).toBe(false);
    expect(match.outs).toBe(0);
    expect(match.scoreA).toBe(0);
    expect(match.scoreB).toBe(0);
    expect(match.teamA.lineup.length).toBe(9);
    expect(match.teamB.lineup.length).toBe(9);
    expect(match.teamA.pitcher.stamina).toBeGreaterThan(100);
    expect(match.teamA.messagesLeft).toBe(3);
  });

  it('1球ごとの投球（stepPitch）でカウント・投球数・スタミナが適切に更新される', () => {
    const rosterA = createDummyRoster('青雲');
    const rosterB = createDummyRoster('九国大付');
    const rng = new Rng('test-pitch-step');

    const match = createLiveMatch({
      matchId: 'm-test-2',
      tournamentTitle: '練習試合',
      roundName: '練習試合',
      stadium: PRACTICE_STADIUMS.practiceA,
      teamA: { id: 'A', name: '青雲', prefecture: '福岡県', isPlayerTeam: true, roster: rosterA, uniform: { capColor: '#1e3a8a', shirtColor: '#fff', pantsColor: '#fff', underShirtColor: '#1e3a8a' } },
      teamB: { id: 'B', name: '九国', prefecture: '福岡県', isPlayerTeam: false, roster: rosterB, uniform: { capColor: '#dc2626', shirtColor: '#fff', pantsColor: '#fff', underShirtColor: '#dc2626' } },
    });

    const initStam = match.teamB.pitcher.stamina;
    const outcome = stepPitch(match, rng);

    expect(match.teamB.pitcher.pitches).toBe(1);
    expect(match.teamB.pitcher.stamina).toBeLessThan(initStam);
    expect(outcome.pitchType).toBeTruthy();
    expect(outcome.speedKmh).toBeGreaterThan(110);
    expect(outcome.tracking).toBeDefined();
  });

  it('バント作戦（BUNT）が発動すると走者が進塁しアウトが加算される', () => {
    const rosterA = createDummyRoster('青雲');
    const rosterB = createDummyRoster('九国大付');
    const rng = new Rng('test-bunt');

    const match = createLiveMatch({
      matchId: 'm-test-3',
      tournamentTitle: '練習試合',
      roundName: '練習試合',
      stadium: PRACTICE_STADIUMS.practiceA,
      teamA: { id: 'A', name: '青雲', prefecture: '福岡県', isPlayerTeam: true, roster: rosterA, uniform: { capColor: '#1e3a8a', shirtColor: '#fff', pantsColor: '#fff', underShirtColor: '#1e3a8a' } },
      teamB: { id: 'B', name: '九国', prefecture: '福岡県', isPlayerTeam: false, roster: rosterB, uniform: { capColor: '#dc2626', shirtColor: '#fff', pantsColor: '#fff', underShirtColor: '#dc2626' } },
    });

    // 一塁に走者を配置
    match.bases.b1 = rosterA[1];
    match.offenseTactic = 'BUNT';

    // バントがインプレーになるまで進める
    let steps = 0;
    while (match.bases.b1 && steps < 10) {
      match.offenseTactic = 'BUNT';
      stepPitch(match, rng);
      steps++;
    }

    // 二塁に進塁したか、またはアウトが記録された
    expect(match.bases.b2 !== null || match.outs > 0).toBe(true);
  });

  it('投手交代（changePitcher）がブルペンから交代しスタミナが全快する', () => {
    const rosterA = createDummyRoster('青雲');
    const rosterB = createDummyRoster('九国大付');

    const match = createLiveMatch({
      matchId: 'm-test-4',
      tournamentTitle: '秋季県大会',
      roundName: '準決勝',
      stadium: PRACTICE_STADIUMS.practiceA,
      teamA: { id: 'A', name: '青雲', prefecture: '福岡県', isPlayerTeam: true, roster: rosterA, uniform: { capColor: '#1e3a8a', shirtColor: '#fff', pantsColor: '#fff', underShirtColor: '#1e3a8a' } },
      teamB: { id: 'B', name: '九国', prefecture: '福岡県', isPlayerTeam: false, roster: rosterB, uniform: { capColor: '#dc2626', shirtColor: '#fff', pantsColor: '#fff', underShirtColor: '#dc2626' } },
    });

    const oldPitcherId = match.teamA.pitcher.player.id;
    const reliefId = match.teamA.bullpen[0]?.id;
    expect(reliefId).toBeDefined();

    const ok = changePitcher(match, 'A', reliefId!);
    expect(ok).toBe(true);
    expect(match.teamA.pitcher.player.id).toBe(reliefId);
    expect(match.teamA.pitcher.pitches).toBe(0);
    expect(match.teamA.pitcher.player.id).not.toBe(oldPitcherId);
  });

  it('伝令（sendMessenger）でスタミナが回復し、残回数が減る', () => {
    const rosterA = createDummyRoster('青雲');
    const rosterB = createDummyRoster('九国大付');

    const match = createLiveMatch({
      matchId: 'm-test-5',
      tournamentTitle: '秋季県大会',
      roundName: '決勝',
      stadium: PRACTICE_STADIUMS.practiceA,
      teamA: { id: 'A', name: '青雲', prefecture: '福岡県', isPlayerTeam: true, roster: rosterA, uniform: { capColor: '#1e3a8a', shirtColor: '#fff', pantsColor: '#fff', underShirtColor: '#1e3a8a' } },
      teamB: { id: 'B', name: '九国', prefecture: '福岡県', isPlayerTeam: false, roster: rosterB, uniform: { capColor: '#dc2626', shirtColor: '#fff', pantsColor: '#fff', underShirtColor: '#dc2626' } },
    });

    match.teamA.pitcher.stamina = 50;
    const ok = sendMessenger(match, 'A');
    expect(ok).toBe(true);
    expect(match.teamA.messagesLeft).toBe(2);
    expect(match.teamA.pitcher.stamina).toBeGreaterThan(50);
  });

  it('代打（pinchHit）で打順スロットの選手がベンチ選手と入れ替わる', () => {
    const rosterA = createDummyRoster('青雲');
    const rosterB = createDummyRoster('九国大付');

    const match = createLiveMatch({
      matchId: 'm-test-6',
      tournamentTitle: '秋季県大会',
      roundName: '決勝',
      stadium: PRACTICE_STADIUMS.practiceA,
      teamA: { id: 'A', name: '青雲', prefecture: '福岡県', isPlayerTeam: true, roster: rosterA, uniform: { capColor: '#1e3a8a', shirtColor: '#fff', pantsColor: '#fff', underShirtColor: '#1e3a8a' } },
      teamB: { id: 'B', name: '九国', prefecture: '福岡県', isPlayerTeam: false, roster: rosterB, uniform: { capColor: '#dc2626', shirtColor: '#fff', pantsColor: '#fff', underShirtColor: '#dc2626' } },
    });

    const pinchHitterId = match.teamA.bench[0]?.id;
    expect(pinchHitterId).toBeDefined();

    const ok = pinchHit(match, 'A', 0, pinchHitterId!);
    expect(ok).toBe(true);
    expect(match.teamA.lineup[0].id).toBe(pinchHitterId);
  });

  it('試合が9回まで完走し、サヨナラまたは最終スコアで決着する', () => {
    const rosterA = createDummyRoster('青雲');
    const rosterB = createDummyRoster('九国大付');
    const rng = new Rng('test-full-match');

    const match = createLiveMatch({
      matchId: 'm-test-full',
      tournamentTitle: '秋季県大会',
      roundName: '1回戦',
      stadium: PRACTICE_STADIUMS.practiceA,
      teamA: { id: 'A', name: '青雲', prefecture: '福岡県', isPlayerTeam: true, roster: rosterA, uniform: { capColor: '#1e3a8a', shirtColor: '#fff', pantsColor: '#fff', underShirtColor: '#1e3a8a' } },
      teamB: { id: 'B', name: '九国', prefecture: '福岡県', isPlayerTeam: false, roster: rosterB, uniform: { capColor: '#dc2626', shirtColor: '#fff', pantsColor: '#fff', underShirtColor: '#dc2626' } },
    });

    let pitches = 0;
    while (!match.isGameOver && pitches < 600) {
      stepPitch(match, rng);
      pitches++;
    }

    expect(match.isGameOver).toBe(true);
    expect(match.inning).toBeGreaterThanOrEqual(9);
    expect(match.winnerTeamId).toBeTruthy();
    expect(match.lineScoreA.length).toBeGreaterThanOrEqual(9);
  });
});
