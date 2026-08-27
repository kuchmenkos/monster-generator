/**
 * boolala.boo — face quality / defect smoke checklist.
 * Fails on floating features, particle budget, missing core face parts rates.
 */
import {
  countFloatingFaceParticles,
  PARTICLE_BUDGET,
} from '../src/core/face/quality';
import { generateMonster } from '../src/core/monster';

const N = 80;
const seeds = Array.from({ length: N }, (_, i) => `face-q-${i}-${(i * 31) % 97}`);

let floatingTotal = 0;
let overBudget = 0;
let noEyes = 0;
let noMouth = 0;
let genMs = 0;
let maxParts = 0;

for (const seed of seeds) {
  const t0 = performance.now();
  const m = generateMonster(seed);
  genMs += performance.now() - t0;
  maxParts = Math.max(maxParts, m.particles.length);

  const floating = countFloatingFaceParticles(m.particles);
  floatingTotal += floating;
  if (m.particles.length > PARTICLE_BUDGET) overBudget++;

  const eyes = m.particles.filter((p) => p.part === 'eye' || p.part === 'pupil');
  const mouths = m.particles.filter((p) => p.part === 'mouth');
  if (eyes.length === 0) noEyes++;
  if (mouths.length === 0) noMouth++;
}

const avgMs = genMs / N;
console.log(
  JSON.stringify(
    {
      n: N,
      avgMs: Number(avgMs.toFixed(1)),
      maxParticles: maxParts,
      floatingTotal,
      overBudget,
      noEyes,
      noMouth,
      budget: PARTICLE_BUDGET,
    },
    null,
    2,
  ),
);

if (floatingTotal > 0) throw new Error(`defect: floating face cells=${floatingTotal}`);
if (overBudget > 0) throw new Error(`defect: over particle budget count=${overBudget}`);
if (avgMs > 200) throw new Error(`defect: gen avgMs=${avgMs} > 200`);
if (noEyes > 0) throw new Error(`defect: eyeless monsters=${noEyes}`);
if (noMouth > N * 0.2) throw new Error(`defect: too many mouthless=${noMouth}`);

console.log('face-quality OK');
