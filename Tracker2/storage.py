import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import psycopg
from psycopg.rows import dict_row


DEFAULT_PREFIX = "42/"
DEFAULT_TOTAL_ROOMS = 755
DEFAULT_SESSION_ID = "local-default"
MAX_TOTAL_ROOMS = 10000


class StorageError(Exception):
    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.status_code = status_code


def load_env_file(path=".env"):
    env_path = Path(path)
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def number_width(total_rooms):
    return max(1, len(str(int(total_rooms))))


def format_unit_label(unit_number, prefix, total_rooms):
    return f"{prefix}{int(unit_number):0{number_width(total_rooms)}d}"


def parse_unit_number(raw_value, prefix):
    value = str(raw_value or "").strip()
    if not value:
        raise ValueError("Room number is required")
    if prefix and value.startswith(prefix):
        value = value[len(prefix):]
    if not value.isdigit():
        raise ValueError("Room number must be numeric")
    number = int(value)
    if number <= 0:
        raise ValueError("Room number must be greater than zero")
    return number


def normalize_prefix(prefix):
    value = str(prefix or "").strip()
    if not value:
        raise ValueError("Prefix is required")
    return value


def normalize_total_rooms(total_rooms):
    try:
        value = int(total_rooms)
    except (TypeError, ValueError):
        raise ValueError("Total rooms must be a number")
    if value <= 0 or value > MAX_TOTAL_ROOMS:
        raise ValueError(f"Total rooms must be between 1 and {MAX_TOTAL_ROOMS}")
    return value


def normalize_unit_for_session(raw_value, session):
    unit_number = parse_unit_number(raw_value, session["prefix"])
    if unit_number > int(session["total_rooms"]):
        raise ValueError(f"Room number must be between 1 and {session['total_rooms']}")
    return unit_number


def serialize_row(row):
    if row is None:
        return None
    serialized = {}
    for key, value in dict(row).items():
        if hasattr(value, "isoformat"):
            serialized[key] = value.isoformat()
        else:
            serialized[key] = str(value) if key.endswith("id") or key == "id" else value
    return serialized


class SupabaseRestClient:
    def __init__(self, base_url, publishable_key, app_key):
        self.base_url = base_url.rstrip("/")
        self.publishable_key = publishable_key
        self.app_key = app_key

    def request(self, method, table, params=None, body=None, prefer=None):
        query = ""
        if params:
            query = "?" + urlencode(params, safe="*,.()")
        url = f"{self.base_url}/rest/v1/{table}{query}"
        headers = {
            "apikey": self.publishable_key,
            "Authorization": f"Bearer {self.publishable_key}",
            "x-tracker-app-key": self.app_key,
            "Accept": "application/json",
        }
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if prefer:
            headers["Prefer"] = prefer

        req = Request(url, data=data, headers=headers, method=method)
        try:
            with urlopen(req, timeout=20) as response:
                payload = response.read().decode("utf-8")
                return json.loads(payload) if payload else []
        except HTTPError as exc:
            payload = exc.read().decode("utf-8")
            try:
                data = json.loads(payload)
                message = data.get("message") or data.get("hint") or payload
            except json.JSONDecodeError:
                message = payload or str(exc)
            raise StorageError(message, exc.code)
        except URLError as exc:
            raise StorageError(f"Cannot reach Supabase: {exc.reason}", 503)


