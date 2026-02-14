import asyncio
import logging
import time
from typing import TYPE_CHECKING, List

from telegram import Update, Message
from telegram.ext import Application, MessageHandler, filters, ContextTypes
from telegram.error import TelegramError

from linkos.models import UnifiedMessage, Platform, MessageType, MessageContext

if TYPE_CHECKING:
    from linkos.services.router import MessageRouter

logger = logging.getLogger(__name__)


class TelegramClient:
    """
    Telegram client using python-telegram-bot library.
    
    Uses long-polling (alternative to webhooks) - no public URL needed!
    """
    
    # Constants
    MESSAGE_CHUNK_SIZE = 4000  # Telegram limit is 4096
    STREAM_UPDATE_INTERVAL = 1.0  # Telegram strict rate limits on edits

    def __init__(self, token: str, router: "MessageRouter"):
        """Initialize Telegram client."""
        self.token = token
        self.router = router
        self.app = Application.builder().token(token).build()
        self._stop_event = asyncio.Event()
        
        # Register message handler
        self.app.add_handler(
            MessageHandler(filters.TEXT & ~filters.COMMAND, self._handle_message)
        )
    
    async def _handle_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle incoming Telegram message with streaming support."""
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
        
        # Streaming state
        full_response = ""
        sent_messages: List[Message] = []
        last_update_time = 0.0
        
        async def update_telegram_messages():
            """Update Telegram messages with current full response."""
            nonlocal full_response
            chunks = self._chunk_message(full_response)
            
            # Send new messages for new chunks
            while len(sent_messages) < len(chunks):
                next_chunk_idx = len(sent_messages)
                content = chunks[next_chunk_idx]
                if not content:
                    continue
                
                # Reply to original message
                msg = await message.reply_text(content)
                sent_messages.append(msg)
            
            # Edit the last message if content has changed
            if sent_messages:
                last_msg_idx = len(sent_messages) - 1
                last_msg = sent_messages[last_msg_idx]
                new_content = chunks[last_msg_idx]
                
                if last_msg.text != new_content:
                    try:
                        await last_msg.edit_text(new_content)
                    except TelegramError:
                        # Ignore rate limit errors or "message not modified"
                        pass

        async def on_token(token: str):
            """Callback for new token generation."""
            nonlocal full_response, last_update_time
            full_response += token
            
            # Rate limiting check
            now = time.time()
            if now - last_update_time < self.STREAM_UPDATE_INTERVAL:
                return
            
            await update_telegram_messages()
            last_update_time = now

        # Show typing action while generating response
        await message.chat.send_action(action="typing")
        
        final_response = await self.router.route_message(unified_msg, on_token=on_token)
        
        # Ensure final state is consistent
        full_response = final_response
        await update_telegram_messages()

    def _chunk_message(self, text: str, chunk_size: int = None) -> List[str]:
        """Split text into chunks of specified maximum size."""
        size = chunk_size or self.MESSAGE_CHUNK_SIZE
        return [text[i:i + size] for i in range(0, len(text), size)]
    
    async def start(self):
        """Start the Telegram client with long polling."""
        logger.info("🤖 Starting Telegram client...")
        await self.app.initialize()
        await self.app.start()
        await self.app.updater.start_polling()
        
        logger.info("✅ Telegram client running (long polling)")
        logger.info("📱 Send a message to your bot on Telegram to test!")
        
        # Keep running until stop requested
        try:
            await self._stop_event.wait()
        finally:
            logger.info("🛑 Telegram client shutting down...")
            if self.app.updater.running:
                await self.app.updater.stop()
            if self.app.running:
                await self.app.stop()
            await self.app.shutdown()
            logger.info("✅ Telegram client stopped")
    
    async def stop(self):
        """Stop the Telegram client."""
        logger.info("Stopping Telegram client...")
        self._stop_event.set()
