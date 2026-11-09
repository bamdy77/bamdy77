# Backend Docker image — adds LibreOffice for Doc Tools PDF<->Word conversion.
FROM node:20-bookworm-slim

# LibreOffice + fonts for Doc Tools conversion. Recommends are kept (not
# --no-install-recommends) — some of them are libraries LibreOffice needs
# to actually run, not just to build; stripping them can make the binary
# fail at runtime even though the Docker build itself succeeds.
RUN apt-get update && apt-get install -y \
      libreoffice-writer \
      libreoffice-core \
      fonts-liberation2 \
      fonts-crosextra-carlito \
      fonts-crosextra-caladea \
      fonts-dejavu-core \
      fontconfig \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Register bundled fonts with the system font cache.
RUN mkdir -p /usr/share/fonts/truetype/mikumbi \
    && cp src/assets/fonts/*.ttf /usr/share/fonts/truetype/mikumbi/ 2>/dev/null || true \
    && fc-cache -f

ENV NODE_ENV=production
EXPOSE 5000

CMD ["npm", "start"]
