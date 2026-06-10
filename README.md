# Conduit

> Plataforma de abertura e acompanhamento de chamados para concessionárias de serviços públicos. O cidadão reporta uma ocorrência pelo celular — um vazamento, falta d'água, um problema de esgoto — e acompanha a resolução em tempo real, como quem rastreia uma encomenda. A operação recebe, tria e resolve a partir de um painel único.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Nx](https://img.shields.io/badge/Nx-143055?logo=nx&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-000020?logo=expo&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-F69220?logo=pnpm&logoColor=white)

---

## Visão geral

Concessionárias de saneamento (como as SAAEs) e outras utilities raramente oferecem um canal digital decente para o cidadão registrar uma ocorrência. O contato é por telefone, sem protocolo claro, sem foto, sem localização precisa e sem nenhuma visibilidade de andamento.

O **Conduit** resolve essa lacuna com três peças que conversam entre si:

- um **app mobile** onde qualquer pessoa abre um chamado com foto, localização e categoria, sem precisar de cadastro;
- um **painel administrativo** onde a operação acompanha a fila em tempo real, tria e atualiza o status de cada chamado;
- um **rastreio público** por número de protocolo, com notificações por WhatsApp a cada mudança de status.

A plataforma nasce **multi-tenant**: embora o primeiro cliente seja uma concessionária de água, a arquitetura já isola dados por tenant, abrindo caminho para atender energia, gás e outros serviços sem reescrita.

## Funcionalidades

- **Abertura de chamado sem fricção** — categoria, descrição, foto e geolocalização (GPS + ajuste no mapa). O cidadão não autentica; informa apenas nome e telefone para receber atualizações.
- **Protocolo rastreável** — número não-enumerável e uma timeline de status visível ao cidadão, no estilo "rastreio de entrega".
- **Painel em tempo real** — fila de chamados com busca, ordenação e filtros, atualizada ao vivo via WebSocket quando algo chega ou muda.
- **Notificações por WhatsApp** — a operação é avisada de chamados novos; o cidadão é avisado a cada mudança de status.
- **Multi-tenant desde o dia 1** — isolamento por `tenant_id` em todas as tabelas, com RLS no banco como segunda camada.
- **Pensado para escalar** — cache de leitura com Redis, processamento assíncrono com filas e workers, e tempo real desacoplado.

## Arquitetura

Monorepo gerenciado com **Nx** e **pnpm**, inteiramente em TypeScript.

| Camada | Tecnologia |
|---|---|
| API | NestJS · Prisma · Swagger |
| Banco de dados | PostgreSQL + PostGIS (via Supabase) |
| Armazenamento de imagens | Supabase Storage (bucket privado) |
| Cache | Redis (cache-aside) |
| Mensageria / filas | RabbitMQ + workers |
| Tempo real | WebSocket (socket.io) |
| Notificações | Meta WhatsApp Cloud API |
| App do cidadão | Expo + Expo Router (sem login) |
| Painel administrativo | Refine (React + Vite) |
| Autenticação (admin) | Clerk |
| Tipos & validação compartilhados | biblioteca interna + Zod |

## Estrutura do monorepo

```
conduit-platform/
  packages/
    api/            # NestJS — HTTP, WebSocket e workers do RabbitMQ
    mobile/         # Expo — app do cidadão
    admin/          # Refine — painel da operação
    shared-types/   # tipos de domínio + schemas Zod (compartilhados)
  docker-compose.yml  # Redis + RabbitMQ para desenvolvimento local
  nx.json
  pnpm-workspace.yaml
```

A biblioteca `shared-types` é a fonte única de verdade do modelo de domínio (chamado, status, categorias): muda em um lugar e o TypeScript aponta o que ajustar nos três apps.

## Começando

### Pré-requisitos

- **Node.js 24 LTS** (recomendado para produção)
- **pnpm** (a versão fixada em `packageManager`, no `package.json`)
- **Docker** — para subir Redis e RabbitMQ localmente
- Contas/credenciais: Supabase, Clerk e Meta WhatsApp Cloud API

### Instalação

```bash
pnpm install
```

### Variáveis de ambiente

Crie um `.env` na raiz (e/ou em `packages/api`) com as chaves do seu ambiente:

```bash
# Banco (Supabase)
DATABASE_URL=            # connection string do pooler (uso da aplicação)
DIRECT_URL=             # connection string direta (migrations)

# Infra
REDIS_URL=              # Upstash ou local
RABBITMQ_URL=           # CloudAMQP ou local

# Autenticação (admin)
CLERK_SECRET_KEY=
CLERK_PUBLISHABLE_KEY=

# Storage e notificações
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
WHATSAPP_TOKEN=
WHATSAPP_PHONE_ID=
```

### Desenvolvimento

Suba a infraestrutura local e os apps:

```bash
# Redis + RabbitMQ
docker compose up -d

# API (NestJS)
pnpm nx serve @org/api

# App do cidadão (Expo)
pnpm nx start @org/mobile

# Painel administrativo (Refine)
pnpm nx serve @org/admin
```

A documentação da API (Swagger) fica disponível na rota `/docs` da API em execução.

## Comandos úteis

```bash
# Qualidade em todos os projetos
pnpm nx run-many -t lint test typecheck

# Build apenas do que foi afetado por uma mudança
pnpm nx affected -t build

# Visualizar o grafo de dependências do monorepo
pnpm nx graph

# Listar todos os projetos
pnpm nx show projects
```

## Segurança e privacidade (LGPD)

A plataforma lida com dados pessoais de cidadãos, e isso é tratado como requisito, não como detalhe:

- **Protocolo não-enumerável** e rota pública com payload mínimo, para evitar vazamento de dados por adivinhação de números.
- **Rate limiting** nas rotas públicas, contra abuso e enumeração.
- **Isolamento por tenant** com RLS no PostgreSQL.
- **TLS em trânsito** em todas as conexões (API, banco, Redis, broker).
- **Fotos em bucket privado**, servidas por URLs assinadas e temporárias.
- **Logs sem dados pessoais.**

## Roadmap

- [x] Abertura de chamado com foto, GPS e categoria
- [x] Protocolo rastreável e timeline de status
- [x] Painel administrativo com tempo real
- [x] Notificações por WhatsApp
- [x] Multi-tenant (`tenant_id` + RLS)
- [ ] Deduplicação automática de chamados por proximidade geográfica
- [ ] Dashboards e métricas (SLA, tempo médio de resolução, mapa de calor)
- [ ] Integração com o sistema comercial da concessionária (matrícula do imóvel)
- [ ] Onboarding self-service de novas concessionárias
- [ ] Notificações push no app

## Licença

Projeto proprietário. Todos os direitos reservados. _(Ajuste conforme a decisão de licenciamento.)_
