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
  sortZ: number;
}

export interface MonsterViewOptions {
  data: MonsterData;
  /** Pixel scale factor (home units → px). */
  scale?: number;
  /** Fixed yaw for gallery thumbnails (~23°). */
  galleryYaw?: number;
  /** Fixed pitch for gallery thumbnails (~9°). */
  galleryPitch?: number;
  /** Enable drag-to-rotate in detail view. */
  allowRotate?: boolean;
}

const PERSPECTIVE_K = 0.38;
const DEFAULT_GALLERY_YAW = 0.4;
const DEFAULT_GALLERY_PITCH = 0.15;

/**
 * 3D bulalashka particle cloud with Y-axis rotation and perspective projection.
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

  private baseYaw: number;
  private basePitch: number;
  private dragYaw = 0;
  private dragPitch = 0;
  private idleWobbleYaw = 0;
  private idleWobblePitch = 0;
  private readonly allowRotate: boolean;

  // Personality-driven animation state
  private nextGlanceAt: number;
  private glanceT = 0;
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

  private dragActive = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartYaw = 0;
  private dragStartPitch = 0;

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
    this.baseYaw = options.galleryYaw ?? DEFAULT_GALLERY_YAW;
    this.basePitch = options.galleryPitch ?? DEFAULT_GALLERY_PITCH;
    this.allowRotate = options.allowRotate ?? false;
    this.eventMode = 'static';
    this.cursor = this.allowRotate ? 'grab' : 'pointer';

    const tex = getParticleTexture();
    for (const p of options.data.particles) {
      const size = this.cellPx * p.size;
      const sp = new Particle({
        texture: tex,
        x: 0,
        y: 0,
        anchorX: 0.5,
        anchorY: 0.5,
        scaleX: size / 16,
        scaleY: size / 16,
        tint: p.color,
        alpha: p.part === 'fleck' ? 0.85 : p.part === 'aura' ? 0.55 : 1,
      });
      this.addParticle(sp);
      this.live.push({ home: p, sprite: sp, part: p.part, sortZ: p.z });
    }

    const anim = options.data.anim;
    const seedJitter = (options.data.particles.length % 97) * 0.037;
    this.nextBlinkAt = anim.blinkInterval * (0.6 + seedJitter);
    this.nextBounceCheck = 1.5 + seedJitter * 3;
    this.nextGlanceAt = 2 + seedJitter * 4 + (1 - anim.curiosity) * 3;
    this.nextSaccadeAt = 0.8 + seedJitter;
    this.nextShiverAt = 4 + seedJitter * 6;
    this.nextEyeRollAt = 8 + seedJitter * 10;

    if (this.allowRotate) {
      this.on('pointerdown', (e) => {
        this.dragActive = true;
        this.dragStartX = e.global.x;
        this.dragStartY = e.global.y;
        this.dragStartYaw = this.dragYaw;
        this.dragStartPitch = this.dragPitch;
        this.cursor = 'grabbing';
      });
      this.on('pointerup', () => {
        this.dragActive = false;
        this.cursor = 'grab';
      });
      this.on('pointerupoutside', () => {
        this.dragActive = false;
        this.cursor = 'grab';
      });
      this.on('pointermove', (e) => {
        if (!this.dragActive) return;
        const dx = e.global.x - this.dragStartX;
        const dy = e.global.y - this.dragStartY;
        this.dragYaw = this.dragStartYaw + dx * 0.008;
        this.dragPitch = this.dragStartPitch + dy * 0.006;
      });
    }

    this.refreshBounds();
    this.updateHitArea();
  }

  /** Current yaw in radians (base + drag + idle wobble). */
  get yaw(): number {
    return this.baseYaw + this.dragYaw + this.idleWobbleYaw;
  }

  /** Current pitch in radians. */
  get pitch(): number {
    return this.basePitch + this.dragPitch + this.idleWobblePitch;
  }

  setYaw(radians: number): void {
    this.dragYaw = radians - this.baseYaw - this.idleWobbleYaw;
  }

  setPitch(radians: number): void {
    this.dragPitch = radians - this.basePitch - this.idleWobblePitch;
  }

  addYawDelta(delta: number): void {
    this.dragYaw += delta;
  }

  addPitchDelta(delta: number): void {
    this.dragPitch += delta;
  }

  private rotatePoint(
    x: number,
    y: number,
    z: number,
    yaw: number,
    pitch: number,
  ): { x: number; y: number; z: number } {
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    let rx = x * cosY + z * sinY;
    let rz = -x * sinY + z * cosY;
    let ry = y;

    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);
    const ry2 = ry * cosP - rz * sinP;
    rz = ry * sinP + rz * cosP;
    ry = ry2;

    return { x: rx, y: ry, z: rz };
  }

  private project(
    x: number,
    y: number,
    z: number,
    yaw: number,
    pitch: number,
  ): { px: number; py: number; rz: number; depth: number } {
    const r = this.rotatePoint(x, y, z, yaw, pitch);
    const depth = Math.max(0.55, 1 + r.z * PERSPECTIVE_K);
    return {
      px: r.x * depth,
      py: -r.y * depth,
      rz: r.z,
      depth,
    };
  }

  private updateHitArea(): void {
    const b = this.data.bounds;
    const s = this.displayScale;
    const pad = s * 0.35;
    this.hitArea = {
      contains: (x: number, y: number) =>
        x >= b.minX * s - pad &&
        x <= b.maxX * s + pad &&
        y >= b.minY * s - pad &&
        y <= b.maxY * s + pad,
    };
  }

  private refreshBounds(): void {
    const b = this.data.bounds;
    const s = this.displayScale;
    const pad = s * 0.35;
    const x = b.minX * s - pad;
    const y = b.minY * s - pad;
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

    this.idleWobbleYaw = Math.sin(t * anim.swayFreq * 0.7) * 0.1;
    this.idleWobblePitch = Math.cos(t * anim.swayFreq * 0.55 + 0.4) * 0.05;
    const yaw = this.yaw;
    const pitch = this.pitch;

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

    const lerpSpeed = (6 + curiosity * 8) * dt;
    this.pupilOx += (this.pupilTx - this.pupilOx) * Math.min(1, lerpSpeed);
    this.pupilOy += (this.pupilTy - this.pupilOy) * Math.min(1, lerpSpeed);

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

    const breath = Math.sin(t * anim.breathFreq) * anim.breathAmp;
    const swayBase = Math.sin(t * anim.swayFreq) * anim.swayAmp;

    const bounceSquash = this.bounceActive > 0.01 ? Math.min(0.08, this.bounceActive * 0.35) : 0;
    this.containerScaleX = turnScaleX * (1 + bounceSquash);
    this.containerScaleY = 1 - bounceSquash * 0.9;
    this.scale.set(this.containerScaleX, this.containerScaleY);
    this.rotation = this.glanceDir * g * (0.04 + curiosity * 0.02);

    for (const lp of this.live) {
      const { home, sprite, part } = lp;
      let x = home.x;
      let y = home.y;
      let z = home.z;

      x *= 1 + breath * 0.45;
      y *= 1 - breath;

      const heightFactor = Math.min(1.2, Math.max(0, (home.y + 1) * 0.5));
      const depthFactor = 0.55 + home.z * 0.85;
      const appendBoost =
        part === 'fleck' || part === 'butt_highlight' || part === 'tail'
          ? 2
          : part === 'aura'
            ? 1.4
            : 1;
      const sway =
        (swayBase + Math.sin(t * anim.swayFreq + home.row * 0.15) * anim.swayAmp * 0.25) *
        heightFactor *
        depthFactor *
        appendBoost;
      x += sway;

      const canJig =
        (home.isRim && part !== 'body' && part !== 'butt') ||
        part === 'fleck' ||
        part === 'aura' ||
        part === 'butt_highlight' ||
        part === 'tail' ||
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
          const lim = cell * 0.55;
          ox = Math.max(-lim, Math.min(lim, ox));
          oy = Math.max(-lim * 0.7, Math.min(lim * 0.7, oy));
        }
        x += ox;
        y += oy;
      }

      const proj = this.project(x, y, z, yaw, pitch);
      lp.sortZ = proj.rz;

      sprite.x = proj.px * scale;
      sprite.y = proj.py * scale;

      let sizeMul = home.size * proj.depth;
      let scaleYMul = 1;
      if ((part === 'eye' || part === 'pupil' || part === 'outline') && blink > 0) {
        scaleYMul = Math.max(0.12, 1 - blink);
      }

      // Backface cull via rotated surface normal vs view direction (+Z)
      const rn = this.rotatePoint(home.nx, home.ny, home.nz, yaw, pitch);
      const vis = rn.z;
      let alpha = 1;
      if (part === 'fleck') alpha = 0.85;
      else if (part === 'aura') alpha = 0.55;
      if (home.glow) {
        const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 3.4 + home.phase));
        alpha = pulse;
        sizeMul *= 0.9 + 0.22 * pulse;
      }
      if (vis < -0.1) {
        alpha = 0;
      } else {
        alpha *= Math.max(0.35, Math.min(1, 0.4 + vis * 0.6));
      }

      sprite.alpha = alpha;

      const px = Math.max(2, this.cellPx * sizeMul);
      sprite.scaleX = px / 16;
      sprite.scaleY = (px / 16) * scaleYMul;
    }

    // Back-to-front draw order by projected depth
    this.live.sort((a, b) => a.sortZ - b.sortZ);
    for (let i = 0; i < this.live.length; i++) {
      const sp = this.live[i]!.sprite;
      const idx = this.particleChildren.indexOf(sp);
      if (idx >= 0 && idx !== i) {
        this.removeParticle(sp);
        this.addParticle(sp);
      }
    }

    this.update();
  }

  destroy(options?: boolean | { children?: boolean; texture?: boolean }): void {
    this.removeParticles(0, this.particleChildren.length);
    super.destroy(options);
  }
}
