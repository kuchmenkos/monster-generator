import { mountSheet, type SheetApi } from "./sheet";
import { icon, refreshIcons } from "./icons";
import {
  displayName,
  getActive,
  setActive,
  type OwnedBulala,
  type SaveV1,
} from "../game/state";
import { needsAt } from "../game/care";
import { repTier } from "../game/economy";
import { palettes, signature } from "../genome";
import {
  getPreview,
  previewUrl,
  putPreview,
  toWebpPreview,
} from "../game/store";
import { parseCollection } from "../collection";

export type CollectionSheet = {
  refresh: (save: SaveV1) => Promise<void>;
  destroy: () => void;
  sheet: SheetApi;
};

type Opts = {
  host: HTMLElement;
  getSave: () => SaveV1;
  setSave: (s: SaveV1) => void;
  onSelect: (creature: OwnedBulala) => void;
  onBox: () => void;
  /** Generate a PNG dataURL when IndexedDB has no preview yet. */
  renderPreview?: (creature: OwnedBulala) => Promise<string | null>;
};

const LEGACY_KEY = "bulala-collection-v1";

function paletteCss(c: OwnedBulala): string {
  const p = palettes[c.genome.genes.palette] ?? palettes[0];
  return p[1] || p[0] || "#ebe6dc";
}

function legacyImageMap(): Map<string, string> {
  try {
    const legacy = parseCollection(localStorage.getItem(LEGACY_KEY) || "[]");
    return new Map(legacy.map((s) => [signature(s.genome), s.image]));
  } catch {
    return new Map();
  }
}

