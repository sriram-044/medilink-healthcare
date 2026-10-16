# MediLink AI — Deployment & DevOps Architecture

Guides for deploying MediLink AI across local environments, Docker Compose, Kubernetes, and Cloud Virtual Machines.

---

## 1. Multi-Container Orchestration (Docker Compose)
The project includes production and development Docker Compose configurations:
- `docker-compose.yml`: Production deployment (Nginx Reverse Proxy, Node.js API, MongoDB).
- `docker-compose.dev.yml`: Development environment with volume mounts and hot-reloading.

### Running with Docker Compose
```bash
# Build and start services in detached mode
docker compose up -d --build

# View container logs
docker compose logs -f

# Stop services
docker compose down
```

---

## 2. Environment Variables & Security
- Configure `.env` from `.env.example`.
- Ensure high-entropy secrets (32+ chars) for `JWT_SECRET` and `SESSION_SECRET` in production.
- Content Security Policy (CSP) is strictly enforced via Helmet.
