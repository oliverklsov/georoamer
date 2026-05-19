FROM node:20-slim

WORKDIR /app

COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

RUN npm install --prefix backend && npm install --prefix frontend

COPY . .

RUN npm run build --prefix frontend

ENV PORT=8080
EXPOSE 8080

CMD ["node", "backend/server.js"]
