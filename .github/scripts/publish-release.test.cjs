const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const publish = require('./publish-release.cjs');
const crypto = require('node:crypto');
const sha = 'a'.repeat(40);
const fingerprint = 'c'.repeat(64);
const digest = data => crypto.createHash('sha256').update(data).digest('hex');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'release-test-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  fs.writeFileSync(path.join(directory, 'usb-package-manager-ready.zip'), 'usb fixture');
  fs.writeFileSync(path.join(directory, 'usb.package.manager.zip'), 'installer fixture');
  fs.writeFileSync(path.join(directory, 'nemesis-usb-companion-windows-x86_64.zip'), 'windows fixture');
  fs.writeFileSync(path.join(directory, 'nemesis-usb-companion-linux-x86_64.tar.gz'), 'linux fixture');
  const state = {ref: null, release: null, assets: [], published: 0, created: 0};
  const missing = () => { const error = new Error('Missing'); error.status = 404; throw error; };
  const github = {rest: {git: {
    getRef: async () => ({data: state.ref || missing()}),
    createRef: async args => { state.ref = {object: {sha: args.sha}}; return {data: state.ref}; }
  }, repos: {
    getReleaseByTag: async () => ({data: (state.release && !state.release.draft) ? state.release : missing()}),
    listReleases: async () => {},
    generateReleaseNotes: async () => ({data: {body: 'Changes: example merged PR'}}),
    createRelease: async args => { state.created++; state.release = {...args, id: 1}; return {data: state.release}; },
    listReleaseAssets: async () => {},
    uploadReleaseAsset: async args => { state.assets.push({...args, id: state.assets.length + 1}); },
    getReleaseAsset: async args => ({data: [...state.assets, ...(state.previousAssets || [])].find(a => a.id === args.asset_id).data}),
    updateRelease: async args => { Object.assign(state.release, args); state.published++; }
  }}, paginate: async (endpoint, args) => {
    if (endpoint === github.rest.repos.listReleases) {
      return [{tag_name: 'unrelated', draft: true, id: 999}, ...(state.previousReleases || []), ...(state.release ? [state.release] : [])];
    }
    assert.equal(endpoint, github.rest.repos.listReleaseAssets);
    return args.release_id === 2 ? (state.previousAssets || []) : state.assets;
  }};
  const context = {eventName: 'push', ref: 'refs/heads/main', sha, repo: {owner: 'example', repo: 'manager'}};
  const version = '0.2.0-build.42';
  const quality = Object.fromEntries(['python-quality', 'java-quality', 'build', 'companion'].map(name =>
    [name, {result: 'success', outputs: {tested_sha: sha}}]));
  const evidence = {schema: 1, source_sha: sha, version, version_code: 1042, channel: 'development',
    signing: 'debug', certificate_sha256: fingerprint, apk_sha256: 'd'.repeat(64),
    assets: Object.fromEntries(['usb-package-manager-ready.zip', 'usb.package.manager.zip'].map(name =>
      [name, digest(fs.readFileSync(path.join(directory, name)))]))};
  fs.writeFileSync(path.join(directory, 'release-evidence.json'), JSON.stringify(evidence));
  return {github, context, directory, state, version, quality, versionCode: 1042};
}

test('creates exact-commit tag, notes, checksums and publishes only after all uploads', async t => {
  const f = fixture(t);
  await publish(f);
  assert.equal(f.state.ref.object.sha, sha);
  assert.equal(f.state.release.tag_name, 'v0.2.0-build.42');
  assert.match(f.state.release.body, /example merged PR/);
  assert.match(f.state.release.body, /debug signed/);
  assert.equal(f.state.assets.length, 6);
  const checksums = f.state.assets.find(a => a.name === 'SHA256SUMS').data.toString();
  assert.match(checksums, /^[a-f0-9]{64}  usb-package-manager-ready.zip/m);
  for (const name of ['usb-package-manager-ready.zip', 'usb.package.manager.zip', 'nemesis-usb-companion-windows-x86_64.zip', 'nemesis-usb-companion-linux-x86_64.tar.gz']) {
    assert.ok(checksums.includes(`  ${name}\n`));
  }
  assert.equal(checksums.trim().split('\n').length, 5);
  assert.match(f.state.release.body, /no Python or Node installation is needed/);
  assert.match(f.state.release.body, /nemesis-usb-companion-windows-x86_64.zip/);
  assert.match(f.state.release.body, /nemesis-usb-companion-linux-x86_64.tar.gz/);
  assert.equal(f.state.published, 1);
  assert.equal(f.state.release.prerelease, true);
  assert.equal(f.state.release.make_latest, 'false');
  await publish(f);
  assert.equal(f.state.assets.length, 6);
  assert.equal(f.state.published, 1);
});

