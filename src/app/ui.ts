import {
  dislikeCount,
  favoriteCount,
  hasDislike,
  hasFavorite,
} from './feedback';

export type GalleryTab = 'all' | 'favorites' | 'dislikes';

export type UiCallbacks = {
  onAddMore: () => void;
  onBack: () => void;
  onCopyLink: () => void;
  onExportPng: () => void;
  onToggleFavorite: () => void;
  onToggleDislike: () => void;
  onPrev: () => void;
  onNext: () => void;
  onTab: (tab: GalleryTab) => void;
};

/**
 * Lightweight HTML chrome over the Pixi canvas.
 */
export function createUi(root: HTMLElement, callbacks: UiCallbacks) {
  const bar = document.createElement('div');
  bar.id = 'ui-bar';
  Object.assign(bar.style, {
    position: 'absolute',
    top: '12px',
    left: '12px',
    right: '12px',
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    flexWrap: 'wrap',
    zIndex: '10',
    pointerEvents: 'none',
  } as CSSStyleDeclaration);

  const makeBtn = (label: string, onClick: () => void) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    Object.assign(btn.style, {
      pointerEvents: 'auto',
      border: '1px solid rgba(255,255,255,0.18)',
      background: 'rgba(20,20,28,0.85)',
      color: '#f2f2f7',
      padding: '8px 14px',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: '600',
      letterSpacing: '0.02em',
      backdropFilter: 'blur(8px)',
    } as CSSStyleDeclaration);
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(40,40,55,0.95)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'rgba(20,20,28,0.85)';
    });
    btn.addEventListener('click', onClick);
    return btn;
  };

  const tabAll = makeBtn('Всі', () => callbacks.onTab('all'));
  const tabFav = makeBtn('♥ (0)', () => callbacks.onTab('favorites'));
  const tabDis = makeBtn('👎 (0)', () => callbacks.onTab('dislikes'));
  const addMoreBtn = makeBtn('+4 монстри', callbacks.onAddMore);
  const backBtn = makeBtn('← Галерея', callbacks.onBack);
  const likeBtn = makeBtn('♡', callbacks.onToggleFavorite);
  const dislikeBtn = makeBtn('👎', callbacks.onToggleDislike);
  const copyBtn = makeBtn('Копіювати лінк', callbacks.onCopyLink);
  const exportBtn = makeBtn('PNG', callbacks.onExportPng);

  const seedLabel = document.createElement('span');
  Object.assign(seedLabel.style, {
    marginLeft: 'auto',
    fontSize: '12px',
    opacity: '0.7',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    pointerEvents: 'none',
  } as CSSStyleDeclaration);

  bar.append(
    tabAll,
    tabFav,
    tabDis,
    addMoreBtn,
    backBtn,
    likeBtn,
    dislikeBtn,
    copyBtn,
    exportBtn,
    seedLabel,
  );
  root.appendChild(bar);

  const nameLabel = document.createElement('div');
  Object.assign(nameLabel.style, {
    position: 'absolute',
    bottom: '72px',
    left: '50%',
    transform: 'translateX(-50%)',
    color: '#f2f2f7',
    fontSize: '22px',
    fontWeight: '700',
    letterSpacing: '0.02em',
    textAlign: 'center',
    zIndex: '12',
    pointerEvents: 'none',
    textShadow: '0 2px 12px rgba(0,0,0,0.8)',
    maxWidth: '90%',
    display: 'none',
  } as CSSStyleDeclaration);
  root.appendChild(nameLabel);

  const makeArrow = (label: string, side: 'left' | 'right', onClick: () => void) => {
    const btn = makeBtn(label, onClick);
    btn.style.position = 'absolute';
    btn.style.top = '50%';
    btn.style.transform = 'translateY(-50%)';
    btn.style.zIndex = '12';
    btn.style.fontSize = '28px';
    btn.style.padding = '12px 16px';
    btn.style.display = 'none';
    if (side === 'left') btn.style.left = '12px';
    else btn.style.right = '12px';
    root.appendChild(btn);
    return btn;
  };
  const prevBtn = makeArrow('‹', 'left', callbacks.onPrev);
  const nextBtn = makeArrow('›', 'right', callbacks.onNext);

  const emptyHint = document.createElement('div');
  Object.assign(emptyHint.style, {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    color: 'rgba(255,255,255,0.45)',
    fontSize: '16px',
    textAlign: 'center',
    zIndex: '5',
    pointerEvents: 'none',
    display: 'none',
  } as CSSStyleDeclaration);
  root.appendChild(emptyHint);

  const toast = document.createElement('div');
  Object.assign(toast.style, {
    position: 'absolute',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(20,20,28,0.92)',
    color: '#fff',
    padding: '10px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    opacity: '0',
    transition: 'opacity 0.25s',
    zIndex: '20',
    pointerEvents: 'none',
  } as CSSStyleDeclaration);
  root.appendChild(toast);

  let toastTimer = 0;
  const showToast = (msg: string) => {
    toast.textContent = msg;
    toast.style.opacity = '1';
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.style.opacity = '0';
    }, 1600);
  };

  const setLiked = (liked: boolean) => {
    likeBtn.textContent = liked ? '♥' : '♡';
    likeBtn.style.color = liked ? '#ff5a7a' : '#f2f2f7';
  };
  const setDisliked = (disliked: boolean) => {
    dislikeBtn.style.color = disliked ? '#ffaa44' : '#f2f2f7';
    dislikeBtn.style.borderColor = disliked
      ? 'rgba(255,170,68,0.55)'
      : 'rgba(255,255,255,0.18)';
  };

  const setCounts = () => {
    tabFav.textContent = `♥ (${favoriteCount()})`;
    tabDis.textContent = `👎 (${dislikeCount()})`;
  };

  const setTab = (tab: GalleryTab) => {
    const active = (btn: HTMLButtonElement, on: boolean) => {
      btn.style.borderColor = on ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.18)';
      btn.style.background = on ? 'rgba(55,55,72,0.95)' : 'rgba(20,20,28,0.85)';
    };
    active(tabAll, tab === 'all');
    active(tabFav, tab === 'favorites');
    active(tabDis, tab === 'dislikes');
    addMoreBtn.style.display = tab === 'all' ? 'inline-block' : 'none';
  };

  const setMode = (
    mode: 'gallery' | 'detail',
    opts: {
      seed?: string;
      name?: string;
      tab?: GalleryTab;
      emptyHint?: string;
    } = {},
  ) => {
    const isDetail = mode === 'detail';
    tabAll.style.display = isDetail ? 'none' : 'inline-block';
    tabFav.style.display = isDetail ? 'none' : 'inline-block';
    tabDis.style.display = isDetail ? 'none' : 'inline-block';
    addMoreBtn.style.display =
      isDetail || opts.tab === 'favorites' || opts.tab === 'dislikes' ? 'none' : 'inline-block';
    backBtn.style.display = isDetail ? 'inline-block' : 'none';
    likeBtn.style.display = isDetail ? 'inline-block' : 'none';
    dislikeBtn.style.display = isDetail ? 'inline-block' : 'none';
    copyBtn.style.display = isDetail ? 'inline-block' : 'none';
    exportBtn.style.display = isDetail ? 'inline-block' : 'none';
    prevBtn.style.display = isDetail ? 'block' : 'none';
    nextBtn.style.display = isDetail ? 'block' : 'none';
    nameLabel.style.display = isDetail ? 'block' : 'none';
    nameLabel.textContent = opts.name ?? '';
    emptyHint.style.display = !isDetail && opts.emptyHint ? 'block' : 'none';
    emptyHint.textContent = opts.emptyHint ?? '';

    if (isDetail) {
      seedLabel.textContent = opts.seed ? `seed: ${opts.seed}` : '';
      setLiked(opts.seed ? hasFavorite(opts.seed) : false);
      setDisliked(opts.seed ? hasDislike(opts.seed) : false);
    } else {
      seedLabel.textContent = 'клік · скрол · ←→ · ♥/👎';
      if (opts.tab) setTab(opts.tab);
    }
    setCounts();
  };

  setMode('gallery', { tab: 'all' });

  return {
    setMode,
    setLiked,
    setDisliked,
    setCounts,
    setTab,
    showToast,
    bar,
    nameLabel,
  };
}
