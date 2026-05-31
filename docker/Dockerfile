FROM node:22.22.1-slim

WORKDIR /app

# System deps for PDF generation (pandoc + WeasyPrint) and fonts. WeasyPrint
# pulls its pango/cairo/gdk-pixbuf dependencies via apt. Keep --no-install-recommends
# so the image stays as small as possible.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      pandoc \
      weasyprint \
      fonts-dejavu \
      fonts-liberation \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY src/package.json src/package-lock.json* ./
RUN npm install --omit=dev

COPY src/ .
COPY scripts/ /app/scripts/

RUN chmod -R a+rX /app \
 && mkdir -p /app/hotd-campaign/notebook /app/hotd-campaign/images/notebook /app/reports \
 && chmod -R a+rwX /app/hotd-campaign/notebook /app/hotd-campaign/images/notebook /app/reports

ENV NODE_ENV=production \
    HOTD_REPO_ROOT=/app \
    HOTD_PDF_SCRIPT=/app/scripts/build-session-pdf.js \
    HOTD_REPORTS_DIR=/app/reports
EXPOSE 3000

CMD ["node", "server.js"]
