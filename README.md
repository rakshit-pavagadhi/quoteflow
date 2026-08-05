<div align="center">

# QuoteFlow

**A state-machine-driven logistics quote management system**

Backend service that models the lifecycle of a logistics quote as an explicit, enforced state machine — exposed via GraphQL, backed by PostgreSQL with an immutable audit trail, optimized with Redis caching, containerized with Docker, and visualized through a React kanban board.

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![GraphQL](https://img.shields.io/badge/GraphQL-Apollo_Server-E10098?logo=graphql&logoColor=white)](https://www.apollographql.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-Caching-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![React](https://img.shields.io/badge/React-Vite-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![CI Workflow](https://github.com/rakshit-pavagadhi/quoteflow/actions/workflows/ci.yml/badge.svg)](https://github.com/rakshit-pavagadhi/quoteflow/actions)

</div>

---

## Overview

Most systems model a record's lifecycle as a loosely typed `status` field, which allows invalid jumps and gives no record of how a value got there. QuoteFlow takes a stricter approach: every quote moves through an explicitly defined state machine, every transition is validated before it is persisted, and every transition is written to an immutable audit log so the full history of any quote can always be reconstructed.

The project is a self-contained reference implementation of production backend patterns:

- isolated business logic
- type-safe data access
- atomic transactional writes
- Redis query caching
- containerized deployment
- GraphQL API layer
- immutable auditability

## Table of Contents

- [Overview](#overview)
- [State Machine](#state-machine)
- [Architecture](#architecture)
- [Key Design Decisions](#key-design-decisions)
- [Database Schema](#database-schema)
- [Getting Started](#getting-started)
  - [Option 1: Docker Compose (Recommended)](#option-1-docker-compose-recommended)
  - [Option 2: Local Manual Setup](#option-2-local-manual-setup)
- [GraphQL API Reference](#graphql-api-reference)
- [Testing](#testing)
- [CI/CD Workflow](#cicd-workflow)
- [AWS Deployment Readiness](#aws-deployment-readiness)
- [Project Structure](#project-structure)
- [Roadmap](#roadmap)
- [License](#license)

## State Machine

Every quote moves through a fixed set of states. Transitions not shown below are rejected at the application layer before they reach the database.

```text
draft ──▶ submitted ──▶ under_review ──┬──▶ approved
                │                     │
                │                     └──▶ rejected
                │
                └──▶ expired ◀───────────────┘
```

| From | To | Trigger |
|---|---|---|
| `draft` | `submitted` | User action |
| `submitted` | `under_review` | User action |
| `submitted` | `expired` | System (time-based) |
| `under_review` | `approved` | User action |
| `under_review` | `rejected` | User action |
| `under_review` | `expired` | System (time-based) |

**Terminal states:** `approved`, `rejected`, `expired` — no transitions are permitted out of these states.

## Architecture

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React + Vite + Nginx | Kanban board visualization and SPA web server |
| API | Apollo Server + Express | GraphQL API endpoint |
| State Machine | Pure TypeScript module | Enforces valid transitions, zero I/O dependencies |
| Caching | Redis (`ioredis`) | High-performance query caching and automatic invalidation |
| ORM | Prisma | Type-safe schema, migrations, and queries |
| Database | PostgreSQL | Relational storage and append-only audit log |
| Containerization | Docker Compose | Multi-container orchestration |
| CI Pipeline | GitHub Actions | Automated build and test verification |

```text
┌─────────────────┐   HTTP / Relative Paths   ┌────────────────────┐
│ React (Vite)    │ ─────────────────────────▶ │ Nginx Server       │
│ Kanban Board    │ ◀───────────────────────── │ (Frontend Docker)  │
└─────────────────┘                            └─────────┬──────────┘
                                                          │ Reverse Proxy (/graphql)
                                                          ▼
                                            ┌────────────────────┐
                                            │ Apollo Server      │
                                            │ (Backend Docker)   │
                                            └─────────┬──────────┘
                                                      │
                                            ┌─────────▼──────────┐
                                            │ Redis Cache        │
                                            │ (30s TTL)          │
                                            └─────────┬──────────┘
                                                      │
                                            ┌─────────▼──────────┐
                                            │ State Machine      │
                                            │ Module             │
                                            └─────────┬──────────┘
                                                      │
                                            ┌─────────▼──────────┐
                                            │ Prisma Data Layer  │
                                            └─────────┬──────────┘
                                                      │
                                            ┌─────────▼──────────┐
                                            │ PostgreSQL         │
                                            │ (Database)         │
                                            └────────────────────┘
```

## Key Design Decisions

- **Isolated state machine.** All transition logic lives in a pure module (`stateMachine.ts`) with no database or API dependency, so the entire transition matrix — every valid and invalid pair — can be unit-tested in isolation.
- **Immutable audit log.** Every state change is written to `quote_transitions`, an append-only table. The complete history of any quote is reconstructable from this table alone.
- **Atomic transitions.** Each status update and its corresponding audit entry are written inside a single Prisma `$transaction`, preventing drift between current state and history.
- **Redis query caching.** Read queries (`quote` and `quotes`) are cached in Redis with a 30-second TTL. Write mutations invalidate affected cache keys automatically. If Redis is unavailable, the API falls back to PostgreSQL without failing the request.
- **Full-stack containerization.** The application runs as a multi-container stack via Docker Compose, with Nginx serving the frontend and reverse proxying `/graphql` to the backend.

## Database Schema

**`quotes`** — current state of each quote, including origin, destination, cargo details, rate, and status.

**`quote_transitions`** — append-only audit log with `from_status`, `to_status`, `actor`, `note`, and `transitioned_at`.

<details>
<summary>Full DDL</summary>

```sql
CREATE TYPE quote_status AS ENUM (
  'draft', 'submitted', 'under_review', 'approved', 'rejected', 'expired'
);

CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code TEXT UNIQUE NOT NULL,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  cargo_description TEXT,
  weight_kg NUMERIC,
  proposed_rate NUMERIC NOT NULL,
  currency TEXT NOT NULL,
  status quote_status NOT NULL DEFAULT 'draft',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE quote_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id),
  from_status quote_status,
  to_status quote_status NOT NULL,
  actor TEXT NOT NULL,
  note TEXT,
  transitioned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

</details>

## Getting Started

### Option 1: Docker Compose (Recommended)

Spins up the full stack — PostgreSQL, Redis, backend API, and Nginx frontend — with a single command.

#### Prerequisites

- Docker Desktop installed and running

#### Run the application

```bash
docker compose up --build
```

#### Access points

- Frontend: `http://localhost:3000`
- GraphQL Explorer: `http://localhost:4000/graphql`

### Option 2: Local Manual Setup

#### Prerequisites

- Node.js 18+
- PostgreSQL instance, local or hosted
- Redis instance, optional for local development

#### Backend setup

```bash
cd backend
npm install

# Create backend/.env:
# PORT=4000
# DATABASE_URL="postgresql://postgres:password@localhost:5432/postgres?schema=public"
# REDIS_URL="redis://localhost:6379"

npx prisma db push
npm run dev
```

The GraphQL server runs at `http://localhost:4000/graphql`.

#### Frontend setup

```bash
cd frontend
npm install

# Create frontend/.env:
# VITE_API_URL="http://localhost:4000/graphql"

npm run dev
```

The kanban board runs at `http://localhost:3000`.

## GraphQL API Reference

### Queries

| Name | Description | Caching |
|---|---|---|
| `quote(id: ID!): Quote` | Fetch a single quote by ID | Cached (30s TTL) |
| `quotes(status: QuoteStatus, limit: Int, offset: Int): [Quote!]!` | List/filter quotes with pagination | Cached (30s TTL) |
| `quoteHistory(quoteId: ID!): [QuoteTransition!]!` | Return the full audit trail for a quote | Direct DB |

### Mutations

| Name | Description | Cache Impact |
|---|---|---|
| `createQuote(input: CreateQuoteInput!): Quote!` | Create a new quote in `draft` state | Invalidates `quotes:*` |
| `transitionQuote(id: ID!, toStatus: QuoteStatus!, actor: String!, note: String): Quote!` | Validated state transition; the only way to change a quote's status | Invalidates `quotes:*` and `quote:{id}` |
| `expireStaleQuotes: [Quote!]!` | Batch-expire quotes exceeding the review window | Invalidates affected caches |

<details>
<summary>Example mutation</summary>

```graphql
mutation {
  transitionQuote(
    id: "quote-uuid-here"
    toStatus: UNDER_REVIEW
    actor: "reviewer@example.com"
    note: "Starting review"
  ) {
    id
    status
    updatedAt
  }
}
```

</details>

## Testing

```bash
cd backend
npm run test
```

Test coverage includes the full state machine transition matrix — every valid transition and every invalid transition pair — verified independently using Jest.

## CI/CD Workflow

A GitHub Actions pipeline in `.github/workflows/ci.yml` runs automatically on every push and pull request to `main`. It performs:

- dependency installation
- backend unit tests
- TypeScript compilation checks
- frontend build verification

## AWS Deployment Readiness

QuoteFlow is ready for manual deployment to AWS with EC2 and RDS.

### Environment variables

| Variable | Description | Example |
|---|---|---|
| `PORT` | API server port | `4000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@rds-endpoint:5432/quoteflow` |
| `REDIS_URL` | Redis / ElastiCache endpoint | `redis://elasticache-endpoint:6379` |
| `VITE_API_URL` | Public GraphQL endpoint URL | `https://api.yourdomain.com/graphql` |

### Deployment notes

- Provision an Amazon RDS PostgreSQL instance.
- Allow inbound PostgreSQL traffic from the EC2 security group.
- Launch an EC2 instance with Node.js 18+, Git, and PM2.
- Clone the repository, set environment variables, push Prisma schema changes, build the app, and run the backend process with PM2.

Example:

```bash
pm2 start backend/dist/index.js --name "quoteflow-api"
```

## Project Structure

```text
quoteflow/
├── docker-compose.yml
├── .github/
│   └── workflows/
│       └── ci.yml
├── backend/
│   ├── Dockerfile
│   ├── src/
│   │   ├── stateMachine.ts
│   │   ├── cache.ts
│   │   ├── index.ts
│   │   ├── graphql/
│   │   └── __tests__/
│   └── prisma/
│       └── schema.prisma
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    └── src/
        ├── components/
        └── api/
```