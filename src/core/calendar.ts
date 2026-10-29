/**
 * 年間365日カレンダーと日程進行（3ボタン進行 ＆ Safety Stop）。
 * calendar_and_progression_specification.md 4〜5章 / 設計書 2.4。
 */

export interface GameDate {
  year: number;
  month: number; // 1〜12
  day: number; // 1〜31
}

export function toUtc(d: GameDate): number {
  return Date.UTC(d.year, d.month - 1, d.day);
}

export function fromUtc(ms: number): GameDate {
  const dt = new Date(ms);
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

export function addDays(d: GameDate, days: number): GameDate {
  return fromUtc(toUtc(d) + days * 86_400_000);
}

export function dateKey(d: GameDate): string {
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

export function isSunday(d: GameDate): boolean {
  return new Date(toUtc(d)).getUTCDay() === 0;
}

export function sameDate(a: GameDate, b: GameDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** 日程進行の3大アクション */
export type AdvanceUnit = 'DAY' | 'WEEK' | 'MONTH';
export const ADVANCE_DAYS: Record<AdvanceUnit, number> = { DAY: 1, WEEK: 7, MONTH: 30 };

export type SchoolEventKind =
  | 'ENTRANCE' // 入学式・新入部員入部
  | 'SPRING_TOURNAMENT_START'
  | 'MIDTERM_TEST'
  | 'DRAW_CEREMONY' // 抽選会
  | 'FINAL_TEST'
  | 'RETIREMENT' // 3年生引退・新チーム始動
  | 'SUMMER_CAMP'
  | 'SPORTS_FESTIVAL'
  | 'DRAFT' // ドラフト会議
  | 'WINTER_BAN_START' // 対外試合禁止期間
  | 'WINTER_CAMP'
  | 'SENBATSU_SELECTION' // センバツ選考委員会
  | 'GRADUATION';

export interface FixedEvent {
  month: number;
  day: number;
  kind: SchoolEventKind;
  label: string;
}

/** 固定スケジュール（Safety Stop対象の学校行事）。日付は設計書 2.4.2 の目安日。 */
export const FIXED_EVENTS: readonly FixedEvent[] = [
  { month: 4, day: 8, kind: 'ENTRANCE', label: '入学式・新入部員入部' },
  { month: 5, day: 15, kind: 'MIDTERM_TEST', label: '1学期 中間テスト' },
  { month: 6, day: 25, kind: 'DRAW_CEREMONY', label: '地方大会 組み合わせ抽選会' },
  { month: 6, day: 28, kind: 'FINAL_TEST', label: '1学期 期末テスト' },
  { month: 8, day: 25, kind: 'RETIREMENT', label: '3年生引退・新チーム始動' },
  { month: 8, day: 28, kind: 'SUMMER_CAMP', label: '夏季強化合宿' },
  { month: 10, day: 5, kind: 'SPORTS_FESTIVAL', label: '体育祭' },
  { month: 10, day: 15, kind: 'MIDTERM_TEST', label: '2学期 中間テスト' },
  { month: 10, day: 24, kind: 'DRAFT', label: 'プロ野球ドラフト会議' },
  { month: 12, day: 5, kind: 'FINAL_TEST', label: '2学期 期末テスト' },
  { month: 12, day: 1, kind: 'WINTER_BAN_START', label: '対外試合禁止期間 開始' },
  { month: 12, day: 28, kind: 'WINTER_CAMP', label: '冬季強化合宿' },
  { month: 1, day: 25, kind: 'SENBATSU_SELECTION', label: 'センバツ選考委員会' },
  { month: 2, day: 15, kind: 'FINAL_TEST', label: '学年末テスト' },
  { month: 3, day: 1, kind: 'GRADUATION', label: '卒業式・OB進路発表' },
];

export function fixedEventOn(d: GameDate): FixedEvent | undefined {
  return FIXED_EVENTS.find((e) => e.month === d.month && e.day === d.day);
}

/** 公式大会の開幕目安日（Phase3で試合日程エンジンに置き換える前提の暫定マイルストーン） */
export interface Milestone {
  month: number;
  day: number;
  label: string;
}

export const MILESTONES: readonly Milestone[] = [
  { month: 4, day: 15, label: '春季地区予選' },
  { month: 5, day: 3, label: '春季県大会' },
  { month: 7, day: 13, label: '夏の地方予選' },
  { month: 8, day: 5, label: '夏の甲子園' },
  { month: 9, day: 5, label: '秋季県大会' },
  { month: 10, day: 17, label: '秋季地区大会' },
  { month: 11, day: 15, label: '明治神宮大会' },
  { month: 3, day: 22, label: '春のセンバツ' },
];

/** 都道府県ごとの大会開幕日（沖縄の夏は全国最速の6月中旬） */
export function milestonesFor(prefecture: string): Milestone[] {
  return MILESTONES.map((m) => (prefecture === '沖縄県' && m.label === '夏の地方予選' ? { ...m, month: 6, day: 14 } : m));
}

/** 指定日以降で最も近いマイルストーン（当日含む）と残り日数 */
export function nextMilestone(d: GameDate, prefecture: string): { milestone: Milestone; daysLeft: number; date: GameDate } {
  const list = milestonesFor(prefecture);
  let best: { milestone: Milestone; daysLeft: number; date: GameDate } | null = null;
  for (const yearOffset of [0, 1]) {
    for (const m of list) {
      const date = { year: d.year + yearOffset, month: m.month, day: m.day };
      const daysLeft = Math.round((toUtc(date) - toUtc(d)) / 86_400_000);
      if (daysLeft >= 0 && (!best || daysLeft < best.daysLeft)) best = { milestone: m, daysLeft, date };
    }
  }
  return best!;
}

export type StopReason =
  | 'OFFICIAL_MATCH' // 公式戦（前日・当日）
  | 'PRACTICE_MATCH' // 練習試合当日
  | 'SCHOOL_EVENT' // 重要学校行事
  | 'QUOTA_EMPTY' // クォータ枯渇
  | 'MAJOR_INJURY'; // 主力の重大アクシデント

export interface ProgressHooks {
  /** 公式戦の日付（YYYY-MM-DD）一覧 */
  officialMatchDates: ReadonlySet<string>;
  /** 練習試合の日付一覧 */
  practiceMatchDates: ReadonlySet<string>;
  /**
   * 1日分の処理（練習成長・疲労・ケガ・イベント）を実行する。
   * 中等度以上のケガが発生した場合は true を返すと進行を停止する。
   */
  onDay: (date: GameDate) => { majorInjury: boolean } | void;
}

export interface QuotaState {
  /** 現在の進行可能日数（0〜90、チケットで超過可） */
  days: number;
  /** 前回の回復計算時刻（ms） */
  lastRechargeMs: number;
  /** 永久フリーパス */
  unlimited: boolean;
}

export interface AdvanceResult {
  date: GameDate;
  daysAdvanced: number;
  stopReason: StopReason | null;
  stopEvent?: FixedEvent;
}

/**
 * 日程を最大 `days` 日進める。以下のSafety Stopで即座に中断する。
 *  1.公式戦の前日・当日 2.練習試合当日 3.重要学校行事 4.クォータ枯渇 5.主力の重大ケガ
 * 少なくとも1日分の消費可能クォータがなければ進めずに QUOTA_EMPTY を返す。
 */
export function advanceCalendar(
  start: GameDate,
  days: number,
  quota: QuotaState,
  hooks: ProgressHooks,
): AdvanceResult {
  let date = start;
  let advanced = 0;
  for (let i = 0; i < days; i++) {
    if (!quota.unlimited && quota.days <= 0) {
      return { date, daysAdvanced: advanced, stopReason: 'QUOTA_EMPTY' };
    }
    const outcome = hooks.onDay(date);
    if (!quota.unlimited) quota.days -= 1;
    date = addDays(date, 1);
    advanced++;

    if (outcome && outcome.majorInjury) {
      return { date, daysAdvanced: advanced, stopReason: 'MAJOR_INJURY' };
    }
    const key = dateKey(date);
    const tomorrowKey = dateKey(addDays(date, 1));
    if (hooks.officialMatchDates.has(key) || hooks.officialMatchDates.has(tomorrowKey)) {
      return { date, daysAdvanced: advanced, stopReason: 'OFFICIAL_MATCH' };
    }
    if (hooks.practiceMatchDates.has(key)) {
      return { date, daysAdvanced: advanced, stopReason: 'PRACTICE_MATCH' };
    }
    const ev = fixedEventOn(date);
    if (ev) return { date, daysAdvanced: advanced, stopReason: 'SCHOOL_EVENT', stopEvent: ev };
    if (!quota.unlimited && quota.days <= 0 && i < days - 1) {
      return { date, daysAdvanced: advanced, stopReason: 'QUOTA_EMPTY' };
    }
  }
  return { date, daysAdvanced: advanced, stopReason: null };
}
