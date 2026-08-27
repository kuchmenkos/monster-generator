/**
 * boolala.boo — face quality / limbless defect smoke checklist.
 */
import {
  countFloatingFaceParticles,
  PARTICLE_BUDGET,
} from '../src/core/face/quality';
import { countDetachedAppendages } from '../src/core/score';
import { generateMonster } from '../src/core/monster';

const N = 80;
const seeds = Array.from({ length: N }, (_, i) => `face-q-${i}-${(i * 31) % 97}`);

let floatingTotal = 0;
let overBudget = 0;
let noEyes = 0;
let noMouth = 0;
let bottomLegs = 0;
let detachedTotal = 0;
let faceOffBody = 0;
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

  const body = m.particles.filter((p) => p.part === 'body');
  const eyes = m.particles.filter((p) => p.part === 'eye' || p.part === 'pupil');
  const mouths = m.particles.filter((p) => p.part === 'mouth');
  const append = m.particles.filter((p) => p.part === 'appendage');
  if (eyes.length === 0) noEyes++;
  if (mouths.length === 0) noMouth++;

  detachedTotal += countDetachedAppendages(m.particles);

  if (body.length > 0 && append.length > 0) {
    const bodyMinR = Math.min(...body.map((p) => p.row));
    const bodyMaxR = Math.max(...body.map((p) => p.row));
    const bodyH = Math.max(1, bodyMaxR - bodyMinR);
    const legBand = bodyMinR + Math.floor(bodyH * 0.15);
    if (append.some((p) => p.row < legBand)) bottomLegs++;
  }

  // Eye landmarks should sit on/near body bbox (not far outside)
  if (body.length > 0 && eyes.length > 0) {
    const minC = Math.min(...body.map((p) => p.col));
    const maxC = Math.max(...body.map((p) => p.col));
    const minR = Math.min(...body.map((p) => p.row));
    const maxR = Math.max(...body.map((p) => p.row));
    const pad = 2;
    for (const e of eyes) {
      if (e.col < minC - pad || e.col > maxC + pad || e.row < minR - pad || e.row > maxR + pad) {
        faceOffBody++;
        break;
      }
    }
  }
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
      bottomLegs,
      detachedTotal,
      faceOffBody,
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
if (noMouth > N * 0.15) throw new Error(`defect: too many mouthless=${noMouth}`);
if (bottomLegs > 0) throw new Error(`defect: bottom leg protrusions=${bottomLegs}`);
if (detachedTotal > 0) throw new Error(`defect: detached appendages=${detachedTotal}`);
if (faceOffBody > 0) throw new Error(`defect: face landmarks off body=${faceOffBody}`);

console.log('face-quality OK');
