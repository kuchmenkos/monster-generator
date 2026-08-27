import { Sprite, Texture } from 'pixi.js';
import {
  AmbientLight,
  DirectionalLight,
  Group,
  Mesh,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { buildBulalashkaScene } from '../core/mesh/buildScene';
import type { Blob, MonsterData } from '../core/types';

/** Unified HEADDDS-style mesh scene: body + eyes + mouth + butt. */
export class BulalashkaSceneView extends Sprite {
  readonly data: MonsterData;
  private readonly threeRenderer: WebGLRenderer;
  private readonly threeScene: Scene;
  private readonly threeCamera: PerspectiveCamera;
  private readonly sceneRoot: Group;
  private readonly eyelids: Mesh[];
  private readonly pupils: Mesh[];
  private readonly canvas: HTMLCanvasElement;
  private readonly pixiTexture: Texture;

  private blinkTimer = 0;
  private blinkActive = 0;
  private nextBlinkAt: number;
  private elapsed = 0;
  private dragYaw = 0;
  private dragPitch = 0;
  private lookX = 0;
  private lookY = 0;
  private readonly allowRotate: boolean;
  private readonly rtSize: number;

  constructor(options: {
    data: MonsterData;
    blobs: Blob[];
    allowRotate?: boolean;
    size?: number;
    subdivisions?: number;
  }) {
    super();
    this.data = options.data;
    this.allowRotate = options.allowRotate ?? true;
    this.rtSize = options.size ?? 512;

    const bundle = options.data.meshBundle ?? options.data.volumetricEyes;
    if (!bundle || !('mouth' in bundle)) {
      throw new Error('BulalashkaSceneView requires meshBundle');
    }
    const meshBundle = options.data.meshBundle!;

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.rtSize;
    this.canvas.height = this.rtSize;

    this.threeRenderer = new WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas: this.canvas,
    });
    this.threeRenderer.setSize(this.rtSize, this.rtSize, false);
    this.threeRenderer.setPixelRatio(1);
    this.threeRenderer.setClearColor(0x050508, 1);

    this.threeScene = new Scene();
    this.threeCamera = new PerspectiveCamera(28, 1, 0.05, 20);
    this.threeCamera.position.set(0, 0.04, 2.35);

    const amb = new AmbientLight(0xffffff, 0.5);
    const key = new DirectionalLight(0xffffff, 1.0);
    key.position.set(0.6, 1.2, 2);
    const fill = new DirectionalLight(0xaaccff, 0.38);
    fill.position.set(-1, 0.2, 1);
    this.threeScene.add(amb, key, fill);

    const built = buildBulalashkaScene(
      options.blobs,
      this.data.palette,
      meshBundle,
      this.data.buttArchetype,
      { subdivisions: options.subdivisions },
    );
    this.sceneRoot = built.root;
    this.eyelids = built.eyelids;
    this.pupils = built.pupils;
    this.threeScene.add(this.sceneRoot);

    this.renderThree();
    this.pixiTexture = Texture.from(this.canvas);
    this.pixiTexture.source.scaleMode = 'linear';
    this.texture = this.pixiTexture;

    this.nextBlinkAt = this.data.anim.blinkInterval * (0.7 + Math.random() * 0.6);
    this.eventMode = 'static';
    this.cursor = this.allowRotate ? 'grab' : 'default';
    this.anchor.set(0.5, 0.52);

    if (this.allowRotate) this.setupDrag();
  }

  private setupDrag(): void {
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    this.on('pointerdown', (e) => {
      dragging = true;
      this.cursor = 'grabbing';
      lastX = e.global.x;
      lastY = e.global.y;
    });
    this.on('pointerup', () => {
      dragging = false;
      this.cursor = 'grab';
    });
    this.on('pointerupoutside', () => {
      dragging = false;
      this.cursor = 'grab';
    });
    this.on('pointermove', (e) => {
      if (dragging) {
        const dx = e.global.x - lastX;
        const dy = e.global.y - lastY;
        lastX = e.global.x;
        lastY = e.global.y;
        this.dragYaw += dx * 0.012;
        this.dragPitch = Math.max(-0.55, Math.min(0.55, this.dragPitch + dy * 0.01));
      }
      this.lookAt(e.global.x, e.global.y);
    });
    this.on('pointerout', () => this.lookAt(null));
  }

  private renderThree(): void {
    this.threeRenderer.render(this.threeScene, this.threeCamera);
  }

  lookAt(worldX: number | null, worldY?: number | null): void {
    if (worldX === null || worldY === null || worldY === undefined) {
      this.lookX *= 0.85;
      this.lookY *= 0.85;
      return;
    }
    const cx = this.x;
    const cy = this.y;
    this.lookX = Math.max(-1, Math.min(1, (worldX - cx) / (this.rtSize * 0.45)));
    this.lookY = Math.max(-1, Math.min(1, (worldY - cy) / (this.rtSize * 0.45)));
  }

  setDisplayScale(px: number): void {
    const span =
      Math.max(
        this.data.bounds.maxX - this.data.bounds.minX,
        this.data.bounds.maxY - this.data.bounds.minY,
      ) || 1;
    this.scale.set(px / span);
  }

  fitInto(maxW: number, maxH: number): void {
    const span =
      Math.max(
        this.data.bounds.maxX - this.data.bounds.minX,
        this.data.bounds.maxY - this.data.bounds.minY,
      ) || 1;
    this.scale.set(Math.min(maxW, maxH) / span);
  }

  tick(dt: number): void {
    this.elapsed += dt;
    const anim = this.data.anim;

    const wobY = Math.sin(this.elapsed * anim.swayFreq) * anim.swayAmp * 0.4;
    const wobP = Math.cos(this.elapsed * anim.breathFreq * 0.7) * anim.breathAmp * 2;
    this.sceneRoot.rotation.set(
      this.dragPitch + wobP,
      this.dragYaw + wobY,
      Math.sin(this.elapsed * 0.9) * 0.02,
    );

    const pupilShift = 0.012 * (0.5 + anim.curiosity * 0.5);
    for (const pupil of this.pupils) {
      pupil.position.x = this.lookX * pupilShift;
      pupil.position.y = -this.lookY * pupilShift * 0.7;
    }

    this.blinkTimer += dt;
    if (this.blinkTimer >= this.nextBlinkAt && this.blinkActive <= 0) {
      this.blinkActive = 0.22;
      this.blinkTimer = 0;
      this.nextBlinkAt = anim.blinkInterval * (0.65 + Math.random() * 0.75);
    }
    if (this.blinkActive > 0) {
      this.blinkActive -= dt;
      const t = Math.max(0, this.blinkActive / 0.22);
      const shut = 1 - t;
      for (const lid of this.eyelids) {
        const w = (lid.userData.blinkWeight as number) ?? 0.5;
        lid.rotation.x = -Math.PI * 0.55 * shut * w;
      }
    } else {
      for (const lid of this.eyelids) {
        const w = (lid.userData.blinkWeight as number) ?? 0.5;
        lid.rotation.x = -Math.PI * 0.12 * w;
      }
    }

    this.renderThree();
    this.pixiTexture.source.update();
  }

  override destroy(options?: Parameters<Sprite['destroy']>[0]): void {
    this.threeRenderer.dispose();
    this.pixiTexture.destroy(true);
    super.destroy(options);
  }
}

/** @deprecated Use BulalashkaSceneView */
export { BulalashkaSceneView as BulalashkaMeshView };
