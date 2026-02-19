# Pin Node to an explicit digest for reproducible builds.
FROM node:22.12.0-slim@sha256:35531c52ce27b6575d69755c73e65d4468dba93a25644eed56dc12879cae9213

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV APP_PORT=3000
ENV DATABASE_PATH=/app/data/room.db

EXPOSE 3000

CMD ["node", "dist/index.js"]
