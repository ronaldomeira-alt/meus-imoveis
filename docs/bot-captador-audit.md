# Relatório de Auditoria e Arquitetura — Bot Captador
**Projeto:** Meus Imóveis  
**Data:** 01/10/2026  
**Status:** Fase 0 Concluída — Pronto para Implementação em Fases  

---

## 1. Resumo Executivo da Auditoria

O projeto **Meus Imóveis** é um ecossistema SPA moderno e resiliente construído com:
- **Frontend:** React 19, Vite 8, Tailwind CSS v3.4, Lucide React, Framer Motion.
- **Backend / Persistência:** Supabase PostgreSQL com Row Level Security (RLS), multi-tenant baseado em `account_id` via `profiles`, Cloudflare R2 para mídias, Vercel Serverless Functions para rotas de borda (`api/`).
- **Autenticação:** Supabase Auth restrito ao corretor administrador (`ronaldomeira@gmail.com`).
- **Padrão de Dados de Imóveis:** `inventory_properties` (armazenando JSONB completo do imóvel), `inventory_property_tombstones` para exclusões permanentes, e `property_match_projections` para inteligência de leads e cruzamento de preferências.
- **Importação por URL:** Fluxo consolidado em `AddPropertyPage.tsx` com extração assistida por IA (Groq / Gemini) e validação de 5 campos mandatórios (`validateRequiredPropertyFields`).

---

## 2. Diagnóstico Ponto a Ponto (Seção 87)

### A. O que já existe e será reutilizado
1. **Formulário e Validação de Imóveis:** `AddPropertyPage.tsx` e `validateRequiredPropertyFields` — nenhuma tela de cadastro duplicada será criada.
2. **Motor de IA / Extração:** `ai-provider.ts` e `gemini.ts` / `groq.ts` para normalizar dados textuais sem custo de novas infraestruturas.
3. **Mecanismo de Tombstones e Idempotência:** Padrão PostgreSQL testado em `inventory_property_tombstones` e advisory locks (`pg_advisory_xact_lock`).
4. **Sistema de Notificações:** `NotificationDrawer.tsx` e `NotificationItem` já integrados no `Header.tsx` e no estado do `App.tsx`.
5. **Design System:** Classes utilitárias (`panel-surface`, `modal-surface`, `btn-primary`, tipografia Plus Jakarta Sans, paleta de cores escura/clara).
6. **Autenticação:** Sessão Supabase validada via `useAuth()` e `current_inventory_account_id()`.

### B. O que precisa ser criado
1. **Módulo de Navegação:** Seção `'bot-captador'` na barra lateral `Sidebar.tsx`, com atalho e subseções (Painel, Captações, Configurar).
2. **Schema do Banco (Supabase):** Tabelas `bot_settings`, `bot_campaigns`, `bot_message_templates`, `bot_captures`, `bot_capture_tombstones`, `bot_execution_rounds`, `bot_locks`.
3. **Motor Core do Bot Captador (`src/lib/bot-captador/`):**
   - Normalizador e canonicalizador de URLs e fingerprints.
   - Motor de deduplicação em 4 camadas (ID externo, URL canonical, Fingerprint, Anunciante).
   - Validador do filtro "Particular" (rejeição automática de corretores e imobiliárias).
   - Gerenciador de fila FIFO com limite rígido por rodada (default: 10).
   - Seletor pseudoaleatório de mensagens previamente cadastradas (sem texto inventado por IA).
4. **Interface Visual (Tabs):**
   - **Painel:** Cards de métricas operacionais, gráfico de linha (7d, 30d, 90d), indicador de saúde do bot, log das últimas rodadas, ações "Rodar Agora" e "Testar Filtros".
   - **Captações:** Listagem operacional com filtros por status, modo mobile card com safe-areas, botões "Ver resposta", "Importar" e "Arquivar".
   - **Configurar Bot Captador:** Toggle Bot Ativo/Pausado, abas independentes Venda e Locação, configurações de horários (1x ou 2x/dia), limite por rodada e CRUD de mensagens com métricas por mensagem.
5. **Conexão com "Adicionar Imóvel":** Passagem de URL captada via query string/estado (`/adicionar-imovel?import_url=...&capture_id=...`) e marcação automática como `IMPORTED` no momento em que o imóvel é salvo no estoque.

