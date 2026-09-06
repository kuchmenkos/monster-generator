import {
  parseCollection,
  updatePreview,
  RENDER_VERSION,
  type Saved,
} from "./collection";
import { DemoPhraseDeck } from "./demo";
import type { Mood, Reaction } from "./motion";
import "./style.css";
import {
  createIcons,
  Sparkles,
  LayoutGrid,
  ArrowUpRight,
  Rotate3d,
  Pause,
  Download,
  Hand,
  Heart,
  MousePointer2,
  SlidersHorizontal,
  AudioLines,
  Gem,
  Info,
  Play,
  WandSparkles,
  Dna,
  Copy,
  Undo2,
  Shuffle,
  X,
  Check,
  LockKeyhole,
  LockKeyholeOpen,
  Shell,
  Square,
  LoaderCircle,
} from "lucide";
const icons = {
  Sparkles,
  LayoutGrid,
  ArrowUpRight,
  Rotate3d,
  Pause,
  Download,
  Hand,
  Heart,
  MousePointer2,
  SlidersHorizontal,
  AudioLines,
  Gem,
  Info,
  Play,
  WandSparkles,
  Dna,
  Copy,
  Undo2,
  Shuffle,
  X,
  Check,
  LockKeyhole,
  LockKeyholeOpen,
  Shell,
  Square,
  LoaderCircle,
};
import { Stage } from "./stage";
import { Voice } from "./voice";
import {
  catalogs,
  traitKeys,
  generate,
  character,
  rarity,
  signature,
  encode,
  decode,
  palettes,
  type Genome,
  type Trait,
} from "./genome";
const icon = (name: string, cls = "") =>
  `<i data-lucide="${name}" class="${cls}"></i>`;
const refreshIcons = () =>
  createIcons({ icons, attrs: { "stroke-width": 1.7 } });
