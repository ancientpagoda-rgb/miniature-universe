import test from "node:test";
import assert from "node:assert/strict";
import { biosphereState, createUniverse, galaxyGasState, getSnapshot, getStats, LIMITS, fromSnapshot, planetChemistry, planetClimate, stepUniverse, starPhase } from "../src/simulation.js";

test("same seed produces the same miniature universe", () => {
  assert.deepEqual(createUniverse(777), createUniverse(777));
  assert.notDeepEqual(createUniverse(777), createUniverse(778));
});

test("simulation advances without storing every frame", () => {
  const universe = createUniverse(777); const initialTime = universe.time;
  for (let i = 0; i < 10_000; i += 1) stepUniverse(universe, 1_000);
  assert.equal(universe.time, initialTime + 10_000_000);
  assert.ok(universe.memory.events.length <= LIMITS.maxEvents);
  assert.ok(universe.memory.epochs.length <= LIMITS.maxEpochs);
  assert.equal(getStats(universe).planets > getStats(universe).stars, true);
});

test("snapshot round-trip preserves deterministic state", () => {
  const universe = createUniverse(42); stepUniverse(universe, 25_000_000); assert.deepEqual(fromSnapshot(getSnapshot(universe)), universe);
});

test("planet climate stays bounded and stellar phases are finite", () => {
  const universe = createUniverse(777); const star = universe.galaxies[0].systems[0]; const planet = star.planets[0]; const climate = planetClimate(star, planet, universe.time);
  assert.ok(Number.isFinite(climate.temperatureK)); assert.ok(climate.habitability >= 0 && climate.habitability <= 1); assert.match(starPhase(star, universe.time), /main sequence|red giant|white dwarf|black hole \/ neutron star/);
});

test("galactic gas depletion and stellar recycling stay deterministic and bounded", () => {
  const universe = createUniverse(777); const galaxy = universe.galaxies[0];
  const initial = galaxyGasState(galaxy, universe.time); const future = galaxyGasState(galaxy, universe.time + 8_000_000_000);
  assert.deepEqual(galaxyGasState(galaxy, universe.time), initial);
  assert.ok(initial.fraction > 0 && initial.fraction <= 1);
  assert.ok(future.fraction >= 0 && future.fraction <= 1.25);
  assert.ok(future.mass < initial.mass || future.recycled > 0);
  assert.ok(future.metallicity >= initial.metallicity);
});

test("planet chemistry and biosphere stages are analytical rather than frame histories", () => {
  const universe = createUniverse(777); const stars = universe.galaxies.flatMap((galaxy) => galaxy.systems); const star = stars.find((candidate) => candidate.planets.some((planet) => planet.lifeCandidate)); const planet = star.planets.find((candidate) => candidate.lifeCandidate);
  const chemistry = planetChemistry(star, planet); const present = biosphereState(star, planet, universe.time); const future = biosphereState(star, planet, universe.time + 1_000_000_000);
  assert.ok(chemistry.suitability >= 0 && chemistry.suitability <= 1);
  assert.ok(["sterile", "prebiotic", "microbial", "complex", "remnant"].includes(present.stage));
  assert.deepEqual(biosphereState(star, planet, universe.time + 1_000_000_000), future);
  assert.ok(future.coverage >= 0 && future.coverage <= 1);
});

test("version-one saves migrate deterministic chemistry without losing history", () => {
  const original = createUniverse(42); stepUniverse(original, 25_000_000); const legacy = getSnapshot(original); legacy.version = 1;
  for (const galaxy of legacy.galaxies) { delete galaxy.gas; for (const star of galaxy.systems) { delete star.metallicity; for (const planet of star.planets) { delete planet.chemistry; delete planet.biosphereLag; } } }
  const restored = fromSnapshot(legacy);
  assert.equal(restored.version, 2); assert.equal(restored.time, original.time); assert.deepEqual(restored.memory, original.memory);
  assert.deepEqual(restored.galaxies[0].gas, createUniverse(42).galaxies[0].gas);
});
