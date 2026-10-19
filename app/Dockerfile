FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js index.js ./
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER node
CMD ["node", "index.js"]
