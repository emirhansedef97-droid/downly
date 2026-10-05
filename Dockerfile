FROM node:22-bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      python3 \
      python3-pip \
      ffmpeg \
      ca-certificates \
      curl \
      build-essential \
      libcairo2-dev \
      libpango1.0-dev \
      libjpeg-dev \
      libgif-dev \
      librsvg2-dev && \
    rm -rf /var/lib/apt/lists/*

# yt-dlp
RUN python3 -m pip install \
    --break-system-packages \
    --no-cache-dir \
    -U "yt-dlp[default,curl-cffi]"

# ---------------------------------------------------------
# bgutil PO Token Provider
# Plugin ve server AYNI sürüm: 2.0.0
# ---------------------------------------------------------

RUN python3 -m pip install \
    --break-system-packages \
    --no-cache-dir \
    "bgutil-ytdlp-pot-provider==2.0.0"

WORKDIR /opt

RUN curl -L \
    https://github.com/Brainicism/bgutil-ytdlp-pot-provider/archive/refs/tags/2.0.0.tar.gz \
    -o bgutil.tar.gz && \
    tar -xzf bgutil.tar.gz && \
    mv bgutil-ytdlp-pot-provider-2.0.0 bgutil-ytdlp-pot-provider && \
    rm bgutil.tar.gz

WORKDIR /opt/bgutil-ytdlp-pot-provider/server

RUN npm ci --omit=dev && \
    npx tsc

# ---------------------------------------------------------
# Downly yt-dlp wrapper
#
# Secret File read-only olduğu için cookie önce /tmp'ye
# kopyalanıyor.
#
# YouTube çağrılarında bgutil provider localhost:4416
# üzerinden PO Token sağlıyor.
# ---------------------------------------------------------

RUN printf '%s\n' \
    '#!/bin/sh' \
    'COOKIE="/etc/secrets/www.youtube.com_cookies.txt"' \
    'TEMP_COOKIE="/tmp/downly-youtube-cookies.txt"' \
    'for arg in "$@"; do' \
    '  case "$arg" in' \
    '    *youtube.com*|*youtu.be*)' \
    '      if [ -f "$COOKIE" ]; then' \
    '        cp "$COOKIE" "$TEMP_COOKIE"' \
    '        exec /usr/local/bin/yt-dlp --cookies "$TEMP_COOKIE" --extractor-args "youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416" "$@"' \
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

# ---------------------------------------------------------
# Container başlangıcı:
# 1. bgutil provider localhost:4416'da başlar
# 2. Downly Express başlar
# ---------------------------------------------------------

RUN printf '%s\n' \
    '#!/bin/sh' \
    'set -e' \
    'node /opt/bgutil-ytdlp-pot-provider/server/build/main.js --host 127.0.0.1 --port 4416 &' \
    'echo "bgutil PO Token Provider başlatıldı: 127.0.0.1:4416"' \
    'exec npm start' \
    > /usr/local/bin/start-downly && \
    chmod +x /usr/local/bin/start-downly

EXPOSE 3000

CMD ["/usr/local/bin/start-downly"]
