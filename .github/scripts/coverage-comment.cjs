const {execFileSync} = require('node:child_process');

module.exports = async ({github, context, core}) => {
  const source = context.payload.workflow_run;
  const repo = context.repo;
  let number = source.pull_requests?.[0]?.number;
  if (!number) {
    const associated = await github.paginate(github.rest.repos.listPullRequestsAssociatedWithCommit,
      {...repo, commit_sha: source.head_sha});
    number = associated.find(pr => pr.state === 'open' && pr.head.sha === source.head_sha)?.number;
  }
  if (!number) { core.info('No associated pull request; skipping.'); return; }
  const current = (await github.rest.pulls.get({...repo, pull_number: number})).data;
  if (current.state !== 'open' || current.head.sha !== source.head_sha) {
    core.info('Closed PR or obsolete commit; skipping.'); return;
  }
  const runs = await github.paginate(github.rest.actions.listWorkflowRunsForRepo,
    {...repo, head_sha: source.head_sha, event: 'pull_request', per_page: 100});
  const rows = [];
  const badges = [];
  for (const [language, workflow, artifactName] of [
    ['Python', 'Python quality', 'python-coverage'],
    ['Java', 'Java tests and coverage', 'java-quality-reports']
  ]) {
    const run = runs.filter(value => value.name === workflow).sort((a, b) => b.id - a.id)[0];
    let metrics = null;
    if (run?.status === 'completed') {
      try {
        const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, {...repo, run_id: run.id});
        const artifact = artifacts.find(value => value.name === artifactName && !value.expired);
        if (artifact && artifact.size_in_bytes <= 20 * 1024 * 1024) {
          const download = await github.rest.actions.downloadArtifact({...repo, artifact_id: artifact.id, archive_format: 'zip'});
          metrics = JSON.parse(execFileSync('python3', ['.github/scripts/coverage_report.py', language],
            {input: Buffer.from(download.data), maxBuffer: 1024 * 1024, timeout: 30000}));
        }
      } catch (error) { core.warning(`${language} coverage could not be read; reporting unavailable.`); }
    }
    for (const [key, label] of [['line', 'Line'], ['branch', 'Branch']]) {
      const value = metrics?.[key];
      const available = typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
      const display = available ? `${value.toFixed(2)}%` : 'Unavailable';
      const color = !available ? 'lightgrey' : value >= 85 ? 'brightgreen' : 'orange';
      badges.push(`![${language} ${label} coverage](https://img.shields.io/static/v1?label=${encodeURIComponent(`${language} ${label}`)}&message=${encodeURIComponent(display)}&color=${color})`);
      const link = run ? `[Report](https://github.com/${repo.owner}/${repo.repo}/actions/runs/${run.id})` : 'Pending';
      rows.push(`| ${language} | ${label} | ${display} | 85% | ${!available ? 'Not measured' : value >= 85 ? 'Met' : 'Below target'} | ${link} |`);
    }
  }
  const body = `<!-- package-manager-coverage -->\n## Code coverage\n\n${badges.join(' ')}\n\nCommit: \`${source.head_sha}\`\n\n| Language | Metric | Coverage | Target | Status | Details |\n| --- | --- | --- | --- | --- | --- |\n${rows.join('\n')}\n\nUnavailable reports are not treated as zero or passing. Java and Python each enforce separate 85% line and branch coverage thresholds in their quality workflows.`;
  const latest = (await github.rest.pulls.get({...repo, pull_number: number})).data;
  if (latest.state !== 'open' || latest.head.sha !== source.head_sha) return;
  const comments = await github.paginate(github.rest.issues.listComments, {...repo, issue_number: number});
  const previous = comments.find(comment => comment.user?.login === 'github-actions[bot]' && comment.body?.includes('<!-- package-manager-coverage -->'));
  if (previous) await github.rest.issues.updateComment({...repo, comment_id: previous.id, body});
  else await github.rest.issues.createComment({...repo, issue_number: number, body});
};
