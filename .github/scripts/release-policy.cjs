const stableVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const developmentVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-build\.[1-9]\d*$/;
const shaPattern = /^[a-f0-9]{40}$/;
const requiredJobs = ['python-quality', 'java-quality', 'build', 'companion'];
const stableBlockers = [30, 31, 32];

function selectVersion({base, runNumber, stableVersion = '', candidateSha = '', context}) {
  if (!Number.isSafeInteger(runNumber) || runNumber < 1 || runNumber > 2100000000 - 1000) throw new Error('Invalid workflow run number');
  const stable = stableVersion !== '';
  if (stable && (context.eventName !== 'workflow_dispatch' || context.ref !== 'refs/heads/main'))
    throw new Error('Stable releases require an explicit dispatch from main');
  if (!stable && candidateSha) throw new Error('A candidate SHA requires a stable version');
  const sourceSha = stable ? candidateSha : context.sha;
  if (!shaPattern.test(sourceSha || '')) throw new Error('An exact 40-character commit SHA is required');
  if (!stableVersionPattern.test(stable ? stableVersion : base)) throw new Error('Invalid release version');
  return {version: stable ? stableVersion : `${base}-build.${runNumber}`,
    versionCode: 1000 + runNumber, sourceSha, channel: stable ? 'stable' : 'development'};
}

function assertQuality(quality, sourceSha) {
  for (const name of requiredJobs) {
    if (quality?.[name]?.result !== 'success' || quality[name].outputs?.tested_sha !== sourceSha)
      throw new Error(`Required ${name} validation is missing, unsuccessful, or belongs to another commit`);
  }
}

function assertPublication({context, sourceSha, channel, version}) {
  if (!shaPattern.test(sourceSha || '') || context.ref !== 'refs/heads/main') throw new Error('Releases require an exact main-branch commit');
  if (channel === 'development') {
    if (context.eventName !== 'push' || context.sha !== sourceSha || !developmentVersionPattern.test(version))
      throw new Error('Development releases require a validated push to main');
  } else if (channel === 'stable') {
    if (context.eventName !== 'workflow_dispatch' || context.payload?.inputs?.stable_version !== version ||
        context.payload?.inputs?.candidate_sha !== sourceSha || !stableVersionPattern.test(version))
      throw new Error('Stable publication must match the explicitly dispatched version and commit');
  } else throw new Error('Unknown release channel');
}

async function assertStableReadiness({github, repo, sourceSha}) {
  const comparison = (await github.rest.repos.compareCommits({...repo, base: sourceSha, head: 'main'})).data;
  if (!['ahead', 'identical'].includes(comparison.status)) throw new Error('Stable candidate must be an ancestor of main');
  for (const issue_number of stableBlockers) {
    const issue = (await github.rest.issues.get({...repo, issue_number})).data;
    if (issue.state !== 'closed' || issue.state_reason !== 'completed') throw new Error(`Stable publication is blocked by issue #${issue_number}`);
  }
}

function compareStableVersions(a, b) {
  const left = a.split('.').map(BigInt), right = b.split('.').map(BigInt);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}

module.exports = {selectVersion, assertQuality, assertPublication, assertStableReadiness,
  compareStableVersions, stableVersionPattern, requiredJobs, stableBlockers};
