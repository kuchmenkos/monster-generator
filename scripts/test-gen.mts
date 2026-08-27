import { countFloatingFaceParticles, PARTICLE_BUDGET } from '../src/core/face/quality';
import { bboxFill, countDetachedAppendages, uniqueBodyColors } from '../src/core/score';
import { generateMonster } from '../src/core/monster';
import { generateMonsterName } from '../src/core/names';
import type { Particle } from '../src/core/types';

const seeds = Array.from({ length: 300 }, (_, i) => `v3-${i}-${(i * 19) % 101}`);

/** Outline cell sandwiched by eye/pupil on ≥2 opposite sides = lattice defect. */
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
    const horiz = L && R && isEyeish(L.part) && isEyeish(R.part);
    const vert = U && D && isEyeish(U.part) && isEyeish(D.part);
    if (horiz || vert) n++;
  }
  return n;
}

/** Dedicated mustache part (≥3 cells). */
function hasMustacheProxy(particles: Particle[]): boolean {
  return particles.filter((p) => p.part === 'mustache').length >= 3;
}

/** Brow spans ≥2 distinct rows near an eye — thickness proxy. */
function hasThickBrows(particles: Particle[]): boolean {
  const brows = particles.filter((p) => p.part === 'brow');
  if (brows.length < 4) return false;
  const rows = new Set(brows.map((p) => p.row));
  return rows.size >= 2;
}

let withMouth = 0;
let withCavity = 0;
let mouthWidthOk = 0;
let toothRatioOk = 0;
let pupilRanged = 0;
let pupilTotal = 0;
let fillSum = 0;
let genMsSum = 0;
let connectedLimbs = 0;
let richCoat = 0;
let detachedSum = 0;
let hasNose = 0;
let hasHair = 0;
let hasBrow = 0;
let hasLash = 0;
let hasAccent = 0;
let hasEar = 0;
let hasMustache = 0;
let thickBrow = 0;
let maxParticles = 0;
let maxHair = 0;
let floatingSum = 0;
let floatingWorst = 0;
let bottomLegHits = 0;
let eyeLatticeSum = 0;
let withAnyAppend = 0;
let headOnlyAppend = 0;
const archetypes: Record<string, number> = {};

for (const seed of seeds) {
  const t0 = performance.now();
  const m = generateMonster(seed);
  genMsSum += performance.now() - t0;

  archetypes[m.archetype] = (archetypes[m.archetype] || 0) + 1;
  fillSum += bboxFill(m.particles);
  maxParticles = Math.max(maxParticles, m.particles.length);

  const floating = countFloatingFaceParticles(m.particles);
  floatingSum += floating;
  floatingWorst = Math.max(floatingWorst, floating);
  if (floating > 0) throw new Error(`floating face features on ${seed}: ${floating}`);
  if (m.particles.length > PARTICLE_BUDGET) {
    throw new Error(`particle budget exceeded on ${seed}: ${m.particles.length}`);
  }

  const lattice = countEyeLattice(m.particles);
  eyeLatticeSum += lattice;
  if (lattice > 0) throw new Error(`eye lattice on ${seed}: ${lattice}`);

  const body = m.particles.filter((p) => p.part === 'body');
  const mouths = m.particles.filter((p) => p.part === 'mouth' || p.part === 'tooth');
  const teeth = m.particles.filter((p) => p.part === 'tooth');
  const pupils = m.particles.filter((p) => p.part === 'pupil');
  const append = m.particles.filter((p) => p.part === 'appendage');
  const noses = m.particles.filter((p) => p.part === 'nose');
  const hair = m.particles.filter((p) => p.part === 'hair');
  const brows = m.particles.filter((p) => p.part === 'brow');
  const lashes = m.particles.filter((p) => p.part === 'lash');
  const accents = m.particles.filter((p) => p.part === 'freckle');
  const ears = m.particles.filter((p) => p.part === 'ear');

  if (noses.length > 0) hasNose++;
  if (hair.length >= 8) hasHair++;
  if (brows.length > 0) hasBrow++;
  if (lashes.length > 0) hasLash++;
  if (accents.length > 0) hasAccent++;
  if (ears.length > 0) hasEar++;
  if (hasMustacheProxy(m.particles)) hasMustache++;
  if (hasThickBrows(m.particles)) thickBrow++;
  maxHair = Math.max(maxHair, hair.length);

  if (append.length > 0) withAnyAppend++;

  if (body.length > 0 && append.length > 0) {
    const bodyMinR = Math.min(...body.map((p) => p.row));
    const bodyMaxR = Math.max(...body.map((p) => p.row));
    const bodyH = Math.max(1, bodyMaxR - bodyMinR);
    const legBand = bodyMinR + Math.floor(bodyH * 0.15);
    const headBand = bodyMinR + Math.floor(bodyH * 0.7);
    const bottom = append.filter((p) => p.row < legBand);
    if (bottom.length > 0) bottomLegHits++;
    if (append.every((p) => p.row >= headBand)) headOnlyAppend++;
  }

  const detached = countDetachedAppendages(m.particles);
  detachedSum += detached;
  if (append.length === 0 || detached === 0) connectedLimbs++;
  if (uniqueBodyColors(m.particles) >= 3) richCoat++;

  pupilTotal += pupils.length;
  pupilRanged += pupils.filter((p) => p.pupilRange && p.pupilRange.x > 0).length;

  if (mouths.length > 0) {
    withMouth++;
    if (mouths.some((p) => p.mouthRole === 'cavity')) withCavity++;
    if (body.length > 0) {
      const faceW = Math.max(
        1,
        Math.max(...body.map((p) => p.col)) - Math.min(...body.map((p) => p.col)),
      );
      const mouthW =
        Math.max(...mouths.map((p) => p.col)) - Math.min(...mouths.map((p) => p.col));
      if (mouthW / faceW <= 0.62) mouthWidthOk++;
      if (teeth.length / mouths.length <= 0.45) toothRatioOk++;
    }
  }

  if (!m.scaleRef || m.scaleRef < 2) throw new Error('scaleRef too low');
}

