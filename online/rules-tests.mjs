import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {readFile} from 'node:fs/promises';
const env=await initializeTestEnvironment({projectId:'demo-word-shift',database:{host:'127.0.0.1',port:9000,rules:await readFile(new URL('../firebase/compatible.rules.json',import.meta.url),'utf8')}});
try {
  const host=env.authenticatedContext('tv-host').database(),alice=env.authenticatedContext('alice').database(),bob=env.authenticatedContext('bob').database();
  const root='rooms/WABCDE';
  const member=name=>({name,avatar:'🦊',colour:'join-1',team:{_alive:false},audience:false});
  const now=Date.now();
  await assertSucceeds(host.ref(root).set({host:'tv-host',createdAt:now,expiresAt:now+7200000,state:{game:'word-shift',code:'ABCDE',phase:'lobby'},inputs:{'tv-host':{id:'host',type:'word-shift/checkpoint',value:{controller:{id:'tv-tab',heartbeatAt:now},checkpoint:{owner:'tv-tab',room:{code:'ABCDE'},ledger:{}}}}}}));
  await assertSucceeds(alice.ref(root+'/state').get());
  await assertFails(alice.ref(root+'/state').set({phase:'complete'}));
  await assertFails(alice.ref(root+'/host').set('alice'));
  await assertFails(alice.ref(root+'/inputs/tv-host/value/checkpoint').get());
  await assertFails(alice.ref(root+'/inputs/tv-host/value/controller').set({id:'stolen',heartbeatAt:now}));
  await assertSucceeds(alice.ref(root+'/members/alice').set(member('Alice')));
  await assertSucceeds(bob.ref(root+'/members/bob').set(member('Bob')));
  await assertSucceeds(alice.ref(root+'/members/alice/team/alice-tab').set(true));
  await assertFails(bob.ref(root+'/members/alice/team/alice-tab').remove());
  await assertSucceeds(alice.ref(root+'/inputs/alice').set({id:'move-1',type:'word-shift/input',value:{action:'move',version:2,word:'dots'}}));
  await assertSucceeds(host.ref(root+'/inputs/alice').get());
  await assertFails(bob.ref(root+'/inputs/alice').get());
  await assertFails(bob.ref(root+'/inputs/alice').set({id:'spoof',type:'word-shift/input',value:{word:'cats'}}));
  await assertSucceeds(host.ref(root+'/feedback/alice').set({id:'move-1',status:200}));
  await assertSucceeds(alice.ref(root+'/feedback/alice').get());
  await assertFails(bob.ref(root+'/feedback/alice').get());
  await assertFails(env.unauthenticatedContext().database().ref(root+'/state').get());
  // Ordinary SA Trivia-format records stay unchanged by WORD SHIFT writes.
  const other=env.authenticatedContext('sa-host').database();
  const original={host:'sa-host',createdAt:now,expiresAt:now+7200000,state:{game:'sa-trivia',phase:'lobby'}};
  await assertSucceeds(other.ref('rooms/ABC234').set(original));
  await host.ref(root+'/state').set({game:'word-shift',phase:'playing'});
  assert.deepEqual((await other.ref('rooms/ABC234/state').get()).val(),original.state);
  await host.ref(root).remove();await other.ref('rooms/ABC234').remove();
  console.log('PASS: existing Firebase rules isolate host authority, private checkpoints/inputs/feedback, and existing SA Trivia rooms.');
}finally{await env.cleanup();}
