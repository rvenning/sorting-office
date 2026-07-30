// Sorting Office — the 18 shifts, six departments of three.
//
// The curve is a rule ladder, not a speed ladder: nothing here gets faster,
// it gets harder to think about. Departments 1-2 teach one attribute at a time,
// 3 makes her check two at once, 4 is counting, 5 is reading (and knowing when
// NOT to sort), and 6 changes the rule on her halfway through the shift.
//
// `starMiss` is [1 star, 2 stars, 3 stars] as the MOST parcels she may get
// wrong. Grading on misses rather than on speed is deliberate — a careful
// five-year-old can three-star the whole campaign, and the only thing that ever
// rewards hurrying is the streak bonus, which costs nothing to lose.
//
// Every number in here is tuned against tests/bot.test.js. Change one and run
// `node tests/bot.test.js --report` before believing it's better.

const DEPARTMENTS = [
  { name: "Shape Shed", icon: "🔺", hue: "#4aa3ff" },
  // Lighter than the canvas pink on purpose: the header band carries ink
  // lettering, so every hue in this list has to stay light enough to read on.
  { name: "Colour Counter", icon: "🎨", hue: "#ff7fa8" },
  { name: "Two Things Table", icon: "🔍", hue: "#5ec26a" },
  { name: "Counting Corner", icon: "🔢", hue: "#ffd63d" },
  { name: "Reading Room", icon: "📖", hue: "#c96f9c" },
  { name: "The Big Bell", icon: "🔔", hue: "#ff8a3d" },
];

function shift(o) {
  return Object.assign({ parcels: 15, bin: false, bell: 0, starMiss: [5, 2, 0] }, o);
}

const SHIFTS = [
  /* ---- 1. Shape Shed — one attribute, two boxes. The warm-up. ---- */
  shift({ dept: 0, name: "First Day", rules: ["shape"], parcels: 12,
    boxKeys: { shape: ["circle", "square"] } }),
  shift({ dept: 0, name: "Three Chutes", rules: ["shape"], parcels: 12,
    boxKeys: { shape: ["circle", "square", "triangle"] } }),
  shift({ dept: 0, name: "Full Shed", rules: ["shape"],
    boxKeys: { shape: ["circle", "square", "triangle", "star"] } }),

  /* ---- 2. Colour Counter — same game, new attribute. Dropping the shape
           habit she just built is the first real thinking step. ---- */
  shift({ dept: 1, name: "Red or Blue", rules: ["colour"], parcels: 12,
    boxKeys: { colour: ["red", "blue"] } }),
  shift({ dept: 1, name: "Three Colours", rules: ["colour"],
    boxKeys: { colour: ["red", "blue", "yellow"] } }),
  shift({ dept: 1, name: "Every Colour", rules: ["colour"],
    boxKeys: { colour: ["red", "blue", "yellow", "green"] } }),

  /* ---- 3. Two Things Table — colour alone is no longer enough. ---- */
  shift({ dept: 2, name: "Big and Small", rules: ["colourSize"],
    boxKeys: { colourSize: ["red:big", "red:small", "blue:big", "blue:small"] } }),
  shift({ dept: 2, name: "Sunny Sacks", rules: ["colourSize"],
    boxKeys: { colourSize: ["yellow:big", "yellow:small", "green:big", "green:small"] } }),
  shift({ dept: 2, name: "Stars and Circles", rules: ["shapeSize"],
    boxKeys: { shapeSize: ["circle:big", "circle:small", "star:big", "star:small"] } }),

  /* ---- 4. Counting Corner — the dots on the boxes stay unlabelled, so she
           counts them rather than reading a numeral. ---- */
  shift({ dept: 3, name: "One Two Three", rules: ["stamps"],
    boxKeys: { stamps: ["1", "2", "3"] } }),
  shift({ dept: 3, name: "Up to Four", rules: ["stamps"],
    boxKeys: { stamps: ["1", "2", "3", "4"] } }),
  shift({ dept: 3, name: "The Big Numbers", rules: ["stamps"],
    boxKeys: { stamps: ["3", "4", "5", "6"] }, starMiss: [6, 3, 0] }),

  /* ---- 5. Reading Room — parcels are plain brown with a word on them, so
           colour can't be used as a shortcut. Some words are on no box at all
           and go in the returns bin: knowing when NOT to sort is the lesson. ---- */
  // "A parcel that belongs nowhere" is the hardest idea in the game — harder
  // than counting to six — so the bin share ramps across the department instead
  // of arriving at full strength. The bots had this as the toughest department
  // in the game when all three shifts ran at 25%.
  // Reading is graded gently AND cannot be failed (`alwaysPass`): finishing the
  // shift is always worth one star and always unlocks the next.
  //
  // That is a deliberate exception to how the rest of the campaign works. Not
  // being able to read the word yet isn't a skill gap a child grinds past, it's
  // an age gap — a five-year-old who can't read GREEN this month can read it
  // next month, and locking the back half of the game behind that would just
  // end the game. The stars still demand accuracy, so there is plenty to come
  // back for once the reading lands.
  shift({ dept: 4, name: "Two Words", rules: ["label"], bin: true, binShare: 0.15,
    boxKeys: { label: ["RED", "BLUE"] }, decoyWords: ["GREEN", "YELLOW"],
    starMiss: [6, 4, 1], alwaysPass: true }),
  shift({ dept: 4, name: "Three Words", rules: ["label"], bin: true, binShare: 0.22,
    boxKeys: { label: ["RED", "BLUE", "GREEN"] }, decoyWords: ["YELLOW", "PINK"],
    starMiss: [6, 4, 1], alwaysPass: true }),
  shift({ dept: 4, name: "The Whole Wall", rules: ["label"], bin: true, binShare: 0.3,
    boxKeys: { label: ["RED", "BLUE", "GREEN", "YELLOW"] },
    decoyWords: ["PINK", "BROWN", "BLACK"], starMiss: [7, 4, 2], alwaysPass: true }),

  /* ---- 6. The Big Bell — the rule flips mid-shift. Both attributes are drawn
           on every parcel and the boxes re-label when the bell rings, so the
           right answer genuinely moves. One miss is forgiven for three stars
           here: catching the very first parcel after a switch is hard. ---- */
  // The thresholds here are tight on purpose. A player who ignores the bell
  // entirely mis-sorts three or four parcels a shift, and at [6,3,1] that still
  // bought her two stars — so the bell was decoration. At [4,2,1] it costs her.
  // The bell rings every three parcels, not every four or five. At five it only
  // rang twice a shift, which made the finale EASIER than the Reading Room and
  // let a player who ignored it entirely still two-star the department.
  shift({ dept: 5, name: "Shape, then Colour", rules: ["shape", "colour"],
    bell: 3, starMiss: [5, 3, 1],
    boxKeys: { shape: ["circle", "square", "star"], colour: ["red", "blue", "yellow"] } }),
  shift({ dept: 5, name: "Colour, then Counting", rules: ["colour", "stamps"],
    bell: 3, starMiss: [4, 2, 1],
    boxKeys: { colour: ["red", "blue", "green"], stamps: ["1", "2", "3"] } }),
  shift({ dept: 5, name: "Rush Hour Rehearsal", rules: ["shape", "colour", "stamps"],
    bell: 3, parcels: 18, starMiss: [5, 3, 1],
    boxKeys: {
      shape: ["circle", "square", "triangle", "star"],
      colour: ["red", "blue", "yellow", "green"],
      stamps: ["1", "2", "3", "4"],
    } }),
];

