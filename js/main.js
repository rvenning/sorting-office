// Sorting Office — screens, storage wiring and the frame loop.
//
// Everything that touches the DOM lives here. game.js decides what is true and
// emits events; this file animates them and writes them down.

const App = {
  profile: null,
  progress: null,
  loadout: null,
  active: false,          // is the game screen the one showing?
  paused: false,
  lastTs: 0,
  _banked: 0,

  init() {
    Render.boot();
    this.wireGame();

    GK.UI.onScreenChange = (name) => {
      this.active = name === "game";
      if (name === "game") Render.resize();
      if (name === "splash") this.refreshSplash();
    };

    GK.Profiles.init({
      storage: Storage,
      avatars: ["📦", "🚚", "🐱", "🦄", "🦖", "🐸", "🦉", "🚀", "🌈", "🧁", "🤖", "👑"],
      meta: (p, prog) => {
        const stars = Storage.totalStars(prog);
        return `⭐ ${stars}/${SHIFTS.length * 3} · 🪙 ${Storage.coins(prog)}`;
      },
      onEnter: (p) => this.enter(p),
      addLabel: "New Sorter",
    });

    GK.initPWA({ appName: "Sorting Office" });
    GK.UI.bindSoundToggle(Storage);

    Storage.initFirebase().then((live) => {
      const badge = document.getElementById("sync-badge");
      if (badge) badge.textContent = live ? "☁️ synced with the family" : "📴 this device only";
    });

    this.refreshSplash();

    GK.Debug.init({ storage: Storage, title: "SORTING OFFICE" })
      .jump("shift", SHIFTS.length, (n) => this.startShift(n - 1))
      .action("finish shift", () => { while (Game.running) Game.sort(Game.destOf(Game.parcel)); })
      .action("rush hour", () => this.startRush());

    requestAnimationFrame((ts) => this.frame(ts));
  },

  /* ---------- splash & profiles ---------- */

  refreshSplash() {
    const last = GK.Profiles.lastProfile();
    const btn = document.getElementById("btn-continue-as");
    if (!btn) return;
    if (last) {
      btn.style.display = "";
      btn.innerHTML = `${last.avatar} Carry on, ${GK.util.esc(last.name)}`;
      btn.onclick = () => GK.Profiles.select(last);
    } else {
      btn.style.display = "none";
    }
  },

  play() { GK.Profiles.renderList(); GK.UI.showScreen("profiles"); },

  enter(profile) {
    this.profile = profile;
    this.progress = Storage.getProgress(profile.id);
    this.loadout = upgradeLoadout(this.progress);
    GK.Sfx.init();
    this.showMap();
  },

  /* ---------- the level map ---------- */

  showMap() {
    this.progress = Storage.getProgress(this.profile.id);
    this.loadout = upgradeLoadout(this.progress);
    const unlocked = Storage.unlockedShift(this.progress);

    document.getElementById("map-player").innerHTML =
      `${this.profile.avatar} <b>${GK.util.esc(this.profile.name)}</b>` +
      `<span class="map-stats">⭐ ${Storage.totalStars(this.progress)} · 🪙 ${Storage.coins(this.progress)}</span>`;

    const cont = document.getElementById("btn-continue");
    cont.innerHTML = `▶️ Shift ${unlocked + 1} — ${GK.util.esc(SHIFTS[unlocked].name)}`;
    cont.onclick = () => this.startShift(unlocked);

    const rush = document.getElementById("btn-rush");
    const rushOpen = Storage.rushUnlocked(this.progress);
    rush.disabled = !rushOpen;
    rush.innerHTML = rushOpen
      ? `⏱️ Rush Hour${this.progress.rushScore ? ` — best ${this.progress.rushScore}` : ""}`
      : `🔒 Rush Hour (pass ${RUSH_UNLOCK_SHIFTS} shifts)`;

    document.getElementById("shift-list").innerHTML = DEPARTMENTS.map((dept, di) => {
      const rows = SHIFTS.map((s, i) => [s, i]).filter(([s]) => s.dept === di);
      const done = rows.every(([, i]) => this.progress.shifts[i]);
      return `<section class="dept${done ? " done" : ""}" style="--dept:${dept.hue}">
        <header class="dept-head"><span class="dept-icon">${dept.icon}</span>
          <h3>${dept.name}</h3>${done ? '<span class="dept-tick">✔</span>' : ""}</header>
        <div class="shift-row">${rows.map(([s, i]) => this.shiftCard(s, i, unlocked)).join("")}</div>
      </section>`;
    }).join("");

    GK.UI.showScreen("map");
  },

  shiftCard(s, i, unlocked) {
    const rec = (this.progress.shifts || {})[i];
    const locked = i > unlocked;
    const stars = rec ? rec.stars : 0;
    const pips = locked ? "🔒" : "★★★".slice(0, stars).padEnd(3, "☆");
    return `<button class="shift-card${locked ? " locked" : ""}${i === unlocked ? " next" : ""}"
      ${locked ? "disabled" : ""} onclick="App.startShift(${i})">
      <span class="sc-num">${i + 1}</span>
      <span class="sc-name">${GK.util.esc(s.name)}</span>
      <span class="sc-stars">${pips}</span></button>`;
  },

  /* ---------- running a shift ---------- */

  startShift(idx) {
    this.beginRun({ mode: "shift", shiftIdx: idx, loadout: this.loadout });
  },

  startRush() {
    if (!Storage.rushUnlocked(this.progress)) return;
    this.beginRun({ mode: "rush", loadout: this.loadout });
  },

  beginRun(cfg) {
    GK.Sfx.init();
    this._banked = 0;
    this.paused = false;
    Fx.reset();
    Game.start(cfg);

    GK.UI.showScreen("game");
    Render.fly = null;
    // Fill the banner and HUD BEFORE measuring: they size the stage, and
    // measuring first gives a layout that is already out of date.
    this.showRule(false);
    this.updateHud();
    // The stage was display:none a moment ago, so its size only became real
    // once the screen went active — measure here, not at boot.
    Render.resize();
    Render.layoutBoxes();
  },

  wireGame() {
    Game.on = {
      parcel: (d) => { Render.onParcel(d); this.updateHud(); },

      right: (d) => {
        Render.onSorted(d.parcel, Game.visibleAttrs(), d.dest, true);
        GK.Sfx.posted();
        if (d.mult > 1) { GK.Sfx.streakUp(d.mult); Render.points(`x${d.mult}!`, "#e8467c"); }
        else Render.points(`+${d.points}`);
        if (d.streak && d.streak % 5 === 0) GK.UI.toast(`${d.streak} in a row! 🔥`);
        this.bankCoins();
        this.updateHud();
      },

      wrong: (d) => {
        Render.onWrong(d);
        GK.Sfx.bounce();
        // Never a scolding — it bounced, and it is still hers to place.
        if (d.firstSlip) GK.UI.toast("Not that one — try again! 🙂");
        this.updateHud();
      },

      arm: (d) => {
        Render.onSorted(d.parcel, Game.visibleAttrs(), d.dest, true);
        GK.Sfx.arm();
        GK.UI.toast("🦾 The arm got that one!");
        this.updateHud();
      },

      timeout: () => { GK.Sfx.lost(); Fx.addShake(5); this.updateHud(); },

      bell: () => { Render.onBell(); GK.Sfx.bell(); this.showRule(true); this.updateHud(); },

      stage: (d) => {
        Render.layoutBoxes();
        this.showRule(false);
        GK.UI.toast(`${d.shift.name}! ⏱️`);
      },

      shiftEnd: (r) => this.finishRun(r),
    };
  },

  sortTo(dest) { if (!this.paused) Game.sort(dest); },

  useArm() {
    if (Game.armLeft <= 0) return GK.UI.toast("No robot arm left this shift.");
    Game.useArm();
  },

  showRule(rang) {
    const el = document.getElementById("rule-banner");
    const r = Game.rule();
    el.innerHTML = `<span class="rule-title">${rang ? "🔔 " : ""}${r.title}</span>` +
      `<span class="rule-hint">${r.hint}</span>`;
    el.classList.remove("rang");
    if (rang) { void el.offsetWidth; el.classList.add("rang"); }
  },

  updateHud() {
    const rush = Game.mode === "rush";
    document.getElementById("hud-shift").textContent = rush
      ? `⏱️ ${Game.shift.name}`
      : `${Game.shiftIdx + 1}. ${SHIFTS[Game.shiftIdx].name}`;
    document.getElementById("hud-left").textContent = rush
      ? `❌ ${RUSH_MISTAKES - Game.rushMistakes}`
      : `📦 ${Math.max(0, Game.queue.length - Game.judged())}`;
    document.getElementById("hud-score").textContent = Game.score;
    document.getElementById("hud-streak").textContent =
      Game.streak >= 2 ? `🔥 ${Game.streak}${Game.multiplier() > 1 ? ` x${Game.multiplier()}` : ""}` : "";

    const arm = document.getElementById("btn-arm");
    arm.style.display = Game.armLeft > 0 ? "" : "none";
    arm.textContent = `🦾 ${Game.armLeft}`;

    // The Bell Warning upgrade: a heads-up on the parcel before the switch.
    const warn = document.getElementById("bell-warn");
    const due = this.loadout.warn && Game.shift.bell && Game.parcelsToBell() === 1;
    warn.style.display = due ? "" : "none";
  },

  // Coins are banked as they are won, so the counter moves while she plays and a
  // shift that ends badly keeps what it earned on the way.
  bankCoins() {
    const delta = Game.coins - this._banked;
    if (delta > 0) {
      this._banked = Game.coins;
      this.progress = Storage.addCoins(this.profile.id, delta);
    }
  },

  pause() { if (!Game.running) return; this.paused = true; GK.UI.openModal("modal-pause"); },
  resume() { this.paused = false; GK.UI.closeModal("modal-pause"); },
  quit() { this.paused = false; GK.UI.closeModal("modal-pause"); Game.abandon(); this.showMap(); },

  /* ---------- results ---------- */

  finishRun(r) {
    this.bankCoins();
    this.progress = Storage.recordShift(this.profile.id, r);
    this.loadout = upgradeLoadout(this.progress);
    // Let the last parcel finish landing before the screen changes.
    setTimeout(() => this.showResults(r), 520);
  },

  showResults(r) {
    const rush = r.mode === "rush";
    const best = rush && r.score >= (this.progress.rushScore || 0) && r.score > 0;

    document.getElementById("res-emoji").textContent =
      rush ? (best ? "🏆" : "⏱️") : ["😊", "🙂", "😄", "🥳"][r.stars];
    document.getElementById("res-title").textContent = rush
      ? (best ? "New best score!" : "Time's up!")
      : (r.stars ? "Shift finished!" : "Nearly! Have another go.");

    const starsEl = document.getElementById("res-stars");
    starsEl.innerHTML = "";
    starsEl.style.display = rush ? "none" : "";

    document.getElementById("res-score").textContent = "0";
    document.getElementById("res-clean").textContent = rush
      ? `📦 ${r.judged} parcels sorted`
      : `📦 ${r.clean} of ${r.judged} right first time`;
    document.getElementById("res-streak").textContent = `🔥 best streak ${r.bestStreak}`;
    document.getElementById("res-coins").textContent = `🪙 +${r.coins} coins`;
    document.getElementById("res-armed").textContent = r.armed ? `🦾 ${r.armed} sorted by the arm` : "";

    const nextIdx = r.shiftIdx + 1;
    const retry = document.getElementById("res-retry");
    const next = document.getElementById("res-next");
    if (rush) {
      retry.style.display = ""; retry.innerHTML = "⏱️ Again";
      retry.onclick = () => this.startRush();
      next.style.display = "none";
    } else if (r.win && nextIdx < SHIFTS.length) {
      retry.style.display = ""; retry.innerHTML = "🔁 Replay";
      retry.onclick = () => this.startShift(r.shiftIdx);
      next.style.display = ""; next.innerHTML = "▶️ Next shift";
      next.onclick = () => this.startShift(nextIdx);
    } else if (r.win) {
      retry.style.display = "none";
      next.style.display = ""; next.innerHTML = "⏱️ Try Rush Hour";
      next.onclick = () => this.startRush();
    } else {
      retry.style.display = ""; retry.innerHTML = "🔁 Try again";
      retry.onclick = () => this.startShift(r.shiftIdx);
      next.style.display = "none";
    }

    document.getElementById("res-finished").style.display =
      (!rush && r.win && nextIdx >= SHIFTS.length) ? "" : "none";

    GK.UI.showScreen("results");

    // The stars land one at a time with a sound each — the whole point of the
    // screen, and it has to be paced rather than appearing all at once.
    if (!rush) {
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          const s = document.createElement("span");
          s.className = "res-star" + (i < r.stars ? " on" : "");
          s.textContent = i < r.stars ? "★" : "☆";
          starsEl.appendChild(s);
          if (i < r.stars) GK.Sfx.star(i);
        }, 260 + i * 360);
      }
    }

    this.countUp(document.getElementById("res-score"), r.score, rush ? 200 : 1400);

    if (r.stars === 3 || best) {
      setTimeout(() => {
        GK.Sfx.clockOff();
        Fx.confetti(window.innerWidth, window.innerHeight,
          ["#e8467c", "#4aa3ff", "#ffd63d", "#5ec26a", "#ff8a3d"], 90);
      }, 1400);
    }
  },

  // The animation supplies the punch; it must never be the only thing that can
  // deliver the number. A backgrounded tab (or a preview pane that isn't
  // compositing) never advances requestAnimationFrame, and the score would sit
  // frozen on whatever the first frame happened to compute.
  countUp(el, target, delay) {
    const dur = 900;
    const final = target.toLocaleString();
    setTimeout(() => {
      const t0 = performance.now();
      const step = () => {
        const p = Math.min(1, (performance.now() - t0) / dur);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString();
        if (p < 1) requestAnimationFrame(step);
      };
      step();
    }, delay);
    // Timers still fire when frames don't, so this is the authoritative write.
    setTimeout(() => { el.textContent = final; }, delay + dur + 80);
  },

  /* ---------- the supply cupboard ---------- */

  showCupboard() {
    this.progress = Storage.getProgress(this.profile.id);
    document.getElementById("shop-coins").textContent = Storage.coins(this.progress);

    document.getElementById("shop-list").innerHTML = UPGRADES.map((u) => {
      const lvl = upgradeLevel(this.progress, u.id);
      const maxed = lvl >= u.costs.length;
      const cost = maxed ? 0 : u.costs[lvl];
      const afford = Storage.coins(this.progress) >= cost;
      const pips = u.costs.map((_, i) => (i < lvl ? "●" : "○")).join(" ");
      return `<div class="shop-item">
        <span class="si-icon">${u.icon}</span>
        <div class="si-text"><b>${u.name}</b><span class="si-pips">${pips}</span>
          <span class="si-desc">${u.desc}</span></div>
        <button class="btn small ${maxed ? "grey" : afford ? "green" : "grey"}"
          ${maxed || !afford ? "disabled" : ""} onclick="App.buy('${u.id}')">
          ${maxed ? "Done" : `🪙 ${cost}`}</button>
      </div>`;
    }).join("");

    document.getElementById("album-count").textContent =
      `${stickerCount(this.progress)} / ${STICKERS.length}`;
    document.getElementById("album-grid").innerHTML = STICKERS.map((s) => {
      const owned = hasSticker(this.progress, s.id);
      const afford = Storage.coins(this.progress) >= s.cost;
      return `<button class="sticker${owned ? " owned" : ""}"
        ${owned || !afford ? "disabled" : ""} onclick="App.buySticker('${s.id}')"
        title="${GK.util.esc(s.name)}">
        <span class="st-icon">${owned ? s.icon : "❔"}</span>
        <span class="st-cost">${owned ? GK.util.esc(s.name) : `🪙 ${s.cost}`}</span></button>`;
    }).join("");

    GK.UI.showScreen("cupboard");
  },

  buy(id) {
    const res = Storage.buyUpgrade(this.profile.id, id);
    if (!res.ok) return GK.UI.toast(res.reason === "coins" ? "Not enough coins yet!" : "All bought!");
    this.progress = res.progress;
    this.loadout = upgradeLoadout(this.progress);
    GK.Sfx.purchase();
    GK.UI.toast("Bought! 🎉");
    this.showCupboard();
  },

  buySticker(id) {
    const res = Storage.buySticker(this.profile.id, id);
    if (!res.ok) return GK.UI.toast(res.reason === "coins" ? "Not enough coins yet!" : "Already yours!");
    this.progress = res.progress;
    GK.Sfx.purchase();
    const def = STICKERS.find((s) => s.id === id);
    GK.UI.toast(`${def.icon} ${def.name} — added to your album!`);
    this.showCupboard();
  },

  /* ---------- leaderboard & help ---------- */

  showLeaderboard() {
    GK.Profiles.renderLeaderboard("lb-rows", {
      cols: (r) => `<span class="lb-stat">⏱️ ${r.progress.rushScore || 0}</span>` +
        `<span class="lb-stat">⭐ ${Storage.totalStars(r.progress)}</span>`,
      sort: (a, b) => (b.progress.rushScore || 0) - (a.progress.rushScore || 0),
      meId: this.profile && this.profile.id,
      empty: "No scores yet — play a Rush Hour!",
    });
    GK.UI.showScreen("leaderboard");
  },

  showHelp() { GK.UI.closeModal("modal-pause"); GK.UI.openModal("modal-help"); },

  /* ---------- the loop ---------- */

  frame(ts) {
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000 || 0);
    this.lastTs = ts;
    if (this.active) {
      if (Game.running && !this.paused) Game.tick(dt);
      Render.update(dt);
      Fx.update(dt);
      Render.render();
    }
    GK.Debug.frame(dt);
    requestAnimationFrame((t) => this.frame(t));
  },
};

// Init on DOMContentLoaded, not inline at the bottom of <body>: a first render
// before layout settles resolves viewport-relative clamp() font sizes against
// the inherited value, and only the first screen comes out wrong.
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => App.init());
else App.init();
