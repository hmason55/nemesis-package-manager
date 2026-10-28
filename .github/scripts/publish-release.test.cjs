const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const publish = require('./publish-release.cjs');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'release-test-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  fs.writeFileSync(path.join(directory, 'usb-package-manager-ready.zip'), 'usb fixture');
  fs.writeFileSync(path.join(directory, 'usb.package.manager.zip'), 'installer fixture');
  const state = {ref: null, release: null, assets: [], published: 0};
  const missing = () => { const error = new Error('Missing'); error.status = 404; throw error; };
  const github = {rest: {git: {
    getRef: async () => ({data: state.ref || missing()}),
    createRef: async args => { state.ref = {object: {sha: args.sha}}; return {data: state.ref}; }
  }, repos: {
    getReleaseByTag: async () => ({data: state.release || missing()}),
    generateReleaseNotes: async () => ({data: {body: 'Changes: example merged PR'}}),
    createRelease: async args => { state.release = {...args, id: 1}; return {data: state.release}; },
    listReleaseAssets: async () => {},
    uploadReleaseAsset: async args => { state.assets.push({...args, id: state.assets.length + 1}); },
    getReleaseAsset: async args => ({data: state.assets.find(a => a.id === args.asset_id).data}),
    updateRelease: async () => { state.release.draft = false; state.published++; }
  }}, paginate: async () => state.assets};
  const context = {eventName: 'push', ref: 'refs/heads/main', sha: 'tested-sha', repo: {owner: 'example', repo: 'manager'}};
  return {github, context, directory, state, version: '0.2.0-build.42'};
}

test('creates exact-commit tag, notes, checksums and publishes only after all uploads', async t => {
  const f = fixture(t);
  await publish(f);
  assert.equal(f.state.ref.object.sha, 'tested-sha');
  assert.equal(f.state.release.tag_name, 'v0.2.0-build.42');
  assert.match(f.state.release.body, /example merged PR/);
  assert.match(f.state.release.body, /debug signed/);
  assert.equal(f.state.assets.length, 3);
  assert.match(f.state.assets[2].data.toString(), /^[a-f0-9]{64}  usb-package-manager-ready.zip/m);
  assert.equal(f.state.published, 1);
  await publish(f);
  assert.equal(f.state.assets.length, 3);
  assert.equal(f.state.published, 1);
});
test('rejects PR runs, invalid versions and tags on other commits', async t => {
  const f = fixture(t);
  await assert.rejects(publish({...f, context: {...f.context, eventName: 'pull_request'}}), /validated push/);
  await assert.rejects(publish({...f, version: 'unsafe/tag'}), /Invalid release/);
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
  assert.equal(f.state.published, 0);
  f.github.rest.repos.uploadReleaseAsset = upload;
  await publish(f);
  assert.equal(f.state.assets.length, 3);
  assert.equal(f.state.published, 1);
  f.state.assets[0].data = Buffer.from('different');
  await assert.rejects(publish(f), /Existing asset differs/);
});
