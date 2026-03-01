FROM node:22-alpine

WORKDIR /app

# Install Playwright dependencies
RUN apk add --no-cache \
    python3 make g++ \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-cjk

# Set Playwright to use system Chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy built files
COPY dist ./dist
COPY openclaw.plugin.json ./

# Create directory for cookies
RUN mkdir -p /root/.mcp/rednote

# Environment variables (will be set by orchestrator)
ENV ACCOUNT_ID=""
ENV ACCOUNT_NICKNAME=""
ENV PROXY_URL=""
ENV TEMPLATE_ID=""

# Run the MCP server
CMD ["node", "dist/cli.js"]
