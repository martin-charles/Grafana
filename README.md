# FoodMe App

AngularJS + Node.js meal ordering app with Docker Compose for local dev and
Grafana Alloy for observability.

## Grafana Cloud integration

This repo is primarily for shipping app telemetry to Grafana Cloud using
Grafana Alloy. The `alloy` service forwards traces, logs, and metrics to your
Grafana Cloud stack, and the `app` service sends OTLP traces to Alloy and can
push logs directly to Loki.

## Prerequisites

- Docker Desktop (includes Docker Compose)
- Git (optional, for cloning)

## Quick start (rebuild from scratch)

1) Clone or download this repo.
2) Open `docker-compose.yaml` and fill in the API keys you removed:
   - `GRAFANA_CLOUD_TEMPO_USER` / `GRAFANA_CLOUD_TEMPO_API_KEY`
   - `GRAFANA_CLOUD_LOKI_USER` / `GRAFANA_CLOUD_LOKI_API_KEY`
   - `GRAFANA_CLOUD_PROMETHEUS_USER` / `GRAFANA_CLOUD_PROMETHEUS_API_KEY`
   - `GRAFANA_LOKI_USER` / `GRAFANA_LOKI_API_KEY`
3) Build and run:

```bash
docker-compose build --no-cache
docker compose up
```

## Access

- App: http://localhost:3000
- Alloy UI: http://localhost:12345

## Notes

- Keep API keys out of Git history; only add them locally before building.
- Use `docker compose down` to stop and remove containers.
