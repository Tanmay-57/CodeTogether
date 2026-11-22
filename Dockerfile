FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 ca-certificates \
  && ln -sf /usr/bin/python3 /usr/local/bin/python \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server apps/server
COPY packages/shared packages/shared

# tsx is a devDependency, and Render sets NODE_ENV=production during the image build.
RUN pnpm install --frozen-lockfile --prod=false --filter @codetogether/server...

ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@codetogether/server", "start"]
