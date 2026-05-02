const http = require("http");
const fs = require("fs");
const net = require("net");

const PORT = Number(process.env.PUBLIC_PORT || 7861);
const TARGET_PORT = Number(process.env.N8N_PORT || 5678);
const TARGET_HOST = "127.0.0.1";
const SYNC_STATUS_FILE = "/tmp/hugging8n-sync-status.json";
const UPTIMEROBOT_STATUS_FILE = "/tmp/hugging8n-uptimerobot-status.json";
const UPTIMEROBOT_API_KEY_SET = !!process.env.UPTIMEROBOT_API_KEY;
const startTime = Date.now();

function parseRequestUrl(url) {
  try {
    return new URL(url, "http://localhost");
  } catch {
    return new URL("http://localhost/");
  }
}

function getStatus() {
  try {
    if (fs.existsSync(SYNC_STATUS_FILE)) {
      return JSON.parse(fs.readFileSync(SYNC_STATUS_FILE, "utf8"));
    }
  } catch {}
  return {
    status: "unknown",
    message: "Initial startup...",
    timestamp: new Date().toISOString(),
  };
}

function getUptimeRobotStatus() {
  try {
    if (fs.existsSync(UPTIMEROBOT_STATUS_FILE)) {
      return JSON.parse(fs.readFileSync(UPTIMEROBOT_STATUS_FILE, "utf8"));
    }
  } catch {}
  return null;
}

function probeN8nHealth(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const request = http.get(
      {
        hostname: TARGET_HOST,
        port: TARGET_PORT,
        path: "/healthz",
        timeout: timeoutMs,
      },
      (response) => {
        response.resume();
        resolve(response.statusCode >= 200 && response.statusCode < 400);
      },
    );
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

function renderDashboard(data) {
  const { status } = data.sync;
  const getBadge = (status) => {
    let cls = "status-offline";
    if (
      status === "success" ||
      status === "configured" ||
      status === "restored" ||
      status === "synced"
    )
      cls = "status-online";
    if (status === "syncing" || status === "restoring") cls = "status-syncing";
    return `<div class="status-badge ${cls}">${cls === "status-online" ? '<div class="pulse"></div>' : ""}${String(status).toUpperCase()}</div>`;
  };

  const urStatus = data.uptimerobotStatus;
  let keepAwakeHtml;
  if (urStatus?.configured) {
    keepAwakeHtml = `
            <div class="helper-summary success">
                ${getBadge("configured")}
                <span>UptimeRobot monitor active for <code>${urStatus.url || "your /health endpoint"}</code>.</span>
            </div>`;
  } else if (urStatus?.configured === false) {
    keepAwakeHtml = `
            <div class="helper-summary error">
                ${getBadge("failed")}
                <span>Monitor setup failed. Check Space logs for details.</span>
            </div>`;
  } else if (UPTIMEROBOT_API_KEY_SET) {
    keepAwakeHtml = `
            <div class="helper-summary">
                ${getBadge("syncing")} Setting up UptimeRobot monitor&hellip;
            </div>`;
  } else {
    keepAwakeHtml = `
            <div class="helper-summary">
                <strong>Not configured.</strong> Add <code>UPTIMEROBOT_API_KEY</code> to Space secrets to enable keep-awake monitoring.
            </div>`;
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hugging8n Dashboard</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #0f172a;
            --card: #1e293b;
            --accent: #6366f1;
            --text: #f8fafc;
            --text-muted: #94a3b8;
            --success: #22c55e;
            --warning: #f59e0b;
            --error: #ef4444;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Outfit', sans-serif;
            background: var(--bg);
            color: var(--text);
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 20px;
        }
        .dashboard {
            background: var(--card);
            width: 100%;
            max-width: 500px;
            padding: 40px;
            border-radius: 24px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            text-align: center;
            border: 1px solid rgba(255,255,255,0.05);
        }
        h1 { font-size: 2.5rem; margin-bottom: 8px; letter-spacing: -1px; }
        .subtitle { color: var(--text-muted); margin-bottom: 32px; font-weight: 300; }

        .stats {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            margin-bottom: 24px;
        }
        .stat-card {
            background: rgba(255,255,255,0.03);
            padding: 20px;
            border-radius: 16px;
            text-align: left;
        }
        .stat-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; }
        .stat-value { font-size: 1.25rem; font-weight: 600; }

        .sync-box {
            background: rgba(255,255,255,0.03);
            padding: 24px;
            border-radius: 16px;
            margin-bottom: 32px;
            text-align: left;
            position: relative;
        }
        .sync-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .status-badge {
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 0.7rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .status-online { background: rgba(34, 197, 94, 0.2); color: var(--success); }
        .status-syncing { background: rgba(245, 158, 11, 0.2); color: var(--warning); }
        .status-offline { background: rgba(239, 68, 68, 0.2); color: var(--error); }

        .pulse {
            width: 8px;
            height: 8px;
            background: currentColor;
            border-radius: 50%;
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0% { transform: scale(0.95); opacity: 0.7; }
            70% { transform: scale(1.5); opacity: 0; }
            100% { transform: scale(0.95); opacity: 0; }
        }

        .btn-primary {
            display: block;
            width: 100%;
            padding: 18px;
            background: var(--accent);
            color: white;
            text-decoration: none;
            border-radius: 16px;
            font-weight: 600;
            font-size: 1.1rem;
            transition: all 0.2s;
            box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.4);
            margin-bottom: 32px;
        }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 20px 25px -5px rgba(99, 102, 241, 0.4); }

        .keep-alive {
            border-top: 1px solid rgba(255,255,255,0.05);
            padding-top: 24px;
            text-align: left;
        }
        .keep-alive h3 { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 12px; }

        .helper-summary {
            margin-top: 14px;
            padding: 12px 14px;
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.03);
            color: var(--text-muted);
            font-size: 0.85rem;
            line-height: 1.5;
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }
        .helper-summary strong { color: var(--text); }
        .helper-summary code {
            background: rgba(255,255,255,0.06);
            padding: 2px 6px;
            border-radius: 6px;
            font-size: 0.82rem;
            color: var(--text);
        }
        .helper-summary.success { background: rgba(34, 197, 94, 0.08); }
        .helper-summary.error { background: rgba(239, 68, 68, 0.08); }
    </style>
