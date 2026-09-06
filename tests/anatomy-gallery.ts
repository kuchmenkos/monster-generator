import * as T from "three";
import { buildCreature } from "../src/bulala/creature";
import { generate, catalogs, type Trait } from "../src/bulala/genome";
const renderer = new T.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setSize(320, 360);
renderer.setPixelRatio(1);
renderer.setClearColor("#fffaf3");
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const scene = new T.Scene();
scene.add(new T.HemisphereLight("#fff7eb", "#827194", 2.2));
for (const [x, y, z, power] of [
  [-3, 5, 5, 3.5],
  [4, 3, 1, 1.5],
  [-2, 2, -4, 2],
]) {
  const l = new T.DirectionalLight("#ffffff", power);
  l.position.set(x, y, z);
  scene.add(l);
}
const camera = new T.PerspectiveCamera(32, 320 / 360, 0.1, 40);
let generation = 0;
async function render() {
  const token = ++generation,
    key = (document.querySelector("select") as HTMLSelectElement)
      .value as Trait,
    main = document.querySelector("main")!;
  main.innerHTML = "";
  for (let i = 0; i < catalogs[key].length; i++) {
    if (token !== generation) return;
    const g = generate("anatomy-review");
    Object.assign(g.genes, {
      shape: 0,
      eyes: 0,
      nose: 0,
      ears: 4,
      horns: 3,
      skin: 0,
      pattern: 0,
      finish: 0,
      palette: 0,
      mouth: 0,
      tail: 4,
      pupil: 0,
    });
    g.genes[key] = i;
    const c = buildCreature(g);
    c.animate(0, 0, 0, true);
    scene.add(c.root);
    const box = new T.Box3().setFromObject(c.root, true),
      center = box.getCenter(new T.Vector3()),
      size = box.getSize(new T.Vector3()),
      distance = Math.max(size.y, size.x) * 2.6;
    const article = document.createElement("article");
    const title = document.createElement("h2");
    title.textContent = `${i} · ${catalogs[key][i].label}`;
    article.append(title);
    for (const angle of key === "tail"
      ? [Math.PI, Math.PI * 0.64]
      : [0, Math.PI * 0.37]) {
      camera.position.set(
        center.x + Math.sin(angle) * distance,
        center.y + 0.1,
        center.z + Math.cos(angle) * distance,
      );
      camera.lookAt(center);
      renderer.render(scene, camera);
      const img = document.createElement("img");
      img.src = renderer.domElement.toDataURL();
      img.alt = title.textContent!;
      article.append(img);
    }
    main.append(article);
    scene.remove(c.root);
    c.dispose();
    document.querySelector("#status")!.textContent =
      `${i + 1}/${catalogs[key].length}`;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
document.querySelector("select")!.addEventListener("change", render);
void render();
window.addEventListener("pagehide", () => renderer.dispose());
