# Conduit

> A platform for reporting and tracking service requests for public utility companies. Citizens report an issue from their phone — a leak, water outage, sewage problem — and track its resolution in real time, much like tracking a package. The operations team receives, triages, and resolves requests from a single dashboard.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript\&logoColor=white)
![Nx](https://img.shields.io/badge/Nx-143055?logo=nx\&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-E0234E?logo=nestjs\&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-000020?logo=expo\&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?logo=react\&logoColor=61DAFB)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql\&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-F69220?logo=pnpm\&logoColor=white)

---

## Overview

Water and sanitation providers, such as SAAEs, and other utilities rarely offer a decent digital channel for citizens to report an issue. Contact usually happens by phone, with no clear protocol number, no photo, no precise location, and no visibility into progress.

**Conduit** fills this gap with three connected components:

* a **mobile app** where anyone can open a service request with a photo, location, and category, without needing to create an account;
* an **administrative dashboard** where the operations team monitors the queue in real time, triages requests, and updates the status of each case;
* **public tracking** by protocol number, with WhatsApp notifications on every status change.

The platform is designed as **multi-tenant** from the start: although the first customer is a water utility, the architecture already isolates data by tenant, making it possible to support electricity, gas, and other services without a rewrite.

## Features

* **Frictionless service request creation** — category, description, photo, and geolocation (GPS + map adjustment). Citizens do not authenticate; they only provide their name and phone number to receive updates.
* **Trackable protocol number** — a non-enumerable number and a status timeline visible to the citizen, similar to delivery tracking.
* **Real-time dashboard** — a service request queue with search, sorting, and filters, updated live through WebSocket whenever something is created or changed.
* **WhatsApp notifications** — the operations team is notified of new requests; citizens are notified on every status change.
* **Multi-tenant from day one** — isolation by `tenant_id` across all tables, with database-level RLS as a second layer.
* **Built to scale** — Redis read-through caching, asynchronous processing with queues and workers, and decoupled real-time updates.

## Architecture

Monorepo managed with **Nx** and **pnpm**, entirely written in TypeScript.

| Layer                     | Technology                          |
| ------------------------- | ----------------------------------- |
| API                       | NestJS · Prisma · Swagger           |
| Database                  | PostgreSQL + PostGIS (via Supabase) |
| Image storage             | Supabase Storage (private bucket)   |
| Cache                     | Redis (cache-aside)                 |
| Messaging / queues        | RabbitMQ + workers                  |
| Real-time                 | WebSocket (socket.io)               |
| Notifications             | Meta WhatsApp Cloud API             |
| Citizen app               | Expo + Expo Router (no login)       |
| Administrative dashboard  | Refine (React + Vite)               |
| Authentication (admin)    | Clerk                               |
| Shared types & validation | internal library + Zod              |

## Monorepo structure

```text
conduit-platform/
  packages/
    api/            # NestJS — HTTP, WebSocket, and RabbitMQ workers
    mobile/         # Expo — citizen app
    admin/          # Refine — operations dashboard
    shared-types/   # domain types + Zod schemas (shared)
  docker-compose.yml  # Redis + RabbitMQ for local development
  nx.json
  pnpm-workspace.yaml
```

The `shared-types` library is the single source of truth for the domain model: service request, status, and categories. Change it in one place, and TypeScript points out what needs to be adjusted across all three apps.

## Getting started

### Prerequisites

* **Node.js 24 LTS** (recommended for production)
* **pnpm** (the version pinned in `packageManager` in `package.json`)
* **Docker** — to run Redis and RabbitMQ locally
* Accounts/credentials: Supabase, Clerk, and Meta WhatsApp Cloud API

### Installation

```bash
pnpm install
```

### Environment variables

Create a `.env` file in the root directory and/or in `packages/api` with the keys for your environment:

```bash
# Database (Supabase)
DATABASE_URL=            # pooler connection string (application usage)
DIRECT_URL=              # direct connection string (migrations)

# Infrastructure
REDIS_URL=               # Upstash or local
RABBITMQ_URL=            # CloudAMQP or local

# Authentication (admin)
CLERK_SECRET_KEY=
CLERK_PUBLISHABLE_KEY=

# Storage and notifications
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
WHATSAPP_TOKEN=
WHATSAPP_PHONE_ID=
```

### Development

Start the local infrastructure and apps:

```bash
# Redis + RabbitMQ
docker compose up -d

# API (NestJS)
pnpm nx serve @org/api

# Citizen app (Expo)
pnpm nx start @org/mobile

# Administrative dashboard (Refine)
pnpm nx serve @org/admin
```

The API documentation (Swagger) is available at the `/docs` route of the running API.

## Useful commands

```bash
# Quality checks across all projects
pnpm nx run-many -t lint test typecheck

# Build only what was affected by a change
pnpm nx affected -t build

# View the monorepo dependency graph
pnpm nx graph

# List all projects
pnpm nx show projects
```

## Security and privacy (LGPD)

The platform handles citizens’ personal data, and this is treated as a requirement, not an afterthought:

* **Non-enumerable protocol number** and a public route with a minimal payload, to prevent data leaks through number guessing.
* **Rate limiting** on public routes, protecting against abuse and enumeration.
* **Tenant isolation** with RLS in PostgreSQL.
* **TLS in transit** across all connections: API, database, Redis, and broker.
* **Photos stored in a private bucket**, served through temporary signed URLs.
* **Logs without personal data.**

## Roadmap

* [x] Service request creation with photo, GPS, and category
* [x] Trackable protocol number and status timeline
* [x] Real-time administrative dashboard
* [x] WhatsApp notifications
* [x] Multi-tenant architecture (`tenant_id` + RLS)
* [ ] Automatic deduplication of service requests by geographic proximity
* [ ] Dashboards and metrics: SLA, average resolution time, heat map
* [ ] Integration with the utility company’s commercial system: property/customer registration number
* [ ] Self-service onboarding for new utilities
* [ ] Push notifications in the app

## License

Proprietary project. All rights reserved.
