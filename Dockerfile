# Build the client, then run the server with the built assets.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=2567 DB_PATH=/data/gather-lite.sqlite
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./
VOLUME ["/data"]
EXPOSE 2567
HEALTHCHECK CMD wget -qO- http://localhost:2567/healthz || exit 1
CMD ["npx", "tsx", "src/server/index.ts"]