class SupabaseStorage:
    def __init__(self, base_url, publishable_key, app_key):
        self.client = SupabaseRestClient(base_url, publishable_key, app_key)

    def list_sessions(self):
        return self.client.request(
            "GET",
            "tracker_sessions",
            {"select": "id,name,prefix,total_rooms,is_active,created_at,updated_at", "order": "created_at.asc"},
        )

    def create_session(self, name, prefix, total_rooms, make_active=True):
        if make_active:
            self.client.request(
                "PATCH",
                "tracker_sessions",
                {"is_active": "eq.true"},
                {"is_active": False},
                prefer="return=minimal",
            )
        rows = self.client.request(
            "POST",
            "tracker_sessions",
            {"select": "id,name,prefix,total_rooms,is_active,created_at,updated_at"},
            {
                "name": name,
                "prefix": normalize_prefix(prefix),
                "total_rooms": normalize_total_rooms(total_rooms),
                "is_active": bool(make_active),
            },
            prefer="return=representation",
        )
        return rows[0]

    def set_active_session(self, session_id):
        self.client.request(
            "PATCH",
            "tracker_sessions",
            {"is_active": "eq.true"},
            {"is_active": False},
            prefer="return=minimal",
        )
        rows = self.client.request(
            "PATCH",
            "tracker_sessions",
            {"id": f"eq.{session_id}", "select": "id,name,prefix,total_rooms,is_active,created_at,updated_at"},
            {"is_active": True},
            prefer="return=representation",
        )
        if not rows:
            raise StorageError("Session not found", 404)
        return rows[0]

    def get_active_session(self):
        rows = self.client.request(
            "GET",
            "tracker_sessions",
            {"select": "id,name,prefix,total_rooms,is_active,created_at,updated_at", "is_active": "eq.true", "limit": "1"},
        )
        if rows:
            return rows[0]
        sessions = self.list_sessions()
        if sessions:
            return self.set_active_session(sessions[0]["id"])
        return self.create_session("42 - imported", DEFAULT_PREFIX, DEFAULT_TOTAL_ROOMS, True)

    def get_status(self, session_id, unit_number):
        rows = self.client.request(
            "GET",
            "tracker_unit_statuses",
            {
                "select": "id,session_id,unit_number,status",
                "session_id": f"eq.{session_id}",
                "unit_number": f"eq.{int(unit_number)}",
                "limit": "1",
            },
        )
        return rows[0] if rows else None

    def list_unit_labels(self, session, status):
        rows = self.client.request(
            "GET",
            "tracker_unit_statuses",
            {
                "select": "unit_number,status",
                "session_id": f"eq.{session['id']}",
                "status": f"eq.{status}",
                "order": "unit_number.asc",
            },
        )
        return [
            format_unit_label(row["unit_number"], session["prefix"], session["total_rooms"])
            for row in rows
        ]

    def set_unit_status(self, session_id, unit_number, status):
        rows = self.client.request(
            "POST",
            "tracker_unit_statuses",
            {"on_conflict": "session_id,unit_number", "select": "id,session_id,unit_number,status"},
            {"session_id": session_id, "unit_number": int(unit_number), "status": status},
            prefer="resolution=merge-duplicates,return=representation",
        )
        return rows[0] if rows else None

    def delete_unit_status(self, session_id, unit_number, status=None):
        params = {
            "session_id": f"eq.{session_id}",
            "unit_number": f"eq.{int(unit_number)}",
            "select": "id,session_id,unit_number,status",
        }
        if status:
            params["status"] = f"eq.{status}"
        return self.client.request("DELETE", "tracker_unit_statuses", params, prefer="return=representation")

    def edit_checked_unit(self, session_id, old_number, new_number):
        old_status = self.get_status(session_id, old_number)
        if not old_status or old_status["status"] != "checked":
            raise StorageError("Original room is not checked", 404)
        new_status = self.get_status(session_id, new_number)
        if new_status:
            raise StorageError("New room already has a status", 400)
        rows = self.client.request(
            "PATCH",
            "tracker_unit_statuses",
            {
                "session_id": f"eq.{session_id}",
                "unit_number": f"eq.{int(old_number)}",
                "status": "eq.checked",
                "select": "id,session_id,unit_number,status",
            },
            {"unit_number": int(new_number)},
            prefer="return=representation",
        )
        if not rows:
            raise StorageError("Original room is not checked", 404)
        return rows[0]

    def toggle_mark(self, session_id, unit_number):
        current = self.get_status(session_id, unit_number)
        if current and current["status"] == "marked":
            self.delete_unit_status(session_id, unit_number, "marked")
            return "unmarked"
        self.set_unit_status(session_id, unit_number, "marked")
        return "marked"


