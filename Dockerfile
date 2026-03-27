FROM node:22-slim

# Install sqlite dependencies if needed by better-sqlite3 (often requires python/build-tools in slim images,
# but node:22-slim with prebuilds usually works. Adding just in case a fallback build is triggered).
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package manifests first to leverage Docker cache
COPY app/package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the app source code
COPY app/ ./

# Build the Vite frontend
RUN npm run build

# Ensure the runtime directory exists for SQLite
RUN mkdir -p server/runtime

# Expose the API port
EXPOSE 3001
ENV PORT=3001

# Start the Node server
CMD ["npm", "start"]
