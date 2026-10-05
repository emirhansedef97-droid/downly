FROM node:22-bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      python3 \
      python3-pip \
      ffmpeg \
      ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN python3 -m pip install \
    --break-system-packages \
    --no-cache-dir \
    -U "yt-dlp[default,curl-cffi]"

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm","start"]
