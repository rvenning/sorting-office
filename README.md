# Sorting Office 📦

Sort the parcels into the right postbox — by shape, by colour, by counting the
stamps, by reading the label. Then the bell rings and the rule changes.

**Play it:** https://rvenning.github.io/sorting-office/

Built for Isabelle at a five-to-six-year-old level: a rule she has to hold in her
head, and one that moves on her.

## Features

- **18 shifts across 6 departments**, each teaching one way of sorting —
  shapes, colours, two things at once, counting to six, reading a word, and
  finally the bell that flips the rule mid-shift.
- **No timers and no losing** in the campaign. A parcel waits as long as she
  likes; a wrong box hops the parcel back out and she tries again. The only
  pressure is the streak bonus, and losing that costs nothing.
- **Stars are graded on accuracy, never speed** — three stars for getting every
  parcel right first time. A careful player can three-star the whole campaign.
- **Streak multiplier** — five right in a row doubles your points, ten triples
  them.
- **The returns bin.** In the Reading Room some parcels carry a word no box
  has, and those go back. Knowing when *not* to sort is the lesson.
- **Rush Hour**, an endless mode that unlocks after nine shifts: the rules keep
  escalating, the window on each parcel keeps shrinking, and three misses end
  the run. This is the family leaderboard score.
- **Supply cupboard** — a robot arm that rescues a parcel she's stuck on, a bell
  warning, and an earlier streak multiplier. Plus a stamp album of twelve
  collectibles that do nothing at all except be collectible.
- **Drag *or* tap.** Drag a parcel onto a box, or just tap the box. Both work.
- Family profiles with PINs, cross-device sync, and a leaderboard.
- Installs as a PWA and plays offline.

## Design notes

Two invariants keep the game fair, and `tests/rules.test.js` enforces both as
build failures rather than play-tests:

1. **Every postbox on screen is labelled on the active rule's attribute.** There
   is never a box that matches the parcel on some other attribute she might
   reasonably have used instead — a colour shift has no shapes on its parcels at
   all.
2. **Under the active rule a parcel resolves to exactly one box**, or to no box
   and then the returns bin is out.

Being told you're wrong when you were right is the worst thing this game could do
to a five-year-old, so it is designed out rather than tested for.

The **Reading Room cannot be failed** (`alwaysPass` in `js/shifts.js`) — finishing
always earns one star and unlocks the next shift. Not being able to read GREEN yet
isn't a skill gap a child grinds past, it's an age gap, and gating the back half
of the game behind it would just end the game. The stars there still demand
accuracy.

**Rush Hour is the only place with a clock**, and it needs one: with no timer a
player who never slips sorts parcels forever and there is no score to rank.

## Built on gamekit

Profiles, storage + family sync, the sound engine, screens/modals, canvas juice
and PWA install all come from [gamekit](https://github.com/rvenning/gamekit),
vendored into `lib/`. To pull in a newer version:

```
node "D:\OneDrive\Documents\Claude Code\gamekit\tools\sync-to-game.js" "D:\OneDrive\Documents\Claude Code\sorting-office"
```

Then bump `CACHE` in `sw.js` or devices keep serving the old copy.

## Layout

```
js/parcels.js    the attribute vocabulary (shape, colour, size, stamps, label)
js/rules.js      the seven sorting rules + how a shift's parcels are dealt
js/shifts.js     18 shifts, 6 departments, Rush Hour stages, all the tuning
js/upgrades.js   supply cupboard + stamp album
js/game.js       the engine — no DOM, no canvas, no audio
js/storage.js    gk-storage config + the coin ledger
js/render.js     the canvas and all the input
js/main.js       screens, results, shop, the frame loop
tests/           the data linter and the balance bots
```

## PWA files

`manifest.json`, `sw.js`, `icons/` (regenerate with `npm run icons`).

## Local development

```
npx http-server "D:\OneDrive\Documents\Claude Code\sorting-office" -p 8109 -c-1
```

Tests (no framework, Node's built-in runner):

```
npm test
```

The balance table — read this before changing any number in `shifts.js`:

```
npm run report
```

`?debug=1` adds a shift jumper and a "finish shift" action. It also **disables
saving** by design, so never check persistence on a debug URL.

## Storage

`so_*` localStorage keys, `sortingoffice` Firestore collection in the shared
`wordvoyage-e5a5c` project. The Firebase config in `js/firebase-config.js` is a
client config, not a secret — the key is restricted to the Cloud Firestore API.

Coins are a two-counter ledger (`coinsEarned` / `coinsSpent`, both monotonic,
balance derived) so that a max() merge across devices can never resurrect spent
coins.
