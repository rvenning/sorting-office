"use strict";
// Sorting Office — headless balance bots. These drive the REAL engine (js/game.js
// has no DOM, canvas or audio) through all 18 shifts and Rush Hour, so the
// numbers below are what a player actually meets.
//
// Four bots, because one is never enough:
//
//   perfect — always knows the answer. Nothing may be unwinnable by it, and it
//             must three-star the whole campaign: if it can't, a shift is unfair
//             rather than hard.
//   kid     — the tuning target, and not just uniform noise. It models the three
//             mistakes a five-year-old actually makes: a small constant slip, a
//             strong tendency to keep using the OLD rule for a parcel or two
//             after the bell, and miscounting stamps past four.
//   blind   — plays the shift's first rule and never notices the bell. If this
//             bot clears the Big Bell department, the bell is decoration.
//   lazy    — posts everything into box one. The control. If putting the iPad
//             down passes a shift, that shift has nothing in it.
//
//   cd sorting-office && node --test
//   node tests/bot.test.js --report     # per-shift table

const path = require("node:path");
const { loadScripts } = require("../lib/tools/test-harness.js");

const ROOT = path.join(__dirname, "..");
const S = loadScripts({
  baseDir: ROOT,
  files: ["tests/seed.js", "js/parcels.js", "js/rules.js", "js/shifts.js",
          "js/upgrades.js", "js/game.js"],
  exports: ["Game", "SCORING", "RULES", "SHIFTS", "DEPARTMENTS", "RUSH_STAGES",
            "RUSH_MISTAKES", "RUSH_TIME_START", "destOf", "dealParcels",
            "upgradeLoadout", "__reseed", "__rand"],
});
const { Game, SHIFTS, DEPARTMENTS, upgradeLoadout } = S;

const NO_KIT = upgradeLoadout({});
const FULL_KIT = upgradeLoadout({ upgrades: { arm: 2, warn: 1, lucky: 2 } });

// Every campaign runs on ALL of these and the assertions are on the aggregate.
// One seed is not enough to tune on: a single deal swung a bell shift between
// one and three stars, which sent me tightening thresholds against what turned
// out to be the shuffle. A dozen replays cost ~1s and the numbers hold still.
const SEEDS = [20260730, 1, 7, 42, 99, 1234, 555, 31337, 2, 13, 404, 8675309];

/* ---------- the bots ---------- */

function legalDests(G) {
  const out = [];
  for (let i = 0; i < G.boxKeys().length; i++) out.push(i);
  if (G.binPresent()) out.push("bin");
  return out;
}

const perfectBot = () => (G) => G.destOf(G.parcel);

const lazyBot = () => () => 0;

function blindBot() {
  return (G) => {
    const d = S.destOf(G.shift, G.shift.rules[0], G.parcel);
    return d === null ? 0 : d;
  };
}

// The error model is the design document. Every term here is a mistake I have
// actually watched a five-year-old make, and the campaign is tuned so that this
// bot finishes it while leaving three-stars to chase.
function kidBot(opts = {}) {
  const slip = opts.slip === undefined ? 0.07 : opts.slip;
  const bellStick = opts.bellStick === undefined ? 0.5 : opts.bellStick;
  const miscount = opts.miscount === undefined ? 0.25 : opts.miscount;
  const readSlip = opts.readSlip === undefined ? 0.12 : opts.readSlip;
  const binBlind = opts.binBlind === undefined ? 0.35 : opts.binBlind;
  let lastRule = null;

  return (G, tried) => {
    const want = G.destOf(G.parcel);
    const rule = G.activeRule();
    const prevRule = lastRule;
    const switched = prevRule !== null && prevRule !== rule;
    lastRule = rule;

    const other = (exclude) => {
      const left = legalDests(G).filter((d) => d !== exclude && !tried.has(d));
      return left.length ? left[Math.floor(S.__rand() * left.length)] : null;
    };

    // Right after the bell she keeps applying the rule she had settled into.
    // This is the single most realistic error in the whole model.
    if (switched && S.__rand() < bellStick) {
      const d = S.destOf(G.shift, prevRule, G.parcel);
      if (d !== null && d !== want && !tried.has(d)) return d;
    }

    // Counting past four gets miscounted by one in either direction.
    if (rule === "stamps" && G.parcel.stamps >= 5 && S.__rand() < miscount) {
      const off = String(G.parcel.stamps + (S.__rand() < 0.5 ? -1 : 1));
      const d = G.boxKeys().indexOf(off);
      if (d >= 0 && d !== want && !tried.has(d)) return d;
    }

    if (rule === "label") {
      // The returns bin is the hardest idea in the game: a parcel that belongs
      // nowhere. Her first instinct is to post it somewhere anyway.
      if (want === "bin" && S.__rand() < binBlind) {
        const d = other("bin");
        if (d !== null) return d;
      }
      // Or she simply misreads the word.
      if (S.__rand() < readSlip) {
        const d = other(want);
        if (d !== null) return d;
      }
    }

    if (S.__rand() < slip) {
      const d = other(want);
      if (d !== null) return d;
    }
    return want;
  };
}

