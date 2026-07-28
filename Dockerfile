FROM node:18-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --prefer-offline --no-audit --progress=false

COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
EXPOSE 3011

CMD ["node", "dist/main.js"]
