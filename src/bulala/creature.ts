import * as T from "three";
import { rng, palettes, pupilTypes, type Genome } from "./genome";
import { earShell, pupilGeometry } from "./anatomy";
import { lipContour, sweep, patchGeometry } from "./sculpt";
import { buildSkinBuffers, skinGeometry, type SkinBuffers } from "./skin-mesh";
import { morphology } from "./morphology";
import { growCoat } from "./coats";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  ExpressionController,
  SoftSpring,
  type Mood,
  type Reaction,
} from "./motion";
import {
  mergeGeometries,
} from "three/addons/utils/BufferGeometryUtils.js";

export interface Creature {
  root: T.Group;
  animate: (
    time: number,
    speech: number,
    pet: number,
    reduced: boolean,
    angularVelocity?: number,
  ) => void;
  setMood: (mood: Mood) => void;
  react: (reaction: Reaction) => void;
  look: (x: number, y: number) => void;
  /** Body lean + eye gaze toward a direction in [-1,1] screen-ish space. */
  attention: (x: number, y: number, weight?: number) => void;
  dispose: () => void;
}
const clamp = T.MathUtils.clamp;
export function buildCreature(g: Genome, prepared?: SkinBuffers): Creature {
  const m = morphology(g),
    r = rng(g.seed + "/details-v2"),
    colors = palettes[g.genes.palette];
  const root = new T.Group(),
    body = new T.Group();
  root.add(body);
  const phase = r() * 6.28;
  const expression = new ExpressionController(),
    spring = new SoftSpring();
  let faceSmile = 0,
    faceRound = 0,
    lastPet = 0;
  const grainData = new Uint8Array(128 * 128 * 4);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const v =
        230 +
        Math.sin(x * 0.83 + Math.sin(y * 0.7)) * 5 +
        Math.sin(y * 1.2 + x * 0.41) * 4 +
        (r() - 0.5) * 4;
      grainData.set([v, v, v, 255], (y * 128 + x) * 4);
    }
  const grain = new T.DataTexture(grainData, 128, 128);
  grain.wrapS = grain.wrapT = T.RepeatWrapping;
  grain.repeat.set(4, 4);
  grain.magFilter = T.LinearFilter;
  grain.needsUpdate = true;
  const skin = new T.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: [0.52, 0.88, 0.34][g.genes.finish],
    sheen: 1,
    sheenColor: new T.Color(colors[1]),
    sheenRoughness: 0.7,
    bumpMap: grain,
    bumpScale: g.genes.finish === 2 ? 0.004 : 0.007,
    clearcoat: g.genes.finish === 1 ? 0 : 0.22,
    side: T.FrontSide,
  });
  const coatMat = new T.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.9,
    sheen: 1,
    sheenColor: new T.Color(colors[1]),
    side: T.DoubleSide,
  });
  const coatOpen={value:0},coatSmile={value:0};
  const coatTime = { value: 0 },
    coatMotion = { value: 0 };
  coatMat.onBeforeCompile = (shader) => {
    shader.uniforms.coatTime = coatTime;
    shader.uniforms.coatOpen=coatOpen;shader.uniforms.coatSmile=coatSmile;
    shader.uniforms.coatMotion = coatMotion;
    shader.vertexShader =
      "attribute float flex; attribute vec3 jawMorph; attribute vec3 smileMorph; uniform float coatOpen; uniform float coatSmile; uniform float coatTime; uniform float coatMotion;\n" +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      transformed += jawMorph * coatOpen + smileMorph * coatSmile;
      transformed.x += sin(coatTime * 1.45 + position.y * 4.0 + position.z * 3.0) * flex * coatMotion;
      transformed.z += cos(coatTime * 1.3 + position.x * 4.0) * flex * coatMotion * 0.6;
    `,
    );
  };
  coatMat.customProgramCacheKey = () => "bulala-grown-fibres-v2";
  const flesh = new T.MeshPhysicalMaterial({
    color: colors[0],
    roughness: g.genes.finish === 1 ? 0.82 : 0.42,
    sheen: 0.8,
  });
  const pink = new T.MeshPhysicalMaterial({
    color: colors[3],
    roughness: 0.4,
  });
  const dark = new T.MeshStandardMaterial({ color: colors[2], roughness: 0.8 });
  const cavityMat = new T.MeshStandardMaterial({
    color: "#2e1927",
    roughness: 1,
    side: T.FrontSide,
  });
  const toothMat = new T.MeshPhysicalMaterial({
    color: "#f0dfbd",
    roughness: 0.37,
    clearcoat: 0.18,
    transparent: true,
  });
  const sclera = new T.MeshPhysicalMaterial({
    color: "#eee4ce",
    roughness: 0.26,
    clearcoat: 0.6,
  });
  const pupilMat = new T.MeshPhysicalMaterial({
    color: "#171923",
    roughness: 0.13,
    clearcoat: 1,
  });
  const sharedSphere = new T.SphereGeometry(1, 32, 24);
  function ball(
    parent: T.Object3D,
    mat: T.Material,
    pos: T.Vector3,
    scale: T.Vector3,
  ) {
    const mesh = new T.Mesh(sharedSphere, mat);
    mesh.position.copy(pos);
    mesh.scale.copy(scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function mesh(
    parent: T.Object3D,
    geo: T.BufferGeometry,
    mat: T.Material,
    name = "",
  ) {
    const obj = new T.Mesh(geo, mat);
    obj.name = name;
    obj.castShadow = true;
    obj.receiveShadow = true;
    parent.add(obj);
    return obj;
  }
  // Nose, cavity walls and the skull share one indexed surface.
  const headGeo=skinGeometry(prepared ?? buildSkinBuffers(g),g);
  const hp=headGeo.attributes.position;
  const indices=headGeo.index!,keep:number[]=[];
  for(let i=0;i<indices.count;i+=3){
    const a=indices.getX(i),b=indices.getX(i+1),c=indices.getX(i+2);
    const x=(hp.getX(a)+hp.getX(b)+hp.getX(c))/3,y=(hp.getY(a)+hp.getY(b)+hp.getY(c))/3,z=(hp.getZ(a)+hp.getZ(b)+hp.getZ(c))/3;
    if(z>0&&(x/(m.mouthWidth+.035))**2+((y-m.mouthY)/.115)**2<1)continue;
    keep.push(a,b,c);
  }
  headGeo.setIndex(keep);
  const smileDelta = new Float32Array(hp.count * 3),
    rearDelta = new Float32Array(hp.count * 3);
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i),
      y = hp.getY(i),
      z = hp.getZ(i),
      front = T.MathUtils.smoothstep(z, 0, 0.4);
    const cheek =
      Math.exp(
        -(((Math.abs(x) - 0.48 * m.rx) / 0.3) ** 2) - ((y + 0.13) / 0.3) ** 2,
      ) * front;
    const brow =
      Math.exp(-(((y - 0.56 * m.ry) / 0.25) ** 2) - (x / 0.8) ** 4) * front;
    smileDelta[i * 3 + 1] = cheek * 0.055 + brow * (Math.abs(x) - 0.18) * 0.08;
    smileDelta[i * 3 + 2] = cheek * 0.045;
    const rear =
      T.MathUtils.smoothstep(-z, 0.03, 0.85) *
      Math.exp(-(((y - m.cheekY) / 0.72) ** 4));
    rearDelta[i * 3] = rear;
    rearDelta[i * 3 + 2] = rear * x * 0.48;
  }
  headGeo.morphAttributes.position = [
    new T.BufferAttribute(smileDelta, 3),
    new T.BufferAttribute(rearDelta, 3),
  ];
  headGeo.morphTargetsRelative = true;
  headGeo.morphAttributes.normal = [smileDelta, rearDelta].map((delta) => {
    const temp = headGeo.clone();
    temp.morphAttributes = {};
    const p = temp.attributes.position;
    for (let i = 0; i < p.count; i++)
      p.setXYZ(
        i,
        hp.getX(i) + delta[i * 3],
        hp.getY(i) + delta[i * 3 + 1],
        hp.getZ(i) + delta[i * 3 + 2],
      );
    temp.computeVertexNormals();
    const normal = new Float32Array(p.count * 3),
      base = headGeo.attributes.normal,
      n = temp.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      normal[i * 3] = n.getX(i) - base.getX(i);
      normal[i * 3 + 1] = n.getY(i) - base.getY(i);
      normal[i * 3 + 2] = n.getZ(i) - base.getZ(i);
    }
    temp.dispose();
    return new T.BufferAttribute(normal, 3);
  });
  const headMesh = mesh(body, headGeo, skin, "continuous-skull");
  const restHead = new Float32Array(hp.array);
  let bottomY = Infinity;
  for (let i = 0; i < hp.count; i++) bottomY = Math.min(bottomY, hp.getY(i));
  const coat = growCoat(g, m, coatMat);
  if (coat) body.add(coat);

  // Both surfaces share one rim; no paper-thin ear membranes.
  const ears: T.Group[] = [];
  for (const side of [-1, 1]) {
    const group = new T.Group(),
      geo = earShell(g, side);
    const probe = m.point(new T.Vector3(side * 0.78, 0.4, 0.14).normalize());
    const close = m.eyes.some(
      (e) => Math.hypot(e.x - probe.x, e.y - probe.y) < e.radius + 0.19,
    );
    const dir = new T.Vector3(
      side * 0.78,
      close ? 0.22 : 0.4,
      close ? 0.28 : 0.14,
    );
    const root = m.point(dir.normalize());
    group.position.copy(root).addScaledVector(dir, -0.03);
    ears.push(group);
    body.add(group);
    const inner = geo.userData.innerMix as number[],
      a: number[] = [];
    for (const mix of inner) {
      const c = new T.Color(colors[0]).lerp(new T.Color(colors[3]), mix);
      a.push(c.r, c.g, c.b);
    }
    geo.setAttribute("color", new T.Float32BufferAttribute(a, 3));
    mesh(group, geo, skin, "anatomical-ear");
  }
  // Horn growth follows a seeded curved spine. Branching and winding vary continuously.
  if (g.genes.horns === 7) {
    const geo = patchGeometry(32, 16, (u, t) => {
      const a = u * Math.PI * 2,
        z = (t - 0.5) * m.rz * 1.2,
        h = Math.sin(Math.PI * t) ** 0.7,
        y = m.ry * Math.sqrt(Math.max(0, 1 - (z / m.rz) ** 2));
      return new T.Vector3(
        Math.sin(a) * 0.095 * h,
        y + (0.025 + 0.37 * (Math.cos(a) * 0.5 + 0.5)) * h,
        z,
      );
    });
    const color = new T.Color(colors[2]),
      attribute = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < attribute.length; i += 3)
      attribute.set([color.r, color.g, color.b], i);
    geo.setAttribute("color", new T.BufferAttribute(attribute, 3));
    mesh(body, geo, skin, "broad-crest");
  }
  if (g.genes.horns !== 3 && g.genes.horns !== 7) {
    const hr = rng(g.seed + "/horn-v3");
    const kind = g.genes.horns,
      sides = kind === 2 || kind === 7 ? [0] : [-1, 1];
    for (const side of sides) {
      const x = side * m.rx * (0.4 + hr() * 0.09),
        y = m.ry * (side === 0 ? 0.94 : 0.88);
      const start = m.skinFront(x, y),
        length = kind === 6 ? 0.2 + hr() * 0.13 : 0.28 + hr() * 0.38;
      const pts = [start];
      if (kind === 1) {
        for (let i = 1; i <= 9; i++) {
          const t = i / 9,
            a = t * Math.PI * 2.05;
          pts.push(
            start
              .clone()
              .add(
                new T.Vector3(
                  side * (1 - Math.cos(a)) * length * 0.55,
                  Math.sin(a) * length * 0.6,
                  -t * 0.18 - (1 - Math.cos(a)) * length * 0.35,
                ),
              ),
          );
        }
      } else {
        for (let i = 1; i <= 5; i++) {
          const t = i / 5;
          pts.push(
            start
              .clone()
              .add(
                new T.Vector3(
                  (side || 0.3) * t * length * 0.45 + Math.sin(t * 3) * 0.08,
                  t * length,
                  -t * t * length * (kind === 8 ? 1.6 : 0.65),
                ),
              ),
          );
        }
      }
      const horn = mesh(
        body,
        sweep(
          pts,
          kind === 5 ? 0.053 : kind === 7 ? 0.27 : 0.11 + hr() * 0.035,
          64,
          16,
          kind === 6 ? 0.045 : 0.001,
          kind === 5 || kind === 6 ? 0 : 0.065,
        ),
        kind === 5 ? flesh : dark,
        "grown-horn",
      );
      if (kind === 9) {
        const p = horn.geometry.attributes.position;
        const curve = new T.CatmullRomCurve3(pts);
        for (let i = 0; i < p.count; i++) {
          const center = curve.getPointAt(Math.floor(i / 17) / 64);
          p.setX(i, center.x + (p.getX(i) - center.x) * 1.9);
          p.setZ(i, center.z + (p.getZ(i) - center.z) * 0.38);
        }
        horn.geometry.computeVertexNormals();
      }
      if (kind === 4 || kind === 10)
        for (let j = 1; j <= (kind === 10 ? 1 : 3); j++) {
          const start = pts[Math.min(j + 1, 4)],
            sgn = j % 2 ? 1 : -1;
          mesh(
            body,
            sweep(
              [
                start,
                start.clone().add(new T.Vector3(sgn * 0.13, 0.13, 0.02)),
                start
                  .clone()
                  .add(
                    new T.Vector3(
                      sgn * (0.16 + hr() * 0.12),
                      0.25 + hr() * 0.1,
                      -0.04,
                    ),
                  ),
              ],
              0.045,
              14,
              7,
            ),
            dark,
            "horn-branch",
          );
        }
      if (kind === 5)
        ball(body, pink, pts.at(-1)!, new T.Vector3(0.075, 0.095, 0.075));
    }
  }

  // Each eyeball has its own upper/lower eyelid surface and blink clock.
  const eyeStates: Array<{
    iris: T.Group;
    lid: T.Mesh;
    update: (closed: number) => void;
    next: number;
    start: number;
    duration: number;
    random: () => number;
    phase: number;
    blink: number;
  }> = [];
  const pupils = pupilTypes(g, m.eyes.length);
  const browGroups: T.Group[] = [];
  m.eyes.forEach((e, index) => {
    const er = rng(g.seed + "/eye/" + index),
      stalk = g.genes.eyes === 5;
    const anchor = new T.Vector3(
      e.x,
      e.y,
      m.front(e.x, e.y) - e.radius * e.depth,
    );
    if (stalk) {
      const from = anchor.clone();
      anchor.y += 0.32 + index * 0.12;
      anchor.z += 0.1;
      mesh(
        body,
        sweep(
          [
            from,
            from
              .clone()
              .add(new T.Vector3(index === 0 ? -0.07 : 0.07, 0.19, 0.08)),
            anchor,
          ],
          0.09,
          20,
          10,
          0.065,
        ),
        flesh,
        "eye-stalk",
      );
    }
    const eye = ball(
      body,
      sclera,
      anchor,
      new T.Vector3(e.radius, e.radius, e.radius),
    );
    eye.name = "eyeball";
    eye.userData.pupilType = pupils[index];
    const irisGroup = new T.Group();
    irisGroup.position.copy(anchor);
    body.add(irisGroup);
    const irisColor = new T.Color(colors[4]).offsetHSL(
      (er() - 0.5) * 0.2,
      0,
      (er() - 0.5) * 0.12,
    );
    const irisMat = new T.MeshPhysicalMaterial({
      color: irisColor,
      roughness: 0.3,
      clearcoat: 0.65,
    });
    ball(
      irisGroup,
      dark,
      new T.Vector3(0, 0, e.radius * 0.94),
      new T.Vector3(e.radius * 0.49, e.radius * 0.5, 0.026),
    );
    ball(
      irisGroup,
      irisMat,
      new T.Vector3(0, 0, e.radius * 0.995),
      new T.Vector3(e.radius * 0.44, e.radius * 0.46, 0.022),
    );
    mesh(
      irisGroup,
      pupilGeometry(pupils[index], e.radius),
      pupilMat,
      "shaped-pupil",
    );
    // Radial iris fibres sit on the curved iris; no painted flat eyes.
    const irisFibres: T.BufferGeometry[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const rr = e.radius * (0.27 + er() * 0.05);
      irisFibres.push(
        sweep(
          [
            new T.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, e.radius * 1.065),
            new T.Vector3(
              Math.cos(a) * e.radius * 0.405,
              Math.sin(a) * e.radius * 0.42,
              e.radius * 1.015,
            ),
          ],
          0.0025,
          2,
          3,
          0.001,
        ),
      );
    }
    // One geometry for these fibres, with independent iris rotation/gaze.
    const fibrePositions: number[] = [];
    for (const geo of irisFibres) {
      const plain = geo.toNonIndexed();
      fibrePositions.push(...plain.attributes.position.array);
      plain.dispose();
      geo.dispose();
    }
    const fibreGeo = new T.BufferGeometry();
    fibreGeo.setAttribute(
      "position",
      new T.Float32BufferAttribute(fibrePositions, 3),
    );
    fibreGeo.computeVertexNormals();
    mesh(irisGroup, fibreGeo, dark);
    const rows = 5,
      cols = 64;
    const lidGeo = patchGeometry(rows, cols, () => new T.Vector3());
    const lid = mesh(body, lidGeo, skin, "eyelids-" + index);
    const lc: number[] = [];
    for (let i = 0; i < lidGeo.attributes.position.count; i++) {
      const c = m.color(e.x, e.y, 1);
      lc.push(c.r, c.g, c.b);
    }
    lidGeo.setAttribute("color", new T.Float32BufferAttribute(lc, 3));
    function update(closed: number) {
      const pos = lidGeo.attributes.position;
      for (let row = 0; row <= rows; row++)
        for (let j = 0; j <= cols; j++) {
          const t = row / rows,
            a = (j / cols) * Math.PI * 2;
          const ca = Math.cos(a),
            sa = Math.sin(a);
          let ix = ca * e.radius * 0.92;
          let iy =
            sa *
              e.radius *
              e.lid *
              (1 - closed * 0.989) *
              (1 - Math.max(0, faceSmile) * 0.23) +
            ix * e.tilt;
          if (e.squareness) {
            const sqx = Math.sign(ca) * Math.abs(ca) ** 0.32 * e.radius * 0.92;
            const sqy =
              Math.sign(sa) *
                Math.abs(sa) ** 0.32 *
                e.radius *
                e.lid *
                (1 - closed * 0.989) +
              sqx * e.tilt;
            ix = T.MathUtils.lerp(ix, sqx, e.squareness);
            iy = T.MathUtils.lerp(iy, sqy, e.squareness);
          }
          if (e.tear) {
            const inner = Math.max(0, -Math.sign(e.x || 1) * ca);
            iy -= e.tear * 0.14 * e.radius * inner * inner;
          }
          if (e.heart)
            iy += e.heart * 0.12 * e.radius * Math.max(0, sa) * Math.cos(a * 2);
          const iz =
            anchor.z +
            Math.sqrt(Math.max(0.001, e.radius ** 2 - ix ** 2 - iy ** 2)) +
            0.045;
          const ox = Math.cos(a) * e.radius * 1.4,
            oy = Math.sin(a) * e.radius * 1.24;
          const x = anchor.x + T.MathUtils.lerp(ix, ox, t),
            y = anchor.y + T.MathUtils.lerp(iy, oy, t);
          const outside = stalk ? anchor.z - 0.01 : m.front(x, y) - 0.003;
          const ease = t * t * (3 - 2 * t);
          let z =
            T.MathUtils.lerp(iz, outside, ease) +
            Math.sin(Math.PI * t) ** 2 * 0.023;
          const sphereSection =
            e.radius ** 2 - (x - anchor.x) ** 2 - (y - anchor.y) ** 2;
          if (sphereSection > 0)
            z = Math.max(z, anchor.z + Math.sqrt(sphereSection) + 0.026);
          pos.setXYZ(row * (cols + 1) + j, x, y, z);
        }
      pos.needsUpdate = true;
      lidGeo.computeVertexNormals();
      lid.userData.closure = closed;
    }
    const browGroup = new T.Group();
    const browAt = m.skinFront(e.x, e.y + e.radius * 0.98);
    browGroup.position.copy(browAt);
    body.add(browGroup);
    browGroups.push(browGroup);
    const browParts: T.BufferGeometry[] = [];
    const stick = (points: T.Vector3[], radius: number, segs = 12) => {
      for (const point of points)
        point.z +=
          m.front(
            browGroup.position.x + point.x,
            browGroup.position.y + point.y,
          ) -
          browGroup.position.z -
          0.02;
      browParts.push(sweep(points, radius, segs, 5));
    };
    const kind = g.genes.brows;
    const span = kind === 5 ? 1.28 : 1;
    if (kind === 4 || kind === 14) {
      const n = kind === 4 ? 65 : 28;
      for (let j = 0; j < n; j++) {
        const u = ((j / (n - 1)) * 2 - 1) * e.radius;
        const start = new T.Vector3(
          u,
          -Math.abs(u) * 0.18 + (er() - 0.5) * 0.035,
          0,
        );
        stick(
          [
            start,
            start.clone().add(new T.Vector3(0.015, 0.05 + er() * 0.04, 0.025)),
            start.clone().add(new T.Vector3(0.045, 0.075, 0.01)),
          ],
          kind === 14 ? 0.01 : 0.006,
          5,
        );
      }
    } else if (kind === 8) {
      for (const u of [-0.55, 0, 0.55])
        stick(
          [
            new T.Vector3(u * e.radius, 0, 0),
            new T.Vector3(u * e.radius, 0.018, 0.012),
            new T.Vector3(u * e.radius + 0.01, 0.02, 0),
          ],
          0.016,
          6,
        );
    } else if (kind === 11) {
      for (const u of [-0.6, 0, 0.6])
        stick(
          [
            new T.Vector3((u - 0.12) * e.radius, 0.01, 0),
            new T.Vector3(u * e.radius, 0.02, 0.01),
            new T.Vector3((u + 0.12) * e.radius, 0.01, 0),
          ],
          0.014,
          6,
        );
    } else if (kind === 12) {
      const turns = 3;
      const pts: T.Vector3[] = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12,
          a = t * Math.PI * 2 * turns;
        pts.push(
          new T.Vector3(
            Math.cos(a) * 0.045 + t * e.radius * 0.4 - e.radius * 0.2,
            Math.sin(a) * 0.045 + 0.02,
            0.01,
          ),
        );
      }
      stick(pts, 0.01, 16);
    } else if (kind === 13) {
      stick(
        [
          new T.Vector3(-e.radius, 0.02, 0),
          new T.Vector3(-e.radius * 0.3, 0.08, 0.02),
          new T.Vector3(e.radius * 0.15, -0.02, 0),
          new T.Vector3(e.radius, 0.07, 0.01),
        ],
        0.012,
        12,
      );
    } else if (kind === 9) {
      stick(
        [
          new T.Vector3(-e.radius, 0, -0.03),
          new T.Vector3(-e.radius * 0.4, 0.07, 0.02),
          new T.Vector3(0, -0.01, 0.02),
          new T.Vector3(e.radius * 0.4, 0.07, 0.02),
          new T.Vector3(e.radius, 0, -0.03),
        ],
        0.02,
        18,
      );
    } else {
      const lift =
        kind === 7 ? 0.14 : kind === 6 ? -0.05 : kind === 10 ? -0.04 : 0.075;
      const innerY = kind === 6 ? 0.1 : kind === 10 ? -0.08 : 0;
      const outerY = kind === 6 ? -0.04 : kind === 10 ? 0.02 : -0.015;
      stick(
        [
          new T.Vector3(-e.radius * span, innerY, -0.03),
          new T.Vector3(0, lift, 0.025),
          new T.Vector3(e.radius * span, outerY, -0.03),
        ],
        kind === 2 ? 0.018 : kind === 0 || kind === 1 ? 0.035 : 0.024,
        20,
      );
    }
    const bg = mergeGeometries(browParts);
    browParts.forEach((p) => p.dispose());
    if (bg)
      mesh(
        browGroup,
        bg,
        kind === 4 ||
          kind === 2 ||
          kind === 8 ||
          kind === 11 ||
          kind === 13 ||
          kind === 14
          ? dark
          : flesh,
        "brow",
      );
    update(0);
    const ep = lidGeo.attributes.position,
      ec = lidGeo.attributes.color;
    for (let i = 0; i < ep.count; i++) {
      const c = m.color(ep.getX(i), ep.getY(i), ep.getZ(i));
      ec.setXYZ(i, c.r, c.g, c.b);
    }
    eyeStates.push({
      iris: irisGroup,
      lid,
      update,
      next: 1 + er() * 5 + index * 0.47,
      start: -10,
      duration: 0.19 + er() * 0.13,
      random: er,
      phase: er() * 6.28,
      blink: 0,
    });
  });

  // The skin has an actual aperture. A continuous fleshy annulus closes across it.
  const mouthWidth = m.mouthWidth,
    mouthY = m.mouthY,
    mouthZ = m.front(0, mouthY);
  const mouthGroup = new T.Group();
  mouthGroup.name = "mouth";
  body.add(mouthGroup);
  const lipRows=18;
  const mouthGeo = patchGeometry(lipRows, 96, () => new T.Vector3());
  const mouth = mesh(mouthGroup, mouthGeo, skin, "living-lips");
  const mc: number[] = [];
  for (let row = 0; row <= lipRows; row++)
    for (let j = 0; j <= 96; j++) {
      const t = row / lipRows,
        a = (j / 96) * Math.PI * 2,
        c = m.color(Math.cos(a) * mouthWidth, mouthY + Math.sin(a) * 0.13, 1);
      c.lerp(new T.Color(colors[3]), (1 - t) ** 3 * 0.29);
      mc.push(c.r, c.g, c.b);
    }
  mouthGeo.setAttribute("color", new T.Float32BufferAttribute(mc, 3));
  const hollow = mesh(
    mouthGroup,
    patchGeometry(12, 64, (u, t) => {
      const a = u * Math.PI * 2,
        x = Math.cos(a) * (mouthWidth + 0.03) * t,
        y = mouthY + Math.sin(a) * 0.24 * t;
      return m.skinFront(x, y, -0.035 - 0.22 * (1 - t * t));
    }),
    cavityMat,
    "oral-cavity",
  );
  const upper = new T.Group(),
    lower = new T.Group();
  upper.name = "upper-teeth";
  lower.name = "lower-teeth";
  mouthGroup.add(upper, lower);
  const toothCount = [8, 12, 5, 8, 8, 10][g.genes.teeth];
  for (const row of [0, 1]) {
    const jaw = row === 0 ? upper : lower,
      dir = row === 0 ? -1 : 1;
    const gumPoints: T.Vector3[] = [];
    for (let i = 0; i < toothCount; i++) {
      const u = ((i / (toothCount - 1)) * 2 - 1) * 0.86,
        x = u * mouthWidth;
      const fang =
        ((g.genes.teeth === 3 && row === 0) ||
          (g.genes.teeth === 4 && row === 1)) &&
        (i === 1 || i === toothCount - 2);
      const length =
        (fang ? 0.16 : g.genes.teeth === 1 ? 0.055 : 0.092) *
        (0.9 + r() * 0.18);
      const width =
        (mouthWidth / toothCount) * (g.genes.teeth === 2 ? 0.54 : 0.82);
      let geo: T.BufferGeometry;
      if (fang)
        geo = sweep(
          [
            new T.Vector3(0, length * 0.5, 0),
            new T.Vector3(0.009, 0, 0.016),
            new T.Vector3(0.015, -length * 0.5, 0.025),
          ],
          width * 0.78,
          16,
          8,
        );
      else if (g.genes.teeth === 5)
        geo = new T.ConeGeometry(width, length, 3, 2);
      else
        geo = new RoundedBoxGeometry(
          width * 2,
          length,
          0.058,
          3,
          Math.min(0.018, width * 0.4),
        );
      const tooth = new T.Mesh(geo, toothMat);
      tooth.name = "tooth";
      tooth.rotation.z = fang
        ? row === 0
          ? 0
          : Math.PI
        : g.genes.teeth === 5
          ? row === 0
            ? Math.PI
            : 0
          : 0;
      const seam = 0.035 * u * u + m.mouthTilt * u;
      const seat = m.skinFront(
        x,
        mouthY + seam,
        -0.065 - (row === 1 ? 0.025 : 0),
      );
      tooth.position.set(seat.x, seat.y + dir * length * 0.42, seat.z);
      tooth.userData = { restY: tooth.position.y, u };
      tooth.castShadow = true;
      jaw.add(tooth);
      gumPoints.push(m.skinFront(x, mouthY + seam, -0.075));
    }
    mesh(jaw, sweep(gumPoints, 0.025, 32, 8, 0.016), pink, "gums");
  }
  const tongue = ball(
    mouthGroup,
    pink,
    new T.Vector3(0, mouthY - 0.11, mouthZ - 0.13),
    new T.Vector3(mouthWidth * 0.44, 0.035, 0.055),
  );
  tongue.name = "tongue";
  function jawShift(x: number, y: number, open: number) {
    return m.deformation(new T.Vector3(x,y,1),open,0).y;
  }
  function updateMouth(open: number) {
    mouth.userData.openness = open;
    coatOpen.value=open;coatSmile.value=faceSmile;
    const pos = mouthGeo.attributes.position;
    for (let row = 0; row <= lipRows; row++)
      for (let j = 0; j <= 96; j++) {
        const t = row / lipRows,
          a = (j / 96) * Math.PI * 2;
        const lip = lipContour(
          m.mouthSpec.contour,
          Math.cos(a),
          Math.sin(a),
          a,
        );
        const c = lip.c,
          s = lip.s;
        const ix = c * mouthWidth * (1 + faceSmile * 0.1 - faceRound * 0.22),
          iy =
            mouthY +
            (0.035 + faceSmile * 0.1 - m.mouthSpec.droop) * c * c +
            m.mouthTilt * c +
            s * (0.0015 + open * (s > 0 ? 0.095 : 0.17));
        const ox = c * (mouthWidth + 0.155),
          oy = mouthY + s * 0.25;
        const x = T.MathUtils.lerp(ix, ox, t),
          y = T.MathUtils.lerp(iy, oy + jawShift(ox, oy, open), t);
        const skin = m.nasal.warp(x, y);
        const z =
          m.front(x, y) -
          0.002 +
          (1-t)**2 * m.mouthSpec.thick * (.48+1.7*Math.sin(Math.PI*t)) * (s<0?1.14:.92) * (1+.07*c);
        pos.setXYZ(row * 97 + j, skin.x, skin.y, z);
      }
    pos.needsUpdate = true;
    mouthGeo.computeVertexNormals();
    const exposure=T.MathUtils.smoothstep(open,.015,.20);
    toothMat.opacity=exposure;
    upper.visible=lower.visible=true;
    tongue.visible=open>.07;
    upper.position.z=lower.position.z=-.055*(1-exposure);
    upper.scale.x = lower.scale.x = 1 + faceSmile * 0.1 - faceRound * 0.22;
    for (const jaw of [upper, lower])
      for (const tooth of jaw.children)
        if (tooth.name === "tooth")
          tooth.position.y =
            tooth.userData.restY +
            (faceSmile * 0.1 - m.mouthSpec.droop) * tooth.userData.u ** 2;
    upper.position.y = open * 0.088;
    lower.position.y = -open * 0.156;
    tongue.position.y = mouthY - 0.035 - open * 0.12;
    hollow.visible = true;
    for (let i = 0; i < hp.count; i++) {
      const x = restHead[i * 3],
        y = restHead[i * 3 + 1],
        z = restHead[i * 3 + 2];
      hp.setY(i, y + (z > 0 ? jawShift(x, y, open) : 0));
    }
    hp.needsUpdate = true;
    const normals=headGeo.attributes.normal, e=.002;
    for(let i=0;i<hp.count;i++){
      const x=restHead[i*3],y=restHead[i*3+1],z=restHead[i*3+2];
      if(z>0&&y<mouthY+.11){const at=m.attachment(x,y).normal;
        const dyx=(jawShift(x+e,y,open)-jawShift(x-e,y,open))/(2*e),dyy=(jawShift(x,y+e,open)-jawShift(x,y-e,open))/(2*e);
        at.set(at.x-at.y*dyx/(1+dyy),at.y/(1+dyy),at.z).normalize();normals.setXYZ(i,at.x,at.y,at.z);
      }
    }normals.needsUpdate=true;
  }
  updateMouth(0);
  const lipPos = mouthGeo.attributes.position,
    lipColors = mouthGeo.attributes.color;
  for (let i = 0; i < lipPos.count; i++) {
    const t = Math.floor(i / 97) / lipRows,
      c = m.color(lipPos.getX(i), lipPos.getY(i), lipPos.getZ(i));
    c.lerp(new T.Color(colors[3]), (1 - t) ** 3 * 0.29);
    lipColors.setXYZ(i, c.r, c.g, c.b);
  }

  // Tail emerges above the rear cleft. The peach itself belongs to the skull mesh.
  const tail = new T.Group();
  body.add(tail);
  if (g.genes.tail !== 4) {
    const y = m.cheekY + 0.38,
      z = m.back(0, y) + 0.04;
    tail.position.set(0, y, z);
    const tr = rng(g.seed + "/tail-v3");
    const kind = g.genes.tail,
      pts = [new T.Vector3(0, 0, 0)];
    if (kind === 0 || kind === 9) {
      for (let i = 1; i <= 12; i++) {
        const t = i / 12,
          a = t * Math.PI * (kind === 9 ? 3.6 : 1.85);
        pts.push(
          new T.Vector3(
            Math.sin(a) * 0.19,
            Math.cos(a) * 0.15 - 0.1,
            -t * 0.39,
          ),
        );
      }
    }
    if (kind === 1)
      pts.push(
        new T.Vector3(0.03, 0.03, -0.12),
        new T.Vector3(0.03, 0.13, -0.23),
      );
    if (kind >= 2 && kind !== 9)
      pts.push(
        new T.Vector3(0.1, 0.02, -0.23),
        new T.Vector3(0.32, -0.2, -0.42),
        new T.Vector3(0.53, -0.12, -0.47),
        new T.Vector3(0.59, 0.12, -0.47),
      );
    const tailLength = 0.85 + tr() * 0.3,
      tailBend = (tr() - 0.5) * 0.22;
    pts.forEach((p, i) => {
      const t = i / (pts.length - 1);
      p.multiplyScalar(tailLength);
      p.x += tailBend * t * t;
    });
    mesh(
      tail,
      sweep(
        pts,
        kind === 8 ? 0.18 : kind === 1 ? 0.085 : 0.071,
        32,
        10,
        kind === 1 ? 0.005 : 0.003,
      ),
      flesh,
      "tail",
    );
    if (kind >= 5 && kind <= 7) {
      const end = pts.at(-1)!;
      const fin = new T.SphereGeometry(1, 32, 24),
        p = fin.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i),
          taper = kind === 5 ? 0.7 + 0.3 * y : kind === 6 ? 1 + 0.4 * y : 1;
        p.setXYZ(
          i,
          p.getX(i) * 0.19 * taper,
          y * 0.28,
          p.getZ(i) * (kind === 7 ? 0.027 : 0.055),
        );
      }
      fin.computeVertexNormals();
      const tip = mesh(tail, fin, flesh, "tail-fin");
      tip.position.copy(end);
      tip.position.y += 0.15;
    }
    if (kind === 2) {
      const end = pts.at(-1)!;
      for (const s of [-1, 1])
        mesh(
          tail,
          sweep(
            [
              end,
              end.clone().add(new T.Vector3(s * 0.07, 0.1, 0)),
              end.clone().add(new T.Vector3(s * 0.02, 0.19, 0)),
            ],
            0.07,
            12,
            8,
          ),
          pink,
        );
    }
  }

  let opening = 0,
    previousTime = 0,
    lookX = 0,
    lookY = 0,
    gazeX = 0,
    gazeY = 0,
    attnX = 0,
    attnY = 0,
    attnW = 0,
    bodyYaw = 0,
    bodyPitch = 0;
  const animate: Creature["animate"] = (
    time,
    speech,
    pet,
    reduced,
    angularVelocity = 0,
  ) => {
    const dt = clamp(time - previousTime, 0, 0.06);
    previousTime = time;
    if (pet > 0.9 && lastPet <= 0.9) expression.trigger("pet");
    lastPet = pet;
    const pose = expression.update(
      dt,
      clamp((speech - 0.035) * 1.35, 0, 1),
      reduced,
    );
    const oldSmile = faceSmile,
      oldRound = faceRound;
    faceSmile = T.MathUtils.lerp(
      faceSmile,
      pose.smile,
      1 - Math.exp(-Math.max(dt, 1 / 60) * 12),
    );
    faceRound = pose.round;
    const rear = spring.update(dt, angularVelocity, reduced);
    headMesh.morphTargetInfluences![0] = faceSmile;
    headMesh.morphTargetInfluences![1] = rear;
    root.userData.rearOffset = rear;
    root.userData.reaction = expression.reaction;
    const target = pose.open;
    const next = T.MathUtils.lerp(
      opening,
      target,
      1 - Math.exp(-Math.max(dt, 1 / 60) * (target > opening ? 21 : 15)),
    );
    if (
      Math.abs(next - opening) > 0.0005 ||
      (target === 0 && opening !== 0) ||
      Math.abs(faceSmile - oldSmile) > 0.0001 ||
      Math.abs(faceRound - oldRound) > 0.001
    ) {
      opening = target === 0 && next < 0.002 ? 0 : next;
      updateMouth(opening);
    }
    coatTime.value = time;
    coatMotion.value = reduced ? 0 : 0.004 + pet * 0.012;
    const breath = reduced ? 0 : Math.sin(time * 1.65 + phase) * 0.008;
    const press = reduced ? 0 : pose.press;
    body.scale.set(
      1 - breath * 0.32 + press * 0.44,
      1 + breath - press,
      1 + breath * 0.7 + press * 0.5,
    );
    body.position.y = -1.245 - bottomY * body.scale.y + pose.hop;
    const yawTarget = attnX * attnW * 0.22;
    const pitchTarget = attnY * attnW * 0.14;
    bodyYaw = T.MathUtils.lerp(bodyYaw, yawTarget, 1 - Math.exp(-dt * 8));
    bodyPitch = T.MathUtils.lerp(bodyPitch, pitchTarget, 1 - Math.exp(-dt * 8));
    body.rotation.y = bodyYaw;
    body.rotation.x = bodyPitch;
    body.rotation.z = pose.roll;
    tail.rotation.y = reduced ? 0 : Math.sin(time * 1.2 + phase) * 0.025 + rear;
    tail.position.x = rear * 0.45;
    ears.forEach((ear, i) => {
      ear.rotation.z = reduced
        ? 0
        : Math.sin(time * 1.65 + phase - i * 0.5) * 0.007 +
          pet * (i === 0 ? -0.06 : 0.06);
    });
    gazeX = T.MathUtils.lerp(gazeX, lookX, 0.09);
    gazeY = T.MathUtils.lerp(gazeY, lookY, 0.09);
    eyeStates.forEach((e, i) => {
      if (!reduced && time >= e.next) {
        e.start = time;
        e.duration = 0.18 + e.random() * 0.14;
        e.next = time + 2.8 + e.random() * 5.4;
      }
      const progress = (time - e.start) / e.duration;
      const blink = reduced
        ? 0
        : progress >= 0 && progress < 1
          ? Math.sin(Math.PI * progress) ** 1.5
          : 0;
      if (
        Math.abs(blink - e.blink) > 0.001 ||
        Math.abs(faceSmile - oldSmile) > 0.0001
      ) {
        e.update(blink);
        e.blink = blink;
      }
      const socket = m.eyes[i];
      browGroups[i].rotation.z = faceSmile * (socket.x < 0 ? -0.12 : 0.12);
      browGroups[i].position.y =
        socket.y + socket.radius * 0.98 + Math.abs(faceSmile) * 0.025;
      const saccade = reduced
        ? 0
        : Math.sin(Math.floor(time * 0.63 + e.phase) * 2.31) * 0.017;
      e.iris.rotation.y = reduced ? 0 : gazeX * 0.14 + saccade;
      e.iris.rotation.x = reduced
        ? 0
        : -gazeY * 0.12 + Math.sin(time * 0.37 + e.phase) * 0.018;
      // Eye objects stay round and anchored while eyelids cover their surface.
      e.lid.userData.radius = socket.radius;
    });
    root.userData.mouthOpen = opening;
  };
  animate(0, 0, 0, true);
  return {
    root,
    animate,
    setMood(mood) {
      expression.mood = mood;
    },
    react(reaction) {
      expression.trigger(reaction);
    },
    look(x, y) {
      lookX = clamp(x, -1, 1);
      lookY = clamp(y, -1, 1);
    },
    attention(x, y, weight = 1) {
      attnX = clamp(x, -1, 1);
      attnY = clamp(y, -1, 1);
      attnW = clamp(weight, 0, 1);
      lookX = attnX;
      lookY = attnY;
    },
    dispose() {
      const geometries = new Set<T.BufferGeometry>(),
        materials = new Set<T.Material>();
      root.traverse((o) => {
        if (o instanceof T.Mesh) {
          geometries.add(o.geometry);
          for (const mat of Array.isArray(o.material)
            ? o.material
            : [o.material])
            materials.add(mat);
        }
      });
      geometries.add(sharedSphere);
      materials.add(coatMat);
      materials.add(skin);
      materials.add(flesh);
      materials.add(pink);
      materials.add(dark);
      materials.add(cavityMat);
      materials.add(toothMat);
      materials.add(sclera);
      materials.add(pupilMat);
      geometries.forEach((x) => x.dispose());
      materials.forEach((x) => x.dispose());
      grain.dispose();
    },
  };
}
