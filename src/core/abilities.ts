import { ABILITY_KEYS, type Abilities } from './types';
import { clamp } from './rng';

export function createAbilities(value = 0): Abilities {
  const a = {} as Abilities;
  for (const k of ABILITY_KEYS) a[k] = value;
  return a;
}

/**
 * 最高球速（km/h）。設計書 4.4「肩の強さ × 投球フォームの係数演算」。
 * 例: 肩94 × フォーム60 → 約146km/h、平均的な新入生（肩40/フォーム35）→ 約125km/h。
 * 特性『怪童』は +5km/h。
 */
export function pitchVelocity(arm: number, form: number, traits: readonly string[] = []): number {
  const base = 105 + 0.24 * arm + 0.31 * form;
  const bonus = traits.includes('怪童') ? 5 : 0;
  return clamp(base + bonus, 100, 175);
}

/** 能力値のランクアルファベット（E〜S） */
export function abilityRank(value: number): 'S' | 'A' | 'B' | 'C' | 'D' | 'E' {
  if (value >= 85) return 'S';
  if (value >= 70) return 'A';
  if (value >= 55) return 'B';
  if (value >= 40) return 'C';
  if (value >= 25) return 'D';
  return 'E';
}
