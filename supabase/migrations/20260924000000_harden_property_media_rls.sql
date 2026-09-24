-- A API server-side é a única responsável por inserir, alterar ou remover
-- metadados de mídia. O frontend não deve escrever diretamente nesta tabela.
drop policy if exists "Allow write property_media" on public.property_media;

-- Leituras continuam públicas porque as páginas públicas consultam os
-- metadados da galeria. Operações de escrita ficam restritas ao service_role.
revoke insert, update, delete on public.property_media from anon, authenticated;
grant select on public.property_media to anon, authenticated;
