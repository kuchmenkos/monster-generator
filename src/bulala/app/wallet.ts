import { icon, refreshIcons } from "./icons";
import type { ShellApi } from "./shell";
import {
  BOX_HYPE_COST,
  BOX_USD_STUB,
  CARE_DAILY_HYPE,
  DAILY_VOTE_LIMIT,
  FREE_BATTLES_PER_DAY,
  LOSS_HYPE,
  LOSS_REP,
  MAX_BOX_COST,
  MAX_ENERGY,
  MAX_HYPE,
  REP_TIERS,
  STARTER_HYPE,
  VOTE_HYPE,
  WIN_HYPE,
  WIN_REP,
  normalizeBoxCost,
  normalizeHype,
} from "../game/economy";
import {
  boxCostOf,
  saveSave,
  setBoxCost,
  setHype,
  type SaveV1,
} from "../game/state";

export type WalletCtx = {
  shell: ShellApi;
  getSave: () => SaveV1;
  setSave: (s: SaveV1) => void;
  /** Let the active screen repaint prices it rendered earlier. */
  onApplied?: () => void;
};

/** Russian plural forms: 1 бокс / 2 бокса / 5 боксов. */
function plural(n: number, one: string, few: string, many: string): string {
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return one;
  if (d10 >= 2 && d10 <= 4 && (d100 < 10 || d100 >= 20)) return few;
  return many;
}

const row = (lucide: string, gain: string, what: string) =>
  `<li><span class="econ-ico">${icon(lucide)}</span><b>${gain}</b><span>${what}</span></li>`;

/** Kid-readable economy cheat sheet, generated from the real constants. */
function mathHelp(cost: number): string {
  const tiers = REP_TIERS.map((t) => `${t.label} — ${t.min}`).join(" · ");
  return `<details class="econ-help">
  <summary>${icon("CircleHelp")} Как считаются очки?</summary>

  <p class="econ-lead">В игре два разных счётчика. Хайп — это как монетки: их тратишь. Реп — это слава: она только копится.</p>

  <h3>${icon("Zap")} Хайп — монетки на боксы</h3>
  <ul class="econ-list">
    ${row("Swords", `+${WIN_HYPE}`, "выиграл батл")}
    ${row("Shield", `+${LOSS_HYPE}`, "проиграл батл (утешительные)")}
    ${row("ThumbsUp", `+${VOTE_HYPE}`, `проголосовал за чужой батл (до ${DAILY_VOTE_LIMIT} раз в день = +${VOTE_HYPE * DAILY_VOTE_LIMIT})`)}
    ${row("Heart", `+${CARE_DAILY_HYPE}`, "за день покормил, помыл и поговорил — все три дела")}
    ${row("Package", `−${cost}`, "открыл бокс (цену можно менять тут же)")}
  </ul>
  <p class="small-note">На старте в кошельке ${STARTER_HYPE} хайпа — сразу хватает на первый бокс за ${BOX_HYPE_COST}. Ещё есть кнопка «${BOX_USD_STUB}$» — это заглушка оплаты в прототипе.</p>

  <h3>${icon("Trophy")} Реп — слава булалы</h3>
  <ul class="econ-list">
    ${row("Swords", `+${WIN_REP}`, "выиграл батл")}
    ${row("Shield", `+${LOSS_REP}`, "проиграл батл")}
  </ul>
  <p class="small-note">Реп у каждой булалы свой и никогда не тратится. Титулы: ${tiers}.</p>

  <h3>${icon("Scale")} Коэффициент соперника (0.4 — 1.6)</h3>
  <p class="econ-lead">Очки за батл умножаются на коэффициент. Правило простое: <b>дерёшься с сильным — платят больше, обижаешь слабого — платят меньше.</b></p>
  <ul class="econ-list plain">
    <li><b>×1.6</b><span>соперник намного сильнее тебя</span></li>
    <li><b>×1.0</b><span>вы примерно равны</span></li>
    <li><b>×0.4</b><span>соперник совсем слабый — фармить не выйдет</span></li>
  </ul>
  <p class="small-note">Формула: 0.4 + (реп соперника + 200) ÷ (мой реп + 200) × 0.6. Пример: мой реп 1000, у соперника 1500 → ×1.05, то есть за победу ${Math.round(WIN_HYPE * 1.05)} хайпа и ${Math.round(WIN_REP * 1.05)} репа.</p>

  <h3>${icon("BatteryCharging")} Энергия на батлы</h3>
  <ul class="econ-list plain">
    <li><b>${MAX_ENERGY}</b><span>максимум энергии</span></li>
    <li><b>−1</b><span>каждый батл</span></li>
    <li><b>+1</b><span>любое дело: покормить, помыть, поговорить</span></li>
    <li><b>${FREE_BATTLES_PER_DAY}</b><span>батла в день можно и без энергии</span></li>
  </ul>

  <h3>${icon("Timer")} Почему кружочки пустеют</h3>
  <p class="econ-lead">Еда, душ и вайб тают сами: еда наполовину за 18 часов, душ за 24, вайб за 12. Пустые кружки — булала грустит, но очки за заботу вернутся, как только всё сделаешь.</p>
</details>`;
}

