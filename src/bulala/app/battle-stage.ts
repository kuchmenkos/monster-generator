import { buildCreature, type Creature } from "../creature";
import { SkinClient } from "../skin-client";
import type { Genome } from "../genome";
import { StageCore } from "../stage-core";
import * as T from "three";

/**
 * Two creatures, only the active speaker is animated (mouth CPU is expensive).
 * Fixed camera, no orbit. Spotlight follows speaker.
 */
export class BattleStage {
  core: StageCore;
  private left?: Creature;
  private right?: Creature;
  private active: "a" | "b" | null = null;
  private skinA = new SkinClient();
  private skinB = new SkinClient();
  private frame = 0;
  private lastTime = performance.now();
  private motionTime = 0;
  private disposed = false;
  private host: HTMLElement;
  speech = 0;
  private gen = 0;
  private spot: T.DirectionalLight;
  private leftZ = 0;
  private rightZ = 0;
  private leftScale = 1;
  private rightScale = 1;

  constructor(host: HTMLElement) {
    this.host = host;
    this.core = new StageCore({
      host,
      enableOrbit: false,
      cameraZ: 8.5,
      fov: 32,
      framing: { yOffset: -0.2 },
    });
    this.core.camera.position.set(0, 0.35, 8.5);
    this.core.camera.lookAt(0, 0.05, 0);
    this.spot = new T.DirectionalLight("#fff6e8", 0.15);
    this.spot.position.set(0, 4, 3);
    this.core.scene.add(this.spot);
    this.loop();
  }

  async setPair(a: Genome, b: Genome) {
    const request = ++this.gen;
    this.host.setAttribute("aria-busy", "true");
    try {
      const [da, db] = await Promise.all([
        this.skinA.build(a),
        this.skinB.build(b),
      ]);
      if (request !== this.gen || this.disposed) return;
      this.clearCreatures();
      this.left = buildCreature(a, da);
      this.right = buildCreature(b, db);
      this.left.root.position.x = -1.55;
      this.right.root.position.x = 1.55;
      this.left.root.rotation.y = 0.25;
      this.right.root.rotation.y = -0.25;
      this.core.holder.add(this.left.root, this.right.root);
      this.left.animate(0, 0, 0, true);
      this.right.animate(0, 0, 0, true);
    } finally {
      if (request === this.gen) this.host.setAttribute("aria-busy", "false");
    }
  }

  setActive(side: "a" | "b" | null) {
    this.active = side;
    this.speech = 0;
  }

  private clearCreatures() {
    if (this.left) {
      this.core.holder.remove(this.left.root);
      this.left.dispose();
      this.left = undefined;
    }
    if (this.right) {
      this.core.holder.remove(this.right.root);
      this.right.dispose();
      this.right = undefined;
    }
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    if (this.disposed || document.hidden) return;
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this.motionTime += dt;

    const targetLZ = this.active === "a" ? 0.35 : this.active === "b" ? -0.15 : 0;
    const targetRZ = this.active === "b" ? 0.35 : this.active === "a" ? -0.15 : 0;
    const targetLS = this.active === "a" ? 1.06 : this.active === "b" ? 0.96 : 1;
    const targetRS = this.active === "b" ? 1.06 : this.active === "a" ? 0.96 : 1;
    this.leftZ += (targetLZ - this.leftZ) * Math.min(1, dt * 5);
    this.rightZ += (targetRZ - this.rightZ) * Math.min(1, dt * 5);
    this.leftScale += (targetLS - this.leftScale) * Math.min(1, dt * 5);
    this.rightScale += (targetRS - this.rightScale) * Math.min(1, dt * 5);
    if (this.left) {
      this.left.root.position.z = this.leftZ;
      this.left.root.scale.setScalar(this.leftScale);
    }
    if (this.right) {
      this.right.root.position.z = this.rightZ;
      this.right.root.scale.setScalar(this.rightScale);
    }
    const spotX = this.active === "a" ? -1.4 : this.active === "b" ? 1.4 : 0;
    this.spot.position.x += (spotX - this.spot.position.x) * Math.min(1, dt * 4);
    this.spot.intensity = this.active ? 1.4 : 0.15;

    const speaker =
      this.active === "a" ? this.left : this.active === "b" ? this.right : null;
    const idle =
      this.active === "a" ? this.right : this.active === "b" ? this.left : null;
    if (speaker)
      speaker.animate(this.motionTime, this.speech, 0, this.core.reduced, 0);
    if (
      idle &&
      Math.floor(this.motionTime * 2) !== Math.floor((this.motionTime - dt) * 2)
    )
      idle.animate(this.motionTime, 0, 0, true, 0);
    this.core.render();
  };

  dispose() {
    this.disposed = true;
    this.gen++;
    this.skinA.cancel();
    this.skinB.cancel();
    cancelAnimationFrame(this.frame);
    this.clearCreatures();
    this.core.dispose();
  }
}
