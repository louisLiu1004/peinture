# ========================================
# Stage 1: Build Frontend
# ========================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build frontend (without API keys - they will be injected at runtime)
RUN npm run build

# ========================================
# Stage 2: Build Backend Dependencies
# ========================================
FROM node:20-alpine AS backend-builder

WORKDIR /app/server

# Copy server package files
COPY server/package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# ========================================
# Stage 3: Production Runtime
# ========================================
FROM node:20-alpine AS production

# Install nginx
RUN apk add --no-cache nginx

WORKDIR /app

# Copy built frontend to nginx html directory
COPY --from=frontend-builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/http.d/default.conf

# Copy backend server
COPY --from=backend-builder /app/server/node_modules ./server/node_modules
COPY server/index.js ./server/

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose ports
# 80 - Nginx (frontend + reverse proxy to backend)
EXPOSE 80

# Start both nginx and backend proxy server
ENTRYPOINT ["/docker-entrypoint.sh"]
