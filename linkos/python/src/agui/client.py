"""AG-UI protocol client for agent communication."""

import asyncio
import logging
from typing import Optional, AsyncIterator, Dict, Any
import httpx
import json

from linkos.models import UnifiedMessage

logger = logging.getLogger(__name__)


class AGUIClient:
    """
    AG-UI protocol client that connects to any AG-UI-compatible agent.
    
    This allows linkos to work with any agent framework (ADK, LangChain, CrewAI)
    without custom wrappers - just the AG-UI protocol.
    """
    
    def __init__(self, endpoint: str, headers: Optional[Dict[str, str]] = None):
        """
        Initialize AG-UI client.
        
        Args:
            endpoint: URL of AG-UI agent endpoint (e.g., "http://localhost:8000/agent")
            headers: Optional HTTP headers for authentication
        """
        self.endpoint = endpoint
        self.headers = headers or {}
        self.timeout = httpx.Timeout(60.0, connect=5.0)
        
        logger.info(f"✅ AG-UI client initialized: {endpoint}")
    
    async def process_message(
        self, 
        message: UnifiedMessage, 
        context: Optional[dict] = None
    ) -> str:
        """
        Process a message through the AG-UI agent.
        
        Args:
            message: Unified message from messaging platform
            context: Optional session context
            
        Returns:
            Agent's text response
        """
        try:
            # Build proper AG-UI RunAgentInput
            # Ref: https://docs.ag-ui.com/sdk/python/core/types#runagentinput
            input_data = {
                "threadId": message.session_id,
                "runId": f"run_{message.id}",
                "state": {},  # Empty state for now
                "messages": [
                    {
                        "id": message.id,
                        "role": "user",
                        "content": message.content,
                        "user": {
                            "id": message.user_id
                        }
                    }
                ],
                "tools": [],  # No tools for now
                "context": [],  # Empty context list
                "forwardedProps": {}  # Empty forwarded props
            }
            
            logger.info(f"📤 Sending to AG-UI agent: {message.content[:50]}...")
            
            # Send to AG-UI endpoint and stream events
            response_text = await self._run_agent(input_data)
            
            logger.info(f"✅ AG-UI agent responded ({len(response_text)} chars)")
            return response_text
            
        except Exception as e:
            logger.error(f"AG-UI client error: {e}", exc_info=True)
            return f"❌ Error communicating with agent: {str(e)}"
    
    async def _run_agent(self, input_data: Dict[str, Any]) -> str:
        """Run agent via HTTP POST and stream events."""
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                # POST to AG-UI endpoint
                response = await client.post(
                    self.endpoint,
                    json=input_data,
                    headers={
                        **self.headers,
                        "Content-Type": "application/json",
                        "Accept": "text/event-stream"  # Request SSE
                    }
                )
                
                response.raise_for_status()
                
                # Stream and accumulate text
                text_parts = []
                
                # Check if response is streaming (SSE) or JSON
                content_type = response.headers.get("content-type", "")
                logger.info(f"📦 Response content-type: {content_type}")
                
                if "text/event-stream" in content_type:
                    logger.info("📡 Streaming AG-UI events...")
                    # Stream SSE events from AG-UI protocol
                    async for event in self._parse_sse_stream(response):
                        event_type = event.get("type")
                        
                        # Log all events
                        logger.info(f"📡 AG-UI Event: {event_type}")
                        logger.debug(f"Event data: {event}")
                        
                        # Handle AG-UI event types (uppercase format)
                        if event_type in ("TEXT_MESSAGE_CONTENT", "textMessageContent"):
                            # Accumulate text deltas
                            delta = event.get("delta", "")
                            if delta:
                                text_parts.append(delta)
                                logger.info(f"📝 Delta: '{delta}'")
                        
                        elif event_type in ("RUN_FINISHED", "runFinished"):
                            # Agent completed
                            logger.info(f"✅ AG-UI run finished - Captured {len(''.join(text_parts))} chars")
                        
                else:
                    # Simple JSON response (non-streaming)
                    logger.info("📄 Parsing JSON response...")
                    result = response.json()
                    logger.info(f"📄 JSON result keys: {list(result.keys()) if isinstance(result, dict) else type(result)}")
                    
                    if isinstance(result, dict):
                        # Try common response fields
                        text = None
                        
                        # Try different possible field names
                        for field in ("text", "content", "response", "message", "output"):
                            if field in result:
                                text = result[field]
                                logger.info(f"✅ Found text in field '{field}': {text[:50] if text else 'empty'}...")
                                break
                        
                        if not text:
                            # Last resort: convert whole result to string
                            text = str(result)
                            logger.warning(f"⚠️  No standard text field found, using full JSON: {text[:100]}...")
                        
                        text_parts.append(text)
                    elif isinstance(result, str):
                        text_parts.append(result)
                    else:
                        text_parts.append(str(result))
                
                return "".join(text_parts) if text_parts else "No response from agent"
                
            except httpx.HTTPStatusError as e:
                logger.error(f"HTTP error {e.response.status_code}: {e.response.text}")
                raise
            except httpx.RequestError as e:
                logger.error(f"Request error: {e}")
                raise
    
    async def _parse_sse_stream(self, response: httpx.Response) -> AsyncIterator[Dict]:
        """
        Parse Server-Sent Events stream.
        
        AG-UI events format:
        data: {"type":"TEXT_MESSAGE_CONTENT","delta": "Hello", "messageId": "msg_123"}
        """
        buffer = ""
        event_count = 0
        
        logger.info("🔍 Starting SSE stream parsing...")
        
        async for chunk in response.aiter_text():
            buffer += chunk
            logger.debug(f"📥 SSE chunk ({len(chunk)} chars)")
            
            while "\n\n" in buffer:
                event_text, buffer = buffer.split("\n\n", 1)
                logger.debug(f"🔍 SSE event text:\n{event_text}")
                
                event = self._parse_sse_event(event_text)
                if event:
                    event_count += 1
                    logger.info(f"✅ Parsed event #{event_count}: {event.get('type')}")
                    yield event
                else:
                    logger.warning(f"⚠️  Failed to parse SSE event")
        
        logger.info(f"🔍 SSE stream complete. Total events: {event_count}")
    
    def _parse_sse_event(self, event_text: str) -> Optional[Dict]:
        """
        Parse a single SSE event from AG-UI protocol.
        
        AG-UI format (type is INSIDE the JSON data):
        data: {"type":"TEXT_MESSAGE_CONTENT","delta":"Hello","messageId":"msg_123"}
        
        NOT the standard SSE format with separate event line.
        """
        event_data = None
        
        for line in event_text.split("\n"):
            if line.startswith("data:"):
                data_str = line[5:].strip()
                try:
                    # Parse JSON - the type is inside the data
                    event_data = json.loads(data_str)
                except json.JSONDecodeError as e:
                    logger.warning(f"Failed to parse SSE JSON: {e} - Data: {data_str[:100]}")
                    return None
        
        # Return the parsed JSON directly (type is already in the dict)
        return event_data
