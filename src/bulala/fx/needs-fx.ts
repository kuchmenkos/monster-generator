import type { HeadScreen } from "../stage";
import type { Stage } from "../stage";
import type { Needs } from "../game/care";
import { needsFxFrom } from "./needs-map";

type NeedsFxOpts = {
  host: HTMLElement;
  getAnchor: () => HeadScreen | null;
  stage?: Stage;
};

export type NeedsFx = {
  update: (needs: Needs) => void;
  destroy: () => void;
};

export function mountNeedsFx(opts: NeedsFxOpts): NeedsFx {
  const layer = document.createElement("div");
  layer.className = "needs-fx";
  opts.host.append(layer);
  let timer = 0;
  let flies: HTMLElement[] = [];
  let lastStink = 0;

  const clearFlies = () => {
    flies.forEach((f) => f.remove());
    flies = [];
  };

  const layout = (count: number) => {
    const a = opts.getAnchor() ?? {
      x: opts.host.clientWidth / 2,
      y: opts.host.clientHeight * 0.4,
      r: 60,
    };
    while (flies.length < count) {
      const f = document.createElement("span");
      f.className = "needs-fly";
      f.style.setProperty("--orbit", `${a.r * (0.9 + Math.random() * 0.4)}px`);
      f.style.setProperty("--dur", `${2.2 + Math.random()}s`);
      f.style.setProperty("--delay", `${Math.random()}s`);
      layer.append(f);
      flies.push(f);
    }
    while (flies.length > count) flies.pop()?.remove();
    flies.forEach((f) => {
      f.style.left = `${a.x}px`;
      f.style.top = `${a.y}px`;
    });
    const dirt = layer.querySelector(".needs-dirt") as HTMLElement | null;
    if (dirt) {
      dirt.style.left = `${a.x}px`;
      dirt.style.top = `${a.y}px`;
      dirt.style.width = `${a.r * 2.2}px`;
      dirt.style.height = `${a.r * 2.2}px`;
    }
  };

  return {
    update(needs) {
      const state = needsFxFrom(needs);
      let dirt = layer.querySelector(".needs-dirt") as HTMLElement | null;
      if (state.dirty > 0.2) {
        if (!dirt) {
          dirt = document.createElement("div");
          dirt.className = "needs-dirt";
          layer.append(dirt);
        }
        dirt.style.opacity = String(0.15 + state.dirty * 0.55);
      } else {
        dirt?.remove();
      }
      layout(state.flies);

      const canvas = opts.host.querySelector("canvas");
      if (canvas) {
        (canvas as HTMLElement).style.filter = state.canvasFilter || "";
      }

      if (state.stink && performance.now() - lastStink > 2500) {
        lastStink = performance.now();
        const a = opts.getAnchor();
        if (a) {
          for (let i = 0; i < 3; i++) {
            const s = document.createElement("span");
            s.className = "needs-stink";
            s.textContent = "~";
            s.style.left = `${a.x + (i - 1) * 14}px`;
            s.style.top = `${a.y - a.r * 0.6}px`;
            s.style.setProperty("--delay", `${i * 120}ms`);
            layer.append(s);
            setTimeout(() => s.remove(), 1600);
          }
        }
      }

      let hunger = layer.querySelector(".needs-hunger") as HTMLElement | null;
      if (state.hungry) {
        if (!hunger) {
          hunger = document.createElement("div");
          hunger.className = "needs-hunger";
          hunger.textContent = "…";
          layer.append(hunger);
        }
        const a = opts.getAnchor();
        if (a) {
          hunger.style.left = `${a.x + a.r * 0.7}px`;
          hunger.style.top = `${a.y - a.r * 0.3}px`;
        }
      } else hunger?.remove();

      let glow = layer.querySelector(".needs-glow") as HTMLElement | null;
      if (state.happy) {
        if (!glow) {
          glow = document.createElement("div");
          glow.className = "needs-glow";
          layer.append(glow);
        }
        const a = opts.getAnchor();
        if (a) {
          glow.style.left = `${a.x}px`;
          glow.style.top = `${a.y}px`;
          glow.style.width = `${a.r * 3}px`;
          glow.style.height = `${a.r * 3}px`;
        }
        opts.stage?.setMood("happy");
      } else {
        glow?.remove();
        opts.stage?.setMood(state.sad ? "sad" : "neutral");
      }

      clearInterval(timer);
      timer = window.setInterval(() => layout(state.flies), 500);
    },

    destroy() {
      clearInterval(timer);
      clearFlies();
      layer.remove();
    },
  };
}