function stableFixture(t) {
  const f = fixture(t);
  f.channel = 'stable'; f.version = '1.0.0'; f.expectedFingerprint = fingerprint;
  f.context = {...f.context, sha: 'b'.repeat(40), eventName: 'workflow_dispatch',
    payload: {inputs: {stable_version: f.version, candidate_sha: sha, publish_stable: 'true'}}};
  f.sourceSha = sha;
  f.github.rest.repos.compareCommits = async () => ({data: {status: 'ahead'}});
  f.github.rest.issues = {get: async () => ({data: {state: 'closed', state_reason: 'completed'}})};
  const report = path.join(f.directory, 'release-evidence.json');
  const data = JSON.parse(fs.readFileSync(report));
  fs.writeFileSync(report, JSON.stringify({...data, version: f.version, channel: 'stable', signing: 'release'}));
  return f;
}

test('explicit stable promotion publishes the tested candidate and persistent identity as latest', async t => {
  const f = stableFixture(t);
  await publish(f);
  assert.equal(f.state.release.tag_name, 'v1.0.0');
  assert.equal(f.state.ref.object.sha, sha);
  assert.equal(f.state.release.target_commitish, sha);
  assert.equal(f.state.release.prerelease, false);
  assert.equal(f.state.release.make_latest, 'true');
  assert.match(f.state.release.body, /release signed/);
  assert.doesNotMatch(f.state.release.body, /Experimental development/);
  await publish(f);
  assert.equal(f.state.published, 1);
});

test('quality failures, missing results, and stale results create no tags, release, or assets', async t => {
  for (const job of ['python-quality', 'java-quality', 'build', 'companion']) {
    for (const result of ['failure', 'cancelled', 'skipped', undefined]) {
      const f = fixture(t); f.quality[job].result = result;
      await assert.rejects(publish(f), /validation/);
      assert.equal(f.state.ref, null); assert.equal(f.state.release, null); assert.equal(f.state.assets.length, 0);
    }
    const f = fixture(t); f.quality[job].outputs.tested_sha = 'b'.repeat(40);
    await assert.rejects(publish(f), /another commit/);
    assert.equal(f.state.ref, null);
  }
});

test('missing or inconsistent APK evidence and modified bundles prevent publication', async t => {
  for (const field of ['source_sha', 'version', 'version_code', 'channel', 'schema', 'apk_sha256', 'certificate_sha256']) {
    const f = fixture(t), report = path.join(f.directory, 'release-evidence.json');
    const data = JSON.parse(fs.readFileSync(report)); data[field] = 'wrong'; fs.writeFileSync(report, JSON.stringify(data));
    await assert.rejects(publish(f), /evidence/); assert.equal(f.state.ref, null);
  }
  const f = fixture(t);
  fs.writeFileSync(path.join(f.directory, 'usb.package.manager.zip'), 'changed after verification');
  await assert.rejects(publish(f), /verified APK evidence/); assert.equal(f.state.release, null);
  fs.unlinkSync(path.join(f.directory, 'release-evidence.json'));
  await assert.rejects(publish(f), /ENOENT/); assert.equal(f.state.ref, null);
});

test('stable promotion blocks unfinished readiness, wrong certificates, and debug signing', async t => {
  const blocked = stableFixture(t);
  blocked.github.rest.issues.get = async () => ({data: {state: 'open'}});
  await assert.rejects(publish(blocked), /blocked by issue/); assert.equal(blocked.state.ref, null);
  for (const expectedFingerprint of ['', 'd'.repeat(64), 'invalid']) {
    const f = stableFixture(t); f.expectedFingerprint = expectedFingerprint;
    await assert.rejects(publish(f), /signing identity/); assert.equal(f.state.ref, null);
  }
  const f = stableFixture(t), report = path.join(f.directory, 'release-evidence.json');
  const data = JSON.parse(fs.readFileSync(report)); data.signing = 'debug'; fs.writeFileSync(report, JSON.stringify(data));
  await assert.rejects(publish(f), /signing identity/); assert.equal(f.state.published, 0);
});

test('stable downgrades and existing release-channel collisions cannot publish', async t => {
  const f = stableFixture(t);
  f.state.previousReleases = [{tag_name: 'v1.1.0', draft: false, prerelease: false}];
  await assert.rejects(publish(f), /newer/); assert.equal(f.state.ref, null);
  const old = fixture(t);
  old.state.release = {tag_name: 'v0.2.0-build.42', draft: true, prerelease: false, id: 1};
  await assert.rejects(publish(old), /different channel/); assert.equal(old.state.ref, null);
});

test('retrying an older tagged stable draft cannot displace a newer stable release', async t => {
  const f = stableFixture(t);
  f.state.ref = {object: {sha}};
  f.state.release = {id: 1, tag_name: 'v1.0.0', target_commitish: sha, draft: true, prerelease: false};
  f.state.previousReleases = [{tag_name: 'v1.1.0', draft: false, prerelease: false}];
  await assert.rejects(publish(f), /newer/);
  assert.equal(f.state.release.draft, true); assert.equal(f.state.published, 0);
});

