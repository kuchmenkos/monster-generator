import { icon, refreshIcons } from "./icons";

export type SheetSnap = "peek" | "full" | "closed";

export type SheetApi = {
  root: HTMLElement;
  body: HTMLElement;
  setTitle: (title: string) => void;
  setBody: (html: string) => void;
  open: (snap?: "peek" | "full") => void;
  close: () => void;
  snap: (snap: SheetSnap) => void;
  getSnap: () => SheetSnap;
  destroy: () => void;
};

type SheetOpts = {
  host: HTMLElement;
  title?: string;
  peekPx?: number;
  /** Permanent peek strip (collection). No scrim at peek. */
  persistent?: boolean;
  onSnap?: (snap: SheetSnap) => void;
  onClose?: () => void;
};

export function mountSheet(opts: SheetOpts): SheetApi {
  const peekPx = opts.peekPx ?? 112;
  let snap: SheetSnap = opts.persistent ? "peek" : "closed";

  const root = document.createElement("div");
  root.className = `sheet-root${opts.persistent ? " peek open" : ""}`;
  root.style.setProperty("--peek", `${peekPx}px`);
  root.innerHTML = `
    <div class="sheet-scrim" data-scrim></div>
    <div class="sheet-panel" role="region">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="sheet-head">
        <h3 data-title>${opts.title ?? ""}</h3>
        <button type="button" class="icon-button" data-close aria-label="Закрыть">${icon("X")}</button>
      </div>
      <div class="sheet-body" data-body></div>
    </div>`;
  opts.host.append(root);
  refreshIcons();

  const panel = root.querySelector(".sheet-panel") as HTMLElement;
  const body = root.querySelector("[data-body]") as HTMLElement;
  const titleEl = root.querySelector("[data-title]") as HTMLElement;
  const closeBtn = root.querySelector("[data-close]") as HTMLElement;
  const scrim = root.querySelector("[data-scrim]") as HTMLElement;

  if (opts.persistent) closeBtn.hidden = true;

  const apply = (next: SheetSnap) => {
    snap = next;
    root.classList.toggle("open", next !== "closed");
    root.classList.toggle("peek", next === "peek");
    if (next === "closed" && !opts.persistent) {
      root.classList.remove("open", "peek");
    }
    if (opts.persistent && next === "closed") {
      snap = "peek";
      root.classList.add("open", "peek");
    }
    // Peek is a dock/region; only full sheet is a modal dialog.
    if (snap === "full") {
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-modal", "true");
    } else {
      panel.setAttribute("role", "region");
      panel.removeAttribute("aria-modal");
    }
    opts.onSnap?.(snap);
    if (snap === "closed") opts.onClose?.();
  };

  let dragY = 0;
  let dragging = false;
  let startY = 0;
  let startTranslate = 0;

  const panelHeight = () => panel.getBoundingClientRect().height || 400;

  const currentTranslate = () => {
    if (snap === "full") return 0;
    if (snap === "peek") return Math.max(0, panelHeight() - peekPx);
    return panelHeight();
  };

  const onPointerDown = (e: PointerEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest(".sheet-body") && body.scrollTop > 0) return;
    if (!t.closest(".sheet-handle") && !t.closest(".sheet-head") && snap === "full")
      return;
    dragging = true;
    startY = e.clientY;
    startTranslate = currentTranslate();
    panel.setPointerCapture(e.pointerId);
    panel.style.transition = "none";
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    dragY = Math.max(0, startTranslate + dy);
    panel.style.transform = `translateY(${dragY}px)`;
  };

  const onPointerUp = () => {
    if (!dragging) return;
    dragging = false;
    panel.style.transition = "";
    panel.style.transform = "";
    const h = panelHeight();
    const y = dragY;
    if (opts.persistent) {
      if (y < h * 0.35) apply("full");
      else apply("peek");
    } else {
      if (y > h * 0.45) apply("closed");
      else apply("full");
    }
  };

  panel.addEventListener("pointerdown", onPointerDown);
  panel.addEventListener("pointermove", onPointerMove);
  panel.addEventListener("pointerup", onPointerUp);
  panel.addEventListener("pointercancel", onPointerUp);
  scrim.addEventListener("click", () => {
    if (opts.persistent) apply("peek");
    else apply("closed");
  });
  closeBtn.addEventListener("click", () => {
    if (opts.persistent) apply("peek");
    else apply("closed");
  });

  return {
    root,
    body,
    setTitle(title) {
      titleEl.textContent = title;
    },
    setBody(html) {
      body.innerHTML = html;
      refreshIcons();
    },
    open(s = "full") {
      apply(s);
    },
    close() {
      apply(opts.persistent ? "peek" : "closed");
    },
    snap: apply,
    getSnap: () => snap,
    destroy() {
      panel.removeEventListener("pointerdown", onPointerDown);
      panel.removeEventListener("pointermove", onPointerMove);
      panel.removeEventListener("pointerup", onPointerUp);
      panel.removeEventListener("pointercancel", onPointerUp);
      root.remove();
    },
  };
}
