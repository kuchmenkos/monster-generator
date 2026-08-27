import { Container } from 'pixi.js';
import { generateMonster } from '../core/monster';
import type { MonsterData } from '../core/types';
import { BulalashkaSceneView } from '../render/BulalashkaSceneView';

/**
 * Detail stage — unified HEADDDS-style mesh scene (body + eyes + mouth + butt).
 */
export class DetailView extends Container {
  private sceneView: BulalashkaSceneView | null = null;
  private currentSeed = '';

  show(seed: string, data?: MonsterData): MonsterData {
    this.clear();
    const monster = data ?? generateMonster(seed);
    this.currentSeed = seed;

    if (!monster.meshBundle || !monster.blobs) {
      throw new Error('Monster missing meshBundle — regenerate with v4 pipeline');
    }

    const view = new BulalashkaSceneView({
      data: monster,
      blobs: monster.blobs,
      allowRotate: true,
      size: 512,
      subdivisions: 3,
    });
    this.sceneView = view;
    this.addChild(view);

    return monster;
  }

  get seed(): string {
    return this.currentSeed;
  }

  get monster(): BulalashkaSceneView | null {
    return this.sceneView;
  }

  clear(): void {
    if (this.sceneView) {
      this.sceneView.destroy();
      this.sceneView = null;
    }
    this.removeChildren();
  }

  tick(dt: number): void {
    this.sceneView?.tick(dt);
  }

  layout(width: number, height: number): void {
    if (!this.sceneView) return;
    this.sceneView.x = width * 0.5;
    this.sceneView.y = height * 0.52;
    const scale = Math.min(width, height) * 0.28;
    this.sceneView.setDisplayScale(scale);
  }
}
