# ---- Build ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Runtime (nginx) ----
FROM nginx:1.27-alpine AS runtime
# Config del sitio (reemplaza el default de la imagen).
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Copia el build de Angular.
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