test('wrong release identity and extra unverified assets stop retry publication', async t => {
  const f = fixture(t);
  await publish(f);
  f.state.release.target_commitish = 'b'.repeat(40);
  await assert.rejects(publish(f), /targets another commit/);
  f.state.release.target_commitish = sha;
  f.state.assets.push({name: 'unverified.apk', id: 999, data: Buffer.from('unverified')});
  await assert.rejects(publish(f), /unverified extra asset/);
  assert.equal(f.state.published, 1);
});
test('rejects PR runs, invalid versions and tags on other commits', async t => {
  const f = fixture(t);
  await assert.rejects(publish({...f, context: {...f.context, eventName: 'pull_request'}}), /validated push/);
  await assert.rejects(publish({...f, version: 'unsafe/tag'}), /Development releases/);
  f.state.ref = {object: {sha: 'another-sha'}};
  await assert.rejects(publish(f), /another commit/);
  assert.equal(f.state.release, null);
});
test('failed upload stays unpublished and retry resumes without duplicate assets', async t => {
  const f = fixture(t);
  const upload = f.github.rest.repos.uploadReleaseAsset;
  f.github.rest.repos.uploadReleaseAsset = async args => {
    if (args.name === 'usb.package.manager.zip') throw new Error('network failed');
    return upload(args);
  };
  await assert.rejects(publish(f), /network failed/);
  assert.equal(f.state.release.draft, true);
  const originalDraft = f.state.release;
  assert.equal(f.state.published, 0);
  f.github.rest.repos.uploadReleaseAsset = upload;
  await publish(f);
  assert.equal(f.state.release, originalDraft);
  assert.equal(f.state.created, 1);
  assert.equal(f.state.assets.length, 6);
  assert.equal(f.state.published, 1);
  f.state.assets[0].data = Buffer.from('different');
  await assert.rejects(publish(f), /Existing asset differs/);
});

test('missing companion build prevents tag creation and publication', async t => {
  for (const name of ['nemesis-usb-companion-windows-x86_64.zip', 'nemesis-usb-companion-linux-x86_64.tar.gz']) {
    const f = fixture(t);
    fs.unlinkSync(path.join(f.directory, name));
    await assert.rejects(publish(f), /ENOENT/);
    assert.equal(f.state.ref, null);
    assert.equal(f.state.release, null);
    assert.equal(f.state.published, 0);
  }
});

test('failed companion upload keeps the release private until retry completes', async t => {
  const f = fixture(t);
  const upload = f.github.rest.repos.uploadReleaseAsset;
  f.github.rest.repos.uploadReleaseAsset = async args => {
    if (args.name.endsWith('linux-x86_64.tar.gz')) throw new Error('companion upload failed');
    return upload(args);
  };
  await assert.rejects(publish(f), /companion upload failed/);
  assert.equal(f.state.release.draft, true);
  assert.equal(f.state.published, 0);
  f.github.rest.repos.uploadReleaseAsset = upload;
  await publish(f);
  assert.equal(f.state.assets.length, 6);
  assert.equal(f.state.created, 1);
  assert.equal(f.state.published, 1);
});

test('published releases reject newly missing companion assets on retry', async t => {
  const f = fixture(t);
  await publish(f);
  f.state.assets = f.state.assets.filter(a => !a.name.endsWith('linux-x86_64.tar.gz'));
  await assert.rejects(publish(f), /cannot receive new assets/);
  assert.equal(f.state.published, 1);
});


test('delayed stable candidates cannot lower version codes or change the retained signing identity', async t => {
  for (const mode of ['valid', 'older-code', 'equal-code', 'wrong-key', 'missing', 'invalid']) {
    const f = stableFixture(t);
    f.state.previousReleases = [{id: 2, tag_name: 'v0.9.0', draft: false, prerelease: false}];
    const prior = {schema: 1, version: '0.9.0', channel: 'stable', signing: 'release',
      version_code: mode === 'older-code' ? 1043 : mode === 'equal-code' ? 1042 : 1041,
      certificate_sha256: mode === 'wrong-key' ? 'e'.repeat(64) : fingerprint};
    f.state.previousAssets = mode === 'missing' ? [] : [{id: 99, name: 'release-evidence.json',
      data: Buffer.from(mode === 'invalid' ? '{}' : JSON.stringify(prior))}];
    if (mode === 'valid') { await publish(f); assert.equal(f.state.published, 1); }
    else {
      await assert.rejects(publish(f), /version.code|signing/);
      assert.equal(f.state.ref, null); assert.equal(f.state.published, 0);
    }
  }
});
