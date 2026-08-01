# Software Factory — Docker Image
# Node-RED + pi CLI (Oh My Pi) + Ralph Loop orchestration
#
# Build:
#   docker build -t software-factory .
#
# Run locally:
#   docker run --rm -e GITHUB_TOKEN -e LLM_API_KEY -e RALPH_BATCH_LABEL=ralph:batch-1 software-factory

FROM node:20-slim

LABEL org.opencontainers.image.description="Software Factory: AI-driven ticket processing pipeline (Ralph Loop)"

# System dependencies: git for commit/push, gh for GitHub API, jq for JSON parsing
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    jq \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

# ── pi CLI (Oh My Pi) ────────────────────────────────────────────
# The pi CLI is the agent runner invoked by ralph-loop as:
#   pi --mode json -p --no-session --model <model> --tools <tools>
#
# INSTALL INSTRUCTIONS (adjust to your pi distribution method):
#   Option A: Copy pre-built binary
#     COPY pi /usr/local/bin/pi
#   Option B: Download from release
#     ADD https://your-release-url/pi-linux-amd64 /usr/local/bin/pi
#   Option C: Install via pipx
#     RUN pipx install oh-my-pi
#   Option D: Build from source
#     RUN git clone <pi-repo> /tmp/pi && cd /tmp/pi && ./install.sh
#
# For now, place your pi binary or install method here:
# ──────────────────────────────────────────────────────────────────
# >>> PLACEHOLDER: install pi CLI here <<<
# ──────────────────────────────────────────────────────────────────

WORKDIR /app

# Copy package files and install Node-RED + dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application code
COPY lib/ ./lib/
COPY nodes/ ./nodes/
COPY templates/ ./templates/
COPY flows.json settings.js ./

# Entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Node-RED port (for healthcheck and internal HTTP calls)
EXPOSE 1880

ENV NODE_ENV=production
ENV PORT=1880

# The entrypoint runs one ticket from discovery to completion, then exits.
# It is designed to be called once per GitHub Actions workflow_dispatch.
ENTRYPOINT ["/entrypoint.sh"]
