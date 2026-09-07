import { rarity, character, type Genome } from "../genome";
import { crack, pop, whoosh } from "./sfx";

export type RevealResult = {
  genome: Genome;
  cancelled: boolean;
};

type RevealOpts = {
  host: HTMLElement;
  onGenome: (genome: Genome) => void;
  waitReady: () => Promise<void>;
  createGenome: () => Genome;
  reduced?: boolean;
};

const GREETS = [
  "Йо.",
  "Это я.",
  "Не смотри так.",
  "Вау.",
  "Ну привет.",
];

/**
 * Capsule hatch ceremony. Masks worker build latency behind float + taps.
 */
export async function playReveal(opts: RevealOpts): Promise<RevealResult> {
  const reduced =
    opts.reduced ?? matchMedia("(prefers-reduced-motion: reduce)").matches;
  const genome = opts.createGenome();
  const rr = rarity(genome);
  const name = character(genome).name;
  const greet = GREETS[Math.floor(Math.random() * GREETS.length)];

  const root = document.createElement("div");
  root.className = `reveal-root ${reduced ? "reduced" : ""}`;
  root.innerHTML = `
    <div class="reveal-veil"></div>
    <div class="reveal-stage">
      <div class="reveal-halo" data-tier="${rr.tier}"></div>
      <div class="reveal-capsule" data-cracks="0" tabindex="0" role="button" aria-label="Постучи по капсуле">
        <div class="reveal-egg">
          <svg class="reveal-cracks" viewBox="0 0 100 130" aria-hidden="true">
            <path class="c1" d="M48 18 C46 40 52 55 44 72"/>
            <path class="c2" d="M62 28 C58 48 70 60 64 88"/>
            <path class="c3" d="M40 55 C50 70 42 90 48 108"/>
          </svg>
          <div class="reveal-glow"></div>
        </div>
      </div>
      <p class="reveal-hint">Постучи · <span id="reveal-taps">0</span>/3</p>
      <div class="reveal-burst" hidden></div>
      <div class="reveal-shock" hidden></div>
      <div class="reveal-badge" hidden>
        <em class="reveal-greet">${greet}</em>
        <strong id="reveal-name"></strong>
        <span id="reveal-tier" style="--rarity:${rr.color}"></span>
      </div>
    </div>`;
  opts.host.append(root);
  opts.onGenome(genome);

  const capsule = root.querySelector(".reveal-capsule") as HTMLElement;
  const hint = root.querySelector(".reveal-hint") as HTMLElement;
  const tapsEl = root.querySelector("#reveal-taps")!;
  const burst = root.querySelector(".reveal-burst") as HTMLElement;
  const shock = root.querySelector(".reveal-shock") as HTMLElement;
  const badge = root.querySelector(".reveal-badge") as HTMLElement;

  const minShake = reduced ? 300 : 2200;
  const started = performance.now();
  capsule.classList.add("floating");

  let taps = 0;
  await new Promise<void>((resolve) => {
    const onTap = () => {
      taps++;
      tapsEl.textContent = String(taps);
      capsule.dataset.cracks = String(Math.min(3, taps));
      capsule.classList.add("squash");
      crack();
      setTimeout(() => capsule.classList.remove("squash"), 180);
      try {
        navigator.vibrate?.(taps === 3 ? [30, 40, 60] : 18);
      } catch {
        /* ignore */
      }
      if (taps >= 3) {
        capsule.removeEventListener("pointerdown", onTap);
        resolve();
      }
    };
    capsule.addEventListener("pointerdown", onTap);
    capsule.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onTap();
      }
    });
  });

  hint.textContent = "Кто-то там шевелится…";
  const ready = opts.waitReady();
  const waitMin = new Promise<void>((r) =>
    setTimeout(r, Math.max(0, minShake - (performance.now() - started))),
  );
  await Promise.all([ready, waitMin]);

  capsule.classList.remove("floating");
  capsule.classList.add("burst");
  burst.hidden = false;
  shock.hidden = false;
  whoosh();
  pop();

  if (!reduced) {
    for (let i = 0; i < 36; i++) {
      const shard = document.createElement("span");
      shard.className = "reveal-shard";
      const angle = (i / 36) * Math.PI * 2;
      const dist = 70 + Math.random() * 150;
      shard.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
      shard.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
      shard.style.setProperty("--rot", `${Math.random() * 720}deg`);
      shard.style.background =
        i % 3 === 0 ? rr.color : i % 3 === 1 ? "#fff" : "#312d29";
      burst.append(shard);
    }
    if (rr.tier === "Эпический" || rr.tier === "Легендарный") {
      for (let i = 0; i < 20; i++) {
        const c = document.createElement("span");
        c.className = "reveal-confetti";
        c.style.setProperty("--dx", `${(Math.random() - 0.5) * 300}px`);
        c.style.setProperty("--dy", `${-60 - Math.random() * 160}px`);
        c.style.background = ["#ee784e", "#8f69b0", "#b5842a", "#568568"][
          i % 4
        ];
        burst.append(c);
      }
    }
  }

  await new Promise((r) => setTimeout(r, reduced ? 180 : 650));
  capsule.hidden = true;
  hint.hidden = true;
  badge.hidden = false;
  badge.classList.add("pop");

  const nameEl = badge.querySelector("#reveal-name") as HTMLElement;
  nameEl.innerHTML = [...name]
    .map(
      (ch, i) =>
        `<i style="--i:${i}">${ch === " " ? "&nbsp;" : ch}</i>`,
    )
    .join("");
  (badge.querySelector("#reveal-tier") as HTMLElement).textContent = rr.tier;

  await new Promise((r) => setTimeout(r, reduced ? 500 : 2000));
  root.classList.add("fade-out");
  await new Promise((r) => setTimeout(r, 300));
  root.remove();
  return { genome, cancelled: false };
}
