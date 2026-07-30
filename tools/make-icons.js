// Sorting Office icons: a kraft parcel with a blue circle on it, sitting on the
// sorting-room floor. Bright crayon, so everything gets a thick ink outline —
// drawn as a slightly larger ink shape behind each fill, since png.js only fills.
//
//   $env:Path += ';C:\Program Files\nodejs'
//   node tools/make-icons.js

const fs = require("fs");
const path = require("path");
const { makeCanvas, downsample, encodePNG } = require("../lib/tools/png.js");

const INK = "#22201e";
const PAPER = "#fff8e7";
const FLOOR = "#f2e3c6";
const KRAFT = "#d8a35e";
const TAPE = "#bd8442";
const BLUE = "#4aa3ff";

// `art` scales the parcel about the centre. The maskable icon uses a smaller
// value so the art survives a circular or squircle crop.
function paint(size, art) {
  const SS = 4, big = size * SS;
  const cv = makeCanvas(big);
  const u = big / 100;                        // one unit = 1% of the icon
  const mid = big / 2;

  cv.fillRect(0, 0, big, big, PAPER);
  cv.fillRect(0, 72 * u, big, 28 * u, FLOOR);
  cv.fillRect(0, 70.5 * u, big, 2.2 * u, INK);

  const w = 62 * u * art, h = w * 0.76;
  const x = mid - w / 2, y = mid - h / 2 + 3 * u;
  const o = 3.4 * u * art;
  const r = 7 * u * art;

  cv.fillRoundRect(x - o, y - o, w + o * 2, h + o * 2, r + o, INK);
  cv.fillRoundRect(x, y, w, h, r, KRAFT);
  cv.fillRect(x + w * 0.44, y, w * 0.12, h, TAPE);

  const er = h * 0.3;
  cv.fillCircle(mid, y + h * 0.5, er + 2.8 * u * art, INK);
  cv.fillCircle(mid, y + h * 0.5, er, BLUE);

  return encodePNG(size, size, downsample(cv.px, big, SS));
}

const out = path.join(__dirname, "..", "icons");
fs.mkdirSync(out, { recursive: true });

const files = [
  ["icon-192.png", 192, 0.88],
  ["icon-512.png", 512, 0.88],
  ["maskable-512.png", 512, 0.66],
];

for (const [name, size, art] of files) {
  fs.writeFileSync(path.join(out, name), paint(size, art));
  console.log(`icons/${name}`);
}
