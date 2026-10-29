import type { QuotaState } from './calendar';

/**
 * 日程進行クォータ（ソシャゲ型B方式：常時リチャージ）。
 * 設計書 6.3.1：最大90日分／16分経過ごとに1日分自然回復（16分×90日＝ちょうど24時間で全快）。
 */
export const QUOTA_MAX_DAYS = 90;
export const QUOTA_RECHARGE_MS = 16 * 60 * 1000;
/** 青雲チケット1枚で即時チャージされる日数 */
export const TICKET_DAYS = 90;

export function createQuota(nowMs: number): QuotaState {
  return { days: QUOTA_MAX_DAYS, lastRechargeMs: nowMs, unlimited: false };
}

/** 現在時刻までの自然回復を反映する。満タン時は回復タイマーを現在時刻に合わせる。 */
export function rechargeQuota(q: QuotaState, nowMs: number): QuotaState {
  if (q.unlimited) return q;
  if (q.days >= QUOTA_MAX_DAYS) {
    q.lastRechargeMs = nowMs;
    return q;
  }
  const elapsed = Math.max(0, nowMs - q.lastRechargeMs);
  const gained = Math.floor(elapsed / QUOTA_RECHARGE_MS);
  if (gained > 0) {
    q.days = Math.min(QUOTA_MAX_DAYS, q.days + gained);
    q.lastRechargeMs = q.days >= QUOTA_MAX_DAYS ? nowMs : q.lastRechargeMs + gained * QUOTA_RECHARGE_MS;
  }
  return q;
}

/** 次の1日分が回復するまでの残りミリ秒（満タン・無制限なら 0） */
export function msUntilNextDay(q: QuotaState, nowMs: number): number {
  if (q.unlimited || q.days >= QUOTA_MAX_DAYS) return 0;
  return Math.max(0, q.lastRechargeMs + QUOTA_RECHARGE_MS - nowMs);
}

/** チケットの種類：課金（Stripe購入）／無料（ゲーム内実績での配布） */
export type TicketKind = 'PAID' | 'FREE';

export interface TicketBalance {
  paid: number;
  free: number;
}

/**
 * チケット使用：日程を +90日分 即時チャージする。
 *  - 課金チケット：上限（90日）を突破してチャージできる（購入者の特典）。
 *  - 無料チケット：上限90日までしか溜まらない（超過分は切り捨て）。
 * 自然回復は常に90日が上限（rechargeQuota 参照）。
 */
export function useTicket(
  q: QuotaState,
  tickets: TicketBalance,
  kind: TicketKind,
): { quota: QuotaState; tickets: TicketBalance } {
  const key = kind === 'PAID' ? 'paid' : 'free';
  if (tickets[key] <= 0) throw new Error('チケットがありません');
  q.days = kind === 'PAID' ? q.days + TICKET_DAYS : Math.min(QUOTA_MAX_DAYS, q.days + TICKET_DAYS);
  return { quota: q, tickets: { ...tickets, [key]: tickets[key] - 1 } };
}
