'use strict';
// Optional dev-only Playwright + independent jsQR decoder; no production npm dependencies.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const decode = require(process.env.JSQR_MODULE || 'jsqr');
const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || undefined, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const host = await context.newPage();
    const errors = []; host.on('pageerror', e => errors.push(e.message));
    await host.goto(base + '/?tv=1');
    await host.evaluate(() => chooseMode('Classic Multiplayer'));
    await host.getByRole('button', {name:'Create room →', exact:true}).click();
    await host.locator('#joinQr svg').waitFor();
    const code = await host.locator('#roomCode').textContent();
    const link = await host.locator('#joinLink').textContent();
    assert.equal(new URL(link).search, `?join=${code}`);
    assert.ok(!['localhost', '127.0.0.1', '[::1]'].includes(new URL(link).hostname));
    // Decode pixels from the actual visible QR, rather than reading its DOM payload.
    const screenshot = await host.locator('#joinQr').screenshot();
    const pixels = await host.evaluate(async data => {
      const img = new Image(); img.src = data; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
      return { width:img.width, height:img.height, rgba:Array.from(ctx.getImageData(0, 0, img.width, img.height).data) };
    }, `data:image/png;base64,${screenshot.toString('base64')}`);
    const scanned = decode(Uint8ClampedArray.from(pixels.rgba), pixels.width, pixels.height);
    assert.ok(scanned, 'QR screenshot must be independently decodable');
    assert.equal(scanned.data, link);
    // Follow the scanned URL as a separate phone session on the reachable network origin.
    const phoneContext = await browser.newContext({viewport:{width:390,height:844},isMobile:true});
    const phone = await phoneContext.newPage(); phone.on('pageerror', e => errors.push(e.message));
    const phoneResponse = await phone.goto(scanned.data);
    console.log('Scanned URL:', scanned.data, 'HTTP:', phoneResponse.status());
    if (phoneResponse.status() !== 200) throw new Error((await phone.locator('body').textContent()).slice(0, 500));
    assert.equal(await phone.locator('#joinCode').inputValue(), code);
    await phone.locator('#joinName').fill('QR Guest');
    await phone.getByRole('button', {name:'Join →',exact:true}).click();
    await phone.getByRole('button', {name:'Tap when ready',exact:true}).click();
    await host.waitForFunction(() => !document.getElementById('lobbyAction').disabled);
    const qrBox = await host.locator('#joinQr').boundingBox();
    assert.ok(qrBox.y + qrBox.height <= 720, 'QR fits on TV');
    const startBox = await host.locator('#lobbyAction').boundingBox();
    assert.ok(startBox.y + startBox.height <= 720, 'Start button fits on TV');
    assert.deepEqual(errors, []);
    if (process.env.SCREENSHOT) {
      await host.waitForTimeout(400); // Let the screen entrance animation settle for the artifact.
      await host.screenshot({path:process.env.SCREENSHOT});
    }
    console.log('PASS: independent QR screenshot decoding, reachable LAN URL, room prefill, phone joining and ready state.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
