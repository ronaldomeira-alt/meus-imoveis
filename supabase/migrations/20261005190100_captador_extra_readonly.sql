begin;
update public.agent_bots set tools=array(select distinct t from unnest(tools||array['searchNewProperties']) t) where account_id='52716edc-399e-4d4c-9788-0d6b04c0031f'::uuid and slug='captador' and kind='captador';
commit;
