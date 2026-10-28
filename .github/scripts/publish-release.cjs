const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

module.exports = async function publish({github, context, version, directory = 'dist'}) {
  if (context.eventName !== 'push' || context.ref !== 'refs/heads/main') {
    throw new Error('Releases require a validated push to main');
  }
  if (!/^\d+\.\d+\.\d+-build\.\d+$/.test(version)) throw new Error('Invalid release version');
  const repo = context.repo;
  const tag = `v${version}`;
  const names = ['usb-package-manager-ready.zip', 'usb.package.manager.zip'];
  const assets = names.map(name => ({name, data: fs.readFileSync(path.join(directory, name))}));
  const digest = data => crypto.createHash('sha256').update(data).digest('hex');
  assets.push({name: 'SHA256SUMS', data: Buffer.from(assets.map(a => `${digest(a.data)}  ${a.name}\n`).join(''))});
  const optional = async call => {
    try { return (await call()).data; }
    catch (error) { if (error.status === 404) return null; throw error; }
  };
  let ref = await optional(() => github.rest.git.getRef({...repo, ref: `tags/${tag}`}));
  if (ref && ref.object.sha !== context.sha) throw new Error('Release tag points to another commit');
  if (!ref) await github.rest.git.createRef({...repo, ref: `refs/tags/${tag}`, sha: context.sha});
  let release = await optional(() => github.rest.repos.getReleaseByTag({...repo, tag}));
  if (!release) {
    const notes = (await github.rest.repos.generateReleaseNotes({...repo, tag_name: tag, target_commitish: context.sha})).data;
    release = (await github.rest.repos.createRelease({...repo, tag_name: tag, target_commitish: context.sha,
      name: `Package Manager ${version}`, draft: true, prerelease: false,
      body: `Experimental development build (debug signed).\n\nDownload **usb-package-manager-ready.zip** for USB setup, or **usb.package.manager.zip** for the NEMESIS installer. Verify downloads with SHA256SUMS.\n\nExisting installations require an explicit update through NEMESIS; copying USB files alone does not update the installed app. See [update instructions](https://github.com/${repo.owner}/${repo.repo}/blob/${context.sha}/docs/SETUP-WINDOWS.md#e-update-usb-package-manager-itself).\n\n${notes.body}`
    })).data;
  }
  const existing = await github.paginate(github.rest.repos.listReleaseAssets, {...repo, release_id: release.id});
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
  if (release.draft) await github.rest.repos.updateRelease({...repo, release_id: release.id, draft: false});
};
