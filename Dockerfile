Dockerfile


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

# Render Secret File'i read-only olduğu için
# çalışma sırasında /tmp altına kopyalayacağız.
RUN printf '%s\n' \
    '#!/bin/sh' \
    'set -e' \
    '' \
    'COOKIE_SOURCE="/etc/secrets/www.youtube.com_cookies.txt"' \
    'COOKIE_RUNTIME="/tmp/youtube_cookies.txt"' \
    '' \
    'if [ -f "$COOKIE_SOURCE" ]; then' \
    '  cp "$COOKIE_SOURCE" "$COOKIE_RUNTIME"' \
    '  chmod 600 "$COOKIE_RUNTIME"' \
    'fi' \
    '' \
    'exec "$@"' \
    > /usr/local/bin/downly-entrypoint && \
    chmod +x /usr/local/bin/downly-entrypoint

ENV NODE_ENV=production
ENV YTDLP_PATH=/usr/local/bin/yt-dlp

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/downly-entrypoint"]
CMD ["npm","start"]