const root = document.querySelector<HTMLDivElement>("#app")!;
root.innerHTML = `
<header class="header"><a class="brand" href="/" aria-label="Булала — главная"><span class="brand-face"><b></b><b></b></span>булала<span class="brand-dot">®</span></a><nav aria-label="Основное меню"><button class="nav active" id="studio-nav">${icon("Sparkles")} Мастерская</button><button class="nav" id="collection-nav">${icon("LayoutGrid")} Коллекция <span id="collection-count">0</span></button></nav><button class="about-button" id="about">Что за чудики? ${icon("ArrowUpRight")}</button><span class="edition">SERIES 001 <span>•</span> LITTLE WEIRDOS</span></header>
<main>
<section class="intro"><div><div class="eyebrow"><span></span> ФАБРИКА МАЛЕНЬКИХ СТРАННОСТЕЙ</div><h1>Страшно. Мило. <em>Твоё.</em></h1><p>Спереди — монстр. Сзади — булочки. Внутри — характер.</p></div><div class="intro-note">Нормальным быть скучно.<br><span>Давай создадим кого-то странного.</span><svg viewBox="0 0 90 45" aria-hidden="true"><path d="M4 5 Q65 -8 64 28 M53 20 L64 31 L76 20"/></svg></div></section>
<div class="workspace">
<section class="viewer" aria-label="3D-мастерская">
<div class="viewer-top"><span class="live-label"><span></span> ЖИВОЙ ЭКЗЕМПЛЯР</span><div class="viewer-actions"><button class="icon-button" id="auto" aria-label="Автовращение" aria-pressed="false" title="Автовращение">${icon("Rotate3d")}</button><button class="icon-button" id="pause" aria-label="Приостановить анимацию" aria-pressed="false" title="Приостановить анимацию">${icon("Pause")}</button><button class="icon-button" id="capture" aria-label="Скачать карточку" title="Скачать карточку">${icon("Download")}</button></div></div>
<div class="stage" id="stage"></div><div class="stage-watermark" aria-hidden="true">bulala</div>
<div class="annotation annotation-left"><span class="tiny-star">✳</span><span>Немножко монстр.<br><strong>Очень личность.</strong></span></div>
<button class="pet-note" id="pet">${icon("Hand")} Погладить чудика</button>
<div class="specimen-tag"><span id="specimen-number"></span><span id="specimen-material"></span></div>
<div class="view-picker" aria-label="Ракурс"><button data-view="front" class="selected">Мордашка</button><button data-view="side">Бочок</button><button data-view="back">Булочки ${icon("Heart")}</button></div>
<div class="viewer-bottom"><span>${icon("MousePointer2")} Потяни, чтобы покрутить</span><span>НАСТОЯЩИЙ 3D · 360°</span></div>
</section>
<aside class="inspector">
<div class="creature-heading"><div class="heading-top"><span class="eyebrow">ТВОЙ НОВЫЙ ЧУДИК</span><button id="save" class="icon-button save-button" aria-label="Сохранить в коллекцию" aria-pressed="false">${icon("Heart")}</button></div><div class="name-row"><h2 id="name"></h2><span class="rarity-badge" id="rarity"></span></div><p id="nature"></p></div>
<div class="inspector-tabs" role="tablist" aria-label="Настройка чудика"><button role="tab" id="appearance-tab" aria-selected="true" aria-controls="appearance">${icon("SlidersHorizontal")} Внешность</button><button role="tab" id="voice-tab" aria-selected="false" aria-controls="voice">${icon("AudioLines")} Голос</button></div>
<div class="emotion-controls"><label for="mood">Настроение</label><select id="mood" aria-label="Настроение"><option value="neutral">Спокойный</option><option value="happy">Радостный</option><option value="sad">Грустный</option></select><div class="reaction-row"><button data-reaction="smile">Улыбнуться</button><button data-reaction="shout">Крикнуть</button><button data-reaction="sigh">Вздохнуть</button></div></div>
<div id="appearance" role="tabpanel" aria-labelledby="appearance-tab"><div class="palette-label"><label>Цвет настроения</label><span id="palette-name"></span></div><div id="swatches" class="swatches"></div>
<div class="trait-grid" id="traits"></div><details class="extra-traits"><summary>Ещё немного причуд <span>Лицо, материал, окрас</span></summary><div class="trait-grid" id="extra-traits"></div></details>
<div class="chaos-label"><label for="chaos">Градус странности</label><output id="chaos-value">55%</output></div><input id="chaos" type="range" min="0" max="100" value="55"/><div class="range-captions"><span>Милашка</span><span>Тот ещё чудик</span></div>
<div class="rarity-note"><span class="rarity-mark">${icon("Gem")}</span><div><strong id="rarity-percent"></strong><button id="rarity-explain">Как считается редкость ${icon("Info")}</button></div></div></div>
<div id="voice" role="tabpanel" aria-labelledby="voice-tab" hidden><div class="voice-profile">${icon("AudioLines")}<div><strong id="voice-name"></strong><span>Голосовой характер из ДНК</span></div></div><label for="speech">Что скажем миру?</label><textarea id="speech" maxlength="500" rows="3">Я не странный. Я коллекционный. И вообще, посмотри на мои булочки!</textarea><label for="provider">Озвучка</label><select id="provider"><option value="demo">Демо · голос браузера</option><option value="elevenlabs">ElevenLabs · нейроголос</option></select><div id="eleven-settings" hidden><label for="voice-id">Voice ID <span>или голос из .env.local</span></label><input id="voice-id" placeholder="Например, JBFqnCBsd6RMkjVDRZzb" maxlength="100"/><button class="text-button" id="design-voice">${icon("WandSparkles")} Создать уникальный голос</button><p id="api-status" class="small-note"></p></div><button id="speak" class="speak-button">${icon("Play")} Дать слово чудику</button><p id="voice-status" class="small-note" role="status">В деморежиме голос зависит от браузера, движение рта — приблизительное.</p></div>
<div class="inspector-footer"><button class="dna-button" id="dna">${icon("Dna")} <span id="seed-label"></span> ${icon("Copy")}</button><button class="reset-button" id="reset" title="Сбросить изменения" aria-label="Сбросить изменения">${icon("Undo2")}</button></div>
</aside>
</div>
<section class="generation-bar"><div class="generation-copy"><span class="asterisk">✳</span><div><strong>Одного такого больше нет.</strong><span>Новая ДНК. Новая странность. Новая любовь.</span></div></div><div class="generate-controls"><button class="secondary-button" id="save-bottom">${icon("Heart")} Забрать себе</button><button id="generate" class="generate-button">${icon("Shuffle")} Создать Булалу <span>↗</span></button></div></section>
<section class="recent-section"><div class="section-heading"><h3>Недавно появились <span id="recent-count"></span></h3><span>У каждого свои причуды</span></div><div class="recent-list" id="recent-list"></div></section>
<footer class="footer"><span>булала® <span>— коллекция несовершенств.</span></span><span>СДЕЛАНО С НЕЖНОСТЬЮ И НЕМНОГО БЕЗУМИЯ</span><a href="/legacy.html">Старая лаборатория ${icon("ArrowUpRight")}</a></footer>
</main><div class="toast" id="toast" role="status"></div><dialog id="modal"><div class="modal-heading"><h2 id="modal-title"></h2><button id="close-modal" class="icon-button" aria-label="Закрыть">${icon("X")}</button></div><div id="modal-body"></div></dialog>`;
function el<T extends HTMLElement = HTMLElement>(id: string) {
  return document.getElementById(id) as T;
}
const initial = generate("bulala-001");
initial.genes = {
  teeth: 3,
  brows: 0,
  eyeCut: 0,
  pupil: 0,
  finish: 0,
  pattern: 0,
  mouth: 0,
  chin: 0,
  horns: 0,
  shape: 0,
  eyes: 0,
  nose: 0,
  ears: 0,
  skin: 1,
  booty: 0,
  tail: 0,
  palette: 0,
};
const url = new URL(location.href);
let genome =
  decode(url.searchParams.get("dna") || "") ||
  (url.searchParams.get("seed") &&
  /^[a-zA-Z0-9-]{1,40}$/.test(url.searchParams.get("seed")!)
    ? generate(url.searchParams.get("seed")!)
    : initial);
