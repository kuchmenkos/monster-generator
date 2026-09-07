import type { HeadScreen } from "../stage";
import type { Stage } from "../stage";
import { bubble, heart, pop, whoosh } from "./sfx";

type CareFxOpts = {
  host: HTMLElement;
  getAnchor: () => HeadScreen | null;
  stage?: Stage;
};

const PET_VARIANTS = ["hearts", "nuzzle", "spark"] as const;
type PetVariant = (typeof PET_VARIANTS)[number];

export type CareFx = {
  pet: () => Promise<void>;
  wash: () => Promise<void>;
  feed: () => Promise<void>;
  destroy: () => void;
};

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export function mountCareFx(opts: CareFxOpts): CareFx {
  const layer = document.createElement("div");
  layer.className = "care-fx";
  opts.host.append(layer);
  const deck = [...PET_VARIANTS];
  let lastPet: PetVariant | null = null;

  const nextPet = (): PetVariant => {
    if (deck.length === 0) deck.push(...PET_VARIANTS.filter((v) => v !== lastPet));
    const i = Math.floor(Math.random() * deck.length);
    const v = deck.splice(i, 1)[0];
    lastPet = v;
    return v;
  };

  const at = () => opts.getAnchor() ?? { x: opts.host.clientWidth / 2, y: opts.host.clientHeight * 0.38, r: 60 };

  return {
    async pet() {
      const a = at();
      const v = nextPet();
      heart();
      if (v === "hearts") {
        opts.stage?.react("pet");
        for (let i = 0; i < 6; i++) {
          const el = document.createElement("span");
          el.className = "care-heart";
          el.textContent = "♥";
          el.style.left = `${a.x + (Math.random() - 0.5) * a.r}px`;
          el.style.top = `${a.y}px`;
          el.style.setProperty("--dx", `${(Math.random() - 0.5) * 40}px`);
          el.style.setProperty("--delay", `${i * 60}ms`);
          layer.append(el);
          setTimeout(() => el.remove(), 1200);
        }
        await sleep(900);
      } else if (v === "nuzzle") {
        opts.stage?.react("pet");
        const el = document.createElement("div");
        el.className = "care-nuzzle";
        el.style.left = `${a.x}px`;
        el.style.top = `${a.y}px`;
        layer.append(el);
        await sleep(1100);
        el.remove();
      } else {
        opts.stage?.react("pet");
        for (let i = 0; i < 10; i++) {
          const s = document.createElement("span");
          s.className = "care-spark";
          s.style.left = `${a.x}px`;
          s.style.top = `${a.y}px`;
          s.style.setProperty("--dx", `${(Math.random() - 0.5) * 100}px`);
          s.style.setProperty("--dy", `${-20 - Math.random() * 80}px`);
          layer.append(s);
          setTimeout(() => s.remove(), 900);
        }
        pop();
        await sleep(900);
      }
    },

    async wash() {
      const a = at();
      whoosh();
      opts.stage?.react("shiver");
      const shower = document.createElement("div");
      shower.className = "care-shower";
      shower.style.left = `${a.x}px`;
      shower.style.top = `${Math.max(12, a.y - a.r - 40)}px`;
      layer.append(shower);
      const foam = document.createElement("div");
      foam.className = "care-foam";
      foam.style.left = `${a.x}px`;
      foam.style.top = `${a.y - a.r * 0.2}px`;
      layer.append(foam);
      const canvas = opts.host.querySelector("canvas");
      if (canvas) canvas.classList.add("washing");
      for (let i = 0; i < 14; i++) {
        setTimeout(() => {
          bubble();
          const d = document.createElement("span");
          d.className = "care-drop";
          d.style.left = `${a.x + (Math.random() - 0.5) * a.r * 1.4}px`;
          d.style.top = `${a.y - a.r * 0.6}px`;
          layer.append(d);
          setTimeout(() => d.remove(), 700);
        }, i * 120);
      }
      await sleep(2200);
      shower.remove();
      foam.classList.add("pop");
      pop();
      await sleep(400);
      foam.remove();
      if (canvas) canvas.classList.remove("washing");
      opts.stage?.react("smile");
    },

    async feed() {
      const a = at();
      const snack = document.createElement("div");
      snack.className = "care-snack";
      snack.textContent = "🍩";
      snack.style.left = `${a.x}px`;
      snack.style.top = `${a.y - a.r - 80}px`;
      snack.style.setProperty("--to", `${a.y + 8}px`);
      layer.append(snack);
      whoosh();
      await sleep(500);
      snack.remove();
      opts.stage?.react("chew");
      for (let i = 0; i < 5; i++) {
        const c = document.createElement("span");
        c.className = "care-crumb";
        c.style.left = `${a.x}px`;
        c.style.top = `${a.y + 10}px`;
        c.style.setProperty("--dx", `${(Math.random() - 0.5) * 60}px`);
        layer.append(c);
        setTimeout(() => c.remove(), 700);
      }
      await sleep(1600);
      opts.stage?.react("smile");
      pop();
    },

    destroy() {
      layer.remove();
    },
  };
}
