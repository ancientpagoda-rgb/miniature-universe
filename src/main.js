import {
  biosphereState, createUniverse, DEFAULT_SEED, formatNumber, formatTime, galaxyGasState, getPlanet,
  getSnapshot, getStar, getStats, planetChemistry, planetClimate, starPhase, stepUniverse, fromSnapshot,
} from "./simulation.js";

const canvas = document.querySelector("#universe-canvas");
const context = canvas.getContext("2d");
const ui = {
  play: document.querySelector("#play-button"), reset: document.querySelector("#reset-button"), save: document.querySelector("#save-button"), load: document.querySelector("#load-button"), speed: document.querySelector("#speed-select"), up: document.querySelector("#up-button"), time: document.querySelector("#cosmic-time"), rate: document.querySelector("#time-rate"), runState: document.querySelector("#run-state"), runDot: document.querySelector("#run-dot"), seed: document.querySelector("#seed-label"), caption: document.querySelector("#view-caption"), focusName: document.querySelector("#focus-name"), focusDescription: document.querySelector("#focus-description"), focusStats: document.querySelector("#focus-stats"), memoryBadge: document.querySelector("#memory-badge"), memoryFill: document.querySelector("#memory-meter-fill"), memoryDescription: document.querySelector("#memory-description"),
};

const model = {
  universe: createUniverse(DEFAULT_SEED), running: false, speed: Number(ui.speed.value),
  view: { level: "universe", galaxyId: null, starId: null, planetId: null },
  camera: { x: 0, y: 0, zoom: 1 }, pointer: { x: 0, y: 0, dragging: false, lastX: 0, lastY: 0 }, targets: [], previousFrame: performance.now(),
};
const colors = { violet: [186, 142, 255], blue: [122, 196, 255], gold: [255, 200, 112], rose: [255, 146, 192] };
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function resizeCanvas() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2); const bounds = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(bounds.width * ratio)); canvas.height = Math.max(1, Math.floor(bounds.height * ratio)); context.setTransform(ratio, 0, 0, ratio, 0, 0);
}
function size() { const bounds = canvas.getBoundingClientRect(); return { width: bounds.width, height: bounds.height }; }
function center() { const { width, height } = size(); return { x: width / 2, y: height / 2 }; }
function worldToScreen(x, y) { const { width, height } = size(); const scale = Math.min(width, height) * .42 * model.camera.zoom; return { x: width / 2 + (x - model.camera.x) * scale, y: height / 2 + (y - model.camera.y) * scale }; }
function addTarget(target, x, y, radius = 16) { model.targets.push({ ...target, x, y, radius }); }

function setFocus(level, ids = {}) {
  model.view = { level, galaxyId: ids.galaxyId ?? null, starId: ids.starId ?? null, planetId: ids.planetId ?? null };
  model.camera = { x: 0, y: 0, zoom: level === "universe" ? 1 : level === "galaxy" ? 1.3 : 1 };
  updateInspector(); draw();
}

function drawBackground() {
  const { width, height } = size(); context.clearRect(0, 0, width, height);
  const gradient = context.createRadialGradient(width * .5, height * .45, 0, width * .5, height * .45, Math.max(width, height) * .7);
  gradient.addColorStop(0, "#151d3b"); gradient.addColorStop(.52, "#090d1d"); gradient.addColorStop(1, "#05070e"); context.fillStyle = gradient; context.fillRect(0, 0, width, height);
  const rng = (model.universe.seed * 1664525 + 1013904223) >>> 0;
  for (let index = 0; index < 150; index += 1) { const x = ((rng + index * 7919) % 10000) / 10000 * width; const y = ((rng + index * 104729) % 10000) / 10000 * height; const alpha = .18 + (index % 6) * .045; context.fillStyle = `rgba(207, 225, 255, ${alpha})`; context.fillRect(x, y, index % 17 === 0 ? 1.7 : 1, index % 17 === 0 ? 1.7 : 1); }
}

