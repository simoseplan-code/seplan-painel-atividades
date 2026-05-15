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
