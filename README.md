<div align="center">

# QuoteFlow

**A state-machine-driven logistics quote management system**

Backend service that models the lifecycle of a logistics quote as an explicit, enforced state machine — exposed via GraphQL, backed by PostgreSQL with a full audit trail, and visualized through a React kanban board.

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![GraphQL](https://img.shields.io/badge/GraphQL-Apollo_Server-E10098?logo=graphql&logoColor=white)](https://www.apollographql.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![React](https://img.shields.io/badge/React-Vite-61DAFB?logo=react&logoColor=black)](https://react.dev/)


</div>

---

## Overview

Most systems model a record's lifecycle as a loosely-typed `status` field, which allows invalid jumps (e.g., a rejected quote silently becoming approved) and gives you no record of *how* it got there. QuoteFlow takes a stricter approach: every quote moves through an explicitly defined state machine, every transition is validated before it's persisted, and every transition is written to an immutable audit log — so the full history of any quote can always be reconstructed.

The project was built as a self-contained reference implementation of production backend patterns: isolated business logic, type-safe data access, atomic transactional writes, and a GraphQL API layer — end to end, deployed and demoable.

## Table of Contents

- [State Machine](#state-machine)
- [Architecture](#architecture)
- [Key Design Decisions](#key-design-decisions)
- [Database Schema](#database-schema)
- [Getting Started](#getting-started)
- [GraphQL API Reference](#graphql-api-reference)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Roadmap](#roadmap)
- [License](#license)

## State Machine

Every quote moves through a fixed set of states. Transitions not shown below are rejected at the application layer before they ever reach the database.

```
 draft ──▶ submitted ──▶ under_review ──┬──▶ approved
                │                       │
                │                       └──▶ rejected
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

**Terminal states:** `approved`, `rejected`, `expired` — no transitions permitted out of these states.

## Architecture

| Layer | Technology | Purpose |
|---|---|---|
| API | Apollo Server + Express | GraphQL endpoint |
| State Machine | Pure TypeScript module | Enforces valid transitions, no I/O dependencies |
| ORM | Prisma | Type-safe schema, migrations, and queries |
| Database | PostgreSQL | Relational storage + append-only audit log |
| Frontend | React + Vite | Kanban board visualization |
| Deployment | Render | Managed Postgres + web service hosting |

```
┌───────────────┐   GraphQL over HTTPS   ┌────────────────────┐
│  React Client  │ ─────────────────────▶ │   Apollo Server     │
│  (Kanban UI)   │ ◀───────────────────── │   (Express)          │
└───────────────┘                        └──────────┬───────────┘
                                                       │
                                          ┌────────────▼────────────┐
                                          │  State Machine Module    │
                                          │  (pure logic, no I/O)    │
                                          └────────────┬────────────┘
                                                       │
                                          ┌────────────▼────────────┐
                                          │   Prisma Data Layer      │
                                          └────────────┬────────────┘
                                                       │
                                          ┌────────────▼────────────┐
                                          │   PostgreSQL (Render)    │
                                          └───────────────────────────┘
```

## Key Design Decisions

- **Isolated state machine.** All transition logic lives in a single pure module (`stateMachine.ts`) with no database or API dependency, so the entire transition matrix — every valid *and* invalid pair — can be unit-tested in isolation.
- **Immutable audit log.** Every state change is written to `quote_transitions`, an append-only table. The complete history of any quote is reconstructable from this table alone, independent of the current `status` field.
- **Atomic transitions.** Each status update and its corresponding audit log entry are written inside a single Prisma `$transaction`, so the current state and the history can never drift out of sync.
- **API as the only write path.** The GraphQL mutation layer is the sole entry point for state changes — there is no way to mutate a quote's status that bypasses state machine validation.

## Database Schema

**`quotes`** — current state of each quote (origin, destination, cargo details, rate, status)

**`quote_transitions`** — append-only audit log: `from_status`, `to_status`, `actor`, `note`, `transitioned_at`

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

### Prerequisites

- Node.js 18+
- PostgreSQL (local instance or a connection string from a hosted provider)

### Backend

```bash
cd backend
npm install

# Create a .env file:
# DATABASE_URL="postgresql://postgres:password@localhost:5432/quoteflow"

npx prisma db push
npm run dev
```

The GraphQL server runs at `http://localhost:4000/graphql`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The kanban board runs at `http://localhost:3000`.

## GraphQL API Reference

### Queries

| Name | Description |
|---|---|
| `quote(id: ID!): Quote` | Fetch a single quote by ID |
| `quotes(status: QuoteStatus, limit: Int, offset: Int): [Quote!]!` | List/filter quotes, paginated |
| `quoteHistory(quoteId: ID!): [QuoteTransition!]!` | Full audit trail for a quote |

### Mutations

| Name | Description |
|---|---|
| `createQuote(input: CreateQuoteInput!): Quote!` | Create a new quote in `draft` state |
| `transitionQuote(id: ID!, toStatus: QuoteStatus!, actor: String!, note: String): Quote!` | Validated state transition — the only way to change a quote's status |
| `expireStaleQuotes: [Quote!]!` | Batch-expires quotes that have exceeded their review window |

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

Test coverage includes the full state machine transition matrix — every valid transition and every invalid transition pair — verified independently of the API and database layers.

## Project Structure

```
quoteflow/
├── backend/
│   ├── src/
│   │   ├── stateMachine.ts       # Pure state machine logic
│   │   ├── resolvers/            # GraphQL resolvers
│   │   ├── schema.graphql        # GraphQL type definitions
│   │   └── prisma/               # Schema + migrations
│   └── tests/
│       └── stateMachine.test.ts
└── frontend/
    └── src/
        └── components/           # Kanban board UI
```

## Roadmap

- [ ] Role-based authorization (Requester / Reviewer permissions)
- [ ] Scheduled job for automatic quote expiry (currently manually triggered)
- [ ] Pagination cursor support for large quote lists
- [ ] AWS (EC2 + RDS) deployment