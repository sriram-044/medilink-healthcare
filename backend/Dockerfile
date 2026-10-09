# ==============================================================================
# CareLink AI Healthcare Ecosystem — Backend Container
# ==============================================================================
FROM node:20-alpine AS base

# Install dumb-init and curl for signal handling & healthchecks
RUN apk add --no-cache curl dumb-init

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=5000

# Copy package descriptors first to leverage Docker layer caching
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy application source code and assets
COPY config/ ./config/
COPY middleware/ ./middleware/
COPY models/ ./models/
COPY routes/ ./routes/
COPY utils/ ./utils/
COPY frontend/ ./frontend/
COPY server.js ./

# Create uploads directory and ensure write permissions for persistent volumes
RUN mkdir -p /app/uploads && chmod -R 777 /app/uploads

# Expose backend service port
EXPOSE 5000

# Health check endpoint
HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

# Start container with dumb-init for graceful shutdown
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]
