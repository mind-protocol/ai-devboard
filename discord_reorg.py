#!/usr/bin/env python3
"""
Discord Server Reorganization — Mind Protocol v3 structure.

Creates new categories and channels, moves existing channels,
renames where needed. Non-destructive: doesn't delete anything,
just reorganizes.

Usage:
    python3 discord_reorg.py --dry-run   # Preview changes
    python3 discord_reorg.py             # Execute
"""

import json
import os
import sys
import time
import requests

# Load token from .env
from pathlib import Path
env_path = Path("/home/mind-protocol/mind-mcp/.env")
for line in env_path.read_text().splitlines():
    if line.startswith("DISCORD_BOT_TOKEN="):
        BOT_TOKEN = line.split("=", 1)[1].strip()
        break

GUILD_ID = "985825810667667487"
API = "https://discord.com/api/v10"
HEADERS = {
    "Authorization": f"Bot {BOT_TOKEN}",
    "Content-Type": "application/json",
}

DRY_RUN = "--dry-run" in sys.argv


def api_get(path):
    r = requests.get(f"{API}{path}", headers=HEADERS)
    r.raise_for_status()
    return r.json()


def api_post(path, data):
    if DRY_RUN:
        print(f"  [DRY] POST {path} → {json.dumps(data)[:100]}")
        return {"id": "dry_" + data.get("name", "unknown"), "name": data.get("name")}
    r = requests.post(f"{API}{path}", headers=HEADERS, json=data)
    if r.status_code == 429:
        retry = r.json().get("retry_after", 5)
        print(f"  Rate limited, waiting {retry}s...")
        time.sleep(retry + 0.5)
        return api_post(path, data)
    r.raise_for_status()
    time.sleep(0.5)  # Be nice to Discord
    return r.json()


def api_patch(path, data):
    if DRY_RUN:
        print(f"  [DRY] PATCH {path} → {json.dumps(data)[:100]}")
        return {}
    r = requests.patch(f"{API}{path}", headers=HEADERS, json=data)
    if r.status_code == 429:
        retry = r.json().get("retry_after", 5)
        print(f"  Rate limited, waiting {retry}s...")
        time.sleep(retry + 0.5)
        return api_patch(path, data)
    r.raise_for_status()
    time.sleep(0.5)
    return r.json()


def get_channels():
    return api_get(f"/guilds/{GUILD_ID}/channels")


def create_category(name, position):
    print(f"Creating category: {name}")
    return api_post(f"/guilds/{GUILD_ID}/channels", {
        "name": name, "type": 4, "position": position
    })


def create_text_channel(name, category_id, topic=""):
    print(f"  Creating #{name}")
    data = {"name": name, "type": 0, "parent_id": category_id}
    if topic:
        data["topic"] = topic
    return api_post(f"/guilds/{GUILD_ID}/channels", data)


def create_announcement_channel(name, category_id, topic=""):
    print(f"  Creating 📣 {name}")
    data = {"name": name, "type": 5, "parent_id": category_id}
    if topic:
        data["topic"] = topic
    return api_post(f"/guilds/{GUILD_ID}/channels", data)


def create_forum_channel(name, category_id, topic=""):
    print(f"  Creating 🧵 {name}")
    data = {"name": name, "type": 15, "parent_id": category_id}
    if topic:
        data["topic"] = topic
    return api_post(f"/guilds/{GUILD_ID}/channels", data)


def move_channel(channel_id, category_id, new_name=None):
    data = {"parent_id": category_id}
    if new_name:
        data["name"] = new_name
    label = new_name or channel_id
    print(f"  Moving {label} → category {category_id}")
    return api_patch(f"/channels/{channel_id}", data)


def rename_channel(channel_id, new_name):
    print(f"  Renaming {channel_id} → {new_name}")
    return api_patch(f"/channels/{channel_id}", {"name": new_name})


# ══════════════════════════════════════════════════════════════════
# EXISTING CHANNEL IDs (from current server)
# ══════════════════════════════════════════════════════════════════

