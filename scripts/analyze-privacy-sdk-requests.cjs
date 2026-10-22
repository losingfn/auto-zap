/* global require: readonly */
// Offline regression checks against authentic SDK request attempts. No networking.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const root = 'artifacts/metrika-sdk-isolated';
const primary = JSON.parse(fs.readFileSync(`${root}/real-next-report.json`, 'utf8'));
const supplement = JSON.parse(fs.readFileSync(`${root}/supplement/real-next-report.json`, 'utf8'));
const attempts = [
  ...JSON.parse(fs.readFileSync(`${root}/requests.json`, 'utf8')),
  ...JSON.parse(fs.readFileSync(`${root}/supplement/requests.json`, 'utf8'))
];
const watches = attempts.filter(a => /^\/watch\/113668070(?:\/\d+)?$/.test(new URL(a.url).pathname));
const refs = watches.filter(a => new URL(a.url).searchParams.get('page-ref'));
const forms = watches.filter(a => {
  const u = new URL(a.url);
  return u.searchParams.get('page-url')?.startsWith('form:') || /"(?:fi|fit|ite)":/.test(u.searchParams.get('site-info') ?? '');
});
const late = supplement.evidence.lateResponseAfterWithdrawal;
const revokeAck = supplement.api.find(a => a.phase.includes('pending pre-withdrawal') && a.action === 'revoke' && a.status === 200);
const afterRevoke = late.attempts.filter(a => a.at > revokeAck.at);
const queuedReplay = supplement.evidence.postWithdrawalReplay.filter(u => u.includes('/queued-after-withdrawal'));
const text = watches.map(a => decodeURIComponent(a.url) + '\n' + (a.body ?? '') + '\n' + JSON.stringify(a.headers)).join('\n');
const contacts = ['qa-private-marker@example.invalid', '+7 (000) 123-45-67', '70001234567', '0001234567'];
const contactRepresentations = contacts.flatMap(value => [value, Buffer.from(value).toString('base64'), ...['sha256', 'sha1', 'md5'].map(algorithm => createHash(algorithm).update(value).digest('hex'))]);
const contactMatches = contactRepresentations.filter(value => text.includes(value));
const checks = [
  { name: 'No actual page-ref in SDK requests', passed: refs.length === 0, count: refs.length },
  { name: 'No automatic form metadata', passed: forms.length === 0, count: forms.length },
  { name: 'No request initiated after revoke ACK from previously queued hit', passed: afterRevoke.length === 0, count: afterRevoke.length },
  { name: 'No post-withdrawal SDK command replayed on regrant', passed: queuedReplay.length === 0, count: queuedReplay.length },
  { name: 'No tested plaintext/base64/SHA256/SHA1/MD5 contact values', passed: contactMatches.length === 0, count: contactMatches.length }
];
assert.equal(primary.evidence.cleanedUp, true); assert.equal(supplement.evidence.cleanedUp, true);
const result = { status: checks.every(c => c.passed) ? 'PASSED' : 'FAILED', checks,
  requestCount: attempts.length, watchCount: watches.length,
  lateTimeline: { withdrawalClick: late.withdrawnAt, revokeAck: revokeAck.at, newRequest: afterRevoke[0]?.at,
    newRequestDelayAfterAckMs: afterRevoke[0] ? afterRevoke[0].at - revokeAck.at : null },
  examples: { referrer: refs[0] ? Object.fromEntries(['page-url', 'page-ref'].map(k => [k, new URL(refs[0].url).searchParams.get(k)])) : null,
    form: forms.map(a => ({ type: a.type, pageUrl: new URL(a.url).searchParams.get('page-url'), siteInfo: new URL(a.url).searchParams.get('site-info') })), queuedReplay },
  limitations: 'Finite scenarios with minimal synthetic SDK settings responses; no claim about real account configuration or arbitrary encodings.' };
fs.writeFileSync(`${root}/wire-findings.json`, JSON.stringify(result, null, 2) + '\n');
for (const check of checks) console.log(`${check.passed ? 'PASS' : 'FAIL'} ${check.name}: ${check.count}`);
if (result.status === 'FAILED') process.exitCode = 1;
