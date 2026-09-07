import * as T from "three";
import { buildCreature, type Creature } from "./creature";
import type { Mood, Reaction } from "./motion";
import { SkinClient } from "./skin-client";
import type { Genome } from "./genome";
import { StageCore } from "./stage-core";

export type HeadScreen = { x: number; y: number; r: number };

export class Stage {
  core: StageCore;
  get renderer() {
    return this.core.renderer;
  }
  get scene() {
    return this.core.scene;
  }
  get camera() {
    return this.core.camera;
  }
  get controls() {
    return this.core.controls!;
  }
  get holder() {
    return this.core.holder;
  }
  get reduced() {
    return this.core.reduced;
  }
  creature?: Creature;
  speech = 0;
  pet = 0;
  auto = false;
  paused = false;
  private lastAzimuth = 0;
  private mood: Mood = "neutral";
  private angle: number | null = null;
  private lastTime = performance.now();
  private motionTime = 0;
  private frame = 0;
  private skinClient = new SkinClient();
  private previewClient = new SkinClient();
  private generation = 0;
  private disposed = false;
  private host: HTMLElement;
  private scratch = new T.Vector3();
  private box = new T.Box3();
  private sphere = new T.Sphere();

  constructor(
    host: HTMLElement,
    opts?: { framing?: { yOffset?: number }; enableOrbit?: boolean },
  ) {
    this.host = host;
    this.core = new StageCore({
      host,
      enableOrbit: opts?.enableOrbit !== false,
      framing: opts?.framing,
    });
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Объёмная Булала. Перетаскивайте, чтобы вращать; зажмите, чтобы открыть меню.",
    );
    const raycaster = new T.Raycaster();
    const pointer = new T.Vector2();
    let downX = 0,
      downY = 0;
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointermove", (event) => {
      const rect = canvas.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((event.clientY - rect.top) / rect.height) * 2,
      );
      this.creature?.look(pointer.x, pointer.y);
    });
    canvas.addEventListener("pointerleave", () => this.creature?.look(0, 0));
    canvas.addEventListener("pointerdown", (event) => {
      downX = event.clientX;
      downY = event.clientY;
    });
    canvas.addEventListener("pointerup", (event) => {
      if (
        Math.hypot(event.clientX - downX, event.clientY - downY) > 7 ||
        !this.creature
      )
        return;
      if ((event as PointerEvent).pointerType === "mouse" && event.button !== 0)
        return;
      const rect = canvas.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((event.clientY - rect.top) / rect.height) * 2,
      );
      raycaster.setFromCamera(pointer, this.camera);
      if (raycaster.intersectObject(this.creature.root, true).length)
        this.react("pet");
    });
    if (this.controls) {
      this.controls.addEventListener("start", () => {
        this.angle = null;
      });
      this.lastAzimuth = this.controls.getAzimuthalAngle();
    }
    this.loop();
  }

  /** Project creature head center + radius into host-local pixels. */
  headScreenPoint(): HeadScreen | null {
    if (!this.creature) return null;
    this.creature.root.updateMatrixWorld(true);
    this.box.setFromObject(this.creature.root, true);
    this.box.getBoundingSphere(this.sphere);
    // Bias toward head (upper third of bounds).
    const center = this.scratch.set(
      this.sphere.center.x,
      this.sphere.center.y + this.sphere.radius * 0.28,
      this.sphere.center.z,
    );
    center.project(this.camera);
    const rect = this.host.getBoundingClientRect();
    const x = (center.x * 0.5 + 0.5) * rect.width;
    const y = (-center.y * 0.5 + 0.5) * rect.height;
    // Approximate screen radius from a world offset.
    const edge = this.scratch
      .copy(this.sphere.center)
      .add(new T.Vector3(this.sphere.radius, 0, 0));
    edge.project(this.camera);
    const ex = (edge.x * 0.5 + 0.5) * rect.width;
    const r = Math.max(40, Math.abs(ex - x) * 0.85);
    return { x, y, r };
  }

  async setGenome(g: Genome) {
    const request = ++this.generation;
    this.host.setAttribute("aria-busy", "true");
    try {
      const data = await this.skinClient.build(g);
      if (request !== this.generation || this.disposed) return;
      const next = buildCreature(g, data);
      if (this.creature) {
        this.holder.remove(this.creature.root);
        this.creature.dispose();
      }
      this.creature = next;
      this.holder.add(next.root);
      this.pet = 0;
      next.setMood(this.mood);
      if (this.controls)
        this.lastAzimuth = this.controls.getAzimuthalAngle();
    } catch (error) {
      if (
        (error as Error).name !== "AbortError" &&
        request === this.generation
      )
        this.host.dispatchEvent(new CustomEvent("stage-error"));
    } finally {
      if (request === this.generation)
        this.host.setAttribute("aria-busy", "false");
    }
  }

  setMood(mood: Mood) {
    this.mood = mood;
    this.creature?.setMood(mood);
  }

  react(reaction: Reaction) {
    this.creature?.react(reaction);
  }

  attention(x: number, y: number, weight = 1) {
    this.creature?.attention(x, y, weight);
  }

  setOrbitEnabled(on: boolean) {
    if (this.controls) this.controls.enabled = on;
  }

  view(side: "front" | "back" | "side") {
    this.auto = false;
    this.angle = side === "back" ? Math.PI : side === "side" ? Math.PI / 2 : 0;
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    if (document.hidden) return;
    if (!this.paused) this.motionTime += dt;
    const t = this.motionTime;
    this.pet = Math.max(0, this.pet - dt * 0.7);
    if (this.controls && this.angle !== null) {
      const offset = this.camera.position.clone().sub(this.controls.target);
      let a = Math.atan2(offset.x, offset.z);
      const diff = Math.atan2(
        Math.sin(this.angle - a),
        Math.cos(this.angle - a),
      );
      a += diff * 0.1;
      const radius = Math.hypot(offset.x, offset.z);
      this.camera.position.x = Math.sin(a) * radius;
      this.camera.position.z = Math.cos(a) * radius;
      if (Math.abs(diff) < 0.005) this.angle = null;
    }
    if (this.controls) {
      this.controls.autoRotate = this.auto && !this.reduced && !this.paused;
      this.controls.autoRotateSpeed = 1.6;
      this.controls.update(dt);
      const azimuth = this.controls.getAzimuthalAngle();
      const delta = Math.atan2(
        Math.sin(azimuth - this.lastAzimuth),
        Math.cos(azimuth - this.lastAzimuth),
      );
      this.lastAzimuth = azimuth;
      if (!this.paused)
        this.creature?.animate(
          t,
          this.speech,
          this.paused ? 0 : this.pet,
          this.reduced || this.paused,
          this.paused ? 0 : delta / Math.max(dt, 0.001),
        );
    } else if (!this.paused) {
      this.creature?.animate(
        t,
        this.speech,
        this.pet,
        this.reduced || this.paused,
        0,
      );
    }
    this.core.render();
  };

  async thumbnail(g: Genome) {
    const data = await this.previewClient.build(g);
    if (this.disposed) throw new DOMException("Disposed", "AbortError");
    const specimen = buildCreature(g, data),
      target = new T.WebGLRenderTarget(320, 320);
    target.texture.colorSpace = T.SRGBColorSpace;
    const camera = this.camera.clone();
    camera.aspect = 1;
    specimen.animate(0, 0, 0, true);
    specimen.root.updateMatrixWorld(true);
    const bounds = new T.Box3().setFromObject(specimen.root, true),
      size = bounds.getSize(new T.Vector3()),
      center = bounds.getCenter(new T.Vector3());
    const distance =
      (Math.max(size.x, size.y) * 0.6) /
        Math.tan(T.MathUtils.degToRad(camera.fov / 2)) +
      size.z * 0.5;
    camera.position.set(center.x, center.y + 0.15, center.z + distance);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    const oldTarget = this.renderer.getRenderTarget(),
      visible = this.holder.visible;
    try {
      this.holder.visible = false;
      this.scene.add(specimen.root);
      specimen.animate(0, 0, 0, true);
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.scene, camera);
      const bytes = new Uint8Array(320 * 320 * 4);
      this.renderer.readRenderTargetPixels(target, 0, 0, 320, 320, bytes);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 320;
      const ctx = canvas.getContext("2d")!,
        pixels = ctx.createImageData(320, 320);
      for (let y = 0; y < 320; y++)
        pixels.data.set(
          bytes.subarray((319 - y) * 1280, (320 - y) * 1280),
          y * 1280,
        );
      ctx.putImageData(pixels, 0, 0);
      return canvas.toDataURL("image/png");
    } finally {
      this.renderer.setRenderTarget(oldTarget);
      this.scene.remove(specimen.root);
      this.holder.visible = visible;
      specimen.dispose();
      target.dispose();
    }
  }

  snapshot() {
    this.core.render();
    return this.renderer.domElement.toDataURL("image/png");
  }

  dispose() {
    this.disposed = true;
    this.generation++;
    this.skinClient.cancel();
    this.previewClient.cancel();
    cancelAnimationFrame(this.frame);
    this.creature?.dispose();
    this.core.dispose();
  }
}
