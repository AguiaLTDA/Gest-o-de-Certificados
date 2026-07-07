FROM node:20-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --chown=node:node . .
RUN mkdir -p data public/storage \
    && chown -R node:node /app

USER node

EXPOSE 3000

CMD ["npm", "start"]
