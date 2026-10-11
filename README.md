# Miniature Universe

A separate, deterministic browser simulation of a small universe. It is deliberately compact: bodies are generated from a seed, orbital positions are analytical, and old simulation history is summarized into bounded epoch records instead of storing every frame.

## Run

```bash
python3 -m http.server 4173
```

Open <http://localhost:4173> from this directory.

## Test

```bash
npm test
npm run check
```

## Current model

- five seeded galaxies containing star systems and planets;
- star spectral classes, lifetimes, luminosity, and stellar phases;
- analytical planetary orbits and simple equilibrium climate/habitability;
- accelerated cosmic time up to 100 million years per real second;
- bounded event memory (200 events) plus 64 epoch summaries;
- save/load through browser local storage;
- universe → galaxy → star system → planet inspection.

This is a functioning simulation sandbox, not a claim of a complete physical cosmology. The next sensible layers are gas-cloud formation, stellar feedback, chemistry, abiogenesis, and a more rigorous N-body mode for selected systems.
