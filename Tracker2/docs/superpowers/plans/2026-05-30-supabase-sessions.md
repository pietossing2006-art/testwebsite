# Supabase Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tracker sessions with configurable prefix and room count, backed by the new Supabase project.

**Architecture:** Flask remains the only public app API. Supabase stores sessions and unit statuses; the browser gets no database secrets and only talks to Flask endpoints.

**Tech Stack:** Flask, vanilla JS/CSS, Supabase Postgres/Data API, Python standard library.

---

### Task 1: Database Schema And Import

**Files:**
- Modify via Supabase migration: `tracker_sessions`, `tracker_unit_statuses`
- Read: `units.json`
- Read: `marked_units.json`

- [ ] Apply a migration that creates `tracker_sessions`, `tracker_unit_statuses`, indexes, and RLS/grants for Data API access.
- [ ] Insert one imported session with prefix `42/` and total rooms `755`.
- [ ] Import existing checked and marked units into `tracker_unit_statuses`.
- [ ] Verify counts through SQL.

### Task 2: Backend Storage

**Files:**
- Create: `storage.py`
- Modify: `server.py`

- [ ] Add a Supabase REST storage client using `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.
- [ ] Add session methods: list, create, get active, set active.
- [ ] Add unit methods scoped by session id: list checked, list marked, add, delete, edit, toggle mark.
- [ ] Keep JSON fallback available only when Supabase env vars are absent.
- [ ] Update Flask routes to include session config and session management endpoints.

### Task 3: Frontend Session UI

**Files:**
- Modify: `templates/index.html`
- Modify: `static/app.js`
- Modify: `static/style.css`

- [ ] Replace hardcoded `PREFIX` and `TOTAL_ROOMS` with server-provided active session config.
- [ ] Add a session selector and create-session form controls.
- [ ] Scope all unit actions to the active session.
- [ ] Update title, placeholders, stats, modal prefix, and generated room list when session changes.
- [ ] Preserve floating input and latest-highlight behavior.

### Task 4: Verification

**Files:**
- Test via shell and browser.

- [ ] Run Python syntax checks.
- [ ] Run JavaScript syntax check.
- [ ] Verify API endpoints with Flask test client or browser fetch.
- [ ] Verify in the in-app browser: imported session loads, create session works, prefix/room count update, add/delete/mark work per session.
