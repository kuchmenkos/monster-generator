import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/** Shared Three.js scene: lights, floor, env map, resize. Used by Stage and BattleStage. */
export type StageCoreOptions = {
  host: HTMLElement;
  enableOrbit?: boolean;
  cameraZ?: number;
  fov?: number;
  /** Pure vertical pan of camera + target (raises/lowers framing without distortion). */
  framing?: { yOffset?: number };
};

export class StageCore {
  renderer: T.WebGLRenderer;
  scene = new T.Scene();
  camera: T.PerspectiveCamera;
  controls?: OrbitControls;
  holder = new T.Group();
  reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  private observer: ResizeObserver;
  private disposed = false;
  private baseCameraY: number;
  private baseTargetY: number;
  private yOffset: number;

  constructor(opts: StageCoreOptions) {
    this.yOffset = opts.framing?.yOffset ?? 0;
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
    opts.host.append(this.renderer.domElement);

    this.baseCameraY = 0.5 + this.yOffset;
    this.baseTargetY = 0.2 + this.yOffset;
    this.camera = new T.PerspectiveCamera(opts.fov ?? 34, 1, 0.1, 50);
    this.camera.position.set(0, this.baseCameraY, opts.cameraZ ?? 6.5);

    const pmrem = new T.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04);
    this.scene.environment = env.texture;
    this.scene.environmentIntensity = 0.7;
    room.dispose();
    pmrem.dispose();

    if (opts.enableOrbit !== false) {
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.target.set(0, this.baseTargetY, 0);
      this.controls.enableDamping = true;
      this.controls.enablePan = false;
      this.controls.minDistance = 4.3;
      this.controls.maxDistance = 9;
      this.controls.minPolarAngle = 0.45;
      this.controls.maxPolarAngle = Math.PI * 0.77;
    } else {
      this.camera.lookAt(0, this.baseTargetY, 0);
    }

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
      if (this.disposed) return;
      const w = opts.host.clientWidth,
        h = opts.host.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      const fit = Math.max(
        opts.cameraZ ?? 6.5,
        ((opts.cameraZ ?? 6.5) * 1.02) / this.camera.aspect,
      );
      if (this.controls) {
        this.camera.position
          .sub(this.controls.target)
          .normalize()
          .multiplyScalar(fit)
          .add(this.controls.target);
        this.controls.minDistance = fit * 0.72;
        this.controls.maxDistance = fit * 1.45;
      }
      this.camera.updateProjectionMatrix();
    });
    this.observer.observe(opts.host);

    this.renderer.domElement.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      opts.host.dispatchEvent(new CustomEvent("stage-error"));
    });
  }

  setFraming(yOffset: number) {
    const dy = yOffset - this.yOffset;
    this.yOffset = yOffset;
    this.camera.position.y += dy;
    if (this.controls) this.controls.target.y += dy;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    this.observer.disconnect();
    this.controls?.dispose();
    this.renderer.dispose();
  }
}
