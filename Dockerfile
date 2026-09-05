FROM node:22-slim

WORKDIR /home/node/app

# Install dependencies
RUN apt-get update && apt-get install -y -q --no-install-recommends \
    ca-certificates \
    curl \
    git \
    jq \
    python3 \
    python3-pip \
    python3-venv \
    sqlite3 \
    build-essential && \
    rm -rf /var/lib/apt/lists/*

# Install Python packages
RUN pip3 install -q --no-cache-dir --break-system-packages huggingface_hub

# Install n8n
ARG N8N_VERSION=latest
RUN npm install -g --loglevel=error n8n@${N8N_VERSION}

# Copy all files
COPY . .

# Make scripts executable
RUN chmod +x start.sh cloudflare-proxy-setup.py cloudflare-keepalive-setup.py n8n-sync.py

# Expose port
EXPOSE 7861

# Run the start script
CMD ["bash", "start.sh"]
