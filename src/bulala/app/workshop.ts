import type { AppCtx, Screen } from "./base";
import { icon, refreshIcons } from "./icons";
import { Stage } from "../stage";
import {
  catalogs,
  character,
  rarity,
  encode,
  decode,
  generate,
  signature,
  palettes,
  traitKeys,
  type Genome,
  type Trait,
} from "../genome";
import {
  getActive,
  updateCreatureGenome,
  saveSave,
  displayName,
} from "../game/state";
import { DemoPhraseDeck } from "../demo";
import { mountSheet } from "./sheet";

const GROUPS: { id: string; label: string; traits: Trait[] }[] = [
  { id: "shape", label: "Форма", traits: ["shape"] },
  { id: "eyes", label: "Глаза", traits: ["eyes", "eyeCut", "pupil", "brows"] },
  { id: "nose", label: "Нос", traits: ["nose"] },
  { id: "mouth", label: "Рот", traits: ["mouth", "teeth", "chin"] },
  { id: "ears", label: "Уши", traits: ["ears"] },
  { id: "horns", label: "Рожки", traits: ["horns"] },
  { id: "skin", label: "Покрытие", traits: ["skin", "finish"] },
  { id: "hair", label: "Причёска", traits: ["hair"] },
  { id: "whiskers", label: "Усы", traits: ["whiskers"] },
  { id: "booty", label: "Булочки", traits: ["booty"] },
  { id: "tail", label: "Хвост", traits: ["tail"] },
  { id: "color", label: "Цвет", traits: ["palette", "pattern"] },
];

