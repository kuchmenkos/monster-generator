import {
  Particle,
  ParticleContainer,
  Rectangle,
  Texture,
} from 'pixi.js';
import type { MonsterData, Particle as MonsterParticle, ParticlePart } from '../core/types';

/** Solid white square — nearest filtering for crisp pixels. */
let particleTexture: Texture | null = null;

function getParticleTexture(): Texture {
  if (particleTexture) return particleTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 16, 16);
  particleTexture = Texture.from(canvas);
  particleTexture.source.scaleMode = 'nearest';
  particleTexture.source.autoGenerateMipmaps = false;
  return particleTexture;
}

interface LiveParticle {
  home: MonsterParticle;
  sprite: Particle;
  part: ParticlePart;
}

export interface MonsterViewOptions {
  data: MonsterData;
  /** Pixel scale factor (home units → px). */
  scale?: number;
}

/**
 * Solid-grid monster with lively idle: wobble, glances, pupil saccades.
 * Screen Y is inverted vs world Y so legs point down.
 */
export class MonsterView extends ParticleContainer {
  readonly data: MonsterData;
  private readonly live: LiveParticle[] = [];
  private displayScale: number;
  private blinkTimer = 0;
  private blinkActive = 0;
  private bounceActive = 0;
  private bounceVel = 0;
  private nextBlinkAt: number;
  private nextBounceCheck: number;
  private elapsed = 0;
  private cellPx: number;

  // Personality-driven animation state
  private nextGlanceAt: number;
  private glanceT = 0; // 0 idle, 0→1→0 during glance
  private glanceDir = 1;
  private glanceActive = false;
  private pupilOx = 0;
  private pupilOy = 0;
  private pupilTx = 0;
  private pupilTy = 0;
  private lookFollow = false;
  private lookWorldX = 0;
  private lookWorldY = 0;
  private eyeRollT = 0;
  private nextEyeRollAt: number;
  private nextSaccadeAt: number;
  private shiverT = 0;
  private nextShiverAt: number;
  private containerScaleX = 1;
  private containerScaleY = 1;

  constructor(options: MonsterViewOptions) {
    super({
      dynamicProperties: {
        position: true,
        scale: true,
        color: true,
        rotation: false,
        vertex: false,
      },
      roundPixels: false,
    });

    this.data = options.data;
    this.displayScale = options.scale ?? 40;
    this.cellPx = Math.max(2, options.data.cellSize * this.displayScale * 1.18);
    this.eventMode = 'static';
    this.cursor = 'pointer';

    const tex = getParticleTexture();
    const s = this.displayScale;
    for (const p of options.data.particles) {
      const size = this.cellPx * p.size;
      const sp = new Particle({
        texture: tex,
        x: p.x * s,
        y: -p.y * s,
        anchorX: 0.5,
        anchorY: 0.5,
        scaleX: size / 16,
        scaleY: size / 16,
        tint: p.color,
        alpha: p.part === 'fleck' ? 0.85 : p.part === 'aura' ? 0.55 : 1,
      });
      this.addParticle(sp);
      this.live.push({ home: p, sprite: sp, part: p.part });
    }

    const anim = options.data.anim;
    const seedJitter = (options.data.particles.length % 97) * 0.037;
    this.nextBlinkAt = anim.blinkInterval * (0.6 + seedJitter);
    this.nextBounceCheck = 1.5 + seedJitter * 3;
    this.nextGlanceAt = 2 + seedJitter * 4 + (1 - anim.curiosity) * 3;
    this.nextSaccadeAt = 0.8 + seedJitter;
    this.nextShiverAt = 4 + seedJitter * 6;
    this.nextEyeRollAt = 8 + seedJitter * 10;

    this.refreshBounds();
    this.updateHitArea();
  }

  private updateHitArea(): void {
    const b = this.data.bounds;
    const s = this.displayScale;
    const pad = s * 0.25;
    this.hitArea = {
      contains: (x: number, y: number) =>
        x >= b.minX * s - pad &&
        x <= b.maxX * s + pad &&
        y >= -b.maxY * s - pad &&
        y <= -b.minY * s + pad,
    };
  }

