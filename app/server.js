const express = require("express");
const client = require("prom-client");

const app = express();
client.collectDefaultMetrics();

const httpTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"],
});
const httpDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request latency in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
});

// Metrics middleware
app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  res.on("finish", () => {
    const labels = {
      method: req.method,
      route: req.route ? req.route.path : "unmatched",
      status: res.statusCode,
    };
    end(labels);
    httpTotal.inc(labels);
  });
  next();
});

app.get("/", (req, res) => {
  res.json({
    project: "CloudNative DevOps Platform",
    status: "running",
    version: process.env.APP_VERSION || "local",
    pod: process.env.HOSTNAME || "unknown",
  });
});

app.get("/health", (req, res) => res.status(200).json({ status: "healthy" }));

// Prometheus scrape endpoint
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

// Deliberate failure endpoint for alert testing (Phase: monitoring)
app.get("/fail", (req, res) => res.status(500).json({ error: "simulated failure" }));

module.exports = app;
