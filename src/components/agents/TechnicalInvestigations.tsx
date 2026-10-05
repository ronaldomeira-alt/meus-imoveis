import {useCallback,useEffect,useState} from 'react';
import {centralRequest,type AgentIncident} from '../../lib/central-bots';
import {friendlyComponent} from '../../../supabase/functions/_shared/central-bots/communication.js';

type Job={id:string;incident_id:string;status:string;progress:string;created_at:string;result?:{summary:string;assessment?:string;findings?:{file:string;evidence:string}[];next_steps?:string[];proposed_change?:string;limitations?:string;code_revision?:string}};
type Runner={id:string;label:string;enabled:boolean;last_seen_at:string|null;state:string};
type Data={enabled:boolean;jobs:Job[];runners:Runner[]};
const labels:Record<string,string>={queued:'Na fila',running:'Investigando',completed:'Investigação concluída',needs_access:'Precisa de acesso',failed:'Não concluída',cancelled:'Cancelada'};

export function TechnicalInvestigations({incidents}:{incidents:AgentIncident[]}) {
  const [data,setData]=useState<Data|null>(null),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const refresh=useCallback(async(signal?:AbortSignal)=>{
    const result=await centralRequest<Data>({action:'technical',operation:'list'},signal);if(!signal?.aborted){setData(result);setError('');}
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    const load=()=>refresh(controller.signal).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Não consegui consultar as investigações.');});
    void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},10000);
    return()=>{controller.abort();clearInterval(timer);};
  },[refresh]);
  const act=async(operation:string,extra:Record<string,unknown>)=>{
    setBusy(true);setError('');
    try{await centralRequest({action:'technical',operation,...extra});await refresh();}catch(e){setError(e instanceof Error?e.message:'Não consegui concluir o pedido.');}finally{setBusy(false);}
  };
  const runner=data?.runners.find(r=>r.enabled),online=runner?.last_seen_at && Date.now()-Date.parse(runner.last_seen_at)<90000;
  const incidentId=incidents.some(i=>i.id===selected)?selected:incidents[0]?.id;
  return <div className="agent-records">
    <h3>Investigar com Antigravity</h3>
    <p>O Antigravity analisa uma cópia do código e as evidências desta ocorrência. Você recebe a conclusão e uma proposta de correção. Iniciar a investigação autoriza esse envio; nenhuma alteração é aplicada ao sistema.</p>
    {error && <p role="alert" className="agent-error">{error}</p>}
    {!data && !error && <p role="status">Conferindo a conexão...</p>}
    {data && !data.enabled && <p>A integração técnica está desativada.</p>}
    {data?.enabled && <>
      <p role="status">{!runner?'Nenhum computador conectado.':!online?'Computador desconectado. Os pedidos aguardam a conexão.':runner.state==='needs_access'?'O Antigravity ainda não passou na verificação de acesso e permissões.':runner.state==='error'?'A conexão encontrou um problema.':runner.state==='busy'?'Antigravity trabalhando.':runner.state==='starting'?'Verificando a conexão do Antigravity...':'Antigravity conectado e disponível.'}</p>
      {incidents.length ? <div className="agent-actions" style={{flexWrap:'wrap'}}>
        <label>Ocorrência <select aria-label="Ocorrência para investigar" value={incidentId || ''} onChange={e=>setSelected(e.target.value)} style={{maxWidth:'100%'}}>
          {incidents.map(i=><option key={i.id} value={i.id}>{friendlyComponent(i.component)} · {new Date(i.last_seen_at).toLocaleDateString('pt-BR')}</option>)}
        </select></label>
        <button className="agent-command agent-primary" disabled={busy || !runner || !online || !['ready','busy'].includes(runner.state) || data.jobs.some(j=>j.incident_id===incidentId && ['queued','running'].includes(j.status))} onClick={()=>void act('create',{incident_id:incidentId,request_id:crypto.randomUUID()})}>Investigar com Antigravity</button>
      </div>:<p>Nenhuma ocorrência disponível para investigar.</p>}
      {data.jobs.length===0 && <p>Ainda não há investigações solicitadas.</p>}
      {data.jobs.map(job=><article className="agent-incident" key={job.id}>
        <h3>{labels[job.status] || 'Investigação'}</h3><small>{new Date(job.created_at).toLocaleString('pt-BR')}</small><p>{job.progress}</p>
        {job.result?.summary && <p style={{whiteSpace:'pre-line'}}>{job.result.summary}</p>}
        {job.result?.assessment && <p>{({confirmed:'Conclusão apoiada nas evidências apresentadas.',hypothesis:'A conclusão ainda é uma hipótese.',unknown:'A causa ainda não foi identificada.'})[job.result.assessment]}</p>}
        {!!job.result?.next_steps?.length && <ul>{job.result?.next_steps?.map((step,i)=><li key={i}>{step}</li>)}</ul>}
        {job.result?.limitations && <p>{job.result.limitations}</p>}
        {job.result?.proposed_change && <details><summary>Proposta de correção — ainda não aplicada</summary><p style={{whiteSpace:'pre-line'}}>{job.result.proposed_change}</p></details>}
        {!!job.result?.findings?.length && <details><summary>Detalhes técnicos e evidências</summary>{job.result.findings.map((finding,i)=><div key={i}><strong>{finding.file}</strong><p style={{whiteSpace:'pre-line'}}>{finding.evidence}</p></div>)}<small>Versão analisada: {job.result.code_revision || 'Não informada'}</small></details>}
        {['queued','running'].includes(job.status) && <button className="agent-command" disabled={busy} onClick={()=>void act('cancel',{job_id:job.id})}>Cancelar investigação</button>}
      </article>)}
    </>}
  </div>;
}
