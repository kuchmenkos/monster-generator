import { Container } from 'pixi.js';
import { generateMonster } from '../core/monster';
import { generateSpeech } from '../core/names';
import type { MonsterData } from '../core/types';
import { MonsterView } from '../render/MonsterView';

/**
 * Large single-monster detail stage with talk-on-click + eye tracking.
 */
export class DetailView extends Container {
  private view: MonsterView | null = null;
  private currentSeed = '';
  private talkClicks = 0;
  onSpeech: ((text: string) => void) | null = null;
  onSpeechEnd: (() => void) | null = null;

  show(seed: string, data?: MonsterData): MonsterData {
    this.clear();
    const monster = data ?? generateMonster(seed);
    this.currentSeed = seed;
    this.talkClicks = 0;
    const view = new MonsterView({ data: monster, scale: 110 });
    this.view = view;
    view.onTalkStart = (phrase) => this.onSpeech?.(phrase);
    view.onTalkEnd = () => this.onSpeechEnd?.();
    view.on('pointertap', () => {
      const phrase = generateSpeech(seed, this.talkClicks++);
      view.talk(phrase);
    });
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
