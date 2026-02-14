"""Discord WebSocket client."""

import logging
import time
from typing import TYPE_CHECKING, List

import discord
from discord.ext import commands

from linkos.models import UnifiedMessage, Platform, MessageType, MessageContext

if TYPE_CHECKING:
    from linkos.services.router import MessageRouter

logger = logging.getLogger(__name__)


class DiscordClient:
    """
    Discord client using discord.py library.
    
    Uses Discord Gateway (WebSocket) - no webhook needed!
    """
    
    # Constants
    MESSAGE_CHUNK_SIZE = 1900
    STREAM_UPDATE_INTERVAL = 0.5

    def __init__(self, token: str, router: "MessageRouter"):
        """Initialize Discord client."""
        self.token = token
        self.router = router
        
        # Set up intents
        intents = discord.Intents.default()
        intents.message_content = True  # Required to read message content
        
        self.bot = commands.Bot(command_prefix="!", intents=intents)
        
        # Register event handlers
        @self.bot.event
        async def on_ready():
            logger.info(f"✅ Discord client logged in as {self.bot.user}")
        
        @self.bot.event
        async def on_message(message: discord.Message):
            # Ignore bot's own messages
            if message.author == self.bot.user:
                return
            
            await self._handle_message(message)
    
    async def _handle_message(self, message: discord.Message):
        """Handle incoming Discord message with streaming support."""
        # Convert to UnifiedMessage
        unified_msg = UnifiedMessage(
            id=f"discord_{message.id}",
            platform=Platform.DISCORD,
            user_id=str(message.author.id),
            session_id=f"discord:{message.author.id}",
            content=message.content,
            message_type=MessageType.TEXT,
            metadata={
                "username": message.author.name,
                "display_name": message.author.display_name,
                "channel_id": str(message.channel.id),
                "guild_id": str(message.guild.id) if message.guild else None,
            },
            context=MessageContext(),
        )
        
        logger.info(f"📨 Discord message from {message.author.name}: {message.content}")
        
        # Streaming state
        full_response = ""
        sent_messages: List[discord.Message] = []
        last_update_time = 0.0
        
        async def update_discord_messages():
            """Update Discord messages with current full response."""
            nonlocal full_response
            chunks = self._chunk_message(full_response)
            
            # Send new messages for any new chunks
            while len(sent_messages) < len(chunks):
                next_chunk_idx = len(sent_messages)
                content = chunks[next_chunk_idx]
                if not content:
                    continue
                    
                msg = await message.channel.send(content)
                sent_messages.append(msg)
            
            # Edit the last message if content has changed
            if sent_messages:
                last_msg_idx = len(sent_messages) - 1
                last_msg = sent_messages[last_msg_idx]
                new_content = chunks[last_msg_idx]
                
                if last_msg.content != new_content:
                    try:
                        await last_msg.edit(content=new_content)
                        # Manually update local cache to prevent redundant edits
                        last_msg.content = new_content
                    except discord.HTTPException:
                        # Ignore rate limit errors during rapid streaming
                        pass

        async def on_token(token: str):
            """Callback for new token generation."""
            nonlocal full_response, last_update_time
            full_response += token
            
            # Rate limiting check
            now = time.time()
            if now - last_update_time < self.STREAM_UPDATE_INTERVAL:
                return
            
            await update_discord_messages()
            last_update_time = now

        # Show typing indicator while generating response
        async with message.channel.typing():
            final_response = await self.router.route_message(unified_msg, on_token=on_token)
        
        # Ensure final state is consistent
        full_response = final_response
        await update_discord_messages()
    
    def _chunk_message(self, text: str, chunk_size: int = None) -> List[str]:
        """Split text into chunks of specified maximum size."""
        size = chunk_size or self.MESSAGE_CHUNK_SIZE
        return [text[i:i + size] for i in range(0, len(text), size)]
    
    async def start(self):
        """Start the Discord client."""
        logger.info("🤖 Starting Discord client...")
        await self.bot.start(self.token)
    
    async def stop(self):
        """Stop the Discord client."""
        logger.info("Stopping Discord client...")
        await self.bot.close()
