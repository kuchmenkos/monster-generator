import { icon, refreshIcons } from "../app/icons";
import { directionFromCenter, fitRadialLayout } from "./geometry";
import type { HeadScreen } from "../stage";

export type RadialAction =
  | "pet"
  | "feed"
  | "wash"
  | "talk"
  | "battle"
  | "workshop";

type RadialOpts = {
  host: HTMLElement;
  target: HTMLElement;
  /** Resolve creature head in host-local pixels. */
  getAnchor: () => HeadScreen | null;
  onAction: (action: RadialAction) => void;
  onAttention?: (x: number, y: number, weight: number) => void;
  onOpen?: () => void;
  onClose?: () => void;
  longPressMs?: number;
  moveCancelPx?: number;
  /** Reserved bottom space (collection peek), or getter for live measure. */
  bottomInset?: number | (() => number);
};

const ACTIONS: {
  id: RadialAction;
  label: string;
  lucide: string;
  accent?: boolean;
}[] = [
  { id: "pet", label: "Погладить", lucide: "Hand" },
  { id: "feed", label: "Покормить", lucide: "Utensils" },
  { id: "wash", label: "Помыть", lucide: "Droplets" },
  { id: "talk", label: "Поговорить", lucide: "MessageCircle" },
  { id: "battle", label: "Батл", lucide: "Swords", accent: true },
  { id: "workshop", label: "Мастерская", lucide: "Sparkles" },
];

