import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import {
  PRACTICE_STADIUMS,
  buildStadium,
  chooseMatchStadium,
  choosePracticeStadium,
  fenceDistance,
} from '../src/render/stadium';

describe('球場マスタ ＆ 練習試合・レア球場システム', () => {
  it('練習試合球場A・B・学校球場の基本スペックが仕様通り', () => {
    const a = PRACTICE_STADIUMS.practiceA;
    expect(a.foulLine).toBe(90.0);
    expect(a.center).toBe(120.0);
    expect(a.fenceHeight).toBe(2.0);

    const b = PRACTICE_STADIUMS.practiceB;
    expect(b.foulLine).toBe(85.0);
    expect(b.center).toBe(118.0);
    expect(b.fenceHeight).toBe(3.0);

    const s = PRACTICE_STADIUMS.schoolGround;
    expect(s.isSchoolGround).toBe(true);
    expect(s.fenceHeight).toBe(2.2);
  });

  it('レア球場4種（牢獄・縦長・ヘンテコ・長細）のスペックが仕様通り', () => {
    const prison = PRACTICE_STADIUMS.rarePrison;
    expect(prison.foulLine).toBe(70.0);
    expect(prison.center).toBe(100.0);
    expect(prison.fenceHeight).toBe(20.0);
    expect(prison.isPrison).toBe(true);

    const deep = PRACTICE_STADIUMS.rareDeep;
    expect(deep.foulLine).toBe(120.0);
    expect(deep.center).toBe(126.0);
    expect(deep.fenceHeight).toBe(1.5);

    const weird = PRACTICE_STADIUMS.rareWeird;
    expect(weird.leftFoulLine).toBe(100.0);
    expect(weird.center).toBe(115.0);
    expect(weird.rightFoulLine).toBe(70.0);
    expect(weird.fenceHeight).toBe(3.0);

    const needle = PRACTICE_STADIUMS.rareNeedle;
    expect(needle.foulLine).toBe(80.0);
    expect(needle.center).toBe(150.0);
    expect(needle.fenceHeight).toBe(2.0);
  });

  it('ヘンテコ球場の非対称フェンス距離計算（左100m、中115m、右70m）', () => {
    const weird = PRACTICE_STADIUMS.rareWeird;
    const leftDist = fenceDistance(weird, -Math.PI / 4);
    const centerDist = fenceDistance(weird, 0);
    const rightDist = fenceDistance(weird, Math.PI / 4);

    expect(leftDist).toBeCloseTo(100.0, 1);
    expect(centerDist).toBeCloseTo(115.0, 1);
    expect(rightDist).toBeCloseTo(70.0, 1);
  });

  it('練習試合球場抽選：レア球場（各1%）、通常3種（各32%）の確率分布', () => {
    const counts: Record<string, number> = {};
    const N = 10000;
    const rng = new Rng('test-stadium-distribution');

    for (let i = 0; i < N; i++) {
      const s = choosePracticeStadium(rng, '青雲高校');
      const key = s.isPrison
        ? 'PRISON'
        : s.name.includes('縦長')
          ? 'DEEP'
          : s.name.includes('ヘンテコ')
            ? 'WEIRD'
            : s.name.includes('長細')
              ? 'NEEDLE'
              : s.isSchoolGround
                ? 'SCHOOL'
                : s.name.includes('球場A')
                  ? 'PRACTICE_A'
                  : 'PRACTICE_B';
      counts[key] = (counts[key] ?? 0) + 1;
    }

    // レア球場はそれぞれ約1%（0.5%〜1.8%の範囲）
    expect(counts['PRISON'] / N).toBeGreaterThan(0.005);
    expect(counts['PRISON'] / N).toBeLessThan(0.018);
    expect(counts['DEEP'] / N).toBeGreaterThan(0.005);
    expect(counts['DEEP'] / N).toBeLessThan(0.018);
    expect(counts['WEIRD'] / N).toBeGreaterThan(0.005);
    expect(counts['WEIRD'] / N).toBeLessThan(0.018);
    expect(counts['NEEDLE'] / N).toBeGreaterThan(0.005);
    expect(counts['NEEDLE'] / N).toBeLessThan(0.018);

    // 通常球場はそれぞれ約32%（28%〜36%の範囲）
    expect(counts['PRACTICE_A'] / N).toBeGreaterThan(0.28);
    expect(counts['PRACTICE_A'] / N).toBeLessThan(0.36);
    expect(counts['PRACTICE_B'] / N).toBeGreaterThan(0.28);
    expect(counts['PRACTICE_B'] / N).toBeLessThan(0.36);
    expect(counts['SCHOOL'] / N).toBeGreaterThan(0.28);
    expect(counts['SCHOOL'] / N).toBeLessThan(0.36);
  });

  it('公式戦・甲子園・明治神宮・秋季地区大会持ち回りの球場選定が整合する', () => {
    const rng = new Rng('test-official');

    // 春・夏の全国大会：阪神甲子園球場
    const koshien = chooseMatchStadium('KOSHIEN', '福岡県', true, rng);
    expect(koshien.name).toBe('阪神甲子園球場');
    expect(koshien.foulLine).toBe(95.0);

    // 明治神宮野球大会：明治神宮野球場
    const jingu = chooseMatchStadium('JINGU', '東京都', true, rng);
    expect(jingu.name).toBe('明治神宮野球場');
    expect(jingu.center).toBe(120.0);

    // 春・夏・秋の県大会：決勝・準決勝はメイン球場、それ以外はサブ球場
    const fukuokaFinal = chooseMatchStadium('OFFICIAL', '福岡県', true, rng);
    expect(fukuokaFinal.name).toBe('北九州市民球場');

    const fukuokaPrelim = chooseMatchStadium('OFFICIAL', '福岡県', false, rng);
    expect(fukuokaPrelim.name).toBe('春日公園野球場');

    // 秋季地区大会：九州ブロック持ち回りで佐賀県が当番年の場合
    const kyushuDistrictFinal = chooseMatchStadium('DISTRICT', '福岡県', true, rng, undefined, '佐賀県');
    expect(kyushuDistrictFinal.name).toBe('さがみどりの森球場');

    const kyushuDistrictPrelim = chooseMatchStadium('DISTRICT', '福岡県', false, rng, undefined, '佐賀県');
    expect(kyushuDistrictPrelim.name).toBe('鳥栖市民球場');
  });

  it('Three.js球場オブジェクトのビルドが例外なく完了する（学校グラウンド・牢獄含む）', () => {
    const gNormal = buildStadium(PRACTICE_STADIUMS.practiceA);
    expect(gNormal.children.length).toBeGreaterThan(5);

    const gSchool = buildStadium(PRACTICE_STADIUMS.schoolGround);
    expect(gSchool.children.length).toBeGreaterThan(5);

    const gPrison = buildStadium(PRACTICE_STADIUMS.rarePrison);
    expect(gPrison.children.length).toBeGreaterThan(5);
  });
});
