import os
import asyncio
import discord
import httpx
from discord.ext import commands
from dotenv import load_dotenv

# Load env from the project root or current dir
load_dotenv()

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")
API_BASE_URL = os.getenv("SOVEREIGN_API_URL", "http://localhost:3007")

if not DISCORD_TOKEN:
    print("WARNING: DISCORD_TOKEN not found in environment. Bot will not start.")

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

async def poll_task_status(ctx, task_id):
    """
    Polls the Sovereign API for task completion and notifies the user.
    """
    async with httpx.AsyncClient() as client:
        while True:
            try:
                response = await client.get(f"{API_BASE_URL}/api/sovereign/status", params={"taskId": task_id})
                if response.status_code == 200:
                    data = response.json()
                    status = data.get("status")
                    
                    if status == "DONE":
                        content = data.get("payload", {}).get("draft_payload", {}).get("content", "No content generated.")
                        await ctx.reply(f"✅ **Sovereign Task Complete**\n\n{content}")
                        break
                    elif status == "FAILED":
                        await ctx.reply(f"❌ **Sovereign Task Failed**\nCheck the Control Room for logs.")
                        break
                    elif status == "MANUAL_REQUIRED":
                        # Post the approval link
                        approval_url = f"{API_BASE_URL}/nexus/control-room?taskId={task_id}"
                        await ctx.reply(f"⚠️ **Governance Boundary Hit**\nApproval required for execution: [Review and Approve]({approval_url})")
                        # We stop polling here as we wait for human action; 
                        # alternatively, we could keep polling to announce when it is finally DONE.
                        # For now, we'll keep polling so we notify when it's eventually DONE.
                        await asyncio.sleep(10) # Longer wait once approval is hit
                    
                else:
                    print(f"Error polling status: {response.status_code}")
            except Exception as e:
                print(f"Polling exception: {e}")
            
            await asyncio.sleep(5)

@bot.event
async def on_ready():
    print(f"Logged in as {bot.user.name} ({bot.user.id})")
    print("External Vanguard is online.")

@bot.event
async def on_message(message):
    # Ignore bot's own messages
    if message.author == bot.user:
        return

    # Trigger on mention or DM
    is_dm = isinstance(message.channel, discord.DMChannel)
    is_mention = bot.user.mentioned_in(message)

    if is_dm or is_mention:
        intent = message.content.replace(f"<@!{bot.user.id}>", "").replace(f"<@{bot.user.id}>", "").strip()
        if not intent:
            await message.reply("State your intent for {sovereign}.")
            return

        async with message.channel.typing():
            async with httpx.AsyncClient() as client:
                try:
                    payload = {
                        "intent": intent,
                        "channel": "discord",
                        "metadata": {
                            "discord_user": str(message.author),
                            "discord_user_id": str(message.author.id),
                            "discord_channel_id": str(message.channel.id),
                            "discord_message_id": str(message.id)
                        }
                    }
                    response = await client.post(f"{API_BASE_URL}/api/sovereign/ingest", json=payload)
                    
                    if response.status_code == 202:
                        data = response.json()
                        task_id = data.get("taskId")
                        await message.reply(f"⚡ **Intent Ingested.** (Task ID: `{task_id[:8]}`) Analyzing...")
                        # Start background polling
                        asyncio.create_task(poll_task_status(message, task_id))
                    else:
                        await message.reply(f"Engine Error: {response.status_code}")
                except Exception as e:
                    await message.reply(f"Ingestion failed: {e}")

    await bot.process_commands(message)

if __name__ == "__main__":
    if DISCORD_TOKEN:
        bot.run(DISCORD_TOKEN)
