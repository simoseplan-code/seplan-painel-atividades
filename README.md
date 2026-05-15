# Painel SEPLAN · Bitrix24

Painel interativo de **Tarefas** e **Projetos** do Bitrix24, com atualização automática a cada 30 minutos via GitHub Actions e publicação no GitHub Pages.

## Como funciona

```
┌──────────────┐    cron 30min     ┌────────────────┐    commit     ┌─────────────────┐
│  Bitrix24    │ ◄──── webhook ────│ GitHub Actions │ ──── push ──► │  data.json      │
│  (API REST)  │                   │  Node script   │               │  (no repo)      │
└──────────────┘                   └────────────────┘               └────────┬────────┘
                                                                             │ fetch
                                                                             ▼
                                                                    ┌─────────────────┐
                                                                    │  GitHub Pages   │
                                                                    │  index.html     │
                                                                    └─────────────────┘
```

O HTML é estático, mas o `data.json` é regenerado a cada 30 min pelo workflow. Como o `data.json` mora no mesmo origin que o `index.html`, **não há problema de CORS**.

## Passo a passo

### 1. Criar o repositório

1. No GitHub: **New repository** → pode ser privado.
2. Faça upload destes 4 arquivos preservando a estrutura:

   ```
   .
   ├── .github/
   │   └── workflows/
   │       └── update-data.yml
   ├── scripts/
   │   └── fetch-bitrix.js
   ├── index.html
   └── README.md
   ```

### 2. Cadastrar o webhook como Secret

⚠️ **Não coloque a URL do webhook em nenhum arquivo do repo.** Ela vai como Secret:

1. No repositório: **Settings → Secrets and variables → Actions → New repository secret**
2. Name: `BITRIX_WEBHOOK`
3. Value: `https://seplan.bitrix24.com.br/rest/9/SEU_TOKEN_AQUI/`
   *(com a barra final, sem método específico)*
4. Salvar.

### 3. Rodar o workflow pela primeira vez

1. Aba **Actions** do repositório → habilite os workflows se for solicitado.
2. Selecione **Atualizar dados Bitrix24** → **Run workflow** → Run.
3. Aguarde ~30s. Deve aparecer ✅ verde.
4. O arquivo `data.json` deve ter sido criado/atualizado no repositório.

### 4. Publicar o painel

1. **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / `/ (root)` → Save.
4. Aguarde 1–2 min. Sua URL fica algo como `https://seu-usuario.github.io/nome-do-repo/`.

Pronto. O painel carrega o `data.json` e renderiza tudo no navegador.

## O que o painel mostra

| Aba | Conteúdo |
|---|---|
| **Visão geral** | KPIs gerais + 3 gráficos (status, prazo, top projetos) |
| **Por setor** | Tabela com tarefas agregadas por departamento dos responsáveis |
| **Por responsável** | Lista de pessoas com totais, filtro de busca e status |
| **Por status** | Gráficos de status, prioridade × status, e tabela detalhada |
| **Por prazo** | Cards de atrasadas/hoje/semana/futuras + lista das atrasadas |
| **Projetos** | Todos os grupos (`sonet_group`) com progresso |
| **Tarefas** | Tabela completa com busca por título/responsável/projeto/status |

## Personalização

- **Mudar a frequência**: edite o `cron` em `.github/workflows/update-data.yml`. Note que o GitHub Actions tem latência: cron de 30min pode rodar em 30–60 min reais.
- **Adicionar campos da tarefa**: edite a lista `taskFields` em `scripts/fetch-bitrix.js`.
- **Adicionar Deals do CRM**: o script já tem o helper `callPaginated`. Adicione uma chamada a `crm.deal.list` no `main()`.
- **Personalizar cores/branding**: as variáveis estão no `:root` do CSS no topo do `index.html`.

## Rodando localmente pra testar

```bash
# instalar nada — usa fetch nativo do Node 20+
export BITRIX_WEBHOOK="https://seplan.bitrix24.com.br/rest/9/SEU_TOKEN/"
node scripts/fetch-bitrix.js

# servir o HTML
python3 -m http.server 8000
# abra http://localhost:8000
```

## Segurança · revogar e regenerar o webhook

O token do webhook compartilhado nesta conversa (`0abd87o80yjyhoy3`) deve ser **revogado** após esta entrega, e um novo gerado pra ser usado só no Secret do GitHub:

1. Bitrix24 → menu **Aplicativos → Webhooks** (ou `/devops/`).
2. Encontre o webhook atual, **revogue/exclua**.
3. **Crie um novo** com permissões mínimas: `tasks`, `sonet_group`, `user`, `department`.
4. Copie a nova URL para o Secret `BITRIX_WEBHOOK` no GitHub.

## Permissões do webhook (mínimas)

- `user` — buscar usuários e departamentos vinculados
- `department` — listar setores
- `sonet_group` — listar projetos/grupos
- `tasks` — listar tarefas

## Troubleshooting

- **"Sem dados ainda" no painel** → o workflow ainda não rodou. Rode manualmente em Actions.
- **Action falha com "Bitrix erro: ACCESS_DENIED"** → faltou permissão no webhook. Edite o webhook no Bitrix24 e marque os escopos acima.
- **Setores vazios** → seu webhook não tem permissão `department`, ou os usuários não têm departamento atribuído no Bitrix24.
- **`data.json` muito grande** → adicione filtros no `tasks.task.list` (ex: só não-concluídas, só dos últimos 90 dias). Edite `scripts/fetch-bitrix.js`.
