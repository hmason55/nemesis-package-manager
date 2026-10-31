const {test} = require('node:test');
const assert = require('node:assert/strict');
const policy = require('./release-policy.cjs');
const sha = 'a'.repeat(40);
const context = {eventName: 'push', ref: 'refs/heads/main', sha};
const quality = () => Object.fromEntries(policy.requiredJobs.map(name => [name, {result: 'success', outputs: {tested_sha: sha}}]));

test('automatic stable selection starts at 1.0.0 and increments the highest published patch numerically', () => {
  const select = releases => policy.nextStableVersion({base: '1.0.0', releases, sourceSha: sha, runId: 12});
  assert.equal(select([]), '1.0.0');
  assert.equal(select([{tag_name: 'v0.2.0-build.91', prerelease: true}, {tag_name: 'v0.2.0-build.59'}]), '1.0.0');
  assert.equal(select([{tag_name: 'v1.0.9'}, {tag_name: 'v1.0.10'}, {tag_name: 'v2.0.0', draft: true},
    {tag_name: 'v3.0.0', prerelease: true}, {tag_name: 'invalid'}]), '1.0.11');
  assert.equal(select([{tag_name: 'v1.0.999999999999999999999'}]), '1.0.1000000000000000000000');
  assert.equal(policy.nextStableVersion({base: '1.1.0', releases: [{tag_name: 'v1.0.10'}]}), '1.1.0');
  assert.throws(() => policy.nextStableVersion({base: 'bad', releases: []}), /base/);
});
test('automatic retries keep the same version and reject inconsistent run markers', () => {
  const release = {tag_name: 'v1.0.0', target_commitish: sha, body: '<!-- nemesis-build:12 -->'};
  const args = {base: '1.0.0', releases: [release], sourceSha: sha, runId: 12};
  assert.equal(policy.nextStableVersion(args), '1.0.0');
  release.draft = true; assert.equal(policy.nextStableVersion(args), '1.0.0');
  release.target_commitish = 'b'.repeat(40); assert.throws(() => policy.nextStableVersion(args), /identity/);
  release.target_commitish = sha; args.releases.push({...release}); assert.throws(() => policy.nextStableVersion(args), /Multiple/);
});
test('only main pushes can automatically select and publish stable versions of their exact commit', () => {
  const args = {base: '1.0.0', runNumber: 92, automaticVersion: '1.0.0', context};
  const release = policy.selectVersion(args);
  assert.deepEqual(release, {version: '1.0.0', sourceSha: sha, versionCode: 1092, channel: 'stable'});
  policy.assertPublication({context, ...release});
  for (const eventName of ['pull_request', 'workflow_dispatch'])
    assert.throws(() => policy.selectVersion({...args, context: {...context, eventName}}), /push to main/);
  assert.throws(() => policy.selectVersion({...args, context: {...context, ref: 'refs/heads/feature'}}), /push to main/);
  assert.throws(() => policy.selectVersion({...args, candidateSha: sha}), /unambiguous/);
  assert.throws(() => policy.selectVersion({...args, stableVersion: '1.0.0'}), /unambiguous/);
  assert.throws(() => policy.selectVersion({...args, automaticVersion: 'bad'}), /version/);
  assert.throws(() => policy.assertPublication({context, ...release, sourceSha: 'b'.repeat(40)}));
});

test('development versions and stable versions share a monotonic workflow version-code sequence', () => {
  const dev = policy.selectVersion({base: '0.2.0', runNumber: 57, context});
  assert.deepEqual(dev, {version: '0.2.0-build.57', versionCode: 1057, sourceSha: sha, channel: 'development'});
  const stable = policy.selectVersion({base: '0.2.0', runNumber: 58, stableVersion: '1.0.0', candidateSha: sha,
    context: {...context, eventName: 'workflow_dispatch'}});
  assert.equal(stable.versionCode, 1058);
  assert.equal(stable.version, '1.0.0');
  assert.equal(stable.channel, 'stable');
  assert.equal(policy.selectVersion({base: '2.0.0', runNumber: 59, context}).versionCode, 1059);
});

