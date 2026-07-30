// Seeds Math.random for the test sandbox. Loaded FIRST in any suite that runs
// the engine, so a failing balance assertion means a real tuning change rather
// than an unlucky deal.
(function () {
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  globalThis.__reseed = function (n) { Math.random = mulberry32(n >>> 0); };
  // Tests live OUTSIDE this sandbox, so their own Math.random is a different,
  // unseeded one. Anything random in a bot must come through here instead.
  globalThis.__rand = function () { return Math.random(); };
  globalThis.__reseed(20260730);
})();
