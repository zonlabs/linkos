"""Telegram WebSocket client."""

import asyncio
import logging
from typing import TYPE_CHECKING

from telegram import Update
from telegram.ext import Application, MessageHandler, filters, ContextTypes

from linkos.models import UnifiedMessage, Platform, MessageType, MessageContext

if TYPE_CHECKING:
    from linkos.services.router import MessageRouter

logger = logging.getLogger(__name__)


class TelegramClient:
    """
    Telegram client using python-telegram-bot library.
    
    Uses long-polling (alternative to webhooks) - no public URL needed!
    """
    
    def __init__(self, token: str, router: "MessageRouter"):
        """Initialize Telegram client."""
        self.token = token
        self.router = router
        self.app = Application.builder().token(token).build()
        
        # Register message handler
        self.app.add_handler(
            MessageHandler(filters.TEXT & ~filters.COMMAND, self._handle_message)
        )
    
    async def _handle_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle incoming Telegram message."""
        if not update.message:
            return
        
        message = update.message
        user = message.from_user
        
        # Convert to UnifiedMessage
        unified_msg = UnifiedMessage(
            id=f"tg_{message.message_id}",
            platform=Platform.TELEGRAM,
            user_id=str(user.id),
            session_id=f"telegram:{user.id}",
            content=message.text or "",
            message_type=MessageType.TEXT,
            metadata={
                "username": user.username,
                "first_name": user.first_name,
                "chat_id": message.chat_id,
            },
            context=MessageContext(),
        )
        
        logger.info(f"📨 Telegram message from {user.first_name}: {message.text}")
        
        # Route through message router
        response = await self.router.route_message(unified_msg)
        
        # Send response back to Telegram
        await message.reply_text(response)
    
    async def start(self):
        """Start the Telegram client with long polling."""
        logger.info("🤖 Starting Telegram client...")
        await self.app.initialize()
        await self.app.start()
        await self.app.updater.start_polling()
        
        logger.info("✅ Telegram client running (long polling)")
        logger.info("📱 Send a message to your bot on Telegram to test!")
        
        # Keep running until stopped
        try:
            # This will run forever until interrupted
            await asyncio.Event().wait()
        finally:
            await self.app.updater.stop()
            await self.app.stop()
            await self.app.shutdown()
    
    async def stop(self):
        """Stop the Telegram client."""
        logger.info("Stopping Telegram client...")
        await self.app.stop()
