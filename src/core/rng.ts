/**
 * 決定論的な疑似乱数ジェネレータ（sfc32）。
 * 設計書 1.2「決定論的（Deterministic）なシミュレーションループによる完全な再現性」に対応。
 */

function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export type SeedLike = string | number | bigint;

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  readonly seedKey: string;

  constructor(seed: SeedLike) {
    this.seedKey = String(seed);
    const [a, b, c, d] = cyrb128(this.seedKey);
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    for (let i = 0; i < 15; i++) this.next();
  }

  /** [0, 1) の一様乱数 */
  next(): number {
    this.a |= 0;
    this.b |= 0;
    this.c |= 0;
    this.d |= 0;
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** min以上max以下の整数（両端含む） */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** min以上max未満の実数 */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** 確率 p で true */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** 正規分布（Box-Muller） */
  normal(mean = 0, sd = 1): number {
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick: empty array');
    return items[Math.floor(this.next() * items.length)];
  }

  /** 重み付き抽選 */
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    let total = 0;
    for (const [, w] of items) total += w;
    let r = this.next() * total;
    for (const [item, w] of items) {
      r -= w;
      if (r < 0) return item;
    }
    return items[items.length - 1][0];
  }

  /** Fisher-Yates シャッフル（新しい配列を返す） */
  shuffle<T>(items: readonly T[]): T[] {
    const arr = items.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** ラベルから独立した決定論的サブストリームを作る */
  fork(label: SeedLike): Rng {
    return new Rng(`${this.seedKey}/${String(label)}`);
  }
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