/** Sims-like radial: hold 1s → blobs around/above creature head; drag to select. */
export function mountRadial(opts: RadialOpts): { destroy: () => void } {
  const longPressMs = opts.longPressMs ?? 1000;
  const moveCancelPx = opts.moveCancelPx ?? 10;
  const bottomInsetOf = () =>
    typeof opts.bottomInset === "function"
      ? opts.bottomInset()
      : (opts.bottomInset ?? 128);
  const overlay = document.createElement("div");
  overlay.className = "radial-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="radial-ring" aria-hidden="true"></div>
    <div class="radial-blobs"></div>
    <p class="radial-label" hidden></p>`;
  opts.host.append(overlay);

  const blobs = overlay.querySelector(".radial-blobs")!;
  const ring = overlay.querySelector(".radial-ring") as HTMLElement;
  const label = overlay.querySelector(".radial-label") as HTMLElement;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pressX = 0,
    pressY = 0,
    pressing = false,
    open = false;
  let progressRaf = 0;
  let pressStart = 0;
  let activeId: RadialAction | null = null;
  let center = { x: 0, y: 0 };

  /** Anchor in host-local pixels (stage host may not share origin with overlay host). */
  function resolveAnchor(): { x: number; y: number; r: number } {
    const hostBox = opts.host.getBoundingClientRect();
    const anchor = opts.getAnchor();
    if (anchor) {
      const targetBox = opts.target.getBoundingClientRect();
      return {
        x: anchor.x + (targetBox.left - hostBox.left),
        y: anchor.y + (targetBox.top - hostBox.top),
        r: anchor.r,
      };
    }
    return {
      x: pressX - hostBox.left,
      y: pressY - hostBox.top,
      r: 56,
    };
  }

  function layoutBlobs() {
    const hostBox = opts.host.getBoundingClientRect();
    const raw = resolveAnchor();
    const desired = Math.min(
      Math.max(raw.r * 1.35, 72),
      Math.min(hostBox.width, hostBox.height) * 0.32,
    );
    const bottomInset = bottomInsetOf();
    const layout = fitRadialLayout({
      cx: raw.x,
      cy: raw.y,
      count: ACTIONS.length,
      desiredRadius: desired,
      box: { width: hostBox.width, height: hostBox.height },
      insets: { top: 10, left: 8, right: 8, bottom: bottomInset },
      blobPad: 30,
    });
    center = layout.center;

    blobs.innerHTML = ACTIONS.map(
      (a, i) =>
        `<button type="button" class="radial-blob ${a.accent ? "accent" : ""}" data-action="${a.id}" style="--i:${i}" aria-label="${a.label}">${icon(a.lucide)}</button>`,
    ).join("");
    blobs.querySelectorAll<HTMLButtonElement>(".radial-blob").forEach((btn, i) => {
      btn.style.left = `${layout.points[i].x}px`;
      btn.style.top = `${layout.points[i].y}px`;
    });
    ring.style.left = `${center.x}px`;
    ring.style.top = `${center.y}px`;
    const ringSize = Math.max(56, layout.radius * 1.15);
    ring.style.width = `${ringSize * 2}px`;
    ring.style.height = `${ringSize * 2}px`;
    ring.style.margin = `${-ringSize}px 0 0 ${-ringSize}px`;
    // Label under the arc apex / below center but above collection peek.
    const labelY = Math.min(
      hostBox.height - bottomInset - 28,
      Math.max(center.y + 36, layout.points.reduce((m, p) => Math.max(m, p.y), 0) + 28),
    );
    label.style.left = `${center.x}px`;
    label.style.top = `${labelY}px`;
    refreshIcons();
  }

  function setActive(id: RadialAction | null) {
    activeId = id;
    blobs.querySelectorAll(".radial-blob").forEach((b) => {
      b.classList.toggle("hot", (b as HTMLElement).dataset.action === id);
    });
    const action = ACTIONS.find((a) => a.id === id);
    if (action) {
      label.hidden = false;
      label.textContent = action.label;
      const btn = blobs.querySelector<HTMLElement>(`[data-action="${id}"]`);
      if (btn) {
        const dir = directionFromCenter(
          center.x,
          center.y,
          parseFloat(btn.style.left),
          parseFloat(btn.style.top),
        );
        opts.onAttention?.(dir.x, dir.y, 1);
      }
    } else {
      label.hidden = true;
      opts.onAttention?.(0, 0, 0);
    }
  }

  function hitTest(clientX: number, clientY: number): RadialAction | null {
    const hostBox = opts.host.getBoundingClientRect();
    const x = clientX - hostBox.left;
    const y = clientY - hostBox.top;
    let best: RadialAction | null = null;
    let bestD = 44;
    blobs.querySelectorAll<HTMLButtonElement>(".radial-blob").forEach((btn) => {
      const bx = parseFloat(btn.style.left);
      const by = parseFloat(btn.style.top);
      const d = Math.hypot(x - bx, y - by);
      if (d < bestD) {
        bestD = d;
        best = btn.dataset.action as RadialAction;
      }
    });
    return best;
  }

  function openMenu() {
    open = true;
    overlay.hidden = false;
    overlay.classList.add("open");
    layoutBlobs();
    ring.style.setProperty("--p", "1");
    opts.onOpen?.();
  }

  function close() {
    open = false;
    overlay.classList.remove("open");
    overlay.hidden = true;
    ring.style.setProperty("--p", "0");
    setActive(null);
    opts.onClose?.();
  }

  function clearPress() {
    pressing = false;
    clearTimeout(timer);
    cancelAnimationFrame(progressRaf);
    if (!open) ring.style.setProperty("--p", "0");
  }

  function tickProgress() {
    if (!pressing || open) return;
    const p = Math.min(1, (performance.now() - pressStart) / longPressMs);
    const anchor = resolveAnchor();
    const size = Math.min(72, Math.max(anchor.r * 1.1, 52));
    ring.style.left = `${anchor.x}px`;
    ring.style.top = `${anchor.y}px`;
    ring.style.width = `${size}px`;
    ring.style.height = `${size}px`;
    ring.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`;
    ring.style.setProperty("--p", String(p));
    if (!overlay.hidden || p > 0.05) overlay.hidden = false;
    progressRaf = requestAnimationFrame(tickProgress);
  }

  const onDown = (e: PointerEvent) => {
    if (open) return;
    pressing = true;
    pressX = e.clientX;
    pressY = e.clientY;
    pressStart = performance.now();
    overlay.hidden = false;
    progressRaf = requestAnimationFrame(tickProgress);
    timer = setTimeout(() => {
      if (!pressing) return;
      openMenu();
    }, longPressMs);
  };

  const onMove = (e: PointerEvent) => {
    if (open) {
      setActive(hitTest(e.clientX, e.clientY));
      return;
    }
    if (!pressing) return;
    if (Math.hypot(e.clientX - pressX, e.clientY - pressY) > moveCancelPx) {
      clearPress();
      if (!open) overlay.hidden = true;
    }
  };

  const onUp = (e: PointerEvent) => {
    if (open) {
      const hit = hitTest(e.clientX, e.clientY) ?? activeId;
      clearPress();
      if (hit) {
        close();
        opts.onAction(hit);
      } else close();
      return;
    }
    clearPress();
    overlay.hidden = true;
  };

  opts.target.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);

  return {
    destroy() {
      clearPress();
      opts.target.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      overlay.remove();
    },
  };
}
