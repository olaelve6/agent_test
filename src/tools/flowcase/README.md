# Flowcase tools

Tools that call the Atea Service Hub / Flowcase HTTP API.

## Files

- `types.ts` — Response/query type definitions (`FlowcaseUser`, `FindUserQuery`).
- `flowcaseClient.ts` — Thin `fetch` wrapper around the Flowcase REST endpoints. All HTTP lives here.
- `findUserTool.ts` — Agent tool (`findFlowcaseUser`) wrapping `GET /users/find`.

## Required environment variables

Set these in `.localConfigs` (and the corresponding env files for `playground` / `sandbox`):

| Variable | Example | Notes |
|---|---|---|
| `FLOWCASE_BASE_URL` | `https://servicehub.atea.com/flowcase` | Optional. Defaults to `https://servicehub.atea.com/flowcase`. Trailing slash optional. |
| `FLOWCASE_API_KEY` | `1a2b3c4d...` | Sent as the `Ocp-Apim-Subscription-Key` header (Azure API Management). |

## Adding more Flowcase endpoints

1. Add response/query types to `types.ts`.
2. Add a function to `flowcaseClient.ts` (mirror the `findUser` pattern: build URL, call `fetch`, handle 404 / non-2xx, parse JSON).
3. Create a new `*Tool.ts` file in this folder exporting a `Tool`.
4. Register it in `src/tools/toolRegistery.ts`.
