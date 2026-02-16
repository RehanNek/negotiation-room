FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production=false

COPY . .
RUN npm run build

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/room.db

EXPOSE 3000

CMD ["node", "dist/index.js"]
