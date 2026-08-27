/**
 * boolala.boo — face layer integrity defect suite.
 */
import { auditIntegrity, sumDefects } from '../src/core/face/integrity';
import { generateMonster } from '../src/core/monster';

const N = 60;
const seeds = Array.from({ length: N }, (_, i) => `layer-int-${i}-${(i * 17) % 89}`);

const totals = {
  lidOffEye: 0,
  floatingBrow: 0,
  lashInEye: 0,
  hairOverEye: 0,
  mustacheOnMouth: 0,
  eyeLattice: 0,
  orphanLashEar: 0,
};

for (const seed of seeds) {
  const m = generateMonster(seed);
  const r = auditIntegrity(m.particles);
  totals.lidOffEye += r.lidOffEye;
  totals.floatingBrow += r.floatingBrow;
  totals.lashInEye += r.lashInEye;
  totals.hairOverEye += r.hairOverEye;
  totals.mustacheOnMouth += r.mustacheOnMouth;
  totals.eyeLattice += r.eyeLattice;
  totals.orphanLashEar += r.orphanLashEar;
}

const total = sumDefects(totals);
console.log(JSON.stringify({ n: N, ...totals, total }, null, 2));

if (totals.lidOffEye > 0) throw new Error(`defect: lidOffEye=${totals.lidOffEye}`);
if (totals.floatingBrow > 0) throw new Error(`defect: floatingBrow=${totals.floatingBrow}`);
if (totals.lashInEye > 0) throw new Error(`defect: lashInEye=${totals.lashInEye}`);
if (totals.hairOverEye > 0) throw new Error(`defect: hairOverEye=${totals.hairOverEye}`);
if (totals.mustacheOnMouth > 0) throw new Error(`defect: mustacheOnMouth=${totals.mustacheOnMouth}`);
if (totals.eyeLattice > 0) throw new Error(`defect: eyeLattice=${totals.eyeLattice}`);
if (totals.orphanLashEar > 0) throw new Error(`defect: orphanLashEar=${totals.orphanLashEar}`);

console.log('layer-integrity OK');
