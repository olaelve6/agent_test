import type { App } from "@microsoft/teams.apps";
import { getFile } from "./fileStore";

/**
 * Register the GET /download/:id route on the App's underlying Express
 * adapter. Call this once at startup, before `app.start(...)`.
 *
 * We reach the Express app via `app.server.adapter` because `app.http`
 * is only populated when the (deprecated) HttpPlugin is explicitly
 * passed in `App({ plugins: [...] })`. The default ExpressAdapter
 * exposes the same `.get`/`.post`/etc. surface.
 */
export function registerDownloadRoute(app: App): void {
  const adapter = app.server?.adapter as
    | { get?: (path: string, handler: (req: any, res: any) => void) => void }
    | undefined;

  if (!adapter?.get) {
    console.warn(
      "[fileDownload] No Express adapter found on app.server; " +
        "download route not registered."
    );
    return;
  }

  adapter.get("/download/:id", (req, res) => {
    const entry = getFile(req.params.id);
    if (!entry) {
      res.status(404).type("text/plain").send("File not found or expired.");
      return;
    }

    res
      .status(200)
      .setHeader("Content-Type", entry.contentType)
      .setHeader(
        "Content-Disposition",
        `attachment; filename="${entry.filename}"`
      )
      .setHeader("Content-Length", String(entry.body.length))
      .send(entry.body);
  });

  console.log("[fileDownload] Registered GET /download/:id");
}