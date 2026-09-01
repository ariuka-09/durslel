# Next.js app and manim in one image. The app spawns manim as a subprocess exactly as it does
# on a laptop, so nothing in lib/render.ts changes between local and deployed.
#
# Built from the MONOREPO ROOT, not this directory — see image_build_context in wrangler.jsonc.
# Dependencies live in the root node_modules, so a build scoped to apps/dursel-web would have
# nothing to install. Every path below is therefore relative to the repo root.
#
# Deliberately NO LaTeX. The official manimcommunity image ships it, but this machine's local
# manim does not have it, and prompts/system.md bans MathTex on that basis. Shipping LaTeX here
# would make deployed output diverge from local — same prompt, different result. It also keeps
# the image roughly a gigabyte smaller and the cold start correspondingly shorter.

# ---- stage 1: build the Next.js app ----
FROM node:24-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
# --no-audit/--no-fund cut work that has no value in an image build. The retry settings are here
# because this install is long enough that a single dropped connection has already killed a
# deploy: npm's default is to give up quickly on ECONNRESET.
RUN npm ci --no-audit --no-fund --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=180000
COPY . .
# `output: "standalone"` plus outputFileTracingRoot emits a self-contained server that reaches
# back into the root node_modules for only the modules actually imported.
RUN npx next build apps/dursel-web

# ---- stage 2: python env with manim ----
FROM node:24-slim AS manim
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv python3-dev \
      build-essential pkg-config \
      libcairo2-dev libpango1.0-dev \
    && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/venv
RUN /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir "manim==0.21.0"

# ---- stage 3: runtime ----
FROM node:24-slim
# Runtime shared libraries only — no compilers, no headers.
#   cairo/pango : 2D rendering and text layout (manim uses Text, not LaTeX)
#   ffmpeg      : encodes the frames into mp4
#   libgl1      : moderngl imports it even for the cairo renderer
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      libcairo2 libpango-1.0-0 libpangocairo-1.0-0 \
      ffmpeg libgl1 \
      fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=manim /opt/venv /opt/venv
# The standalone output mirrors the monorepo's shape: node_modules at the root of it, and the
# server under the app's own path.
COPY --from=web /app/apps/dursel-web/.next/standalone ./
COPY --from=web /app/apps/dursel-web/.next/static ./apps/dursel-web/.next/static
COPY --from=web /app/apps/dursel-web/public ./apps/dursel-web/public
# Read at runtime by lib/generate.ts — not bundled into the standalone output.
COPY --from=web /app/apps/dursel-web/prompts ./apps/dursel-web/prompts

# lib/render.ts shells out to this path.
ENV MANIM_BIN=/opt/venv/bin/manim
ENV RENDER_TIMEOUT_MS=180000
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Scratch space for the render in progress. Ephemeral by design — finished artifacts go to R2.
RUN mkdir -p /app/apps/dursel-web/renders

WORKDIR /app/apps/dursel-web
EXPOSE 3000
CMD ["node", "server.js"]