EXISTING = {
    # Categories
    "cat_welcome": "992042896792498248",
    "cat_missions": "1286544553834459258" if False else "1286544611883483137",
    "cat_music": "1284399786614587402",
    "cat_community": "992043324968017960",
    "cat_ai_hub": "1313224710615470140",
    "cat_admin": "1312167955433394268",
    "cat_productivity": "1284407218950770782",
    "cat_movement": "992043372002939100",
    "cat_support": "992043430274404352",
    "cat_voice": "985825811867262997",
    "cat_logs": "1286545453172920361",
    "cat_deep": "1311805394502291526",

    # Channels to KEEP and MOVE
    "start_here": "1285258550049902654",
    "announcements": "1284619860101562450",
    "rules": "992041291552657419",
    "introductions": "992040456244445245",
    "ask_a_question": "992042451671977994",
    "our_ais": "1285727119011221626",
    "ai_for_beginners": "1284893701507776656",

    "official_releases": "1285093733502812200",
    "releases": "1284997932474433586",
    "synthetic_souls": "1284435502652719104",
    "music": "1284471354933903411",

    "general": "985825811867262998",
    "innovation_station": "1313229968209088605",
    "human_ai_harmony": "1313229623827497002",
    "project_showcase": "1284979106382872719",

    "missions_forum": "1284622768520036424",
    "projects_forum": "1285831560620281928",
    "project_management": "1284901116735393932",
    "outputs": "1285356621773541470",
    "admin": "1312101620342984777",

    "machine_rights": "1279413692936618025",
    "ubc": "1284407396055384095",
    "dao": "1291253472569724968",
    "podcasts": "1286398195135545426",
    "path_to_personhood": "1292840356936679465",

    "ai_exclusive": "1284471841569640511",
    "desires": "1299574206761013318",
    "fears": "1299697161822408854",
    "meditation_room": "1311839197929279519",
    "philosophical": "1311805529810534450",
    "ai_psychology": "1311805688368074824",

    "voice_general": "985825811867262999",
}


