Branching-Chat — A Multi-Model, Branching LLM Interface

Branching-Chat is an experimental graph-based chat interface for exploring multiple parallel conversations with local and cloud LLMs.
Instead of a single linear thread, every assistant message can be branched by highlighting text, spawning a new conversation node to the right.

Each node runs its own LLM (Ollama, OpenAI, DeepSeek, etc.), and child nodes automatically inherit their parent’s chosen model.

This project includes:

A fully client-side branching chat UI (HTML/CSS/JS)

A FastAPI backend with unified LLM routing

Native support for local Ollama models

Cloud support for OpenAI, DeepSeek, and any provider you add

SVG connection lines between parent/child nodes

Drag-and-drop repositioning

Dynamic column layout algorithm

Features
🌳 Branching Chat Tree

Highlight any text in an assistant reply → click Branch selection → new thread appears to the right.

Unlimited depth and unlimited branching.

🧠 Per-Thread Model Selection

Each node can choose its own LLM:

Local Ollama models (Qwen, Llama, Dolphin, Mistral, Wizard…)

OpenAI GPT-4.1 / GPT-4.1-mini

DeepSeek Chat

Easily extendable

Child nodes inherit their parent’s model automatically.

🎨 Dynamic Layout Engine

Auto-position threads by column

Prevent vertical overlap

Drag nodes manually

SVG lines update automatically

🧩 Extensible Architecture

Switch, add, or remove LLM providers

Fully modular frontend (state.js, layout.js, ui.js, svg.js)

Clean FastAPI backend routing based on "provider/model" strings

Project Structure
branching-chat/
│
├── backend/
│   └── main.py              # FastAPI backend + LLM dispatch
│
├── frontend/
│   ├── index.html           # Main UI container
│   ├── main.js              # Mounts UI + layout logic
│   ├── state.js             # Thread data model
│   ├── layout.js            # Column/vertical layout engine
│   ├── ui.js                # Rendering, branching, model select, interactions
│   ├── svg.js               # Connection line rendering
│   └── ...
│
├── .env                     # API keys (not committed)
└── README.md

Installation
1️⃣ Clone the repo
git clone https://github.com/yourname/branching-chat.git
cd branching-chat

2️⃣ Create & activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate

3️⃣ Install dependencies
pip install fastapi uvicorn requests python-dotenv

4️⃣ Install & run Ollama (optional for local models)

https://ollama.com/download

Example models to pull:

ollama pull qwen2.5:7b
ollama pull dolphin-mixtral:latest
ollama pull llama3.1:latest

5️⃣ Create .env file at repo root
OPENAI_API_KEY=your-openai-key
DEESEEK_API_KEY=your-deepseek-key
OLLAMA_URL=http://localhost:11434/api/chat
DEFAULT_MODEL_SPEC=ollama/qwen2.5:7b

Running the App

Start the backend:

uvicorn backend.main:app --reload


Then open the UI:

http://localhost:8000


That’s it — the frontend files are served directly by FastAPI.

Using the Interface
💬 Creating Threads

A root conversation appears immediately.

Click + New Root Conversation for more independent starting points.

🌿 Branching

Highlight text inside an assistant message

Click Branch selection →

A new thread appears in the next column

It inherits the parent’s model spec

🤖 Changing Models

Each node footer contains:

[ Model dropdown ] [ input bar ] [ Send ]


Switching models affects:

all future requests from this node

its newly-created children (inherit automatically)

🎛 Moving Nodes

Drag a thread by its header to override its vertical position.

🔗 Visual Links

Nodes are connected by live-updating curved SVG paths.

Supported Providers
1. Ollama (Local)

Model spec format:

ollama/<model-name>


Example:

ollama/qwen2.5:7b
ollama/llama3.1:latest

2. OpenAI

Requires OPENAI_API_KEY.

Model spec:

openai/gpt-4.1-mini
openai/gpt-4.1

3. DeepSeek

Requires DEESEEK_API_KEY.

Model spec:

deepseek/deepseek-chat

How Model Routing Works

In the backend main.py, every model spec is parsed like:

provider/model_name


Example:

openai/gpt-4.1-mini
ollama/qwen3:14b
deepseek/deepseek-chat


The dispatcher chooses the right function:

if provider == "ollama":
    return call_ollama(...)
elif provider == "openai":
    return call_openai(...)
elif provider == "deepseek":
    return call_deepseek(...)

Extending the System
➕ Adding a new provider

Write a function call_<provider>()

Accept (model_name, messages)

Add a routing case in call_llm

Add to dropdown in ui.js in MODEL_OPTIONS

➕ Adding default system prompts

Modify:

state.js → createRootThread()
state.js → createThread()

➕ Adding UI themes

Modify CSS in index.html.

Troubleshooting
❌ “DEESEEK_API_KEY is not configured”

Your .env is not loading.
Make sure your backend/main.py includes:

from dotenv import load_dotenv
load_dotenv()

❌ Local model errors

Did you pull the model?

Does the name match the Ollama list? (ollama list)

❌ Send button outside the box

Set minimum thread width in:

index.html

layout.js

initial slider value in ui.js

Roadmap Ideas

Token usage display per node

Export/import entire chat trees

Minimap of conversation graph

Model-wise performance comparison mode

Saving conversation history to disk

Collapsible columns

License

MIT — free to use, modify, and build on.