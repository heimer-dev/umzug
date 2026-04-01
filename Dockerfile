FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json ./
RUN npm install --production

# Copy app source
COPY server.js ./
COPY public/ ./public/

# Data directory for SQLite (will be mounted as volume)
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "server.js"]
