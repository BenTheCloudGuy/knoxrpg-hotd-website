---
description: "Build and test the Docker image locally"
agent: "agent"
---
1. Build the Docker image: `docker build -f docker/Dockerfile -t hotd-website:dev .`
2. Run it locally: `docker run --rm -p 3000:3000 --name hotd-dev hotd-website:dev`
3. Test that http://localhost:3000 responds with a 200
4. Show the container logs
5. Stop the container when done