function drawGlow(x, y, radius, color, alpha = .5) {
  const glow = context.createRadialGradient(x, y, 0, x, y, radius * 4); glow.addColorStop(0, `rgba(${color.join(",")}, ${alpha})`); glow.addColorStop(1, `rgba(${color.join(",")}, 0)`); context.fillStyle = glow; context.beginPath(); context.arc(x, y, radius * 4, 0, Math.PI * 2); context.fill();
}
function drawLabel(text, x, y, color = "rgba(239,245,255,.82)") { context.font = "11px Inter, system-ui, sans-serif"; context.textAlign = "center"; context.fillStyle = color; context.fillText(text, x, y); }

function layoutGalaxyPoints(galaxies) {
  const { width, height } = size(); const points = galaxies.map((galaxy) => ({ galaxy, ...worldToScreen(galaxy.x, galaxy.y) })); const minimumDistance = 82;
  for (let pass = 0; pass < 16; pass += 1) {
    for (let left = 0; left < points.length; left += 1) {
      for (let right = left + 1; right < points.length; right += 1) {
        let dx = points[right].x - points[left].x; let dy = points[right].y - points[left].y; let distance = Math.hypot(dx, dy);
        if (distance >= minimumDistance) continue;
        if (distance < .01) { const angle = (left + right * 1.7) * 2.399; dx = Math.cos(angle); dy = Math.sin(angle); distance = 1; }
        const shift = (minimumDistance - distance) / 2; const nx = dx / distance; const ny = dy / distance;
        points[left].x -= nx * shift; points[left].y -= ny * shift; points[right].x += nx * shift; points[right].y += ny * shift;
      }
    }
    for (const point of points) { point.x = clamp(point.x, 54, width - 54); point.y = clamp(point.y, 145, height - 78); }
  }
  return points;
}

function drawUniverse() {
  const { width, height } = size(); model.targets = [];
  layoutGalaxyPoints(model.universe.galaxies).forEach(({ galaxy, x, y }) => {
    const point = { x, y }; const color = colors[galaxy.tint]; drawGlow(point.x, point.y, 16 * model.camera.zoom, color, .3);
    context.save(); context.translate(point.x, point.y); context.rotate(galaxy.x * 2); context.strokeStyle = `rgba(${color.join(",")}, .45)`; context.lineWidth = 2; context.beginPath(); context.ellipse(0, 0, 30 * model.camera.zoom, 11 * model.camera.zoom, 0, 0, Math.PI * 2); context.stroke(); context.restore();
    context.fillStyle = `rgb(${color.join(",")})`; context.beginPath(); context.arc(point.x, point.y, 5 + model.camera.zoom * 2, 0, Math.PI * 2); context.fill(); drawLabel(galaxy.name, point.x, point.y + 34, "rgba(222,230,249,.72)"); addTarget({ type: "galaxy", galaxyId: galaxy.id }, point.x, point.y, 22);
  });
  drawLabel(`${model.universe.galaxies.length} galaxies · ${getStats(model.universe).stars} stars`, width / 2, height - 42, "rgba(161,178,211,.7)");
}

function drawGalaxy(galaxy) {
  const { width, height } = size(); const color = colors[galaxy.tint]; const centerPoint = center(); drawGlow(centerPoint.x, centerPoint.y, 42, color, .22);
  context.save(); context.translate(centerPoint.x, centerPoint.y); context.fillStyle = `rgba(${color.join(",")}, .08)`; context.beginPath(); context.arc(0, 0, Math.min(width, height) * .34, 0, Math.PI * 2); context.fill(); context.strokeStyle = `rgba(${color.join(",")}, .16)`; context.lineWidth = 1; context.beginPath(); context.arc(0, 0, Math.min(width, height) * .34, 0, Math.PI * 2); context.stroke(); context.restore();
  const gas = galaxyGasState(galaxy, model.universe.time);
  galaxy.gas.clouds.forEach((cloud) => {
    const point = worldToScreen(cloud.x * .32, cloud.y * .32); const radius = cloud.radius * Math.min(width, height) * gas.fraction;
    const haze = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius); haze.addColorStop(0, `rgba(${color.join(",")}, ${.08 * cloud.density})`); haze.addColorStop(1, `rgba(${color.join(",")}, 0)`); context.fillStyle = haze; context.beginPath(); context.arc(point.x, point.y, radius, 0, Math.PI * 2); context.fill();
  });
  galaxy.systems.forEach((star, index) => {
    const angle = index / galaxy.systems.length * Math.PI * 2 + galaxy.x; const radius = .11 + (index % 3) * .07; const point = worldToScreen(Math.cos(angle) * radius, Math.sin(angle) * radius * .68); const starColor = star.spectral === "M" || star.spectral === "K" ? [255, 148, 92] : star.spectral === "G" ? [255, 230, 170] : [187, 221, 255];
    drawGlow(point.x, point.y, 4, starColor, .5); context.fillStyle = `rgb(${starColor.join(",")})`; context.beginPath(); context.arc(point.x, point.y, 3.5, 0, Math.PI * 2); context.fill(); addTarget({ type: "star", galaxyId: galaxy.id, starId: star.id }, point.x, point.y, 18);
  });
  drawLabel(`${galaxy.systems.length} star systems · ${Math.round(gas.fraction * 100)}% gas reserve`, width / 2, height - 42, "rgba(161,178,211,.7)");
}