### C. Tabelas e Migrations Propostas
- Arquivo: `supabase/migrations/20261001000000_bot_captador_core.sql`
- **Tabelas:**
  - `bot_settings`: Parâmetros gerais da conta (status geral, retenção 40 dias).
  - `bot_campaigns`: Campanhas Venda e Locação com filtros isolados (preços, bairros, quartos, área, horários, limite).
  - `bot_message_templates`: Templates pré-aprovados para abordagem.
  - `bot_captures`: Fila e histórico operacional com status estritos.
  - `bot_capture_tombstones`: Impede abordagem duplicada permanentemente.
  - `bot_execution_rounds`: Registro auditável de cada rodada (analisados, novos, elegíveis, abordados, duplicados, erros).
- **RPCs Seguras:**
  - `reserve_bot_capture_candidates(...)`: Usa `FOR UPDATE SKIP LOCKED` e `pg_advisory_xact_lock` para isolamento total contra concorrência.
  - `confirm_bot_capture_contacted(...)`: Transição atômica e criação de tombstone.
  - `mark_bot_capture_imported(...)`: Vincula captação ao `property_id` recém-criado.

### D. Componentes e Rotas Propostas
- Rota: `/bot-captador`
- Componente raiz: `src/components/bot-captador/BotCaptadorView.tsx`
  - Subcomponente: `PainelTab.tsx`
  - Subcomponente: `CaptacoesTab.tsx`
  - Subcomponente: `ConfiguracoesTab.tsx`
  - Componente de Gráfico: `CaptureTrendChart.tsx` (gráfico de linha minimalista SVG/CSS)
  - Modais de Confirmação Cirúrgicos (Pausar Bot, Excluir Mensagem).

### E. Scheduler & Orquestrador
- Endpoint Serverless em `api/bot-captador.js` para gerenciar rodadas acionadas por agendamento ou pelo botão "Rodar Agora".
- Validação de autorização via JWT de admin ou cabeçalho secreto seguro (`x-cron-secret`).

### F. Executor
- Arquitetura isolada de Provider (`src/lib/bot-captador/providers/`).
- O motor não depende de seletores espalhados.
- Para ambiente Windows sem custo: executor local ou script de rodada compatível que atua sob demanda, integrando-se via REST com o Supabase.
- Modo de simulação (`TESTAR FILTROS`) roda diretamente no app/backend sem gerar efeitos colaterais.

### G. Sessão Autorizada & Segurança
- **Nenhuma senha de portais ou redes é salva no banco ou frontend.**
- Se a sessão do anunciante/portal cair ou exigir verificação humana, o executor marca o estado do Bot como **Atenção — Login Necessário** e interrompe a execução com notificação no sistema.

### H. Detecção de Respostas
- Detecção automatizada por verificação de status na plataforma durante as rodadas ou fallback com botão direto "Verificar Respostas" e link "Ver Resposta" para o corretor assumir imediatamente no portal.

### I. Conexão do "Importar" ao Estoque
- O botão "Importar" direciona para `/adicionar-imovel` com o link já preenchido.
- O corretor dispara a extração existente, confere os dados, complementa o que for necessário e salva.
- A função de salvamento atualiza o registro correspondente em `bot_captures` para `IMPORTED`, registrando `imported_property_id` e elevando a métrica de conversão.

### J. Limitações Técnicas
- Portais externos não possuem APIs abertas de prospecção gratuita; a automação respeita estritamente a política de segurança: qualquer CAPTCHA ou desafio interrompe imediatamente a rodada sem tentativas de evasão.

### K. Custo
- **Custo Adicional Zero.** Toda a solução utiliza a infraestrutura existente de banco (Supabase), serverless (Vercel) e processamento local no Windows.

---

## 3. Plano de Implementação em Fases
- **FASE 1:** Banco + Migration Supabase + RLS + Tipos TypeScript
- **FASE 2:** Módulo UI Base (Navegação Sidebar, App.tsx, Estrutura das 3 Tabs)
- **FASE 3:** Telas de Configurações (Venda, Locação, Horários, Mensagens com métricas)
- **FASE 4:** Motor de Filtros, Fila FIFO, Deduplicação em 4 Níveis e Tombstones
- **FASE 5:** Modo "Testar Filtros" (Simulação sem envio)
- **FASE 6:** Listagem de Captações (Desktop + Mobile Cards + Ações)
- **FASE 7:** Painel & Gráfico de Linha Operacional
- **FASE 8:** Integração de Importação (`Captação` → `Adicionar Imóvel` → `Estoque`)
- **FASE 9:** API / Scheduler / Executor e Detecção de Respostas
- **FASE 10:** Testes de Idempotência, Segurança, PWA e Build Final
