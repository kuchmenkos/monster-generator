import type { ShellApi } from "./shell";
import { icon, refreshIcons } from "./icons";
import { Stage } from "../stage";
import { Voice } from "../voice";
import { DemoPhraseDeck } from "../demo";
import { character, generate, type Genome } from "../genome";
import {
  type SaveV1,
  getActive,
  careAction,
  buyBoxWithHype,
  addCreature,
  startBattle,
  saveSave,
  displayName,
  setCreatureNeed,
  setCreatureRep,
} from "../game/state";
import { needsAt, type NeedKey } from "../game/care";
import { repTier, BOX_HYPE_COST, BOX_USD_STUB } from "../game/economy";
import { mountRadial, type RadialAction } from "../fx/radial";
import { playReveal } from "../fx/reveal";
import { mountCareFx } from "../fx/care-fx";
import { mountNeedsFx } from "../fx/needs-fx";
import { setRoute } from "./router";
import { putPreview, toWebpPreview } from "../game/store";
import { mountCollectionSheet } from "./collection-sheet";
import { crack } from "../fx/sfx";

export type AppCtx = {
  shell: ShellApi;
  getSave: () => SaveV1;
  setSave: (s: SaveV1) => void;
  voice: Voice;
};

export type Screen = {
  destroy: () => void;
};

const NEED_META: Record<
  NeedKey,
  { label: string; lucide: string; color: string }
> = {
  hunger: { label: "Еда", lucide: "Utensils", color: "#e8843a" },
  clean: { label: "Душ", lucide: "Droplets", color: "#3d9bb8" },
  mood: { label: "Вайб", lucide: "Smile", color: "#8b6bc9" },
};

function needRing(key: NeedKey, v: number) {
  const meta = NEED_META[key];
  const pct = Math.round(Math.max(0, Math.min(1, v)) * 100);
  return `<button type="button" class="need-ring" data-need="${key}" title="${meta.label}: ${pct}" style="--v:${v};--need:${meta.color}" aria-label="${meta.label} ${pct}">
    <svg class="need-meter" viewBox="0 0 44 44" aria-hidden="true">
      <circle class="track" cx="22" cy="22" r="18"/>
      <circle class="fill" cx="22" cy="22" r="18"/>
    </svg>
    <span class="need-ico">${icon(meta.lucide)}</span>
    <span class="need-val">${pct}</span>
  </button>`;
}

