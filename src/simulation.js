const TAU = Math.PI * 2;
const MAX_EVENTS = 200;
const MAX_EPOCHS = 64;
const START_TIME = 13_800_000_000;
const BILLION_YEARS = 1_000_000_000;

export const DEFAULT_SEED = 777;
export const LIMITS = Object.freeze({ maxEvents: MAX_EVENTS, maxEpochs: MAX_EPOCHS });

function hashSeed(seed) {
  let value = Number(seed) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) || 1;
}

function random(seed) {
  let state = hashSeed(seed);
  return () => {
    state += 0x6d2b79f5;
    let result = state;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

function pick(rng, list) { return list[Math.floor(rng() * list.length)]; }
function range(rng, min, max) { return min + (max - min) * rng(); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function round(value, digits = 2) { const factor = 10 ** digits; return Math.round(value * factor) / factor; }

function stableUnit(seed, label) {
  let value = hashSeed(seed);
  for (const character of label) {
    value ^= character.codePointAt(0);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0) / 4294967296;
}

function starClass(rng) {
  const roll = rng();
  if (roll < .05) return { spectral: "O", temperature: 30000, mass: 28, lifetime: 8_000_000 };
  if (roll < .13) return { spectral: "B", temperature: 15000, mass: 8, lifetime: 35_000_000 };
  if (roll < .27) return { spectral: "A", temperature: 8500, mass: 2, lifetime: 900_000_000 };
  if (roll < .48) return { spectral: "F", temperature: 6500, mass: 1.3, lifetime: 4_000_000_000 };
  if (roll < .78) return { spectral: "G", temperature: 5700, mass: 1, lifetime: 10_000_000_000 };
  if (roll < .94) return { spectral: "K", temperature: 4500, mass: .72, lifetime: 25_000_000_000 };
  return { spectral: "M", temperature: 3200, mass: .32, lifetime: 100_000_000_000 };
}

function createPlanet(rng, starId, index) {
  const orbitAU = round(.25 + index ** 1.55 * range(rng, .55, 1.1), 3);
  const size = range(rng, .35, 2.6);
  const water = clamp(range(rng, -.2, 1.15) - Math.abs(orbitAU - 1.15) * .18, 0, 1);
  const atmosphere = clamp(range(rng, .1, 1) + (size > 1 ? .15 : -.15), .02, 1);
  const lifeCandidate = water > .47 && atmosphere > .35 && orbitAU > .55 && orbitAU < 2.3;
  return {
    id: `${starId}-p${index + 1}`,
    name: `${starId.toUpperCase()}-${String.fromCharCode(65 + index)}`,
    orbitAU,
    size: round(size, 2),
    water: round(water, 3),
    atmosphere: round(atmosphere, 3),
    lifeCandidate,
    phase: range(rng, 0, TAU),
    orbitalPeriod: Math.max(0.08, orbitAU ** 1.5),
  };
}

function createStar(rng, galaxyId, index, ageOffset) {
  const id = `${galaxyId}-s${index + 1}`;
  const kind = starClass(rng);
  const planetCount = 2 + Math.floor(rng() * 5);
  const birthTime = Math.max(0, START_TIME - range(rng, 10_000_000, 12_500_000_000) - ageOffset);
  return {
    id,
    name: `${pick(rng, ["Aster", "Cinder", "Lumen", "Morrow", "Nacre", "Orison", "Vesper"])} ${index + 1}`,
    x: range(rng, -1, 1), y: range(rng, -1, 1),
    spectral: kind.spectral, temperature: kind.temperature, mass: kind.mass, lifetime: kind.lifetime,
    birthTime, phase: range(rng, 0, TAU),
    planets: Array.from({ length: planetCount }, (_, planetIndex) => createPlanet(rng, id, planetIndex)),
  };
}

function createGalaxy(rng, index) {
  const names = ["Perseus Pocket", "The Quiet Wheel", "Blue Orchard", "Ember Reach", "Morrow Spiral"];
  const id = `g${index + 1}`;
  const systemCount = 4 + Math.floor(rng() * 5);
  const ageOffset = range(rng, -500_000_000, 500_000_000);
  return {
    id, name: names[index] ?? `Pocket Galaxy ${index + 1}`,
    x: range(rng, -.86, .86), y: range(rng, -.72, .72), radius: range(rng, .12, .22),
    tint: pick(rng, ["violet", "blue", "gold", "rose"]),
    systems: Array.from({ length: systemCount }, (_, starIndex) => createStar(rng, id, starIndex, ageOffset)),
  };
}

function makeMemory() { return { events: [], epochs: [], lastEpoch: -1, totalCompactions: 0 }; }

function enrichUniverse(universe) {
  for (const galaxy of universe.galaxies) {
    const gasKey = `${galaxy.id}:gas`;
    galaxy.gas ??= {
      initialMass: round(35 + stableUnit(universe.seed, `${gasKey}:mass`) * 65, 3),
      metallicity: round(.003 + stableUnit(universe.seed, `${gasKey}:metals`) * .021, 5),
      depletionTime: round((3.5 + stableUnit(universe.seed, `${gasKey}:depletion`) * 7) * BILLION_YEARS),
      clouds: Array.from({ length: 4 }, (_, index) => ({
        x: round(stableUnit(universe.seed, `${gasKey}:cloud:${index}:x`) * 1.5 - .75, 4),
        y: round(stableUnit(universe.seed, `${gasKey}:cloud:${index}:y`) * 1.2 - .6, 4),
        radius: round(.08 + stableUnit(universe.seed, `${gasKey}:cloud:${index}:radius`) * .12, 4),
        density: round(.35 + stableUnit(universe.seed, `${gasKey}:cloud:${index}:density`) * .65, 4),
      })),
    };

    for (const star of galaxy.systems) {
      star.metallicity ??= round(clamp(galaxy.gas.metallicity * (.76 + stableUnit(universe.seed, `${star.id}:metals`) * .52), .001, .04), 5);
      for (const planet of star.planets) {
        planet.chemistry ??= {
          carbon: round(clamp(.08 + star.metallicity * 12 + stableUnit(universe.seed, `${planet.id}:carbon`) * .34, 0, 1), 3),
          silicates: round(clamp(.25 + stableUnit(universe.seed, `${planet.id}:silicates`) * .7, 0, 1), 3),
          volatiles: round(clamp(planet.water * .58 + planet.atmosphere * .27 + stableUnit(universe.seed, `${planet.id}:volatiles`) * .15, 0, 1), 3),
        };
        planet.biosphereLag ??= round((.35 + stableUnit(universe.seed, `${planet.id}:biosphere`) * 3.8) * BILLION_YEARS);
      }
    }
  }
  universe.version = 2;
  return universe;
}

export function createUniverse(seed = DEFAULT_SEED) {
  const rng = random(seed);
  const universe = {
    version: 2, seed: Number(seed) >>> 0, time: START_TIME,
    galaxies: Array.from({ length: 5 }, (_, index) => createGalaxy(rng, index)), memory: makeMemory(),
  };
  enrichUniverse(universe);
  recordEvent(universe, { type: "origin", time: START_TIME, message: "The miniature universe initialized." });
  return universe;
}

function recordEvent(universe, event) {
  universe.memory.events.push({ ...event, time: round(event.time, 3) });
  if (universe.memory.events.length > MAX_EVENTS) {
    universe.memory.events.splice(0, universe.memory.events.length - MAX_EVENTS);
    universe.memory.totalCompactions += 1;
  }
}

function summarizeEpoch(universe) {
  const epoch = Math.floor(universe.time / 100_000_000);
  if (epoch === universe.memory.lastEpoch) return;
  universe.memory.lastEpoch = epoch;
  const stars = universe.galaxies.flatMap((galaxy) => galaxy.systems);
  const living = stars.filter((star) => starPhase(star, universe.time) === "main sequence").length;
  const candidates = stars.flatMap((star) => star.planets).filter((planet) => planet.lifeCandidate).length;
  universe.memory.epochs.push({ epoch, time: round(universe.time), livingStars: living, lifeCandidates: candidates });
  if (universe.memory.epochs.length > MAX_EPOCHS) universe.memory.epochs.shift();
}

function starAge(star, time) { return Math.max(0, time - star.birthTime); }

export function starPhase(star, time) {
  const age = starAge(star, time);
  if (age >= star.lifetime) return star.mass > 8 ? "black hole / neutron star" : "white dwarf";
  if (age > star.lifetime * .9) return "red giant";
  return "main sequence";
}

export function starLuminosity(star, time) {
  const ageRatio = clamp(starAge(star, time) / star.lifetime, 0, 1);
  if (ageRatio >= 1) return star.mass > 8 ? .02 : .1;
  if (ageRatio > .9) return star.mass ** 3 * 80;
  return Math.max(.01, star.mass ** 3.5);
}

export function planetClimate(star, planet, time) {
  const luminosity = starLuminosity(star, time);
  const equilibrium = 278 * Math.pow(Math.max(.01, luminosity) / (planet.orbitAU ** 2), .25);
  const greenhouse = 1 + planet.atmosphere * 0.34;
  const temperatureK = equilibrium * greenhouse;
  const liquidWater = clamp(planet.water * (1 - Math.abs(temperatureK - 288) / 240), 0, 1);
  const habitability = clamp(liquidWater * .62 + planet.atmosphere * .24 + (planet.lifeCandidate ? .14 : 0), 0, 1);
  return { temperatureK, liquidWater, habitability };
}

function returnedStellarGas(galaxy, time) {
  return galaxy.systems.reduce((total, star) => {
    if (starPhase(star, time) === "main sequence") return total;
    const compactFraction = star.mass > 8 ? .18 : .42;
    return total + star.mass * (1 - compactFraction) * .08;
  }, 0);
}

export function galaxyGasState(galaxy, time) {
  const elapsed = Math.max(0, time - START_TIME);
  const consumed = galaxy.gas.initialMass * (1 - Math.exp(-elapsed / galaxy.gas.depletionTime));
  const recycled = Math.max(0, returnedStellarGas(galaxy, time) - returnedStellarGas(galaxy, START_TIME));
  const mass = Math.max(0, galaxy.gas.initialMass - consumed + recycled);
  const fraction = clamp(mass / galaxy.gas.initialMass, 0, 1.25);
  const metallicity = clamp(galaxy.gas.metallicity + recycled / Math.max(1, mass) * .004, .001, .08);
  const starFormationRate = mass / galaxy.gas.depletionTime * BILLION_YEARS;
  return { mass, fraction, metallicity, starFormationRate, recycled };
}

export function planetChemistry(star, planet) {
  const chemistry = planet.chemistry ?? { carbon: 0, silicates: 0, volatiles: 0 };
  const suitability = clamp(chemistry.carbon * .36 + chemistry.silicates * .18 + chemistry.volatiles * .34 + clamp((star.metallicity ?? .01) * 20, 0, 1) * .12, 0, 1);
  return { ...chemistry, metallicity: star.metallicity ?? .01, suitability };
}

export function biosphereState(star, planet, time) {
  const climate = planetClimate(star, planet, time);
  const chemistry = planetChemistry(star, planet);
  const age = starAge(star, time);
  const emergenceAge = (planet.biosphereLag ?? 4 * BILLION_YEARS) / (.58 + chemistry.suitability * .72);
  if (!planet.lifeCandidate || climate.habitability < .28) return { stage: "sterile", coverage: 0, emergenceAge, chemistrySuitability: chemistry.suitability };
  if (starPhase(star, time) !== "main sequence") return { stage: "remnant", coverage: 0, emergenceAge, chemistrySuitability: chemistry.suitability };
  if (age < emergenceAge) return { stage: "prebiotic", coverage: clamp(age / emergenceAge * .18, 0, .18), emergenceAge, chemistrySuitability: chemistry.suitability };
  const livingAge = age - emergenceAge;
  const complexThreshold = 2.2 * BILLION_YEARS / (.65 + climate.habitability * .55);
  if (livingAge < complexThreshold) return { stage: "microbial", coverage: clamp(.22 + livingAge / complexThreshold * .38, .22, .6), emergenceAge, chemistrySuitability: chemistry.suitability };
  return { stage: "complex", coverage: clamp(.62 + (livingAge - complexThreshold) / (3 * BILLION_YEARS) * .3, .62, .92), emergenceAge, chemistrySuitability: chemistry.suitability };
}

function supportsLife(state) { return state.stage === "microbial" || state.stage === "complex"; }

function advanceLife(universe, previousTime) {
  const previousBucket = Math.floor(previousTime / 1_000_000);
  const currentBucket = Math.floor(universe.time / 1_000_000);
  if (currentBucket <= previousBucket) return;
  for (const galaxy of universe.galaxies) {
    for (const star of galaxy.systems) {
      if (starPhase(star, previousTime) === "main sequence" && starPhase(star, universe.time) !== "main sequence") {
        recordEvent(universe, { type: "stellar", time: universe.time, message: `${star.name} left the main sequence.` });
      }
      for (const planet of star.planets) {
        const previousBiosphere = biosphereState(star, planet, previousTime);
        const currentBiosphere = biosphereState(star, planet, universe.time);
        if (!supportsLife(previousBiosphere) && supportsLife(currentBiosphere)) {
          recordEvent(universe, { type: "biosphere", time: universe.time, message: `${planet.name} developed a ${currentBiosphere.stage} biosphere.` });
        } else if (supportsLife(previousBiosphere) && currentBiosphere.stage === "remnant") {
          recordEvent(universe, { type: "biosphere", time: universe.time, message: `${planet.name}'s biosphere became a stellar remnant.` });
        }
      }
    }
  }
}

export function stepUniverse(universe, years) {
  if (!Number.isFinite(years) || years <= 0) return universe;
  const previousTime = universe.time;
  universe.time += Math.min(years, 1_000_000_000);
  advanceLife(universe, previousTime);
  summarizeEpoch(universe);
  return universe;
}

export function getStats(universe) {
  const stars = universe.galaxies.flatMap((galaxy) => galaxy.systems);
  const planets = stars.flatMap((star) => star.planets);
  const livingWorlds = universe.galaxies.reduce((count, galaxy) => count + galaxy.systems.reduce((starCount, star) => starCount + star.planets.filter((planet) => supportsLife(biosphereState(star, planet, universe.time))).length, 0), 0);
  return { galaxies: universe.galaxies.length, stars: stars.length, planets: planets.length, lifeCandidates: planets.filter((planet) => planet.lifeCandidate).length, livingWorlds, events: universe.memory.events.length, epochs: universe.memory.epochs.length };
}

export function getStar(universe, galaxyId, starId) { return universe.galaxies.find((galaxy) => galaxy.id === galaxyId)?.systems.find((star) => star.id === starId) ?? null; }
export function getPlanet(universe, galaxyId, starId, planetId) { return getStar(universe, galaxyId, starId)?.planets.find((planet) => planet.id === planetId) ?? null; }
export function getSnapshot(universe) { return JSON.parse(JSON.stringify(universe)); }
export function fromSnapshot(snapshot) {
  if (!snapshot || ![1, 2].includes(snapshot.version) || !Array.isArray(snapshot.galaxies)) throw new Error("Unsupported universe save.");
  const restored = JSON.parse(JSON.stringify(snapshot));
  restored.memory ??= makeMemory();
  return enrichUniverse(restored);
}

export function formatTime(years) {
  if (years >= 1_000_000_000) return `${(years / 1_000_000_000).toFixed(3)} BY`;
  if (years >= 1_000_000) return `${(years / 1_000_000).toFixed(2)} MY`;
  if (years >= 1_000) return `${(years / 1_000).toFixed(1)} KY`;
  return `${Math.round(years)} YR`;
}

export function formatNumber(value) { return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value); }