function drawSystem(galaxy, star) {
  const { width, height } = size(); const point = center();
  star.planets.forEach((planet) => {
    const orbitRadius = 28 + planet.orbitAU * Math.min(width, height) * .1; context.strokeStyle = "rgba(191, 213, 248, .16)"; context.lineWidth = 1; context.beginPath(); context.arc(point.x, point.y, orbitRadius, 0, Math.PI * 2); context.stroke();
    const theta = planet.phase + model.universe.time / planet.orbitalPeriod * .00001; const planetPoint = { x: point.x + Math.cos(theta) * orbitRadius, y: point.y + Math.sin(theta) * orbitRadius * .6 }; const planetColor = planet.lifeCandidate ? [174, 248, 206] : [160, 206, 255];
    drawGlow(planetPoint.x, planetPoint.y, planet.lifeCandidate ? 4 : 2, planetColor, .35); context.fillStyle = `rgb(${planetColor.join(",")})`; context.beginPath(); context.arc(planetPoint.x, planetPoint.y, planet.lifeCandidate ? 4 : 2.5, 0, Math.PI * 2); context.fill(); addTarget({ type: "planet", galaxyId: galaxy.id, starId: star.id, planetId: planet.id }, planetPoint.x, planetPoint.y, 13);
  });
  const starColor = star.spectral === "M" || star.spectral === "K" ? [255, 142, 91] : star.spectral === "G" ? [255, 226, 158] : [184, 220, 255]; drawGlow(point.x, point.y, 16, starColor, .75); context.fillStyle = `rgb(${starColor.join(",")})`; context.beginPath(); context.arc(point.x, point.y, 12, 0, Math.PI * 2); context.fill(); drawLabel(star.name, point.x, point.y + 34); drawLabel(`${star.planets.length} planets · ${star.spectral}-class`, width / 2, height - 42, "rgba(161,178,211,.7)");
}

function drawPlanet(star, planet) {
  const { width, height } = size(); const point = center(); const climate = planetClimate(star, planet, model.universe.time); const biosphere = biosphereState(star, planet, model.universe.time); const radius = Math.min(width, height) * .18; const living = biosphere.stage === "microbial" || biosphere.stage === "complex";
  drawGlow(point.x, point.y, radius * 1.2, living ? [94, 219, 174] : [92, 165, 255], .18); const planetGradient = context.createRadialGradient(point.x - radius * .4, point.y - radius * .5, radius * .1, point.x, point.y, radius); planetGradient.addColorStop(0, living ? "#a6ebcb" : "#b0d8ff"); planetGradient.addColorStop(1, living ? "#1d6666" : "#1a376c"); context.fillStyle = planetGradient; context.beginPath(); context.arc(point.x, point.y, radius, 0, Math.PI * 2); context.fill(); context.strokeStyle = "rgba(207, 237, 255, .65)"; context.lineWidth = 2; context.stroke(); context.strokeStyle = "rgba(150, 201, 255, .24)"; context.lineWidth = 1; context.beginPath(); context.ellipse(point.x, point.y, radius * 1.35, radius * .28, -.28, 0, Math.PI * 2); context.stroke(); drawLabel(planet.name, point.x, point.y + radius + 34); drawLabel(`${Math.round(climate.temperatureK)} K · ${biosphere.stage} · ${Math.round(climate.habitability * 100)}% habitability`, width / 2, height - 42, "rgba(161,178,211,.7)");
}

