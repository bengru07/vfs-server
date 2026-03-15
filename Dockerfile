FROM node:22-alpine AS base
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

RUN mkdir -p data

EXPOSE 3001

ENV FS_CONFIG=./vfs.config.json

CMD ["node", "dist/server.js"]