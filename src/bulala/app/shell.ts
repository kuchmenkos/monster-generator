import { icon, refreshIcons } from "./icons";
import type { Route } from "./router";
import { setRoute } from "./router";
import { boxCostOf, type SaveV1 } from "../game/state";
import { BOX_HYPE_COST } from "../game/economy";
import { setSfxEnabled, sfxEnabled } from "../fx/sfx";

export type ShellApi = {
  root: HTMLElement;
  content: HTMLElement;
  toast: (message: string) => void;
  modal: (title: string, html: string) => HTMLElement;
  closeModal: () => void;
  setRouteActive: (route: Route) => void;
  updateChrome: (save: SaveV1) => void;
  onBox: (() => void) | null;
  /** Tap on the hype chip — opens the wallet sheet. */
  onHype: (() => void) | null;
};

export function mountShell(host: HTMLElement): ShellApi {
  host.innerHTML = `
<header class="shell-header">
  <a class="brand" href="#/base" aria-label="Булала — база"><span class="brand-face"><b></b><b></b></span>булала<span class="brand-dot">®</span></a>
  <div class="shell-meta">
    <button class="sfx-chip" id="sfx-chip" aria-pressed="${sfxEnabled()}" title="Звук">${icon("AudioLines")}</button>
    <button class="hype-chip" id="hype-chip" aria-haspopup="dialog" title="Хайп — нажми, чтобы изменить">${icon("Zap")} <span id="hype-value">0</span></button>
    <button class="box-button" id="box-button" title="Открыть бокс">${icon("Package")}<span class="box-label">Бокс · <span id="box-cost">${BOX_HYPE_COST}</span></span></button>
  </div>
</header>
<main class="shell-main" id="shell-content"></main>
<nav class="tabbar" aria-label="Разделы">
  <button class="tab" data-route="base">${icon("Home")}<span>База</span></button>
  <button class="tab" data-route="battles">${icon("Swords")}<span>Батлы</span></button>
  <button class="tab" data-route="workshop">${icon("Sparkles")}<span>Мастерская</span></button>
</nav>
<div class="toast" id="toast" role="status"></div>
<dialog id="modal"><div class="modal-heading"><h2 id="modal-title"></h2><button id="close-modal" class="icon-button" aria-label="Закрыть">${icon("X")}</button></div><div id="modal-body"></div></dialog>`;

  refreshIcons();
  let toastTimer: ReturnType<typeof setTimeout>;
  const api: ShellApi = {
    root: host,
    content: host.querySelector("#shell-content")!,
    onBox: null,
    onHype: null,
    toast(message) {
      const el = host.querySelector("#toast")!;
      el.textContent = message;
      el.classList.add("visible");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.remove("visible"), 3500);
    },
    modal(title, html) {
      host.querySelector("#modal-title")!.textContent = title;
      const body = host.querySelector("#modal-body")!;
      body.innerHTML = html;
      (host.querySelector("#modal") as HTMLDialogElement).showModal();
      refreshIcons();
      return body as HTMLElement;
    },
    closeModal() {
      (host.querySelector("#modal") as HTMLDialogElement).close();
    },
    setRouteActive(route) {
      host.querySelectorAll(".tab").forEach((t) => {
        const on = (t as HTMLElement).dataset.route === route;
        t.classList.toggle("active", on);
        if (on) t.setAttribute("aria-current", "page");
        else t.removeAttribute("aria-current");
      });
      host.dataset.route = route;
    },
    updateChrome(save) {
      const cost = boxCostOf(save);
      host.querySelector("#hype-value")!.textContent = String(
        Math.floor(save.hype),
      );
      host.querySelector("#box-cost")!.textContent = cost ? String(cost) : "0";
      const box = host.querySelector("#box-button") as HTMLButtonElement;
      box.setAttribute(
        "aria-label",
        cost ? `Открыть бокс за ${cost} хайпа` : "Открыть бокс бесплатно",
      );
    },
  };

  host.querySelectorAll<HTMLButtonElement>(".tab").forEach((btn) => {
    btn.onclick = () => setRoute(btn.dataset.route as Route);
  });
  host.querySelector("#box-button")!.addEventListener("click", () => {
    api.onBox?.();
  });
  host.querySelector("#hype-chip")!.addEventListener("click", () => {
    api.onHype?.();
  });
  host.querySelector("#sfx-chip")!.addEventListener("click", () => {
    const next = !sfxEnabled();
    setSfxEnabled(next);
    const btn = host.querySelector("#sfx-chip") as HTMLButtonElement;
    btn.setAttribute("aria-pressed", String(next));
  });
  host
    .querySelector("#close-modal")!
    .addEventListener("click", () => api.closeModal());
  host.querySelector("#modal")!.addEventListener("click", (e) => {
    const modal = host.querySelector("#modal") as HTMLDialogElement;
    if (e.target === modal) {
      const box = modal.getBoundingClientRect();
      const ev = e as MouseEvent;
      if (
        ev.clientX < box.left ||
        ev.clientX > box.right ||
        ev.clientY < box.top ||
        ev.clientY > box.bottom
      )
        modal.close();
    }
  });

  return api;
}
