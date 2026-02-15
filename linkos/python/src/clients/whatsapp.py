"""WhatsApp Client (Bridge Mode)."""

import asyncio
import logging
import json
import websockets
from typing import TYPE_CHECKING, Optional, List

from linkos.models import UnifiedMessage, Platform, MessageType, MessageContext

if TYPE_CHECKING:
    from linkos.services.router import MessageRouter

logger = logging.getLogger(__name__)


class WhatsAppClient:
    """
    WhatsApp client connecting to local Bridge (Baileys).
    """
    
    def __init__(
        self, 
        bridge_url: str,
        router: "MessageRouter"
    ):
        """
        Initialize WhatsApp client.
        
        Args:
            bridge_url: WebSocket URL of the bridge (e.g., ws://localhost:6001)
            router: MessageRouter
        """
        self.bridge_url = bridge_url
        self.router = router
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self._stop_event = asyncio.Event()
        self._run_task: Optional[asyncio.Task] = None
    
    async def start(self):
        """Start the client connection to bridge."""
        logger.info(f"🤖 Starting WhatsApp client (Bridge: {self.bridge_url})...")
        self._stop_event.clear()
        
        # Start connection loop in background
        self._run_task = asyncio.create_task(self._run_loop())
        
        logger.info("✅ WhatsApp client started (connecting...)")
        
        # Wait until stopped
        try:
            await self._stop_event.wait()
        finally:
            if self._run_task:
                self._run_task.cancel()
                try:
                    await self._run_task
                except asyncio.CancelledError:
                    pass
            await self.close()
            logger.info("✅ WhatsApp client stopped")

    async def stop(self):
        """Stop the client."""
        logger.info("Stopping WhatsApp client...")
        self._stop_event.set()

    async def close(self):
        """Close connection."""
        if self.ws:
            await self.ws.close()
            self.ws = None

    async def _run_loop(self):
        """Persistent connection loop."""
        while not self._stop_event.is_set():
            try:
                async with websockets.connect(self.bridge_url) as ws:
                    self.ws = ws
                    logger.info("✅ Connected to WhatsApp Bridge!")
                    
                    async for message in ws:
                        await self._handle_message(message)
                        
            except (websockets.ConnectionClosed, ConnectionRefusedError) as e:
                if not self._stop_event.is_set():
                    logger.warning(f"⚠️ WhatsApp Bridge disconnected: {e}. Retrying in 5s...")
                    await asyncio.sleep(5)
            except Exception as e:
                logger.error(f"WhatsApp Client Error: {e}")
                await asyncio.sleep(5)

    async def _handle_message(self, raw_data: str):
        """Handle incoming bridge message."""
        try:
            data = json.loads(raw_data)
            
            if data.get("type") != "message":
                return
                
            user_id = data.get("from")
            text = data.get("content")
            name = data.get("name", "Unknown")
            msg_id = data.get("id", "unknown")
            
            if not user_id or not text:
                return

            # Convert to UnifiedMessage
            unified_msg = UnifiedMessage(
                id=f"wa_{msg_id}",
                platform=Platform.WHATSAPP,
                user_id=user_id,
                session_id=f"whatsapp:{user_id}",
                content=text,
                message_type=MessageType.TEXT,
                metadata={
                    "name": name,
                    "bridge_id": msg_id
                },
                context=MessageContext(),
            )
            
            logger.info(f"📨 WhatsApp message from {name}: {text}")
            
            # Route message
            # For streaming: we can support separate messages as "chunks" if needed
            # For now, standard response
            async def on_token(token: str):
                # Optionally stream via multiple small messages? 
                # Probably annoying for user. Buffering or ignoring.
                pass

            response = await self.router.route_message(unified_msg)
            
            # Send response
            await self.send_message(user_id, response)
            
        except json.JSONDecodeError:
            pass
        except Exception as e:
            logger.error(f"Error handling bridge message: {e}", exc_info=True)

    async def send_message(self, to: str, text: str):
        """Send message via bridge."""
        if not self.ws or not text:
            return
            
        # Chunking handled mostly by user preference, but let's stick to safe limits
        payload = {
            "type": "send",
            "to": to,
            "content": text
        }
        
        try:
            await self.ws.send(json.dumps(payload))
        except Exception as e:
            logger.error(f"Failed to send WhatsApp message: {e}")