/* ---------- driving a shift ---------- */

// A wrong parcel bounces back and has to be placed again, so each parcel is an
// inner loop. `useArm` models a child reaching for the robot arm once she has
// fumbled the same parcel twice.
function driveShift(idx, makeBot, loadout = NO_KIT, useArm = false) {
  Game.start({ mode: "shift", shiftIdx: idx, loadout });
  const bot = makeBot();
  let guard = 0;

  while (Game.running && guard++ < 5000) {
    const parcel = Game.parcel;
    const tried = new Set();
    while (Game.running && Game.parcel === parcel && guard++ < 5000) {
      // She reaches for the robot arm the moment a parcel has beaten her once —
      // that is the only point at which anybody knows they're stuck.
      if (useArm && tried.size >= 1 && Game.armLeft > 0) { Game.useArm(); break; }
      let d = bot(Game, tried);
      if (d === null || d === undefined || tried.has(d)) {
        const left = legalDests(Game).filter((x) => !tried.has(x));
        if (!left.length) break;
        d = left[0];
      }
      tried.add(d);
      Game.sort(d);
    }
  }
  return Game.result || { win: false, stars: 0, score: 0, clean: Game.clean, missed: Game.missed };
}

// Returns one array of results PER SHIFT, holding that shift's outcome on every
// seed. All the assertions below read aggregates off this.
function runCampaign(makeBot, loadout = NO_KIT, useArm = false) {
  const perShift = SHIFTS.map(() => []);
  for (const seed of SEEDS) {
    S.__reseed(seed);
    SHIFTS.forEach((_, i) => perShift[i].push(driveShift(i, makeBot, loadout, useArm)));
  }
  return perShift;
}

const flat = (perShift) => perShift.flat();
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const meanStars = (rs) => mean(rs.map((r) => r.stars || 0));
const passRate = (rs) => mean(rs.map((r) => (r.win ? 1 : 0)));
const threeRate = (rs) => mean(rs.map((r) => (r.stars === 3 ? 1 : 0)));
const deptRuns = (perShift, dept) => flat(perShift.filter((_, i) => SHIFTS[i].dept === dept));

// Rush Hour has a clock, so a bot needs a thinking time. `think` seconds pass
// before every attempt; if the window closes first the parcel is gone.
function driveRush(makeBot, think, loadout = NO_KIT) {
  Game.start({ mode: "rush", loadout });
  const bot = makeBot();
  let guard = 0, elapsed = 0;

  while (Game.running && guard++ < 20000) {
    const parcel = Game.parcel;
    Game.tick(think);
    elapsed += think;
    if (!Game.running) break;
    if (Game.parcel !== parcel) continue;      // the window closed on it

    const tried = new Set();
    let d = bot(Game, tried);
    if (d === null || d === undefined) d = 0;
    Game.sort(d);
  }
  const r = Game.result || { score: 0, judged: 0 };
  return Object.assign({ elapsed }, r);
}

function runRush(makeBot, think, loadout = NO_KIT) {
  const runs = SEEDS.map((seed) => { S.__reseed(seed); return driveRush(makeBot, think, loadout); });
  return {
    parcels: mean(runs.map((r) => r.judged)),
    score: mean(runs.map((r) => r.score)),
    elapsed: mean(runs.map((r) => r.elapsed)),
    longest: Math.max(...runs.map((r) => r.judged)),
  };
}

/* ---------- report mode ---------- */