  private refreshBounds(): void {
    const b = this.data.bounds;
    const s = this.displayScale;
    const pad = s * 0.35;
    const x = b.minX * s - pad;
    const y = -b.maxY * s - pad;
    const w = (b.maxX - b.minX) * s + pad * 2;
    const h = (b.maxY - b.minY) * s + pad * 2;
    this.boundsArea = new Rectangle(x, y, Math.max(8, w), Math.max(8, h));
  }

  setDisplayScale(scale: number): void {
    this.displayScale = scale;
    this.cellPx = Math.max(2, this.data.cellSize * scale * 1.18);
    this.refreshBounds();
    this.updateHitArea();
  }

  fitInto(boxW: number, boxH: number): void {
    const b = this.data.bounds;
    const w = Math.max(0.01, b.maxX - b.minX);
    const h = Math.max(0.01, b.maxY - b.minY);
    const scale = Math.min(boxW / w, boxH / h) * 0.92;
    this.setDisplayScale(scale);
  }

  /**
   * Point pupils toward a world-space position (detail view pointer).
   * Pass null to resume idle saccades.
   */
  lookAt(worldX: number | null, worldY?: number): void {
    if (worldX === null || worldY === undefined) {
      this.lookFollow = false;
      return;
    }
    this.lookFollow = true;
    this.lookWorldX = worldX;
    this.lookWorldY = worldY;
  }

