import { abilityRank } from '../core/abilities';
import { GROWTH_TYPE_TABLE, PERSONALITY_TABLE } from '../core/constants';
import { MENU_LABELS } from '../core/constants';
import { reputationRank, type Player, type Position, type TrainingMenu } from '../core/types';
import { overall } from '../game/state';

export const esc = (s: string | number): string =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const yen = (n: number): string => `¥${Math.round(n).toLocaleString('ja-JP')}`;

export const POS_JA: Record<Position, string> = {
  P: '投', C: '捕', '1B': '一', '2B': '二', '3B': '三', SS: '遊', LF: '左', CF: '中', RF: '右',
};
export const POS_LONG: Record<Position, string> = {
  P: '投手', C: '捕手', '1B': '一塁手', '2B': '二塁手', '3B': '三塁手', SS: '遊撃手', LF: '左翼手', CF: '中堅手', RF: '右翼手',
};

export const posGroup = (p: Position): 'P' | 'C' | 'IF' | 'OF' =>
  p === 'P' ? 'P' : p === 'C' ? 'C' : p === 'LF' || p === 'CF' || p === 'RF' ? 'OF' : 'IF';

export const HAND = (p: Player): string => `${p.throws === 'R' ? '右' : '左'}投${p.bats === 'R' ? '右' : p.bats === 'L' ? '左' : '両'}打`;

export const personalityLabel = (p: Player): string => PERSONALITY_TABLE[p.personality].label;
export const growthLabel = (p: Player): string => GROWTH_TYPE_TABLE[p.growthType].label;

export function rank(val: number): string {
  const r = abilityRank(val);
  return `<span class="rk rk-${r}">${r}</span><span class="rv">${Math.round(val)}</span>`;
}

export function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 出身チーム（シニア・ボーイズ等）。IDから決定論的に決まる演出用データ */
export function juniorTeam(p: Player, prefecture: string): string {
  const short = prefecture.replace(/[都道府県]$/, '');
  const areas = ['中央', '北', '南', '東', '西', '城東', '港', '桜'];
  const kinds = ['シニア', 'ボーイズ', 'リトルシニア', 'ヤング'];
  const h = hash32(p.id);
  return `${short}${areas[h % areas.length]}${kinds[(h >> 4) % kinds.length]}`;
}

/** 期待度（★）：総合力から 1〜5（0.5刻み） */
export function stars(p: Player): { value: number; text: string; special: boolean } {
  const o = overall(p);
  const v = Math.max(1, Math.min(5, Math.round((1 + (o - 25) / 11) * 2) / 2));
  const full = Math.floor(v);
  const text = '★'.repeat(full) + (v - full >= 0.5 ? '☆' : '') ;
  return { value: v, text, special: v >= 4.5 || !!p.monster };
}

export const rankLabel = (rep: number): string => reputationRank(rep);

export function repLabel(rep: number): string {
  if (rep >= 90) return '名門';
  if (rep >= 75) return '強豪';
  if (rep >= 60) return '中堅';
  if (rep >= 40) return 'そこそこ';
  return '弱小';
}

export const MENU_ORDER: TrainingMenu[] = ['BATTING', 'INFIELD', 'OUTFIELD', 'PITCHING', 'PHYSICAL', 'REST'];

/** 練習指示画面仕様書 3.1 の表示用メタデータ */
export const MENU_META: Record<TrainingMenu, { title: string; sub: string; load: string; injury: string; growth: string; danger?: boolean; rest?: boolean }> = {
  BATTING: { title: '打撃強化', sub: 'マシン＆フリー打撃', load: '中', injury: '1.8%', growth: '長打力(中)↑、ミート力(中)↑、選球眼(小)↑' },
  INFIELD: { title: '内野守備', sub: 'シートノック＆連係', load: '中', injury: '1.8%', growth: '捕球力(大)↑↑、反応速度(大)↑↑、判断力(中)↑' },
  OUTFIELD: { title: '外野・機動', sub: '外野フライ・送球＆走塁', load: '中', injury: '1.5%', growth: '走力(中)↑、肩の強さ(中)↑、加速(隠し)↑' },
  PITCHING: { title: '投手陣', sub: 'ブルペン投げ込み＆フォーム', load: '大', injury: '2.5%', growth: 'コントロール(大)↑↑、投球フォーム(中)↑、変化球↑' },
  PHYSICAL: { title: 'フィジカル・特守', sub: '筋力ウエイト＆猛ノック', load: '極大', injury: '4.5%', growth: '長打力(特大)↑↑↑、捕球力(特大)↑↑↑、度胸↑', danger: true },
  REST: { title: '休養・ケア', sub: 'ストレッチ＆疲労回復', load: 'なし', injury: '0.0%', growth: '疲労度 -30% 大幅回復（怪我発生ゼロ）', rest: true },
};

export const menuLabel = (m: TrainingMenu): string => MENU_LABELS[m];