function draw() {
  drawBackground();
  if (model.view.level === "universe") drawUniverse();
  if (model.view.level === "galaxy") drawGalaxy(model.universe.galaxies.find((galaxy) => galaxy.id === model.view.galaxyId));
  if (model.view.level === "system") { const galaxy = model.universe.galaxies.find((item) => item.id === model.view.galaxyId); drawSystem(galaxy, getStar(model.universe, model.view.galaxyId, model.view.starId)); }
  if (model.view.level === "planet") { const star = getStar(model.universe, model.view.galaxyId, model.view.starId); drawPlanet(star, getPlanet(model.universe, model.view.galaxyId, model.view.starId, model.view.planetId)); }
}

function statsMarkup(entries) { return entries.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join(""); }

function updateInspector() {
  const { level, galaxyId, starId, planetId } = model.view; const stats = getStats(model.universe); ui.up.disabled = level === "universe"; ui.seed.textContent = `SEED ${model.universe.seed}`;
  if (level === "universe") { ui.caption.textContent = "The observable model, compressed to a handful of living systems."; ui.focusName.textContent = "The miniature universe"; ui.focusDescription.textContent = "A deterministic sandbox. Its bodies have analytical orbits; its history is summarized instead of accumulated frame by frame."; ui.focusStats.innerHTML = statsMarkup([["galaxies", stats.galaxies], ["star systems", stats.stars], ["planets", stats.planets], ["living worlds", stats.livingWorlds]]); }
  else if (level === "galaxy") { const galaxy = model.universe.galaxies.find((item) => item.id === galaxyId); const gas = galaxyGasState(galaxy, model.universe.time); ui.caption.textContent = `${galaxy.name} · star-system view`; ui.focusName.textContent = galaxy.name; ui.focusDescription.textContent = "A compact spiral where gas depletion and stellar recycling shape the future star-forming reserve."; ui.focusStats.innerHTML = statsMarkup([["systems", galaxy.systems.length], ["gas reserve", `${Math.round(gas.fraction * 100)}%`], ["metallicity", gas.metallicity.toFixed(4)], ["recycled gas", gas.recycled.toFixed(2)]]); }
  else if (level === "system") { const star = getStar(model.universe, galaxyId, starId); ui.caption.textContent = `${star.name} · planetary system`; ui.focusName.textContent = star.name; ui.focusDescription.textContent = `A ${star.spectral}-class star with orbiting bodies. Orbits are solved analytically, so time can accelerate without numerical drift.`; ui.focusStats.innerHTML = statsMarkup([["spectral class", star.spectral], ["phase", starPhase(star, model.universe.time)], ["mass", `${star.mass} solar`], ["planets", star.planets.length]]); }
  else { const star = getStar(model.universe, galaxyId, starId); const planet = getPlanet(model.universe, galaxyId, starId, planetId); const climate = planetClimate(star, planet, model.universe.time); const chemistry = planetChemistry(star, planet); const biosphere = biosphereState(star, planet, model.universe.time); ui.caption.textContent = `${planet.name} · planetary inspection`; ui.focusName.textContent = planet.name; ui.focusDescription.textContent = biosphere.stage === "complex" ? "A mature modeled biosphere, derived from climate stability, chemistry, and elapsed stellar age." : biosphere.stage === "microbial" ? "A modeled microbial biosphere has emerged; complexity remains constrained by time and climate." : planet.lifeCandidate ? "A chemically and climatically plausible candidate still progressing through a prebiotic interval." : "A planetary body outside the current life-origin envelope."; ui.focusStats.innerHTML = statsMarkup([["biosphere", biosphere.stage], ["temperature", `${Math.round(climate.temperatureK)} K`], ["chemistry", `${Math.round(chemistry.suitability * 100)}%`], ["habitability", `${Math.round(climate.habitability * 100)}%`]]); }
}

