import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

// These are gameplay contracts, exercised through the same fixed-step loop as
// the shipped game. No screenshots or machine-specific timing are assertions.
const url = process.env.GAME_URL || 'http://127.0.0.1:4174/?capture=1';
const neutral = { steer: 0, pedal: false, brake: false, crouch: false,
  hop: false, boost: false, manual: false, trick: 0 };
let server;
let browser;
let page;
let serverOutput = '';
const errors = [];
let passed = 0;

async function check(label, run) {
  await run();
  passed++;
  console.log(`✓ ${label}`);
}

try {
  if (!process.env.GAME_URL) {
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4174', '--strictPort'],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', data => { serverOutput += data.toString(); });
    server.stderr.on('data', data => { serverOutput += data.toString(); });
    let ready = false;
    for (let i = 0; i < 120; i++) {
      if (server.exitCode !== null) throw new Error(`Vite exited before startup:\n${serverOutput}`);
      try { if ((await fetch(url)).ok) { ready = true; break; } } catch { /* startup */ }
      await delay(250);
    }
    assert.ok(ready, `Vite did not become ready:\n${serverOutput}`);
  }
  let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (!executablePath) {
    try { await fs.access(chromium.executablePath()); }
    catch {
      const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      try { await fs.access(systemChrome); executablePath = systemChrome; } catch { /* Playwright reports install instructions. */ }
    }
  }
  browser = await chromium.launch({ headless: true, executablePath,
    args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 1100, height: 750 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /THREE|WebGL|shader|GL_INVALID|Error:/i.test(message.text())) errors.push(message.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__SUNBREAK?.ready, { timeout: 120000 });
  const state = () => page.evaluate(() => window.__SUNBREAK.state());
  const step = frames => page.evaluate(frames => window.__SUNBREAK.step(frames), frames);
  const input = values => page.evaluate(values => window.__SUNBREAK.input(values), { ...neutral, ...values });
  const seek = progress => page.evaluate(progress => window.__SUNBREAK.seek(progress), progress);

  await check('title loads without JavaScript or shader errors', async () => {
    assert.equal((await state()).phase, 'title');
    assert.equal(errors.length, 0, errors.join('\n'));
  });
  await check('three-second countdown starts a four-rider race', async () => {
    await page.evaluate(() => window.__SUNBREAK.start());
    assert.equal((await state()).phase, 'countdown');
    await step(200);
    const result = await state();
    assert.equal(result.phase, 'racing');
    assert.equal(result.riders.length, 4);
  });
  await check('pedaling builds downhill speed and advances the course', async () => {
    const before = await state();
    await input({ pedal: true });
    await step(180);
    const after = await state();
    assert.ok(after.player.s > before.player.s + 20, 'Rider failed to advance at least 20 meters');
    assert.ok(after.player.speed > 7, 'Rider failed to build riding speed');
    assert.ok(after.riders.every(rider => Number.isFinite(rider.s) && Number.isFinite(rider.speed)), 'AI produced non-finite state');
  });
  await check('steering changes the chosen line', async () => {
    const before = await state();
    await input({ pedal: true, steer: 1 });
    await step(35);
    const after = await state();
    assert.ok(after.player.lateral > before.player.lateral + .3, 'Right input did not move the rider right');
  });
  await check('brakes scrub speed', async () => {
    const before = await state();
    await input({ brake: true });
    await step(80);
    assert.ok((await state()).player.speed < before.player.speed * .8, 'Braking did not reduce speed sufficiently');
  });
  await check('preload release produces an airborne bunny hop', async () => {
    await seek(.1);
    await input({ pedal: true, crouch: true });
    await step(24);
    await input({ pedal: true });
    await step(3);
    const result = await state();
    assert.equal(result.player.airborne, true);
    assert.ok(result.player.y > 0, 'Hop never left the ground');
    await step(180);
    assert.equal((await state()).player.crash, 0, 'A normal preload hop caused a crash');
  });
  await check('pause freezes the simulation and resumes correctly', async () => {
    await page.keyboard.press('KeyP');
    const before = await state();
    assert.equal(before.phase, 'paused');
    await step(90);
    const after = await state();
    assert.equal(after.time, before.time);
    assert.equal(after.player.s, before.player.s);
    await page.keyboard.press('KeyP');
    assert.equal((await state()).phase, 'racing');
  });
  await check('the ravine jump launches and can land without a crash', async () => {
    await seek(.712);
    await input({ pedal: true });
    let airborne = false;
    let maximumHeight = 0;
    let landed = false;
    for (let i = 0; i < 35; i++) {
      await step(8);
      const result = await state();
      airborne ||= result.player.airborne;
      maximumHeight = Math.max(maximumHeight, result.player.y);
      if (airborne && !result.player.airborne) landed = true;
      assert.equal(result.player.crash, 0, 'Automatic ravine takeoff produced a crash');
    }
    assert.ok(airborne, 'Ravine lip did not launch the bicycle');
    assert.ok(maximumHeight > 5, 'Ravine did not produce meaningful air');
    assert.ok(landed, 'Rider did not settle back onto the course');
  });
  await check('full/reduced effects toggle and rain droplets respond to controls', async () => {
    await seek(.12);await input({pedal:true,boost:true});await step(90);
    assert.equal((await state()).effects.enabled,true);
    await page.keyboard.press('KeyF');await step(1);
    assert.equal((await state()).effects.enabled,false);
    assert.equal(await page.locator('#effects-toggle').getAttribute('aria-pressed'),'false');
    await page.keyboard.press('KeyF');await page.keyboard.press('KeyV');await step(120);
    const wet=await state();assert.equal(wet.effects.weather,'rain');assert.ok(wet.effects.wetness>.7);assert.ok(wet.effects.rain>.9);
    await fs.mkdir('captures/effects',{recursive:true});await page.screenshot({path:'captures/effects/rain-boost.png'});
    await page.keyboard.press('KeyV');await input({pedal:true});await step(300);
    assert.equal((await state()).effects.weather,'dawn');assert.ok((await state()).effects.wetness<.3,'Lens droplets did not drain after rain stopped');
    await page.screenshot({path:'captures/effects/dry-speed.png'});
  });
  await check('finish triggers results, saves a best run, and restart counts down', async () => {
    await seek(.995);
    await input({ pedal: true });
    await step(240);
    const result = await state();
    assert.equal(result.phase, 'results');
    assert.equal(result.player.finished, true);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sunbreak.best.v1')));
    assert.ok(saved.time > 0 && saved.ghost.length > 0, 'Best-run ghost was not persisted');
    await page.evaluate(() => window.__SUNBREAK.reset());
    const reset = await state();
    assert.equal(reset.phase, 'countdown');
    assert.equal(reset.time, 0);
    assert.equal(reset.player.score, 0);
  });
  assert.equal(errors.length, 0, `Browser reported errors:\n${errors.join('\n')}`);
  console.log(`\n${passed} gameplay checks passed.`);
} catch (error) {
  if (page) {
    await fs.mkdir('captures', { recursive: true });
    await page.screenshot({ path: 'captures/test-failure.png' }).catch(() => {});
    const current = await page.evaluate(() => window.__SUNBREAK?.state()).catch(() => null);
    await fs.writeFile('captures/test-failure.json', JSON.stringify({ state: current, errors }, null, 2));
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) server.kill('SIGTERM');
}
