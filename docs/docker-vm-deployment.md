# Docker VM Deployment

This guide deploys the image uploader to a Linux VM running on Proxmox. The app runs in Docker, persists SQLite data in a Docker volume, and is exposed on your local network through Caddy at `http://<VM_LAN_IP>`.

## Architecture

- Build the Docker image on your Mac.
- Push the image to a private registry reachable by the VM.
- Run the app and Caddy with Docker Compose on the VM.
- Keep the Next.js app private on the Compose network; expose only Caddy on port 80.
- Store the SQLite database at `/app/data/image-uploader.db` in the `image-uploader-data` Docker volume.

## Prerequisites

On your Mac:

- Docker Desktop or another Docker engine with Buildx.
- Login access to your private registry.

On the VM:

- A Linux user with SSH access.
- Docker Engine and the Docker Compose plugin installed.
- Login access to the same private registry.
- LAN firewall rules allowing inbound TCP port 80.

## Build and Push from the Mac

Choose a version tag and registry path:

```bash
export IMAGE_TAG=registry.example.com/image-uploader:2026-05-06
docker login registry.example.com
docker buildx build --platform linux/amd64 -t "$IMAGE_TAG" --push .
```

Use `--platform linux/amd64` for a typical Proxmox VM. Change it only if your VM uses a different CPU architecture.

## Configure the VM

Copy or clone this repository to the VM so it has `deploy/docker-compose.yml` and `deploy/Caddyfile`.

Create a VM-only `.env` file in the repository root:

```bash
IMAGE_UPLOADER_IMAGE=registry.example.com/image-uploader:2026-05-06
AWS_ACCESS_KEY_ID=replace-me
AWS_SECRET_ACCESS_KEY=replace-me
AWS_REGION=us-east-1
S3_BUCKET=your-images-bucket
S3_PREFIX=
PUBLIC_BASE_URL=https://cdn.example.com
SNIPPET_COMPONENT=BlogImage
S3_VISIBILITY=policy
```

Do not commit this file. It contains deployment secrets.

## Start the App

From the repository root on the VM:

```bash
docker login registry.example.com
docker compose --env-file .env -f deploy/docker-compose.yml pull
docker compose --env-file .env -f deploy/docker-compose.yml up -d
docker compose --env-file .env -f deploy/docker-compose.yml ps
```

Open the app from another device on the same network:

```text
http://<VM_LAN_IP>
```

The app container is not published directly. Caddy receives LAN traffic on port 80 and proxies it to `app:3000`.

## Verify the Deployment

Run these checks on the VM:

```bash
curl http://localhost
docker compose --env-file .env -f deploy/docker-compose.yml logs --tail=100 app
```

Then upload a test image through the browser and confirm:

- The image appears in your S3 bucket.
- The generated snippet uses the configured `SNIPPET_COMPONENT`.
- Data remains after `docker compose --env-file .env -f deploy/docker-compose.yml restart app`.

## Update and Roll Back

To update, build and push a new image tag from the Mac, then edit `IMAGE_UPLOADER_IMAGE` in the VM `.env` file and run:

```bash
docker compose --env-file .env -f deploy/docker-compose.yml pull app
docker compose --env-file .env -f deploy/docker-compose.yml up -d app
```

To roll back, set `IMAGE_UPLOADER_IMAGE` back to the previous working tag and run the same two commands.

## Back Up SQLite Data

Stop the app before copying the database files so SQLite WAL files are consistent:

```bash
docker compose --env-file .env -f deploy/docker-compose.yml stop app
docker run --rm -v image-uploader_image-uploader-data:/data -v "$PWD:/backup" alpine \
  sh -c 'tar czf /backup/image-uploader-data-backup.tgz -C /data .'
docker compose --env-file .env -f deploy/docker-compose.yml start app
```

Keep the backup outside the repository if it contains real catalog data.

## Troubleshooting

- `Missing S3_BUCKET`: add `S3_BUCKET` to the VM `.env`.
- Upload succeeds but public URLs fail: verify `PUBLIC_BASE_URL`, bucket policy, and `S3_VISIBILITY`.
- `permission denied` on port 80: confirm no other service is using port 80 and the VM firewall allows LAN access.
- Native dependency failures during build: rebuild for the VM architecture and avoid copying `node_modules` from the Mac.
