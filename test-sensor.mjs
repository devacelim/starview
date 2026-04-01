/**
 * Comprehensive sensor + projection pipeline test
 * Tests the FULL chain: sensor alpha → smoothAz → project → screen position
 * NEW: alpha used directly for azimuth (no rotation matrix — eliminates gamma noise)
 * Run: node test-sensor.mjs
 */

const D = Math.PI / 180;

// === project() — exact copy from skymap.ts ===
function project(altDeg, azDeg, deviceAz, deviceAlt, W, H, fovH) {
  const dAz  = ((azDeg - deviceAz + 540) % 360) - 180;
  const dAlt = altDeg - deviceAlt;
  const scale = Math.max(W, H) / fovH;
  const avgAlt = (altDeg + deviceAlt) * 0.5;
  const cosAlt = Math.cos(Math.min(Math.abs(avgAlt), 85) * D);
  const x = W / 2 + dAz * cosAlt * scale;
  const y = H / 2 - dAlt * scale;
  return { x, y };
}

// === Filter state ===
let smoothHoriz = [0, 1];
let deviceAz = 0, deviceAlt = 0;
let hasFirst = false;
let stage1 = [0, 1];

const AZ_ALPHA1 = 0.25, AZ_ALPHA2 = 0.15, AZ_GLITCH = 1.2, AZ_DRIFT = 0.01;
const ALT_ALPHA = 0.15, ALT_GLITCH = 35, ALT_DRIFT = 0.01;

function smoothAz(rawAz) {
  const rawE = Math.sin(rawAz * D), rawN = Math.cos(rawAz * D);
  if (!hasFirst) { smoothHoriz = [rawE, rawN]; stage1 = [rawE, rawN]; return rawAz; }
  const dx1 = rawE - stage1[0], dy1 = rawN - stage1[1];
  const dist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
  const a1 = dist1 > AZ_GLITCH ? AZ_DRIFT : AZ_ALPHA1;
  let s1e = stage1[0] + dx1 * a1, s1n = stage1[1] + dy1 * a1;
  let len1 = Math.sqrt(s1e * s1e + s1n * s1n) || 1;
  stage1 = [s1e / len1, s1n / len1];
  const dx2 = stage1[0] - smoothHoriz[0], dy2 = stage1[1] - smoothHoriz[1];
  let s2e = smoothHoriz[0] + dx2 * AZ_ALPHA2, s2n = smoothHoriz[1] + dy2 * AZ_ALPHA2;
  let len2 = Math.sqrt(s2e * s2e + s2n * s2n) || 1;
  smoothHoriz = [s2e / len2, s2n / len2];
  return ((Math.atan2(smoothHoriz[0], smoothHoriz[1]) / D) + 360) % 360;
}

function smoothAlt(rawAlt) {
  if (!hasFirst) return rawAlt;
  const dAlt = rawAlt - deviceAlt;
  if (Math.abs(dAlt) > ALT_GLITCH) return deviceAlt + dAlt * ALT_DRIFT;
  return deviceAlt + dAlt * ALT_ALPHA;
}

function reset() {
  smoothHoriz = [0, 1]; deviceAz = 0; deviceAlt = 0; hasFirst = false; stage1 = [0, 1];
}

/** NEW: matches production code — alpha goes directly to smoothAz, altitude from beta/gamma */
function feedSensor(alpha, beta, gamma) {
  const rawAlt = Math.asin(Math.max(-1, Math.min(1, -Math.cos(beta * D) * Math.cos(gamma * D)))) / D;
  const alt = smoothAlt(rawAlt);
  deviceAlt = alt;
  // Alpha directly = azimuth. No rotation matrix — no gamma noise in azimuth.
  const az = smoothAz(alpha);
  deviceAz = az;
  hasFirst = true;
  return { az, alt };
}

