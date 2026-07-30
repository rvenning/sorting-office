// Persistence: gamekit storage (lib/gk-storage.js) configured for Sorting Office.
// so_* localStorage keys, "sortingoffice" Firestore collection.
//
// Coins are spent in the supply cupboard, so a plain max() merge would resurrect
// spent coins the next time two devices sync. Both sides of the ledger are
// monotonic counters instead — coinsEarned and coinsSpent only ever grow — and
// the balance is derived, which makes max() always safe.
//
// PROGRESS is a named object rather than two inline callbacks so
// tests/storage.test.js can call the merge directly: it is the one function here
// that can permanently destroy a save.

const PROGRESS = {
  blank: () => ({
    // Enough to buy the first sticker on day one. Everything else is earned.
    coinsEarned: 20, coinsSpent: 0,
    shifts: {},          // { [idx]: { score, stars } } best result per shift
    upgrades: {},        // { [upgradeId]: level }
    stickers: {},        // { [stickerId]: 1 }
    rushBest: 0,         // parcels sorted in the longest Rush Hour
    rushScore: 0,        // the leaderboard number
    updated: 0,
  }),

  merge: (a, b) => {
    const shifts = { ...(a.shifts || {}) };
    for (const [idx, s] of Object.entries(b.shifts || {})) {
      const cur = shifts[idx];
      shifts[idx] = cur
        ? { score: Math.max(cur.score || 0, s.score || 0), stars: Math.max(cur.stars || 0, s.stars || 0) }
        : s;
    }
    const upgrades = { ...(a.upgrades || {}) };
    for (const [id, lvl] of Object.entries(b.upgrades || {}))
      upgrades[id] = Math.max(upgrades[id] || 0, lvl);

    return {
      // Spread first so a field a newer build added survives an older client's merge.
      ...a, ...b,
      coinsEarned: Math.max(a.coinsEarned || 0, b.coinsEarned || 0),
      coinsSpent: Math.max(a.coinsSpent || 0, b.coinsSpent || 0),
      rushBest: Math.max(a.rushBest || 0, b.rushBest || 0),
      rushScore: Math.max(a.rushScore || 0, b.rushScore || 0),
      shifts, upgrades,
      // A sticker is never un-bought, so the union is always right.
      stickers: { ...(a.stickers || {}), ...(b.stickers || {}) },
    };
  },
};

const Storage = GK.createStorage({
  prefix: "so",
  collection: "sortingoffice",
  firebaseConfig: window.FIREBASE_CONFIG,
  blankProgress: PROGRESS.blank,
  mergeProgress: PROGRESS.merge,
});

/* ----- Sorting Office helpers on top of the kit storage ----- */
Object.assign(Storage, {
  coins(prog) { return Math.max(0, (prog.coinsEarned || 0) - (prog.coinsSpent || 0)); },

  totalScore(prog) {
    return Object.values(prog.shifts || {}).reduce((s, x) => s + (x.score || 0), 0);
  },

  totalStars(prog) {
    return Object.values(prog.shifts || {}).reduce((s, x) => s + (x.stars || 0), 0);
  },

  shiftsWon(prog) { return Object.keys(prog.shifts || {}).length; },

  // Shifts unlock in order: the one after the highest she has passed.
  unlockedShift(prog) {
    let max = -1;
    for (const k of Object.keys(prog.shifts || {})) max = Math.max(max, Number(k));
    return Math.min(max + 1, SHIFTS.length - 1);
  },

  rushUnlocked(prog) { return this.shiftsWon(prog) >= RUSH_UNLOCK_SHIFTS; },

  // Coins are banked the moment they're won, not at the end of the shift, so the
  // counter moves while she plays and a shift that goes badly still keeps what
  // it earned along the way.
  addCoins(profileId, amount) {
    if (!amount) return this.getProgress(profileId);
    const prog = this.getProgress(profileId);
    prog.coinsEarned = (prog.coinsEarned || 0) + amount;
    this.saveProgress(profileId, prog);
    return prog;
  },

  // Record a finished shift. Only a PASS records it, because recording a failed
  // shift would unlock the next one.
  recordShift(profileId, result) {
    const prog = this.getProgress(profileId);

    if (result.mode === "rush") {
      prog.rushBest = Math.max(prog.rushBest || 0, result.judged || 0);
      prog.rushScore = Math.max(prog.rushScore || 0, result.score || 0);
    } else if (result.win) {
      const cur = prog.shifts[result.shiftIdx];
      prog.shifts[result.shiftIdx] = {
        score: Math.max((cur && cur.score) || 0, result.score || 0),
        stars: Math.max((cur && cur.stars) || 0, result.stars || 0),
      };
    }

    this.saveProgress(profileId, prog);
    return prog;
  },

  buyUpgrade(profileId, id) {
    const prog = this.getProgress(profileId);
    const def = UPGRADES.find((u) => u.id === id);
    const lvl = upgradeLevel(prog, id);
    if (!def || lvl >= def.costs.length) return { ok: false, reason: "maxed" };
    const cost = def.costs[lvl];
    if (this.coins(prog) < cost) return { ok: false, reason: "coins" };
    prog.coinsSpent = (prog.coinsSpent || 0) + cost;
    prog.upgrades = prog.upgrades || {};
    prog.upgrades[id] = lvl + 1;
    this.saveProgress(profileId, prog);
    return { ok: true, progress: prog, cost };
  },

  buySticker(profileId, id) {
    const prog = this.getProgress(profileId);
    const def = STICKERS.find((s) => s.id === id);
    if (!def) return { ok: false, reason: "unknown" };
    if (hasSticker(prog, id)) return { ok: false, reason: "owned" };
    if (this.coins(prog) < def.cost) return { ok: false, reason: "coins" };
    prog.coinsSpent = (prog.coinsSpent || 0) + def.cost;
    prog.stickers = prog.stickers || {};
    prog.stickers[id] = 1;
    this.saveProgress(profileId, prog);
    return { ok: true, progress: prog, cost: def.cost };
  },
});
