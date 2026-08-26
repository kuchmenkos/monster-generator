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
const archetypes: Record<string, number> = {};

for (const seed of seeds) {
  const t0 = performance.now();
  const m = generateMonster(seed);
  genMsSum += performance.now() - t0;

  archetypes[m.archetype] = (archetypes[m.archetype] || 0) + 1;
  fillSum += bboxFill(m.particles);

  const body = m.particles.filter((p) => p.part === 'body');
  const mouths = m.particles.filter((p) => p.part === 'mouth' || p.part === 'tooth');
  const teeth = m.particles.filter((p) => p.part === 'tooth');
  const pupils = m.particles.filter((p) => p.part === 'pupil');
  const append = m.particles.filter((p) => p.part === 'appendage');

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
      if (teeth.length / mouths.length <= 0.35) toothRatioOk++;
    }
  }

  // Leg length proxy: vertical span of appendages below body mid
  if (append.length > 0 && body.length > 0) {
    const midR = (Math.min(...body.map((p) => p.row)) + Math.max(...body.map((p) => p.row))) / 2;
    const below = append.filter((p) => p.row < midR);
    if (below.length > 0) {
      const span =
        Math.max(...below.map((p) => p.row)) - Math.min(...below.map((p) => p.row));
      if (m.scaleRef >= 2 && span >= 4) longLegs++;
      else if (m.scaleRef < 2) longLegs++; // don't require on tiny grids
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
console.log('pupils ranged', pupilRanged, '/', pupilTotal, 'append', withAppend, 'longLegs', longLegs);
console.log('connectedLimbs', connectedLimbs, 'richCoat', richCoat, 'avgDetached', (detachedSum / seeds.length).toFixed(2));
console.log('boxyRate', boxyRate.toFixed(3), 'archetypes', archetypes);
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

const n1 = generateMonsterName('n');
if (n1 !== generateMonsterName('n')) throw new Error('name');

console.log('OK');
