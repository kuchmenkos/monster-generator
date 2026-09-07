import "./style/tokens.css";
import "./style/atoms.css";
import "./style/shell.css";
import "./style/sheet.css";
import "./style/base-screen.css";
import "./style/workshop.css";
import "./style/battles.css";
import "./style/reveal.css";
import "./style/fx.css";
import "./style/wallet.css";

import { mountShell } from "./app/shell";
import {
  ensureDefaultRoute,
  onRoute,
  parseHash,
  type Route,
} from "./app/router";
import { mountBase, type AppCtx, type Screen } from "./app/base";
import { mountBattles } from "./app/battles";
import { mountWorkshop } from "./app/workshop";
import { openWallet } from "./app/wallet";
import { Voice } from "./voice";
import { loadSave, saveSave, type SaveV1 } from "./game/state";

const root = document.querySelector<HTMLDivElement>("#app")!;
const shell = mountShell(root);
const voice = new Voice();

let save: SaveV1 = loadSave();
saveSave(save);
shell.updateChrome(save);

const ctx: AppCtx = {
  shell,
  voice,
  getSave: () => save,
  setSave: (s) => {
    save = s;
    shell.updateChrome(s);
  },
};

let current: Screen | undefined;
let currentRoute: Route | undefined;

// Hype chip is global chrome, so the wallet lives above the screens.
shell.onHype = () =>
  openWallet({ ...ctx, onApplied: () => current?.refresh?.() });

function show(route: Route) {
  if (route === currentRoute) return;
  current?.destroy();
  current = undefined;
  currentRoute = route;
  shell.setRouteActive(route);
  document.title =
    route === "base"
      ? "Булала — база"
      : route === "battles"
        ? "Булала — батлы"
        : "Булала — мастерская";
  if (route === "base") current = mountBase(ctx);
  else if (route === "battles") current = mountBattles(ctx);
  else current = mountWorkshop(ctx);
}

ensureDefaultRoute();
show(parseHash());
onRoute(show);

window.addEventListener("pagehide", () => {
  voice.stop();
  current?.destroy();
});

window.addEventListener("storage", (event) => {
  if (event.key === "bulala-save-v1" && event.newValue) {
    try {
      save = JSON.parse(event.newValue);
      shell.updateChrome(save);
      current?.refresh?.();
    } catch {
      /* ignore */
    }
  }
});
