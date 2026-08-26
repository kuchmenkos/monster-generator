import { bboxFill, countDetachedAppendages, uniqueBodyColors } from '../src/core/score';
import { generateMonster } from '../src/core/monster';
import { generateMonsterName } from '../src/core/names';

const seeds = Array.from({ length: 300 }, (_, i) => `v3-${i}-${(i * 19) % 101}`);

let withMouth = 0;
let withCavity = 0;
let mouthWidthOk = 0;
let withButt = 0;
let withBack = 0;
let withFront = 0;
let noAppendages = 0;
let pupilRanged = 0;
let pupilTotal = 0;
let fillSum = 0;
let genMsSum = 0;
let richCoat = 0;
let minParticles = Infinity;
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

  const body = m.particles.filter((p) => p.part === 'body');
  const mouths = m.particles.filter((p) => p.part === 'mouth' || p.part === 'tooth');
  const pupils = m.particles.filter((p) => p.part === 'pupil');
  const append = m.particles.filter((p) => p.part === 'appendage');
  const butt = m.particles.filter((p) => p.part === 'butt' || p.part === 'butt_highlight');

  minParticles = Math.min(minParticles, m.particles.length);
  const stackMap = new Map<string, number>();
  for (const p of m.particles.filter((x) => x.part === 'body' || x.part === 'butt')) {
    const k = `${p.col},${p.row}`;
    stackMap.set(k, (stackMap.get(k) ?? 0) + 1);
  }
  for (const n of stackMap.values()) {
    if (n > 2) ringStackSum += n - 2;
  }

  if (append.length === 0) noAppendages++;
  if (butt.length >= 4) withButt++;
  if (m.particles.some((p) => p.facing === 'back' || p.nz < -0.3)) withBack++;
  if (m.particles.some((p) => p.facing === 'front' || p.nz > 0.25)) withFront++;
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
    }
  }

  if (!m.scaleRef || m.scaleRef < 2) throw new Error('scaleRef too low');
  if (append.length > 0) throw new Error(`limbs on ${seed}`);
  if (m.particles.length < 500) throw new Error(`too few particles on ${seed}: ${m.particles.length}`);
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
const avgMs = genMsSum / seeds.length;
const avgRingStack = ringStackSum / seeds.length;

console.log('n=', seeds.length, 'avgMs=', avgMs.toFixed(1), 'avgFill=', avgFill.toFixed(3));
console.log('minParticles=', minParticles, 'avgRingStack=', avgRingStack.toFixed(2));
console.log('mouths', withMouth, 'cavity', withCavity, 'butt', withButt, 'front/back', withFront, withBack);
console.log('noAppendages', noAppendages, 'richCoat', richCoat);
console.log('archetypes', archetypes, 'buttTypes', buttTypes);
console.log('deterministic', same);

if (!same) throw new Error('determinism failed');
if (noAppendages < seeds.length) throw new Error('appendages present');
if (withButt < seeds.length * 0.85) throw new Error('too few butts');
if (withBack < seeds.length * 0.9) throw new Error('missing back surface');
if (withFront < seeds.length * 0.9) throw new Error('missing front surface');
if (withMouth < seeds.length * 0.8) throw new Error('too few mouths');
if (avgFill > 0.88) throw new Error('avg bbox fill too high (boxy)');
if (avgRingStack > 80) throw new Error(`ring stacking too high: ${avgRingStack}`);
if (pupilRanged < pupilTotal * 0.55) throw new Error('pupils missing pupilRange');
if (avgMs > 500) throw new Error(`gen too slow: ${avgMs}ms`);
if (richCoat < seeds.length * 0.65) throw new Error('too few coat tones');

const n1 = generateMonsterName('n');
if (n1 !== generateMonsterName('n')) throw new Error('name');

console.log('OK');
