import { request } from "http";

export interface HealthProbeResult {
  ok: boolean;
  healthy?: boolean;
  status?: number;
  error?: string;
}

export async function probeHealth(url: string): Promise<HealthProbeResult> {
  return new Promise((resolveProbe) => {
    const req = request(url, { method: "GET", timeout: 2000 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          const payload = JSON.parse(body || "{}");
          resolveProbe({
            ok: (res.statusCode ?? 500) >= 200 && (res.statusCode ?? 500) < 300,
            healthy: payload.healthy === true,
            status: res.statusCode,
          });
        } catch (error) {
          resolveProbe({ ok: false, status: res.statusCode, error: (error as Error).message });
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolveProbe({ ok: false, error: "timeout" });
    });
    req.on("error", (error) => {
      resolveProbe({ ok: false, error: error.message });
    });
    req.end();
  });
}
