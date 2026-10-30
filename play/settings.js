// How the game plays: change a number, save, reload the page.
// Times are in seconds unless they say hours. Her bars (stamina, mana) run from 0 (empty) to 1 (full).
// Numbers that belong to a model or an animation (her size, her stride, the broom grip, how long a dig takes) stay in code/.
// The whole loop these numbers drive is described in docs/mechanics.md.
export default {

  day: {
    length: 300,            // seconds in one game day (24 game hours, so one game hour is 12.5 s)
    wakeHour: 6,            // she gets up at 6:00
    nightStarts: 20,        // game hour the night begins: pests come out, the stall closes
    passOutHour: 2,         // still up at 2:00, she collapses and the day ends
  },

  her: {
    walkPace: 1.3,          // 1 = the speed her walk animation was made for; 1.3 = 30% quicker
    runPace: 0.8,           // the same for the run (double tap, or Shift with the keys); the run clip is a sprint, so 0.8 is a jog
    restFor: 15,            // seconds she has to sit down when her stamina runs out
    restGain: 0.25,         // stamina that rest gives back
    passOutStamina: 0.5,    // stamina the morning after passing out (a night in bed gives it all back)
  },

  // stamina each action costs (a full bar is 1). Nothing else uses it up; only a night's sleep fills it.
  stamina: {
    dig: 0.05,
    plant: 0.01,
    water: 0.02,
    harvest: 0.01,
    swat: 0.03,             // one broom swing
    catch: 0.02,            // catching a bug
    fill: 0.01,             // filling the watering can
    feed: 0.01,             // filling the hens' trough
  },

  mana: {
    grow: 0.34,             // the Grow spell: one day of growth, at once, for a watered crop (about three a day)
    perSwat: 0.15,          // mana she gets back for each pest she swats
    sleep: 1,               // mana a night in bed gives back (1 = all of it)
  },

  // days: watered mornings it needs to ripen. seed and sell are prices in coins
  crops: {
    pumpkin: { days: 4, seed: 20, sell: 70 },
    cabbage: { days: 3, seed: 10, sell: 32 },
  },

  soil: {
    bareDays: 2,            // dug soil with nothing planted turns back into plain ground after this many mornings
  },

  can: {
    holds: 12,              // waterings in a full can
    bigHolds: 30,           // ...in the big can from the stall
    bigPrice: 150,          // coins
  },

  shovel: {
    steelPrice: 250,        // coins for the steel shovel
    steelDig: 0.5,          // it makes digging cost this much of the usual stamina
  },

  start: {                  // what a new farm begins with
    coins: 40,
    items: { 'seed:cabbage': 6, 'seed:pumpkin': 2, feed: 4 },
  },

  shop: {
    opens: 6,               // game hour the stall opens...
    closes: 20,             // ...and closes
    feed: 4,                // coins for one scoop of hen feed (one hen, one day)
    egg: 18,                // what the stall pays for an egg
    bugs: { ladybug: 6, firefly: 14, caterpillar: 5, snail: 4, beetle: 16 },   // what it pays for each bug she catches
  },

  bugs: {
    kinds: ['ladybug', 'firefly', 'caterpillar', 'snail', 'beetle'],   // the friendly bugs: catch them with your hand, sell them
    most: 6,                // most friendly bugs about at once
    appearEvery: [5, 11],   // seconds between new bugs (a random time in this range)
    stayFor: [60, 120],     // seconds a bug wanders before it leaves
    fearRange: 2.6,         // how close she can come before they run
    boltSpeed: 2.0,         // fastest a frightened bug runs
    // walking speed of each kind; bugs are drawn small, so the game scales these down to match
    speed: { snail: 0.22, caterpillar: 0.4, ladybug: 0.75, firefly: 0.85, beetle: 1.0, ant: 1.45 },
  },

  // pests: big red beetles and ants that come out at night and eat crops that are dry (not watered today) or ripe.
  // Watered, growing crops are safe. They never bite her.
  pests: {
    kinds: ['beetle', 'ant'],
    perNight: 1,            // pests that come each night...
    perCrops: 6,            // ...plus one more for every this many crops at risk
    most: 3,                // but never more than this many in one night
    every: [10, 20],        // seconds between pests while it is dark (a random time in this range)
    eatFor: 12,             // seconds a pest needs to eat a crop: time to get there with the broom
    hp: 2,                  // broom hits to swat one
    size: 1.5,              // how much bigger than a normal bug
    speed: 0.9,             // how fast it crawls to the crops
    stun: 0.6,              // seconds a broom hit stops it
  },

  broom: {
    reach: 1.45,            // how far from her a swing reaches
    damage: 1,              // damage one hit does
  },

  hens: {
    start: 2,               // hens a new farm begins with
    most: 6,                // most hens she can keep
    price: 120,             // coins for one more hen at the stall
    speed: 0.7,             // how fast a hen strolls
    eggsMost: 12,           // most eggs lying about at once
    yard: { x: -7.4, z: -1.6, r: 2.4 },   // the patch beside the hut where they wander: centre and radius
  },

  // coins for reaching each goal (the goals are in code/goals.js, their words in words/en.json under ui.goals)
  goals: {
    dig: 0, plant: 0, water: 0, harvest: 20, sell: 0, coins100: 30, egg: 0, pest: 15,
    bigCan: 0, field: 40, bugs: 25, hens: 0, coins1000: 100,
  },
};
