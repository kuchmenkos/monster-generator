import { bboxFill, countDetachedAppendages, uniqueBodyColors } from '../src/core/score';
import { generateMonster } from '../src/core/monster';
import { generateMonsterName } from '../src/core/names';

const seeds = Array.from({ length: 300 }, (_, i) => `v3-${i}-${(i * 19) % 101}`);

let withMouth = 0;
let withCavity = 0;
let mouthWidthOk = 0;
let toothRatioOk = 0;
let pupilRanged = 0;
let pupilTotal = 0;
let longLegs = 0;
let fillSum = 0;
let genMsSum = 0;
let withAppend = 0;
let connectedLimbs = 0;
let richCoat = 0;
let detachedSum = 0;
let hasNose = 0;
let hasHair = 0;
let hasBrow = 0;
let hasLash = 0;
let hasAccent = 0;
let hasEar = 0;
let maxParticles = 0;
let maxHair = 0;
const archetypes: Record<string, number> = {};

for (const seed of seeds) {
  const t0 = performance.now();
  const m = generateMonster(seed);
  genMsSum += performance.now() - t0;

  archetypes[m.archetype] = (archetypes[m.archetype] || 0) + 1;
  fillSum += bboxFill(m.particles);
  maxParticles = Math.max(maxParticles, m.particles.length);

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
  if (hair.length >= 4) hasHair++;
  if (brows.length > 0) hasBrow++;
  if (lashes.length > 0) hasLash++;
  if (accents.length > 0) hasAccent++;
  if (ears.length > 0) hasEar++;
  maxHair = Math.max(maxHair, hair.length);

  if (append.length >= 6) withAppend++;

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

  if (append.length > 0 && body.length > 0) {
    const midR = (Math.min(...body.map((p) => p.row)) + Math.max(...body.map((p) => p.row))) / 2;
    const below = append.filter((p) => p.row < midR);
    if (below.length > 0) {
      const span =
        Math.max(...below.map((p) => p.row)) - Math.min(...below.map((p) => p.row));
      if (m.scaleRef >= 2 && span >= 4) longLegs++;
      else if (m.scaleRef < 2) longLegs++;
    }
  }

  if (!m.scaleRef || m.scaleRef < 2) throw new Error('scaleRef too low');
  if (m.particles.length > 4500) throw new Error(`too many particles on ${seed}: ${m.particles.length}`);
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
console.log('pupils ranged', pupilRanged, '/', pupilTotal, 'append', withAppend, 'longLegs', longLegs);
console.log('connectedLimbs', connectedLimbs, 'richCoat', richCoat, 'avgDetached', (detachedSum / seeds.length).toFixed(2));
console.log('boxyRate', boxyRate.toFixed(3), 'archetypes', archetypes);
console.log(
  'face',
  'nose=',
  (hasNose / seeds.length).toFixed(2),
  'hair=',
  (hasHair / seeds.length).toFixed(2),
  'brow=',
  (hasBrow / seeds.length).toFixed(2),
  'lash=',
  (hasLash / seeds.length).toFixed(2),
  'accent=',
  (hasAccent / seeds.length).toFixed(2),
  'ear=',
  (hasEar / seeds.length).toFixed(2),
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
if (avgMs > 400) throw new Error(`gen too slow: ${avgMs}ms`);
if (withAppend < seeds.length * 0.6) throw new Error('too few limbs');
if (connectedLimbs < seeds.length * 0.92) throw new Error('too many detached limbs');
if (richCoat < seeds.length * 0.7) throw new Error('too few coat tones');
if (hasNose < seeds.length * 0.7) throw new Error('too few noses');
if (hasHair < seeds.length * 0.65) throw new Error('too few hairstyles');
if (hasBrow < seeds.length * 0.6) throw new Error('too few brows');
if (maxHair > 180) throw new Error(`hair cell bloat: ${maxHair}`);
if (maxParticles > 4500) throw new Error(`particle bloat: ${maxParticles}`);

const n1 = generateMonsterName('n');
if (n1 !== generateMonsterName('n')) throw new Error('name');

console.log('OK');
