# Docker Build & Test

**Confidence:** medium

## Pattern

Build and test the Docker image locally before deployment.

### Steps

1. Build the Docker image: `docker build -f docker/Dockerfile -t hotd-website:dev .`
2. Run it locally: `docker run --rm -p 3000:3000 --name hotd-dev hotd-website:dev`
3. Test that http://localhost:3000 responds with a 200
4. Show the container logs
5. Stop the container when done

### Notes

- Dockerfile is at `docker/Dockerfile`, build context is project root
- Dev mode runs on port 3001: `cd src && npm run dev`
- Production mode runs on port 3000: `cd src && node server.js`

## Learned from

- Docker testing workflow established in project setup
