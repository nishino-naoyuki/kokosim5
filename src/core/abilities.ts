import { ABILITY_KEYS, type Abilities } from './types';
import { clamp } from './rng';

export function createAbilities(value = 0): Abilities {
  const a = {} as Abilities;
  for (const k of ABILITY_KEYS) a[k] = value;
  return a;
}

/**
 * 最高球速（km/h）。
 * 肩の強さ（55%）× 投球フォーム（45%）の二次曲線モデル:
 * - 両方0 ➔ 100 km/h
 * - 両方50 ➔ 125 km/h（高校生標準）
 * - 両方100 ➔ 165 km/h（歴代最高峰）
 * 特性『怪童』は +5km/h。
 */
export function pitchVelocity(arm: number, form: number, traits: readonly string[] = []): number {
  const x = clamp((0.55 * arm + 0.45 * form) / 100, 0, 1.2);
  const base = 100 + 35 * x + 30 * (x * x);
  const bonus = traits.includes('怪童') ? 5 : 0;
  return clamp(base + bonus, 90, 175);
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
