import { Container } from 'pixi.js';
import { generateMonster } from '../core/monster';
import { randomSeed } from '../core/rng';
import type { MonsterData } from '../core/types';
import { MonsterView } from '../render/MonsterView';

export interface GalleryOptions {
  cols: number;
  /** Initial row count hint (actual rows grow with seed count). */
  rows: number;
  cellSize: number;
  padding: number;
  seeds?: string[];
  onSelect?: (seed: string, data: MonsterData) => void;
}

/**
 * Dense grid of animated monsters.
 * Append-friendly: +N keeps existing views; fit-to-box avoids overlaps.
 */
export class Gallery extends Container {
  readonly views: MonsterView[] = [];
  private seeds: string[] = [];
  onSelect: ((seed: string, data: MonsterData) => void) | null = null;
  private cols: number;
  private cellSize: number;
  private padding: number;
  private viewTop = 0;
  private viewHeight = 800;
  private frame = 0;

  constructor(options: GalleryOptions) {
    super();
    this.cols = options.cols;
    this.cellSize = options.cellSize;
    this.padding = options.padding;
    this.onSelect = options.onSelect ?? null;
    this.eventMode = 'static';

    const seeds = options.seeds ?? [];

    this.rebuild(seeds.length ? seeds : []);
  }

  get rows(): number {
    return Math.max(1, Math.ceil(this.seeds.length / this.cols));
  }

  get contentHeight(): number {
    return this.rows * this.cellSize + this.padding * 2;
  }

  get contentWidth(): number {
    return this.cols * this.cellSize + this.padding * 2;
  }

  private placeView(view: MonsterView, index: number): void {
    const box = this.cellSize * 0.86;
    view.fitInto(box, box);
    const col = index % this.cols;
    const row = Math.floor(index / this.cols);
    view.x = this.padding + col * this.cellSize + this.cellSize * 0.5;
    view.y = this.padding + row * this.cellSize + this.cellSize * 0.5;
  }

  private createView(seed: string, index: number): MonsterView {
    const data = generateMonster(seed);
    const view = new MonsterView({
      data,
      scale: this.cellSize * 0.4,
      galleryYaw: 0.28,
      galleryPitch: 0.08,
      thumbnail: true,
    });
    this.placeView(view, index);
    view.on('pointertap', () => {
      this.onSelect?.(seed, data);
    });
    this.addChild(view);
    this.views.push(view);
    return view;
  }

  rebuild(seeds: string[]): void {
    for (const v of this.views) {
      v.destroy();
    }
    this.views.length = 0;
    this.removeChildren();
    this.seeds = [...seeds];

    for (let i = 0; i < this.seeds.length; i++) {
      this.createView(this.seeds[i]!, i);
    }
  }

  /** Append N new monsters without rebuilding existing ones. */
  append(count = 1): void {
    const start = this.seeds.length;
    for (let i = 0; i < count; i++) {
      const seed = randomSeed(8);
      this.seeds.push(seed);
      this.createView(seed, start + i);
    }
    this.updateCulling();
  }

  get seedList(): string[] {
    return [...this.seeds];
  }

  getSeedAt(index: number): string | null {
    return this.seeds[index] ?? null;
  }

  indexOfSeed(seed: string): number {
    return this.seeds.indexOf(seed);
  }

  setViewport(scrollY: number, viewHeight: number): void {
    this.viewTop = scrollY;
    this.viewHeight = viewHeight;
    this.updateCulling();
  }

  private updateCulling(): void {
    const top = this.viewTop - this.cellSize;
    const bottom = this.viewTop + this.viewHeight + this.cellSize;
    for (const v of this.views) {
      const gy = this.y + v.y;
      v.renderable = gy > top && gy < bottom;
      v.visible = v.renderable;
    }
  }

  tick(dt: number): void {
    let i = 0;
    for (const v of this.views) {
      if (!v.renderable) {
        i++;
        continue;
      }
      // Stagger: each visible view updates every 3rd frame (phase by index)
      if (((this.frame + i) % 3) === 0) v.tick(dt * 3);
      i++;
    }
    this.frame++;
  }
}