function updateStatus() {
  ui.time.textContent = formatTime(model.universe.time); ui.rate.textContent = model.running ? `+${formatNumber(model.speed)} years / sec` : "+0 years / sec"; ui.runState.textContent = model.running ? "RUNNING" : "PAUSED"; ui.runDot.classList.toggle("live", model.running); ui.play.textContent = model.running ? "Pause" : "Play";
  const memory = model.universe.memory; ui.memoryBadge.textContent = `${memory.events.length} / 200 events`; ui.memoryFill.style.width = `${memory.events.length / 2}%`; ui.memoryDescription.textContent = `${memory.epochs.length} epoch summaries retained · ${memory.totalCompactions} event compactions · no per-frame history stored.`;
}

function focusTarget(target) { if (target.type === "galaxy") setFocus("galaxy", target); if (target.type === "star") setFocus("system", target); if (target.type === "planet") setFocus("planet", target); }
function pointerPosition(event) { const bounds = canvas.getBoundingClientRect(); return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }; }

canvas.addEventListener("pointerdown", (event) => { const point = pointerPosition(event); model.pointer = { ...model.pointer, ...point, dragging: true, lastX: point.x, lastY: point.y }; canvas.setPointerCapture(event.pointerId); });
canvas.addEventListener("pointermove", (event) => { if (!model.pointer.dragging) return; const point = pointerPosition(event); const dx = point.x - model.pointer.lastX; const dy = point.y - model.pointer.lastY; const scale = Math.min(size().width, size().height) * .42 * model.camera.zoom; model.camera.x -= dx / scale; model.camera.y -= dy / scale; model.pointer.lastX = point.x; model.pointer.lastY = point.y; draw(); });
canvas.addEventListener("pointerup", (event) => { const point = pointerPosition(event); const distance = Math.hypot(point.x - model.pointer.x, point.y - model.pointer.y); model.pointer.dragging = false; canvas.releasePointerCapture(event.pointerId); if (distance < 5) { const hit = model.targets.find((target) => Math.hypot(point.x - target.x, point.y - target.y) <= target.radius); if (hit) focusTarget(hit); } });
canvas.addEventListener("wheel", (event) => { event.preventDefault(); model.camera.zoom = Math.max(.55, Math.min(3.5, model.camera.zoom * (event.deltaY > 0 ? .9 : 1.1))); draw(); }, { passive: false });

ui.play.addEventListener("click", () => { model.running = !model.running; updateStatus(); });
ui.reset.addEventListener("click", () => { model.universe = createUniverse(DEFAULT_SEED); model.running = false; setFocus("universe"); updateStatus(); });
ui.speed.addEventListener("change", () => { model.speed = Number(ui.speed.value); updateStatus(); });
ui.save.addEventListener("click", () => { localStorage.setItem("miniature-universe-save", JSON.stringify(getSnapshot(model.universe))); ui.save.textContent = "Saved"; setTimeout(() => { ui.save.textContent = "Save"; }, 900); });
ui.load.addEventListener("click", () => { const saved = localStorage.getItem("miniature-universe-save"); if (!saved) return; try { model.universe = fromSnapshot(JSON.parse(saved)); model.running = false; setFocus("universe"); updateStatus(); ui.load.textContent = "Loaded"; setTimeout(() => { ui.load.textContent = "Load"; }, 900); } catch { ui.load.textContent = "Invalid"; setTimeout(() => { ui.load.textContent = "Load"; }, 900); } });
ui.up.addEventListener("click", () => { if (model.view.level === "planet") setFocus("system", model.view); else if (model.view.level === "system") setFocus("galaxy", model.view); else setFocus("universe"); });
window.addEventListener("keydown", (event) => { if (event.code === "Space") { event.preventDefault(); model.running = !model.running; updateStatus(); } if (event.code === "Escape") ui.up.click(); });
window.addEventListener("resize", () => { resizeCanvas(); draw(); });

function frame(now) { const elapsed = Math.min(.25, (now - model.previousFrame) / 1000); model.previousFrame = now; if (model.running) { stepUniverse(model.universe, elapsed * model.speed); updateStatus(); updateInspector(); } draw(); requestAnimationFrame(frame); }

resizeCanvas(); updateInspector(); updateStatus(); requestAnimationFrame(frame);
