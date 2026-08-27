import type { BulalashkaSkull } from '../mesh/bulalashkaSkull';
import { anchorOnSurface, silhouetteWidthAtY } from '../mesh/bulalashkaSkull';
import type { Rng } from '../rng';
import type { BulalashkaEyeParams, EyePlan } from '../types';

/** Port mx() — initial eye positions on face plane. */
export function layoutEyes(params: BulalashkaEyeParams, rng: Rng): EyePlan[] {
  const plans: EyePlan[] = [];
  const baseSize = params.eyeSize;
  const spread = params.eyeSpread;
  const y = params.eyeY;

  const makePlan = (x: number, py: number, sizeMul = 1): EyePlan => {
    const size = baseSize * sizeMul * (1 + rng.float(-params.eyeJitter, params.eyeJitter) * 0.35);
    return {
      x,
      y: py,
      size,
      rx: size * 1.05,
      ry: size * (rng.chance(0.3) ? 0.85 : 1.0),
      bulge: params.eyeBulge,
      stand: size * 0.35,
      pupilSize: size * rng.float(0.28, 0.42),
    };
  };

  if (params.eyeLayout === 'cluster' || params.eyeStyle === 'cluster') {
    const count = Math.max(3, Math.min(6, params.eyeCount));
    const ringR = spread * 0.55;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rng.float(-0.2, 0.2);
      const r = ringR * rng.float(0.35, 1.0);
      plans.push(makePlan(Math.cos(a) * r, y + Math.sin(a) * r * 0.35, rng.float(0.55, 1.0)));
    }
    return plans;
  }

  if (params.eyeLayout === 'ring') {
    const count = Math.max(3, params.eyeCount);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      plans.push(makePlan(Math.cos(a) * spread, y + Math.sin(a) * spread * 0.25, 0.85));
    }
    return plans;
  }

  if (params.eyeLayout === 'scatter') {
    for (let i = 0; i < params.eyeCount; i++) {
      plans.push(
        makePlan(
          rng.float(-spread, spread),
          y + rng.float(-spread * 0.4, spread * 0.5),
          rng.float(0.6, 1.1),
        ),
      );
    }
    return plans;
  }

  if (params.eyeLayout === 'column') {
    const step = baseSize * 1.35;
    for (let i = 0; i < params.eyeCount; i++) {
      plans.push(makePlan(0, y + i * step - ((params.eyeCount - 1) * step) / 2, 0.9));
    }
    return plans;
  }

  // row (default)
  const count = Math.max(1, params.eyeCount);
  if (count === 1) {
    plans.push(makePlan(0, y, 1.15));
  } else {
    const step = (spread * 2) / Math.max(1, count - 1);
    for (let i = 0; i < count; i++) {
      const x = -spread + i * step;
      plans.push(makePlan(x, y + rng.float(-0.02, 0.02), rng.float(0.85, 1.05)));
    }
  }
  return plans;
}

function ellipseOverlap(a: EyePlan, b: EyePlan): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const rx = a.rx + b.rx;
  const ry = a.ry + b.ry;
  const nx = dx / Math.max(0.01, rx);
  const ny = dy / Math.max(0.01, ry);
  return Math.max(0, 1 - nx * nx - ny * ny);
}

/** Port Lx() — shrink eye if it sticks past silhouette rim. Returns clip amount 0–1. */
function clipToSilhouette(skull: BulalashkaSkull, plan: EyePlan): number {
  const room = silhouetteWidthAtY(skull, plan.y);
  const margin = plan.rx * 1.15;
  let clip = 0;
  const tests = 8;
  for (let i = 0; i < tests; i++) {
    const a = (i / tests) * Math.PI * 2;
    const px = plan.x + Math.cos(a) * plan.rx;
    if (Math.abs(px) > room - 0.02) {
      const over = Math.abs(px) - (room - 0.02);
      clip = Math.max(clip, over / Math.max(0.01, margin));
      plan.x -= Math.sign(px) * over * 0.55;
      plan.rx *= 1 - over * 0.35;
    }
  }
  return Math.min(1, clip);
}

/** Port Rx() — bounds, collisions, silhouette clip. */
export function solveEyeLayout(
  params: BulalashkaEyeParams,
  plans: EyePlan[],
  skull: BulalashkaSkull,
  mouthFloorY: number,
): { plans: EyePlan[]; silhouetteClip: number } {
  const top = skull.bounds.maxY * 0.82;
  const low = mouthFloorY + params.eyeSize * 0.8;
  let totalClip = 0;

  for (const p of plans) {
    // Vertical bounds
    p.y = Math.min(top, Math.max(low, p.y));
    p.x = Math.max(-silhouetteWidthAtY(skull, p.y) * 0.92, Math.min(silhouetteWidthAtY(skull, p.y) * 0.92, p.x));

    // Anchor bulge from surface
    const anchor = anchorOnSurface(skull, p.x, p.y);
    if (anchor) {
      const n = anchor.normal;
      p.bulge = params.eyeBulge * (0.65 + n.z * 0.55);
      p.stand = p.size * (0.25 + n.z * 0.25);
    }

    totalClip += clipToSilhouette(skull, p);
  }

  // Pairwise collision push
  for (let iter = 0; iter < 6; iter++) {
    for (let i = 0; i < plans.length; i++) {
      for (let j = i + 1; j < plans.length; j++) {
        const a = plans[i]!;
        const b = plans[j]!;
        const ov = ellipseOverlap(a, b);
        if (ov <= 0.01) continue;
        const dx = b.x - a.x || 0.001;
        const dy = b.y - a.y || 0.001;
        const len = Math.hypot(dx, dy) || 0.001;
        const push = ov * 0.08;
        a.x -= (dx / len) * push;
        a.y -= (dy / len) * push * 0.6;
        b.x += (dx / len) * push;
        b.y += (dy / len) * push * 0.6;
      }
    }
  }

  return {
    plans,
    silhouetteClip: plans.length ? totalClip / plans.length : 0,
  };
}
