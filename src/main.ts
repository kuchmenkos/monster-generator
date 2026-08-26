import { Application, Container, Rectangle } from 'pixi.js';
import { DetailView } from './app/detail';
import {
  dislikeCount,
  favoriteCount,
  listDislikes,
  listFavorites,
  syncToDisk,
  toggleDislike,
  toggleFavorite,
} from './app/feedback';
import { Gallery } from './app/gallery';
import { createUi, type GalleryTab } from './app/ui';
import { generateMonster } from './core/monster';
import { MonsterView } from './render/MonsterView';

type Mode = 'gallery' | 'detail';

const GALLERY_SEEDS_KEY = 'bulalashka-gallery-seeds';

function loadGallerySeeds(): string[] {
  try {
    const raw = sessionStorage.getItem(GALLERY_SEEDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === 'string' && s.length > 0);
  } catch {
    return [];
  }
}

function saveGallerySeeds(seeds: string[]): void {
  sessionStorage.setItem(GALLERY_SEEDS_KEY, JSON.stringify(seeds));
}

function readSeedFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const seed = params.get('seed');
  return seed && seed.length > 0 ? seed : null;
}

function writeSeedToUrl(seed: string | null): void {
  const url = new URL(window.location.href);
  if (seed) url.searchParams.set('seed', seed);
  else url.searchParams.delete('seed');
  window.history.replaceState({}, '', url.toString());
}

