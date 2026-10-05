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

# YouTube cookie varsa /tmp içine kopyalanır.
# /etc/secrets salt okunur olduğu için yt-dlp doğrudan
# Secret File üzerinde çalıştırılmaz.
RUN printf '%s\n' \
    '#!/bin/sh' \
    'COOKIE="/etc/secrets/www.youtube.com_cookies.txt"' \
    'TEMP_COOKIE="/tmp/downly-youtube-cookies.txt"' \
    'for arg in "$@"; do' \
    '  case "$arg" in' \
    '    *youtube.com*|*youtu.be*)' \
    '      if [ -f "$COOKIE" ]; then' \
    '        cp "$COOKIE" "$TEMP_COOKIE"' \
    '        exec /usr/local/bin/yt-dlp --cookies "$TEMP_COOKIE" "$@"' \
    '      fi' \
    '      break' \
    '      ;;' \
    '  esac' \
    'done' \
    'exec /usr/local/bin/yt-dlp "$@"' \
    > /usr/local/bin/downly-yt-dlp && \
    chmod +x /usr/local/bin/downly-yt-dlp

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV YTDLP_PATH=/usr/local/bin/downly-yt-dlp

EXPOSE 3000

CMD ["npm","start"]
