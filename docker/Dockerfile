FROM node:22.22.1-slim

WORKDIR /app

COPY src/package.json src/package-lock.json* ./
RUN npm install --omit=dev

COPY src/ .
RUN chmod -R a+rX /app \
 && mkdir -p /app/hotd-campaign/notebook /app/hotd-campaign/images/notebook \
 && chmod -R a+rwX /app/hotd-campaign/notebook /app/hotd-campaign/images/notebook

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
