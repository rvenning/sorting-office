// Sorting Office — the canvas: the sorting room, the parcel, the postboxes,
// and all the input.
//
// Bright crayon: flat saturated fills, every edge stroked in the same near-black
// ink, nothing softer than a rounded corner. No gradients and no shadows, which
// also means nothing here needs a compositing pass to look right.
//
// Two ways to sort, both wired up, because one of them will suit her and I don't
// get to decide which: DRAG the parcel onto a box, or just TAP the box. Tapping
// is far more reliable for a small hand and costs nothing to support, since both
// paths end in the same App.sortTo(dest).
//
// The engine has already moved on by the time an animation plays, so a sorted
// parcel is COPIED into `fly` and animated independently of Game.parcel. Nothing
// on screen is the source of truth for anything.

const Render = {
  cv: null, ctx: null,
  W: 0, H: 0, scale: 1, safeB: 0,
  boxes: [], boxY: 0, boxH: 0, parcelY: 0, beltY: 0,

  drag: null,             // { x, y } while a parcel is held
  downSlot: null,         // slot the finger went down on, for tap-to-sort
  hoverSlot: null,        // slot the held parcel is over

  fly: null,              // { parcel, attrs, x0, y0, x1, y1, t, dur }
  wobble: 0,              // the current parcel hopping back after a wrong box
  bellAnim: 0,
  squash: [],             // per-slot gulp timers
  shakeSlot: null, shakeT: 0,
  timeLimit: Infinity,
  lastTick: 0,

  boot() {
    this.cv = document.getElementById("cv");
    this.ctx = this.cv.getContext("2d");
    this.stage = document.getElementById("stage");

    const remeasure = () => { this.resize(); setTimeout(() => this.resize(), 350); };
    window.addEventListener("resize", remeasure);
    window.addEventListener("orientationchange", remeasure);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", remeasure);
      window.visualViewport.addEventListener("scroll", () => this.resize());
    }
    // iOS ignores user-scalable=no for pinch; block it at the source so little
    // hands can't leave the game stuck zoomed in.
    document.addEventListener("gesturestart", (e) => e.preventDefault());
    document.addEventListener("gesturechange", (e) => e.preventDefault());
    remeasure();

    const pos = (e) => {
      const r = this.cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    this.cv.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.cv.setPointerCapture(e.pointerId);
      const p = pos(e); this.onDown(p.x, p.y);
    });
    this.cv.addEventListener("pointermove", (e) => { const p = pos(e); this.onMove(p.x, p.y); });
    this.cv.addEventListener("pointerup", (e) => { const p = pos(e); this.onUp(p.x, p.y); });
    this.cv.addEventListener("pointercancel", () => { this.drag = null; this.downSlot = null; this.hoverSlot = null; });
  },

  /* ---------- layout ---------- */

  resize() {
    const stage = document.getElementById("stage");
    if (!stage) return;
    const box = stage.getBoundingClientRect();
    // The game screen is display:none until it's shown, and a resize then reads
    // 0x0 — keep the last good layout rather than dividing by nothing.
    if (box.width < 50 || box.height < 50) return;

    this.W = box.width; this.H = box.height;
    const dpr = window.devicePixelRatio || 1;
    // Set the BACKING STORE only. The canvas takes its display size from
    // `width:100%; height:100%` in the stylesheet, which is what keeps a retina
    // canvas from rendering dpr-times too big. Pinning an inline pixel size here
    // as well looks equivalent and isn't: it goes stale the moment anything
    // reflows the stage, and the canvas then hangs 36px below it.
    this.cv.width = Math.round(this.W * dpr);
    this.cv.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.scale = GK.util.clamp(this.W / 380, 0.7, 1.7);
    this.safeB = parseFloat(getComputedStyle(stage).getPropertyValue("--safe-b")) || 0;

    this.boxH = GK.util.clamp(this.H * 0.3, 104, 190);
    this.boxY = this.H - this.boxH - this.safeB - 10 * this.scale;
    this.beltY = GK.util.clamp(this.H * 0.2, 60, 150);
    this.parcelY = this.beltY + (this.boxY - this.beltY) * 0.42;
    this.layoutBoxes();
  },

  // Called on resize AND at the start of a shift: the bell re-labels the boxes it
  // already has, so the count only changes between shifts.
  layoutBoxes() {
    if (!Game.shift) { this.boxes = []; return; }
    const n = Game.boxKeys().length + (Game.binPresent() ? 1 : 0);
    const pad = 6 * this.scale;
    const gap = Math.max(5, 8 * this.scale);
    const w = Math.min(104 * this.scale, (this.W - pad * 2 - gap * (n - 1)) / n);
    const total = w * n + gap * (n - 1);
    const x0 = (this.W - total) / 2;
    this.boxes = [];
    for (let i = 0; i < n; i++) {
      this.boxes.push({ x: x0 + i * (w + gap), y: this.boxY, w, h: this.boxH, slot: i });
    }
    this.squash = this.boxes.map(() => 0);
  },

  // The bin, when there is one, is always the last slot.
  destForSlot(slot) {
    const n = Game.boxKeys().length;
    return Game.binPresent() && slot === n ? "bin" : slot;
  },

  hitSlot(x, y) {
    for (const b of this.boxes) {
      // A generous target: the whole column above the box counts as aiming at it.
      if (x >= b.x - 3 && x <= b.x + b.w + 3 && y >= b.y - 22 * this.scale && y <= b.y + b.h) return b.slot;
    }
    return null;
  },

  parcelHit(x, y) {
    const r = 62 * this.scale;
    return Math.abs(x - this.W / 2) < r && Math.abs(y - this.parcelY) < r;
  },

  /* ---------- input ---------- */

  onDown(x, y) {
    if (!Game.running) return;
    const slot = this.hitSlot(x, y);
    if (slot !== null) { this.downSlot = slot; return; }
    if (this.parcelHit(x, y)) {
      this.drag = { x, y };
      this.wobble = 0;
      GK.Sfx.lift();
    }
  },

  onMove(x, y) {
    if (!this.drag) return;
    this.drag.x = x; this.drag.y = y;
    this.hoverSlot = this.hitSlot(x, y);
  },

  onUp(x, y) {
    const slot = this.hitSlot(x, y);
    if (this.drag) {
      this.drag = null;
      this.hoverSlot = null;
      if (slot !== null) App.sortTo(this.destForSlot(slot));
      else this.wobble = 0.45;      // dropped in mid-air: hop back to the belt
      this.downSlot = null;
      return;
    }
    // Tap-to-sort: pressed and released on the same box.
    if (this.downSlot !== null && slot === this.downSlot) App.sortTo(this.destForSlot(slot));
    this.downSlot = null;
  },

  /* ---------- engine events ---------- */

  onParcel(d) {
    this.timeLimit = d.timeLimit;
    this.wobble = 0;
    this.lastTick = 0;
  },

  // `dest` is where it went; the engine has already advanced to the next parcel.
  onSorted(parcel, attrs, dest, ok) {
    const slot = dest === "bin" ? Game.boxKeys().length : dest;
    const b = this.boxes[slot];
    if (!b) return;
    this.fly = {
      parcel, attrs,
      x0: this.W / 2, y0: this.parcelY,
      x1: b.x + b.w / 2, y1: b.y + b.h * 0.18,   // the posting slot
      t: 0, dur: 0.22,
    };
    this.squash[slot] = 0.3;
    if (ok) {
      Fx.burst(b.x + b.w / 2, b.y + b.h * 0.25, "#ffd63d", 12, 150, 0.5, 3);
      Fx.sparkle(b.x + b.w / 2, b.y + b.h * 0.25, 6);
    }
  },

  onWrong(d) {
    const slot = d.dest === "bin" ? Game.boxKeys().length : d.dest;
    this.wobble = 0.5;
    this.shakeSlot = slot;
    this.shakeT = 0.35;
    Fx.addShake(3);
  },

  onBell() {
    this.bellAnim = 1.1;
    Fx.flash = 0.5;
    Fx.flashColor = "#ffd63d";
    Fx.addShake(4);
  },

  points(text, colour) {
    Fx.text(this.W / 2, this.parcelY - 20 * this.scale, text, { color: colour || "#22201e", size: 16 * this.scale });
  },

  /* ---------- animation ---------- */

  update(dt) {
    // The stage can change size without a window resize event — the web font
    // landing retitles the rule banner, the bell warning appears. Rather than
    // hunt every cause, notice the drift and re-measure.
    if (this.stage) {
      const b = this.stage.getBoundingClientRect();
      if (b.width > 50 && b.height > 50 &&
          (Math.abs(b.width - this.W) > 1 || Math.abs(b.height - this.H) > 1)) this.resize();
    }

    if (this.fly) { this.fly.t += dt; if (this.fly.t >= this.fly.dur) this.fly = null; }
    if (this.wobble > 0) this.wobble = Math.max(0, this.wobble - dt);
    if (this.bellAnim > 0) this.bellAnim = Math.max(0, this.bellAnim - dt);
    if (this.shakeT > 0) { this.shakeT = Math.max(0, this.shakeT - dt); if (!this.shakeT) this.shakeSlot = null; }
    for (let i = 0; i < this.squash.length; i++)
      if (this.squash[i] > 0) this.squash[i] = Math.max(0, this.squash[i] - dt);

    // Rush Hour's last-second ticking, at most once every 0.4s.
    if (Game.running && Game.mode === "rush" && Game.timeLeft < 1.8) {
      this.lastTick -= dt;
      if (this.lastTick <= 0) { GK.Sfx.ticking(); this.lastTick = 0.4; }
    }
  },

  /* ---------- drawing ---------- */

  render() {
    const ctx = this.ctx;
    if (!this.W || !Game.shift) return;
    ctx.clearRect(0, 0, this.W, this.H);
    this.drawRoom();

    const attrs = Game.visibleAttrs();
    const labels = Game.boxLabels();

    this.boxes.forEach((b) => {
      const isBin = Game.binPresent() && b.slot === Game.boxKeys().length;
      this.drawBox(b, isBin ? null : labels[b.slot], isBin);
    });

    if (this.fly) {
      const t = this.fly.t / this.fly.dur;
      const e = t * t;                                     // accelerate into the box
      const x = GK.util.lerp(this.fly.x0, this.fly.x1, e);
      const y = GK.util.lerp(this.fly.y0, this.fly.y1, e);
      this.drawParcel(this.fly.parcel, x, y, 1 - 0.35 * t, this.fly.attrs);
    }

    if (Game.running && Game.parcel) {
      let x = this.W / 2, y = this.parcelY, s = 1;
      if (this.drag) {
        x = this.drag.x;
        // Float the parcel above the finger so a small hand doesn't cover it.
        y = this.drag.y - 42 * this.scale;
        s = 1.08;
      } else if (this.wobble > 0) {
        x += Math.sin(this.wobble * 46) * 12 * this.scale * (this.wobble / 0.5);
      }
      this.drawParcel(Game.parcel, x, y, s, attrs);
    }

    Fx.render(ctx);
  },

  drawRoom() {
    const ctx = this.ctx, S = this.scale;
    const floorY = this.boxY + this.boxH * 0.66;

    ctx.fillStyle = "#fffdf5";
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.fillStyle = "#f2e3c6";
    ctx.fillRect(0, floorY, this.W, this.H - floorY);
    ctx.fillStyle = INK;
    ctx.fillRect(0, floorY - 3 * S, this.W, 3 * S);

    // floorboards
    ctx.fillStyle = "rgba(34,32,30,0.07)";
    for (let x = 0; x < this.W; x += 46 * S) ctx.fillRect(x, floorY, 3 * S, this.H - floorY);

    // The conveyor the parcel sits on, with rollers, so the belt reads as a belt.
    const bh = 22 * S, by = this.beltY;
    ctx.lineWidth = Math.max(2.5, 3.4 * S);
    ctx.strokeStyle = INK; ctx.lineJoin = "round";
    ctx.fillStyle = "#8a8f96";
    rrect(ctx, -8, by, this.W + 16, bh, 5 * S);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#5b6068";
    for (let x = 14 * S; x < this.W; x += 30 * S) {
      ctx.beginPath(); ctx.arc(x, by + bh / 2, 5 * S, 0, Math.PI * 2); ctx.fill();
    }

    // The bell, up in the corner, swinging when it has just rung.
    if (Game.shift.bell) this.drawBell(this.W - 34 * S, by + bh + 30 * S, 16 * S);

    // Rush Hour's clock: a bar that empties across the top of the belt.
    if (Game.mode === "rush" && Number.isFinite(this.timeLimit)) {
      const frac = GK.util.clamp(Game.timeLeft / this.timeLimit, 0, 1);
      const w = this.W - 24 * S, x = 12 * S, y = by - 16 * S, h = 9 * S;
      ctx.fillStyle = "#e8e0cd";
      rrect(ctx, x, y, w, h, h / 2); ctx.fill();
      ctx.fillStyle = frac < 0.3 ? "#e8467c" : "#5ec26a";
      rrect(ctx, x, y, Math.max(h, w * frac), h, h / 2); ctx.fill();
      ctx.lineWidth = 2.4 * S; ctx.strokeStyle = INK;
      rrect(ctx, x, y, w, h, h / 2); ctx.stroke();
    }
  },

  drawBell(cx, cy, r) {
    const ctx = this.ctx, S = this.scale;
    const swing = this.bellAnim > 0 ? Math.sin(this.bellAnim * 30) * 0.35 * this.bellAnim : 0;
    ctx.save();
    ctx.translate(cx, cy - r);
    ctx.rotate(swing);
    ctx.lineWidth = Math.max(2.2, 3 * S);
    ctx.strokeStyle = INK; ctx.lineJoin = "round";
    ctx.fillStyle = this.bellAnim > 0 ? "#fff3c4" : "#ffd63d";
    ctx.beginPath();
    ctx.moveTo(-r, r);
    ctx.quadraticCurveTo(-r, -r * 0.9, 0, -r * 0.9);
    ctx.quadraticCurveTo(r, -r * 0.9, r, r);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK;
    rrect(ctx, -r * 1.2, r, r * 2.4, r * 0.34, r * 0.17); ctx.fill();
    ctx.beginPath(); ctx.arc(0, r * 1.6, r * 0.26, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },

  /* ---------- the parcel ---------- */

  drawParcel(p, cx, cy, s, attrs) {
    const ctx = this.ctx, S = this.scale;
    const mul = attrs.includes("size") ? sizeScale(p.size) : 1;
    const w = 96 * S * s * mul, h = 74 * S * s * mul;
    const x = cx - w / 2, y = cy - h / 2;
    const r = 8 * S;

    ctx.lineWidth = Math.max(2.6, 3.6 * S);
    ctx.strokeStyle = INK; ctx.lineJoin = "round";
    ctx.fillStyle = attrs.includes("colour") && p.colour ? colourOf(p.colour).hex : PARCEL_BROWN;
    rrect(ctx, x, y, w, h, r); ctx.fill();

    // Parcel tape, so even a plain brown box reads as a parcel.
    ctx.save();
    rrect(ctx, x, y, w, h, r); ctx.clip();
    ctx.fillStyle = "rgba(34,32,30,0.12)";
    ctx.fillRect(cx - w * 0.055, y, w * 0.11, h);
    ctx.restore();
    rrect(ctx, x, y, w, h, r); ctx.stroke();

    // Stamps go along the top so they never collide with a shape in the middle.
    if (attrs.includes("stamps") && p.stamps > 0) this.drawStamps(p.stamps, cx, y + h * 0.22, w);
    if (attrs.includes("label") && p.label) this.drawWordLabel(p.label, cx, cy, w, h);
    if (attrs.includes("shape")) {
      const dy = attrs.includes("stamps") ? h * 0.16 : 0;
      drawShape(ctx, p.shape, cx, cy + dy, h * 0.3, "#fffdf5", Math.max(2.2, 3 * S));
    }
  },

  drawStamps(n, cx, cy, w) {
    const ctx = this.ctx, S = this.scale;
    const per = Math.min(n, 3);
    const rows = Math.ceil(n / 3);
    const d = 12 * S, gap = 4 * S;
    ctx.lineWidth = Math.max(1.8, 2.2 * S);
    ctx.strokeStyle = INK;
    let left = n;
    for (let row = 0; row < rows; row++) {
      const inRow = Math.min(left, per);
      const rowW = inRow * d + (inRow - 1) * gap;
      const x0 = cx - rowW / 2;
      for (let i = 0; i < inRow; i++) {
        ctx.fillStyle = "#e8467c";
        rrect(ctx, x0 + i * (d + gap), cy + row * (d + gap) - d / 2, d, d, 2.5 * S);
        ctx.fill(); ctx.stroke();
      }
      left -= inRow;
    }
  },

  drawWordLabel(word, cx, cy, w, h) {
    const ctx = this.ctx, S = this.scale;
    const lw = w * 0.82, lh = h * 0.42;
    ctx.fillStyle = "#fffdf5";
    ctx.lineWidth = Math.max(2, 2.6 * S);
    ctx.strokeStyle = INK;
    rrect(ctx, cx - lw / 2, cy - lh / 2, lw, lh, 4 * S);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    let size = 19 * S;
    ctx.font = `800 ${size}px 'Baloo 2', sans-serif`;
    while (ctx.measureText(word).width > lw * 0.86 && size > 8) {
      size -= 1;
      ctx.font = `800 ${size}px 'Baloo 2', sans-serif`;
    }
    ctx.fillText(word, cx, cy + 1);
  },

  /* ---------- the postboxes ---------- */

  drawBox(b, label, isBin) {
    const ctx = this.ctx, S = this.scale;
    const hovered = this.hoverSlot === b.slot || this.downSlot === b.slot;
    const gulp = this.squash[b.slot] || 0;
    const shake = this.shakeSlot === b.slot ? Math.sin(this.shakeT * 60) * 4 * S * (this.shakeT / 0.35) : 0;

    // Anchor at the box's BOTTOM-left and draw upward in negative y, so the gulp
    // squash settles into the floor instead of floating. The second translate
    // must NOT shift y — doing that put every box a full box-height above its
    // own hitbox, which drew a correct-looking room you couldn't hit.
    ctx.save();
    ctx.translate(b.x + b.w / 2 + shake, b.y + b.h);
    const sy = 1 - gulp * 0.22, sx = 1 + gulp * 0.14;
    ctx.scale(hovered ? sx * 1.05 : sx, hovered ? sy * 1.05 : sy);
    ctx.translate(-b.w / 2, 0);

    ctx.lineWidth = Math.max(2.8, 3.8 * S);
    ctx.strokeStyle = INK; ctx.lineJoin = "round";

    if (isBin) this.drawBinBody(b.w, b.h);
    else this.drawPostBody(b.w, b.h, label);

    if (hovered) {
      ctx.lineWidth = Math.max(3, 4.6 * S);
      ctx.strokeStyle = "#ffd63d";
      rrect(ctx, -3, -b.h - 3, b.w + 6, b.h + 6, 11 * S);
      ctx.stroke();
    }
    ctx.restore();
  },

  drawPostBody(w, h, label) {
    const ctx = this.ctx, S = this.scale;
    const body = label.kind === "colour" && label.colour ? colourOf(label.colour).hex : "#8a8f96";

    // legs
    ctx.fillStyle = "#6b5336";
    rrect(ctx, w * 0.18, -h * 0.1, w * 0.14, h * 0.12, 2 * S); ctx.fill(); ctx.stroke();
    rrect(ctx, w * 0.68, -h * 0.1, w * 0.14, h * 0.12, 2 * S); ctx.fill(); ctx.stroke();

    ctx.fillStyle = body;
    rrect(ctx, 0, -h, w, h * 0.92, 9 * S); ctx.fill(); ctx.stroke();

    // the posting slot
    ctx.fillStyle = INK;
    rrect(ctx, w * 0.2, -h * 0.88, w * 0.6, h * 0.1, 3 * S); ctx.fill();

    // what this box wants
    const cx = w / 2, cy = -h * 0.45, r = Math.min(w, h) * 0.19;
    switch (label.kind) {
      case "shape":
        drawShape(ctx, label.shape, cx, cy, r * (label.size ? sizeScale(label.size) : 1) * 1.15,
          "#fffdf5", Math.max(2.2, 3 * S));
        break;
      case "size":
        drawShape(ctx, "square", cx, cy, r * sizeScale(label.size) * 1.2, "#fffdf5", Math.max(2.2, 3 * S));
        break;
      case "colour":
        // The body already IS the colour, so only a size shift needs an emblem.
        if (label.size) drawShape(ctx, "square", cx, cy, r * sizeScale(label.size) * 1.2, "#fffdf5", Math.max(2.2, 3 * S));
        break;
      case "stamps": {
        const n = label.stamps, per = Math.min(n, 3), rows = Math.ceil(n / 3);
        const d = Math.min(13 * S, w * 0.19), gap = 3.5 * S;
        ctx.lineWidth = Math.max(1.8, 2.2 * S);
        let left = n;
        for (let row = 0; row < rows; row++) {
          const inRow = Math.min(left, per);
          const rowW = inRow * d + (inRow - 1) * gap;
          for (let i = 0; i < inRow; i++) {
            ctx.fillStyle = "#fffdf5";
            ctx.beginPath();
            ctx.arc(cx - rowW / 2 + d / 2 + i * (d + gap),
              cy + (row - (rows - 1) / 2) * (d + gap), d / 2, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
          }
          left -= inRow;
        }
        break;
      }
      case "word": {
        ctx.fillStyle = "#fffdf5";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        let size = 16 * S;
        ctx.font = `800 ${size}px 'Baloo 2', sans-serif`;
        while (ctx.measureText(label.word).width > w * 0.84 && size > 7) {
          size -= 1;
          ctx.font = `800 ${size}px 'Baloo 2', sans-serif`;
        }
        ctx.lineWidth = Math.max(2.4, 3.2 * S);
        ctx.strokeStyle = INK;
        ctx.strokeText(label.word, cx, cy);
        ctx.fillText(label.word, cx, cy);
        break;
      }
    }
  },

  // The returns bin: no lid, tilted, obviously not a postbox.
  drawBinBody(w, h) {
    const ctx = this.ctx, S = this.scale;
    ctx.fillStyle = "#b9bec6";
    ctx.beginPath();
    ctx.moveTo(w * 0.08, -h * 0.78);
    ctx.lineTo(w * 0.92, -h * 0.78);
    ctx.lineTo(w * 0.8, 0);
    ctx.lineTo(w * 0.2, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // rim
    ctx.fillStyle = "#8a8f96";
    rrect(ctx, 0, -h * 0.88, w, h * 0.13, 4 * S); ctx.fill(); ctx.stroke();

    // a return arrow, so it reads as "back where it came from" without words
    ctx.strokeStyle = "#fffdf5";
    ctx.lineWidth = Math.max(3, 4 * S);
    ctx.lineCap = "round";
    const cx = w / 2, cy = -h * 0.42, r = Math.min(w, h) * 0.17;
    ctx.beginPath();
    ctx.arc(cx + r * 0.2, cy, r, Math.PI * 0.55, Math.PI * 1.75);
    ctx.stroke();
    ctx.fillStyle = "#fffdf5";
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.95, cy + r * 0.05);
    ctx.lineTo(cx - r * 0.2, cy + r * 0.5);
    ctx.lineTo(cx - r * 0.35, cy - r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.lineCap = "butt";
  },
};

/* ---------- shared drawing primitives ---------- */

function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawShape(ctx, shape, cx, cy, r, fill, lw) {
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  ctx.lineJoin = "round";
  ctx.fillStyle = fill;
  switch (shape) {
    case "circle":
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); break;
    case "square":
      rrect(ctx, cx - r * 0.88, cy - r * 0.88, r * 1.76, r * 1.76, r * 0.22); break;
    case "triangle":
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.92, cy + r * 0.72);
      ctx.lineTo(cx - r * 0.92, cy + r * 0.72);
      ctx.closePath();
      break;
    case "star":
    default:
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.46 : r;
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      break;
  }
  ctx.fill(); ctx.stroke();
}
