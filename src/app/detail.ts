import { Container } from 'pixi.js';
import { generateMonster } from '../core/monster';
import type { MonsterData } from '../core/types';
import { MonsterView } from '../render/MonsterView';

/**
 * Large single-monster detail stage with eye tracking.
 */
export class DetailView extends Container {
  private view: MonsterView | null = null;
  private currentSeed = '';

  show(seed: string, data?: MonsterData): MonsterData {
    this.clear();
    const monster = data ?? generateMonster(seed);
    this.currentSeed = seed;
    const view = new MonsterView({ data: monster, scale: 110, galleryYaw: 0, galleryPitch: 0, allowRotate: true });
    this.view = view;
    view.on('pointermove', (e) => {
      const g = e.global;
      view.lookAt(g.x, g.y);
    });
    view.on('pointerout', () => view.lookAt(null));
    this.addChild(view);
    return monster;
  }

  get seed(): string {
    return this.currentSeed;
  }

  get monster(): MonsterView | null {
    return this.view;
  }

  clear(): void {
    if (this.view) {
      this.view.destroy();
      this.view = null;
    }
    this.removeChildren();
  }

  tick(dt: number): void {
    this.view?.tick(dt);
  }

  layout(width: number, height: number): void {
    if (!this.view) return;
    this.view.x = width * 0.5;
    this.view.y = height * 0.52;
    const scale = Math.min(width, height) * 0.28;
    this.view.setDisplayScale(scale);
  }
}
