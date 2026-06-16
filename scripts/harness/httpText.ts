import { request } from "http";

export type FetchTextResult = {
  ok: boolean;
  status?: number;
  contentType?: string | null;
  body: string;
  error?: string;
};

export async function fetchText(url: string): Promise<FetchTextResult> {
  return new Promise((resolveFetch) => {
    const req = request(url, { method: "GET", timeout: 2000 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        const status = res.statusCode ?? 500;
        resolveFetch({
          ok: status >= 200 && status < 300,
          status,
          contentType: Array.isArray(res.headers["content-type"])
            ? res.headers["content-type"].join(", ")
            : (res.headers["content-type"] ?? null),
          body,
        });
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolveFetch({ ok: false, body: "", error: "timeout" });
    });
    req.on("error", (error) => {
      resolveFetch({ ok: false, body: "", error: error.message });
    });
    req.end();
  });
}
