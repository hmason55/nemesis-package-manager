const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {assertPublication, assertQuality, assertStableReadiness, stableVersionPattern, compareStableVersions} = require('./release-policy.cjs');

module.exports = async function publish({github, context, version, sourceSha = context.sha,
  channel = 'development', quality, versionCode, expectedFingerprint = '', directory = 'dist'}) {
  assertPublication({context, sourceSha, channel, version});
  assertQuality(quality, sourceSha);
  const repo = context.repo;
  if (channel === 'stable') await assertStableReadiness({github, repo, sourceSha});
  const tag = `v${version}`;
  const digest = data => crypto.createHash('sha256').update(data).digest('hex');
  const names = ['usb-package-manager-ready.zip', 'usb.package.manager.zip',
    'nemesis-usb-companion-windows-x86_64.zip', 'nemesis-usb-companion-linux-x86_64.tar.gz', 'release-evidence.json'];
  const assets = names.map(name => ({name, data: fs.readFileSync(path.join(directory, name))}));
  const evidence = JSON.parse(assets.find(a => a.name === 'release-evidence.json').data.toString('utf8'));
  if (evidence.schema !== 1 || evidence.source_sha !== sourceSha || evidence.version !== version ||
      evidence.channel !== channel || evidence.version_code !== Number(versionCode) ||
      !Number.isSafeInteger(evidence.version_code) || evidence.version_code < 1 ||
      !/^[a-f0-9]{64}$/.test(evidence.apk_sha256 || '') || !/^[a-f0-9]{64}$/.test(evidence.certificate_sha256 || ''))
    throw new Error('Release evidence is missing or does not match the selected commit/version');
  for (const name of names.slice(0, 2)) {
    if (evidence.assets?.[name] !== digest(assets.find(a => a.name === name).data)) throw new Error('Bundle does not match verified APK evidence');
  }
  if (channel === 'stable' && (evidence.signing !== 'release' ||
      !/^[a-f0-9]{64}$/.test(expectedFingerprint.replace(/:/g, '').toLowerCase()) ||
      evidence.certificate_sha256 !== expectedFingerprint.replace(/:/g, '').toLowerCase()))
    throw new Error('Stable publication requires the verified persistent signing identity');
  if (channel === 'development' && evidence.signing !== 'debug') throw new Error('Development signing evidence is inconsistent');
  assets.push({name: 'SHA256SUMS', data: Buffer.from(assets.map(a => `${digest(a.data)}  ${a.name}\n`).join(''))});
  const optional = async call => {
    try { return (await call()).data; }
    catch (error) { if (error.status === 404) return null; throw error; }
  };
  let ref = await optional(() => github.rest.git.getRef({...repo, ref: `tags/${tag}`}));
  if (ref && ref.object.sha !== sourceSha) throw new Error('Release tag points to another commit');
  const releases = await github.paginate(github.rest.repos.listReleases, {...repo, per_page: 100});
  if (channel === 'stable') {
    for (const release of releases) {
      const older = release.tag_name?.replace(/^v/, '');
      if (release.tag_name === tag || release.draft || release.prerelease || !stableVersionPattern.test(older || '')) continue;
      if (compareStableVersions(version, older) <= 0) throw new Error('A new stable release must be newer than existing stable releases');
      const priorAssets = await github.paginate(github.rest.repos.listReleaseAssets, {...repo, release_id: release.id});
      const priorReceipt = priorAssets.find(asset => asset.name === 'release-evidence.json');
      if (!priorReceipt) throw new Error('Previous stable release has no signing/version-code evidence');
      const response = await github.rest.repos.getReleaseAsset({...repo, asset_id: priorReceipt.id, headers: {accept: 'application/octet-stream'}});
      const prior = JSON.parse(Buffer.from(response.data).toString('utf8'));
      if (prior.schema !== 1 || prior.version !== older || prior.channel !== 'stable' || prior.signing !== 'release' ||
          !Number.isSafeInteger(prior.version_code) || prior.version_code < 1 || prior.certificate_sha256 !== evidence.certificate_sha256)
        throw new Error('Previous stable signing/version-code evidence is inconsistent');
      if (evidence.version_code <= prior.version_code) throw new Error('Stable Android version code must increase; start a new workflow run rather than retry an older candidate');
    }
  }
  let release = await optional(() => github.rest.repos.getReleaseByTag({...repo, tag}));
  if (!release) release = releases.find(candidate => candidate.tag_name === tag);
  if (release && release.prerelease !== (channel === 'development')) throw new Error('Existing release has a different channel');
  if (release && (release.tag_name !== tag || release.target_commitish !== sourceSha)) throw new Error('Existing release targets another commit');
  if (!ref) await github.rest.git.createRef({...repo, ref: `refs/tags/${tag}`, sha: sourceSha});
  if (!release) {
    const notes = (await github.rest.repos.generateReleaseNotes({...repo, tag_name: tag, target_commitish: sourceSha})).data;
    const signing = channel === 'stable' ? 'Stable release (release signed).' : 'Experimental development prerelease (debug signed).';
    release = (await github.rest.repos.createRelease({...repo, tag_name: tag, target_commitish: sourceSha,
      name: `Package Manager ${version}`, draft: true, prerelease: channel === 'development', make_latest: 'false',
      body: `${signing}\n\nDownload **usb-package-manager-ready.zip** for USB setup, or **usb.package.manager.zip** for the NEMESIS installer.\n\nFor the local USB companion, download **nemesis-usb-companion-windows-x86_64.zip** (Windows) or **nemesis-usb-companion-linux-x86_64.tar.gz** (Linux). Extract and run it to open the local browser UI; no Python or Node installation is needed. See the [companion guide](https://github.com/${repo.owner}/${repo.repo}/blob/${sourceSha}/docs/USB-COMPANION.md). Verify all downloads with SHA256SUMS. The public release-evidence.json records the tested commit, versions, and APK certificate fingerprint.\n\nExisting installations require an explicit update through NEMESIS; copying USB files alone does not update the installed app. Development and stable APKs use different signing identities; read the [signing and migration guide](https://github.com/${repo.owner}/${repo.repo}/blob/${sourceSha}/docs/RELEASING.md) before upgrading. See [update instructions](https://github.com/${repo.owner}/${repo.repo}/blob/${sourceSha}/docs/SETUP-WINDOWS.md#e-update-package-manager-itself).\n\n${notes.body}`
    })).data;
  }
  const existing = await github.paginate(github.rest.repos.listReleaseAssets, {...repo, release_id: release.id});
  if (existing.some(old => !assets.some(asset => asset.name === old.name))) throw new Error('Existing release contains an unverified extra asset');
  for (const asset of assets) {
    const old = existing.find(value => value.name === asset.name);
    if (old) {
      const response = await github.rest.repos.getReleaseAsset({...repo, asset_id: old.id, headers: {accept: 'application/octet-stream'}});
      if (digest(Buffer.from(response.data)) !== digest(asset.data)) throw new Error(`Existing asset differs: ${asset.name}`);
    } else {
      if (!release.draft) throw new Error('Published releases cannot receive new assets on retry');
      await github.rest.repos.uploadReleaseAsset({...repo, release_id: release.id, name: asset.name, data: asset.data});
    }
  }
  if (release.draft) await github.rest.repos.updateRelease({...repo, release_id: release.id, draft: false,
    prerelease: channel === 'development', make_latest: channel === 'stable' ? 'true' : 'false'});
};
