# Tracker Room Lobby Design

## Goal

Change `/tracker` from one site-wide password gate into a room lobby. The lobby is public, each room has its own password, and the existing PostgreSQL tracker session becomes the first room without losing checked or marked unit data.

## Approved Workflow

- `/tracker` shows all active rooms first.
- Guests and logged-in vxpers.com users can create rooms.
- Joining a room asks for that room's password.
- A successful room join is remembered for 30 days in an HTTP-only cookie.
- Guests are stored as guest users for tracker purposes; logged-in users are associated with their website user id when available.
- Existing database data becomes `ห้อง 1 - ข้อมูลเดิม` with password `noble242`.

## Data Model

Use `public.tracker_sessions` as the room table. Add room metadata columns to the existing table:

- `room_password_hash text`
- `created_by_user_id bigint null`
- `created_by_guest_name text null`
- `last_active_at timestamptz not null default now()`

The existing `public.tracker_unit_statuses.session_id` rows remain untouched. This keeps existing checked and marked room-status data attached to the same UUID.

## API Shape

- `GET /api/tracker/rooms`: public lobby room list with counts.
- `POST /api/tracker/rooms`: create a room, hash its password, set 30-day room access, return room state.
- `POST /api/tracker/rooms/:roomId/join`: verify password and set 30-day room access.
- `GET /api/tracker/rooms/:roomId/state`: requires room access cookie.
- Mutating room endpoints live under `/api/tracker/rooms/:roomId/...` and require room access.

## Socket Shape

Tracker socket clients pass `auth: { channel: 'tracker', roomId }`. The server validates the room access cookie against the room password hash and joins `tracker:<roomId>`. Mutations emit only to that room.

## UI

The `/tracker` route becomes a lobby first. Room cards show name, checked count, marked count, total rooms, creator type/name, and Join/Open action. After joining, the existing tracker dashboard is reused for that room. The sidebar form remains in the PC sidebar and mobile dock behavior stays unchanged.

## Migration

At server startup, `initTrackerStore()` adds the new columns and ensures all existing rows have a password hash. The first legacy room with missing password metadata is renamed to `ห้อง 1 - ข้อมูลเดิม` and gets password `noble242`. No rows in `tracker_unit_statuses` are deleted or rewritten.
