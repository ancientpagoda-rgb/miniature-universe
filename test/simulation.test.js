import test from "node:test";
import assert from "node:assert/strict";
import { createUniverse, getSnapshot, getStats, LIMITS, fromSnapshot, planetClimate, stepUniverse, starPhase } from "../src/simulation.js";

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