let baseline = structuredClone(genome);
const locks = new Set<Trait>();
let custom = false;
const voice = new Voice();
const demoDeck = new DemoPhraseDeck();
let stage: Stage | undefined;
let toastTimer: ReturnType<typeof setTimeout>;
function readSaved(): Saved[] {
  try {
    return parseCollection(
      localStorage.getItem("bulala-collection-v1") || "[]",
    );
  } catch {
    return [];
  }
}
let saved = readSaved();
let recent: Saved[] = [];
function toast(message: string) {
  el("toast").textContent = message;
  el("toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el("toast").classList.remove("visible"), 3500);
}
function updateURL() {
  const u = new URL(location.href);
  u.searchParams.delete("seed");
  u.searchParams.set("dna", encode(genome));
  history.replaceState(null, "", u);
}
function isSaved() {
  return saved.some((s) => signature(s.genome) === signature(genome));
}
function updateSaved() {
  const exists = isSaved();
  el("save").setAttribute("aria-pressed", String(exists));
  el("save").setAttribute(
    "aria-label",
    exists ? "Убрать из коллекции" : "Сохранить в коллекцию",
  );
  el("save-bottom").innerHTML =
    `${icon("Heart")} ${exists ? "В коллекции" : "Забрать себе"}`;
  el("save-bottom").classList.toggle("saved", exists);
  el("collection-count").textContent = String(saved.length);
  refreshIcons();
}
function updateUI() {
  const c = character(genome),
    rr = rarity(genome);
  el("name").textContent = c.name;
  el("nature").textContent = c.nature;
  el("rarity").textContent = rr.tier;
  el("rarity").style.setProperty("--rarity", rr.color);
  el("rarity-percent").textContent =
    `Редче ${(100 - rr.tail).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}% случайных Булал`;
  el("seed-label").textContent =
    genome.seed.slice(0, 12) + (custom ? " · изменён" : "");
  el("specimen-number").textContent =
    "ДНК / " + genome.seed.slice(0, 12).toUpperCase();
  el("specimen-material").textContent =
    catalogs.skin[genome.genes.skin].label +
    " · " +
    (custom ? "ТВОЯ ВЕРСИЯ" : "SERIES 001");
  el("palette-name").textContent = catalogs.palette[genome.genes.palette].label;
  el("voice-name").textContent = c.voice;
  el("swatches").innerHTML = palettes
    .map(
      (p, i) =>
        `<button class="swatch ${i === genome.genes.palette ? "selected" : ""}" data-palette="${i}" style="--swatch:${p[0]}" aria-label="${catalogs.palette[i].label}" aria-pressed="${i === genome.genes.palette}" title="${catalogs.palette[i].label}">${i === genome.genes.palette ? icon("Check") : ""}</button>`,
    )
    .join("");
  const titles: Record<Trait, string> = {
    teeth: "Зубы",
    brows: "Брови",
    eyeCut: "Разрез глаз",
    pupil: "Зрачки",
    finish: "Материал",
    pattern: "Окрас",
    mouth: "Форма рта",
    chin: "Подбородок",
    horns: "Рожки",
    shape: "Форма головы",
    eyes: "Глаза",
    nose: "Нос и мордочка",
    ears: "Уши",
    skin: "Покрытие",
    booty: "Булочки",
    tail: "Хвостик",
    palette: "Палитра",
  };
  const traitHTML = (k: Trait) =>
    `<div class="trait ${k === "tail" ? "wide" : ""}"><div><label for="trait-${k}">${titles[k]}</label><button class="lock ${locks.has(k) ? "locked" : ""}" data-lock="${k}" aria-label="${locks.has(k) ? "Открепить" : "Закрепить"}: ${titles[k]}" aria-pressed="${locks.has(k)}" title="Сохранить этот признак при генерации">${icon(locks.has(k) ? "LockKeyhole" : "LockKeyholeOpen")}</button></div><select id="trait-${k}" data-trait="${k}">${catalogs[k].map((v, i) => `<option value="${i}" ${genome.genes[k] === i ? "selected" : ""}>${v.label}</option>`).join("")}</select></div>`;
  el("traits").innerHTML = traitKeys
    .filter(
      (k) =>
        ![
          "palette",
          "mouth",
          "chin",
          "horns",
          "teeth",
          "brows",
          "eyeCut",
          "pupil",
          "finish",
          "pattern",
        ].includes(k),
    )
    .map(traitHTML)
    .join("");
  el("extra-traits").innerHTML = traitKeys
    .filter((k) =>
      [
        "mouth",
        "chin",
        "horns",
        "teeth",
        "brows",
        "eyeCut",
        "pupil",
        "finish",
        "pattern",
      ].includes(k),
    )
    .map(traitHTML)
    .join("");
  el<HTMLInputElement>("chaos").value = String(genome.chaos);
  el("chaos-value").textContent = genome.chaos + "%";
  updateSaved();
}
function apply(newGenome: Genome, reset = false) {
  voice.stop();
  if (genome.seed !== newGenome.seed)
    el<HTMLInputElement>("voice-id").value = "";
  genome = structuredClone(newGenome);
  if (reset) {
    baseline = structuredClone(genome);
    custom = false;
  } else custom = true;
  stage?.setGenome(genome);
  stage?.setMood(el<HTMLSelectElement>("mood").value as Mood);
  updateUI();
  updateURL();
}
function snapshotSmall() {
  if (!stage) return "";
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 320;
  const ctx = canvas.getContext("2d")!;
  const src = stage.renderer.domElement;
  const size = Math.min(src.width, src.height);
  ctx.drawImage(
    src,
    (src.width - size) / 2,
    (src.height - size) / 2,
    size,
    size,
    0,
    0,
    320,
    320,
  );
  return canvas.toDataURL("image/png");
}
function remember() {
  if (!stage) return;
  stage.snapshot();
  const item = {
    genome: structuredClone(genome),
    image: snapshotSmall(),
    renderVersion: RENDER_VERSION,
    at: Date.now(),
  };
  recent = [
    item,
    ...recent.filter((x) => signature(x.genome) !== signature(genome)),
  ].slice(0, 8);
  renderRecent();
}
function renderRecent() {
  el("recent-count").textContent = String(recent.length).padStart(2, "0");
  el("recent-list").innerHTML = recent.length
    ? recent
        .map(
          (s, i) =>
            `<button class="recent-card" data-recent="${i}" style="--card-bg:${palettes[s.genome.genes.palette][1]}30"><img src="${s.image}" alt="${character(s.genome).name}"/><div><strong>${character(s.genome).name}</strong><span>${catalogs.eyes[s.genome.genes.eyes].label}</span></div><span class="recent-arrow">↗</span></button>`,
        )
        .join("")
    : `<div class="empty-recent">${icon("Shell")} Здесь появятся твои открытия. Создай первого нового чудика.</div>`;
  refreshIcons();
}
function saveCurrent() {
  const targetGenome = structuredClone(genome),
    key = signature(targetGenome);
  stage?.snapshot();
  const image = snapshotSmall();
  const commit = () => {
    const latest = readSaved(),
      exists = latest.some((s) => signature(s.genome) === key);
    if (!exists && latest.length >= 48) {
      toast("В коллекции 48 чудиков. Удали одного, чтобы освободить место.");
      return;
    }
    const next = exists
      ? latest.filter((s) => signature(s.genome) !== key)
      : [
          {
            genome: targetGenome,
            image,
            at: Date.now(),
            renderVersion: RENDER_VERSION,
          },
          ...latest,
        ];
    try {
      localStorage.setItem("bulala-collection-v1", JSON.stringify(next));
      saved = next;
      updateSaved();
      toast(
        exists
          ? "Чудик отпущен из коллекции"
          : "Теперь это твой чудик. Сохранён в этом браузере.",
      );
    } catch {
      toast(
        "Не хватает места в браузере. Скачай карточку или освободи коллекцию.",
      );
    }
  };
  if (navigator.locks)
    void navigator.locks.request("bulala-collection", commit);
  else commit();
}

function modal(title: string, html: string) {
  el("modal-title").textContent = title;
  el("modal-body").innerHTML = html;
  el<HTMLDialogElement>("modal").showModal();
  refreshIcons();
}
el("close-modal").onclick = () => el<HTMLDialogElement>("modal").close();
el("modal").addEventListener("click", (e) => {
  if (e.target === el("modal")) {
    const box = el("modal").getBoundingClientRect();
    if (
      e.clientX < box.left ||
      e.clientX > box.right ||
      e.clientY < box.top ||
      e.clientY > box.bottom
    )
      el<HTMLDialogElement>("modal").close();
  }
});
el("generate").onclick = () => {
  remember();
  const next = generate();
  for (const k of locks) next.genes[k] = genome.genes[k];
  next.chaos = genome.chaos;
  apply(next, true);
  stage?.view("front");
  document
    .querySelectorAll("[data-view]")
    .forEach((b) =>
      b.classList.toggle("selected", b.getAttribute("data-view") === "front"),
    );
  if (matchMedia("(max-width: 760px)").matches)
    document.querySelector(".viewer")?.scrollIntoView({
      behavior: stage?.reduced ? "instant" : "smooth",
      block: "start",
    });
  toast("Кажется, кто-то вылупился.");
};
el("appearance").addEventListener("change", (e) => {
  const target = e.target as HTMLSelectElement;
  const k = target.dataset.trait as Trait;
  if (k) {
    genome.genes[k] = Number(target.value);
    apply(genome);
  }
});
el("appearance").addEventListener("click", (e) => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-lock]",
  );
  if (!button) return;
  const k = button.dataset.lock as Trait;
  locks.has(k) ? locks.delete(k) : locks.add(k);
  updateUI();
});
el("swatches").onclick = (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-palette]",
  );
  if (b) {
    genome.genes.palette = Number(b.dataset.palette);
    apply(genome);
  }
};
el("chaos").oninput = () => {
  el("chaos-value").textContent = el<HTMLInputElement>("chaos").value + "%";
};
el("chaos").onchange = () => {
  genome.chaos = Number(el<HTMLInputElement>("chaos").value);
  apply(genome);
};
el("reset").onclick = () => {
  apply(baseline, true);
  toast("Исходная ДНК восстановлена.");
};
el("save").onclick = saveCurrent;
el("save-bottom").onclick = saveCurrent;
document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(
  (b) =>
    (b.onclick = () => {
      stage?.view(b.dataset.view as "front" | "back" | "side");
      el("auto").setAttribute("aria-pressed", "false");
      document
        .querySelectorAll("[data-view]")
        .forEach((n) => n.classList.toggle("selected", n === b));
    }),
);
el("auto").onclick = () => {
  if (!stage) return;
  stage.auto = !stage.auto;
  el("auto").setAttribute("aria-pressed", String(stage.auto));
};
el("pause").onclick = () => {
  if (!stage) return;
  stage.paused = !stage.paused;
  el("pause").setAttribute("aria-pressed", String(stage.paused));
  el("pause").setAttribute(
    "aria-label",
    stage.paused ? "Продолжить анимацию" : "Приостановить анимацию",
  );
  el("pause").innerHTML = icon(stage.paused ? "Play" : "Pause");
  refreshIcons();
};
el("pet").onclick = () => {
  stage?.react("pet");
  toast(
    [
      "Ур-р-р. Это было приятно.",
      "Осторожно, привязывается.",
      "Кажется, ты ему нравишься.",
    ][Math.floor(Math.random() * 3)],
  );
};
el<HTMLSelectElement>("mood").onchange = () =>
  stage?.setMood(el<HTMLSelectElement>("mood").value as Mood);