class PostgresStorage:
    def __init__(self, dsn, units_file="units.json", marked_file="marked_units.json"):
        self.dsn = dsn
        self.units_file = units_file
        self.marked_file = marked_file
        self.ensure_schema()
        self.seed_from_json_if_empty()

    def connect(self):
        return psycopg.connect(self.dsn, row_factory=dict_row)

    def ensure_schema(self):
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    create extension if not exists pgcrypto;

                    create table if not exists public.tracker_sessions (
                        id uuid primary key default gen_random_uuid(),
                        name text not null,
                        prefix text not null default '',
                        total_rooms integer not null check (total_rooms > 0 and total_rooms <= 10000),
                        is_active boolean not null default false,
                        created_at timestamptz not null default now(),
                        updated_at timestamptz not null default now()
                    );

                    alter table public.tracker_sessions
                        alter column id set default gen_random_uuid();

                    create unique index if not exists tracker_sessions_single_active_idx
                        on public.tracker_sessions ((is_active))
                        where is_active;

                    create table if not exists public.tracker_unit_statuses (
                        id uuid primary key default gen_random_uuid(),
                        session_id uuid not null references public.tracker_sessions(id) on delete cascade,
                        unit_number integer not null check (unit_number > 0),
                        status text not null check (status in ('checked', 'marked')),
                        created_at timestamptz not null default now(),
                        updated_at timestamptz not null default now(),
                        unique (session_id, unit_number)
                    );

                    alter table public.tracker_unit_statuses
                        alter column id set default gen_random_uuid();

                    create index if not exists tracker_unit_statuses_session_status_idx
                        on public.tracker_unit_statuses (session_id, status);

                    create or replace function public.tracker_set_updated_at()
                    returns trigger
                    language plpgsql
                    set search_path = public
                    as $$
                    begin
                        new.updated_at = now();
                        return new;
                    end;
                    $$;

                    drop trigger if exists tracker_sessions_set_updated_at on public.tracker_sessions;
                    create trigger tracker_sessions_set_updated_at
                    before update on public.tracker_sessions
                    for each row execute function public.tracker_set_updated_at();

                    drop trigger if exists tracker_unit_statuses_set_updated_at on public.tracker_unit_statuses;
                    create trigger tracker_unit_statuses_set_updated_at
                    before update on public.tracker_unit_statuses
                    for each row execute function public.tracker_set_updated_at();
                    """
                )

    def seed_from_json_if_empty(self):
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute("select count(*) as count from public.tracker_sessions")
                if cur.fetchone()["count"] > 0:
                    return
                cur.execute(
                    """
                    insert into public.tracker_sessions (name, prefix, total_rooms, is_active)
                    values (%s, %s, %s, true)
                    returning id
                    """,
                    ("42 - imported", DEFAULT_PREFIX, DEFAULT_TOTAL_ROOMS),
                )
                session_id = cur.fetchone()["id"]
                for label in self._load_json_list(self.units_file):
                    try:
                        unit_number = parse_unit_number(label, DEFAULT_PREFIX)
                    except ValueError:
                        continue
                    cur.execute(
                        """
                        insert into public.tracker_unit_statuses (session_id, unit_number, status)
                        values (%s, %s, 'checked')
                        on conflict (session_id, unit_number)
                        do update set status = excluded.status
                        """,
                        (session_id, unit_number),
                    )
                for label in self._load_json_list(self.marked_file):
                    try:
                        unit_number = parse_unit_number(label, DEFAULT_PREFIX)
                    except ValueError:
                        continue
                    cur.execute(
                        """
                        insert into public.tracker_unit_statuses (session_id, unit_number, status)
                        values (%s, %s, 'marked')
                        on conflict (session_id, unit_number)
                        do update set status = excluded.status
                        """,
                        (session_id, unit_number),
                    )

    def _load_json_list(self, path):
        if not os.path.exists(path):
            return []
        with open(path, "r", encoding="utf-8") as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return []

    def list_sessions(self):
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select id, name, prefix, total_rooms, is_active, created_at, updated_at
                    from public.tracker_sessions
                    order by created_at asc
                    """
                )
                return [serialize_row(row) for row in cur.fetchall()]

    def create_session(self, name, prefix, total_rooms, make_active=True):
        prefix = normalize_prefix(prefix)
        total_rooms = normalize_total_rooms(total_rooms)
        with self.connect() as conn:
            with conn.cursor() as cur:
                if make_active:
                    cur.execute("update public.tracker_sessions set is_active = false where is_active")
                cur.execute(
                    """
                    insert into public.tracker_sessions (name, prefix, total_rooms, is_active)
                    values (%s, %s, %s, %s)
                    returning id, name, prefix, total_rooms, is_active, created_at, updated_at
                    """,
                    (name, prefix, total_rooms, bool(make_active)),
                )
                return serialize_row(cur.fetchone())

    def set_active_session(self, session_id):
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute("update public.tracker_sessions set is_active = false where is_active")
                cur.execute(
                    """
                    update public.tracker_sessions
                    set is_active = true
                    where id = %s
                    returning id, name, prefix, total_rooms, is_active, created_at, updated_at
                    """,
                    (session_id,),
                )
                row = cur.fetchone()
                if not row:
                    raise StorageError("Session not found", 404)
                return serialize_row(row)

    def get_active_session(self):
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select id, name, prefix, total_rooms, is_active, created_at, updated_at
                    from public.tracker_sessions
                    where is_active
                    limit 1
                    """
                )
                row = cur.fetchone()
                if row:
                    return serialize_row(row)
        sessions = self.list_sessions()
        if sessions:
            return self.set_active_session(sessions[0]["id"])
        return self.create_session("42 - imported", DEFAULT_PREFIX, DEFAULT_TOTAL_ROOMS, True)

    def get_status(self, session_id, unit_number):
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select id, session_id, unit_number, status
                    from public.tracker_unit_statuses
                    where session_id = %s and unit_number = %s
                    limit 1
                    """,
                    (session_id, int(unit_number)),
                )
                return serialize_row(cur.fetchone())

    def list_unit_labels(self, session, status):
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select unit_number
                    from public.tracker_unit_statuses
                    where session_id = %s and status = %s
                    order by unit_number asc
                    """,
                    (session["id"], status),
                )
                return [
                    format_unit_label(row["unit_number"], session["prefix"], session["total_rooms"])
                    for row in cur.fetchall()
                ]

    def set_unit_status(self, session_id, unit_number, status):
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into public.tracker_unit_statuses (session_id, unit_number, status)
                    values (%s, %s, %s)
                    on conflict (session_id, unit_number)
                    do update set status = excluded.status
                    returning id, session_id, unit_number, status
                    """,
                    (session_id, int(unit_number), status),
                )
                return serialize_row(cur.fetchone())

    def delete_unit_status(self, session_id, unit_number, status=None):
        with self.connect() as conn:
            with conn.cursor() as cur:
                if status:
                    cur.execute(
                        """
                        delete from public.tracker_unit_statuses
                        where session_id = %s and unit_number = %s and status = %s
                        returning id, session_id, unit_number, status
                        """,
                        (session_id, int(unit_number), status),
                    )
                else:
                    cur.execute(
                        """
                        delete from public.tracker_unit_statuses
                        where session_id = %s and unit_number = %s
                        returning id, session_id, unit_number, status
                        """,
                        (session_id, int(unit_number)),
                    )
                return [serialize_row(row) for row in cur.fetchall()]

    def edit_checked_unit(self, session_id, old_number, new_number):
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select status
                    from public.tracker_unit_statuses
                    where session_id = %s and unit_number = %s
                    limit 1
                    """,
                    (session_id, int(old_number)),
                )
                old_status = cur.fetchone()
                if not old_status or old_status["status"] != "checked":
                    raise StorageError("Original room is not checked", 404)

                cur.execute(
                    """
                    select status
                    from public.tracker_unit_statuses
                    where session_id = %s and unit_number = %s
                    limit 1
                    """,
                    (session_id, int(new_number)),
                )
                if cur.fetchone():
                    raise StorageError("New room already has a status", 400)

                cur.execute(
                    """
                    update public.tracker_unit_statuses
                    set unit_number = %s
                    where session_id = %s and unit_number = %s and status = 'checked'
                    returning id, session_id, unit_number, status
                    """,
                    (int(new_number), session_id, int(old_number)),
                )
                row = cur.fetchone()
                if not row:
                    raise StorageError("Original room is not checked", 404)
                return serialize_row(row)

    def toggle_mark(self, session_id, unit_number):
        current = self.get_status(session_id, unit_number)
        if current and current["status"] == "marked":
            self.delete_unit_status(session_id, unit_number, "marked")
            return "unmarked"
        self.set_unit_status(session_id, unit_number, "marked")
        return "marked"


class JsonFileStorage:
    def __init__(self, units_file="units.json", marked_file="marked_units.json"):
        self.units_file = units_file
        self.marked_file = marked_file

    def _load_set(self, path):
        if not os.path.exists(path):
            return set()
        with open(path, "r", encoding="utf-8") as f:
            try:
                return set(json.load(f))
            except json.JSONDecodeError:
                return set()

    def _save_set(self, path, values):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(sorted(values), f, ensure_ascii=False, indent=4)

    def list_sessions(self):
        return [self.get_active_session()]

    def get_active_session(self):
        return {
            "id": DEFAULT_SESSION_ID,
            "name": "Local JSON",
            "prefix": DEFAULT_PREFIX,
            "total_rooms": DEFAULT_TOTAL_ROOMS,
            "is_active": True,
        }

    def create_session(self, name, prefix, total_rooms, make_active=True):
        raise StorageError("Session creation requires Supabase configuration", 503)

    def set_active_session(self, session_id):
        if session_id != DEFAULT_SESSION_ID:
            raise StorageError("Session not found", 404)
        return self.get_active_session()

    def list_unit_labels(self, session, status):
        if status == "checked":
            return sorted(self._load_set(self.units_file))
        if status == "marked":
            return sorted(self._load_set(self.marked_file))
        return []

    def get_status(self, session_id, unit_number):
        session = self.get_active_session()
        label = format_unit_label(unit_number, session["prefix"], session["total_rooms"])
        if label in self._load_set(self.marked_file):
            return {"unit_number": unit_number, "status": "marked"}
        if label in self._load_set(self.units_file):
            return {"unit_number": unit_number, "status": "checked"}
        return None

    def set_unit_status(self, session_id, unit_number, status):
        session = self.get_active_session()
        label = format_unit_label(unit_number, session["prefix"], session["total_rooms"])
        checked = self._load_set(self.units_file)
        marked = self._load_set(self.marked_file)
        checked.discard(label)
        marked.discard(label)
        if status == "checked":
            checked.add(label)
        elif status == "marked":
            marked.add(label)
        self._save_set(self.units_file, checked)
        self._save_set(self.marked_file, marked)

    def delete_unit_status(self, session_id, unit_number, status=None):
        session = self.get_active_session()
        label = format_unit_label(unit_number, session["prefix"], session["total_rooms"])
        checked = self._load_set(self.units_file)
        marked = self._load_set(self.marked_file)
        removed = []
        if (status in (None, "checked")) and label in checked:
            checked.remove(label)
            removed.append({"unit_number": unit_number, "status": "checked"})
        if (status in (None, "marked")) and label in marked:
            marked.remove(label)
            removed.append({"unit_number": unit_number, "status": "marked"})
        self._save_set(self.units_file, checked)
        self._save_set(self.marked_file, marked)
        return removed

    def edit_checked_unit(self, session_id, old_number, new_number):
        old_status = self.get_status(session_id, old_number)
        new_status = self.get_status(session_id, new_number)
        if not old_status or old_status["status"] != "checked":
            raise StorageError("Original room is not checked", 404)
        if new_status:
            raise StorageError("New room already has a status", 400)
        self.delete_unit_status(session_id, old_number, "checked")
        self.set_unit_status(session_id, new_number, "checked")

    def toggle_mark(self, session_id, unit_number):
        current = self.get_status(session_id, unit_number)
        if current and current["status"] == "marked":
            self.delete_unit_status(session_id, unit_number, "marked")
            return "unmarked"
        self.set_unit_status(session_id, unit_number, "marked")
        return "marked"


def create_storage():
    load_env_file()
    database_url = os.environ.get("DATABASE_URL")
    storage_backend = os.environ.get("STORAGE_BACKEND", "").lower()
    if database_url or storage_backend == "postgres":
        if not database_url:
            host = os.environ.get("POSTGRES_HOST", "127.0.0.1")
            port = os.environ.get("POSTGRES_PORT", "5432")
            database = os.environ.get("POSTGRES_DB", "postgres")
            user = os.environ.get("POSTGRES_USER", "postgres")
            password = os.environ.get("POSTGRES_PASSWORD", "")
            database_url = f"postgresql://{user}:{password}@{host}:{port}/{database}"
        return PostgresStorage(database_url)

    supabase_url = os.environ.get("SUPABASE_URL")
    publishable_key = os.environ.get("SUPABASE_PUBLISHABLE_KEY")
    app_key = os.environ.get("SUPABASE_TRACKER_APP_KEY")
    if supabase_url and publishable_key and app_key:
        return SupabaseStorage(supabase_url, publishable_key, app_key)
    return JsonFileStorage()
