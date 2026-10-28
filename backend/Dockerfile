# ---- Build ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime ----
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Las migraciones .sql se copian para ejecutarlas al arranque.
COPY --from=build /app/src/db/migrations ./dist/db/migrations

# Usuario sin privilegios
USER node
EXPOSE 3000

# Aplica migraciones y arranca el API.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/server.js"]