if (process.argv.includes("--report")) {
  const rows = [
    ["perfect", runCampaign(perfectBot)],
    ["kid", runCampaign(() => kidBot())],
    ["kid+kit", runCampaign(() => kidBot(), FULL_KIT, true)],
    ["blind", runCampaign(blindBot)],
    ["lazy", runCampaign(lazyBot)],
  ];

  console.log(`\nmean stars over ${SEEDS.length} replays of each shift ("!" = fails on some deals)\n`);
  console.log("shift                        " + rows.map(([n]) => n.padStart(9)).join(""));
  SHIFTS.forEach((sh, i) => {
    const label = `${String(i + 1).padStart(2)} ${DEPARTMENTS[sh.dept].name.slice(0, 12)} ${sh.name.slice(0, 9)}`;
    console.log(label.padEnd(29) + rows.map(([, per]) => {
      const rs = per[i];
      return `${meanStars(rs).toFixed(1)}${passRate(rs) < 1 ? "!" : " "}`.padStart(9);
    }).join(""));
  });
  console.log("");
  rows.forEach(([name, per]) => {
    const all = flat(per);
    console.log(`${name.padEnd(9)} pass ${(passRate(all) * 100).toFixed(0).padStart(3)}%` +
      `  stars ${meanStars(all).toFixed(2)}/3` +
      `  three-star ${(threeRate(all) * 100).toFixed(0).padStart(3)}%` +
      `  by dept ${DEPARTMENTS.map((_, d) => meanStars(deptRuns(per, d)).toFixed(1)).join(" ")}`);
  });

  console.log("\nRush Hour (mean of " + SEEDS.length + " runs)");
  [["perfect 0.9s", perfectBot, 0.9], ["perfect 1.2s", perfectBot, 1.2],
   ["perfect 1.8s", perfectBot, 1.8], ["kid 2.0s", () => kidBot(), 2.0],
   ["kid 3.0s", () => kidBot(), 3.0], ["lazy 2.0s", lazyBot, 2.0]].forEach(([name, bot, think]) => {
    const r = runRush(bot, think);
    console.log(`  ${name.padEnd(13)} ${r.parcels.toFixed(0).padStart(4)} parcels  ` +
      `${r.score.toFixed(0).padStart(6)} points  ${r.elapsed.toFixed(0).padStart(3)}s  ` +
      `longest ${r.longest}`);
  });
  return;
}

/* ---------- the assertions ---------- */

const { test } = require("node:test");
const assert = require("node:assert");

const perfect = runCampaign(perfectBot);
const kid = runCampaign(() => kidBot());
const kidKit = runCampaign(() => kidBot(), FULL_KIT, true);
const blind = runCampaign(blindBot);
const lazy = runCampaign(lazyBot);

test("nothing is unfair: knowing the rule three-stars every shift, on every deal", () => {
  const bad = perfect
    .map((rs, i) => (threeRate(rs) === 1 ? null : `${i + 1} (${meanStars(rs).toFixed(1)}*)`))
    .filter(Boolean);
  assert.deepEqual(bad, [], `shifts a perfect player can't always three-star: ${bad.join(", ")}`);
});

test("an ordinary five-year-old never gets stuck", () => {
  // Not "mostly passes" — passes every shift on every deal. A child who cannot
  // get past shift 7 stops playing, and there is no reason for this game to have
  // a wall in it.
  const stuck = kid
    .map((rs, i) => (passRate(rs) === 1 ? null : `${i + 1} (${(passRate(rs) * 100).toFixed(0)}%)`))
    .filter(Boolean);
  assert.deepEqual(stuck, [], `shifts an ordinary player can fail: ${stuck.join(", ")}`);
});

test("no shift is a wall, and none is a pushover", () => {
  kid.forEach((rs, i) => {
    assert.ok(meanStars(rs) >= 1.3,
      `shift ${i + 1} averages ${meanStars(rs).toFixed(1)} stars for an ordinary player — too mean`);
  });
  const perfectShifts = kid.filter((rs) => threeRate(rs) === 1).length;
  assert.ok(perfectShifts <= 9,
    `${perfectShifts}/18 shifts are a guaranteed three-star — over half the campaign has no challenge`);
});

test("there is headroom left to chase", () => {
  const rate = threeRate(flat(kid));
  assert.ok(rate > 0.2 && rate < 0.8,
    `an ordinary player three-stars ${(rate * 100).toFixed(0)}% of shifts — want 20-80%`);
});

test("the campaign gets harder", () => {
  const early = meanStars(flat(kid.filter((_, i) => SHIFTS[i].dept < 3)));
  const late = meanStars(flat(kid.filter((_, i) => SHIFTS[i].dept >= 3)));
  assert.ok(late < early - 0.1,
    `late departments average ${late.toFixed(2)} stars vs ${early.toFixed(2)} early — the curve is flat`);
});

