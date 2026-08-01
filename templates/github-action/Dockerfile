# Software Factory — Docker Image (for target projects)
# Node-RED + pi CLI (Oh My Pi) + Ralph Loop orchestration
#
# This is the template Dockerfile shipped to every project via `npm run init`.
# It references the `factory/` subdirectory where the Node-RED runtime is copied.
#
# Build:
#   docker build -t software-factory .
#
# Run locally:
#   docker run --rm -e GITHUB_TOKEN -e LLM_API_KEY software-factory

FROM node:20-slim

LABEL org.opencontainers.image.description="Software Factory: AI-driven ticket processing pipeline (Ralph Loop)"

# System dependencies: git for commit/push, gh for GitHub API, jq for JSON parsing
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    jq \
    curl \
    gnupg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

# ── pi CLI (Oh My Pi) ────────────────────────────────────────────
RUN npm install -g @earendil-works/pi-coding-agent \
    && npm install -g pnpm

WORKDIR /app

# Copy package files from factory/ subdirectory and install Node-RED
COPY factory/package.json factory/package-lock.json ./
RUN npm ci --omit=dev

# Copy application code from factory/ subdirectory
COPY factory/lib/ ./lib/
COPY factory/nodes/ ./nodes/
COPY factory/templates/ ./templates/
COPY factory/flows.json factory/settings.js ./

# Entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Node-RED port (for healthcheck and internal HTTP calls)
EXPOSE 1880

ENV NODE_ENV=production
ENV PORT=1880

ENTRYPOINT ["/entrypoint.sh"]