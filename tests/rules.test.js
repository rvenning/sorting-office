"use strict";
// Sorting Office — the data linter.
//
// This suite exists for ONE reason, and it is the whole reason the game is safe
// to put in front of a five-year-old: a parcel must never be sortable into two
// boxes, and it must never be sortable into none. If she puts a red star in the
// star box and the game says wrong because it wanted colour, that is the worst
// thing this game could do to her — so it is a build failure, not a play-test.
//
//   cd sorting-office && node --test

const path = require("node:path");
const { test } = require("node:test");
const assert = require("node:assert");
const { loadScripts } = require("../lib/tools/test-harness.js");

const ROOT = path.join(__dirname, "..");
const S = loadScripts({
  baseDir: ROOT,
  files: ["tests/seed.js", "js/parcels.js", "js/rules.js", "js/shifts.js", "js/upgrades.js"],
  exports: ["RULES", "SHIFTS", "RUSH_STAGES", "DEPARTMENTS", "dealParcels", "destOf",
            "boxCount", "visibleAttrs", "COLOURS", "SHAPES", "SIZES", "__reseed"],
});
const { RULES, SHIFTS, RUSH_STAGES, DEPARTMENTS, dealParcels, destOf,
        boxCount, visibleAttrs, COLOURS, SHAPES, SIZES } = S;

// Every authored shift-shaped thing in the game, campaign and Rush Hour alike.
const ALL = [
  ...SHIFTS.map((s, i) => [`shift ${i + 1} "${s.name}"`, s]),
  ...RUSH_STAGES.map((s, i) => [`rush stage ${i} "${s.name}"`, s]),
];

const SEEDS = [1, 7, 42, 99, 1234, 20260730, 555, 8675309, 31337, 2, 3, 5,
               11, 13, 17, 19, 23, 29, 101, 404];

function validKey(ruleId, key) {
  const colour = (k) => COLOURS.some((c) => c.id === k);
  const size = (k) => SIZES.some((s) => s.id === k);
  switch (ruleId) {
    case "shape": return SHAPES.includes(key);
    case "colour": return colour(key);
    case "size": return size(key);
    case "stamps": return /^[1-6]$/.test(key);
    case "label": return /^[A-Z]{3,8}$/.test(key);
    case "colourSize": { const [c, s] = String(key).split(":"); return colour(c) && size(s); }
    case "shapeSize": { const [sh, s] = String(key).split(":"); return SHAPES.includes(sh) && size(s); }
    default: return false;
  }
}

/* ---------- shape of the authored data ---------- */

test("every rule a shift names actually exists", () => {
  for (const [label, s] of ALL) {
    assert.ok(s.rules.length >= 1, `${label} has no rules`);
    for (const id of s.rules) assert.ok(RULES[id], `${label} names unknown rule "${id}"`);
  }
});

test("all of a shift's box lists describe the SAME physical boxes", () => {
  // A bell shift re-labels the boxes it already has; it cannot grow a box
  // mid-shift. Different lengths would mean a label with no box under it.
  for (const [label, s] of ALL) {
    const lens = s.rules.map((id) => (s.boxKeys[id] || []).length);
    assert.ok(lens.every((n) => n === lens[0]),
      `${label} labels ${lens.join("/")} boxes under its different rules — they must match`);
    assert.ok(lens[0] >= 2, `${label} has fewer than two boxes`);
  }
});

test("boxes stay big enough for a small finger", () => {
  // Four boxes plus a returns bin is the most that fits across a phone at a size
  // a four-year-old's finger can actually hit. This is a layout contract.
  for (const [label, s] of ALL) {
    assert.ok(boxCount(s) <= 4, `${label} wants ${boxCount(s)} boxes — the cap is 4`);
  }
});

test("every box key is valid for the rule that labels it", () => {
  for (const [label, s] of ALL) {
    for (const id of s.rules) {
      for (const key of s.boxKeys[id]) {
        assert.ok(validKey(id, key), `${label}: "${key}" is not a valid ${id} key`);
      }
      const keys = s.boxKeys[id];
      assert.equal(new Set(keys).size, keys.length, `${label}: duplicate ${id} box keys`);
    }
  }
});

test("a returns-bin word is on no box — otherwise the bin parcel has a home", () => {
  // The reading room's whole lesson is knowing when NOT to sort. If a decoy word
  // also appeared on a box, the "wrong address" parcel would have two answers.
  for (const [label, s] of ALL) {
    if (!s.decoyWords) continue;
    assert.ok(s.bin, `${label} has decoy words but no returns bin to put them in`);
    for (const w of s.decoyWords) {
      assert.ok(!(s.boxKeys.label || []).includes(w),
        `${label}: decoy "${w}" is also a box label`);
    }
  }
});

test("only the attributes a rule reads are ever drawn on a parcel", () => {
  // A single-rule shift must show exactly that rule's attributes and nothing
  // else. An extra drawn attribute is a decoy: something she could match on that
  // the game would mark wrong.
  for (const [label, s] of ALL) {
    if (s.rules.length !== 1) continue;
    assert.deepEqual(visibleAttrs(s).slice().sort(), RULES[s.rules[0]].shows.slice().sort(),
      `${label} draws attributes its rule doesn't read`);
  }
});

