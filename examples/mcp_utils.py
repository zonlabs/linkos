from typing import Any, Dict, List, Optional, Type, Union
import asyncio
from langchain_core.tools import BaseTool
from langchain_mcp_adapters.client import MultiServerMCPClient

try:
    from langchain_core.messages import ToolMessage
except ImportError:
    from langchain.schema import ToolMessage

class SerializableMCPTool(BaseTool):
    """
    A wrapper for MCP tools that is picklable.
    Instead of pickling the client/session, it pickles only the configuration
    and re-instantiates the client on demand.
    """
    servers_config: Dict[str, Any]
    tool_name: str
    
    def _run(self, *args: Any, **kwargs: Any) -> Any:
        # For sync usage, but MCP is primarily async
        return asyncio.run(self._arun(*args, **kwargs))

    async def _arun(self, *args: Any, **kwargs: Any) -> Any:
        client = MultiServerMCPClient(self.servers_config)
        # We need to find our tool among the loaded tools
        # This is slightly inefficient but ensures serializability
        tools = await client.get_tools()
        target_tool = next((t for t in tools if t.name == self.tool_name), None)
        
        if not target_tool:
            return f"Error: Tool {self.tool_name} not found on MCP servers."
            
        result = await target_tool.ainvoke(kwargs or (args[0] if args else {}))
        
        # If the result is already a ToolMessage (unlikely from raw MCP), return it
        if isinstance(result, ToolMessage):
            return result
            
        # For immediate local stability, we return a string or dict.
        # The library patch handles the missing tool_call_id for now.
        # To make it truly 'permanent' without the library patch, 
        # we would need the tool_call_id here, which is passed in the config.
        return result

def make_serializable(tools: List[BaseTool], servers_config: Dict[str, Any]) -> List[SerializableMCPTool]:
    """Wraps a list of MCP tools into serializable versions."""
    serializable = []
    for tool in tools:
        serializable.append(SerializableMCPTool(
            name=tool.name,
            description=tool.description,
            args_schema=tool.args_schema,
            tool_name=tool.name,
            servers_config=servers_config
        ))
    return serializable