test('rejects malformed versions, ambiguous commits, unsafe counters, and implicit stable publication', () => {
  for (const runNumber of [0, -1, 1.5, NaN, 2100000000])
    assert.throws(() => policy.selectVersion({base: '0.2.0', runNumber, context}), /run number/);
  for (const stableVersion of ['v1.0.0', '01.0.0', '1.0', '1.0.0-beta', '../release'])
    assert.throws(() => policy.selectVersion({base: '0.2.0', runNumber: 1, stableVersion, candidateSha: sha,
      context: {...context, eventName: 'workflow_dispatch'}}), /version/);
  assert.throws(() => policy.selectVersion({base: '0.2.0', runNumber: 1, candidateSha: sha, context}), /requires a stable/);
  assert.throws(() => policy.selectVersion({base: '0.2.0', runNumber: 1, stableVersion: '1.0.0', candidateSha: sha, context}), /explicit dispatch/);
  assert.throws(() => policy.selectVersion({base: '0.2.0', runNumber: 1, context: {...context, sha: 'main'}}), /exact/);
});

test('each failed, cancelled, skipped, missing, or stale quality result blocks publication', () => {
  policy.assertQuality(quality(), sha);
  assert.throws(() => policy.assertQuality(undefined, sha), /validation/);
  for (const name of policy.requiredJobs) {
    for (const result of ['failure', 'cancelled', 'skipped', 'timed_out', undefined]) {
      const jobs = quality(); jobs[name].result = result;
      assert.throws(() => policy.assertQuality(jobs, sha), /validation/);
    }
    const jobs = quality(); jobs[name].outputs.tested_sha = 'b'.repeat(40);
    assert.throws(() => policy.assertQuality(jobs, sha), /another commit/);
    delete jobs[name]; assert.throws(() => policy.assertQuality(jobs, sha), /validation/);
  }
});

test('publication context rejects PRs, manual previews, changed stable inputs, and unknown channels', () => {
  const dev = {context, sourceSha: sha, channel: 'development', version: '0.2.0-build.57'};
  policy.assertPublication(dev);
  for (const eventName of ['pull_request', 'workflow_dispatch'])
    assert.throws(() => policy.assertPublication({...dev, context: {...context, eventName}}), /validated push/);
  assert.throws(() => policy.assertPublication({...dev, context: {...context, ref: 'refs/heads/feature'}}), /main-branch/);
  const stable = {...dev, channel: 'stable', version: '1.0.0',
    context: {...context, eventName: 'workflow_dispatch', payload: {inputs: {stable_version: '1.0.0', candidate_sha: sha, publish_stable: 'true'}}}};
  policy.assertPublication(stable);
  for (const publish_stable of [undefined, 'false', false])
    assert.throws(() => policy.assertPublication({...stable, context: {...stable.context,
      payload: {inputs: {...stable.context.payload.inputs, publish_stable}}}}), /explicitly dispatched/);
  assert.throws(() => policy.assertPublication({...stable, version: '1.0.1'}), /explicitly dispatched/);
  assert.throws(() => policy.assertPublication({...stable, sourceSha: 'b'.repeat(40)}), /explicitly dispatched/);
  assert.throws(() => policy.assertPublication({...dev, channel: 'other'}), /channel/);
});

test('stable candidates require main ancestry and completed quality-gate implementation', async () => {
  let status = 'ahead', blocked = null, reason = 'completed';
  const github = {rest: {repos: {compareCommits: async () => ({data: {status}})},
    issues: {get: async ({issue_number}) => ({data: {state: blocked === issue_number ? 'open' : 'closed', state_reason: reason}})}}};
  const args = {github, repo: {owner: 'example', repo: 'manager'}, sourceSha: sha};
  await policy.assertStableReadiness(args);
  status = 'identical'; await policy.assertStableReadiness(args);
  for (status of ['behind', 'diverged', 'unknown']) await assert.rejects(policy.assertStableReadiness(args), /ancestor/);
  status = 'ahead';
  for (blocked of [30, 31]) await policy.assertStableReadiness(args); // These issues no longer gate publication.
  for (blocked of policy.stableBlockers) await assert.rejects(policy.assertStableReadiness(args), new RegExp(`#${blocked}`));
  blocked = null; reason = 'not_planned'; await assert.rejects(policy.assertStableReadiness(args), /blocked/);
  github.rest.issues.get = async () => { throw new Error('unavailable'); };
  await assert.rejects(policy.assertStableReadiness(args), /unavailable/);
});

test('stable release ordering uses numbers rather than lexical or floating-point comparisons', () => {
  assert.equal(policy.compareStableVersions('1.10.0', '1.9.99'), 1);
  assert.equal(policy.compareStableVersions('1.0.0', '1.0.0'), 0);
  assert.equal(policy.compareStableVersions('1.0.0', '2.0.0'), -1);
  assert.equal(policy.compareStableVersions('999999999999999999.0.0', '999999999999999998.0.0'), 1);
});