test("star thresholds descend and are reachable", () => {
  for (const [i, s] of SHIFTS.entries()) {
    const [one, two, three] = s.starMiss;
    assert.ok(one >= two && two >= three && three >= 0,
      `shift ${i + 1} starMiss ${s.starMiss} is not descending`);
    assert.ok(one < s.parcels,
      `shift ${i + 1} passes at ${one} misses out of ${s.parcels} parcels — 1 star is nearly free`);
    // Two and three stars must stay worth chasing even where passing is free.
    assert.ok(two < s.parcels / 2,
      `shift ${i + 1} awards two stars at ${two} misses of ${s.parcels} — not a grade`);
  }
});

test("the reading department cannot be failed, and only the reading department", () => {
  // Reading readiness is developmental, so those three shifts always pass. Every
  // other shift must be losable or its stars mean nothing.
  for (const [i, s] of SHIFTS.entries()) {
    if (s.dept === 4) {
      assert.ok(s.alwaysPass, `reading shift ${i + 1} can be failed — it must always pass`);
    } else {
      assert.ok(!s.alwaysPass, `shift ${i + 1} always passes but isn't a reading shift`);
    }
  }
});

test("every shift belongs to a real department", () => {
  for (const [i, s] of SHIFTS.entries()) {
    assert.ok(DEPARTMENTS[s.dept], `shift ${i + 1} is in department ${s.dept}, which doesn't exist`);
  }
  const seen = new Set(SHIFTS.map((s) => s.dept));
  assert.equal(seen.size, DEPARTMENTS.length, "some department has no shifts in it");
});

/* ---------- the invariant, checked against real deals ---------- */

test("every dealt parcel has exactly one home, under every rule the bell can reach", () => {
  for (const [label, s] of ALL) {
    for (const seed of SEEDS) {
      S.__reseed(seed);
      const parcels = dealParcels(s, Math.random);
      assert.equal(parcels.length, s.parcels, `${label} dealt the wrong number of parcels`);

      for (const p of parcels) {
        // The bell can land on any of the shift's rules, so the parcel has to
        // resolve under all of them — not just the one it was dealt for.
        for (const id of s.rules) {
          const dest = destOf(s, id, p);
          assert.notEqual(dest, null,
            `${label} seed ${seed}: parcel ${JSON.stringify(p)} has NO home under "${id}"`);
          if (dest !== "bin") {
            assert.ok(Number.isInteger(dest) && dest >= 0 && dest < boxCount(s),
              `${label}: destination ${dest} is not a box`);
          }
        }
      }
    }
  }
});

test("a shift with no returns bin never deals a parcel for one", () => {
  for (const [label, s] of ALL) {
    if (s.bin) continue;
    for (const seed of SEEDS.slice(0, 8)) {
      S.__reseed(seed);
      for (const p of dealParcels(s, Math.random)) {
        for (const id of s.rules) {
          assert.notEqual(destOf(s, id, p), "bin",
            `${label} dealt a bin parcel but has no bin`);
        }
      }
    }
  }
});

test("every box gets used, so no chute sits cold all shift", () => {
  for (const [label, s] of ALL) {
    for (const seed of SEEDS.slice(0, 8)) {
      S.__reseed(seed);
      const parcels = dealParcels(s, Math.random);
      for (const id of s.rules) {
        const used = new Set(parcels.map((p) => destOf(s, id, p)).filter((d) => d !== "bin"));
        assert.equal(used.size, boxCount(s),
          `${label} seed ${seed}: only ${used.size}/${boxCount(s)} boxes used under "${id}"`);
      }
    }
  }
});

test("the returns bin takes a fair share of the reading room, never most of it", () => {
  for (const [label, s] of ALL) {
    if (!s.bin) continue;
    let bin = 0, total = 0;
    for (const seed of SEEDS) {
      S.__reseed(seed);
      for (const p of dealParcels(s, Math.random)) {
        total++;
        if (destOf(s, s.rules[0], p) === "bin") bin++;
      }
    }
    const share = bin / total;
    assert.ok(share > 0.1 && share < 0.45,
      `${label}: ${(share * 100).toFixed(0)}% of parcels go in the bin — want 10-45%`);
  }
});

test("the bell always changes the answer for somebody", () => {
  // A bell shift where both rules always agree is a bell that does nothing. At
  // least a third of parcels should move when the rule flips.
  for (const [label, s] of ALL) {
    if (s.rules.length < 2) continue;
    let moved = 0, total = 0;
    for (const seed of SEEDS.slice(0, 10)) {
      S.__reseed(seed);
      for (const p of dealParcels(s, Math.random)) {
        total++;
        const dests = new Set(s.rules.map((id) => destOf(s, id, p)));
        if (dests.size > 1) moved++;
      }
    }
    assert.ok(moved / total > 0.33,
      `${label}: the bell only moves ${(moved / total * 100).toFixed(0)}% of parcels — it barely matters`);
  }
});