  tick(dt: number): void {
    this.elapsed += dt;
    const anim = this.data.anim;
    const t = this.elapsed;
    const scale = this.displayScale;
    const { jitteriness, heaviness, curiosity } = anim;
    const cell = this.data.cellSize;

    // Blink
    if (this.blinkActive > 0) {
      this.blinkActive -= dt * 8;
      if (this.blinkActive < 0) this.blinkActive = 0;
    } else {
      this.blinkTimer += dt;
      if (this.blinkTimer >= this.nextBlinkAt) {
        this.blinkActive = 1;
        this.blinkTimer = 0;
        this.nextBlinkAt = anim.blinkInterval * (0.7 + Math.random() * 0.8);
      }
    }
    const blinkAmt = this.blinkActive;
    const blink = blinkAmt > 0.5 ? (1 - blinkAmt) * 2 : blinkAmt * 2;

    // Bounce
    this.nextBounceCheck -= dt;
    if (this.nextBounceCheck <= 0) {
      this.nextBounceCheck = 2 + Math.random() * 4 + heaviness * 2;
      if (Math.random() < anim.bounceChance * (1 - heaviness * 0.4)) {
        this.bounceVel = 0.35 + Math.random() * 0.25;
      }
    }
    if (this.bounceVel !== 0 || this.bounceActive !== 0) {
      this.bounceVel -= (1.8 + heaviness) * dt;
      this.bounceActive += this.bounceVel * dt * 60 * 0.02;
      if (this.bounceActive < 0) {
        this.bounceActive = 0;
        this.bounceVel = 0;
      }
    }

    // Mini-turn glance
    if (!this.glanceActive) {
      this.nextGlanceAt -= dt;
      if (this.nextGlanceAt <= 0 && Math.random() < 0.35 + curiosity * 0.5) {
        this.glanceActive = true;
        this.glanceT = 0;
        this.glanceDir = Math.random() < 0.5 ? -1 : 1;
      } else if (this.nextGlanceAt <= 0) {
        this.nextGlanceAt = 3 + Math.random() * 5 + (1 - curiosity) * 3;
      }
    } else {
      this.glanceT += dt / (0.55 + heaviness * 0.35);
      if (this.glanceT >= 1) {
        this.glanceActive = false;
        this.glanceT = 0;
        this.nextGlanceAt = 3 + Math.random() * 5 + (1 - curiosity) * 3;
      }
    }
    const g =
      this.glanceActive
        ? this.glanceT < 0.5
          ? this.glanceT * 2
          : (1 - this.glanceT) * 2
        : 0;
    const turnScaleX = 1 - g * 0.14;
    const turnRot = this.glanceDir * g * (0.08 + curiosity * 0.04);

    // Eye-roll burst (rare)
    if (this.eyeRollT > 0) {
      this.eyeRollT -= dt;
      const ang = (1 - this.eyeRollT / 0.7) * Math.PI * 2;
      const r = (0.4 + curiosity * 0.25) * cell;
      this.pupilTx = Math.cos(ang) * r;
      this.pupilTy = Math.sin(ang) * r * 0.65;
    } else {
      this.nextEyeRollAt -= dt;
      if (this.nextEyeRollAt <= 0) {
        if (Math.random() < 0.12 + curiosity * 0.15) this.eyeRollT = 0.7;
        this.nextEyeRollAt = 10 + Math.random() * 14;
      }

      if (this.lookFollow) {
        // Local offset from monster center toward pointer
        const lx = (this.lookWorldX - this.x) / scale;
        const ly = -(this.lookWorldY - this.y) / scale;
        const amp = (0.45 + curiosity * 0.35) * cell;
        const len = Math.hypot(lx, ly) || 1;
        this.pupilTx = (lx / len) * Math.min(amp, len * 0.15);
        this.pupilTy = (ly / len) * Math.min(amp * 0.7, len * 0.12);
      } else {
        this.nextSaccadeAt -= dt;
        if (this.nextSaccadeAt <= 0) {
          const amp = 0.35 + curiosity * 0.35;
          this.pupilTx = (Math.random() * 2 - 1) * amp * cell;
          this.pupilTy = (Math.random() * 2 - 1) * amp * 0.6 * cell;
          this.nextSaccadeAt = 1 + Math.random() * 2.2 + (1 - curiosity);
        }
      }
    }

    // Smooth lerp pupils toward target
    const lerpSpeed = (6 + curiosity * 8) * dt;
    this.pupilOx += (this.pupilTx - this.pupilOx) * Math.min(1, lerpSpeed);
    this.pupilOy += (this.pupilTy - this.pupilOy) * Math.min(1, lerpSpeed);

    // Shiver burst
    if (this.shiverT > 0) {
      this.shiverT -= dt;
    } else {
      this.nextShiverAt -= dt;
      if (this.nextShiverAt <= 0) {
        if (Math.random() < 0.15 + jitteriness * 0.35) {
          this.shiverT = 0.25 + jitteriness * 0.15;
        }
        this.nextShiverAt = 5 + Math.random() * 8;
      }
    }
    const shiver = this.shiverT > 0 ? 0.012 + jitteriness * 0.02 : 0;

    // Continuous wobble rotation
    const wobbleAmp = (0.025 + (1 - heaviness) * 0.035) * (0.7 + jitteriness * 0.5);
    const wobble = Math.sin(t * anim.swayFreq * 0.85) * wobbleAmp;
    this.rotation = wobble + turnRot;

    const breath = Math.sin(t * anim.breathFreq) * anim.breathAmp;
    const swayBase = Math.sin(t * anim.swayFreq) * anim.swayAmp;

    const bounceSquash = this.bounceActive > 0.01 ? Math.min(0.08, this.bounceActive * 0.35) : 0;
    this.containerScaleX = turnScaleX * (1 + bounceSquash);
    this.containerScaleY = 1 - bounceSquash * 0.9;
    this.scale.set(this.containerScaleX, this.containerScaleY);

    for (const { home, sprite, part } of this.live) {
      let x = home.x;
      let y = home.y;

      x *= 1 + breath * 0.45;
      y *= 1 - breath;

      const heightFactor = Math.min(1.2, Math.max(0, (home.y + 1) * 0.5));
      const depthFactor = 0.55 + home.z * 0.85;
      const appendBoost =
        part === 'appendage'
          ? 1 + home.tipFactor * 1.6
          : part === 'hair'
            ? 2.8
            : part === 'fleck'
              ? 2.4
              : part === 'lash'
                ? 1.6
                : part === 'ear'
                  ? 1.3 + home.tipFactor
                  : part === 'aura'
                    ? 1.4
                    : 1;
      const strandPhase = (home.hairStrand ?? 0) * 0.4;
      const sway =
        (swayBase +
          Math.sin(t * anim.swayFreq + home.row * 0.15 + strandPhase) * anim.swayAmp * 0.25) *
        heightFactor *
        depthFactor *
        appendBoost;
      x += sway;

      // Hair wave — extra lateral motion along strand
      if (part === 'hair') {
        const wave =
          Math.sin(t * (anim.swayFreq * 1.35) + strandPhase + home.tipFactor * 2.2) *
          anim.jiggleAmp *
          (0.8 + home.tipFactor * 2.2);
        x += wave;
        y += Math.cos(t * 2.1 + home.phase) * anim.jiggleAmp * home.tipFactor * 0.6;
      }

      // Coherent body: only rim / limbs / flecks / hair jiggle independently
      const canJig =
        (home.isRim && part !== 'body') ||
        (part === 'appendage' && home.tipFactor > 0.28) ||
        part === 'fleck' ||
        part === 'hair' ||
        part === 'lash' ||
        part === 'ear' ||
        part === 'aura' ||
        home.tipFactor > 0.28;
      if (canJig) {
        const jig = anim.jiggleAmp * (0.4 + home.tipFactor * 1.2) * (1 + jitteriness);
        x += Math.sin(t * 3.1 + home.phase) * jig * appendBoost;
        y += Math.cos(t * 2.7 + home.phase * 1.3) * jig * 0.7;
      }

      if (shiver > 0 && canJig) {
        x += Math.sin(t * 48 + home.phase * 7) * shiver;
        y += Math.cos(t * 52 + home.phase * 5) * shiver * 0.7;
      }

      y += this.bounceActive * (1 - Math.abs(home.x) * 0.3);

      if (part === 'pupil') {
        let ox = this.pupilOx;
        let oy = this.pupilOy;
        const pr = home.pupilRange;
        if (pr) {
          ox = Math.max(-pr.x, Math.min(pr.x, ox));
          oy = Math.max(-pr.y, Math.min(pr.y, oy));
        } else {
          // Fallback: clamp to ~0.6 cell
          const lim = cell * 0.55;
          ox = Math.max(-lim, Math.min(lim, ox));
          oy = Math.max(-lim * 0.7, Math.min(lim * 0.7, oy));
        }
        x += ox;
        y += oy;
      }

      sprite.x = x * scale;
      sprite.y = -y * scale - home.z * scale * 0.03;

      let sizeMul = home.size;
      let scaleYMul = 1;
      const blinkParts =
        part === 'eye' ||
        part === 'pupil' ||
        part === 'outline' ||
        part === 'eyelid' ||
        (part === 'lash' && home.lidRole !== 'lower');
      if (blinkParts && blink > 0) {
        if (part === 'eyelid' && home.lidRole === 'lower') {
          scaleYMul = 1 + blink * 0.15;
        } else {
          scaleYMul = Math.max(0.12, 1 - blink);
        }
      }
      // Brow micro-bounce on blink
      if (part === 'brow' && blink > 0) {
        y -= blink * 0.012;
      }
      // Lash flutter
      if (part === 'lash' && blink > 0.05) {
        x += Math.sin(t * 40 + home.phase) * blink * 0.008;
      }

      let alpha = 1;
      if (part === 'fleck') alpha = 0.85;
      else if (part === 'hair') alpha = 0.92;
      else if (part === 'aura') alpha = 0.55;
      else if (part === 'lash') alpha = 0.9;
      if (home.glow) {
        const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 3.4 + home.phase));
        alpha = pulse;
        sizeMul *= 0.9 + 0.22 * pulse;
      }
      sprite.alpha = alpha;

      const px = Math.max(2, this.cellPx * sizeMul);
      sprite.scaleX = px / 16;
      sprite.scaleY = (px / 16) * scaleYMul;
    }

    this.update();
  }

  destroy(options?: boolean | { children?: boolean; texture?: boolean }): void {
    this.removeParticles(0, this.particleChildren.length);
    super.destroy(options);
  }
}
