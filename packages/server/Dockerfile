FROM node:24-bookworm-slim AS web-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/web/package.json packages/web/package.json
COPY packages/server/package.json packages/server/package.json
RUN npm ci --workspace @musicq/web --include-workspace-root=false --include=dev
COPY packages/web packages/web
COPY scripts/copy-web.mjs scripts/copy-web.mjs
# Release archives already contain the panel; source checkouts build it here.
COPY packages/server /app/server-input
RUN if [ -d packages/web/src ]; then npm run build -w @musicq/web; else mkdir -p packages/server/web && cp -R /app/server-input/web/. packages/server/web/; fi

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/server/package.json packages/server/package.json
COPY packages/web/package.json packages/web/package.json
RUN npm ci --omit=dev --workspace @musicq/server --ignore-scripts
COPY packages/server/src packages/server/src
COPY --from=web-build /app/packages/server/web packages/server/web
RUN mkdir /data && chown node:node /data
USER node
WORKDIR /app/packages/server
ENV MUSICQ_HOST=0.0.0.0 MUSICQ_PORT=4310 MUSICQ_DATA_DIR=/data
EXPOSE 4310
CMD ["node", "src/index.mjs"]