document.querySelectorAll<HTMLButtonElement>("[data-reaction]").forEach(
  (button) =>
    (button.onclick = () => {
      const reaction = button.dataset.reaction as Reaction;
      if (reaction === "shout" || reaction === "sigh") voice.stop();
      stage?.react(reaction);
    }),
);

function selectTab(name: "appearance" | "voice") {
  for (const n of ["appearance", "voice"]) {
    el(n).hidden = n !== name;
    el(n + "-tab").setAttribute("aria-selected", String(n === name));
  }
}
el("appearance-tab").onclick = () => selectTab("appearance");
el("voice-tab").onclick = () => selectTab("voice");
document.querySelector(".inspector-tabs")!.addEventListener("keydown", (e) => {
  const event = e as KeyboardEvent;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    const target = el("appearance").hidden ? "appearance" : "voice";
    selectTab(target);
    el(target + "-tab").focus();
  }
});
el("recent-list").onclick = (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-recent]",
  );
  if (b) apply(recent[Number(b.dataset.recent)].genome, true);
};
el("collection-nav").onclick = () => {
  modal(
    "Твоя коллекция",
    `<p class="modal-intro">${saved.length ? `Чудиков в коллекции: ${saved.length}. Нажми на чудика, чтобы вернуться к нему.` : "Пока здесь тихо. Сохрани понравившегося чудика сердечком."} Коллекция хранится в этом браузере.</p><div class="collection-grid">${saved.map((s, i) => `<button data-saved="${i}" class="collection-card" style="background:${palettes[s.genome.genes.palette][1]}40"><img src="${s.image}" alt="${character(s.genome).name}"/><strong>${character(s.genome).name}</strong><span>${rarity(s.genome).tier}</span></button>`).join("")}</div>`,
  );
  el("modal-body").onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-saved]",
    );
    if (b) {
      apply(saved[Number(b.dataset.saved)].genome, true);
      el<HTMLDialogElement>("modal").close();
    }
  };
};
el("studio-nav").onclick = () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
};
el("about").onclick = () =>
  modal(
    "Привет, мы — Булала.",
    `<div class="about-visual"><span class="brand-face"><b></b><b></b></span></div><p>Мы круглые, зубастые и немножко нелепые. У нас нет рук, ног и важных дел. Только страшная мордашка, мягкие булочки и очень большой характер.</p><p>Создавай, крути, гладь. Меняй внешность, закрепляй любимые признаки замочком и находи своего. Каждый код ДНК возвращает того же самого чудика.</p><p class="small-note">Это процедурный 3D-прототип: геометрия, материалы и анимация создаются прямо в браузере. Ни одного заранее нарисованного монстра.</p>`,
  );
