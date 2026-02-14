import os
import uvicorn
from fastapi import FastAPI

from dotenv import load_dotenv

load_dotenv()

from ag_ui_langgraph import LangGraphAgent, add_langgraph_fastapi_endpoint
from copilotkit import LangGraphAGUIAgent
from agent import graph as agentic_chat_graph

from fastapi.middleware.cors import CORSMiddleware
from linkos import Gateway

app = FastAPI(title="LangGraph Dojo Example Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

langgraph_agent = LangGraphAGUIAgent(
        name="mcpAssistant",
        description="An example for an agentic chat flow using LangGraph.",
        graph=agentic_chat_graph,
    )


@app.middleware("http")
async def log_requests(request, call_next):
    print(f"📥 Agent received: {request.method} {request.url.path}")
    try:
        response = await call_next(request)
        print(f"📤 Agent response status: {response.status_code}")
        return response
    except Exception as e:
        print(f"❌ Agent error: {e}")
        raise

add_langgraph_fastapi_endpoint(
    app=app, agent=langgraph_agent, path="/agent"
)

# Start Linkos Gateway (Magic Mode: auto-starts matching env/config)
# Gateway(agent=langgraph_agent)