</head>
<body>
    <div class="dashboard">
        <h1>🔗 Hugging8n</h1>
        <p class="subtitle">Workflow Automation Space</p>

        <div class="stats">
            <div class="stat-card">
                <div class="stat-label">Uptime</div>
                <div class="stat-value">${data.uptimeHuman}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">n8n Port</div>
                <div class="stat-value">${TARGET_PORT}</div>
            </div>
        </div>

        <div class="sync-box">
            <div class="sync-header">
                <div class="stat-label">Sync Status</div>
                ${getBadge(data.sync.status)}
            </div>
            <div class="stat-value" style="font-size: 1rem; margin-bottom: 4px;">Last Activity: ${data.sync.timestamp.split(".")[0]}Z</div>
            <div class="stat-label" style="text-transform: none;">${data.sync.message}</div>
        </div>

        <a href="/home/workflows" target="_blank" class="btn-primary">Open n8n Editor</a>

        <div class="keep-alive">
            <span class="stat-label">Keep Space Awake</span>
            ${keepAwakeHtml}
        </div>
    </div>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  const url = parseRequestUrl(req.url);
  const pathname = url.pathname;

  // 1. Dashboard Routes
  if (pathname === "/health") {
    const n8nReady = await probeN8nHealth();
    res.writeHead(n8nReady ? 200 : 503, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify({
        status: n8nReady ? "ok" : "degraded",
        n8nReady,
        ...getStatus(),
      }),
    );
  }
  if (pathname === "/status") {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const n8nReady = await probeN8nHealth();
    return res.end(
      JSON.stringify({
        uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
        n8nReady,
        sync: getStatus(),
      }),
    );
  }
  if (pathname === "/" || pathname === "/dashboard") {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(
      renderDashboard({
        uptimeHuman: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
        sync: getStatus(),
        uptimerobotStatus: getUptimeRobotStatus(),
      }),
    );
  }

  // 2. n8n Proxy Logic
  // Any path that isn't a dashboard route gets proxied to n8n.
  const proxyHeaders = {
    ...req.headers,
    host: `127.0.0.1:${TARGET_PORT}`,
    "x-forwarded-for": req.socket.remoteAddress,
    "x-forwarded-host": req.headers.host,
    "x-forwarded-proto": "https",
  };

  const proxyReq = http.request(
    {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path: pathname + url.search,
      method: req.method,
      headers: proxyHeaders,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
      proxyRes.on("error", (err) => {
        console.error("proxyRes error:", err);
        res.end();
      });
    },
  );

  req.on("error", (err) => {
    console.error("req error:", err);
    proxyReq.destroy();
  });

  res.on("error", (err) => {
    console.error("res error:", err);
    proxyReq.destroy();
  });

  proxyReq.on("error", (err) => {
    console.error("proxyReq error:", err);
    if (!res.headersSent) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "starting",
          message: "n8n is initializing... or connection failed",
        }),
      );
    } else {
      res.end();
    }
  });

  req.pipe(proxyReq);
});

server.on("upgrade", (req, socket, head) => {
  const url = parseRequestUrl(req.url);
  const proxyPath = url.pathname;
  const proxySocket = net.connect(TARGET_PORT, TARGET_HOST, () => {
    proxySocket.write(
      `${req.method} ${proxyPath}${url.search} HTTP/${req.httpVersion}\r\n`,
    );
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      proxySocket.write(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`);
    }
    proxySocket.write("\r\n");
    if (head && head.length) proxySocket.write(head);
    proxySocket.pipe(socket).pipe(proxySocket);
  });
  proxySocket.on("error", () => socket.destroy());
});

// Disable overall timeout for SSE, but keep keep-alive healthy
server.timeout = 0;
server.keepAliveTimeout = 65000;
server.listen(PORT, "0.0.0.0", () =>
  console.log(`Namespace Proxy on ${PORT} -> n8n on ${TARGET_PORT}`),
);
