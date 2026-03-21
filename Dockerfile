# Run the Express app + static frontend (not a static-only Caddy build)
FROM node:20-alpine

WORKDIR /app

# Install dependencies from server/package.json
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm install --omit=dev

# App code (index.html, app.js, styles.css at repo root + server/)
COPY . .

ENV NODE_ENV=production

# Railway sets PORT; app listens on process.env.PORT
EXPOSE 8080

CMD ["node", "server/index.js"]
