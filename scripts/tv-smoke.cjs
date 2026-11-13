'use strict';
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || undefined, headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/?tv=1');
    await page.waitForFunction(() => typeof window.wordShiftRemote === 'function');
    assert.match(await page.evaluate(() => document.activeElement.textContent), /Play now/);
    await page.keyboard.press('Enter');
    await page.locator('#modes.active').waitFor();
    assert.match(await page.evaluate(() => document.activeElement.textContent), /Classic/);
    await page.keyboard.press('ArrowRight');
    assert.match(await page.evaluate(() => document.activeElement.textContent), /Head-to-Head/);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    await page.locator('#lobby.active').waitFor();
    assert.match(await page.evaluate(() => document.activeElement.textContent), /Create room/);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('roomCode').textContent !== '-----');
    const code = await page.locator('#roomCode').textContent();
    const guestContext = await browser.newContext({viewport:{width:390,height:844}});
    const guest = await guestContext.newPage(); guest.on('pageerror', e => errors.push(e.message));
    await guest.goto(`${base}/?join=${code}`);
    assert.equal(await guest.evaluate(() => document.documentElement.classList.contains('tv-mode')), false);
    await guest.locator('#joinName').fill('TV Guest');
    await guest.getByRole('button',{name:'Join →',exact:true}).click();
    await guest.getByRole('button',{name:'Tap when ready',exact:true}).click();
    await page.waitForFunction(() => !document.getElementById('lobbyAction').disabled);
    // From the upper-left Back control, Down must reach Start using the actual remote mapping.
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'lobbyAction');
    await page.keyboard.press('Enter');
    await page.locator('#intro.active').waitFor();
    await page.keyboard.press('Enter');
    await page.locator('#tv.active').waitFor();
    assert.match(await page.locator('#bigword').textContent(), /DOGS/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (process.env.SCREENSHOT) await page.screenshot({path:process.env.SCREENSHOT});
    assert.deepEqual(errors, []);
    console.log('PASS: TV remote-only mode selection, room creation, phone joining, remote start, full-screen board, and phone isolation.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