// Rush Hour opens once two departments are behind her, so it never arrives
// before she has met a rule switch... which is the whole game in Rush Hour.
const RUSH_UNLOCK_SHIFTS = 9;
const RUSH_STAGE_LEN = 8;      // parcels before the next stage steps up
const RUSH_MISTAKES = 3;       // missed parcels that end the run

// Rush Hour is the ONLY place in the game with a clock, and it needs one: with
// no timer a player who never slips sorts parcels forever, so there is no score
// to put on a leaderboard. The campaign a five-year-old plays stays timer-free.
//
// The window shrinks geometrically with every parcel sorted and has no floor, so
// every run is bounded no matter how good you are — 6s at the start, under a
// second by parcel 60, unsurvivable by 120.
const RUSH_TIME_START = 6;
const RUSH_TIME_DECAY = 0.97;

// Rush Hour walks these, holding on the last one forever. No stars, no bin —
// just the ladder again, faster to arrive and with no ceiling.
const RUSH_STAGES = [
  shift({ name: "Shapes", rules: ["shape"], parcels: RUSH_STAGE_LEN,
    boxKeys: { shape: ["circle", "square"] } }),
  shift({ name: "More Shapes", rules: ["shape"], parcels: RUSH_STAGE_LEN,
    boxKeys: { shape: ["circle", "square", "triangle"] } }),
  shift({ name: "Colours", rules: ["colour"], parcels: RUSH_STAGE_LEN,
    boxKeys: { colour: ["red", "blue", "yellow"] } }),
  shift({ name: "Four Colours", rules: ["colour"], parcels: RUSH_STAGE_LEN,
    boxKeys: { colour: ["red", "blue", "yellow", "green"] } }),
  shift({ name: "Colour and Size", rules: ["colourSize"], parcels: RUSH_STAGE_LEN,
    boxKeys: { colourSize: ["red:big", "red:small", "blue:big", "blue:small"] } }),
  shift({ name: "Counting", rules: ["stamps"], parcels: RUSH_STAGE_LEN,
    boxKeys: { stamps: ["1", "2", "3", "4"] } }),
  shift({ name: "The Bell", rules: ["shape", "colour"], parcels: RUSH_STAGE_LEN, bell: 5,
    boxKeys: { shape: ["circle", "square", "star"], colour: ["red", "blue", "yellow"] } }),
  shift({ name: "Faster Bell", rules: ["colour", "stamps"], parcels: RUSH_STAGE_LEN, bell: 4,
    boxKeys: { colour: ["red", "blue", "green", "yellow"], stamps: ["1", "2", "3", "4"] } }),
  shift({ name: "Everything", rules: ["shape", "colour", "stamps"], parcels: RUSH_STAGE_LEN, bell: 3,
    boxKeys: {
      shape: ["circle", "square", "triangle", "star"],
      colour: ["red", "blue", "yellow", "green"],
      stamps: ["1", "2", "3", "4"],
    } }),
];

function deptOf(idx) { return DEPARTMENTS[SHIFTS[idx].dept]; }
function shiftLabel(idx) { return `${idx + 1}. ${SHIFTS[idx].name}`; }