el("rarity-explain").onclick = () => {
  const rr = rarity(genome);
  modal(
    "Редкость без магии",
    `<p>У каждого признака есть вероятность выпадения. Например: «${catalogs.eyes[genome.genes.eyes].label}» — ${catalogs.eyes[genome.genes.eyes].w}%, «${catalogs.skin[genome.genes.skin].label}» — ${catalogs.skin[genome.genes.skin].w}%.</p><p>Мы складываем информационную редкость выбранных признаков и сравниваем с фиксированной выборкой из 16 000 случайных Булал. Этот чудик входит примерно в <strong>${rr.tail.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}% самых необычных</strong>.</p><p>Вероятность именно этой комбинации категорий — около <strong>1 к ${Math.round(1 / rr.combination).toLocaleString("ru-RU")}</strong>. Непрерывные вариации геометрии и код ДНК в это число не входят.</p><p class="small-note">Это оценка относительно модели генерации, а не мировая статистика владельцев. При ручной настройке и закреплённых признаках показывается редкость относительно свободной генерации. Степени: легендарный ≤ 1%, эпический ≤ 8%, редкий ≤ 30%.</p>`,
  );
};
el("dna").onclick = () => {
  modal(
    "ДНК твоего чудика",
    `<p>Ссылка сохраняет всю внешность, включая ручные изменения. Открой её в другом браузере — встретишь ту же Булалу.</p><label for="dna-link">Ссылка на Булалу</label><textarea id="dna-link" readonly rows="3"></textarea><button id="copy-link" class="generate-button">${icon("Copy")} Скопировать ссылку</button><hr/><label for="dna-input">Или введи новый seed</label><div class="inline-form"><input id="dna-input" placeholder="Например, my-little-monster" maxlength="40"/><button id="load-seed" class="secondary-button">Создать</button></div><p class="small-note">Латинские буквы, цифры и дефис. Один seed — один исходный чудик.</p>`,
  );
  el<HTMLTextAreaElement>("dna-link").value = location.href;
  el("copy-link").onclick = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      toast("Ссылка с ДНК скопирована.");
    } catch {
      el<HTMLTextAreaElement>("dna-link").select();
      toast("Выделил ссылку. Нажми ⌘C / Ctrl+C.");
    }
  };
  el("load-seed").onclick = () => {
    const value = el<HTMLInputElement>("dna-input").value.trim();
    if (!/^[a-zA-Z0-9-]{1,40}$/.test(value)) {
      toast("Нужны латинские буквы, цифры или дефис.");
      return;
    }
    remember();
    apply(generate(value), true);
    el<HTMLDialogElement>("modal").close();
  };
};
el<HTMLSelectElement>("provider").onchange = () => {
  voice.stop();
  el("eleven-settings").hidden =
    el<HTMLSelectElement>("provider").value !== "elevenlabs";
};
voice.onState = (state) => {
  el("speak").innerHTML =
    `${icon(state === "playing" ? "Square" : state === "loading" ? "LoaderCircle" : "Play")} ${state === "playing" ? "Тише, чудик" : state === "loading" ? "Чудик собирается с мыслями…" : "Дать слово чудику"}`;
  el<HTMLButtonElement>("speak").disabled = state === "loading";
  if (!["playing", "loading", "idle"].includes(state))
    el("voice-status").textContent = state;
  refreshIcons();
};
el("speak").onclick = async () => {
  if (voice.active) {
    voice.stop();
    return;
  }
  try {
    const speechInput = el<HTMLTextAreaElement>("speech");
    if (el<HTMLSelectElement>("provider").value === "demo")
      speechInput.value = demoDeck.next(speechInput.value);
    await voice.speak(
      speechInput.value,
      genome,
      el<HTMLSelectElement>("provider").value,
      el<HTMLInputElement>("voice-id").value.trim(),
    );
    if (voice.active)
      el("voice-status").textContent =
        el<HTMLSelectElement>("provider").value === "demo"
          ? "Демоголос браузера · приблизительное движение рта"
          : "ElevenLabs · челюсть следует громкости аудио";
  } catch (e) {
    el("voice-status").textContent =
      e instanceof Error ? e.message : "Не удалось озвучить.";
  }
};
let designController: AbortController | undefined;
el("design-voice").onclick = async () => {
  const button = el<HTMLButtonElement>("design-voice");
  button.disabled = true;
  const targetSeed = genome.seed;
  designController = new AbortController();
  el("api-status").textContent = "Создаём и сохраняем голос в ElevenLabs…";
  try {
    const response = await fetch("/api/bulala/design", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: designController.signal,
      body: JSON.stringify({
        seed: targetSeed,
        name: character(genome).name,
        pitch: character(genome).pitch,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    if (genome.seed === targetSeed) {
      el<HTMLInputElement>("voice-id").value = result.voiceId;
      el("api-status").textContent =
        "Уникальный голос готов и привязан к этому seed.";
    } else toast("Голос создан для предыдущего чудика.");
  } catch (e) {
    el("api-status").textContent =
      e instanceof Error ? e.message : "Не удалось создать голос.";
  } finally {
    button.disabled = false;
  }
};
let cardURL: string | undefined;
async function exportCard() {
  if (!stage) return;
  const current = structuredClone(genome);
  const data = stage.snapshot();
  const img = new Image();
  img.src = data;
  await img.decode();
  const card = document.createElement("canvas");
  card.width = 1200;
  card.height = 1500;
  const ctx = card.getContext("2d")!;
  ctx.fillStyle = "#f3efe8";
  ctx.fillRect(0, 0, 1200, 1500);
  ctx.fillStyle = "#312d29";
  ctx.font = "bold 76px sans-serif";
  ctx.fillText("булала®", 75, 125);
  ctx.fillStyle = "#8f8880";
  ctx.font = "23px monospace";
  ctx.fillText("SERIES 001 / LITTLE WEIRDOS", 75, 175);
  const aspect = img.width / img.height;
  const h = 1050,
    w = h * aspect;
  ctx.drawImage(img, (1200 - w) / 2, 180, w, h);
  ctx.fillStyle = "#312d29";
  ctx.font = "bold 75px sans-serif";
  ctx.fillText(character(current).name, 75, 1280);
  ctx.font = "27px sans-serif";
  ctx.fillText(character(current).nature, 75, 1335);
  ctx.fillStyle = rarity(current).color;
  ctx.fillText(rarity(current).tier, 75, 1400);
  ctx.fillStyle = "#8f8880";
  ctx.font = "22px monospace";
  ctx.fillText("DNA / " + current.seed.slice(0, 12), 690, 1400);
  const blob = await new Promise<Blob>((resolve, reject) =>
    card.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error("PNG export failed")),
      "image/png",
    ),
  );
  if (cardURL) URL.revokeObjectURL(cardURL);
  cardURL = URL.createObjectURL(blob);
  let downloadURL = cardURL;
  try {
    const response = await fetch("/api/bulala/cards", {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: blob,
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = await response.json();
      if (
        typeof data.url === "string" &&
        data.url.startsWith("/api/bulala/cards/")
      )
        downloadURL = data.url;
    }
  } catch {
    /* Static hosting still supports the native blob download. */
  }
  modal(
    "Карточка «" + character(current).name + "»",
    `<img class="card-preview" src="${cardURL}" alt="Коллекционная карточка ${character(current).name}"/><a class="generate-button download-card" href="${downloadURL}" download="bulala-${current.seed}.png">${icon("Download")} Скачать PNG · 1200 × 1500</a><p class="small-note">Сохрани карточку или вернись в мастерскую, чтобы выбрать другой ракурс.</p>`,
  );
}
el("capture").onclick = () =>
  void exportCard().catch(() =>
    toast("Не удалось скачать карточку. Попробуй ещё раз."),
  );
try {
  stage = new Stage(el("stage"));
  stage.setGenome(genome);
} catch {
  el("stage").innerHTML =
    '<div class="webgl-error"><strong>Не удалось запустить 3D</strong><p>Включи аппаратное ускорение в браузере и обнови страницу.</p></div>';
  el<HTMLButtonElement>("capture").disabled = true;
}
el("stage").addEventListener("stage-error", () =>
  toast("3D-контекст потерян. Обнови страницу, чтобы восстановить сцену."),
);
function animateVoice() {
  if (stage) stage.speech = voice.level();
  requestAnimationFrame(animateVoice);
}
animateVoice();
window.addEventListener("pagehide", () => {
  voice.stop();
  designController?.abort();
});
window.addEventListener("popstate", () => {
  const g = decode(new URL(location.href).searchParams.get("dna") || "");
  if (g) apply(g, true);
});
updateUI();
renderRecent();
updateURL();
fetch("/api/bulala/status")
  .then((r) => r.json())
  .then((s) => {
    el("api-status").textContent = s.elevenlabs
      ? "ElevenLabs подключён. Создание голоса использует лимиты аккаунта."
      : "Добавь ELEVENLABS_API_KEY в .env.local и перезапусти сервер.";
  })
  .catch(() => {
    el("api-status").textContent =
      "Для ElevenLabs запусти сервер через npm run dev.";
  });

window.addEventListener("storage", (event) => {
  if (event.key === "bulala-collection-v1") {
    saved = readSaved();
    updateSaved();
  }
});

// Refresh obsolete thumbnails off-screen, one item at a time. Re-read storage
// inside the commit so additions/deletions in another tab are not overwritten.
async function refreshCollectionPreviews() {
  if (!stage) return;
  for (const candidate of readSaved().filter(
    (s) => s.renderVersion !== RENDER_VERSION,
  )) {
    await new Promise((resolve) => setTimeout(resolve, 80));
    const key = signature(candidate.genome);
    if (
      !readSaved().some(
        (s) =>
          signature(s.genome) === key && s.renderVersion !== RENDER_VERSION,
      )
    )
      continue;
    let image: string;
    try {
      image = stage.thumbnail(candidate.genome);
    } catch {
      continue;
    }
    try {
      const commit = () => {
        const next = updatePreview(readSaved(), key, image);
        if (!next) return;
        localStorage.setItem("bulala-collection-v1", JSON.stringify(next));
        saved = next;
        updateSaved();
      };
      if (navigator.locks)
        await navigator.locks.request("bulala-collection", commit);
      else commit();
    } catch {
      break;
    }
  }
}
setTimeout(() => void refreshCollectionPreviews(), 1800);
