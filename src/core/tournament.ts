import type { Rng } from './rng';

/**
 * トーナメント自動編成エンジン（シード配置 ＆ 山組み）。
 * school_master_and_tournament_specification.md 4章。
 */

export interface TournamentTeam {
  id: string;
  name: string;
  /** シード順位（1始まり）。未指定は一般枠 */
  seed?: number;
}

export interface BracketMatch {
  /** 0 = 1回戦 … rounds-1 = 決勝 */
  round: number;
  /** ラウンド内の試合番号（上から 0 始まり） */
  index: number;
  a: TournamentTeam | null;
  b: TournamentTeam | null;
  winner: TournamentTeam | null;
  /** 不戦勝（片方が空きスロット）で自動決着した試合 */
  isBye: boolean;
}

export interface Bracket {
  /** 枠数（2のべき乗） */
  size: number;
  rounds: number;
  /** rounds[r] = そのラウンドの試合配列 */
  matches: BracketMatch[][];
  /** 1回戦の枠配置（null = 不戦勝用の空き枠） */
  slots: (TournamentTeam | null)[];
}

export function nextPowerOfTwo(n: number): number {
  let s = 1;
  while (s < n) s *= 2;
  return s;
}

/**
 * シード枠のスロット位置を返す。
 * 第1シード：最左上 / 第2シード：最右下 / 第3・第4：準決勝まで上位2校と当たらない中央枠。
 * 第5〜8シード：各クォーターの残り（8枠の山の頭）。
 */
export function seedSlots(size: number, seedCount: number): number[] {
  const slots: number[] = [];
  if (seedCount >= 1) slots.push(0);
  if (seedCount >= 2) slots.push(size - 1);
  if (seedCount >= 3) slots.push(size / 2); // 第3シード：後半の山の頭
  if (seedCount >= 4) slots.push(size / 2 - 1); // 第4シード：前半の山の尻
  if (seedCount >= 5) {
    // 第5〜8シード：各クォーターの反対側の端
    const q = size / 4;
    const extra = [q * 3, q - 1, q, q * 3 - 1];
    for (let i = 0; i < Math.min(seedCount - 4, 4); i++) slots.push(extra[i]);
  }
  return slots.slice(0, seedCount);
}

/**
 * 不戦勝（空き枠）の位置を決める。
 * シード校の隣（スロットの相方）を最優先で空け、残りは均等に散らす。
 */
function byeSlots(size: number, byes: number, seedPositions: readonly number[], occupied: Set<number>): Set<number> {
  const result = new Set<number>();
  // シード校の相方を優先（シード順）
  for (const pos of seedPositions) {
    if (result.size >= byes) break;
    const partner = pos ^ 1;
    if (!occupied.has(partner)) result.add(partner);
  }
  // 残りは試合ペアごとに均等に（上から順に、ペアの片方を空ける）
  let step = 0;
  while (result.size < byes && step < size) {
    const pairIndex = (step * 7) % (size / 2); // 互いに素に近い歩幅で分散
    const candidates = [pairIndex * 2, pairIndex * 2 + 1];
    for (const c of candidates) {
      if (!occupied.has(c) && !result.has(c) && !result.has(c ^ 1)) {
        result.add(c);
        break;
      }
    }
    step++;
  }
  // 万一足りなければ空いている枠から埋める
  for (let i = 0; i < size && result.size < byes; i++) {
    if (!occupied.has(i) && !result.has(i)) result.add(i);
  }
  return result;
}

/**
 * チーム一覧からトーナメント表を生成する。
 * `seed` を持つチームは seedSlots に従って配置、残りは `rng` で抽選。
 */
export function generateBracket(teams: readonly TournamentTeam[], rng: Rng): Bracket {
  if (teams.length < 2) throw new Error('トーナメントには2校以上が必要です');
  const size = nextPowerOfTwo(teams.length);
  const byes = size - teams.length;

  const seeded = teams
    .filter((t) => t.seed !== undefined)
    .sort((a, b) => (a.seed as number) - (b.seed as number));
  const unseeded = rng.shuffle(teams.filter((t) => t.seed === undefined));

  const slots: (TournamentTeam | null)[] = new Array(size).fill(null);
  const occupied = new Set<number>();
  const positions = seedSlots(size, Math.min(seeded.length, 8, size));
  seeded.slice(0, positions.length).forEach((team, i) => {
    slots[positions[i]] = team;
    occupied.add(positions[i]);
  });
  // シード枠からあふれたチームは一般枠扱い
  const rest = [...seeded.slice(positions.length), ...unseeded];
  const byeSet = byeSlots(size, byes, positions, occupied);

  let cursor = 0;
  for (let i = 0; i < size; i++) {
    if (occupied.has(i) || byeSet.has(i)) continue;
    slots[i] = rest[cursor++] ?? null;
  }

  const rounds = Math.log2(size);
  const matches: BracketMatch[][] = [];
  for (let r = 0; r < rounds; r++) {
    const count = size / 2 ** (r + 1);
    matches.push(
      Array.from({ length: count }, (_, index) => ({
        round: r,
        index,
        a: null,
        b: null,
        winner: null,
        isBye: false,
      })),
    );
  }
  for (let i = 0; i < size / 2; i++) {
    const m = matches[0][i];
    m.a = slots[i * 2];
    m.b = slots[i * 2 + 1];
    resolveBye(m);
  }
  propagate(matches);
  return { size, rounds, matches, slots };
}

function resolveBye(m: BracketMatch): void {
  if (m.a && !m.b) {
    m.winner = m.a;
    m.isBye = true;
  } else if (!m.a && m.b) {
    m.winner = m.b;
    m.isBye = true;
  }
}

/** 勝者を次ラウンドへ流し込む（不戦勝は1回戦のみ。2回戦以降は両者が揃うまで待つ） */
function propagate(matches: BracketMatch[][]): void {
  for (let r = 0; r < matches.length - 1; r++) {
    matches[r].forEach((m, i) => {
      const next = matches[r + 1][Math.floor(i / 2)];
      if (i % 2 === 0) next.a = m.winner;
      else next.b = m.winner;
    });
  }
}

/** 試合結果を登録し、勝者を次ラウンドへ進める */
export function reportResult(bracket: Bracket, round: number, index: number, winnerId: string): void {
  const m = bracket.matches[round][index];
  if (!m.a || !m.b) throw new Error('対戦カードが未確定です');
  const winner = [m.a, m.b].find((t) => t.id === winnerId);
  if (!winner) throw new Error('勝者がこの試合の参加校ではありません');
  m.winner = winner;
  propagate(bracket.matches);
}

/** 次に実施すべき（両校確定・未決着）試合の一覧 */
export function pendingMatches(bracket: Bracket): BracketMatch[] {
  return bracket.matches.flat().filter((m) => m.a && m.b && !m.winner);
}

export function champion(bracket: Bracket): TournamentTeam | null {
  return bracket.matches[bracket.rounds - 1][0].winner;
}

/** プロバイダ関数で全試合を最後まで進める（他校のみの大会・一括シミュレーション用） */
export function playAll(
  bracket: Bracket,
  play: (a: TournamentTeam, b: TournamentTeam) => string,
): TournamentTeam | null {
  for (;;) {
    const pending = pendingMatches(bracket);
    if (pending.length === 0) break;
    const m = pending[0];
    reportResult(bracket, m.round, m.index, play(m.a!, m.b!));
  }
  return champion(bracket);
}
