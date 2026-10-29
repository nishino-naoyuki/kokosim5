import { clamp, Rng } from '../core/rng';
import { advanceCalendar, ADVANCE_DAYS, dateKey, isSunday, type AdvanceResult, type AdvanceUnit, type FixedEvent, type GameDate } from '../core/calendar';
import { ABILITY_KEYS, type Grade, type Player, type TrainingMenu } from '../core/types';
import { generateFreshmen, type ScoutTier } from '../core/newcomers';
import { rollAnnualMonster } from '../core/monster';
import { allSchools, type SchoolEntry } from '../core/schools';
import { createQuota, rechargeQuota, useTicket, type TicketBalance, type TicketKind } from '../core/quota';
import type { QuotaState } from '../core/calendar';
import { processTrainingDay } from '../core/training';
import { pitchVelocity } from '../core/abilities';

/**
 * ゲーム全体の保存状態（JSONシリアライズ可能）。
 * Phase 4 で Firestore へ同期する際もこの形をそのまま保存する。
 */
export interface GameState {
  version: 1;
  worldSeed: string;
  school: SchoolEntry;
  managerName: string;
  date: GameDate;
  funds: number;
  quota: QuotaState;
  tickets: TicketBalance;
  roster: Player[];
  jersey: Record<string, number>;
  assignments: Record<string, TrainingMenu>;
  facilities: string[];
  scout: ScoutTier;
  /** 今年度の入部式を表示済みか */
  entranceShown: boolean;
  /** 直近の卒業生（卒業式画面用） */
  lastGraduates: Player[];
  /** 日程ログ（新しいものが先頭、最大60件） */
  log: string[];
  /** ゲーム開始年（年度計算用） */
  startYear: number;
}

const SAVE_KEY = 'kokosim5.save.v1';

export const FRESHMEN_YEAR_START = 2026;

export function overall(p: Player): number {
  const a = p.abilities;
  if (p.position === 'P') {
    const v = Math.max(0, Math.min(100, ((pitchVelocity(a.arm, a.form, p.traits) - 110) / 50) * 100));
    return v * 0.3 + a.control * 0.3 + a.breaking * 0.25 + a.stamina * 0.15;
  }
  return a.power * 0.22 + a.contact * 0.25 + a.eye * 0.08 + a.speed * 0.12 + a.fielding * 0.15 + a.arm * 0.08 + a.reaction * 0.05 + a.judgment * 0.05;
}

export function autoMenu(p: Player, index: number): TrainingMenu {
  switch (p.position) {
    case 'P': return 'PITCHING';
    case 'C': return index % 2 === 0 ? 'INFIELD' : 'BATTING';
    case '1B': case '2B': case '3B': case 'SS': return index % 2 === 0 ? 'INFIELD' : 'BATTING';
    default: return index % 2 === 0 ? 'OUTFIELD' : 'BATTING';
  }
}

function assignJerseys(roster: Player[]): Record<string, number> {
  const jersey: Record<string, number> = {};
  const sorted = roster.slice().sort((a, b) => b.grade - a.grade || overall(b) - overall(a));
  const ace = sorted.find((p) => p.position === 'P');
  const catcher = sorted.find((p) => p.position === 'C');
  const used = new Set<number>();
  if (ace) { jersey[ace.id] = 1; used.add(1); }
  if (catcher) { jersey[catcher.id] = 2; used.add(2); }
  let n = 3;
  for (const p of sorted) {
    if (jersey[p.id]) continue;
    while (used.has(n)) n++;
    jersey[p.id] = n;
    used.add(n);
  }
  return jersey;
}

/** 学年が上の部員ほど入部時より成長している初期状態を作る（ゲーム開始時のみの近似） */
function seasonOlder(players: Player[], years: number): void {
  for (const p of players) {
    for (const k of ABILITY_KEYS) p.abilities[k] = clamp(p.abilities[k] + years * 5, 5, 90);
  }
}