export function mountWorkshop(ctx: AppCtx): Screen {
  const { shell, voice } = ctx;
  const save = ctx.getSave();
  const active = getActive(save);

  const root = document.createElement("section");
  root.className = "workshop-screen";
  root.innerHTML = `
    <div class="workshop-stage" id="ws-stage"></div>
    <div class="workshop-chrome">
      <span class="live-label"><span></span> МАСТЕРСКАЯ</span>
      <div class="viewer-actions">
        <button class="icon-button" id="ws-auto" aria-pressed="false" title="Автоповорот">${icon("Rotate3d")}</button>
        <button class="icon-button" id="ws-more" title="ДНК и голос">${icon("MoreHorizontal")}</button>
      </div>
    </div>
    <div class="view-picker workshop-views" aria-label="Ракурс">
      <button data-view="front" class="selected">Мордашка</button>
      <button data-view="side">Бочок</button>
      <button data-view="back">Булочки ${icon("Heart")}</button>
    </div>`;
  shell.content.replaceChildren(root);
  refreshIcons();

  let genome: Genome = active
    ? structuredClone(active.genome)
    : generate("workshop-sandbox");
  let baseline = structuredClone(genome);
  let custom = false;
  let groupId = GROUPS[0].id;
  let trait: Trait = GROUPS[0].traits[0];
  const locks = new Set<Trait>();
  const sandbox = !active;
  let previewTimer = 0;
  let previewGene: number | null = null;

  let stage: Stage | undefined;
  const stageHost = root.querySelector("#ws-stage") as HTMLElement;
  try {
    stage = new Stage(stageHost, { framing: { yOffset: -0.45 } });
    void stage.setGenome(genome);
  } catch {
    stageHost.innerHTML = '<div class="webgl-error">WebGL недоступен</div>';
  }

  const sheet = mountSheet({
    host: root,
    title: character(genome).name,
    peekPx: 148,
    persistent: true,
    onSnap(snap) {
      root.classList.toggle("sheet-full", snap === "full");
      root.style.setProperty("--peek", snap === "full" ? "0px" : "148px");
    },
  });
  root.classList.toggle("sheet-full", sheet.getSnap() === "full");

  const paintMeta = () => {
    const c = character(genome);
    const rr = rarity(genome);
    sheet.setTitle(c.name);
    const note = sandbox
      ? `<p class="small-note">Песочница · правки не в коллекцию</p>`
      : `<p class="small-note">${c.nature}</p>`;
    // meta lives in sheet body header area via paintAll
    void note;
    void rr;
    void custom;
  };

  const paintChips = () => {
    const el = sheet.body.querySelector("#trait-chips");
    if (!el) return;
    el.innerHTML = GROUPS.map(
      (g) =>
        `<button type="button" role="tab" class="trait-chip ${g.id === groupId ? "active" : ""} ${g.traits.some((t) => locks.has(t)) ? "pinned" : ""}" data-group="${g.id}">${g.label}</button>`,
    ).join("");
  };

  const paintSubTraits = () => {
    const el = sheet.body.querySelector("#sub-traits");
    if (!el) return;
    const group = GROUPS.find((g) => g.id === groupId)!;
    if (!group.traits.includes(trait)) trait = group.traits[0];
    if (group.traits.length <= 1) {
      el.innerHTML = "";
      (el as HTMLElement).hidden = true;
      return;
    }
    (el as HTMLElement).hidden = false;
    el.innerHTML = group.traits
      .map(
        (t) =>
          `<button type="button" class="sub-trait ${t === trait ? "active" : ""}" data-trait="${t}">${traitLabel(t)}</button>`,
      )
      .join("");
  };

  const paintStrip = () => {
    const strip = sheet.body.querySelector("#variant-strip");
    if (!strip) return;
    if (trait === "palette") {
      strip.innerHTML = palettes
        .map(
          (p, i) =>
            `<button type="button" class="swatch ${i === genome.genes.palette ? "selected" : ""}" data-value="${i}" style="--swatch:${p[0]}" title="${catalogs.palette[i].label}"></button>`,
        )
        .join("");
      strip.className = "variant-strip swatches-row";
    } else {
      strip.className = "variant-strip";
      strip.innerHTML = catalogs[trait]
        .map(
          (v, i) =>
            `<button type="button" class="variant-pill ${genome.genes[trait] === i ? "selected" : ""}" data-value="${i}">${v.label}</button>`,
        )
        .join("");
    }
    const selected = strip.querySelector(".selected, .variant-pill.selected");
    selected?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  };

  const paintBody = () => {
    const c = character(genome);
    const rr = rarity(genome);
    sheet.setBody(`
      <div class="ws-meta">
        <div class="name-row">
          <h2>${c.name}</h2>
          <span class="rarity-badge" style="--rarity:${rr.color}">${custom ? "Твоя версия" : rr.tier}</span>
        </div>
        ${sandbox ? `<p class="small-note">Песочница: не сохраняется в коллекцию</p>` : `<p class="small-note">${c.nature}</p>`}
      </div>
      <div class="trait-chips" id="trait-chips" role="tablist"></div>
      <div class="sub-traits" id="sub-traits"></div>
      <div class="variant-strip-wrap">
        <button type="button" class="strip-nav" id="strip-prev" aria-label="Назад">${icon("ChevronLeft")}</button>
        <div class="variant-strip" id="variant-strip"></div>
        <button type="button" class="strip-nav" id="strip-next" aria-label="Дальше">${icon("ChevronRight")}</button>
      </div>
      <div class="workshop-footer">
        <div class="chaos-label"><label for="ws-chaos">Странность</label><output id="ws-chaos-value">${genome.chaos}%</output></div>
        <input id="ws-chaos" type="range" min="0" max="100" value="${genome.chaos}"/>
        <div class="workshop-tools">
          <button type="button" class="secondary-button" id="ws-random-trait" aria-label="Случайно в категории" title="Случайно">${icon("Dices")}<span class="ws-tool-label">Случайно</span></button>
          <button type="button" class="secondary-button" id="ws-reset" aria-label="Сбросить ДНК" title="Сброс">${icon("Undo2")}<span class="ws-tool-label">Сброс</span></button>
          <button type="button" class="generate-button" id="ws-apply" ${sandbox ? "hidden" : ""}>${icon("Check")} Сохранить</button>
        </div>
      </div>`);
    refreshIcons();
    paintChips();
    paintSubTraits();
    paintStrip();
    wireSheetControls();
  };

  const applyGenome = (g: Genome, reset = false) => {
    voice.stop();
    genome = structuredClone(g);
    if (reset) {
      baseline = structuredClone(genome);
      custom = false;
    } else custom = true;
    void stage?.setGenome(genome);
    paintMeta();
    // Update meta bits without full body rebuild when possible
    const nameH = sheet.body.querySelector(".name-row h2");
    if (nameH) nameH.textContent = character(genome).name;
    sheet.setTitle(character(genome).name);
    const badge = sheet.body.querySelector(".rarity-badge") as HTMLElement | null;
    if (badge) {
      const rr = rarity(genome);
      badge.textContent = custom ? "Твоя версия" : rr.tier;
      badge.style.setProperty("--rarity", rr.color);
    }
    paintStrip();
  };

  const stepVariant = (dir: 1 | -1) => {
    const len =
      trait === "palette" ? palettes.length : catalogs[trait].length;
    const cur = genome.genes[trait];
    genome.genes[trait] = (cur + dir + len) % len;
    applyGenome(genome);
  };

  function wireSheetControls() {
    sheet.body.querySelector("#trait-chips")?.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
        "[data-group]",
      );
      if (!btn) return;
      groupId = btn.dataset.group!;
      trait = GROUPS.find((g) => g.id === groupId)!.traits[0];
      paintChips();
      paintSubTraits();
      paintStrip();
    });

    sheet.body.querySelector("#sub-traits")?.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
        "[data-trait]",
      );
      if (!btn) return;
      trait = btn.dataset.trait as Trait;
      paintSubTraits();
      paintStrip();
    });

    const strip = sheet.body.querySelector("#variant-strip");
    strip?.addEventListener("click", (e) => {
      const pill = (e.target as HTMLElement).closest<HTMLButtonElement>(
        "[data-value]",
      );
      if (!pill) return;
      clearTimeout(previewTimer);
      previewGene = null;
      genome.genes[trait] = Number(pill.dataset.value);
      applyGenome(genome);
    });
    strip?.addEventListener("pointerover", (e) => {
      const pill = (e.target as HTMLElement).closest<HTMLButtonElement>(
        "[data-value]",
      );
      if (!pill) return;
      const value = Number(pill.dataset.value);
      clearTimeout(previewTimer);
      previewTimer = window.setTimeout(() => {
        if (previewGene === value) return;
        previewGene = value;
        const g = structuredClone(genome);
        g.genes[trait] = value;
        void stage?.setGenome(g);
      }, 120);
    });
    strip?.addEventListener("pointerleave", () => {
      clearTimeout(previewTimer);
      if (previewGene != null) {
        previewGene = null;
        void stage?.setGenome(genome);
      }
    });

    sheet.body
      .querySelector("#strip-prev")
      ?.addEventListener("click", () => stepVariant(-1));
    sheet.body
      .querySelector("#strip-next")
      ?.addEventListener("click", () => stepVariant(1));

    sheet.body
      .querySelector("#ws-random-trait")
      ?.addEventListener("click", () => {
        genome.genes[trait] = Math.floor(
          Math.random() * catalogs[trait].length,
        );
        applyGenome(genome);
      });
    sheet.body.querySelector("#ws-reset")?.addEventListener("click", () => {
      applyGenome(baseline, true);
      shell.toast("Исходная ДНК восстановлена.");
    });
    sheet.body.querySelector("#ws-apply")?.addEventListener("click", () => {
      const current = getActive(ctx.getSave());
      if (!current) return;
      const next = updateCreatureGenome(ctx.getSave(), current.id, genome);
      ctx.setSave(next);
      saveSave(next);
      baseline = structuredClone(genome);
      custom = false;
      paintMeta();
      shell.toast(`${displayName(getActive(next)!)} обновлён.`);
    });
    const chaos = sheet.body.querySelector("#ws-chaos") as HTMLInputElement | null;
    chaos?.addEventListener("input", () => {
      const out = sheet.body.querySelector("#ws-chaos-value");
      if (out) out.textContent = chaos.value + "%";
    });
    chaos?.addEventListener("change", () => {
      genome.chaos = Number(chaos.value);
      applyGenome(genome);
    });
  }

  paintBody();

  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      stepVariant(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      stepVariant(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const i = GROUPS.findIndex((g) => g.id === groupId);
      groupId = GROUPS[(i - 1 + GROUPS.length) % GROUPS.length].id;
      trait = GROUPS.find((g) => g.id === groupId)!.traits[0];
      paintChips();
      paintSubTraits();
      paintStrip();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const i = GROUPS.findIndex((g) => g.id === groupId);
      groupId = GROUPS[(i + 1) % GROUPS.length].id;
      trait = GROUPS.find((g) => g.id === groupId)!.traits[0];
      paintChips();
      paintSubTraits();
      paintStrip();
    }
  };
  window.addEventListener("keydown", onKey);

  root.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((b) => {
    b.onclick = () => {
      stage?.view(b.dataset.view as "front" | "back" | "side");
      root
        .querySelectorAll("[data-view]")
        .forEach((n) => n.classList.toggle("selected", n === b));
    };
  });

  root.querySelector("#ws-auto")!.addEventListener("click", () => {
    if (!stage) return;
    stage.auto = !stage.auto;
    (root.querySelector("#ws-auto") as HTMLElement).setAttribute(
      "aria-pressed",
      String(stage.auto),
    );
  });

  const demoDeck = new DemoPhraseDeck();
  root.querySelector("#ws-more")!.addEventListener("click", () => {
    const body = shell.modal(
      "ДНК и голос",
      `<label>Ссылка</label><textarea id="dna-link" readonly rows="2"></textarea>
       <button id="copy-link" class="secondary-button">${icon("Copy")} Копировать</button>
       <hr/>
       <label>Песочница · seed</label>
       <div class="inline-form"><input id="dna-input" maxlength="40" placeholder="my-little-monster"/><button id="load-seed" class="secondary-button">Создать</button></div>
       <p class="small-note">Песочница не пишет в коллекцию. Новые булалы — только из бокса.</p>
       <hr/>
       <label>Озвучка</label>
       <select id="ws-provider"><option value="demo">Демо</option><option value="elevenlabs">ElevenLabs</option></select>
       <textarea id="ws-speech" rows="2" maxlength="500">Я не странный. Я коллекционный!</textarea>
       <button id="ws-speak" class="generate-button">${icon("Play")} Дать слово</button>
       <p id="ws-voice-status" class="small-note"></p>`,
    );
    refreshIcons();
    const link = encodeURIComponent(encode(genome));
    const url = `${location.origin}${location.pathname}?dna=${link}#/workshop`;
    (body.querySelector("#dna-link") as HTMLTextAreaElement).value = url;
    body.querySelector("#copy-link")!.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(url);
        shell.toast("Ссылка скопирована.");
      } catch {
        shell.toast("Скопируй вручную.");
      }
    });
    body.querySelector("#load-seed")!.addEventListener("click", () => {
      const value = (
        body.querySelector("#dna-input") as HTMLInputElement
      ).value.trim();
      if (!/^[a-zA-Z0-9-]{1,40}$/.test(value)) {
        shell.toast("Латиница, цифры или дефис.");
        return;
      }
      applyGenome(generate(value), true);
      shell.closeModal();
    });
    body.querySelector("#ws-speak")!.addEventListener("click", async () => {
      const text = (body.querySelector("#ws-speech") as HTMLTextAreaElement)
        .value;
      const provider = (
        body.querySelector("#ws-provider") as HTMLSelectElement
      ).value;
      localStorage.setItem("bulala-tts-provider", provider);
      try {
        const speech = provider === "demo" ? demoDeck.next(text) : text;
        (body.querySelector("#ws-speech") as HTMLTextAreaElement).value =
          speech;
        await voice.speak(speech, genome, provider, "");
      } catch (e) {
        (body.querySelector("#ws-voice-status") as HTMLElement).textContent =
          e instanceof Error ? e.message : "Ошибка озвучки";
      }
    });
  });

  const dna = new URL(location.href).searchParams.get("dna");
  if (dna) {
    const g = decode(dna);
    if (g) applyGenome(g, true);
  }

  let raf = 0;
  const pump = () => {
    if (stage) stage.speech = voice.level();
    raf = requestAnimationFrame(pump);
  };
  pump();

  shell.updateChrome(ctx.getSave());

  return {
    destroy() {
      cancelAnimationFrame(raf);
      clearTimeout(previewTimer);
      window.removeEventListener("keydown", onKey);
      voice.stop();
      stage?.dispose();
      sheet.destroy();
    },
  };
}

function traitLabel(t: Trait): string {
  const map: Partial<Record<Trait, string>> = {
    eyes: "Глаза",
    eyeCut: "Разрез",
    pupil: "Зрачки",
    brows: "Брови",
    mouth: "Рот",
    teeth: "Зубы",
    chin: "Подбородок",
    skin: "Покрытие",
    finish: "Материал",
    palette: "Палитра",
    pattern: "Окрас",
  };
  return map[t] || t;
}

void traitKeys;
void signature;
