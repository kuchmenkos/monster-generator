import {
  dislikeCount,
  favoriteCount,
  hasDislike,
  hasFavorite,
} from './feedback';

export type GalleryTab = 'all' | 'favorites' | 'dislikes';

export type VoicePanelPreview = {
  index: number;
};

export type VoicePanelState = {
  visible: boolean;
  loading: boolean;
  previews: VoicePanelPreview[] | null;
  selectedIndex: number | null;
  playingIndex: number | null;
};

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
  onGenerateVoices: () => void;
  onPlayPreview: (index: number) => void;
  onSelectVoice: (index: number) => void;
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
  const voiceBarBtn = makeBtn('🎙 Голоси', () => callbacks.onGenerateVoices());
  voiceBarBtn.style.display = 'none';

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
    voiceBarBtn,
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

  // Voice preview panel (detail mode only)
  const voicePanel = document.createElement('div');
  Object.assign(voicePanel.style, {
    position: 'absolute',
    right: '72px',
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'none',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '10px',
    zIndex: '16',
    pointerEvents: 'none',
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(12,12,18,0.92)',
    backdropFilter: 'blur(10px)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    minWidth: '200px',
    maxWidth: 'min(240px, 42vw)',
  } as CSSStyleDeclaration);
  root.appendChild(voicePanel);

  const voicePanelTitle = document.createElement('div');
  voicePanelTitle.textContent = 'Голоси монстра';
  Object.assign(voicePanelTitle.style, {
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    pointerEvents: 'none',
  } as CSSStyleDeclaration);
  voicePanel.appendChild(voicePanelTitle);

  const voiceGenerateBtn = makeBtn('🎙 Згенерувати', () => callbacks.onGenerateVoices());
  voiceGenerateBtn.style.pointerEvents = 'auto';
  voiceGenerateBtn.style.width = '100%';
  voicePanel.appendChild(voiceGenerateBtn);

  const previewRow = document.createElement('div');
  Object.assign(previewRow.style, {
    display: 'none',
    gap: '8px',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    pointerEvents: 'auto',
  } as CSSStyleDeclaration);
  voicePanel.appendChild(previewRow);

  const previewSlots: Array<{
    wrap: HTMLDivElement;
    playBtn: HTMLButtonElement;
    selectBtn: HTMLButtonElement;
  }> = [];

  for (let i = 0; i < 3; i++) {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
    } as CSSStyleDeclaration);

    const playBtn = makeBtn(`▶ ${i + 1}`, () => callbacks.onPlayPreview(i));
    playBtn.style.padding = '6px 10px';
    playBtn.style.fontSize = '12px';
    playBtn.style.minWidth = '44px';

    const selectBtn = document.createElement('button');
    selectBtn.textContent = '○';
    selectBtn.title = 'Обраний голос';
    Object.assign(selectBtn.style, {
      pointerEvents: 'auto',
      border: '1px solid rgba(255,255,255,0.18)',
      background: 'rgba(20,20,28,0.85)',
      color: 'rgba(255,255,255,0.5)',
      padding: '4px 8px',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '12px',
      fontWeight: '600',
      lineHeight: '1',
    } as CSSStyleDeclaration);
    selectBtn.addEventListener('click', () => callbacks.onSelectVoice(i));

    wrap.append(playBtn, selectBtn);
    previewRow.appendChild(wrap);
    previewSlots.push({ wrap, playBtn, selectBtn });
  }

  const setVoicePanel = (state: VoicePanelState) => {
    voicePanel.style.display = state.visible ? 'flex' : 'none';
    voiceBarBtn.style.display = state.visible ? 'inline-block' : 'none';
    voiceGenerateBtn.disabled = state.loading;
    voiceGenerateBtn.style.opacity = state.loading ? '0.55' : '1';
    voiceGenerateBtn.style.cursor = state.loading ? 'wait' : 'pointer';
    voiceGenerateBtn.textContent = state.loading ? 'Генерую…' : '🎙 Згенерувати';
    voiceBarBtn.disabled = state.loading;
    voiceBarBtn.style.opacity = state.loading ? '0.55' : '1';
    voiceBarBtn.textContent = state.loading ? 'Генерую…' : '🎙 Голоси';

    const hasPreviews = !!state.previews && state.previews.length > 0;
    previewRow.style.display = hasPreviews ? 'flex' : 'none';

    previewSlots.forEach((slot, i) => {
      const active = hasPreviews && state.previews!.some((p) => p.index === i);
      slot.wrap.style.display = active ? 'flex' : 'none';

      const playing = state.playingIndex === i;
      slot.playBtn.textContent = playing ? `⏸ ${i + 1}` : `▶ ${i + 1}`;
      slot.playBtn.style.borderColor = playing
        ? 'rgba(120,200,255,0.65)'
        : 'rgba(255,255,255,0.18)';
      slot.playBtn.style.background = playing
        ? 'rgba(40,70,100,0.95)'
        : 'rgba(20,20,28,0.85)';

      const selected = state.selectedIndex === i;
      slot.selectBtn.textContent = selected ? '✓' : '○';
      slot.selectBtn.style.color = selected ? '#7dffb3' : 'rgba(255,255,255,0.45)';
      slot.selectBtn.style.borderColor = selected
        ? 'rgba(125,255,179,0.45)'
        : 'rgba(255,255,255,0.18)';
    });
  };

  // Speech bubble
  const bubble = document.createElement('div');
  Object.assign(bubble.style, {
    position: 'absolute',
    top: '18%',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(255,255,255,0.95)',
    color: '#111',
    padding: '10px 16px',
    borderRadius: '16px',
    fontSize: '16px',
    fontWeight: '700',
    zIndex: '15',
    pointerEvents: 'none',
    display: 'none',
    maxWidth: '70%',
    textAlign: 'center',
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
  } as CSSStyleDeclaration);
  root.appendChild(bubble);

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

  const showSpeech = (text: string) => {
    bubble.textContent = text;
    bubble.style.display = 'block';
  };
  const hideSpeech = () => {
    bubble.style.display = 'none';
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
    voiceBarBtn.style.display = isDetail ? 'inline-block' : 'none';
    prevBtn.style.display = isDetail ? 'block' : 'none';
    nextBtn.style.display = isDetail ? 'block' : 'none';
    nameLabel.style.display = isDetail ? 'block' : 'none';
    nameLabel.textContent = opts.name ?? '';
    emptyHint.style.display = !isDetail && opts.emptyHint ? 'block' : 'none';
    emptyHint.textContent = opts.emptyHint ?? '';
    if (!isDetail) {
      hideSpeech();
      setVoicePanel({
        visible: false,
        loading: false,
        previews: null,
        selectedIndex: null,
        playingIndex: null,
      });
    }

    if (isDetail) {
      seedLabel.textContent = opts.seed
        ? `seed: ${opts.seed} · клік = говорити · 🎙 голоси справа`
        : '';
      setLiked(opts.seed ? hasFavorite(opts.seed) : false);
      setDisliked(opts.seed ? hasDislike(opts.seed) : false);
      setVoicePanel({
        visible: true,
        loading: false,
        previews: null,
        selectedIndex: null,
        playingIndex: null,
      });
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
    showSpeech,
    hideSpeech,
    setVoicePanel,
    bar,
    nameLabel,
  };
}
