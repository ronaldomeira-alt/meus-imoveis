-- Administrative upgrade of the built-in catalog for previously registered bots.
-- Runtime bots cannot grant themselves tools. Captador and custom bots are untouched.
begin;
update public.agent_bots b
set tools = array(select distinct tool from unnest(b.tools || case b.kind
  when 'gestor' then array['getMarketingStatus','configureAgentBehavior','rollbackAgentConfiguration','getAgentConversationContext','getInstagramContext']
  when 'marketing' then array['updateMarketingPreferences','getInstagramContext']
  when 'sentinela' then array['getMarketingStatus','acknowledgeOrResolveIncident']
  else array[]::text[] end) tool)
where b.account_id = '52716edc-399e-4d4c-9788-0d6b04c0031f'::uuid
  and ((b.slug = 'gestor' and b.kind = 'gestor')
   or (b.slug = 'marketing' and b.kind = 'marketing')
   or (b.slug = 'sentinela' and b.kind = 'sentinela'));

commit;
