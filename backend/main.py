# backend/main.py

from typing import List

import requests
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ---------------------------------------------------------
# CONFIG: local LLM connection (Ollama)
# ---------------------------------------------------------
OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL_NAME = "qwen3:14b"  # exact name from `ollama list`


# ---------------------------------------------------------
# FASTAPI APP
# ---------------------------------------------------------
app = FastAPI()

app.mount("/static", StaticFiles(directory="frontend"), name="static")


class ChatRequest(BaseModel):
  thread_id: str
  message: str


class ChatResponse(BaseModel):
  thread_id: str
  reply: str


@app.get("/")
def root():
  return FileResponse("frontend/index.html")


# ---------------------------------------------------------
# LLM CALL (Ollama)
# ---------------------------------------------------------
def call_llm(message_text: str) -> str:
  """
  Call the local LLM via Ollama's /api/chat endpoint.
  For now we just send the single user message.
  """
  payload = {
    "model": MODEL_NAME,
    "stream": False,
    "messages": [
      {"role": "user", "content": message_text}
    ],
  }

  print(">>> Sending to Ollama:", payload, flush=True)

  resp = requests.post(OLLAMA_URL, json=payload, timeout=300)
  print(">>> Ollama status:", resp.status_code, flush=True)
  print(">>> Ollama raw response:", resp.text[:300], flush=True)

  resp.raise_for_status()
  data = resp.json()

  # Expected format: { "message": {"role": "...", "content": "..."} , ... }
  return data["message"]["content"]


# ---------------------------------------------------------
# API ROUTE
# ---------------------------------------------------------
@app.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
  reply_text = call_llm(req.message)
  return ChatResponse(thread_id=req.thread_id, reply=reply_text)
