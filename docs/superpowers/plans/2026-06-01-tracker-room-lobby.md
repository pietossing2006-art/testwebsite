# Tracker Room Lobby Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a PostgreSQL-backed room lobby for `/tracker`, with per-room passwords and preserved existing tracker data.

**Architecture:** Reuse `tracker_sessions` as room rows. Add room metadata and room-scoped auth cookies. Refactor tracker APIs, socket rooms, and the React tracker page to operate on a selected room id.

**Tech Stack:** Express, PostgreSQL via `pg`, Argon2 password hashing, Socket.IO, React/Vite.

---

### Task 1: Server Room Model And Auth

**Files:**
- Modify: `server/lib/trackerStore.js`
- Modify: `server/lib/trackerAuth.js`
- Modify: `server/routes/tracker.js`
- Modify: `server/lib/socket.js`
- Test: `server/tests/tracker/room-auth.test.js`

- [ ] Add tests for public lobby, locked room state, successful room join, and room-scoped socket auth.
- [ ] Add room metadata columns to `tracker_sessions`.
- [ ] Backfill legacy session password hash and name.
- [ ] Add room list/create/join/state helpers.
- [ ] Replace site-wide tracker password auth with room-scoped cookie auth.
- [ ] Emit Socket.IO updates to `tracker:<roomId>`.

### Task 2: Tracker UI Lobby

**Files:**
- Modify: `client/src/App.jsx`
- Modify: `client/src/pages/Tracker.jsx`
- Modify: `client/src/socket.js`
- Modify: `client/public/tracker/style.css`

- [ ] Change route to `/tracker/*`.
- [ ] Add lobby state, room cards, create-room form, and join-room form.
- [ ] Load dashboard through `/api/tracker/rooms/:roomId/state`.
- [ ] Send all mutations through room-scoped endpoints.
- [ ] Connect Socket.IO with `roomId`.
- [ ] Preserve desktop sidebar input and mobile floating input behavior.

### Task 3: Verification

**Files:**
- Verify only.

- [ ] Run `npm test` in `server`.
- [ ] Run `node --check` on touched server files.
- [ ] Run `npm run build` and ESLint in `client`.
- [ ] Manually verify room list, wrong password, correct password, create room, add unit, and socket update.