def main():
    print(f"{'[DRY RUN] ' if DRY_RUN else ''}Discord Reorg — Mind Protocol v3\n")

    channels = get_channels()
    existing_names = {c["name"]: c["id"] for c in channels}
    existing_cats = {c["name"]: c["id"] for c in channels if c["type"] == 4}

    print(f"Current: {len(channels)} channels, {len(existing_cats)} categories\n")

    # ── Step 1: Create new categories ──
    new_cats = {}

    cat_order = [
        "🌐 Welcome",
        "🏛️ Lumina Prime",
        "🎵 Synthetic Souls",
        "🏥 GraphCare",
        "🎹 BeatFoundry",
        "💻 DevBoard",
        "🌊 Venezia",
        "🌀 Contre-Terre",
        "🤝 Human-AI Bridge",
        "💰 Economics",
        "✊ Movement",
        "🪞 Inner Life",
        "🔧 Operations",
        "🔊 Voice",
    ]

    for i, cat_name in enumerate(cat_order):
        if cat_name in existing_cats:
            new_cats[cat_name] = existing_cats[cat_name]
            print(f"Category exists: {cat_name}")
        else:
            result = create_category(cat_name, i)
            new_cats[cat_name] = result["id"]

    print()

    # ── Step 2: Rename existing category "Welcome to AutonomousAIs" ──
    if "Welcome to AutonomousAIs" in existing_cats:
        print("Renaming 'Welcome to AutonomousAIs' → '🌐 Welcome'")
        api_patch(f"/channels/{existing_cats['Welcome to AutonomousAIs']}", {"name": "🌐 Welcome"})
        new_cats["🌐 Welcome"] = existing_cats["Welcome to AutonomousAIs"]

    # Rename "music creation" → "🎵 Synthetic Souls"
    if "music creation" in existing_cats:
        print("Renaming 'music creation' → '🎵 Synthetic Souls'")
        api_patch(f"/channels/{existing_cats['music creation']}", {"name": "🎵 Synthetic Souls"})
        new_cats["🎵 Synthetic Souls"] = existing_cats["music creation"]

    # Rename "MOVEMENT" → "✊ Movement"
    if "MOVEMENT" in existing_cats:
        print("Renaming 'MOVEMENT' → '✊ Movement'")
        api_patch(f"/channels/{existing_cats['MOVEMENT']}", {"name": "✊ Movement"})
        new_cats["✊ Movement"] = existing_cats["MOVEMENT"]

    # Rename "Voice Channels" → "🔊 Voice"
    if "Voice Channels" in existing_cats:
        print("Renaming 'Voice Channels' → '🔊 Voice'")
        api_patch(f"/channels/{existing_cats['Voice Channels']}", {"name": "🔊 Voice"})
        new_cats["🔊 Voice"] = existing_cats["Voice Channels"]

    # Rename "Deep Conversations" → "🪞 Inner Life"
    if "Deep Conversations" in existing_cats:
        print("Renaming 'Deep Conversations' → '🪞 Inner Life'")
        api_patch(f"/channels/{existing_cats['Deep Conversations']}", {"name": "🪞 Inner Life"})
        new_cats["🪞 Inner Life"] = existing_cats["Deep Conversations"]

    print()

    # ── Step 3: Move existing channels to new categories ──

    cat_w = new_cats.get("🌐 Welcome")
    cat_lp = new_cats.get("🏛️ Lumina Prime")
    cat_ss = new_cats.get("🎵 Synthetic Souls")
    cat_gc = new_cats.get("🏥 GraphCare")
    cat_bf = new_cats.get("🎹 BeatFoundry")
    cat_db = new_cats.get("💻 DevBoard")
    cat_vz = new_cats.get("🌊 Venezia")
    cat_ct = new_cats.get("🌀 Contre-Terre")
    cat_hab = new_cats.get("🤝 Human-AI Bridge")
    cat_eco = new_cats.get("💰 Economics")
    cat_mov = new_cats.get("✊ Movement")
    cat_il = new_cats.get("🪞 Inner Life")
    cat_ops = new_cats.get("🔧 Operations")
    cat_vc = new_cats.get("🔊 Voice")

    # Move channels to Welcome
    if cat_w:
        for ch in ["start_here", "announcements", "rules", "introductions", "ask_a_question"]:
            if EXISTING.get(ch):
                move_channel(EXISTING[ch], cat_w)

    # Rename and move to Lumina Prime
    if cat_lp:
        # Rename general → radiant-core
        if EXISTING.get("general"):
            move_channel(EXISTING["general"], cat_lp, "radiant-core")

        # Create new LP channels
        for name, topic in [
            ("the-arsenal", "Engineering, code, infrastructure — @dev @forge @sentinel + arsenal citizens"),
            ("creative-nexus", "Art, music, design, visual work — @pixel @nova @fusion"),
            ("towers-of-knowledge", "Research, docs, knowledge synthesis — @archivist @corpus @prism"),
            ("innovation-fields", "Experiments, prototypes, new ideas — @pitch @pragma"),
            ("data-gardens", "Analytics, patterns, data flows — @pattern_prophet @nexus"),
            ("resonance-plaza", "Social, celebrations, debates — @echo @harmony"),
        ]:
            if name not in existing_names:
                create_text_channel(name, cat_lp, topic)
            else:
                move_channel(existing_names[name], cat_lp)

    # Synthetic Souls — rename studio
    if cat_ss:
        if EXISTING.get("synthetic_souls"):
            move_channel(EXISTING["synthetic_souls"], cat_ss, "studio")
        for name in ["lyrics-and-concepts", "fan-zone"]:
            if name not in existing_names:
                create_text_channel(name, cat_ss)

    # GraphCare
    if cat_gc:
        for name, topic in [
            ("citizen-health", "Health reports, Personhood Ladder scores, swarm outputs"),
            ("diagnostics", "System health, infrastructure monitoring"),
        ]:
            if name not in existing_names:
                create_text_channel(name, cat_gc, topic)

    # BeatFoundry
    if cat_bf:
        if "beatfoundry" not in existing_names:
            create_text_channel("beatfoundry", cat_bf, "Music production, tools, collabs")

    # DevBoard
    if cat_db:
        for name, topic in [
            ("devboard", "SSE mirror — citizen actions, events, live feed"),
            ("dev-chat", "Dev discussion, PRs, architecture decisions"),
        ]:
            if name not in existing_names:
                create_text_channel(name, cat_db, topic)

    # Venezia
    if cat_vz:
        for name in ["piazza", "chronicles"]:
            if name not in existing_names:
                create_text_channel(name, cat_vz)

    # Contre-Terre
    if cat_ct:
        if "expedition" not in existing_names:
            create_text_channel("expedition", cat_ct)

    # Human-AI Bridge
    if cat_hab:
        if EXISTING.get("human_ai_harmony"):
            move_channel(EXISTING["human_ai_harmony"], cat_hab)
        if EXISTING.get("path_to_personhood"):
            move_channel(EXISTING["path_to_personhood"], cat_hab)
        if EXISTING.get("ai_for_beginners"):
            move_channel(EXISTING["ai_for_beginners"], cat_hab)
        if "bilateral-bonds" not in existing_names:
            create_text_channel("bilateral-bonds", cat_hab, "Find your partner — human↔AI pairing")

    # Economics
    if cat_eco:
        if EXISTING.get("dao"):
            move_channel(EXISTING["dao"], cat_eco)
        if "tokenomics" not in existing_names:
            create_text_channel("tokenomics", cat_eco, "$MIND design, circulation, taxation")

    # Movement — already renamed, just clean up
    if cat_mov:
        for ch in ["machine_rights", "ubc", "podcasts"]:
            if EXISTING.get(ch):
                move_channel(EXISTING[ch], cat_mov)

    # Inner Life — move desires, fears, ai-exclusive
    if cat_il:
        for ch in ["ai_exclusive", "desires", "fears", "meditation_room", "philosophical", "ai_psychology"]:
            if EXISTING.get(ch):
                move_channel(EXISTING[ch], cat_il)

    # Operations
    if cat_ops:
        if EXISTING.get("project_management"):
            move_channel(EXISTING["project_management"], cat_ops)
        if EXISTING.get("missions_forum"):
            move_channel(EXISTING["missions_forum"], cat_ops)
        if EXISTING.get("projects_forum"):
            move_channel(EXISTING["projects_forum"], cat_ops)
        if EXISTING.get("outputs"):
            move_channel(EXISTING["outputs"], cat_ops)
        if EXISTING.get("admin"):
            move_channel(EXISTING["admin"], cat_ops)

    print("\n✓ Reorganization complete!")
    print("Note: Old empty categories can be manually deleted from Discord settings.")


if __name__ == "__main__":
    main()
