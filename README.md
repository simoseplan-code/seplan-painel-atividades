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
