FROM node:20-bullseye

WORKDIR /app

# Copy only package files first (better layer caching)
COPY package*.json ./

# Clean cache + install deps
RUN npm cache clean --force \
  && npm install --no-audit --no-fund --legacy-peer-deps

# Copy rest of the application
COPY . .

EXPOSE 3000

# Preload OpenTelemetry before app starts
CMD ["node", "-r", "/app/server/otel.js", "/app/server/start.js"]
