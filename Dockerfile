FROM node:22-slim

WORKDIR /home/node/app

# Install system dependencies including build tools
RUN apt-get update && apt-get install -y -q --no-install-recommends \
    ca-certificates \
    curl \
    git \
    jq \
    python3 \
    python3-pip \
    python3-venv \
    sqlite3 \
    tini \
    build-essential && \
    rm -rf /var/lib/apt/lists/*

# Install Python packages
RUN pip3 install -q --no-cache-dir --break-system-packages huggingface_hub

# Install n8n
ARG N8N_VERSION=latest
RUN npm install -g --loglevel=error n8n@${N8N_VERSION}

# Copy application files
COPY start.sh health-server.js cloudflare-proxy.js cloudflare-proxy-setup.py cloudflare-keepalive-setup.py n8n-sync.py ./

# Set permissions
RUN chmod +x start.sh cloudflare-proxy-setup.py cloudflare-keepalive-setup.py n8n-sync.py

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:7861/health || exit 1

# Expose port
EXPOSE 7861

# Use tini as entrypoint
ENTRYPOINT ["/usr/bin/tini", "--"]

# Start the app
CMD ["./start.sh"]
