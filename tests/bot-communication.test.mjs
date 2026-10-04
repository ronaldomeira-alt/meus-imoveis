import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BOT_COMMUNICATION_POLICY, friendlyComponent, humanIncident, humanSourceSummary, technicalDetailsRequested, communicationSafe, humanFallback} from '../supabase/functions/_shared/central-bots/communication.js';
import {groundedReply} from '../supabase/functions/_shared/central-bots/ai-provider.js';

const missing={id:'ffa9fbfe-ff09-4648-a264-75819081f7e3',component:'captador_telemetry',observed:'Nenhuma rodada concluída após o horário esperado.',impact:'medium',dossier:{evidence:{expected_slot:'2026-10-04T22:00:00Z'},hypothesis:'A evidência exige investigação; a causa raiz ainda não está confirmada.'}};
const sources=[{tool:'getIncidentDetails',data:{incident:missing}}];

test('Captador: missing completion explains expected time, possible impact and unknown functioning without inventing a delay',()=>{
  const text=humanIncident(missing);
  assert.match(text,/Bot Captador/);assert.match(text,/19:00/);assert.match(text,/04\/10/);
  assert.match(text,/não confirma que ele travou/);assert.match(text,/Se a busca estiver atrasada/);
  assert.match(text,/não consigo confirmar se houve atraso real/);assert.match(text,/não consegui confirmar a causa/);
  assert.equal(communicationSafe(text,sources),true);
  assert.equal(communicationSafe('O processo ficou travado. O sistema continua funcionando normalmente.',sources),false);
  assert.equal(communicationSafe('Não consegui confirmar a causa. O processo ficou travado.',sources),false);
  assert.equal(communicationSafe('O processo ficou travado.',sources,true),false);
});
test('Known delay retains exact observed facts; critical stopped function states urgency without reassurance',()=>{
  const delay=humanIncident({...missing,observed:'A busca terminou às 20h, três horas depois do horário previsto.'});
  assert.match(delay,/terminou às 20h, três horas/);
  const critical=humanIncident({component:'app_http',observed:'O acesso ao sistema parou; a página não abre.',impact:'critical'});
  assert.match(critical,/acesso ao sistema parou/);assert.match(critical,/atenção agora/);
  assert.doesNotMatch(critical,/não parou|funcionando normalmente/);
});
test('Unknown cause admitted; only a suspicion stays explicitly a hypothesis',()=>{
  assert.match(humanIncident(missing),/não consegui confirmar a causa/);
  const hypothesis=humanIncident({...missing,dossier:{hypothesis:'Há suspeita de interrupção na conexão durante a busca.'}});
  assert.match(hypothesis,/suspeita/);assert.match(hypothesis,/hipótese, ainda sem confirmação/);
  assert.equal(communicationSafe('O problema aconteceu porque o serviço ficou indisponível.',sources),false);
});
test('Raw JSON and identifiers preserved in evidence but rejected in main reply, including numeric fallback',()=>{
  const before=JSON.stringify(sources);
  for (const text of ['component: captador_telemetry','{"source":"agent_incidents"}',missing.id,'A telemetria falhou.','Verifique CPU e RPC.']) assert.equal(communicationSafe(text,sources),false,text);
  const human=humanFallback(sources);
  assert.doesNotMatch(human,/agent_incidents|captador_telemetry|ffa9fbfe|telemetria|CPU|RPC/);
  assert.equal(JSON.stringify(sources),before);
  assert.equal(groundedReply('Atraso de 999999 horas.',sources),human);
});
test('Explicit technical request is allowed; complaint or refusal of jargon is not',()=>{
  assert.equal(technicalDetailsRequested('me mostre os detalhes técnicos'),true);
  assert.equal(communicationSafe(JSON.stringify(missing),sources,true),true);
  for(const prompt of ['não quero detalhes técnicos','eu não entendo sua linguagem técnica, explique para um leigo','seja menos técnico','Explique o que aconteceu']) assert.equal(technicalDetailsRequested(prompt),false,prompt);
});
test('Official names, unknown components, nested inspections and no-incident sources are handled without inventing a bot',()=>{
  for(const key of ['captador_worker','olx_collector','capture_agent'])assert.equal(friendlyComponent(key),'Bot Captador');
  assert.equal(friendlyComponent('marketing_agent'),'Bot de Marketing');
  assert.equal(friendlyComponent('sentinel_agent'),'Bot Sentinela');
  assert.equal(friendlyComponent('manager_agent'),'Bot Gestor');
  assert.equal(friendlyComponent('future_worker'),'Uma função do sistema');
  assert.match(humanSourceSummary({inspection:{result:{checks:[{...missing,status:'fail'}]}}}),/Bot Captador/);
  assert.match(humanSourceSummary({incidents:[]}),/não confirma o funcionamento/);
  assert.match(BOT_COMMUNICATION_POLICY,/personalizados e futuros/);
});
