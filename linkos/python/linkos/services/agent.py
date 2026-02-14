"""Mock AI agent."""

import logging
from typing import Optional

from linkos.models import UnifiedMessage

logger = logging.getLogger(__name__)


class MockAgent:
    """
    Mock AI agent for testing.
    
    Replace with:
    - OpenAI GPT
    - Anthropic Claude
    - Google Gemini
    - Local LLM (Ollama)
    - LangChain agent
    """
    
    async def process_message(
        self, message: UnifiedMessage, context: Optional[dict] = None
    ) -> str:
        """Process message and generate response."""
        platform = message.platform.value.upper()
        content = message.content
        
        # Simple echo response
        return (
            f"✅ Message received from {platform}!\n\n"
            f"💬 You said: {content}\n\n"
            f"🤖 This is a mock AI agent."
        )
