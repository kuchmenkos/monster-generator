import { bboxFill, countDetachedAppendages, uniqueBodyColors } from '../src/core/score';
import { generateMonster } from '../src/core/monster';
import { generateMonsterName } from '../src/core/names';
import type { Particle } from '../src/core/types';

const seeds = Array.from({ length: 300 }, (_, i) => `v3-${i}-${(i * 19) % 101}`);

function frontBodyFill(particles: Particle[]): number {
  const front = particles.filter((p) => p.part === 'body' && p.facing === 'front');
  if (front.length === 0) return 0;
  const minC = Math.min(...front.map((p) => p.col));
  const maxC = Math.max(...front.map((p) => p.col));
  const minR = Math.min(...front.map((p) => p.row));
  const maxR = Math.max(...front.map((p) => p.row));
  const area = Math.max(1, (maxC - minC + 1) * (maxR - minR + 1));
  const unique = new Set(front.map((p) => `${p.col},${p.row}`));
  return unique.size / area;
}

function sideRatio(particles: Particle[]): number {
  const shell = particles.filter(
    (p) =>
      (p.part === 'body' || p.part === 'butt') &&
      (p.facing === 'front' || p.facing === 'back' || p.facing === 'side'),
  );
  if (shell.length === 0) return 0;
  const side = shell.filter((p) => p.facing === 'side').length;
  return side / shell.length;
}

let withMouth = 0;
let withCavity = 0;
let mouthWidthOk = 0;
let withButt = 0;
let withBack = 0;
let withFront = 0;
let noAppendages = 0;
let pupilRanged = 0;
let pupilTotal = 0;
let volEyeCountSum = 0;
let volSocketDepthSum = 0;
let volSilClipSum = 0;
let volEyeMonsters = 0;
let meshMouthSum = 0;
let meshButtProtrusionSum = 0;
let meshColorStepsSum = 0;
let fillSum = 0;
let frontFillSum = 0;
let genMsSum = 0;
let richCoat = 0;
let minParticles = Infinity;
let maxParticles = 0;
let minBodyFront = Infinity;
let minSideFacing = Infinity;
let sideRatioSum = 0;
let ringStackSum = 0;
const archetypes: Record<string, number> = {};
const buttTypes: Record<string, number> = {};

for (const seed of seeds) {
  const t0 = performance.now();
  const m = generateMonster(seed);
  genMsSum += performance.now() - t0;

  archetypes[m.archetype] = (archetypes[m.archetype] || 0) + 1;
  buttTypes[m.buttArchetype] = (buttTypes[m.buttArchetype] || 0) + 1;
  fillSum += bboxFill(m.particles);
  frontFillSum += frontBodyFill(m.particles);
  sideRatioSum += sideRatio(m.particles);

  const body = m.particles.filter((p) => p.part === 'body');
  const frontBody = m.particles.filter((p) => p.part === 'body' && p.facing === 'front');
  const sideBody = m.particles.filter((p) => p.part === 'body' && p.facing === 'side');
  const mouths = m.particles.filter((p) => p.part === 'mouth' || p.part === 'tooth');
  const pupils = m.particles.filter((p) => p.part === 'pupil');
  const append = m.particles.filter((p) => p.part === 'appendage');
  const butt = m.particles.filter((p) => p.part === 'butt' || p.part === 'butt_highlight');

  minParticles = Math.min(minParticles, m.particles.length);
  maxParticles = Math.max(maxParticles, m.particles.length);
  minBodyFront = Math.min(minBodyFront, frontBody.length);
  minSideFacing = Math.min(minSideFacing, sideBody.length);
  const stackMap = new Map<string, number>();
  for (const p of m.particles.filter((x) => x.part === 'body' || x.part === 'butt')) {
    const k = `${p.col},${p.row}`;
    stackMap.set(k, (stackMap.get(k) ?? 0) + 1);
  }
  for (const n of stackMap.values()) {
    if (n > 4) ringStackSum += n - 4;
  }

  if (append.length === 0) noAppendages++;
  if (butt.length >= 4) withButt++;
  if (m.particles.some((p) => p.facing === 'back' || p.nz < -0.3)) withBack++;
  if (m.particles.some((p) => p.facing === 'front' || p.nz > 0.25)) withFront++;
  if (uniqueBodyColors(m.particles) >= 3) richCoat++;

  pupilTotal += pupils.length;
  pupilRanged += pupils.filter((p) => p.pupilRange && p.pupilRange.x > 0).length;

  if (m.meshBundle) {
    volEyeMonsters++;
    volEyeCountSum += m.meshBundle.metrics.eyeCount;
    volSocketDepthSum += m.meshBundle.metrics.socketDepth;
    volSilClipSum += m.meshBundle.metrics.silhouetteClip;
    meshMouthSum += m.meshBundle.metrics.mouthCavity ? 1 : 0;
    meshButtProtrusionSum += m.meshBundle.metrics.buttProtrusion;
    meshColorStepsSum += m.meshBundle.metrics.vertexColorSteps;
    if (m.meshBundle.metrics.eyeCount < 1) throw new Error(`no mesh eyes on ${seed}`);
  } else {
    throw new Error(`missing meshBundle on ${seed}`);
  }

  if (m.meshBundle?.mouth) {
    withMouth++;
    if (m.meshBundle.metrics.mouthCavity) withCavity++;
  } else if (mouths.length > 0) {
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
    }
  }

  if (!m.scaleRef || m.scaleRef < 1.0) throw new Error('scaleRef too low');
  if (append.length > 0) throw new Error(`limbs on ${seed}`);
  if (m.particles.length > 4500) throw new Error(`too many particles on ${seed}: ${m.particles.length}`);
  if (sideBody.length < 200) throw new Error(`too few side geometry on ${seed}: ${sideBody.length}`);
  if (sideRatio(m.particles) < 0.15) throw new Error(`sideRatio too low on ${seed}`);
  if (frontBody.length < 120) throw new Error(`too few front body on ${seed}: ${frontBody.length}`);
}

