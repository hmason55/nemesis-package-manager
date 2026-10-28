const {test} = require('node:test');
const assert = require('node:assert/strict');
const report = require('./coverage-comment.cjs');

test('creates and updates one bot comment with badges without inventing missing metrics', async () => {
  const comments = [];
  const context = {repo: {owner: 'test', repo: 'manager'}, payload: {workflow_run: {head_sha: 'abc', pull_requests: [{number: 7}]}}};
  const github = {rest: {pulls: {get: async () => ({data: {state: 'open', head: {sha: 'abc'}}})},
    actions: {listWorkflowRunsForRepo: async () => {}},
    issues: {listComments: async () => {},
      createComment: async value => comments.push({...value, id: 1, user: {login: 'github-actions[bot]'}}),
      updateComment: async value => { assert.equal(value.comment_id, 1); comments[0].body = value.body; }}},
    paginate: async method => method === github.rest.issues.listComments ? comments : []};
  const core = {info() {}, warning() {}};
  await report({github, context, core});
  await report({github, context, core});
  assert.equal(comments.length, 1);
  assert.match(comments[0].body, /img.shields.io/);
  assert.match(comments[0].body, /Unavailable/);
  assert.match(comments[0].body, /Not measured/);
});
test('obsolete commits cannot overwrite the current PR coverage', async () => {
  const github = {rest: {pulls: {get: async () => ({data: {state: 'open', head: {sha: 'new'}}})}}};
  await report({github, context: {repo: {}, payload: {workflow_run: {head_sha: 'old', pull_requests: [{number: 1}]}}}, core: {info() {}}});
});
