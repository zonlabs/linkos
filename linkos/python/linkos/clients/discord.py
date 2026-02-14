"""Discord WebSocket client."""

import logging
from typing import TYPE_CHECKING

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
        """Handle incoming Discord message."""
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
        
        # Route through message router
        response = await self.router.route_message(unified_msg)
        
        # Send response back to Discord
        await message.channel.send(response)
    
    async def start(self):
        """Start the Discord client."""
        logger.info("🤖 Starting Discord client...")
        await self.bot.start(self.token)
    
    async def stop(self):
        """Stop the Discord client."""
        logger.info("Stopping Discord client...")
        await self.bot.close()
