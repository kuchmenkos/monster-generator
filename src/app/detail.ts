import { Container } from 'pixi.js';
import { generateMonster } from '../core/monster';
import type { MonsterData } from '../core/types';
import { BulalashkaMeshView } from '../render/BulalashkaMeshView';
import { MonsterView } from '../render/MonsterView';

type DetailLayer = MonsterView | BulalashkaMeshView;

/**
 * Large single-monster detail stage — particle body + volumetric mesh eyes.
 */
export class DetailView extends Container {
  private bodyView: MonsterView | null = null;
  private eyeView: BulalashkaMeshView | null = null;
  private currentSeed = '';

  show(seed: string, data?: MonsterData): MonsterData {
    this.clear();
    const monster = data ?? generateMonster(seed);
    this.currentSeed = seed;

    const bodyView = new MonsterView({
      data: monster,
      scale: 110,
      galleryYaw: 0,
      galleryPitch: 0,
      allowRotate: true,
    });
    this.bodyView = bodyView;
    this.addChild(bodyView);

    if (monster.volumetricEyes && monster.blobs) {
      const eyeView = new BulalashkaMeshView({
        data: monster,
        blobs: monster.blobs,
        mouthFloorY: monster.volumetricEyes.mouthFloorY,
        allowRotate: true,
        size: 512,
      });
      this.eyeView = eyeView;
      this.addChild(eyeView);

      const syncLook = (x: number | null, y?: number | null) => {
        bodyView.lookAt(x, y ?? undefined);
        eyeView.lookAt(x, y ?? undefined);
      };
      bodyView.on('pointermove', (e) => syncLook(e.global.x, e.global.y));
      bodyView.on('pointerout', () => syncLook(null));
      eyeView.on('pointermove', (e) => syncLook(e.global.x, e.global.y));
      eyeView.on('pointerout', () => syncLook(null));
    } else {
      bodyView.on('pointermove', (e) => bodyView.lookAt(e.global.x, e.global.y));
      bodyView.on('pointerout', () => bodyView.lookAt(null));
    }

    return monster;
  }

  get seed(): string {
    return this.currentSeed;
  }

  get monster(): DetailLayer | null {
    return this.eyeView ?? this.bodyView;
  }

  clear(): void {
    if (this.bodyView) {
      this.bodyView.destroy();
      this.bodyView = null;
    }
    if (this.eyeView) {
      this.eyeView.destroy();
      this.eyeView = null;
    }
    this.removeChildren();
  }

  tick(dt: number): void {
    this.bodyView?.tick(dt);
    this.eyeView?.tick(dt);
  }

  layout(width: number, height: number): void {
    const scale = Math.min(width, height) * 0.28;
    const cx = width * 0.5;
    const cy = height * 0.52;
    if (this.bodyView) {
      this.bodyView.x = cx;
      this.bodyView.y = cy;
      this.bodyView.setDisplayScale(scale);
    }
    if (this.eyeView) {
      this.eyeView.x = cx;
      this.eyeView.y = cy;
      this.eyeView.setDisplayScale(scale);
    }
  }
}
