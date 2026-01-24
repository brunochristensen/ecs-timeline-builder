FROM node:20-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application files
COPY server.js ./
COPY index.html ./
COPY css/ ./css/
COPY js/ ./js/
COPY lib/ ./lib/
COPY fonts/ ./fonts/

# Create data directory for persistence
RUN mkdir -p /app/data

# Expose port
EXPOSE 12345

# Set environment variables
ENV PORT=12345
ENV DATA_FILE=/app/data/timeline.json

# Run the server
CMD ["node", "server.js"]
