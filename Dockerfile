FROM oven/bun:1.3.11 AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/avatar/package.json packages/avatar/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/games-core/package.json packages/games-core/package.json
COPY packages/games-client/package.json packages/games-client/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY vid-tutorials/package.json vid-tutorials/package.json
RUN bun install --frozen-lockfile

FROM dependencies AS development
COPY . .
EXPOSE 3000
CMD ["bun", "run", "dev"]

FROM development AS build
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL=""
ARG NEXT_PUBLIC_SOCKET_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
RUN bun run --bun --cwd apps/web build

FROM oven/bun:1.3.11 AS production
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=bun:bun /app /app
USER bun
EXPOSE 3000
CMD ["bun", "run", "start"]