// === Helpers ===
function azDiff(a, b) { return ((a - b + 540) % 360) - 180; }
function circularRange(values) {
  if (values.length < 2) return 0;
  const sorted = values.map(v => ((v % 360) + 360) % 360).sort((a, b) => a - b);
  let maxGap = 0;
  for (let i = 1; i < sorted.length; i++) maxGap = Math.max(maxGap, sorted[i] - sorted[i-1]);
  maxGap = Math.max(maxGap, 360 - sorted[sorted.length - 1] + sorted[0]);
  return 360 - maxGap;
}
function betaForAlt(targetAlt) {
  // alt = asin(-cos(beta)*cos(0)) = asin(-cos(beta))
  // cos(beta) = -sin(alt) → beta = acos(-sin(alt))
  return Math.acos(-Math.sin(targetAlt * D)) / D;
}
function gaussNoise(std) {
  const u1 = Math.random(), u2 = Math.random();
  return std * Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
}

let passed = 0, failed = 0;
function assert(name, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} — ${detail}`); }
}

const W = 390, H = 844, FOV = 60;

// ========================================================
// TEST A: Alpha-direct — no gamma noise in azimuth at any elevation
// ========================================================
console.log('\n=== TEST A: Alpha-direct — gamma noise has ZERO effect on azimuth ===');
for (const targetAlt of [0, 30, 45, 60, 75, 85]) {
  reset();
  const beta = betaForAlt(targetAlt);
  feedSensor(0, beta, 0);

  // 200 frames with heavy gamma noise — should have ZERO effect on az
  const azValues = [];
  for (let i = 0; i < 200; i++) {
    const s = feedSensor(0 + gaussNoise(1), beta + gaussNoise(1), gaussNoise(6));  // ±6° gamma!
    azValues.push(s.az);
  }
  const jitter = circularRange(azValues);
  // Jitter should come ONLY from alpha noise (±1°), not gamma
  assert(
    `alt=${targetAlt}°: az jitter ${jitter.toFixed(1)}° < 8° (gamma ±6° has no effect)`,
    jitter < 8,
    `jitter=${jitter.toFixed(1)}°`
  );
}

// ========================================================
// TEST B: Full pipeline screen direction — ALL azimuths × ALL elevations × L/R
// ========================================================
console.log('\n=== TEST B: Full pipeline screen direction — ALL combos ===');
const ALL_ALTS = [45, 50, 55, 60, 65, 70, 75];
const ALL_START_AZ = [0, 45, 90, 135, 180, 225, 270, 315];

for (const startAlpha of ALL_START_AZ) {
  for (const targetAlt of ALL_ALTS) {
    for (const dir of ['LEFT', 'RIGHT']) {
      reset();
      const beta = betaForAlt(targetAlt);
      feedSensor(startAlpha, beta, 0);
      for (let i = 0; i < 60; i++) {
        feedSensor(startAlpha + gaussNoise(1), beta + gaussNoise(0.5), gaussNoise(3));
      }

      const refStarAz = deviceAz, refStarAlt = deviceAlt;
      const screenBefore = project(refStarAlt, refStarAz, deviceAz, deviceAlt, W, H, FOV);

      // Turn: LEFT = alpha decreases (CCW from above), RIGHT = alpha increases (CW from above)
      const sign = dir === 'LEFT' ? -1 : 1;
      for (let i = 1; i <= 45; i++) {
        feedSensor(startAlpha + sign * (i / 45) * 15 + gaussNoise(1.5), beta + gaussNoise(1), gaussNoise(3));
      }
      for (let i = 0; i < 30; i++) {
        feedSensor(startAlpha + sign * 15 + gaussNoise(1), beta + gaussNoise(0.5), gaussNoise(3));
      }

      const screenAfter = project(refStarAlt, refStarAz, deviceAz, deviceAlt, W, H, FOV);
      const dx = screenAfter.x - screenBefore.x;

      // LEFT turn (alpha-) → deviceAz decreases → dAz = (starAz - deviceAz) increases → x increases → dx > 0
      // RIGHT turn (alpha+) → deviceAz increases → dAz decreases → x decreases → dx < 0
      const correct = dir === 'LEFT' ? dx > 2 : dx < -2;
      assert(
        `az=${startAlpha}° alt=${targetAlt}° ${dir}: dx=${dx.toFixed(0)}px`,
        correct,
        `dx=${dx.toFixed(1)} (expected ${dir === 'LEFT' ? '>' : '<'} 0)`
      );
    }
  }
}

// ========================================================
// TEST C: Stationary oscillation at ALL elevations × ALL azimuths
// ========================================================
console.log('\n=== TEST C: Stationary oscillation ===');
for (const startAlpha of [0, 90, 180, 270]) {
  for (const targetAlt of [45, 55, 60, 65, 70, 75, 80]) {
    reset();
    const beta = betaForAlt(targetAlt);
    feedSensor(startAlpha, beta, 0);
    for (let i = 0; i < 60; i++) feedSensor(startAlpha + gaussNoise(1.5), beta + gaussNoise(1), gaussNoise(3));

    let dirChanges = 0, prevDelta = 0;
    const azHistory = [];
    for (let i = 0; i < 120; i++) {
      const prevAz = deviceAz;
      feedSensor(startAlpha + gaussNoise(1.5), beta + gaussNoise(1), gaussNoise(3));
      const delta = azDiff(deviceAz, prevAz);
      if (prevDelta !== 0 && Math.sign(delta) !== Math.sign(prevDelta) && Math.abs(delta) > 0.1) dirChanges++;
      if (Math.abs(delta) > 0.1) prevDelta = delta;
      azHistory.push(deviceAz);
    }
    const jitter = circularRange(azHistory);
    const rate = dirChanges / 120;
    assert(
      `az=${startAlpha}° alt=${targetAlt}°: osc ${rate.toFixed(2)}<0.35, jitter ${jitter.toFixed(1)}°<15°`,
      rate < 0.35 && jitter < 15,
      `rate=${rate.toFixed(2)}, jitter=${jitter.toFixed(1)}°`
    );
  }
}

// ========================================================
// TEST D: Small 5° nudges — ALL directions × ALL elevations
// ========================================================
console.log('\n=== TEST D: 5° nudges ===');
for (const startAlpha of [0, 90, 180, 270]) {
  for (const targetAlt of [45, 55, 60, 65, 70]) {
    for (const dir of ['LEFT', 'RIGHT']) {
      reset();
      const beta = betaForAlt(targetAlt);
      feedSensor(startAlpha, beta, 0);
      for (let i = 0; i < 60; i++) feedSensor(startAlpha + gaussNoise(1), beta + gaussNoise(0.5), gaussNoise(2));
      const startAz = deviceAz;

      const sign = dir === 'LEFT' ? -1 : 1;
      for (let i = 1; i <= 15; i++) {
        feedSensor(startAlpha + sign * (i / 15) * 5 + gaussNoise(1), beta + gaussNoise(0.5), gaussNoise(2));
      }
      for (let i = 0; i < 45; i++) {
        feedSensor(startAlpha + sign * 5 + gaussNoise(1), beta + gaussNoise(0.5), gaussNoise(2));
      }
      const moved = azDiff(deviceAz, startAz);
      const correct = dir === 'LEFT' ? moved < -1 : moved > 1;
      assert(
        `az=${startAlpha}° alt=${targetAlt}° ${dir} 5°: ${moved.toFixed(1)}°`,
        correct,
        `moved ${moved.toFixed(1)}°`
      );
    }
  }
}

// ========================================================
// TEST E: Continuous 3s left pan — reversal check
// ========================================================
console.log('\n=== TEST E: 3s pan — reversal check ===');
for (const targetAlt of [45, 50, 55, 60, 65, 70, 75]) {
  reset();
  const beta = betaForAlt(targetAlt);
  feedSensor(180, beta, 0);
  for (let i = 0; i < 30; i++) feedSensor(180 + gaussNoise(1), beta + gaussNoise(0.5), gaussNoise(2));
  const startAz = deviceAz;

  let maxReversal = 0, runningMin = startAz;  // LEFT = alpha decreases = az decreases
  for (let i = 1; i <= 180; i++) {
    const alpha = 180 - (i / 180) * 30;  // LEFT turn
    feedSensor(alpha + gaussNoise(1.5), beta + gaussNoise(1), gaussNoise(3));
    const movedFromStart = azDiff(deviceAz, startAz);
    if (movedFromStart < azDiff(runningMin, startAz)) runningMin = deviceAz;
    const rev = azDiff(deviceAz, runningMin);  // how much we bounced back from min
    if (rev > maxReversal) maxReversal = rev;
  }
  const totalMoved = azDiff(deviceAz, startAz);  // should be negative (LEFT)
  assert(
    `alt=${targetAlt}°: pan LEFT 30° → net ${totalMoved.toFixed(1)}° (< -10°), maxRev ${maxReversal.toFixed(1)}° < 5°`,
    totalMoved < -10 && maxReversal < 5,
    `total=${totalMoved.toFixed(1)}°, maxRev=${maxReversal.toFixed(1)}°`
  );
}

// ========================================================
// TEST F: Alternating L-R — the "왔다갔다" test
// ========================================================
console.log('\n=== TEST F: Alternating L-R (6 turns) ===');
for (const targetAlt of [45, 50, 55, 60, 65, 70]) {
  reset();
  const beta = betaForAlt(targetAlt);
  feedSensor(180, beta, 0);
  for (let i = 0; i < 60; i++) feedSensor(180 + gaussNoise(1), beta + gaussNoise(0.5), gaussNoise(2));

  let correctTurns = 0, currentAlpha = 180;
  for (let turn = 0; turn < 6; turn++) {
    const dir = turn % 2 === 0 ? -1 : 1;  // LEFT first, then RIGHT, ...
    const beforeAz = deviceAz;
    for (let i = 1; i <= 20; i++) {
      currentAlpha += dir * 0.5;
      feedSensor(currentAlpha + gaussNoise(1), beta + gaussNoise(0.5), gaussNoise(2));
    }
    for (let i = 0; i < 20; i++) feedSensor(currentAlpha + gaussNoise(1), beta + gaussNoise(0.5), gaussNoise(2));
    const turnMoved = azDiff(deviceAz, beforeAz);
    if (dir < 0 ? turnMoved < -2 : turnMoved > 2) correctTurns++;
  }
  assert(`alt=${targetAlt}°: ${correctTurns}/6 turns correct`, correctTurns >= 5, `${correctTurns}/6`);
}

// ========================================================
// TEST G: Frame-by-frame direction correctness
// ========================================================
console.log('\n=== TEST G: Frame-by-frame direction ===');
for (const targetAlt of ALL_ALTS) {
  for (const dir of ['LEFT', 'RIGHT']) {
    reset();
    const beta = betaForAlt(targetAlt);
    feedSensor(180, beta, 0);
    for (let i = 0; i < 60; i++) feedSensor(180 + gaussNoise(1), beta + gaussNoise(0.5), gaussNoise(2));

    const sign = dir === 'LEFT' ? -1 : 1;
    let wrongFrames = 0, movedFrames = 0, prevAz = deviceAz;
    for (let i = 1; i <= 60; i++) {
      feedSensor(180 + sign * (i / 60) * 20 + gaussNoise(1.5), beta + gaussNoise(1), gaussNoise(3));
      const delta = azDiff(deviceAz, prevAz);
      if (Math.abs(delta) > 0.05) {
        movedFrames++;
        if (dir === 'LEFT' && delta > 0.5) wrongFrames++;
        if (dir === 'RIGHT' && delta < -0.5) wrongFrames++;
      }
      prevAz = deviceAz;
    }
    const wrongPct = movedFrames > 0 ? (wrongFrames / movedFrames * 100) : 0;
    assert(
      `alt=${targetAlt}° ${dir}: ${wrongPct.toFixed(0)}% wrong < 20%`,
      wrongPct < 20,
      `${wrongFrames}/${movedFrames} = ${wrongPct.toFixed(0)}%`
    );
  }
}

// ========================================================
// TEST H: Filter response lag
// ========================================================
console.log('\n=== TEST H: Filter response lag ===');
for (const targetAlt of [45, 55, 65, 75]) {
  reset();
  const beta = betaForAlt(targetAlt);
  feedSensor(0, beta, 0);
  for (let i = 0; i < 60; i++) feedSensor(gaussNoise(0.5), beta + gaussNoise(0.3), gaussNoise(1));
  const startAz = deviceAz;

  let firstFrame = -1;
  for (let i = 1; i <= 30; i++) {
    feedSensor(i, beta, 0);  // 1°/frame right turn
    if (firstFrame < 0 && azDiff(deviceAz, startAz) > 0.5) firstFrame = i;
  }
  assert(`alt=${targetAlt}°: responds by frame ${firstFrame} (≤5)`, firstFrame >= 1 && firstFrame <= 5, `frame=${firstFrame}`);
}

// ========================================================
// TEST I: Fast 90° and 180° rotation
// ========================================================
console.log('\n=== TEST I: Fast rotation tracking ===');
for (const targetAlt of [0, 30, 45, 60, 70]) {
  reset();
  const beta = betaForAlt(targetAlt);
  feedSensor(0, beta, 0);
  for (let i = 1; i <= 15; i++) feedSensor((i / 15) * 90 + gaussNoise(1), beta + gaussNoise(0.5), gaussNoise(1.5));
  for (let i = 0; i < 180; i++) feedSensor(90 + gaussNoise(1), beta + gaussNoise(0.5), gaussNoise(1.5));
  const err = Math.abs(azDiff(deviceAz, 90));
  assert(`alt=${targetAlt}°: 90° fast → err ${err.toFixed(1)}° < 8°`, err < 8, `err=${err.toFixed(1)}°`);
}

for (const targetAlt of [45, 60, 70]) {
  reset();
  const beta = betaForAlt(targetAlt);
  feedSensor(0, beta, 0);
  for (let i = 1; i <= 10; i++) feedSensor((i / 10) * 180, beta, 0);
  for (let i = 0; i < 300; i++) feedSensor(180 + gaussNoise(1), beta + gaussNoise(0.5), gaussNoise(1.5));
  const err = Math.abs(azDiff(deviceAz, 180));
  assert(`alt=${targetAlt}°: 180° rapid → err ${err.toFixed(1)}° < 8°`, err < 8, `err=${err.toFixed(1)}°`);
}

// ========================================================
// TEST J: Altitude tracking
// ========================================================
console.log('\n=== TEST J: Altitude tracking ===');
for (const target of [45, 60, 80]) {
  reset();
  feedSensor(0, 90, 0);
  let maxAlt = 0;
  const betaTarget = betaForAlt(target);
  for (let i = 1; i <= 30; i++) {
    feedSensor(0, 90 + (betaTarget - 90) * (i / 30), 0);
    if (deviceAlt > maxAlt) maxAlt = deviceAlt;
  }
  for (let i = 0; i < 90; i++) {
    feedSensor(gaussNoise(1), betaTarget + gaussNoise(1), gaussNoise(1));
    if (deviceAlt > maxAlt) maxAlt = deviceAlt;
  }
  assert(`ramp→${target}°: max ${maxAlt.toFixed(1)}° < ${target+5}°`, maxAlt < target + 5, `max=${maxAlt.toFixed(1)}°`);
  assert(`settles near ${target}°`, Math.abs(deviceAlt - target) < 4, `alt=${deviceAlt.toFixed(1)}°`);
}

// ========================================================
// TEST K: Extreme noise γ±6° — alpha direct means zero gamma effect on az
// ========================================================
console.log('\n=== TEST K: Extreme γ±6° — movement ===');
for (const targetAlt of [45, 55, 65, 70, 80]) {
  reset();
  const beta = betaForAlt(targetAlt);
  feedSensor(90, beta, 0);
  for (let i = 0; i < 60; i++) feedSensor(90 + gaussNoise(3), beta + gaussNoise(2), gaussNoise(6));
  const startAz = deviceAz;
  for (let i = 1; i <= 60; i++) feedSensor(90 + (i / 60) * 20 + gaussNoise(3), beta + gaussNoise(2), gaussNoise(6));
  for (let i = 0; i < 60; i++) feedSensor(110 + gaussNoise(3), beta + gaussNoise(2), gaussNoise(6));
  const moved = azDiff(deviceAz, startAz);
  assert(`alt=${targetAlt}° γ±6° RIGHT 20°: net ${moved.toFixed(1)}° > 5°`, moved > 5, `net=${moved.toFixed(1)}°`);
}

// ========================================================
// TEST L: Rapid direction change
// ========================================================
console.log('\n=== TEST L: Rapid direction reversal ===');
for (const targetAlt of [45, 55, 65, 70]) {
  reset();
  const beta = betaForAlt(targetAlt);
  feedSensor(180, beta, 0);
  for (let i = 0; i < 60; i++) feedSensor(180 + gaussNoise(1), beta + gaussNoise(0.5), gaussNoise(2));

  // Quick right 10° then immediately left 20°
  for (let i = 1; i <= 10; i++) feedSensor(180 + i + gaussNoise(0.5), beta + gaussNoise(0.5), gaussNoise(1.5));
  const afterRight = deviceAz;
  for (let i = 1; i <= 20; i++) feedSensor(190 - i + gaussNoise(0.5), beta + gaussNoise(0.5), gaussNoise(1.5));
  for (let i = 0; i < 60; i++) feedSensor(170 + gaussNoise(1), beta + gaussNoise(0.5), gaussNoise(2));
  const movedFromRight = azDiff(deviceAz, afterRight);
  assert(
    `alt=${targetAlt}°: R→L reversal — moved left from peak (${movedFromRight.toFixed(1)}°)`,
    movedFromRight < -5,
    `${movedFromRight.toFixed(1)}°`
  );
}

// ========================================================
// TEST M: Projection direction preserved at all elevations
// ========================================================
console.log('\n=== TEST M: Projection direction ===');
for (const devAlt of [0, 30, 45, 60, 70, 80, 85]) {
  const devAz = 100;
  const pR = project(devAlt, devAz + 5, devAz, devAlt, W, H, FOV);
  const pC = project(devAlt, devAz, devAz, devAlt, W, H, FOV);
  const pL = project(devAlt, devAz - 5, devAz, devAlt, W, H, FOV);
  assert(`alt=${devAlt}°: star+5°az right on screen`, pR.x > pC.x, `${pR.x.toFixed(1)} > ${pC.x.toFixed(1)}`);
  assert(`alt=${devAlt}°: star-5°az left on screen`, pL.x < pC.x, `${pL.x.toFixed(1)} < ${pC.x.toFixed(1)}`);
}

// ========================================================
// TEST N: iOS webkitCompassHeading gimbal-lock flip
// Root cause confirmed by real device log (sensor-log-2026-04-01T07_45_56.csv):
// wk flips exactly ~180° every time device alt crosses ~44-46°.
// alpha and matrixAz show 0.0° change at the same frames.
// Fix: track accumulated wk offset, un-flip input before feeding smoothAz.
// ========================================================
console.log('\n=== TEST N: iOS wk gimbal-lock flip compensation ===');

// Simulate the flip correction logic
let wkOffset = 0;
let prevWk2 = null;

function applyWkFlipCorrection(wk) {
  if (prevWk2 !== null) {
    const jump = ((wk - prevWk2 + 540) % 360) - 180;
    if (Math.abs(jump) > 120) {
      wkOffset = ((wkOffset - jump) % 360 + 360) % 360;
    }
  }
  prevWk2 = wk;
  return ((wk + wkOffset) % 360 + 360) % 360;
}

function feedSensorWk(wk, beta, gamma) {
  const rawAlt = Math.asin(Math.max(-1, Math.min(1, -Math.cos(beta * D) * Math.cos(gamma * D)))) / D;
  const alt = smoothAlt(rawAlt);
  deviceAlt = alt;
  const corrected = applyWkFlipCorrection(wk);
  const az = smoothAz(corrected);
  deviceAz = az;
  hasFirst = true;
  return { az, alt };
}

// N1: wk flip at 45° — smoothAz must NOT jump
{
  reset();
  wkOffset = 0; prevWk2 = null;
  const beta = betaForAlt(10);
  // Stable at wk=80° for 60 frames (low alt)
  for (let i = 0; i < 60; i++) feedSensorWk(80 + gaussNoise(1), beta + gaussNoise(0.5), gaussNoise(2));
  const azBefore = deviceAz;

  // Device tilts to 50°, wk flips +176° (ACTUAL value from device log)
  const betaHigh = betaForAlt(50);
  feedSensorWk(256, betaHigh, 0);  // flip: 80° → 256°

  // Run 30 more frames at wk=256° (device stays at 50° alt, stationary)
  for (let i = 0; i < 30; i++) feedSensorWk(256 + gaussNoise(1), betaHigh + gaussNoise(0.5), gaussNoise(2));
  const azAfterFlip = deviceAz;

  const drift = Math.abs(((azAfterFlip - azBefore + 540) % 360) - 180);
  assert('N1: wk +176° flip — smoothAz stays within 5° (no drift)', drift < 5, `drift=${drift.toFixed(1)}°`);
}

// N2: After flip, left turn still goes left
{
  reset();
  wkOffset = 0; prevWk2 = null;
  const betaLow = betaForAlt(10);
  for (let i = 0; i < 60; i++) feedSensorWk(80 + gaussNoise(1), betaLow + gaussNoise(0.5), gaussNoise(2));

  // Flip to 50° alt
  const betaHigh = betaForAlt(50);
  feedSensorWk(256, betaHigh, 0);
  for (let i = 0; i < 30; i++) feedSensorWk(256 + gaussNoise(1), betaHigh + gaussNoise(0.5), gaussNoise(2));
  const azStart = deviceAz;

  // Turn LEFT: wk decreases from 256° (left = decreasing wk on iOS)
  for (let i = 1; i <= 45; i++) feedSensorWk(256 - (i / 45) * 15 + gaussNoise(1), betaHigh + gaussNoise(0.5), gaussNoise(2));
  for (let i = 0; i < 30; i++) feedSensorWk(241 + gaussNoise(1), betaHigh + gaussNoise(0.5), gaussNoise(2));
  const moved = ((deviceAz - azStart + 540) % 360) - 180;
  assert(`N2: After wk flip, LEFT turn goes left: moved ${moved.toFixed(1)}° (< -3°)`, moved < -3, `moved=${moved.toFixed(1)}°`);
}

// N3: Flip then flip back — smoothAz returns to original
{
  reset();
  wkOffset = 0; prevWk2 = null;
  const betaLow = betaForAlt(10);
  for (let i = 0; i < 60; i++) feedSensorWk(80 + gaussNoise(1), betaLow + gaussNoise(0.5), gaussNoise(2));
  const azOriginal = deviceAz;

  // Flip up (tilt past 45°): wk 80° → 256°
  const betaHigh = betaForAlt(50);
  feedSensorWk(256, betaHigh, 0);
  for (let i = 0; i < 60; i++) feedSensorWk(256 + gaussNoise(1), betaHigh + gaussNoise(0.5), gaussNoise(2));

  // Flip back down (tilt below 45°): wk 256° → 80°
  feedSensorWk(80, betaLow + gaussNoise(0.5), gaussNoise(2));
  for (let i = 0; i < 60; i++) feedSensorWk(80 + gaussNoise(1), betaLow + gaussNoise(0.5), gaussNoise(2));
  const azFinal = deviceAz;

  const err = Math.abs(((azFinal - azOriginal + 540) % 360) - 180);
  assert(`N3: Flip up + flip back — az returns to original (err=${err.toFixed(1)}° < 5°)`, err < 5, `err=${err.toFixed(1)}°`);
}

// N4: Reproduce exact device log scenario (frame 1295 pattern)
// wk=80° → 256° flip, then user pans right 10°, verify it goes right
{
  reset();
  wkOffset = 0; prevWk2 = null;
  const betaLow = betaForAlt(8);
  for (let i = 0; i < 60; i++) feedSensorWk(80 + gaussNoise(1), betaLow + gaussNoise(0.5), gaussNoise(2));

  const betaHigh = betaForAlt(48);
  feedSensorWk(256, betaHigh, 0);   // exact flip from device log
  for (let i = 0; i < 60; i++) feedSensorWk(256 + gaussNoise(1), betaHigh + gaussNoise(0.5), gaussNoise(2));
  const azBase = deviceAz;

  // Pan RIGHT: wk increases 256° → 266°
  for (let i = 1; i <= 30; i++) feedSensorWk(256 + (i/30)*10 + gaussNoise(1), betaHigh + gaussNoise(0.5), gaussNoise(2));
  for (let i = 0; i < 30; i++) feedSensorWk(266 + gaussNoise(1), betaHigh + gaussNoise(0.5), gaussNoise(2));
  const moved = ((deviceAz - azBase + 540) % 360) - 180;
  assert(`N4: After flip, RIGHT pan goes right: moved ${moved.toFixed(1)}° (> 3°)`, moved > 3, `moved=${moved.toFixed(1)}°`);
}

// ========================================================
// SUMMARY
// ========================================================
console.log(`\n${'='.repeat(60)}`);
console.log(`  TOTAL: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(60)}\n`);

if (failed > 0) process.exit(1);