async function main() {
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) throw new Error('#app not found');

  const app = new Application();
  await app.init({
    background: '#050508',
    resizeTo: root,
    antialias: false,
    preference: 'webgl',
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    roundPixels: true,
  });
  root.appendChild(app.canvas);

  let mode: Mode = 'gallery';
  let scrollY = 0;
  let galleryTab: GalleryTab = 'all';
  let navSeeds: string[] = [];
  let currentName = '';

  const cols = Math.max(3, Math.min(8, Math.floor(window.innerWidth / 150)));
  const rows = Math.max(2, Math.ceil(12 / cols));
  const cellSize = Math.min(150, Math.floor((window.innerWidth - 24) / cols));

  const allSeeds: string[] = [];

  const emptyHintFor = (tab: GalleryTab): string | undefined => {
    if (tab === 'all' && gallery.seedList.length === 0) {
      return 'Натисни +1, щоб згенерувати булalashку';
    }
    if (tab === 'favorites' && favoriteCount() === 0) return 'Лайкни когось страшненького ♥';
    if (tab === 'dislikes' && dislikeCount() === 0) return 'Немає дізлайків — поки що';
    return undefined;
  };

  const showGallery = () => {
    mode = 'gallery';
    detail.visible = false;
    detail.clear();
    gallery.visible = true;
    writeSeedToUrl(null);
    ui.setMode('gallery', { tab: galleryTab, emptyHint: emptyHintFor(galleryTab) });
    layout();
  };

  const openDetail = (seed: string, seedsContext: string[]) => {
    mode = 'detail';
    gallery.visible = false;
    detail.visible = true;
    const data = detail.show(seed);
    currentName = data.name;
    navSeeds = seedsContext;
    writeSeedToUrl(seed);
    ui.setMode('detail', { seed, name: data.name });
    layout();
  };

  const showDetail = (seed: string) => {
    openDetail(seed, gallery.seedList);
  };

  const navigate = (delta: number) => {
    if (mode !== 'detail' || navSeeds.length === 0) return;
    const idx = navSeeds.indexOf(detail.seed);
    if (idx < 0) return;
    const next = navSeeds[(idx + delta + navSeeds.length) % navSeeds.length]!;
    openDetail(next, navSeeds);
  };

  const switchTab = (tab: GalleryTab) => {
    galleryTab = tab;
    scrollY = 0;
    if (allSeeds.length === 0) allSeeds.push(...gallery.seedList);
    if (tab === 'all') {
      gallery.rebuild(allSeeds.length ? allSeeds : gallery.seedList);
    } else if (tab === 'favorites') {
      gallery.rebuild(listFavorites().map((f) => f.seed));
    } else {
      gallery.rebuild(listDislikes().map((f) => f.seed));
    }
    showGallery();
  };

  const capturePng = async (seed: string): Promise<string | undefined> => {
    try {
      const size = 256;
      const data = generateMonster(seed);
      const wrap = new Container();
      const temp = new MonsterView({ data, scale: 40 });
      temp.fitInto(size * 0.85, size * 0.85);
      temp.x = size / 2;
      temp.y = size / 2;
      temp.tick(0.2);
      wrap.addChild(temp);
      const canvas = await app.renderer.extract.canvas({
        target: wrap,
        clearColor: '#050508',
        resolution: 1,
        frame: new Rectangle(0, 0, size, size),
      });
      const url = (canvas as HTMLCanvasElement).toDataURL('image/png');
      wrap.destroy({ children: true });
      return url;
    } catch {
      return undefined;
    }
  };

  const gallery = new Gallery({
    cols,
    rows,
    cellSize,
    padding: 12,
    seeds: loadGallerySeeds(),
    onSelect: (seed) => showDetail(seed),
  });
  allSeeds.push(...gallery.seedList);

  const detail = new DetailView();
  detail.visible = false;

  app.stage.addChild(gallery);
  app.stage.addChild(detail);

  const ui = createUi(root, {
    onAddMore: () => {
      if (galleryTab !== 'all') return;
      gallery.append(1);
      allSeeds.length = 0;
      allSeeds.push(...gallery.seedList);
      saveGallerySeeds(gallery.seedList);
      ui.showToast('+1 новий монстр');
      ui.setMode('gallery', { tab: galleryTab, emptyHint: emptyHintFor(galleryTab) });
      layout();
    },
    onBack: () => showGallery(),
    onCopyLink: async () => {
      const seed = detail.seed;
      if (!seed) return;
      writeSeedToUrl(seed);
      try {
        await navigator.clipboard.writeText(window.location.href);
        ui.showToast('Лінк скопійовано');
      } catch {
        ui.showToast(window.location.href);
      }
    },
    onExportPng: () => {
      void exportPng();
    },
    onToggleFavorite: async () => {
      const seed = detail.seed;
      if (!seed) return;
      const liked = toggleFavorite(seed, currentName || seed);
      ui.setLiked(liked);
      ui.setDisliked(false);
      ui.setCounts();
      const png = liked ? await capturePng(seed) : undefined;
      await syncToDisk('like', seed, currentName || seed, liked ? 'add' : 'remove', png);
      if (liked) await syncToDisk('dislike', seed, currentName || seed, 'remove');
      ui.showToast(liked ? 'Збережено в улюблені' : 'Прибрано з улюблених');
    },
    onToggleDislike: async () => {
      const seed = detail.seed;
      if (!seed) return;
      const disliked = toggleDislike(seed, currentName || seed);
      ui.setDisliked(disliked);
      ui.setLiked(false);
      ui.setCounts();
      const png = disliked ? await capturePng(seed) : undefined;
      await syncToDisk('dislike', seed, currentName || seed, disliked ? 'add' : 'remove', png);
      if (disliked) await syncToDisk('like', seed, currentName || seed, 'remove');
      ui.showToast(disliked ? 'У дізлайки (для агента)' : 'Прибрано з дізлайків');
    },
    onPrev: () => navigate(-1),
    onNext: () => navigate(1),
    onTab: (tab) => switchTab(tab),
  });

  const layout = () => {
    const w = app.screen.width;
    const h = app.screen.height;
    if (mode === 'gallery') {
      gallery.x = Math.max(0, (w - gallery.contentWidth) * 0.5);
      gallery.y = 56 - scrollY;
      gallery.setViewport(scrollY, h);
    } else {
      detail.layout(w, h);
    }
  };

  const exportPng = async () => {
    const seed = detail.seed;
    if (!seed || !detail.monster) {
      ui.showToast('Немає монстра для експорту');
      return;
    }
    try {
      const size = 512;
      const data = generateMonster(seed);
      const wrap = new Container();
      const temp = new MonsterView({ data, scale: 80 });
      temp.fitInto(size * 0.85, size * 0.85);
      temp.x = size / 2;
      temp.y = size / 2;
      temp.tick(0.35);
      wrap.addChild(temp);
      const canvas = await app.renderer.extract.canvas({
        target: wrap,
        clearColor: '#050508',
        resolution: 2,
        frame: new Rectangle(0, 0, size, size),
      });
      const link = document.createElement('a');
      link.download = `monster-${data.name}-${seed}.png`;
      link.href = (canvas as HTMLCanvasElement).toDataURL('image/png');
      link.click();
      wrap.destroy({ children: true });
      ui.showToast('PNG збережено');
    } catch (err) {
      console.error(err);
      ui.showToast('Експорт не вдався');
    }
  };

  app.canvas.addEventListener(
    'wheel',
    (e) => {
      if (mode !== 'gallery') return;
      e.preventDefault();
      const maxScroll = Math.max(0, gallery.contentHeight - app.screen.height + 64);
      scrollY = Math.max(0, Math.min(maxScroll, scrollY + e.deltaY));
      layout();
    },
    { passive: false },
  );

  window.addEventListener('keydown', (e) => {
    if (mode !== 'detail') return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      navigate(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      navigate(1);
    } else if (e.key === 'Escape') {
      showGallery();
    }
  });

  window.addEventListener('resize', () => {
    layout();
  });

  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000;
    if (mode === 'gallery') gallery.tick(dt);
    else detail.tick(dt);
  });

  const initial = readSeedFromUrl();
  if (initial) openDetail(initial, gallery.seedList);
  else showGallery();

  layout();
}

main().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#f88;padding:24px">${String(err)}</pre>`;
});
