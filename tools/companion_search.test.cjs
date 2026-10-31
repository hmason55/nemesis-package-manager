const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function fixture(load) {
  const context = {setTimeout, clearTimeout};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'companion_ui/cloud-search.js'),'utf8'), context);
  let queued; const renders=[], errors=[], loading=[],delays=[];
  const control = context.NemesisCloudSearch({load, render:r=>renders.push(r),error:e=>errors.push(e.message),loading:v=>loading.push(v),schedule:(fn,delay)=>{queued=fn;delays.push(delay);return 1;},cancel:()=>{queued=undefined;}});
  return {control,renders,errors,loading,delays,helpers:context.NemesisCloudSearch,key:context.NemesisCloudSearch.selectionKey,pending:()=>!!queued,flush:()=>{const callback=queued;queued=undefined;return callback();}};
}
test('typing coalesces to the latest query and Enter cancels its delayed duplicate', async()=>{
  const calls=[];const f=fixture(async request=>{calls.push(request);return request;});
  f.control.queue('a');f.control.queue('app');await f.flush();
  assert.deepEqual(calls,['app']);assert.deepEqual(f.renders,['app']);
  f.control.queue('package');await f.control.now('package');assert.deepEqual(calls,['app','package']);
  assert.equal(f.pending(),false);assert.equal(f.delays.every(delay=>delay===250),true);
  assert.equal(f.loading.at(-1),false);
});
test('an older result cannot overwrite a newer query, even while it is debouncing',async()=>{
  let finish;const f=fixture(request=>request==='old'?new Promise(resolve=>{finish=resolve;}):Promise.resolve(request));
  const old=f.control.now('old');f.control.queue('new');finish('old');await old;
  assert.deepEqual(f.renders,[]);await f.flush();assert.deepEqual(f.renders,['new']);
});
test('stale errors stay silent and current errors remain visible without poisoning later searches',async()=>{
  let reject;const f=fixture(request=>request==='old'?new Promise((_,fail)=>{reject=fail;}):request==='bad'?Promise.reject(new Error('Offline')):Promise.resolve(request));
  const old=f.control.now('old');await f.control.now('new');reject(new Error('Old failure'));await old;
  assert.deepEqual(f.errors,[]);assert.deepEqual(f.renders,['new']);
  await f.control.now('bad');assert.deepEqual(f.errors,['Offline']);await f.control.now('recovered');assert.equal(f.renders.at(-1),'recovered');
});
test('switching drives invalidates the first in-flight update before any rows exist',async()=>{
  let finish;const f=fixture(()=>new Promise(resolve=>{finish=resolve;}));
  f.control.sourceChanged('drive-a');const old=f.control.now('updates');
  assert.deepEqual(f.renders,[]);assert.equal(f.control.sourceChanged('drive-b'),true);
  finish({packages:['old-drive-only']});await old;assert.deepEqual(f.renders,[]);
  assert.equal(f.control.sourceChanged('drive-b'),false);
});
test('duplicate package IDs retain independent folder selections across an update refresh',()=>{
  const f=fixture(async()=>null);
  const first={package_id:'example.app',folder:'First',version:'2'};
  const second={package_id:'example.app',folder:'Second',version:'3'};
  const selected=new Map([first,second].map(item=>[f.key(item.package_id,item.folder),item]));
  assert.equal(selected.size,2);
  assert.equal(selected.get(f.key('example.app','First')).version,'2');
  assert.equal(selected.get(f.key('example.app','Second')).version,'3');
  assert.equal(selected.get(f.key('example.app',undefined)),undefined);
  assert.equal(f.key('example.app',undefined),f.key('example.app',''));
});
test('small downloads remain readable and package counts use normal plurals',()=>{
  const {helpers}=fixture(async()=>null);
  assert.equal(helpers.bytes(451),'451 B');assert.equal(helpers.bytes(1024),'1 KiB');assert.equal(helpers.bytes(1048576),'1 MiB');
  assert.equal(helpers.bytes(undefined),'Unknown size');assert.equal(helpers.bytes(-1),'Unknown size');assert.equal(helpers.bytes(0),'0 B');
  assert.equal(helpers.count(0,'package'),'0 packages');assert.equal(helpers.count(1,'package'),'1 package');assert.equal(helpers.count(2,'package'),'2 packages');
});