export function mountCollectionSheet(opts: Opts): CollectionSheet {
  // Compact dock — always visible, no sheet chrome eating the peek.
  const dock = document.createElement("div");
  dock.className = "col-dock";
  dock.innerHTML = `
    <div class="col-dock-rail" data-rail></div>
    <button type="button" class="col-dock-more" data-more aria-label="Вся коллекция">
      ${icon("LayoutGrid")}<span>все</span>
    </button>`;
  opts.host.append(dock);
  refreshIcons();

  const syncDockHeight = () => {
    const h = Math.ceil(dock.getBoundingClientRect().height || 92);
    opts.host.style.setProperty("--dock-h", `${h}px`);
  };
  requestAnimationFrame(syncDockHeight);
  const ro =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(syncDockHeight)
      : null;
  ro?.observe(dock);

  const sheet = mountSheet({
    host: opts.host,
    title: "Коллекция",
    persistent: false,
  });
  sheet.close();

  const urls = new Map<string, string>();
  const pending = new Map<string, Promise<string | null>>();
  let paintGen = 0;
  let backfillDone = false;
  let legacyCache: Map<string, string> | null = null;
  let renderQueue: Promise<void> = Promise.resolve();

  const revokeAll = () => {
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls.clear();
  };

  const legacyImg = (id: string) => {
    legacyCache ??= legacyImageMap();
    return legacyCache.get(id) ?? null;
  };

  /** Prefer IDB → legacy PNG → live thumbnail render (serialized). */
  const ensurePreview = (c: OwnedBulala): Promise<string | null> => {
    if (urls.has(c.id)) return Promise.resolve(urls.get(c.id)!);
    const hit = pending.get(c.id);
    if (hit) return hit;

    const job = (async () => {
      let u = await previewUrl(c.id);
      if (u) {
        urls.set(c.id, u);
        return u;
      }

      const legacy = legacyImg(c.id);
      if (legacy) {
        try {
          const blob = await toWebpPreview(legacy);
          await putPreview(c.id, blob);
          u = await previewUrl(c.id);
          if (u) {
            urls.set(c.id, u);
            return u;
          }
        } catch {
          /* fall through */
        }
      }

      if (opts.renderPreview) {
        // Serialize WebGL thumbnail captures — Stage shares one renderer.
        const captured = await new Promise<string | null>((resolve) => {
          renderQueue = renderQueue
            .then(async () => {
              try {
                resolve(await opts.renderPreview!(c));
              } catch {
                resolve(null);
              }
            })
            .catch(() => resolve(null));
        });
        if (captured) {
          try {
            const blob = await toWebpPreview(captured);
            await putPreview(c.id, blob);
            u = await previewUrl(c.id);
            if (u) {
              urls.set(c.id, u);
              return u;
            }
          } catch {
            /* ignore */
          }
        }
      }
      return null;
    })().finally(() => pending.delete(c.id));

    pending.set(c.id, job);
    return job;
  };

  const critical = (c: OwnedBulala) => {
    const n = needsAt(c.care);
    return n.hunger < 0.35 || n.clean < 0.4 || n.mood < 0.35;
  };

  const chipHtml = (
    c: OwnedBulala,
    activeId: string | null,
    img: string | null,
  ) => {
    const tier = repTier(c.rep);
    const bg = paletteCss(c);
    return `<button type="button" class="col-chip ${activeId === c.id ? "active" : ""} ${critical(c) ? "warn" : ""}" data-id="${c.id}" style="--ph:${bg}" title="${displayName(c)} · ${tier.label}">
      ${img ? `<img src="${img}" alt="" loading="lazy"/>` : `<span class="col-ph"></span>`}
      <em>${displayName(c)}</em>
      ${critical(c) ? `<i class="col-dot"></i>` : ""}
    </button>`;
  };

  const fillImage = (root: ParentNode, id: string, img: string) => {
    const btn = root.querySelector<HTMLElement>(`[data-id="${id}"]`);
    if (!btn || btn.querySelector("img")) return;
    const ph = btn.querySelector(".col-ph");
    const el = document.createElement("img");
    el.src = img;
    el.alt = "";
    el.loading = "lazy";
    ph ? ph.replaceWith(el) : btn.prepend(el);
  };

  const paintDock = async (save: SaveV1, gen: number) => {
    const active = getActive(save);
    const sorted = [...save.creatures].sort((a, b) => b.rep - a.rep);
    const rail = dock.querySelector("[data-rail]")!;

    rail.innerHTML =
      sorted
        .map((c) => chipHtml(c, active?.id ?? null, urls.get(c.id) ?? null))
        .join("") +
      `<button type="button" class="col-chip add" data-box aria-label="Открыть бокс">+</button>`;

    // Scroll active into view.
    const activeBtn = rail.querySelector(".col-chip.active");
    activeBtn?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });

    await Promise.all(
      sorted.map(async (c) => {
        const img = await ensurePreview(c);
        if (gen !== paintGen || !img) return;
        fillImage(rail, c.id, img);
      }),
    );
  };

  const paintSheet = async (save: SaveV1, gen: number) => {
    const active = getActive(save);
    const sorted = [...save.creatures].sort((a, b) => b.rep - a.rep);

    sheet.setBody(`
      <div class="col-grid">
        ${sorted
          .map((c) => {
            const tier = repTier(c.rep);
            const img = urls.get(c.id);
            const bg = paletteCss(c);
            return `<button type="button" class="col-card ${active?.id === c.id ? "active" : ""}" data-id="${c.id}" style="--ph:${bg}">
              ${img ? `<img src="${img}" alt=""/>` : `<span class="col-ph tall"></span>`}
              <strong>${displayName(c)}</strong>
              <span>${tier.label} · ${c.rep} реп</span>
            </button>`;
          })
          .join("")}
        <button type="button" class="col-card add" data-box>${icon("Package")}<strong>Новый бокс</strong></button>
      </div>`);
    refreshIcons();

    await Promise.all(
      sorted.map(async (c) => {
        const img = await ensurePreview(c);
        if (gen !== paintGen || !img) return;
        fillImage(sheet.body, c.id, img);
      }),
    );
  };

  const paint = async (save: SaveV1) => {
    const gen = ++paintGen;
    await paintDock(save, gen);
    if (sheet.getSnap() === "full") await paintSheet(save, gen);
  };

  const pick = (id: string) => {
    const save = opts.getSave();
    const c = save.creatures.find((x) => x.id === id);
    if (!c) return;
    const next = setActive(save, c.id);
    opts.setSave(next);
    opts.onSelect(c);
    void paint(next);
    if (sheet.getSnap() === "full") sheet.close();
  };

  dock.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-more]")) {
      void paintSheet(opts.getSave(), paintGen);
      sheet.open("full");
      return;
    }
    if (t.closest("[data-box]")) {
      opts.onBox();
      return;
    }
    const btn = t.closest<HTMLButtonElement>("[data-id]");
    if (btn?.dataset.id) pick(btn.dataset.id);
  });

  sheet.body.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-box]")) {
      opts.onBox();
      sheet.close();
      return;
    }
    const btn = t.closest<HTMLButtonElement>("[data-id]");
    if (btn?.dataset.id) pick(btn.dataset.id);
  });

  const backfill = async (save: SaveV1) => {
    if (backfillDone) return;
    backfillDone = true;
    const byId = legacyImageMap();
    for (const c of save.creatures) {
      if (await getPreview(c.id)) continue;
      const img = byId.get(c.id);
      if (!img) continue;
      try {
        await putPreview(c.id, await toWebpPreview(img));
      } catch {
        /* ignore */
      }
    }
  };

  return {
    sheet,
    async refresh(save) {
      const gen = ++paintGen;
      await paintDock(save, gen);
      void backfill(save).then(async () => {
        if (gen !== paintGen) return;
        // Re-fill any images that arrived from legacy after first paint.
        for (const c of save.creatures) {
          if (urls.has(c.id)) continue;
          const img = await ensurePreview(c);
          if (gen !== paintGen || !img) continue;
          fillImage(dock.querySelector("[data-rail]")!, c.id, img);
          if (sheet.getSnap() === "full") fillImage(sheet.body, c.id, img);
        }
      });
    },
    destroy() {
      ro?.disconnect();
      revokeAll();
      dock.remove();
      sheet.destroy();
    },
  };
}
