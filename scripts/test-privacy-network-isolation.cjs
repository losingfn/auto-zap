/* global require: readonly, fetch: readonly, AbortSignal: readonly */
// No SDK is loaded here. OS-enforced preliminary egress check, not route interception.
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { mkdtemp, writeFile, rm, mkdir } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { chromium } = require('playwright-core');

async function launchIsolatedBrowser(port, output, options = {}) {
  assert(Number.isInteger(port) && port > 1024 && port < 65536);
  const temporary = await mkdtemp(join(tmpdir(), 'metrika-network-'));
  const profile = `(version 1)\n(allow default)\n(deny network*)\n(allow network-bind)\n(allow network-outbound (remote ip "localhost:${port}"))\n`;
  await writeFile(join(temporary, 'browser.sb'), profile);
  // All Chrome children inherit the macOS sandbox; Chromium's own nested sandbox
  // is disabled because it cannot install a second Seatbelt profile.
  const wrapper = join(temporary, 'chrome');
  await writeFile(wrapper, `#!/bin/sh\nexec /usr/bin/sandbox-exec -f '${temporary}/browser.sb' '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' --no-sandbox --no-proxy-server --disable-quic "$@"\n`, { mode: 0o700 });
  try {
    const browser = await chromium.launch({ headless: options.headless !== false, executablePath: wrapper,
      args: [`--log-net-log=${resolve(output, 'chrome-netlog.json')}`], timeout: 15000 });
    return { browser, profile, cleanup: async () => { await browser.close(); await rm(temporary, { recursive: true, force: true }); } };
  } catch (error) { await rm(temporary, { recursive: true, force: true }); throw error; }
}

async function probe(browser, base) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const failures = [];
  page.on('requestfailed', request => failures.push({ url: request.url(), error: request.failure()?.errorText }));
  try {
    const response = await page.goto(base);
    assert.equal(response.status(), 200, 'The exact allowed loopback endpoint must work');
    // No context.route/page.route or JS transport substitution in this probe.
    const checks = await page.evaluate(async () => {
      const urls = ['https://example.com/', 'https://93.184.215.14/'];
      const result = [];
      for (const url of urls) {
        try { await fetch(url, { mode: 'no-cors', signal: AbortSignal.timeout(4000) }); result.push({ url, blocked: false }); }
        catch (error) { result.push({ url, blocked: true, error: String(error) }); }
      }
      return result;
    });
    assert(checks.every(check => check.blocked), 'External network probe passed: real SDK MUST NOT run');
    assert(failures.some(f => f.url.includes('93.184.215.14') && /ACCESS_DENIED|NETWORK_ACCESS_DENIED/.test(f.error ?? '')),
      'An IP-literal probe must prove OS access denial, not just DNS/CORS/timeout failure');
    return { passed: true, localStatus: response.status(), checks, failures, routesInstalled: false };
  } finally { await context.close(); }
}

async function main() {
  const output = resolve('artifacts/metrika-sdk-isolated'); await mkdir(output, { recursive: true });
  const server = createServer((_, response) => response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Network isolation probe; no SDK</title>'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let isolated;
  const result = { timestamp: new Date().toISOString(), sdkExecuted: false };
  try {
    const port = server.address().port;
    isolated = await launchIsolatedBrowser(port, output);
    result.profile = isolated.profile;
    result.chrome = isolated.browser.version();
    result.probe = await probe(isolated.browser, `http://127.0.0.1:${port}`);
    console.log('PASS OS-level browser egress denial; SDK was not loaded');
  } catch (error) { result.error = String(error); process.exitCode = 1; console.error(result.error); }
  finally {
    if (isolated) await isolated.cleanup();
    await new Promise(resolve => server.close(resolve));
    await writeFile(join(output, 'isolation-probe.json'), JSON.stringify(result, null, 2) + '\n');
  }
}
module.exports = { launchIsolatedBrowser, probe };
if (require.main === module) void main();
