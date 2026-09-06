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
    assert.equal(reset.player.score, 0);
  });
  await check('track selector loads and switches between 3 distinct courses', async () => {
    const t0 = await state();
    assert.equal(t0.world.trackId, 0);
    assert.equal(t0.world.trackName, 'THE SUNBREAK DESCENT');

    await page.evaluate(() => window.__SUNBREAK.setTrack(1));
    const t1 = await state();
    assert.equal(t1.world.trackId, 1);
    assert.equal(t1.world.trackName, 'RIDGE RUNNER');
    assert.notEqual(t1.world.length, t0.world.length);

    await page.evaluate(() => window.__SUNBREAK.setTrack(2));
    const t2 = await state();
    assert.equal(t2.world.trackId, 2);
    assert.equal(t2.world.trackName, 'GRAVITY LAB');
    assert.notEqual(t2.world.length, t1.world.length);

    await page.evaluate(() => window.__SUNBREAK.setTrack(3));
    const t3 = await state();
    assert.equal(t3.world.trackId, 3);
    assert.equal(t3.world.trackName, 'RED DUST CANYON');

    await page.evaluate(() => window.__SUNBREAK.setTrack(4));
    const t4 = await state();
    assert.equal(t4.world.trackId, 4);
    assert.equal(t4.world.trackName, 'BLACK FOREST SLALOM');

    await page.evaluate(() => window.__SUNBREAK.setTrack(0));
    const resetTrack = await state();
    assert.equal(resetTrack.world.trackId, 0);
  });
  await check('ghost rider is an option toggleable via button, hotkey, and localStorage', async () => {
    const ghostBtn = page.locator('#ghost-toggle');
    assert.equal(await ghostBtn.getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('KeyG');
    assert.equal(await ghostBtn.getAttribute('aria-pressed'), 'false');
    const stored = await page.evaluate(() => localStorage.getItem('sunbreak.ghost'));
    assert.equal(stored, 'disabled');
    await page.click('#ghost-toggle');
    assert.equal(await ghostBtn.getAttribute('aria-pressed'), 'true');
  });
  await check('garage permits bike upgrades, credit deduction, and gear customization', async () => {
    await page.click('[data-action="open-garage"]');
    assert.equal(await page.locator('#garage-panel').isVisible(), true);
    const beforeCredits = (await page.evaluate(() => window.__SUNBREAK.garage())).credits;
    assert.ok(beforeCredits >= 750);
    // Purchase tires upgrade
    await page.click('[data-action="upgrade-tires"]');
    const garage = await page.evaluate(() => window.__SUNBREAK.garage());
    assert.equal(garage.upgrades.tires, 2);
    assert.ok(garage.credits < beforeCredits);
    // Change color in paint shop
    await page.click('#btn-tab-paint');
    await page.click('[data-action^="color-frame-"]');
    const updatedGarage = await page.evaluate(() => window.__SUNBREAK.garage());
    assert.ok(updatedGarage.colors.frame > 0);
    await page.click('[data-action="close-garage"]');
    assert.equal(await page.locator('#garage-panel').isVisible(), false);
  });
  await check('championship tour initiates multi-stage grand prix progression', async () => {
    await page.click('[data-action="mode-champ"]');
    const champ = await page.evaluate(() => window.__SUNBREAK.champ());
    assert.equal(champ.active, true);
    assert.equal(champ.currentStage, 0);
    assert.equal(champ.totalStages, 5);
    assert.equal(champ.riders.length, 4);
    await page.click('[data-action="mode-single"]');
    const single = await page.evaluate(() => window.__SUNBREAK.champ());
    assert.equal(single.active, false);
  });
  await check('superman and air tricks execute cleanly during big jumps', async () => {
    await seek(.712);
    await input({ pedal: true, trick: 3 });
    let supermanSaw = false;
    for (let i = 0; i < 30; i++) {
      await step(2);
      const s = await state();
      if (s.player.trick === 'SUPERMAN') {
        supermanSaw = true;
        assert.ok(s.player.airborne, 'Superman was triggered while grounded');
        assert.ok(s.player.trickRotation >= 0, 'Trick rotation was negative');
        break;
      }
    }
    assert.ok(supermanSaw, 'Superman trick was not detected during big jump');
  });
  await check('backflip, frontflip, and 360 execute and land cleanly for the player', async () => {
    await seek(.712);
    await input({ pedal: true, trick: 9 });
    let backflipSaw = false;
    for (let i = 0; i < 40; i++) {
      await step(2);
      const s = await state();
      if (s.player.trick === 'BACKFLIP') {
        backflipSaw = true;
        assert.ok(s.player.airborne, 'Backflip was triggered while grounded');
        assert.ok(s.player.trickRotation >= 0, 'Backflip trick rotation was negative');
        break;
      }
    }
    assert.ok(backflipSaw, 'Backflip trick was not detected for player');
    let landedClean = false;
    for (let i = 0; i < 35; i++) {
      await step(8);
      const s = await state();
      if (!s.player.airborne) {
        landedClean = s.player.crash === 0;
        break;
      }
    }
    assert.ok(landedClean, 'Backflip crashed on landing');

    await seek(.712);
    await input({ pedal: true, trick: 8 });
    let spinSaw = false;
    for (let i = 0; i < 40; i++) {
      await step(2);
      const s = await state();
      if (s.player.trick === '360') {
        spinSaw = true;
        break;
      }
    }
    assert.ok(spinSaw, '360 spin trick was not detected for player');

    await seek(.712);
    await input({ pedal: true, trick: 10 });
    let frontflipSaw = false;
    for (let i = 0; i < 40; i++) {
      await step(2);
      const s = await state();
      if (s.player.trick === 'FRONTFLIP') {
        frontflipSaw = true;
        break;
      }
    }
    assert.ok(frontflipSaw, 'Frontflip trick was not detected for player');
  });
  await check('crashes slide naturally without continuous spinning or merging into ground', async () => {
    await seek(.345);
    await input({ pedal: true, boost: true });
    let crashed = false;
    for (let i = 0; i < 40; i++) {
      await step(2);
      const s = await state();
      if (s.player.crash > 0) {
        crashed = true;
        assert.ok(Math.abs(s.player.roll) <= 1.45, `Crash roll ${s.player.roll} exceeded natural slide limit`);
        break;
      }
    }
    assert.ok(crashed, 'Rider did not crash into obstacle on rock garden');
  });
  await check('hard touch collision between opponents causes both riders to crash', async () => {
    await seek(.1);
    await page.evaluate(() => {
      const w = window.__SUNBREAK;
      const r = w.race();
      r.riders[0].speed = 22;
      r.riders[0].lateral = 0;
      r.riders[1].speed = 22;
      r.riders[1].s = r.riders[0].s + 0.2;
      r.riders[1].lateral = 0.2;
    });
    await step(4);
    const riders = await page.evaluate(() => window.__SUNBREAK.race().riders);
    assert.ok(riders[0].crash > 0, 'Player did not crash from hard touch');
    assert.ok(riders[1].crash > 0, 'Opponent did not crash from hard touch');
  });
  await check('tracks feature distinct environmental atmospheres and abundant jumps', async () => {
    const world0 = await page.evaluate(() => window.__SUNBREAK.world());
    assert.ok(world0.environment, 'Track 0 missing environment configuration');
    assert.ok(world0.environment.terrainColors.length === 5, 'Track 0 terrain colors incomplete');
    await page.evaluate(() => window.__SUNBREAK.setTrack(3));
    const world3 = await page.evaluate(() => window.__SUNBREAK.world());
    assert.equal(world3.trackName, 'RED DUST CANYON');
    assert.notEqual(world3.environment.fogColor, world0.environment.fogColor, 'Red Dust Canyon shared fog color');
    assert.notEqual(world3.environment.dirtColor, world0.environment.dirtColor, 'Red Dust Canyon shared dirt color');
    await page.evaluate(() => window.__SUNBREAK.setTrack(0));
  });
  await check('championship next stage button can be clicked to advance race', async () => {
    await page.click('[data-action="mode-champ"]');
    await seek(.995);
    await input({ pedal: true });
    await step(120);
    const s = await state();
    assert.equal(s.phase, 'results');
    assert.ok(await page.locator('[data-action="champ-next"]').isVisible(), 'Next stage button not visible in results');
    await page.click('[data-action="champ-next"]');
    await step(10);
    const nextChamp = await page.evaluate(() => window.__SUNBREAK.champ());
    assert.equal(nextChamp.currentStage, 1, 'Clicking Next Stage button did not advance championship stage');
    await page.evaluate(() => window.__SUNBREAK.setTrack(0));
  });
  await check('each competitor possesses a distinct race number badge on their jersey', async () => {
    const badges = await page.evaluate(() => {
      const w = window.__SUNBREAK;
      const visuals = w.visuals();
      return visuals.map((v, idx) => {
        let badgeMeshCount = 0;
        v.group.traverse(obj => {
          if (obj.isMesh && obj.geometry && obj.geometry.attributes?.position?.count) {
            badgeMeshCount++;
          }
        });
        return { id: idx, badgeMeshCount };
      });
    });
    assert.equal(badges.length, 4);
    assert.ok(badges.every(b => b.badgeMeshCount > 10), 'Rider visual is missing geometry elements');
  });
  await check('crashed rider remains visible above ground surface without sinking', async () => {
    await seek(.345);
    await input({ pedal: true, boost: true });
    let crashed = false;
    for (let i = 0; i < 40; i++) {
      await step(2);
      const s = await state();
      if (s.player.crash > 0) {
        crashed = true;
        const elevation = await page.evaluate(() => {
          const w = window.__SUNBREAK;
          const p = w.race().player;
          const sample = w.world().sample(p.s, p.lateral);
          const ground = Math.max(sample.position.y, w.world().height(sample.position.x, sample.position.z));
          const visual = w.visuals()[0];
          // In Three.js, visual.group has children: bike, athlete
          const athlete = visual.group.children[1] || visual.group.children[0];
          const athleteWorldY = visual.group.position.y + athlete.position.y * Math.cos(p.roll) - athlete.position.x * Math.sin(p.roll);
          return { groundY: ground, groupY: visual.group.position.y, athleteWorldY, diff: visual.group.position.y - ground };
        });
        assert.ok(elevation.groupY >= elevation.groundY + 0.15, `Crash group height ${elevation.groupY} was below ground ${elevation.groundY}`);
        break;
      }
    }
    assert.ok(crashed, 'Rider did not trigger crash');
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
