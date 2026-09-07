import type { AppCtx, Screen } from "./base";
import { icon, refreshIcons } from "./icons";
import { BattleStage } from "./battle-stage";
import { Voice } from "../voice";
import { character } from "../genome";
import {
  refreshBattles,
  voteBattle,
  saveSave,
  displayName,
  getActive,
} from "../game/state";
import type { BattleRecord } from "../game/battle";
import { countryRanking, COUNTRIES, guessCountry } from "../game/ranking";
import { votesRemaining } from "../game/economy";
import { prefetchSpeak } from "../game/tts-cache";
import { karaokeTiming } from "../fx/needs-map";
import { gong, whoosh } from "../fx/sfx";
import { mountSheet } from "./sheet";

export function mountBattles(ctx: AppCtx): Screen {
  const { shell, voice } = ctx;
  let save = refreshBattles(ctx.getSave());
  ctx.setSave(save);
  saveSave(save);

  const root = document.createElement("section");
  root.className = "battles-screen";
  root.innerHTML = `
    <div class="battles-scroll">
      <div class="battles-head">
        <div>
          <h2>Батлы</h2>
          <p class="small-note">Смотри · голосуй · копи реп</p>
        </div>
        <span class="vote-left" id="vote-left"></span>
      </div>
      <div class="country-seg" id="country-seg" role="tablist"></div>
      <div class="battle-feed" id="battle-feed"></div>
      <aside class="rank-panel">
        <h3>Рейтинг ${icon("Trophy")}</h3>
        <ol id="rank-list"></ol>
      </aside>
    </div>
    <div class="battle-player" id="battle-player" hidden>
      <button class="icon-button battle-close" id="close-player" aria-label="Закрыть">${icon("X")}</button>
      <div class="round-pips" id="round-pips">
        <i data-r="1"></i><i data-r="2"></i><i data-r="3"></i>
      </div>
      <div class="battle-stage" id="duel-stage"></div>
      <div class="speaker-tag" id="speaker-tag" hidden></div>
      <div class="battle-sub" id="battle-sub"></div>
      <div class="round-card" id="round-card" hidden></div>
      <div class="mic-drop" id="mic-drop" hidden>МИК ДРОП</div>
    </div>`;
  shell.content.replaceChildren(root);
  refreshIcons();

  let country = save.country || guessCountry();
  const countrySeg = root.querySelector("#country-seg")!;
  const countries = [...COUNTRIES.slice(0, 6), "ALL"];
  countrySeg.innerHTML = countries
    .map(
      (c) =>
        `<button type="button" class="seg ${c === country ? "active" : ""}" data-c="${c}">${c}</button>`,
    )
    .join("");
  countrySeg.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-c]");
    if (!btn) return;
    country = btn.dataset.c!;
    countrySeg.querySelectorAll(".seg").forEach((s) =>
      s.classList.toggle("active", s === btn),
    );
    if (country !== "ALL") {
      save = { ...ctx.getSave(), country };
      ctx.setSave(save);
      saveSave(save);
    }
    paintRank();
  });

  let duel: BattleStage | undefined;
  let playing = false;
  const playerVoice = voice;
  const voteSheet = mountSheet({
    host: root,
    title: "Кто победил?",
  });

  const paintRank = () => {
    save = ctx.getSave();
    const mine = save.creatures.map((c) => ({
      name: displayName(c),
      rep: c.rep,
      seed: c.genome.seed,
    }));
    const rows = countryRanking(country, mine);
    root.querySelector("#rank-list")!.innerHTML = rows
      .map(
        (r) =>
          `<li class="${r.mine ? "mine" : ""}"><span class="rk">${r.rank}</span><strong>${r.name}</strong><em>${r.tier}</em><span>${r.rep}</span></li>`,
      )
      .join("");
  };

  const paintFeed = () => {
    save = ctx.getSave();
    shell.updateChrome(save);
    root.querySelector("#vote-left")!.textContent =
      `${votesRemaining(save.dailyVotes)} голосов`;
    const feed = root.querySelector("#battle-feed")!;
    if (!save.battles.length) {
      feed.innerHTML = `<div class="empty-recent">${icon("Swords")} Батлов пока нет. Зажми булалу на Базе → Батл.</div>`;
      refreshIcons();
      return;
    }
    const totalVotes = (b: BattleRecord) =>
      Math.max(1, b.votes.a + b.votes.b);
    feed.innerHTML = save.battles
      .map((b, i) => {
        const a = character(b.a.genome).name;
        const bb = character(b.b.genome).name;
        const status =
          b.status === "settled"
            ? `Победа: ${b.winner === "a" ? a : bb}`
            : "На суде";
        const pct = Math.round((b.votes.a / totalVotes(b)) * 100);
        return `<button class="battle-card" data-battle="${i}">
          <div class="vs-row"><strong>${a}</strong><span class="vs">VS</span><strong>${bb}</strong></div>
          <span>${status}</span>
          <div class="vote-bar"><i style="width:${pct}%"></i></div>
          <span class="vote-nums">${b.votes.a}:${b.votes.b}</span>
        </button>`;
      })
      .join("");
  };

  const closePlayer = () => {
    playing = false;
    playerVoice.stop();
    duel?.dispose();
    duel = undefined;
    (root.querySelector("#battle-player") as HTMLElement).hidden = true;
    voteSheet.close();
  };

  root.querySelector("#close-player")!.addEventListener("click", closePlayer);

  async function showRoundCard(n: number) {
    const card = root.querySelector("#round-card") as HTMLElement;
    card.hidden = false;
    card.textContent = `РАУНД ${n}`;
    card.classList.remove("out");
    card.classList.add("in");
    gong();
    await sleep(900);
    card.classList.remove("in");
    card.classList.add("out");
    await sleep(280);
    card.hidden = true;
  }

  async function playKaraoke(
    el: HTMLElement,
    text: string,
    durationMs: number,
  ) {
    const words = karaokeTiming(text, durationMs);
    el.innerHTML = `<p class="karaoke">${words.map((w, i) => `<span data-i="${i}">${w.word}</span>`).join(" ")}</p>`;
    const start = performance.now();
    return new Promise<void>((resolve) => {
      const tick = () => {
        if (!playing) return resolve();
        const t = performance.now() - start;
        el.querySelectorAll("span").forEach((s) => {
          const i = Number((s as HTMLElement).dataset.i);
          s.classList.toggle("on", words[i] && t >= words[i].at);
          s.classList.toggle(
            "hot",
            words[i] &&
              t >= words[i].at &&
              (i + 1 >= words.length || t < words[i + 1].at),
          );
        });
        if (t >= durationMs) return resolve();
        requestAnimationFrame(tick);
      };
      tick();
    });
  }

  async function playBattle(battle: BattleRecord) {
    closePlayer();
    playing = true;
    const panel = root.querySelector("#battle-player") as HTMLElement;
    panel.hidden = false;
    const stageHost = root.querySelector("#duel-stage") as HTMLElement;
    stageHost.innerHTML = "";
    duel = new BattleStage(stageHost);
    await duel.setPair(battle.a.genome, battle.b.genome);
    const sub = root.querySelector("#battle-sub")!;
    const tag = root.querySelector("#speaker-tag") as HTMLElement;
    const pips = root.querySelectorAll("#round-pips i");
    const drop = root.querySelector("#mic-drop") as HTMLElement;
    drop.hidden = true;

    const provider =
      (localStorage.getItem("bulala-tts-provider") as "demo" | "elevenlabs") ||
      "demo";

    let lastRound = 0;
    const pump = () => {
      if (!playing || !duel) return;
      duel.speech = playerVoice.level();
      requestAnimationFrame(pump);
    };
    pump();

    for (let i = 0; i < battle.bars.length; i++) {
      if (!playing) return;
      const bar = battle.bars[i];
      if (bar.round !== lastRound) {
        lastRound = bar.round;
        pips.forEach((p) => {
          const r = Number((p as HTMLElement).dataset.r);
          p.classList.toggle("done", r < bar.round);
          p.classList.toggle("now", r === bar.round);
        });
        await showRoundCard(bar.round);
      }

      const side = bar.side;
      const genome = side === "a" ? battle.a.genome : battle.b.genome;
      const name = character(genome).name;
      duel.setActive(side);
      tag.hidden = false;
      tag.textContent = name;
      tag.dataset.side = side;

      let nextPrefetch: ReturnType<typeof prefetchSpeak> | null = null;
      if (provider === "elevenlabs" && i + 1 < battle.bars.length) {
        const next = battle.bars[i + 1];
        const ng = next.side === "a" ? battle.a.genome : battle.b.genome;
        nextPrefetch = prefetchSpeak(
          next.text,
          ng.seed,
          "",
          character(ng).pitch,
        );
      }

      const fallbackMs = Math.min(8000, 1800 + bar.text.length * 40);
      const karaokePromise = playKaraoke(
        sub as HTMLElement,
        bar.text,
        fallbackMs,
      );
      try {
        await playerVoice.speak(bar.text, genome, provider, "");
        await waitUntilIdle(playerVoice);
      } catch {
        await sleep(fallbackMs);
      }
      await karaokePromise;
      void nextPrefetch;
      duel.speech = 0;
      await sleep(280);
    }

    if (!playing) return;
    duel.setActive(null);
    tag.hidden = true;
    drop.hidden = false;
    whoosh();
    await sleep(900);
    drop.hidden = true;
    sub.innerHTML = `<p>Кто победил по вайбу?</p>`;

    const aName = character(battle.a.genome).name;
    const bName = character(battle.b.genome).name;
    voteSheet.setTitle("Кто победил?");
    voteSheet.setBody(
      battle.myVote
        ? `<p class="small-note">Ты уже голосовал за ${battle.myVote === "a" ? aName : bName}.</p>`
        : `<div class="vote-picks">
            <button data-vote="a" class="vote-pick">${aName}</button>
            <button data-vote="b" class="vote-pick">${bName}</button>
          </div>`,
    );
    voteSheet.open("full");
    voteSheet.body.onclick = (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
        "[data-vote]",
      );
      if (!btn || battle.myVote) return;
      const side = btn.dataset.vote as "a" | "b";
      const result = voteBattle(ctx.getSave(), battle.id, side);
      if (result.error) {
        shell.toast(result.error);
        return;
      }
      ctx.setSave(result.save);
      saveSave(result.save);
      shell.toast("Голос учтён. +хайп");
      paintFeed();
      paintRank();
      voteSheet.setBody(
        `<p class="small-note">Спасибо. Вердикт: ${result.save.battles.find((b) => b.id === battle.id)?.status}</p>`,
      );
    };
  }

  root.querySelector("#battle-feed")!.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-battle]",
    );
    if (!btn) return;
    const battle = ctx.getSave().battles[Number(btn.dataset.battle)];
    if (battle) void playBattle(battle);
  });

  shell.updateChrome(save);
  paintFeed();
  paintRank();

  const active = getActive(save);
  if (active && save.battles.length === 0)
    shell.toast(`Отправь ${displayName(active)} в батл с Базы.`);

  return {
    destroy() {
      playing = false;
      playerVoice.stop();
      duel?.dispose();
      voteSheet.destroy();
    },
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function waitUntilIdle(voice: Voice) {
  return new Promise<void>((resolve) => {
    const start = performance.now();
    const check = () => {
      if (!voice.active) return resolve();
      if (performance.now() - start > 45000) return resolve();
      requestAnimationFrame(check);
    };
    setTimeout(check, 80);
  });
}
