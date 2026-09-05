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
RUN npm install -g --loglevel=error n8n@latest

# Expose port
EXPOSE 7861

# Configure n8n
ENV N8N_PORT=7861
ENV N8N_PROTOCOL=https
ENV N8N_LISTEN_ADDRESS=0.0.0.0
ENV N8N_SECURE_COOKIE=true
ENV N8N_DIAGNOSTICS_ENABLED=false
ENV N8N_PERSONALIZATION_ENABLED=false
ENV N8N_LOG_LEVEL=error
ENV N8N_PYTHON_NODES_ENABLED=false
ENV N8N_TASK_RUNNERS_ENABLED=false
ENV NODE_ENV=production

# Start n8n
CMD ["n8n", "start"]
