FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --silent
COPY . .
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production --silent && npm cache clean --force
COPY --from=builder /app/dist ./
RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "index.js"]