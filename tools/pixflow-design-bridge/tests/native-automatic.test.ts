import {test} from 'node:test';
import assert from 'node:assert/strict';
import {automaticConnection} from '../native-messaging/src/automatic-connection';
function fixture() {
  const activated: string[] = [], requests: any[] = [];
  let granted = false, directSites: string[] = [];
  const chrome = {storage: {local: {get: async () => ({directSites})}}, permissions: {
    contains: async () => granted,
    addHostAccessRequest: async (request: any) => {requests.push(request);},
  }, tabs: {query: async () => [{id: 42}]}};
  const reconcile = automaticConnection(chrome, async () => ({sites: ['https://customer.example:8443']}), async origin => {activated.push(origin);});
  return {reconcile, activated, requests, grant: () => {granted = true;}, direct: () => {directSites = ['https://customer.example:8443'];}};
}
test('first visit presents scoped Chrome approval and approval connects without a second action', async () => {
  const f = fixture(); await f.reconcile();
  assert.deepEqual(f.activated, []);
  assert.deepEqual(f.requests, [{tabId: 42, pattern: 'https://customer.example/*'}]);
  f.grant(); await f.reconcile();
  assert.deepEqual(f.activated, ['https://customer.example:8443']);
});
test('explicit direct preference survives automatic navigation and startup checks', async () => {
  const f = fixture(); f.direct(); f.grant(); await f.reconcile();
  assert.deepEqual(f.activated, []); assert.deepEqual(f.requests, []);
});
test('repeated navigation events do not repeatedly request site access', async () => {
  const f = fixture(); await f.reconcile(); await f.reconcile(); await f.reconcile();
  assert.equal(f.requests.length, 1);
  assert.equal(f.activated.length, 0);
});
test('older Chrome without host-access requests leaves the explicit popup fallback available', async () => {
  let activated = false;
  const chrome = {storage: {local: {get: async () => ({})}}, permissions: {contains: async () => false}};
  await automaticConnection(chrome, async () => ({sites: ['https://customer.example']}), async () => {activated = true;})();
  assert.equal(activated, false);
});
test('failed pairing never prompts or admits a site; concurrent checks share discovery', async () => {
  let calls = 0;
  const reconcile = automaticConnection({}, async () => {calls++; throw Error('unpaired');}, async () => {throw Error('must not activate');});
  await Promise.allSettled([reconcile(), reconcile()]); assert.equal(calls, 1);
});
test('permission approval during discovery is reconciled again rather than dropped', async () => {
  let release!: () => void, calls = 0;
  const chrome = {storage: {local: {get: async () => ({})}}};
  const reconcile = automaticConnection(chrome, async () => {
    if (++calls === 1) await new Promise<void>(resolve => {release = resolve;});
    return {sites: []};
  }, async () => {});
  const first = reconcile(); const second = reconcile(); release();
  await Promise.all([first, second]); assert.equal(calls, 2);
});
