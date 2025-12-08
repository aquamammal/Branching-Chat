# backend/main.py
#
# FastAPI backend for Branching Chat – Columnar Tree UI
# Supports multiple backends:
#   - Ollama (local models)
#   - OpenAI Chat Completions
#   - DeepSeek Chat
#
# Threads can choose their own model on the frontend; the chosen model
# is passed as a string like:
#   "ollama/qwen2.5:7b"
#   "openai/gpt-4.1-mini"
#   "deepseek/deepseek-chat"
#
# If no model is provided, we fall back to DEFAULT_MODEL_SPEC.

from typing import List, Optional
from pathlib import Path
import os

import requests
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv   # <-- ADD THIS
load_dotenv()                    # <-- ADD THIS

# ---------------------------------------------------------
# CONFIG / ENV
# ---------------------------------------------------------

# Default local model for Ollama
DEFAULT_OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")

# Base URL for Ollama's /api/chat
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/chat")

# Optional cloud API keys
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
DEESEEK_API_KEY = os.getenv("DEESEEK_API_KEY")

# Default model routing if frontend doesn't specify one
# e.g. "ollama/qwen2.5:7b"
DEFAULT_MODEL_SPEC = os.getenv("DEFAULT_MODEL_SPEC", f"ollama/{DEFAULT_OLLAMA_MODEL}")

# ---------------------------------------------------------
# FASTAPI APP
# ---------------------------------------------------------
app = FastAPI()


# ---------------------------------------------------------
# DATA MODELS
# ---------------------------------------------------------
class Message(BaseModel):
    role: str   # "user", "assistant", "system"
    content: str


class ChatRequest(BaseModel):
    thread_id: str           # which node this conversation belongs to
    messages: List[Message]  # full history for that node
    model: Optional[str] = None  # e.g. "ollama/qwen2.5:7b", "openai/gpt-4.1-mini"


class ChatResponse(BaseModel):
    thread_id: str
    reply: str


# ---------------------------------------------------------
# PROVIDER-SPECIFIC CALLS
# ---------------------------------------------------------

def call_ollama(model_name: str, messages: List[Message]) -> str:
    """Call a local model via Ollama's /api/chat endpoint."""
    payload = {
        "model": model_name,
        "stream": False,
        "messages": [
            {"role": m.role, "content": m.content}
            for m in messages
        ],
    }

    print(">>> Sending to Ollama:", payload, flush=True)
    try:
        resp = requests.post(OLLAMA_URL, json=payload, timeout=300)
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Ollama connection error: {e}")

    print(">>> Ollama status:", resp.status_code, flush=True)
    print(">>> Ollama raw response:", resp.text[:400], flush=True)

    if not resp.ok:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    data = resp.json()
    # Expected format: { "message": {"role": "...", "content": "..."} , ... }
    try:
        return data["message"]["content"]
    except KeyError:
        raise HTTPException(status_code=500, detail="Unexpected Ollama response format")


def call_openai(model_name: str, messages: List[Message]) -> str:
    """Call OpenAI Chat Completions API."""
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured")

    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model_name,
        "messages": [
            {"role": m.role, "content": m.content}
            for m in messages
        ],
    }

    print(">>> Sending to OpenAI:", {"model": model_name}, flush=True)
    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=300)
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"OpenAI connection error: {e}")

    print(">>> OpenAI status:", resp.status_code, flush=True)
    print(">>> OpenAI raw response:", resp.text[:400], flush=True)

    if not resp.ok:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    data = resp.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError):
        raise HTTPException(status_code=500, detail="Unexpected OpenAI response format")


def call_deepseek(model_name: str, messages: List[Message]) -> str:
    """Call DeepSeek Chat API (example endpoint)."""
    if not DEESEEK_API_KEY:
        raise HTTPException(status_code=500, detail="DEESEEK_API_KEY is not configured")

    url = "https://api.deepseek.com/chat/completions"
    headers = {
        "Authorization": f"Bearer {DEESEEK_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model_name,
        "messages": [
            {"role": m.role, "content": m.content}
            for m in messages
        ],
    }

    print(">>> Sending to DeepSeek:", {"model": model_name}, flush=True)
    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=300)
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"DeepSeek connection error: {e}")

    print(">>> DeepSeek status:", resp.status_code, flush=True)
    print(">>> DeepSeek raw response:", resp.text[:400], flush=True)

    if not resp.ok:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    data = resp.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError):
        raise HTTPException(status_code=500, detail="Unexpected DeepSeek response format")


# ---------------------------------------------------------
# GENERIC LLM DISPATCHER
# ---------------------------------------------------------

def parse_model_spec(spec: Optional[str]) -> tuple[str, str]:
    """Parse a model spec like 'ollama/qwen2.5:7b' into (provider, model_name)."""
    if not spec:
        spec = DEFAULT_MODEL_SPEC

    parts = spec.split("/", 1)
    if len(parts) == 1:
        # Just "ollama" / "openai" / "deepseek" etc – fall back to default model
        provider = parts[0].strip().lower()
        if provider == "ollama":
            return provider, DEFAULT_OLLAMA_MODEL
        elif provider == "openai":
            return provider, "gpt-4.1-mini"
        elif provider == "deepseek":
            return provider, "deepseek-chat"
        else:
            raise HTTPException(status_code=400, detail=f"Unknown provider in model spec: '{spec}'")
    else:
        provider = parts[0].strip().lower()
        model_name = parts[1].strip()
        return provider, model_name


def call_llm(messages: List[Message], model_spec: Optional[str]) -> str:
    provider, model_name = parse_model_spec(model_spec)

    if provider == "ollama":
        return call_ollama(model_name, messages)
    elif provider == "openai":
        return call_openai(model_name, messages)
    elif provider == "deepseek":
        return call_deepseek(model_name, messages)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: '{provider}'")


# ---------------------------------------------------------
# API ROUTE  (before mounting static files)
# ---------------------------------------------------------
@app.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    reply_text = call_llm(req.messages, req.model)
    return ChatResponse(thread_id=req.thread_id, reply=reply_text)


# ---------------------------------------------------------
# FRONTEND STATIC FILES (mount AFTER routes)
# ---------------------------------------------------------
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

# This serves index.html at "/" and all JS files at:
#   /main.js, /state.js, /layout.js, /ui.js
app.mount(
    "/",
    StaticFiles(directory=FRONTEND_DIR, html=True),
    name="frontend",
)
