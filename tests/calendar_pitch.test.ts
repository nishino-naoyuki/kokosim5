import { describe, expect, it } from 'vitest';
import {
  FIXED_EVENTS,
  addDays,
  advanceCalendar,
  dateKey,
  fixedEventOn,
  isSunday,
  type GameDate,
  type ProgressHooks,
  type QuotaState,
} from '../src/core/calendar';
import {
  QUOTA_MAX_DAYS,
  QUOTA_RECHARGE_MS,
  createQuota,
  msUntilNextDay,
  rechargeQuota,
  useTicket,
} from '../src/core/quota';
import { flightTime, pitchPosition, samplePitchPath, breakVector, type PitchParams } from '../src/core/pitch';

const noHooks = (over: Partial<ProgressHooks> = {}): ProgressHooks => ({
  officialMatchDates: new Set(),
  practiceMatchDates: new Set(),
  onDay: () => undefined,
  ...over,
});
const quota = (days = 90): QuotaState => ({ days, lastRechargeMs: 0, unlimited: false });
const d = (year: number, month: number, day: number): GameDate => ({ year, month, day });

describe('日付ユーティリティ', () => {
  it('月またぎ・年またぎ・うるう年', () => {
    expect(addDays(d(2026, 12, 31), 1)).toEqual(d(2027, 1, 1));
    expect(addDays(d(2028, 2, 28), 1)).toEqual(d(2028, 2, 29));
    expect(addDays(d(2027, 2, 28), 1)).toEqual(d(2027, 3, 1));
  });
  it('日曜判定（2026-10-25は日曜）', () => {
    expect(isSunday(d(2026, 10, 25))).toBe(true);
    expect(isSunday(d(2026, 10, 26))).toBe(false);
  });
  it('固定行事は年間で重複日がない（Safety Stopが二重にならない）', () => {
    const keys = FIXED_EVENTS.map((e) => `${e.month}-${e.day}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(fixedEventOn(d(2026, 4, 8))?.kind).toBe('ENTRANCE');
    expect(fixedEventOn(d(2027, 3, 1))?.kind).toBe('GRADUATION');
  });
});

describe('日程進行（3ボタン＋Safety Stop）', () => {
  it('何も起きなければ指定日数進む', () => {
    const r = advanceCalendar(d(2026, 5, 20), 7, quota(), noHooks());
    expect(r.daysAdvanced).toBe(7);
    expect(r.stopReason).toBeNull();
    expect(r.date).toEqual(d(2026, 5, 27));
  });

  it('1日ごとに onDay が呼ばれる', () => {
    const days: string[] = [];
    advanceCalendar(d(2026, 5, 20), 3, quota(), noHooks({ onDay: (x) => void days.push(dateKey(x)) }));
    expect(days).toEqual(['2026-05-20', '2026-05-21', '2026-05-22']);
  });

  it('学校行事（入学式）の当日で停止', () => {
    const r = advanceCalendar(d(2026, 4, 1), 30, quota(), noHooks());
    expect(r.stopReason).toBe('SCHOOL_EVENT');
    expect(r.stopEvent?.kind).toBe('ENTRANCE');
    expect(r.date).toEqual(d(2026, 4, 8));
    expect(r.daysAdvanced).toBe(7);
  });

  it('行事日からの再開は止まらずに進める', () => {
    const r = advanceCalendar(d(2026, 4, 8), 7, quota(), noHooks());
    expect(r.stopReason).toBeNull();
    expect(r.daysAdvanced).toBe(7);
  });

  it('公式戦は前日と当日に停止', () => {
    const hooks = noHooks({ officialMatchDates: new Set(['2026-07-10']) });
    const r1 = advanceCalendar(d(2026, 7, 1), 30, quota(), hooks);
    expect(r1.stopReason).toBe('OFFICIAL_MATCH');
    expect(r1.date).toEqual(d(2026, 7, 9));
    const r2 = advanceCalendar(r1.date, 30, quota(), hooks);
    expect(r2.stopReason).toBe('OFFICIAL_MATCH');
    expect(r2.date).toEqual(d(2026, 7, 10));
  });

  it('練習試合当日で停止', () => {
    const r = advanceCalendar(d(2026, 6, 1), 30, quota(), noHooks({ practiceMatchDates: new Set(['2026-06-06']) }));
    expect(r.stopReason).toBe('PRACTICE_MATCH');
    expect(r.date).toEqual(d(2026, 6, 6));
  });

  it('主力の重大ケガで停止', () => {
    let n = 0;
    const r = advanceCalendar(d(2026, 5, 20), 7, quota(), noHooks({ onDay: () => (++n === 3 ? { majorInjury: true } : undefined) }));
    expect(r.stopReason).toBe('MAJOR_INJURY');
    expect(r.daysAdvanced).toBe(3);
  });

  it('クォータ枯渇で停止し、消費した分だけ減る', () => {
    const q = quota(3);
    const r = advanceCalendar(d(2026, 5, 20), 30, q, noHooks());
    expect(r.stopReason).toBe('QUOTA_EMPTY');
    expect(r.daysAdvanced).toBe(3);
    expect(q.days).toBe(0);
    const r2 = advanceCalendar(r.date, 7, q, noHooks());
    expect(r2.daysAdvanced).toBe(0);
    expect(r2.stopReason).toBe('QUOTA_EMPTY');
  });

  it('永久フリーパスはクォータを消費しない', () => {
    const q: QuotaState = { days: 0, lastRechargeMs: 0, unlimited: true };
    const r = advanceCalendar(d(2026, 5, 20), 7, q, noHooks());
    expect(r.daysAdvanced).toBe(7);
    expect(q.days).toBe(0);
  });

  it('1年（365日）を通しで進めると全固定行事で停止し、卒業式の次に年度が変わる', () => {
    const hooks = noHooks();
    let date = d(2026, 4, 1);
    const q: QuotaState = { days: 0, lastRechargeMs: 0, unlimited: true };
    const stops: string[] = [];
    for (let i = 0; i < 100 && dateKey(date) < '2027-04-01'; i++) {
      const r = advanceCalendar(date, 30, q, hooks);
      date = r.date;
      if (r.stopEvent) stops.push(r.stopEvent.kind);
    }
    expect(stops).toContain('ENTRANCE');
    expect(stops).toContain('DRAFT');
    expect(stops).toContain('GRADUATION');
    expect(stops).toContain('RETIREMENT');
  });
});

describe('クォータ（16分で1日回復・最大90日）', () => {
  it('90日×16分＝ちょうど24時間で全快', () => {
    expect(QUOTA_MAX_DAYS * QUOTA_RECHARGE_MS).toBe(24 * 60 * 60 * 1000);
  });
  it('0日からの回復', () => {
    const q: QuotaState = { days: 0, lastRechargeMs: 0, unlimited: false };
    rechargeQuota(q, 16 * 60 * 1000 - 1);
    expect(q.days).toBe(0);
    rechargeQuota(q, 16 * 60 * 1000);
    expect(q.days).toBe(1);
    rechargeQuota(q, 16 * 60 * 1000 * 10 + 5000);
    expect(q.days).toBe(10);
    expect(msUntilNextDay(q, 16 * 60 * 1000 * 10 + 5000)).toBe(16 * 60 * 1000 - 5000);
  });
  it('端数時間は持ち越される', () => {
    const q: QuotaState = { days: 0, lastRechargeMs: 0, unlimited: false };
    rechargeQuota(q, 24 * 60 * 1000); // 1.5日分
    expect(q.days).toBe(1);
    rechargeQuota(q, 32 * 60 * 1000); // 合計2日分
    expect(q.days).toBe(2);
  });
  it('24時間放置で90日、それ以上は増えない', () => {
    const q: QuotaState = { days: 0, lastRechargeMs: 0, unlimited: false };
    rechargeQuota(q, 48 * 60 * 60 * 1000);
    expect(q.days).toBe(90);
  });
  it('満タン時は回復タイマーが現在時刻に追従する', () => {
    const q = createQuota(1000);
    rechargeQuota(q, 5_000_000);
    expect(q.lastRechargeMs).toBe(5_000_000);
    expect(msUntilNextDay(q, 5_000_000)).toBe(0);
  });
  it('課金チケットは上限90日を突破できる（+90日、枚数が減る）。0枚ならエラー', () => {
    const q: QuotaState = { days: 80, lastRechargeMs: 0, unlimited: false };
    const r = useTicket(q, { paid: 3, free: 1 }, 'PAID');
    expect(r.quota.days).toBe(170);
    expect(r.tickets).toEqual({ paid: 2, free: 1 });
    expect(() => useTicket(q, { paid: 0, free: 5 }, 'PAID')).toThrow();
  });
  it('無料チケットは90日が上限（超過分は切り捨て）', () => {
    const q: QuotaState = { days: 80, lastRechargeMs: 0, unlimited: false };
    const r = useTicket(q, { paid: 3, free: 2 }, 'FREE');
    expect(r.quota.days).toBe(90);
    expect(r.tickets).toEqual({ paid: 3, free: 1 });
    const q0: QuotaState = { days: 0, lastRechargeMs: 0, unlimited: false };
    expect(useTicket(q0, { paid: 0, free: 1 }, 'FREE').quota.days).toBe(90);
    expect(() => useTicket(q0, { paid: 5, free: 0 }, 'FREE')).toThrow();
  });
  it('自然回復は課金で90日を超えた状態でも増えず、消費して90未満になってから再開する', () => {
    const q: QuotaState = { days: 170, lastRechargeMs: 0, unlimited: false };
    rechargeQuota(q, 10 * 60 * 60 * 1000);
    expect(q.days).toBe(170); // 90以上では自然回復しない
    q.days = 85;
    rechargeQuota(q, 10 * 60 * 60 * 1000 + QUOTA_RECHARGE_MS * 20);
    expect(q.days).toBe(90); // 自然回復は90で頭打ち
  });
});

describe('投球軌道（マグヌス＋3次変位）', () => {
  const base = (over: Partial<PitchParams> = {}): PitchParams => ({
    type: 'FOUR_SEAM',
    velocityKmh: 150,
    release: { x: 0, y: 17, z: 1.9 },
    target: { x: 0.1, z: 0.9 },
    breaking: 80,
    throws: 'R',
    ...over,
  });

  it('到達時間：150km/hで約0.43秒、130km/hで約0.49秒、遅いほど長い', () => {
    expect(flightTime(17, 150)).toBeGreaterThan(0.41);
    expect(flightTime(17, 150)).toBeLessThan(0.45);
    expect(flightTime(17, 130)).toBeGreaterThan(0.47);
    expect(flightTime(17, 130)).toBeLessThan(0.51);
    expect(flightTime(17, 105)).toBeGreaterThan(flightTime(17, 130));
  });

  it('全球種で、始点はリリース位置・終点は目標位置に一致する', () => {
    for (const type of ['FOUR_SEAM', 'SLIDER', 'CURVE', 'FORK', 'CHANGEUP', 'SINKER'] as const) {
      const p = base({ type });
      const T = flightTime(p.release.y, p.velocityKmh);
      const s = pitchPosition(p, 0);
      const e = pitchPosition(p, T);
      expect(s.x).toBeCloseTo(p.release.x);
      expect(s.y).toBeCloseTo(p.release.y);
      expect(s.z).toBeCloseTo(p.release.z);
      expect(e.x).toBeCloseTo(p.target.x);
      expect(e.y).toBeCloseTo(0);
      expect(e.z).toBeCloseTo(p.target.z);
    }
  });

  it('Y は単調に減少（投手→捕手へ一直線に進む）', () => {
    const path = samplePitchPath(base({ type: 'CURVE' }), 50);
    for (let i = 1; i < path.length; i++) expect(path[i].y).toBeLessThan(path[i - 1].y);
  });

  it('同じ到達点でも、フォークは終盤（手元）に大きく沈む。ストレートの終盤落下を上回る', () => {
    const fb = base({ type: 'FOUR_SEAM' });
    const fk = base({ type: 'FORK' });
    const T = flightTime(17, 150);
    const lateDrop = (p: PitchParams) => pitchPosition(p, T * 0.7).z - pitchPosition(p, T).z;
    expect(lateDrop(fk)).toBeGreaterThan(lateDrop(fb) + 0.2);
  });

  it('右投手のスライダーと左投手のスライダーは横変化が逆向き', () => {
    const r = breakVector({ type: 'SLIDER', breaking: 80, throws: 'R' });
    const l = breakVector({ type: 'SLIDER', breaking: 80, throws: 'L' });
    expect(Math.sign(r.dx)).toBe(-Math.sign(l.dx));
  });

  it('キレが高いほど変化量が大きい', () => {
    const lo = breakVector({ type: 'CURVE', breaking: 20, throws: 'R' });
    const hi = breakVector({ type: 'CURVE', breaking: 90, throws: 'R' });
    expect(Math.abs(hi.dz)).toBeGreaterThan(Math.abs(lo.dz));
  });

  it('ストレートはホップ気味で終盤の落下が最小。カーブ・スライダーより沈まない', () => {
    const T = flightTime(17, 150);
    const lateDrop = (type: PitchParams['type']) => {
      const p = base({ type });
      return pitchPosition(p, T * 0.7).z - pitchPosition(p, T).z;
    };
    expect(lateDrop('FOUR_SEAM')).toBeLessThan(lateDrop('CURVE'));
    expect(lateDrop('FOUR_SEAM')).toBeLessThan(lateDrop('SLIDER'));
    expect(lateDrop('FOUR_SEAM')).toBeLessThan(lateDrop('FORK'));
  });
});