const a = generateMonster('alpha-check');
const b = generateMonster('alpha-check');
const same =
  a.particles.length === b.particles.length &&
  a.archetype === b.archetype &&
  a.particles.every(
    (p, i) =>
      p.x === b.particles[i]!.x &&
      p.y === b.particles[i]!.y &&
      p.part === b.particles[i]!.part,
  );

const avgFill = fillSum / seeds.length;
const avgMs = genMsSum / seeds.length;
const boxyRate =
  ((archetypes.column || 0) + (archetypes.wide || 0)) / seeds.length;

console.log('n=', seeds.length, 'avgMs=', avgMs.toFixed(1), 'avgFill=', avgFill.toFixed(3));
console.log('mouths', withMouth, 'cavity', withCavity, 'widthOk', mouthWidthOk, 'toothOk', toothRatioOk);
console.log(
  'pupils ranged',
  pupilRanged,
  '/',
  pupilTotal,
  'anyAppend',
  withAnyAppend,
  'headOnlyAppend',
  headOnlyAppend,
  'bottomLegs',
  bottomLegHits,
  'eyeLattice',
  eyeLatticeSum,
);
console.log('connectedLimbs', connectedLimbs, 'richCoat', richCoat, 'avgDetached', (detachedSum / seeds.length).toFixed(2));
console.log('boxyRate', boxyRate.toFixed(3), 'archetypes', archetypes);
console.log(
  'face',
  'nose=',
  (hasNose / seeds.length).toFixed(2),
  'hair8=',
  (hasHair / seeds.length).toFixed(2),
  'brow=',
  (hasBrow / seeds.length).toFixed(2),
  'thickBrow=',
  (thickBrow / seeds.length).toFixed(2),
  'lash=',
  (hasLash / seeds.length).toFixed(2),
  'ear=',
  (hasEar / seeds.length).toFixed(2),
  'mustache=',
  (hasMustache / seeds.length).toFixed(2),
  'maxHair=',
  maxHair,
  'maxParticles=',
  maxParticles,
);
console.log('deterministic', same);

if (!same) throw new Error('determinism failed');
if (withMouth < seeds.length * 0.85) throw new Error('too few mouths');
if (withCavity < withMouth * 0.7) throw new Error('missing cavity');
if (mouthWidthOk < withMouth * 0.85) throw new Error('mouths too wide');
if (avgFill > 0.78) throw new Error('avg bbox fill too high (boxy)');
if (pupilRanged < pupilTotal * 0.7) throw new Error('pupils missing pupilRange');
if (boxyRate > 0.02) throw new Error('too many boxy archetypes');
if (avgMs > 200) throw new Error(`gen too slow: ${avgMs}ms (budget 200ms)`);
if (bottomLegHits > 0) throw new Error(`bottom leg protrusions: ${bottomLegHits}`);
if (detachedSum > 0) throw new Error(`detached appendages total=${detachedSum}`);
if (eyeLatticeSum > 0) throw new Error(`eye lattice total=${eyeLatticeSum}`);
if (connectedLimbs < seeds.length * 0.92) throw new Error('too many detached limbs');
if (richCoat < seeds.length * 0.7) throw new Error('too few coat tones');
if (hasNose < seeds.length * 0.7) throw new Error('too few noses');
if (hasHair < seeds.length * 0.75) throw new Error('too few dense hairstyles');
if (hasBrow < seeds.length * 0.55) throw new Error('too few brows');
if (thickBrow < seeds.length * 0.5) throw new Error('brows too thin');
if (hasEar < seeds.length * 0.85) throw new Error('too few ears');
if (hasMustache < seeds.length * 0.2) throw new Error('too few mustaches');
if (maxHair > 220) throw new Error(`hair cell bloat: ${maxHair}`);
if (maxParticles > PARTICLE_BUDGET) throw new Error(`particle bloat: ${maxParticles}`);
if (floatingSum > 0) throw new Error(`floating face features total=${floatingSum}`);

const n1 = generateMonsterName('n');
if (n1 !== generateMonsterName('n')) throw new Error('name');

console.log('OK');