const a = generateMonster('alpha-check');
const b = generateMonster('alpha-check');
const same =
  a.particles.length === b.particles.length &&
  a.archetype === b.archetype &&
  a.buttArchetype === b.buttArchetype &&
  a.particles.every(
    (p, i) =>
      p.x === b.particles[i]!.x &&
      p.y === b.particles[i]!.y &&
      p.part === b.particles[i]!.part &&
      p.facing === b.particles[i]!.facing,
  );

const avgFill = fillSum / seeds.length;
const avgFrontFill = frontFillSum / seeds.length;
const avgSideRatio = sideRatioSum / seeds.length;
const avgMs = genMsSum / seeds.length;
const avgRingStack = ringStackSum / seeds.length;

console.log('n=', seeds.length, 'avgMs=', avgMs.toFixed(1), 'avgFill=', avgFill.toFixed(3));
console.log('avgFrontFill=', avgFrontFill.toFixed(3), 'minBodyFront=', minBodyFront);
console.log('minParticles=', minParticles, 'maxParticles=', maxParticles, 'avgRingStack=', avgRingStack.toFixed(2));
console.log('avgSideRatio=', avgSideRatio.toFixed(3), 'minSideFacing=', minSideFacing);
console.log('mouths', withMouth, 'cavity', withCavity, 'butt', withButt, 'front/back', withFront, withBack);
console.log('noAppendages', noAppendages, 'richCoat', richCoat);
console.log('archetypes', archetypes, 'buttTypes', buttTypes);
console.log('deterministic', same);
console.log(
  'meshBundle',
  'n=',
  volEyeMonsters,
  'avgCount=',
  (volEyeCountSum / Math.max(1, volEyeMonsters)).toFixed(2),
  'avgSocket=',
  (volSocketDepthSum / Math.max(1, volEyeMonsters)).toFixed(4),
  'meshMouthCavity=',
  (meshMouthSum / Math.max(1, volEyeMonsters)).toFixed(2),
  'avgButtProtrusion=',
  (meshButtProtrusionSum / Math.max(1, volEyeMonsters)).toFixed(3),
);

if (!same) throw new Error('determinism failed');
if (noAppendages < seeds.length) throw new Error('appendages present');
if (withButt < seeds.length * 0.85) throw new Error('too few butts');
if (withBack < seeds.length * 0.9) throw new Error('missing back surface');
if (withFront < seeds.length * 0.9) throw new Error('missing front surface');
if (withMouth < seeds.length * 0.8) throw new Error('too few mouths');
if (avgFrontFill < 0.35) throw new Error(`front body fill too low: ${avgFrontFill}`);
if (avgFrontFill > 0.96) throw new Error(`front body too boxy: ${avgFrontFill}`);
if (avgSideRatio < 0.15) throw new Error(`avg sideRatio too low: ${avgSideRatio}`);
if (minSideFacing < 200) throw new Error(`min side facing too low: ${minSideFacing}`);
if (maxParticles > 4500) throw new Error(`max particles too high: ${maxParticles}`);
if (avgMs > 350) throw new Error(`gen too slow: ${avgMs}ms`);
if (richCoat < seeds.length * 0.65) throw new Error('too few coat tones');
if (volEyeMonsters < seeds.length) throw new Error('missing mesh bundle');
if (meshMouthSum < seeds.length * 0.7) throw new Error('too few mesh mouth cavities');

const n1 = generateMonsterName('n');
if (n1 !== generateMonsterName('n')) throw new Error('name');

console.log('OK');
