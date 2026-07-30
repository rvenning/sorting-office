// Sorting Office — the parcel vocabulary.
//
// A parcel is a plain bag of ATTRIBUTES (shape, colour, size, stamps, label).
// Every sorting rule in rules.js reads exactly ONE of them and returns a
// destination, which is the whole reason this game can't do the cruel thing:
// a five-year-old is never right in a way the game calls wrong.
//
// Two invariants make that true, and tests/rules.test.js enforces both:
//
//   1. At any instant every postbox on screen is labelled on the ACTIVE rule's
//      attribute. So there is never a box that matches the parcel on some other
//      attribute she might reasonably have used instead.
//   2. Under the active rule a parcel resolves to exactly one box — or, in the
//      reading department, to no box at all, and then the returns bin is out.
//
// The renderer only draws the attributes the current shift's rules actually
// read (`shows`), so a colour shift has no shapes on its parcels to distract
// from the colour. The bell shifts are the deliberate exception: they read two
// attributes, so both are drawn and the boxes re-label when the bell rings.

const COLOURS = [
  { id: "red", hex: "#e8467c", word: "RED" },
  { id: "blue", hex: "#4aa3ff", word: "BLUE" },
  { id: "yellow", hex: "#ffd63d", word: "YELLOW" },
  { id: "green", hex: "#5ec26a", word: "GREEN" },
];

const SHAPES = ["circle", "square", "triangle", "star"];

const SIZES = [
  { id: "small", scale: 0.62 },
  { id: "big", scale: 1 },
];

// Plain kraft-paper brown: what a parcel looks like when the rule isn't about
// colour, so nothing on it competes with the thing she's meant to read.
const PARCEL_BROWN = "#d8a35e";
const INK = "#22201e";

function colourOf(id) { return COLOURS.find((c) => c.id === id) || null; }
function sizeScale(id) { return (SIZES.find((s) => s.id === id) || SIZES[1]).scale; }

// Every parcel carries every field so any rule can read it without a guard.
// Unused fields stay at these neutral defaults and are never drawn.
function blankParcel(id) {
  return { id, shape: "square", colour: null, size: "big", stamps: 0, label: null };
}
