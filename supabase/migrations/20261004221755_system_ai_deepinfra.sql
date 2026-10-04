begin;
-- Extend only the global AI provider catalog; retain data, grants and RLS.
alter table public.system_ai_settings drop constraint system_ai_settings_provider_check;
alter table public.system_ai_settings add constraint system_ai_settings_provider_check
  check (provider in ('groq','openai','gemini','deepinfra'));
commit;
