FROM --platform=linux/amd64 node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production --silent && npm cache clean --force
COPY dist/ ./
RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "index.js"]
