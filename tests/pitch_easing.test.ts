import { describe, expect, it } from 'vitest';
import {
  calcBiomechanicsWindupPhase,
  calcBiomechanicsFollowThroughPhase,
  calcFullPitchSequencePhase,
  isRealisticPitchEasingActive,
  setRealisticPitchEasing,
} from '../src/render/match3d';

describe('Pitch Animation Biomechanics Easing & Safety Toggle', () => {
  it('windup phase covers 0.00 to 0.68 monotonically', () => {
    expect(calcBiomechanicsWindupPhase(0)).toBeCloseTo(0.0, 3);
    expect(calcBiomechanicsWindupPhase(1.0)).toBeCloseTo(0.68, 3);

    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const u = i / 100;
      const val = calcBiomechanicsWindupPhase(u);
      expect(val).toBeGreaterThanOrEqual(prev);
      prev = val;
    }
  });

  it('follow-through phase covers 0.68 to 1.00 monotonically', () => {
    expect(calcBiomechanicsFollowThroughPhase(0)).toBeCloseTo(0.68, 3);
    expect(calcBiomechanicsFollowThroughPhase(1.0)).toBeCloseTo(1.00, 3);

    let prev = 0.67;
    for (let i = 0; i <= 100; i++) {
      const p = i / 100;
      const val = calcBiomechanicsFollowThroughPhase(p);
      expect(val).toBeGreaterThanOrEqual(prev);
      prev = val;
    }
  });

  it('full pitch sequence smoothly bridges windup and follow-through', () => {
    expect(calcFullPitchSequencePhase(0)).toBeCloseTo(0.0, 3);
    expect(calcFullPitchSequencePhase(0.58)).toBeCloseTo(0.68, 2);
    expect(calcFullPitchSequencePhase(1.0)).toBeCloseTo(1.0, 3);

    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const p = i / 100;
      const val = calcFullPitchSequencePhase(p);
      expect(val).toBeGreaterThanOrEqual(prev);
      prev = val;
    }
  });

  it('safety toggle enables switching realistic easing on and off', () => {
    setRealisticPitchEasing(false);
    expect(isRealisticPitchEasingActive).toBe(false);
    setRealisticPitchEasing(true);
    expect(isRealisticPitchEasingActive).toBe(true);
  });
});
