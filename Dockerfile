FROM node:20-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

RUN npm install --prefix backend && npm install --prefix frontend

COPY . .

ARG VITE_MAPILLARY_TOKEN
ARG VITE_ADSENSE_CLIENT
ENV VITE_MAPILLARY_TOKEN=$VITE_MAPILLARY_TOKEN
ENV VITE_ADSENSE_CLIENT=$VITE_ADSENSE_CLIENT

RUN npm run build --prefix frontend

ENV PORT=8080
EXPOSE 8080

CMD ["node", "backend/server.js"]
