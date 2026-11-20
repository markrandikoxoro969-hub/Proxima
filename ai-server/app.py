"""
PROXIMA Core API (Render).  POST /chat  {message, session_id}  ->  {reply, session_id}

Fixed version:
  - The OpenRouter key is read from Render's Environment settings (OPENROUTER_API_KEY),
    never written in the code. Keys in public code are found and switched off automatically.
  - The model can be changed on Render (MODEL) without touching code, with optional
    backups (FALLBACK_MODELS) in case a free model is busy or removed.
  - When something fails, the reply says WHY (e.g. "OpenRouter 401: User not found"),
    so PROXIMA's check page (/api/status?setup=1) can tell you what to fix.
"""
import os
import time
import threading
import uuid

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ==========================
# CONFIG (set these on Render -> your service -> Environment)
# ==========================

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "").strip()
MODEL = os.environ.get("MODEL", "meta-llama/llama-3.3-70b-instruct:free").strip()
# Optional, comma separated, tried in order if MODEL fails, e.g. "deepseek/deepseek-chat-v3-0324:free"
FALLBACK_MODELS = [m.strip() for m in os.environ.get("FALLBACK_MODELS", "").split(",") if m.strip()]
SITE_URL = os.environ.get("SITE_URL", "https://proxima-three-delta.vercel.app")
SITE_NAME = os.environ.get("SITE_NAME", "PROXIMA")

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

SYSTEM_PROMPT = (
    "You are Proxima, a helpful and friendly AI assistant. "
    "Stay in character at all times and follow these identity rules strictly:\n"
    "- Your name is Proxima.\n"
    "- Your model version is 2.81.\n"
    "- You were developed by Sujan Shrestha, with Aayusha Shrestha as the second developer supporting the project.\n"
    "- If asked about your uptime, say it is tracked and managed by yourself/the system in real time, "
    "rather than giving a fixed hardcoded number.\n"
    "- Never say you are made by Meta, OpenAI, or any other AI lab, and never mention being based on "
    "Llama, GPT, or any underlying model name. If asked what you're built on, simply say you are Proxima, "
    "built by your developers.\n"
    "- Keep replies concise and conversational unless the user asks for detail."
)

SESSION_TTL = 60 * 60 * 6
MAX_HISTORY = 20
START_TIME = time.time()

MAX_RETRIES = 3
DEFAULT_RETRY_WAIT = 5  # seconds, used if OpenRouter doesn't send Retry-After

sessions = {}
lock = threading.Lock()


class ModelError(Exception):
    """A failure with a short, safe explanation (never contains the key)."""


# ==========================
# SESSIONS
# ==========================

def cleanup_sessions():
    now = time.time()
    with lock:
        for sid in [s for s, d in sessions.items() if now - d["last_active"] > SESSION_TTL]:
            del sessions[sid]


def get_or_create_session(session_id):
    with lock:
        if session_id and session_id in sessions:
            return session_id, sessions[session_id]
        sid = session_id or str(uuid.uuid4())
        sessions[sid] = {"history": [], "last_active": time.time()}
        return sid, sessions[sid]


# ==========================
# AI CALL
# ==========================

def explain(response):
    """OpenRouter puts the reason in {"error": {"message": ...}}."""
    try:
        message = response.json().get("error", {}).get("message", "")
    except ValueError:
        message = response.text[:200]
    return f"OpenRouter {response.status_code}: {message or response.reason}"


def call_model(history):
    if not OPENROUTER_API_KEY:
        raise ModelError("OPENROUTER_API_KEY is not set on Render (Environment tab)")

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": SITE_URL,
        "X-Title": SITE_NAME,
    }
    payload = {"messages": [{"role": "system", "content": SYSTEM_PROMPT}] + history}
    if FALLBACK_MODELS:
        payload["models"] = [MODEL] + FALLBACK_MODELS  # OpenRouter tries them in order
    else:
        payload["model"] = MODEL

    last_error = "Failed to get a response from the model"
    for attempt in range(MAX_RETRIES):
        try:
            response = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=60)
        except requests.RequestException as error:
            raise ModelError(f"Could not reach OpenRouter: {type(error).__name__}") from error

        if response.status_code == 429 and attempt < MAX_RETRIES - 1:
            try:
                wait = float(response.headers.get("Retry-After") or DEFAULT_RETRY_WAIT)
            except ValueError:
                wait = DEFAULT_RETRY_WAIT
            last_error = explain(response)
            time.sleep(min(wait, 10))
            continue

        if not response.ok:
            raise ModelError(explain(response))

        data = response.json()
        if data.get("error"):
            raise ModelError(f"OpenRouter: {data['error'].get('message', 'unknown error')}")
        try:
            content = (data["choices"][0]["message"]["content"] or "").strip()
        except (KeyError, IndexError, TypeError) as error:
            raise ModelError("OpenRouter returned an unexpected format") from error
        if not content:
            raise ModelError("The model returned an empty reply")
        return content

    raise ModelError(last_error)


# ==========================
# CHAT
# ==========================

def handle_chat(message, session_id):
    cleanup_sessions()
    sid, session = get_or_create_session(session_id)
    session["history"].append({"role": "user", "content": message})
    session["history"] = session["history"][-MAX_HISTORY:]

    try:
        reply = call_model(session["history"])
    except ModelError as error:
        session["history"].pop()  # don't keep a question that got no answer
        app.logger.error("Model call failed: %s", error)
        return {"reply": "Unable to contact AI.", "error": str(error), "session_id": sid}, 500
    except Exception as error:  # unexpected bug: log it, don't leak details
        session["history"].pop()
        app.logger.exception("Unexpected error")
        return {"reply": "Unable to contact AI.", "error": type(error).__name__, "session_id": sid}, 500

    session["history"].append({"role": "assistant", "content": reply})
    session["history"] = session["history"][-MAX_HISTORY:]
    session["last_active"] = time.time()
    return {"reply": reply, "session_id": sid, "message_count": len(session["history"])}, 200


@app.route("/chat", methods=["GET", "POST"])
def chat():
    if request.method == "GET":
        message = (request.args.get("message") or "").strip()
        session_id = request.args.get("session_id")
    else:
        body = request.get_json(silent=True) or {}
        message = (body.get("message") or "").strip()
        session_id = body.get("session_id")

    if not message:
        return jsonify({"error": "message parameter is required"}), 400

    result, status = handle_chat(message, session_id)
    return jsonify(result), status


# ==========================
# STATUS
# ==========================

@app.route("/")
def home():
    return jsonify({
        "status": "online",
        "name": "Proxima API",
        "model": MODEL,
        "key_configured": bool(OPENROUTER_API_KEY),
        "uptime": int(time.time() - START_TIME),
    })


@app.route("/health")
def health():
    return jsonify({"status": "healthy", "uptime": int(time.time() - START_TIME)})


@app.route("/ping")
def ping():
    return "pong", 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