export function startingFunds(school: SchoolEntry): number {
  if (school.id === 'custom') return 1_500_000;
  return 1_500_000 + Math.round(school.reputation * 40_000 / 10_000) * 10_000;
}

export function createNewGame(school: SchoolEntry, managerName: string): GameState {
  const worldSeed = `w${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const taken = new Set<string>();
  const roster: Player[] = [];

  const monster = rollAnnualMonster(allSchools(), FRESHMEN_YEAR_START, worldSeed);
  for (const grade of [3, 2, 1] as Grade[]) {
    const year = FRESHMEN_YEAR_START - (grade - 1);
    const list = generateFreshmen(school, year, worldSeed, {
      existingNames: taken,
      monster: grade === 1 && monster && monster.schoolId === school.id ? monster : null,
    });
    for (const p of list) {
      taken.add(`${p.name.family}${p.name.given}`);
      p.grade = grade;
    }
    if (grade > 1) seasonOlder(list, grade - 1);
    roster.push(...list);
  }

  const assignments: Record<string, TrainingMenu> = {};
  roster.forEach((p, i) => (assignments[p.id] = autoMenu(p, i)));

  return {
    version: 1,
    worldSeed,
    school,
    managerName,
    date: { year: FRESHMEN_YEAR_START, month: 4, day: 8 },
    funds: startingFunds(school),
    quota: createQuota(Date.now()),
    tickets: { paid: 0, free: 3 },
    roster,
    jersey: assignJerseys(roster),
    assignments,
    facilities: [],
    scout: 'NONE',
    entranceShown: false,
    lastGraduates: [],
    log: [`${FRESHMEN_YEAR_START}年4月8日 ${school.name}高校の監督に就任しました。`],
    startYear: FRESHMEN_YEAR_START,
  };
}

// ---------------------------------------------------------------------------
// 保存・読み込み
// ---------------------------------------------------------------------------
let current: GameState | null = null;
const listeners = new Set<() => void>();

export function loadSave(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    return s.version === 1 ? s : null;
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  return loadSave() !== null;
}

export function setGame(s: GameState | null): void {
  current = s;
  if (s) persist();
  else localStorage.removeItem(SAVE_KEY);
  emit();
}

export function game(): GameState {
  if (!current) {
    current = loadSave();
    if (!current) throw new Error('ゲームが開始されていません');
  }
  return current;
}

export function hasGame(): boolean {
  return current !== null || hasSave();
}

export function persist(): void {
  if (!current) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(current));
  } catch {
    /* 容量超過などは無視（Phase4でFirestoreへ） */
  }
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(): void {
  listeners.forEach((fn) => fn());
}

export function touch(): void {
  persist();
  emit();
}

function pushLog(s: GameState, msg: string): void {
  s.log.unshift(msg);
  if (s.log.length > 60) s.log.length = 60;
}

// ---------------------------------------------------------------------------
// 日程進行
// ---------------------------------------------------------------------------
export interface AdvanceReport {
  result: AdvanceResult;
  lines: string[];
  event?: FixedEvent;
  /** ケガ人（ログ用） */
  injuries: { name: string; label: string; days: number }[];
}

const INJURY_LABEL = { MINOR: '軽傷', MODERATE: '中等度のケガ', SEVERE: '重傷' } as const;

/** 練習メニューを使って日程を進める。固定イベント到達時はロールオーバー処理も行う。 */
export function advanceGame(unit: AdvanceUnit): AdvanceReport {
  const s = game();
  rechargeQuota(s.quota, Date.now());
  const assignments = new Map<string, TrainingMenu>(Object.entries(s.assignments));
  const lines: string[] = [];
  const injuries: AdvanceReport['injuries'] = [];
  const rng = new Rng(`${s.worldSeed}/train/${dateKey(s.date)}/${unit}/${s.log.length}`);

  const result = advanceCalendar(s.date, ADVANCE_DAYS[unit], s.quota, {
    officialMatchDates: new Set(),
    practiceMatchDates: new Set(),
    onDay: (d) => {
      const rep = processTrainingDay(s.roster, assignments, { isSunday: isSunday(d), facility: undefined }, rng.fork(dateKey(d)));
      for (const inj of rep.injuries) {
        const p = s.roster.find((x) => x.id === inj.playerId);
        if (!p) continue;
        injuries.push({ name: `${p.name.family}${p.name.given}`, label: INJURY_LABEL[inj.injury.severity], days: inj.injury.totalDays });
        lines.push(`🚑 ${dateKey(d)} ${p.name.family}${p.name.given}（${p.grade}年）が${INJURY_LABEL[inj.injury.severity]}（全治${inj.injury.totalDays}日）`);
      }
      return { majorInjury: rep.safetyStop };
    },
  });

  s.date = result.date;
  const event = result.stopEvent;
  if (event) applyEventRollover(s, event, lines);

  const stopText: Record<string, string> = {
    OFFICIAL_MATCH: '⚾ 公式戦のため停止',
    PRACTICE_MATCH: '⚾ 練習試合のため停止',
    SCHOOL_EVENT: `🏫 学校行事「${event?.label ?? ''}」のため停止`,
    QUOTA_EMPTY: '⏳ 進行可能日数が尽きたため停止（チケットで回復できます）',
    MAJOR_INJURY: '🚑 重大なケガ人が出たため停止',
  };
  if (result.stopReason) lines.push(`🛑 ${stopText[result.stopReason]}`);
  pushLog(s, `${dateKey(s.date)} ${result.daysAdvanced}日進行${result.stopReason ? '（' + stopText[result.stopReason] + '）' : ''}`);
  touch();
  return { result, lines, event, injuries };
}

/** 卒業式（3/1）・入学式（4/8）の年次ロールオーバー */
function applyEventRollover(s: GameState, ev: FixedEvent, lines: string[]): void {
  if (ev.kind === 'GRADUATION') {
    const grads = s.roster.filter((p) => p.grade === 3);
    s.lastGraduates = grads;
    s.roster = s.roster.filter((p) => p.grade !== 3);
    for (const g of grads) {
      delete s.assignments[g.id];
      delete s.jersey[g.id];
    }
    lines.push(`🌸 3年生${grads.length}名が卒業しました。`);
  } else if (ev.kind === 'ENTRANCE' && s.date.year > s.startYear) {
    for (const p of s.roster) p.grade = Math.min(3, p.grade + 1) as Grade;
    const taken = new Set(s.roster.map((p) => `${p.name.family}${p.name.given}`));
    const monster = rollAnnualMonster(allSchools(), s.date.year, s.worldSeed);
    const list = generateFreshmen(s.school, s.date.year, s.worldSeed, {
      scout: s.scout,
      existingNames: taken,
      monster: monster && monster.schoolId === s.school.id ? monster : null,
    });
    list.forEach((p, i) => {
      p.grade = 1;
      s.assignments[p.id] = autoMenu(p, i);
    });
    s.roster.push(...list);
    s.jersey = assignJerseys(s.roster);
    s.entranceShown = false;
    lines.push(`🌸 新入部員${list.length}名が入部しました（全部員${s.roster.length}名）。`);
  }
}

// ---------------------------------------------------------------------------
// チケット・練習設定
// ---------------------------------------------------------------------------
export function applyTicket(kind: TicketKind): void {
  const s = game();
  rechargeQuota(s.quota, Date.now());
  const out = useTicket(s.quota, s.tickets, kind);
  s.quota = out.quota;
  s.tickets = out.tickets;
  touch();
}

export function setMenu(playerId: string, menu: TrainingMenu): void {
  game().assignments[playerId] = menu;
  touch();
}

export function setAllMenu(menu: TrainingMenu): void {
  const s = game();
  for (const p of s.roster) s.assignments[p.id] = menu;
  touch();
}

export function autoAssignAll(): void {
  const s = game();
  s.roster.forEach((p, i) => (s.assignments[p.id] = autoMenu(p, i)));
  touch();
}

export function gradeName(g: number): string {
  return `${g}年`;
}
