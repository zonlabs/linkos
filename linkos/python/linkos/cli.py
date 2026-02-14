"""CLI interface for linkos."""

import click
import asyncio
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%H:%M:%S'
)


@click.group()
@click.version_option(version="0.1.0")
def main():
    """Linkos - Multi-platform messaging gateway."""
    pass


@main.command()
@click.option(
    "--config",
    "-c",
    type=click.Path(exists=True),
    help="Path to configuration file",
)
def gateway(config):
    """Start the messaging gateway.
    
    Connects to configured platforms via WebSocket and routes messages to AI agent.
    """
    # Import Gateway here to prevent circular imports with linkos.__init__
    from linkos.core.gateway import Gateway
    
    click.echo("🚀 Starting Linkos gateway...")
    
    gw = Gateway(config_path=config)
    
    try:
        # If no agent provided, it will try to init from config
        asyncio.run(gw.start())
    except KeyboardInterrupt:
        click.echo("\n👋 Shutting down gateway...")


@main.command()
def init():
    """Initialize configuration file.
    
    Creates a config.toml template with platform settings.
    """
    click.echo("📝 Creating config.toml template...")
    
    template = '''# Linkos Configuration

[telegram]
enabled = true
token = "YOUR_BOT_TOKEN"
# Get token from @BotFather

[discord]
enabled = false
token = "YOUR_BOT_TOKEN"
# Get from https://discord.com/developers/applications

[slack]
enabled = false
bot_token = "xoxb-..."
app_token = "xapp-..."
# Use Socket Mode

[agent]
# Type: "local" for in-process, "agui" for remote, "mock" for testing
type = "local"

# Local agent: import path to agent instance
instance = "examples.simple_agent:agent"
'''
    
    with open("config.toml", "w") as f:
        f.write(template)
    
    click.echo("✅ Created config.toml")
    click.echo("📌 Edit the file and add your platform tokens")


if __name__ == "__main__":
    main()