export function mountBase(ctx: AppCtx): Screen {
  const { shell, voice } = ctx;
  const root = document.createElement("section");
  root.className = "base-screen";
  root.innerHTML = `
    <div class="base-top">
      <div class="base-identity">
        <strong id="base-name">—</strong>
        <span class="rep-chip" id="base-rep">${icon("Trophy")} 0</span>
      </div>
      <div class="base-needs" id="base-needs" aria-label="Потребности"></div>
    </div>
    <div class="base-stage" id="base-stage"></div>
    <p class="base-hint" id="base-hint">Зажми <strong>1 сек</strong> — меню действий</p>
    <div class="base-empty" id="base-empty" hidden>
      <p>Пока тихо. Открой первый бокс — и кто-то вылупится.</p>
      <button class="generate-button" id="empty-box">${icon("Package")} Открыть бокс · ${BOX_HYPE_COST} хайпа</button>
      <p class="small-note">Или «${BOX_USD_STUB}$» — заглушка оплаты (прототип)</p>
    </div>`;
  shell.content.replaceChildren(root);
  refreshIcons();

  let stage: Stage | undefined;
  let radial: ReturnType<typeof mountRadial> | undefined;
  let careFx: ReturnType<typeof mountCareFx> | undefined;
  let needsFx: ReturnType<typeof mountNeedsFx> | undefined;
  let animVoice = 0;
  const demoDeck = new DemoPhraseDeck();
  const stageHost = root.querySelector("#base-stage") as HTMLElement;

  try {
    stage = new Stage(stageHost, { framing: { yOffset: -0.55 } });
  } catch {
    stageHost.innerHTML =
      '<div class="webgl-error"><strong>Не удалось запустить 3D</strong></div>';
  }

  const getAnchor = () => stage?.headScreenPoint() ?? null;

  careFx = mountCareFx({ host: root, getAnchor, stage });
  needsFx = mountNeedsFx({ host: root, getAnchor, stage });

  const collection = mountCollectionSheet({
    host: root,
    getSave: ctx.getSave,
    setSave: (s) => {
      ctx.setSave(s);
      saveSave(s);
    },
    onSelect: (c) => {
      void showCreature(c.genome);
      paint();
    },
    onBox: () => void openBox(),
    renderPreview: async (c) => {
      if (!stage) return null;
      try {
        return await stage.thumbnail(c.genome);
      } catch {
        return null;
      }
    },
  });

  const paint = () => {
    const save = ctx.getSave();
    shell.updateChrome(save);
    const active = getActive(save);
    const empty = root.querySelector("#base-empty") as HTMLElement;
    if (!active) {
      empty.hidden = false;
      root.querySelector("#base-hint")!.textContent = "";
      needsFx?.update({ hunger: 1, clean: 1, mood: 1 });
      return;
    }
    empty.hidden = true;
    root.querySelector("#base-name")!.textContent = displayName(active);
    const tier = repTier(active.rep);
    root.querySelector("#base-rep")!.innerHTML =
      `${icon("Trophy")} ${active.rep} · ${tier.label}`;
    const needs = needsAt(active.care);
    root.querySelector("#base-needs")!.innerHTML = [
      needRing("hunger", needs.hunger),
      needRing("clean", needs.clean),
      needRing("mood", needs.mood),
    ].join("");
    needsFx?.update(needs);
    refreshIcons();
    void collection.refresh(save);
  };

  const editNeed = (key: NeedKey) => {
    const save = ctx.getSave();
    const active = getActive(save);
    if (!active) return;
    const meta = NEED_META[key];
    const current = Math.round(needsAt(active.care)[key] * 100);
    const body = shell.modal(
      meta.label,
      `<div class="need-edit">
        <p class="small-note">Значение от 0 до 100.</p>
        <input type="number" id="need-input" min="0" max="100" step="1" value="${current}"/>
        <div class="need-edit-row">
          <button type="button" class="secondary-button" data-q="0">0</button>
          <button type="button" class="secondary-button" data-q="50">50</button>
          <button type="button" class="secondary-button" data-q="100">100</button>
        </div>
        <button type="button" class="generate-button" id="need-save">${icon("Check")} Поставить</button>
      </div>`,
    );
    refreshIcons();
    const input = body.querySelector("#need-input") as HTMLInputElement;
    body.querySelectorAll<HTMLButtonElement>("[data-q]").forEach((b) => {
      b.onclick = () => {
        input.value = b.dataset.q!;
      };
    });
    body.querySelector("#need-save")!.addEventListener("click", () => {
      const n = Math.max(0, Math.min(100, Number(input.value) || 0));
      const next = setCreatureNeed(ctx.getSave(), active.id, key, n / 100);
      ctx.setSave(next);
      saveSave(next);
      shell.closeModal();
      paint();
    });
  };

  const editRep = () => {
    const save = ctx.getSave();
    const active = getActive(save);
    if (!active) return;
    const body = shell.modal(
      "Репутация",
      `<div class="need-edit">
        <p class="small-note">Сколько очков репа у этой булалы.</p>
        <input type="number" id="rep-input" min="0" step="1" value="${active.rep}"/>
        <button type="button" class="generate-button" id="rep-save">${icon("Check")} Поставить</button>
      </div>`,
    );
    refreshIcons();
    body.querySelector("#rep-save")!.addEventListener("click", () => {
      const n = Math.max(
        0,
        Math.floor(
          Number((body.querySelector("#rep-input") as HTMLInputElement).value) ||
            0,
        ),
      );
      const next = setCreatureRep(ctx.getSave(), active.id, n);
      ctx.setSave(next);
      saveSave(next);
      shell.closeModal();
      paint();
    });
  };

  root.querySelector("#base-needs")!.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-need]",
    );
    if (!btn?.dataset.need) return;
    editNeed(btn.dataset.need as NeedKey);
  });
  root.querySelector("#base-rep")!.addEventListener("click", editRep);

  const showCreature = async (genome: Genome) => {
    if (!stage) return;
    stageHost.classList.add("crossfade");
    await stage.setGenome(genome);
    stageHost.classList.remove("crossfade");
  };

  const syncCreature = () => {
    const active = getActive(ctx.getSave());
    if (active) void showCreature(active.genome);
    paint();
  };

  const openBox = async () => {
    const paid = buyBoxWithHype(ctx.getSave());
    if (paid.error) {
      shell.toast(paid.error);
      shell.modal(
        "Бокс Булалы",
        `<p>Бокс стоит <strong>${BOX_HYPE_COST} хайпа</strong> или <strong>${BOX_USD_STUB}$</strong>.</p>
         <p class="small-note">Оплата картой — заглушка прототипа. Заработай хайп батлами, голосами и уходом.</p>
         <p>Сейчас у тебя: <strong>${Math.floor(ctx.getSave().hype)}</strong> хайпа.</p>`,
      );
      return;
    }
    ctx.setSave(paid.save);
    shell.updateChrome(paid.save);
    if (!stage) return;

    const result = await playReveal({
      host: root,
      createGenome: () => generate(),
      onGenome: (g) => {
        void stage!.setGenome(g);
      },
      waitReady: () =>
        new Promise((resolve) => {
          const check = () => {
            if (stageHost.getAttribute("aria-busy") !== "true") resolve();
            else requestAnimationFrame(check);
          };
          check();
        }),
    });

    crack();
    stage.react("shout");
    let image = "";
    try {
      stage.snapshot();
      image = stage.renderer.domElement.toDataURL("image/png");
      const blob = await toWebpPreview(image);
      const added = addCreature(ctx.getSave(), result.genome, image);
      if (added.error) {
        shell.toast(added.error);
        return;
      }
      await putPreview(added.creature.id, blob);
      ctx.setSave(added.save);
      saveSave(added.save);
      paint();
      shell.toast(`${character(result.genome).name} теперь живёт у тебя.`);
      try {
        await voice.speak(
          `Привет! Я ${character(result.genome).name}. Не смотри на зубы — лучше на булочки.`,
          result.genome,
          "demo",
          "",
        );
      } catch {
        /* demo voice optional */
      }
    } catch {
      const added = addCreature(ctx.getSave(), result.genome);
      ctx.setSave(added.save);
      saveSave(added.save);
      paint();
    }
  };

  shell.onBox = () => void openBox();
  root.querySelector("#empty-box")?.addEventListener("click", () => void openBox());

  const onAction = async (action: RadialAction) => {
    const save = ctx.getSave();
    const active = getActive(save);
    if (!active) {
      shell.toast("Сначала открой бокс.");
      return;
    }
    if (action === "workshop") {
      setRoute("workshop");
      return;
    }
    if (action === "battle") {
      const result = startBattle(save, active.id);
      if (result.error || !result.battle) {
        shell.toast(result.error || "Не удалось начать батл.");
        return;
      }
      ctx.setSave(result.save);
      saveSave(result.save);
      shell.toast("Батл записан. Иди голосовать во вкладке Батлы.");
      setRoute("battles");
      return;
    }
    if (action === "pet") {
      await careFx?.pet();
      return;
    }
    const map = { feed: "feed", wash: "wash", talk: "talk" } as const;
    if (action === "feed" || action === "wash" || action === "talk") {
      const next = careAction(save, active.id, map[action]);
      ctx.setSave(next);
      saveSave(next);
      if (action === "feed") {
        await careFx?.feed();
        shell.toast("Нам-нам. Энергия подросла.");
      } else if (action === "wash") {
        await careFx?.wash();
        shell.toast("Чистый и слегка недовольный.");
      } else {
        stage?.react("smile");
        const phrase = demoDeck.next("Я не странный. Я коллекционный!");
        try {
          await voice.speak(phrase, active.genome, "demo", active.voiceId || "");
        } catch (e) {
          shell.toast(e instanceof Error ? e.message : "Не удалось сказать.");
        }
      }
      paint();
    }
  };

  if (stage) {
    const dockEl = root.querySelector(".col-dock") as HTMLElement | null;
    const measureInset = () =>
      Math.max(96, Math.ceil((dockEl?.getBoundingClientRect().height ?? 92) + 12));
    radial = mountRadial({
      host: root,
      target: stageHost,
      getAnchor,
      bottomInset: measureInset,
      onAction,
      onAttention: (x, y, w) => stage?.attention(x, y, w),
      onOpen: () => stage?.setOrbitEnabled(false),
      onClose: () => {
        stage?.setOrbitEnabled(true);
        stage?.attention(0, 0, 0);
      },
    });
  }

  const tickVoice = () => {
    if (stage) stage.speech = voice.level();
    animVoice = requestAnimationFrame(tickVoice);
  };
  tickVoice();

  syncCreature();

  return {
    destroy() {
      cancelAnimationFrame(animVoice);
      radial?.destroy();
      careFx?.destroy();
      needsFx?.destroy();
      collection.destroy();
      voice.stop();
      stage?.dispose();
      shell.onBox = null;
    },
  };
}
