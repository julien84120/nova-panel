# syntax=docker/dockerfile:1.7
# ── 1. Frontend ──────────────────────────────────────────────
FROM node:22-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ── 2. Image finale ──────────────────────────────────────────
FROM python:3.12-slim-bookworm
COPY --from=ghcr.io/astral-sh/uv:0.9 /uv /usr/local/bin/uv

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssh-client ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --gid 1000 nova \
 && useradd --uid 1000 --gid nova --home-dir /home/nova --create-home --shell /usr/sbin/nologin nova \
 && install -d -o nova -g nova -m 700 /data /home/nova/.ssh

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1

WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/README.md ./
COPY backend/app ./app
RUN uv sync --frozen --no-dev

COPY --from=frontend /src/frontend/dist /app/frontend/dist
COPY deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

ENV NOVA_BIND_HOST=0.0.0.0 \
    NOVA_BIND_PORT=8000 \
    NOVA_DATA_DIR=/data \
    NOVA_STATIC_DIR=/app/frontend/dist \
    NOVA_RUN_AS=nova

ARG VERSION=dev
LABEL org.opencontainers.image.title="NovaPanel" \
      org.opencontainers.image.description="Open-source dashboard for Proxmox VE and Docker hosts" \
      org.opencontainers.image.source="https://github.com/julien84120/nova-panel" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}"

EXPOSE 8000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)" || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["novapanel", "serve"]
