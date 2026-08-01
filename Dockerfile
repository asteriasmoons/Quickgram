FROM node:20-bookworm-slim AS base

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip pipx ca-certificates \
  && pipx install gallery-dl \
  && ln -s /root/.local/bin/gallery-dl /usr/local/bin/gallery-dl \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY miniapp/package*.json ./miniapp/
RUN npm install
RUN npm --prefix miniapp install

COPY . .
RUN npm run build

ENV NODE_ENV=production
CMD ["npm", "start"]
