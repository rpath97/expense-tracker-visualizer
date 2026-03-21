# Run the Express app + static frontend (not Staticfile/Caddy)
# Debian slim avoids Alpine + native module (bcrypt) issues on some hosts
FROM node:20-bookworm-slim

WORKDIR /app

# Install dependencies from server/package.json
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm install --omit=dev

# App code (index.html, app.js, styles.css at repo root + server/)
COPY . .

ENV NODE_ENV=production

# Railway sets PORT at runtime
EXPOSE 8080

CMD ["node", "server/index.js"]
