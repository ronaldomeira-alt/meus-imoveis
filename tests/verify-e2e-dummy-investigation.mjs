import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { runBridge } from '../scripts/technical-bridge-runner.mjs';
import { readFile } from 'node:fs/promises';

const url = process.env.VITE_SUPABASE_URL;
assert.ok(url, 'VITE_SUPABASE_URL is required');

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const auth = createClient(url, process.env.VITE_SUPABASE_ANON_KEY, options);

const config = JSON.parse(await readFile('.marketing-release.local/technical-connection.json', 'utf8'));

console.log('1. Authenticating as user via magic link...');
const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'ronaldomeira@gmail.com' });
if (link.error) throw link.error;

const verified = await auth.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'email' });
if (verified.error) throw verified.error;
const session = verified.data.session;
console.log('   Authenticated successfully. User ID:', session.user.id);

async function crmRequest(body) {
  const res = await fetch(url + '/functions/v1/central-bots', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://ronaldomeira.com.br',
      Authorization: 'Bearer ' + session.access_token,
      apikey: process.env.VITE_SUPABASE_ANON_KEY
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CRM request failed (${res.status}): ${text}`);
  }
  return res.json();
}

console.log('2. Querying CRM technical panel...');
const initialPanel = await crmRequest({ action: 'technical', operation: 'list' });
console.log('   Panel enabled:', initialPanel.enabled);
console.log('   Runners:', initialPanel.runners.map(r => ({ id: r.id, label: r.label, state: r.state, enabled: r.enabled })));

const activeRunner = initialPanel.runners.find(r => r.enabled);
assert.ok(activeRunner, 'Active runner must exist');

// 3. Insert isolated dummy test incident
const dummyIncidentId = crypto.randomUUID();
console.log('3. Inserting dummy test incident:', dummyIncidentId);
const dummyIncident = {
  id: dummyIncidentId,
  account_id: '52716edc-399e-4d4c-9788-0d6b04c0031f',
  bot_id: 'fe4e93b6-13f8-467a-837d-2e48f9fc95f3',
  component: 'captador_telemetry',
  fingerprint: 'dummy-test-fingerprint-' + Date.now(),
  impact: 'low',
  confidence: 0.9,
  expected: 'Rodada teste de verificação automatizada.',
  observed: 'Simulação de ocorrência para validação da investigação técnica.',
  last_seen_at: new Date().toISOString(),
  dossier: {
    evidence: {
      expected_slot: '2026-10-04T22:00:00Z',
      recent_rounds: []
    }
  }
};

const insertRes = await admin.from('agent_incidents').insert(dummyIncident);
if (insertRes.error) throw insertRes.error;
console.log('   Dummy incident inserted.');

let createdJobId = null;
try {
  // 4. Request investigation via CRM
  console.log('4. Requesting investigation from CRM for dummy incident...');
  const requestId = crypto.randomUUID();
  const createRes = await crmRequest({
    action: 'technical',
    operation: 'create',
    incident_id: dummyIncidentId,
    request_id: requestId
  });
  console.log('   Investigation created in CRM! Job ID:', createRes.job.id, 'Status:', createRes.job.status);
  createdJobId = createRes.job.id;
  assert.equal(createRes.job.status, 'queued');

  // 5. Run the bridge runner to claim and investigate
  console.log('5. Running connector bridge to claim and process the job...');
  await runBridge(config, { once: true });
  console.log('   Connector bridge finished the run.');

  // 6. Fetch the updated list from CRM
  console.log('6. Checking investigation result in CRM...');
  const updatedPanel = await crmRequest({ action: 'technical', operation: 'list' });
  const finishedJob = updatedPanel.jobs.find(j => j.id === createdJobId);
  assert.ok(finishedJob, 'Finished job must exist in CRM panel');
  console.log('   Job status:', finishedJob.status);
  console.log('   Job progress:', finishedJob.progress);
  console.log('   Job summary:', finishedJob.result?.summary);
  console.log('   Job assessment:', finishedJob.result?.assessment);
  console.log('   Job findings count:', finishedJob.result?.findings?.length);
  console.log('   Correction executed:', finishedJob.result?.correction_executed);
  console.log('   Verification:', finishedJob.result?.verification);
  console.log('   Code revision:', finishedJob.result?.code_revision);

  assert.equal(finishedJob.status, 'completed', 'Job must be marked completed');
  assert.ok(['confirmed', 'hypothesis', 'unknown'].includes(finishedJob.result?.assessment), 'Assessment must be valid');
  assert.ok(finishedJob.result?.summary?.length > 10, 'Summary must be detailed');
  assert.equal(finishedJob.result?.correction_executed, false, 'Correction must never be executed automatically');
  assert.equal(finishedJob.result?.verification, 'not_executed', 'Verification must be not_executed');
  assert.ok(finishedJob.result?.code_revision, 'Code revision must be attached');

  console.log('\n>>> SUCCESS! End-to-end CRM investigation test PASSED completely! <<<\n');
} finally {
  console.log('7. Cleaning up test data...');
  if (createdJobId) {
    await admin.from('agent_technical_jobs').delete().eq('id', createdJobId);
  }
  await admin.from('agent_incidents').delete().eq('id', dummyIncidentId);
  await auth.auth.signOut({ scope: 'local' });
  console.log('   Cleanup done.');
}
