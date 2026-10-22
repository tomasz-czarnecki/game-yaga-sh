// How the game plays: change a number, save, reload the page.
// Times are in seconds. Her bars (hunger, joy, health, stamina, mana) run from 0 (empty) to 1 (full).
// Numbers that belong to a model or an animation (her size, her stride, the broom grip) stay in code/.
export default {

  day: {
    length: 300,            // seconds in one game day (24 game hours)
    nightStarts: 20,        // game hour the night begins
    nightEnds: 6,           // game hour the night ends
  },

  her: {
    walkPace: 1.3,          // 1 = the speed her walk animation was made for; 1.3 = 30% quicker
    runPace: 0.8,           // the same for the run (double tap); the run clip is a sprint, so 0.8 is a jog

    // seconds a bar takes to go all the way: the bigger the number, the slower
    hungerAwake: 480,       // fed → starving, while she is up
    hungerAsleep: 1500,     // ...while she sleeps or naps
    staminaDrain: 700,      // full → empty, just by being up and about
    staminaRest: 90,        // empty → full, standing still
    staminaNap: 75,         // empty → full, asleep or napping
    manaRegain: 150,        // empty → full
    joyAwake: 420,          // happy → sad if ignored, while she is up
    joyAsleep: 1800,        // ...while she sleeps
    joyDirty: 400,          // extra sadness while more than one poo is lying about
    healthDirtAwake: 300,   // full → empty from each poo lying about, while she is up
    healthDirtAsleep: 900,  // ...while she sleeps
    healthStarving: 600,    // full → empty while she is very hungry
    healthRecover: 200,     // empty → full while the ground is clean and she is fed

    cravesAbove: 0.55,      // hunger at which she starts craving a kind of bug
    cravingEndsBelow: 0.25, // hunger at which the craving goes away

    strokeJoy: 0.006,       // happiness each time you stroke her
    cleanJoy: 0.08,         // happiness for each poo cleaned up
    cleanHealth: 0.15,      // health for each poo cleaned up

    // while the page is closed (up to 3 days): seconds for a bar to change by 1
    awayHunger: 10800,      // hungrier
    awayStamina: 1200,      // more rested
    awayMana: 300,          // more mana
  },

  // what a meal does: hunger it removes, happiness and health it adds
  food: {
    craved: { hunger: 0.55, joy: 0.08 },                    // the bug she was craving
    other: { hunger: 0.3, joy: 0.02 },                      // any other bug
    harvest: { hunger: 0.3, joy: 0.06, health: 0.05 },      // a ripe crop
    egg: { hunger: 0.18, joy: 0.05, health: 0.03 },         // an egg
  },

  bugs: {
    most: 6,                // most friendly bugs about at once
    appearEvery: [5, 11],   // seconds between new bugs (a random time in this range)
    stayFor: [60, 120],     // seconds a bug wanders before it leaves
    fearRange: 2.6,         // how close she can come before they run
    boltSpeed: 2.0,         // fastest a frightened bug runs
    // walking speed of each kind; bugs are drawn small, so the game scales these down to match
    speed: { snail: 0.22, caterpillar: 0.4, ladybug: 0.75, firefly: 0.85, beetle: 1.0, ant: 1.45 },
  },

  hostile: {
    kinds: ['beetle', 'ant'],   // the kinds that turn up as biters
    hp: 2,                  // broom hits to kill one
    size: 1.5,              // how much bigger than a normal bug
    speed: 1.25,            // how fast it crawls
    bite: 0.04,             // health she loses from one bite
    biteHen: 0.2,           // health a hen loses from one bite (a hen has 1)
    biteEvery: 1.8,         // seconds between bites
    henReach: 0.5,          // how near a hen it must be to bite her
    herRange: 2.2,          // it goes for her when she is this close, otherwise for the nearest hen
    stayFor: [45, 75],      // seconds before it gives up and crawls off
    stun: 0.6,              // seconds a broom hit stops it
    killMana: 0.12,         // mana she gets back for each one she kills
    mostByDay: 1,           // most biters about at once, by day...
    mostByNight: 3,         // ...and by night
    dayEvery: [35, 60],     // seconds between new biters by day (a random time in this range)
    nightEvery: [10, 18],   // ...and by night
    faintFor: 8,            // seconds she lies down when her health hits zero
    faintHealth: 0.25,      // health she wakes up with
  },

  broom: {
    reach: 1.45,            // how far from her a swing reaches
    cost: 0.06,             // stamina one swing costs
    damage: 1,              // damage one hit does
  },

  farm: {
    digCost: 0.1,           // stamina to dig a block
    plantCost: 0.03,        // stamina to plant
    harvestCost: 0.05,      // stamina to harvest
    growMana: 0.3,          // mana the Grow spell costs
    youngAfter: 90,         // seconds after planting a crop is a young plant
    ripeAfter: 300,         // seconds after planting it is ripe
  },

  hens: {
    flock: 4,               // how many she keeps (lost ones come back with the morning)
    speed: 0.7,             // how fast a hen strolls
    runSpeed: 1.9,          // how fast a hen runs from a bug
    healIn: 120,            // seconds for a bitten hen to heal fully
    eggEvery: [100, 160],   // seconds between one hen's eggs (a random time in this range)
    eggsMost: 6,            // most eggs lying about at once
    feedHeals: 0.5,         // health each hen gets back when she harvests a crop
    feedLaysWithin: 30,     // after a harvest each hen lays within this many seconds
    yard: { x: -3.6, z: 0.4, r: 3.2 },   // the patch in front of the hut where they wander: centre and radius
  },
};
