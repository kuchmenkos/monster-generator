import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildCreature, type Creature } from "./creature";
import type { Mood, Reaction } from "./motion";
import type { Genome } from "./genome";
export class Stage {
  renderer: T.WebGLRenderer;
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(34, 1, 0.1, 50);
  controls: OrbitControls;
  creature?: Creature;
  holder = new T.Group();
  speech = 0;
  pet = 0;
  auto = false;
  paused = false;
  reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  private lastAzimuth = 0;
  private mood: Mood = "neutral";
  private angle: number | null = null;
  private lastTime = performance.now();
  private motionTime = 0;
  private frame = 0;
  private observer: ResizeObserver;
  constructor(host: HTMLElement) {
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.93;
    host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Объёмная Булала. Перетаскивайте, чтобы вращать; используйте кнопки для выбора ракурса.",
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
      const rect = canvas.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((event.clientY - rect.top) / rect.height) * 2,
      );
      raycaster.setFromCamera(pointer, this.camera);
      if (raycaster.intersectObject(this.creature.root, true).length)
        this.react("pet");
    });
    const pmrem = new T.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04);
    this.scene.environment = env.texture;
    this.scene.environmentIntensity = 0.7;
    room.dispose();
    pmrem.dispose();
    this.camera.position.set(0, 0.5, 6.5);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.2, 0);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 4.3;
    this.controls.maxDistance = 9;
    this.controls.minPolarAngle = 0.45;
    this.controls.maxPolarAngle = Math.PI * 0.77;
    this.controls.addEventListener("start", () => {
      this.angle = null;
    });
    const key = new T.DirectionalLight("#fff3df", 2.8);
    key.position.set(-3, 5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -4;
    key.shadow.camera.right = 4;
    key.shadow.camera.top = 4;
    key.shadow.camera.bottom = -4;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.025;
    key.shadow.radius = 4;
    this.scene.add(key);
    const fill = new T.DirectionalLight("#e3e3ff", 1.2);
    fill.position.set(4, 2, 1);
    this.scene.add(fill);
    const back = new T.DirectionalLight("#fff4e3", 2);
    back.position.set(0, 3, -3);
    this.scene.add(back);
    this.scene.add(new T.AmbientLight("#fff2eb", 0.3));
    const floor = new T.Mesh(
      new T.PlaneGeometry(200, 200),
      new T.ShadowMaterial({ opacity: 0.12 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.25;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.scene.add(this.holder);
    this.observer = new ResizeObserver(() => {
      const w = host.clientWidth,
        h = host.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      const fit = Math.max(6.5, (6.5 * 1.02) / this.camera.aspect);
      this.camera.position
        .sub(this.controls.target)
        .normalize()
        .multiplyScalar(fit)
        .add(this.controls.target);
      this.controls.minDistance = fit * 0.72;
      this.controls.maxDistance = fit * 1.45;
      this.camera.updateProjectionMatrix();
    });
    this.observer.observe(host);
    this.renderer.domElement.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      host.dispatchEvent(new CustomEvent("stage-error"));
    });
    this.loop();
  }
  setGenome(g: Genome) {
    if (this.creature) {
      this.holder.remove(this.creature.root);
      this.creature.dispose();
    }
    this.creature = buildCreature(g);
    this.holder.add(this.creature.root);
    this.pet = 0;
    this.creature.setMood(this.mood);
    this.lastAzimuth = this.controls.getAzimuthalAngle();
  }
  setMood(mood: Mood) {
    this.mood = mood;
    this.creature?.setMood(mood);
  }
  react(reaction: Reaction) {
    this.creature?.react(reaction);
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
    if (this.angle !== null) {
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
    this.renderer.render(this.scene, this.camera);
  };
  thumbnail(g: Genome) {
    const specimen = buildCreature(g),
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
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }
  dispose() {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.controls.dispose();
    this.creature?.dispose();
    this.renderer.dispose();
  }
}
