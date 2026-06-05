import logging

from flask import Flask, jsonify, render_template, request

from storage import (
    StorageError,
    create_storage,
    format_unit_label,
    normalize_prefix,
    normalize_total_rooms,
    normalize_unit_for_session,
)


log = logging.getLogger("werkzeug")
log.setLevel(logging.ERROR)

app = Flask(__name__, template_folder="templates", static_folder="static")
storage = create_storage()


@app.route("/")
def index():
    return render_template("index.html")


def active_session():
    return storage.get_active_session()


def state_payload():
    session = active_session()
    return {
        "sessions": storage.list_sessions(),
        "active_session": session,
        "units": storage.list_unit_labels(session, "checked"),
        "marked": storage.list_unit_labels(session, "marked"),
    }


def ok_state(**extra):
    payload = state_payload()
    payload.update(extra)
    payload["success"] = True
    return jsonify(payload)


def error_response(message, status_code=400):
    return jsonify({"success": False, "message": message}), status_code


def parse_current_unit(raw_value):
    session = active_session()
    try:
        unit_number = normalize_unit_for_session(raw_value, session)
    except ValueError as exc:
        raise StorageError(str(exc), 400)
    return session, unit_number


@app.errorhandler(StorageError)
def handle_storage_error(exc):
    return error_response(str(exc), exc.status_code)


@app.route("/api/state", methods=["GET"])
def get_state():
    return ok_state()


@app.route("/api/sessions", methods=["GET"])
def get_sessions():
    return jsonify({"success": True, "sessions": storage.list_sessions(), "active_session": active_session()})


@app.route("/api/sessions", methods=["POST"])
def create_session():
    data = request.get_json() or {}
    name = str(data.get("name") or "").strip()
    if not name:
        return error_response("Session name is required")
    try:
        prefix = normalize_prefix(data.get("prefix"))
        total_rooms = normalize_total_rooms(data.get("total_rooms"))
    except ValueError as exc:
        return error_response(str(exc))

    session = storage.create_session(name, prefix, total_rooms, make_active=True)
    return ok_state(active_session=session)


@app.route("/api/sessions/<session_id>/activate", methods=["PUT"])
def activate_session(session_id):
    session = storage.set_active_session(session_id)
    return ok_state(active_session=session)


@app.route("/api/units", methods=["GET"])
def get_units():
    session = active_session()
    return jsonify(storage.list_unit_labels(session, "checked"))


@app.route("/api/units", methods=["POST"])
def add_unit():
    data = request.get_json() or {}
    raw_input = data.get("unit", "")
    session, unit_number = parse_current_unit(raw_input)

    current = storage.get_status(session["id"], unit_number)
    unit_label = format_unit_label(unit_number, session["prefix"], session["total_rooms"])
    if current and current["status"] == "checked":
        return error_response(f"Room '{unit_label}' is already checked")
    if current and current["status"] == "marked":
        return error_response(f"Room '{unit_label}' is marked as unavailable. Unmark it first")

    storage.set_unit_status(session["id"], unit_number, "checked")
    return ok_state(unit=unit_label)


@app.route("/api/units/<path:unit>", methods=["DELETE"])
def delete_unit(unit):
    session, unit_number = parse_current_unit(unit)
    removed = storage.delete_unit_status(session["id"], unit_number, "checked")
    if not removed:
        unit_label = format_unit_label(unit_number, session["prefix"], session["total_rooms"])
        return error_response(f"Room '{unit_label}' is not checked", 404)
    return ok_state()


@app.route("/api/units", methods=["PUT"])
def edit_unit():
    data = request.get_json() or {}
    old_raw = data.get("old_unit", "")
    new_raw = data.get("new_unit", "")
    session, old_number = parse_current_unit(old_raw)
    try:
        new_number = normalize_unit_for_session(new_raw, session)
    except ValueError as exc:
        return error_response(str(exc))

    storage.edit_checked_unit(session["id"], old_number, new_number)
    unit_label = format_unit_label(new_number, session["prefix"], session["total_rooms"])
    return ok_state(unit=unit_label)


@app.route("/api/marked", methods=["GET"])
def get_marked_units():
    session = active_session()
    return jsonify(storage.list_unit_labels(session, "marked"))


@app.route("/api/marked", methods=["POST"])
def add_marked_unit():
    data = request.get_json() or {}
    session, unit_number = parse_current_unit(data.get("unit", ""))
    storage.set_unit_status(session["id"], unit_number, "marked")
    return ok_state()


@app.route("/api/marked/<path:unit>", methods=["DELETE"])
def delete_marked_unit(unit):
    session, unit_number = parse_current_unit(unit)
    storage.delete_unit_status(session["id"], unit_number, "marked")
    return ok_state()


@app.route("/api/marked/<path:unit>/toggle", methods=["POST"])
def toggle_marked_unit(unit):
    session, unit_number = parse_current_unit(unit)
    action = storage.toggle_mark(session["id"], unit_number)
    return ok_state(action=action)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False, use_reloader=False)