test("putting the iPad down is not a strategy", () => {
  // The Reading Room always passes by design, so the control bot clears those
  // three — that is the free star working as intended, not a fake objective.
  // Everywhere else it must get nowhere, and NOWHERE may it earn a real grade.
  const gated = flat(lazy.filter((_, i) => !SHIFTS[i].alwaysPass));
  assert.ok(passRate(gated) <= 0.02,
    `posting everything in box one passed ${(passRate(gated) * 100).toFixed(0)}% of the gated shifts`);

  const best = Math.max(...flat(lazy).map((r) => r.stars || 0));
  assert.ok(best <= 1,
    `the box-one bot earned ${best} stars somewhere — a free pass is one star, never a grade`);
});

test("the bell has teeth: ignoring it costs you the stars", () => {
  // Scraping a one-star pass while ignoring the bell is fine and deliberate —
  // she still progresses, and nothing here is a dead end. What must not happen
  // is a GOOD result: three stars have to be earned by noticing the bell.
  const bell = deptRuns(blind, 5);
  assert.equal(threeRate(bell), 0,
    "a bot that never noticed the bell three-starred a bell shift — the bell is decoration");
  assert.ok(meanStars(bell) < meanStars(deptRuns(kid, 5)) - 0.4,
    `ignoring the bell averaged ${meanStars(bell).toFixed(2)} stars against an ordinary ` +
    `player's ${meanStars(deptRuns(kid, 5)).toFixed(2)} — not enough of a gap`);
});

test("the bell only matters where it exists", () => {
  // Outside the Big Bell department the blind bot IS the perfect bot, so anything
  // less than a clean sweep means a single-rule shift is somehow rule-sensitive.
  const single = flat(blind.filter((_, i) => SHIFTS[i].dept < 5));
  assert.equal(threeRate(single), 1, "the blind bot dropped a star on a shift with no bell");
});

test("the supply cupboard pays for itself without erasing the game", () => {
  const before = meanStars(flat(kid)), after = meanStars(flat(kidKit));
  assert.ok(after > before + 0.15,
    `a fully-kitted player averaged ${after.toFixed(2)} stars vs ${before.toFixed(2)} unaided — ` +
    `the shop barely does anything`);
  assert.ok(threeRate(flat(kidKit)) < 0.95,
    "full upgrades three-star essentially everything — the shop erases the game");
});

test("scoring rewards the better shift", () => {
  const good = mean(SEEDS.map((s) => { S.__reseed(s); return driveShift(17, perfectBot).score; }));
  const sloppy = mean(SEEDS.map((s) => { S.__reseed(s); return driveShift(17, () => kidBot()).score; }));
  assert.ok(good > sloppy, `a cleaner shift scored no better (${good.toFixed(0)} vs ${sloppy.toFixed(0)})`);
});

/* ---------- Rush Hour ---------- */

test("a Rush Hour run always ends, however good you are", () => {
  const r = runRush(perfectBot, 0.8);
  assert.ok(r.longest < 200,
    `a perfect player sorted ${r.longest} parcels — the clock never catches up`);
});

test("a Rush Hour run is long enough to feel like a run, short enough to retry", () => {
  const good = runRush(perfectBot, 1.2);
  assert.ok(good.elapsed >= 45 && good.elapsed <= 240,
    `a good run lasted ${good.elapsed.toFixed(0)}s — want 45-240s`);
  const child = runRush(() => kidBot(), 2.4);
  assert.ok(child.elapsed >= 30,
    `an ordinary player's run lasted only ${child.elapsed.toFixed(0)}s — too abrupt`);
});

test("Rush Hour rewards playing well, not just showing up", () => {
  const good = runRush(perfectBot, 1.2);
  const child = runRush(() => kidBot(), 2.4);
  const idle = runRush(lazyBot, 1.2);
  assert.ok(good.score > child.score * 1.5,
    `playing well scored ${good.score.toFixed(0)} against a sloppy ${child.score.toFixed(0)} — too close`);
  assert.ok(good.score > idle.score * 5,
    `posting everything in box one scored ${idle.score.toFixed(0)} against ${good.score.toFixed(0)}`);
});

test("the shop cannot buy a Rush Hour score", () => {
  // Rush Hour is the family leaderboard, so the robot arm stays out of it.
  Game.start({ mode: "rush", loadout: FULL_KIT });
  assert.equal(Game.armLeft, 0, "the robot arm is available in Rush Hour");
});

