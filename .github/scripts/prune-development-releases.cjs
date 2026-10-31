const {stableVersionPattern} = require('./release-policy.cjs');
const developmentTag = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-build\.[1-9]\d*$/;
const requiredAssets = ['usb-package-manager-ready.zip', 'usb.package.manager.zip',
  'nemesis-usb-companion-windows-x86_64.zip', 'nemesis-usb-companion-linux-x86_64.tar.gz',
  'release-evidence.json', 'SHA256SUMS'];

// Called only after the publisher has verified every asset and made the new stable
// release public. Never remove the last usable downloads on a failed build.
module.exports = async function prune({github, repo, version, sourceSha, expectedFingerprint}) {
  if (!stableVersionPattern.test(version || '') || !/^[a-f0-9]{40}$/.test(sourceSha || ''))
    throw new Error('Cleanup requires an exact stable release identity');
  const stable = (await github.rest.repos.getReleaseByTag({...repo, tag: `v${version}`})).data;
  if (stable.draft || stable.prerelease || stable.tag_name !== `v${version}` || stable.target_commitish !== sourceSha)
    throw new Error('Cleanup requires the successfully published stable release');
  const stableRef = (await github.rest.git.getRef({...repo, ref: `tags/v${version}`})).data;
  if (stableRef.object.sha !== sourceSha) throw new Error('Stable release tag changed before cleanup');
  const assets = await github.paginate(github.rest.repos.listReleaseAssets, {...repo, release_id: stable.id});
  if (!requiredAssets.every(name => assets.some(asset => asset.name === name)))
    throw new Error('Stable release downloads are incomplete; preserving development releases');
  const receipt = assets.find(asset => asset.name === 'release-evidence.json');
  const response = await github.rest.repos.getReleaseAsset({...repo, asset_id: receipt.id, headers: {accept: 'application/octet-stream'}});
  const evidence = JSON.parse(Buffer.from(response.data).toString('utf8'));
  const fingerprint = (expectedFingerprint || '').replace(/:/g, '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(fingerprint) || evidence.schema !== 1 || evidence.source_sha !== sourceSha ||
      evidence.version !== version || evidence.channel !== 'stable' || evidence.signing !== 'release' ||
      evidence.certificate_sha256 !== fingerprint)
    throw new Error('Stable signing evidence is inconsistent; preserving development releases');

  const releases = await github.paginate(github.rest.repos.listReleases, {...repo, per_page: 100});
  const refs = await github.paginate(github.rest.git.listMatchingRefs, {...repo, ref: 'tags/v', per_page: 100});
  const removed = {releases: [], tags: [], skipped: []};
  for (const ref of refs) {
    const tag = ref.ref.replace(/^refs\/tags\//, '');
    if (!developmentTag.test(tag)) continue;
    const release = releases.find(item => item.tag_name === tag);
    // Keep unfinished releases and annotated/custom tags for deliberate inspection.
    if (release?.draft || ref.object.type !== 'commit') { removed.skipped.push(tag); continue; }
    const comparison = (await github.rest.repos.compareCommits({...repo, base: ref.object.sha, head: sourceSha})).data;
    if (!['ahead', 'identical'].includes(comparison.status)) { removed.skipped.push(tag); continue; }
    const current = (await github.rest.git.getRef({...repo, ref: `tags/${tag}`})).data;
    if (current.object.sha !== ref.object.sha || current.object.type !== 'commit')
      throw new Error(`Development tag changed during cleanup: ${tag}`);
    if (release) {
      // Includes legacy -build releases that accidentally lacked the prerelease flag.
      await github.rest.repos.deleteRelease({...repo, release_id: release.id});
      removed.releases.push(tag);
    }
    await github.rest.git.deleteRef({...repo, ref: `tags/${tag}`});
    removed.tags.push(tag);
  }
  return removed;
};
