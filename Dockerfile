# ----- Stage 1: build frontend -----
FROM node:22-alpine AS fe-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ----- Stage 2: runtime -----
FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

# system deps (sqlite3 for shell access, build for any wheels)
RUN apt-get update && apt-get install -y --no-install-recommends \
      sqlite3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt \
    && pip install --no-cache-dir gunicorn

# Backend source + data
COPY backend/app           ./backend/app
COPY backend/data          ./backend/data
COPY backend/scripts       ./backend/scripts

# Bring in the pre-seeded SQLite DB if present
COPY backend/dental.sqlite ./backend/dental.sqlite

# Frontend build → backend/static (served by FastAPI fallback)
COPY --from=fe-builder /app/frontend/dist ./backend/static

EXPOSE 8000

ENV DENTAL_ENVIRONMENT=production

WORKDIR /app/backend
CMD ["gunicorn", "app.main:app", \
     "-k", "uvicorn.workers.UvicornWorker", \
     "-w", "1", \
     "-b", "0.0.0.0:8000", \
     "--timeout", "120", \
     "--access-logfile", "-"]