/** Wallet sheet: manual hype / box price plus the economy explainer. */
export function openWallet(ctx: WalletCtx): void {
  const { shell } = ctx;
  const save = ctx.getSave();
  const hype = normalizeHype(save.hype);
  const cost = boxCostOf(save);

  const body = shell.modal(
    "Хайп и цены",
    `<div class="wallet">
      <p class="wallet-now"><span>${icon("Zap")} ${hype}</span><em id="wallet-fit"></em></p>
      <div class="field-stack">
        <label for="wallet-hype">Мой хайп (0 — ${MAX_HYPE})</label>
        <input type="number" id="wallet-hype" min="0" max="${MAX_HYPE}" step="10" value="${hype}" inputmode="numeric"/>
        <div class="field-row">
          <button type="button" class="secondary-button" data-hype="0">0</button>
          <button type="button" class="secondary-button" data-hype="${BOX_HYPE_COST}">${BOX_HYPE_COST}</button>
          <button type="button" class="secondary-button" data-hype="10000">10000</button>
        </div>

        <label for="wallet-cost">Бокс стоит хайпа (0 — ${MAX_BOX_COST})</label>
        <input type="number" id="wallet-cost" min="0" max="${MAX_BOX_COST}" step="10" value="${cost}" inputmode="numeric"/>
        <div class="field-row">
          <button type="button" class="secondary-button" data-cost="0">бесплатно</button>
          <button type="button" class="secondary-button" data-cost="${BOX_HYPE_COST}">${BOX_HYPE_COST}</button>
          <button type="button" class="secondary-button" data-cost="2500">2500</button>
        </div>

        <button type="button" class="generate-button" id="wallet-save">${icon("Check")} Применить</button>
      </div>
      ${mathHelp(cost)}
    </div>`,
  );
  refreshIcons();

  const hypeInput = body.querySelector("#wallet-hype") as HTMLInputElement;
  const costInput = body.querySelector("#wallet-cost") as HTMLInputElement;
  const fit = body.querySelector("#wallet-fit") as HTMLElement;

  const previewFit = () => {
    const h = normalizeHype(hypeInput.value);
    const c = normalizeBoxCost(costInput.value);
    if (c === 0) {
      fit.textContent = "боксы бесплатные";
      return;
    }
    const boxes = Math.floor(h / c);
    fit.textContent = boxes
      ? `хватит на ${boxes} ${plural(boxes, "бокс", "бокса", "боксов")}`
      : "на бокс пока не хватает";
  };
  previewFit();
  hypeInput.oninput = previewFit;
  costInput.oninput = previewFit;

  body.querySelectorAll<HTMLButtonElement>("[data-hype]").forEach((b) => {
    b.onclick = () => {
      hypeInput.value = b.dataset.hype!;
      previewFit();
    };
  });
  body.querySelectorAll<HTMLButtonElement>("[data-cost]").forEach((b) => {
    b.onclick = () => {
      costInput.value = b.dataset.cost!;
      previewFit();
    };
  });

  body.querySelector("#wallet-save")!.addEventListener("click", () => {
    const next = setBoxCost(
      setHype(ctx.getSave(), normalizeHype(hypeInput.value)),
      normalizeBoxCost(costInput.value),
    );
    ctx.setSave(next);
    saveSave(next);
    shell.closeModal();
    ctx.onApplied?.();
    shell.toast(`Хайп ${next.hype} · бокс ${boxCostOf(next)}`);
  });
}
