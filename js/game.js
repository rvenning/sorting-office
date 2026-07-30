// Sorting Office — the sorting engine.
//
// This file touches no DOM, no canvas and no audio. main.js and
// tests/bot.test.js drive it identically, which is what lets the headless bots
// play the real 18-shift campaign and Rush Hour with no browser.
//
// It is also event-driven rather than frame-driven: nothing here integrates over
// time, because nothing in the game moves on its own. A parcel waits as long as
// she likes. That is the single most important design decision in the file — the
// only pressure in Sorting Office is the streak bonus, and losing that costs
// nothing but points.
//
// Grading, in the three quantities that matter:
//   clean  — sorted right first time
//   missed — got it wrong at least once (it bounces back; she always finishes it)
//   armed  — the robot arm did it
// Stars come off `missed` alone (shifts.js `starMiss`), so a slow careful player
// can three-star the campaign and hurrying is never required.

const SCORING = {
  POINTS_PARCEL: 100,
  COINS_PARCEL: 1,
  COINS_STAR: 8,
  COINS_CLEAR: 15,
};

const Game = {
  running: false,
  mode: "shift",          // "shift" | "rush"
  shiftIdx: 0,
  shift: null,

  queue: [],
  idx: -1,
  parcel: null,
  ruleIdx: 0,             // which of shift.rules the bell has landed on

  score: 0,
  coins: 0,               // coins EARNED this run (never a balance — see storage.js)
  clean: 0,
  missed: 0,
  armed: 0,
  streak: 0,
  bestStreak: 0,
  wrongOnThis: false,

  armLeft: 0,
  loadout: null,
  rushStage: 0,
  rushMistakes: 0,
  timeLeft: 0,            // rush mode only — the campaign has no clock at all

  result: null,
  on: {},                 // { parcel, right, wrong, arm, bell, stage, shiftEnd }
  rand: Math.random,

  emit(name, data) { const fn = this.on[name]; if (fn) fn(data || {}); },

  /* ---------- setup ---------- */

  // cfg: { mode, shiftIdx, loadout }
  start(cfg = {}) {
    // Re-grab Math.random every run: the test sandbox replaces it to seed a
    // deterministic deal, and caching it at load time would silently ignore that.
    this.rand = Math.random;

    this.mode = cfg.mode === "rush" ? "rush" : "shift";
    this.shiftIdx = cfg.shiftIdx || 0;
    this.loadout = cfg.loadout || upgradeLoadout({});

    this.rushStage = 0;
    this.shift = this.mode === "rush" ? RUSH_STAGES[0] : SHIFTS[this.shiftIdx];
    this.queue = dealParcels(this.shift, this.rand);

    this.idx = -1;
    this.ruleIdx = 0;
    this.score = 0;
    this.coins = 0;
    this.clean = 0;
    this.missed = 0;
    this.armed = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.wrongOnThis = false;
    this.rushMistakes = 0;
    // Rush Hour is the leaderboard mode, so the shop's escape hatch stays out
    // of it — every run starts from the same place for everybody.
    this.armLeft = this.mode === "rush" ? 0 : this.loadout.arm;
    this.result = null;
    this.running = true;

    this.nextParcel();
  },

  /* ---------- what the player is looking at ---------- */

  activeRule() { return this.shift.rules[this.ruleIdx]; },
  rule() { return RULES[this.activeRule()]; },
  boxKeys() { return this.shift.boxKeys[this.activeRule()] || []; },
  boxLabels() {
    const r = this.rule();
    return this.boxKeys().map((k) => r.label(k));
  },
  binPresent() { return !!this.shift.bin; },
  visibleAttrs() { return visibleAttrs(this.shift); },
  destOf(parcel) { return destOf(this.shift, this.activeRule(), parcel); },
  judged() { return this.clean + this.missed + this.armed; },

  // The multiplier THIS parcel would pay: streak counts the run before it, so
  // the fifth correct parcel in a row is the one that earns x2.
  multiplier() {
    const n = this.streak + 1;
    if (n >= this.loadout.x3) return 3;
    if (n >= this.loadout.x2) return 2;
    return 1;
  },

  // Parcels until the bell rings again (Infinity on a single-rule shift).
  // The Bell Warning upgrade shows this when it hits 1.
  parcelsToBell() {
    const bell = this.shift.bell;
    if (!bell) return Infinity;
    return bell - (this.idx % bell);
  },

  nextRule() {
    const r = this.shift.rules;
    return r[(this.ruleIdx + 1) % r.length];
  },

  /* ---------- the queue ---------- */

  nextParcel() {
    this.idx++;

    if (this.mode === "rush") {
      // Step up a stage and deal a fresh batch. The last stage repeats forever,
      // so a good run ends on mistakes rather than on running out of content.
      if (this.idx >= this.queue.length) {
        this.rushStage = Math.min(this.rushStage + 1, RUSH_STAGES.length - 1);
        this.shift = RUSH_STAGES[this.rushStage];
        this.queue = dealParcels(this.shift, this.rand);
        this.idx = 0;
        this.ruleIdx = 0;
        this.emit("stage", { stage: this.rushStage, shift: this.shift });
      }
    } else if (this.idx >= this.queue.length) {
      return this.end(true);
    }

    // The bell, derived from the index rather than a counter so a replay of the
    // same shift always rings in the same places.
    const bell = this.shift.bell;
    if (bell && this.idx > 0 && this.idx % bell === 0) {
      this.ruleIdx = (this.ruleIdx + 1) % this.shift.rules.length;
      this.emit("bell", { rule: this.activeRule(), title: this.rule().title });
    }

    this.parcel = this.queue[this.idx];
    this.wrongOnThis = false;
    this.timeLeft = this.timeFor();
    this.emit("parcel", {
      parcel: this.parcel,
      index: this.idx,
      total: this.mode === "rush" ? Infinity : this.queue.length,
      timeLimit: this.timeLeft,
    });
  },

  /* ---------- the Rush Hour clock ---------- */

  // Infinity in the campaign: a parcel there waits as long as she likes.
  timeFor() {
    if (this.mode !== "rush") return Infinity;
    return RUSH_TIME_START * Math.pow(RUSH_TIME_DECAY, this.judged());
  },

  // Only does anything in Rush Hour, so the campaign never needs to call it.
  tick(dt) {
    if (!this.running || this.mode !== "rush") return;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) this.timeout();
  },

  // The window closed. The parcel is gone — one mark against her, unless she had
  // already slipped on this one and paid for it.
  timeout() {
    const firstSlip = !this.wrongOnThis;
    if (firstSlip) this.rushMistakes++;
    this.missed++;
    this.streak = 0;
    this.emit("timeout", { parcel: this.parcel, mistakes: this.rushMistakes });
    if (this.rushMistakes >= RUSH_MISTAKES) return this.end(false);
    this.nextParcel();
  },

  /* ---------- sorting ---------- */

  // dest is a box INDEX, or "bin". Returns { status: "right"|"wrong"|"ignored" }.
  sort(dest) {
    if (!this.running || !this.parcel) return { status: "ignored" };
    const want = this.destOf(this.parcel);

    if (dest === want) {
      const mult = this.multiplier();
      const points = SCORING.POINTS_PARCEL * mult;
      this.score += points;
      this.streak++;
      if (this.streak > this.bestStreak) this.bestStreak = this.streak;
      if (this.wrongOnThis) this.missed++; else this.clean++;
      this.coins += SCORING.COINS_PARCEL;

      this.emit("right", {
        parcel: this.parcel, dest, points, mult,
        streak: this.streak, clean: !this.wrongOnThis,
      });
      this.nextParcel();
      return { status: "right", points, mult };
    }

    // Wrong: the parcel hops back out and she tries again. Nothing is lost and
    // nothing ends — it costs the streak, and one mark against her stars.
    const firstSlip = !this.wrongOnThis;
    if (firstSlip) {
      this.wrongOnThis = true;
      this.rushMistakes++;
    }
    this.streak = 0;
    this.emit("wrong", { parcel: this.parcel, dest, want, firstSlip });

    if (this.mode === "rush" && this.rushMistakes >= RUSH_MISTAKES) this.end(false);
    return { status: "wrong", want };
  },

  // The shop's escape hatch: an "I'm stuck" button. It sorts the parcel without
  // scoring it and without building the streak, so it can rescue a shift but
  // never win one.
  //
  // It has to FORGIVE a parcel she has already got wrong, because that is the
  // only moment she knows she's stuck — nobody reaches for the arm before
  // guessing. An arm that merely skipped an already-lost parcel would buy
  // nothing at all, which is exactly what the balance bots caught.
  useArm() {
    if (!this.running || !this.parcel || this.armLeft <= 0) return false;
    this.armLeft--;
    const want = this.destOf(this.parcel);
    this.armed++;
    this.wrongOnThis = false;
    this.emit("arm", { parcel: this.parcel, dest: want });
    this.nextParcel();
    return true;
  },

  /* ---------- the end ---------- */

  end(finished) {
    if (!this.running) return this.result;
    this.running = false;

    let stars = 0;
    if (this.mode === "shift" && finished) {
      const m = this.shift.starMiss;
      if (this.missed <= m[2]) stars = 3;
      else if (this.missed <= m[1]) stars = 2;
      else if (this.missed <= m[0]) stars = 1;
      // The Reading Room can't be failed — see shifts.js. Finishing is a star.
      if (!stars && this.shift.alwaysPass) stars = 1;
      if (stars) this.coins += stars * SCORING.COINS_STAR + SCORING.COINS_CLEAR;
    }

    this.result = {
      mode: this.mode,
      win: this.mode === "shift" ? stars > 0 : false,
      stars,
      score: this.score,
      coins: this.coins,
      clean: this.clean,
      missed: this.missed,
      armed: this.armed,
      judged: this.judged(),
      bestStreak: this.bestStreak,
      shiftIdx: this.shiftIdx,
      rushStage: this.rushStage,
    };
    this.emit("shiftEnd", this.result);
    return this.result;
  },

  // Walk out mid-shift (the quit button) — nothing is recorded.
  abandon() { this.running = false; this.result = null; },
};
