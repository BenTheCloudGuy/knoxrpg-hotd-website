# ==============================================================================
# FoundryVTT (Halls of the Damned) — container image
# ------------------------------------------------------------------------------
# Built + pushed by .github/workflows/deploy-foundry.yml to the MicroK8s
# registry at localhost:32000/hotd-foundry.
#
# The FoundryVTT release itself is NOT committed to this repo. Before the build,
# scripts/fetch-foundry.sh logs in to foundryvtt.com using credentials from
# Azure Key Vault, downloads the Node build, and extracts it into
# ./foundry-release/ (gitignored) inside this build context. The image then
# COPYs those files in. No FoundryVTT binaries or credentials live in git.
#
# Runtime data (worlds, systems, modules, config) lives on a PVC mounted at
# /data — NOT in the image. See ../helm/foundryvtt.
# ==============================================================================
FROM node:22-slim

# tini = PID 1 signal handling; libssl3 = FoundryVTT runtime dep.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini libssl3 \
  && rm -rf /var/lib/apt/lists/* \
  && (userdel -r node 2>/dev/null || true) \
  && useradd -u 1000 -m -s /bin/bash foundry \
  && mkdir -p /home/foundry/foundryvtt /data \
  && chown -R foundry:foundry /home/foundry /data

# FoundryVTT application (pre-downloaded + extracted into the build context).
COPY --chown=foundry:foundry foundry-release/ /home/foundry/foundryvtt/
COPY --chown=foundry:foundry entrypoint.sh /home/foundry/entrypoint.sh
RUN chmod +x /home/foundry/entrypoint.sh

USER foundry
WORKDIR /home/foundry

# FoundryVTT game/admin port. Data path is provided at runtime via /data (PVC).
EXPOSE 30000

ENTRYPOINT ["tini", "--", "/home/foundry/entrypoint.sh"]
