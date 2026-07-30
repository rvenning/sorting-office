// Sorting Office — the supply cupboard (the shop) and the stamp album.
//
// Only ONE of these three can affect a star rating (the robot arm, capped at two
// uses a shift) — the other two buy score and comfort. That split is deliberate:
// a shop that can buy its way to three stars turns the campaign into a coin
// grind, and tests/bot.test.js fails if a fully-kitted bot three-stars the lot.

const UPGRADES = [
  {
    id: "arm", icon: "🦾", name: "Robot Arm",
    desc: "Stuck on a parcel? The arm sorts it for you. One use per shift, then two.",
    costs: [40, 100],
  },
  {
    id: "warn", icon: "⏰", name: "Bell Warning",
    desc: "A heads-up one parcel before the bell changes the rule.",
    costs: [80],
  },
  {
    id: "lucky", icon: "✨", name: "Lucky Streak",
    desc: "Your score multiplier arrives sooner — x2 at four in a row, then three.",
    costs: [60, 140],
  },
];

function upgradeLevel(prog, id) { return ((prog && prog.upgrades) || {})[id] || 0; }

function upgradeLoadout(prog) {
  const lucky = upgradeLevel(prog, "lucky");
  return {
    arm: upgradeLevel(prog, "arm"),                 // robot-arm uses per shift
    warn: upgradeLevel(prog, "warn") > 0,
    x2: [5, 4, 3][lucky],                           // correct-in-a-row for x2
    x3: [10, 8, 6][lucky],
  };
}

// Pure collectibles. Nothing in the album touches the game — it exists because
// a five-year-old will sort parcels all afternoon to earn a sticker of a frog.
const STICKERS = [
  { id: "van", icon: "🚚", name: "Post Van", cost: 20 },
  { id: "cat", icon: "🐱", name: "Office Cat", cost: 25 },
  { id: "frog", icon: "🐸", name: "Frog Stamp", cost: 30 },
  { id: "rocket", icon: "🚀", name: "Air Mail", cost: 40 },
  { id: "cake", icon: "🧁", name: "Tea Break", cost: 45 },
  { id: "rainbow", icon: "🌈", name: "Rainbow Label", cost: 55 },
  { id: "owl", icon: "🦉", name: "Night Owl", cost: 65 },
  { id: "boat", icon: "⛵", name: "Sea Mail", cost: 75 },
  { id: "dino", icon: "🦖", name: "Dino Delivery", cost: 90 },
  { id: "robot", icon: "🤖", name: "Robot Helper", cost: 110 },
  { id: "unicorn", icon: "🦄", name: "Unicorn Express", cost: 140 },
  { id: "crown", icon: "👑", name: "Postmaster", cost: 200 },
];

function hasSticker(prog, id) { return !!((prog && prog.stickers) || {})[id]; }
function stickerCount(prog) { return Object.keys((prog && prog.stickers) || {}).length; }
