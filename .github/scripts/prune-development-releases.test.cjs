const {test} = require('node:test');
const assert = require('node:assert/strict');
const prune = require('./prune-development-releases.cjs');
const sha = 'a'.repeat(40), fingerprint = 'c'.repeat(64);
function fixture() {
  const stable = {id: 1, tag_name: 'v1.0.0', target_commitish: sha, draft: false, prerelease: false};
  const releases = [stable,
    {id: 2, tag_name: 'v0.2.0-build.91', prerelease: true},
    {id: 3, tag_name: 'v0.2.0-build.59', prerelease: false},
    {id: 4, tag_name: 'v0.2.0-build.88', draft: true}];
  const tags = ['v1.0.0', 'v0.2.0-build.91', 'v0.2.0-build.59', 'v0.2.0-build.88', 'v0.2.0-build.17', 'custom-tag'];
  const refs = tags.map(tag => ({ref: `refs/tags/${tag}`, object: {type: 'commit', sha}}));
  const assets = ['usb-package-manager-ready.zip', 'usb.package.manager.zip',
    'nemesis-usb-companion-windows-x86_64.zip', 'nemesis-usb-companion-linux-x86_64.tar.gz',
    'release-evidence.json', 'SHA256SUMS'].map((name, id) => ({id, name}));
  const evidence = {schema: 1, source_sha: sha, version: '1.0.0', channel: 'stable', signing: 'release', certificate_sha256: fingerprint};
  const deleted = [];
  const github = {rest: {repos: {
    getReleaseByTag: async () => ({data: stable}), listReleaseAssets: async () => {}, listReleases: async () => {},
    getReleaseAsset: async () => ({data: Buffer.from(JSON.stringify(evidence))}),
    compareCommits: async () => ({data: {status: 'ahead'}}),
    deleteRelease: async ({release_id}) => { deleted.push(`release:${release_id}`); releases.splice(releases.findIndex(r => r.id === release_id), 1); }
  }, git: {
    getRef: async ({ref}) => ({data: refs.find(r => r.ref === `refs/${ref}`)}), listMatchingRefs: async () => {},
    deleteRef: async ({ref}) => { deleted.push(ref); refs.splice(refs.findIndex(r => r.ref === `refs/${ref}`), 1); }
  }}, paginate: async endpoint => {
    if (endpoint === github.rest.repos.listReleaseAssets) return assets;
    if (endpoint === github.rest.repos.listReleases) return [...releases];
    if (endpoint === github.rest.git.listMatchingRefs) return [...refs];
    throw new Error('unexpected endpoint');
  }};
  return {github, repo: {owner: 'example', repo: 'manager'}, version: '1.0.0', sourceSha: sha,
    expectedFingerprint: fingerprint, stable, releases, refs, assets, evidence, deleted};
}
test('prunes obsolete development downloads, legacy flags and orphan tags, keeping stable/custom/drafts', async () => {
  const f = fixture(), result = await prune(f);
  assert.deepEqual(result.releases, ['v0.2.0-build.91', 'v0.2.0-build.59']);
  assert.deepEqual(result.tags, ['v0.2.0-build.91', 'v0.2.0-build.59', 'v0.2.0-build.17']);
  assert.deepEqual(f.deleted, ['release:2', 'tags/v0.2.0-build.91', 'release:3', 'tags/v0.2.0-build.59', 'tags/v0.2.0-build.17']);
  assert.deepEqual((await prune(f)).tags, []);
});
test('incomplete, private, debug or mismatched stable evidence prevents every deletion', async () => {
  const changes = [f => {f.stable.draft = true;}, f => {f.stable.prerelease = true;},
    f => {f.stable.target_commitish = 'b'.repeat(40);}, f => {f.assets.pop();},
    f => {f.evidence.signing = 'debug';}, f => {f.evidence.source_sha = 'b'.repeat(40);},
    f => {f.expectedFingerprint = '';}, f => {f.version = '1.0.0-build.1';},
    f => {f.refs[0].object.sha = 'b'.repeat(40);}];
  for (const change of changes) { const f = fixture(); change(f); await assert.rejects(prune(f)); assert.deepEqual(f.deleted, []); }
});
test('keeps non-ancestor and annotated development tags', async () => {
  const f = fixture(); f.refs[1].object.type = 'tag';
  f.github.rest.repos.compareCommits = async () => ({data: {status: 'diverged'}});
  await prune(f); assert.deepEqual(f.deleted, []);
});
test('failed release deletion cannot delete its tag and retry can finish orphan tag cleanup', async () => {
  const f = fixture(); f.github.rest.repos.deleteRelease = async () => {throw new Error('permission denied');};
  await assert.rejects(prune(f), /permission/); assert.deepEqual(f.deleted, []);
  const retry = fixture(); const remove = retry.github.rest.git.deleteRef;
  retry.github.rest.git.deleteRef = async () => {throw new Error('network');};
  await assert.rejects(prune(retry), /network/); assert.deepEqual(retry.deleted, ['release:2']);
  retry.github.rest.git.deleteRef = remove;
  assert.ok((await prune(retry)).tags.includes('v0.2.0-build.91'));
});
test('changed development tag aborts before deleting that release', async () => {
  const f = fixture(), getRef = f.github.rest.git.getRef;
  f.github.rest.git.getRef = async args => args.ref === 'tags/v0.2.0-build.91' ?
    {data: {object: {sha: 'b'.repeat(40), type: 'commit'}}} : getRef(args);
  await assert.rejects(prune(f), /changed during/); assert.deepEqual(f.deleted, []);
});
