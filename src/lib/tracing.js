// ══════════════════════════════════════════════════════════════
// ── OpenTelemetry tracing stub ────────────────────────────────
// Inert until OTEL_EXPORTER_OTLP_ENDPOINT is set AND the
// @opentelemetry/sdk-node + exporter packages are installed.
// This keeps `require("./tracing")` zero-cost in production today
// and lets a future Grafana Tempo wire-up land without touching
// every call site.
// ══════════════════════════════════════════════════════════════

const ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "";
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || "hotd-website";

let started = false;
let sdk = null;

function start() {
  if (started) return false;
  started = true;

  if (!ENDPOINT) return false;

  let NodeSDK, OTLPTraceExporter, getNodeAutoInstrumentations, Resource, SemanticResourceAttributes;
  try {
    ({ NodeSDK } = require("@opentelemetry/sdk-node"));
    ({ OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http"));
    ({ getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node"));
    ({ Resource } = require("@opentelemetry/resources"));
    ({ SemanticResourceAttributes } = require("@opentelemetry/semantic-conventions"));
  } catch (err) {
    console.warn(`  Tracing: OTEL packages not installed; tracing disabled (${err.message})`);
    return false;
  }

  try {
    sdk = new NodeSDK({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
        [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION || "0.0.0",
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || "production",
      }),
      traceExporter: new OTLPTraceExporter({ url: ENDPOINT }),
      instrumentations: [getNodeAutoInstrumentations()],
    });
    sdk.start();
    console.log(`  Tracing: OTLP exporter → ${ENDPOINT} (service=${SERVICE_NAME})`);
    for (const sig of ["SIGINT", "SIGTERM"]) {
      process.on(sig, () => { sdk.shutdown().catch(() => {}).finally(() => process.exit(0)); });
    }
    return true;
  } catch (err) {
    console.warn(`  Tracing: init failed: ${err.message}`);
    sdk = null;
    return false;
  }
}

module.exports = { start, get sdk() { return sdk; } };
