// Sorting Office — the sorting rules, and how a shift's parcels are dealt.
//
// A rule is a pure function from a parcel to a DESTINATION KEY, plus enough
// metadata for the renderer to label a postbox with that key. `shows` lists the
// attributes the rule reads: the renderer draws only those, so a colour shift
// has nothing on its parcels except colour.
//
// `keyOf` always returns a STRING so a shift's box list can be a plain array of
// strings and `indexOf` resolves the destination.

const RULES = {
  shape: {
    id: "shape", shows: ["shape"],
    title: "Sort by shape",
    hint: "Put each parcel in the box with the same shape on it.",
    keyOf: (p) => p.shape,
    apply: (p, key) => { p.shape = key; },
    label: (key) => ({ kind: "shape", shape: key }),
  },

  colour: {
    id: "colour", shows: ["colour"],
    title: "Sort by colour",
    hint: "Put each parcel in the box that is the same colour.",
    keyOf: (p) => p.colour,
    apply: (p, key) => { p.colour = key; },
    label: (key) => ({ kind: "colour", colour: key }),
  },

  size: {
    id: "size", shows: ["size"],
    title: "Sort by size",
    hint: "Big parcels in the big box, small ones in the small box.",
    keyOf: (p) => p.size,
    apply: (p, key) => { p.size = key; },
    label: (key) => ({ kind: "size", size: key }),
  },

  colourSize: {
    id: "colourSize", shows: ["colour", "size"],
    title: "Sort by colour AND size",
    hint: "The colour has to match and so does the size.",
    keyOf: (p) => p.colour + ":" + p.size,
    apply: (p, key) => { const [c, s] = key.split(":"); p.colour = c; p.size = s; },
    label: (key) => { const [c, s] = key.split(":"); return { kind: "colour", colour: c, size: s }; },
  },

  shapeSize: {
    id: "shapeSize", shows: ["shape", "size"],
    title: "Sort by shape AND size",
    hint: "The shape has to match and so does the size.",
    keyOf: (p) => p.shape + ":" + p.size,
    apply: (p, key) => { const [sh, s] = key.split(":"); p.shape = sh; p.size = s; },
    label: (key) => { const [sh, s] = key.split(":"); return { kind: "shape", shape: sh, size: s }; },
  },

  stamps: {
    id: "stamps", shows: ["stamps"],
    title: "Count the stamps",
    hint: "Count the stamps, then find the box with the same number of dots.",
    keyOf: (p) => String(p.stamps),
    apply: (p, key) => { p.stamps = Number(key); },
    label: (key) => ({ kind: "stamps", stamps: Number(key) }),
  },

  label: {
    id: "label", shows: ["label"],
    title: "Read the label",
    hint: "Read the word on the parcel. If no box says that word, it goes in the returns bin.",
    keyOf: (p) => p.label,
    apply: (p, key) => { p.label = key; },
    label: (key) => ({ kind: "word", word: key }),
  },
};

/* ---------- shift geometry ---------- */

// Every rule in a shift labels the SAME physical boxes, so all of its box lists
// are the same length. tests/rules.test.js fails the build if they aren't.
function boxCount(shift) {
  const first = shift.rules[0];
  return (shift.boxKeys[first] || []).length;
}

// Which attributes this shift's parcels should have drawn on them.
function visibleAttrs(shift) {
  const out = [];
  for (const id of shift.rules) {
    for (const attr of RULES[id].shows) if (!out.includes(attr)) out.push(attr);
  }
  return out;
}

// Where this parcel belongs right now: a box index, "bin", or null.
// null means the data is broken — the linter asserts it never happens in play.
function destOf(shift, ruleId, parcel) {
  const keys = shift.boxKeys[ruleId] || [];
  const idx = keys.indexOf(RULES[ruleId].keyOf(parcel));
  if (idx >= 0) return idx;
  if (shift.bin) return "bin";
  return null;
}

/* ---------- dealing a shift's parcels ---------- */

// Deal every item before any repeats (the shuffled-bag trick), so a 15-parcel
// shift with 4 boxes always uses all four rather than leaving one cold.
function makeBag(items, rand) {
  let pool = [];
  return () => {
    if (!pool.length) {
      pool = items.slice();
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
    }
    return pool.pop();
  };
}

// One parcel per entry, valid by construction: for each rule in the shift the
// parcel's key is drawn from that rule's own box list, so it always resolves.
//
// Bell shifts draw each rule INDEPENDENTLY — that's the point of them. A parcel
// can be a red star when the shape boxes want stars and the colour boxes want
// blue, so the answer genuinely changes when the bell rings.
function dealParcels(shift, rand) {
  const bags = {};
  for (const id of shift.rules) bags[id] = makeBag(shift.boxKeys[id], rand);
  const decoys = shift.decoyWords && shift.decoyWords.length
    ? makeBag(shift.decoyWords, rand) : null;

  const out = [];
  for (let i = 0; i < shift.parcels; i++) {
    const p = blankParcel(i);
    for (const id of shift.rules) {
      // A returns-bin parcel gets a label no box carries. Only the reading
      // department has decoys, so every other shift skips this entirely.
      if (id === "label" && decoys && rand() < (shift.binShare || 0)) {
        RULES[id].apply(p, decoys());
      } else {
        RULES[id].apply(p, bags[id]());
      }
    }
    out.push(p);
  }
  return out;
}
