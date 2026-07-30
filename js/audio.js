// Sorting Office — sounds, all synthesized on top of gamekit's GK.Sfx.
//
// The wrong-answer sound matters more than any of the others: it has to read as
// "not that one, try again" and never as a buzzer. It's a soft low double-thump
// — the sound of a parcel bouncing off a box — with no dissonance in it.

Object.assign(GK.Sfx, {
  // Picking a parcel up off the belt.
  lift() {
    this.tone({ freq: 380, type: "sine", dur: 0.07, vol: 0.16, slide: 120 });
  },

  // Sorted correctly: a bright two-note "in it goes" plus the box gulping.
  posted() {
    this.tone({ freq: 620, type: "triangle", dur: 0.08, vol: 0.2 });
    this.tone({ freq: 930, type: "triangle", dur: 0.11, vol: 0.18, when: 0.07 });
    this.noise({ dur: 0.06, vol: 0.05, when: 0.05 });
  },

  // Wrong box. Deliberately gentle and warm — it bounced, nothing broke.
  bounce() {
    this.tone({ freq: 200, type: "sine", dur: 0.1, vol: 0.16, slide: -50 });
    this.tone({ freq: 170, type: "sine", dur: 0.12, vol: 0.12, when: 0.11, slide: -30 });
  },

  // The streak multiplier stepping up.
  streakUp(mult) {
    const base = mult >= 3 ? 700 : 560;
    [0, 0.06, 0.12].forEach((t, i) =>
      this.tone({ freq: base * Math.pow(1.26, i), type: "square", dur: 0.07, vol: 0.11, when: t }));
  },

  // The bell: the rule just changed. Loud enough to interrupt, not to startle.
  bell() {
    this.tone({ freq: 1180, type: "sine", dur: 0.5, vol: 0.2 });
    this.tone({ freq: 1760, type: "sine", dur: 0.42, vol: 0.09, when: 0.02 });
    this.tone({ freq: 880, type: "sine", dur: 0.6, vol: 0.08, when: 0.04 });
  },

  // Robot arm to the rescue: a little servo whirr.
  arm() {
    this.tone({ freq: 240, type: "sawtooth", dur: 0.16, vol: 0.1, slide: 320 });
    this.tone({ freq: 700, type: "square", dur: 0.06, vol: 0.08, when: 0.16 });
  },

  // Rush Hour: the window on this parcel is closing.
  ticking() {
    this.tone({ freq: 900, type: "square", dur: 0.04, vol: 0.09 });
  },

  // A parcel timed out and went away.
  lost() {
    this.tone({ freq: 300, type: "sine", dur: 0.18, vol: 0.14, slide: -140 });
  },

  // End of shift, one per star as they land.
  star(n) {
    this.tone({ freq: 660 * Math.pow(1.25, n), type: "triangle", dur: 0.22, vol: 0.2 });
    this.tone({ freq: 990 * Math.pow(1.25, n), type: "sine", dur: 0.3, vol: 0.1, when: 0.04 });
  },

  // Shift complete fanfare.
  clockOff() {
    [0, 0.11, 0.22, 0.36].forEach((t, i) =>
      this.tone({ freq: [523, 659, 784, 1047][i], type: "triangle", dur: 0.24, vol: 0.18, when: t }));
  },

  // Buying something from the supply cupboard.
  purchase() {
    this.tone({ freq: 880, type: "triangle", dur: 0.08, vol: 0.18 });
    this.tone({ freq: 1320, type: "triangle", dur: 0.14, vol: 0.14, when: 0.08 });
  },
});
