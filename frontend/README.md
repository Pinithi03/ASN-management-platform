# Frontend — React Application

Single-page application for the ANS Management Platform.

## Stack

- **React 18** + TypeScript
- **Vite** (build tool)
- **Tailwind CSS** + Shadcn/ui (components)
- **React Router v6** (routing)
- **TanStack Query v5** (server state)
- **Zustand** (client state)
- **Axios** (HTTP client)
- **Zod** + React Hook Form (validation)

## Quick Start

```bash
# From repo root
make frontend-install   # Install dependencies
make frontend-dev       # Dev server (port 3000, proxies /api to 8000)
make frontend-build     # Production build
make frontend-test      # Run Vitest
```

## Directory Structure

```
src/
├── components/
│   ├── ui/           # Shadcn/ui primitives (Button, Input, Dialog, etc.)
│   ├── layout/       # MainLayout, Sidebar, Header
│   └── common/       # Shared components (DataTable, StatusBadge, etc.)
├── pages/            # Route-level page components
├── hooks/            # Custom React hooks
├── services/         # API client and auth service
├── store/            # Zustand state stores
├── types/            # TypeScript type definitions
├── utils/            # Utility functions (cn, formatters)
└── styles/           # Global CSS + Tailwind config
```
