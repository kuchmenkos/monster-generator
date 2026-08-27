/**
 * boolala.boo — face polish checklist (eyes grid, ears, hair, mustache).
 */
import {
  countFloatingFaceParticles,
  PARTICLE_BUDGET,
} from '../src/core/face/quality';
import { countDetachedAppendages } from '../src/core/score';
import { generateMonster } from '../src/core/monster';
import type { Particle } from '../src/core/types';

const N = 80;
const seeds = Array.from({ length: N }, (_, i) => `face-q-${i}-${(i * 31) % 97}`);

function countEyeLattice(particles: Particle[]): number {
  const byKey = new Map(particles.map((p) => [`${p.col},${p.row}`, p] as const));
  let n = 0;
  for (const p of particles) {
    if (p.part !== 'outline') continue;
    const isEyeish = (part: string) => part === 'eye' || part === 'pupil';
    const L = byKey.get(`${p.col - 1},${p.row}`);
    const R = byKey.get(`${p.col + 1},${p.row}`);
    const U = byKey.get(`${p.col},${p.row + 1}`);
    const D = byKey.get(`${p.col},${p.row - 1}`);
    if (
      (L && R && isEyeish(L.part) && isEyeish(R.part)) ||
      (U && D && isEyeish(U.part) && isEyeish(D.part))
    ) {
      n++;
    }
  }
  return n;
}

let floatingTotal = 0;
let overBudget = 0;
let noEyes = 0;
let noMouth = 0;
let bottomLegs = 0;
let detachedTotal = 0;
let faceOffBody = 0;
let eyeLattice = 0;
let withEar = 0;
let withHair8 = 0;
let withMustache = 0;
let genMs = 0;
let maxParts = 0;

for (const seed of seeds) {
  const t0 = performance.now();
  const m = generateMonster(seed);
  genMs += performance.now() - t0;
  maxParts = Math.max(maxParts, m.particles.length);

  floatingTotal += countFloatingFaceParticles(m.particles);
  if (m.particles.length > PARTICLE_BUDGET) overBudget++;
  eyeLattice += countEyeLattice(m.particles);

  const body = m.particles.filter((p) => p.part === 'body');
  const eyes = m.particles.filter((p) => p.part === 'eye' || p.part === 'pupil');
  const mouths = m.particles.filter((p) => p.part === 'mouth');
  const append = m.particles.filter((p) => p.part === 'appendage');
  const ears = m.particles.filter((p) => p.part === 'ear');
  const hair = m.particles.filter((p) => p.part === 'hair');
  const brows = m.particles.filter((p) => p.part === 'brow');
  if (eyes.length === 0) noEyes++;
  if (mouths.length === 0) noMouth++;
  if (ears.length > 0) withEar++;
  if (hair.length >= 8) withHair8++;
  if (mouths.length > 0 && brows.length >= 3) {
    const lo = Math.min(...mouths.map((p) => p.row));
    const noses = m.particles.filter((p) => p.part === 'nose');
    const hi = noses.length > 0 ? Math.min(...noses.map((p) => p.row)) : lo + 4;
    const stache = brows.filter((p) => p.row >= lo - 1 && p.row <= hi + 1);
    if (stache.length >= 3) withMustache++;
  }

  detachedTotal += countDetachedAppendages(m.particles);

  if (body.length > 0 && append.length > 0) {
    const bodyMinR = Math.min(...body.map((p) => p.row));
    const bodyMaxR = Math.max(...body.map((p) => p.row));
    const bodyH = Math.max(1, bodyMaxR - bodyMinR);
    const legBand = bodyMinR + Math.floor(bodyH * 0.15);
    if (append.some((p) => p.row < legBand)) bottomLegs++;
  }

  if (body.length > 0 && eyes.length > 0) {
    const minC = Math.min(...body.map((p) => p.col));
    const maxC = Math.max(...body.map((p) => p.col));
    const minR = Math.min(...body.map((p) => p.row));
    const maxR = Math.max(...body.map((p) => p.row));
    const pad = 3;
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
      eyeLattice,
      earRate: Number((withEar / N).toFixed(2)),
      hair8Rate: Number((withHair8 / N).toFixed(2)),
      mustacheRate: Number((withMustache / N).toFixed(2)),
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
if (eyeLattice > 0) throw new Error(`defect: eye lattice=${eyeLattice}`);
if (withEar < N * 0.85) throw new Error(`defect: ear coverage ${withEar}/${N}`);
if (withHair8 < N * 0.75) throw new Error(`defect: hair coverage ${withHair8}/${N}`);
if (withMustache < N * 0.4) throw new Error(`defect: mustache coverage ${withMustache}/${N}`);

console.log('face-quality OK');
