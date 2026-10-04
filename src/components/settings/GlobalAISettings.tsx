import { useEffect, useState } from 'react';
import { requestSystemAI, type SystemAIConfig, type SystemAIProvider } from '../../lib/system-ai';

export function GlobalAISettings() {
  const [config,setConfig]=useState<SystemAIConfig|null>(null);
  const [savedProvider,setSavedProvider]=useState<SystemAIProvider|null>(null);
  const [key,setKey]=useState('');
  const [busy,setBusy]=useState(true);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{let active=true;requestSystemAI<SystemAIConfig>({action:'config'}).then(value=>{if(active){setConfig(value);setSavedProvider(value.provider);}}).catch(error=>{if(active)setError(error.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[]);
  async function act(action:'save'|'test') {
    if(!config)return;
    setBusy(true);setMessage('');setError('');
    try {
      if(action==='save') {
        const value=await requestSystemAI<SystemAIConfig>({action,config:{provider:config.provider,model:config.model,transcription_model:config.transcription_model,enabled:config.enabled,...(key.trim()?{api_key:key.trim()}: {})}});
        setConfig(value);setSavedProvider(value.provider);setKey('');setMessage('Configuração salva para todo o sistema.');
        for(const name of ['meus_imoveis_groq_key','meus_imoveis_gemini_key','meus_imoveis_ai_provider'])localStorage.removeItem(name);
      } else {const value=await requestSystemAI<{message:string}>({action});setMessage(value.message);}
    } catch(error) {setError(error instanceof Error?error.message:'Não foi possível acessar a IA.');}
    finally {setBusy(false);}
  }
  const disabled=busy||!config?.can_manage;
  const field='w-full rounded-xl border border-line-subtle bg-surface-1 px-3 py-2 text-ink-primary';
  return <section className="panel-surface p-4 sm:p-5 space-y-4 mb-6">
    <h3 className="text-base font-bold text-ink-primary">Inteligência Artificial do Sistema</h3>
    <p className="text-sm text-ink-secondary">Uma configuração para o CRM, os bots, o cadastro de imóveis, as legendas e as transcrições. Alterações valem em todos os dispositivos.</p>
    {busy&&!config&&<p role="status">Carregando configuração...</p>}
    {config&&<>
      <p className="text-sm text-ink-secondary">{config.configured&&config.provider===savedProvider?'Chave configurada no servidor.':'A IA precisa de uma chave.'} {config.enabled?'IA ativada.':'IA desativada.'}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="space-y-1 text-sm">Provedor<select aria-label="Provedor" className={field} disabled={disabled} value={config.provider} onChange={e=>{const provider=e.target.value as SystemAIProvider;const entry=config.catalog[provider];setKey('');setMessage('');setConfig({...config,provider,model:entry.models[0],transcription_model:entry.audioModels[0]});}}>{Object.keys(config.catalog).map(name=><option key={name} value={name}>{name==='deepinfra'?'DeepInfra':name==='groq'?'Groq':name==='gemini'?'Google Gemini':'OpenAI'}</option>)}</select></label>
        <label className="space-y-1 text-sm">Modelo de texto<select aria-label="Modelo de texto" className={field} disabled={disabled} value={config.model} onChange={e=>setConfig({...config,model:e.target.value})}>{config.catalog[config.provider].models.map(model=><option key={model}>{model}</option>)}</select></label>
        <label className="space-y-1 text-sm">Modelo de transcrição<select aria-label="Modelo de transcrição" className={field} disabled={disabled} value={config.transcription_model} onChange={e=>setConfig({...config,transcription_model:e.target.value})}>{config.catalog[config.provider].audioModels.map(model=><option key={model}>{model}</option>)}</select></label>
        <label className="space-y-1 text-sm">Chave de API<input aria-label="Chave de API" type="password" autoComplete="new-password" className={field} disabled={disabled} value={key} onChange={e=>setKey(e.target.value)} placeholder={config.provider===savedProvider?"Deixe vazio para manter a chave atual":"Informe a chave deste provedor"} /></label>
      </div>
      <p className="text-xs text-ink-secondary">O áudio usa um modelo de transcrição do mesmo provedor. A chave fica protegida no servidor.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.enabled} disabled={disabled} onChange={e=>setConfig({...config,enabled:e.target.checked})}/>Ativar IA em todo o sistema</label>
      <div className="flex flex-wrap gap-3"><button type="button" disabled={disabled} onClick={()=>act('save')} className="rounded-xl bg-accent px-4 py-2 text-white disabled:opacity-50">Salvar configuração</button><button type="button" disabled={disabled||config.provider!==savedProvider||!config.configured||!config.enabled} onClick={()=>act('test')} className="rounded-xl border border-line-subtle px-4 py-2 disabled:opacity-50">Testar configuração salva</button></div>
    </>}
    {message&&<p role="status" className="text-sm text-status-success">{message}</p>}
    {error&&<p role="alert" className="text-sm text-status-danger">{error}</p>}
  </section>;
}
