// mcp.reloadRuntimes disposes the Gateway process's cached session MCP runtimes
// so the CLI's `mcp reload` can invalidate the cross-process cache (#164642).
import { describe, expect, it, vi } from "vitest";
import * as managerApi from "../../agents/agent-bundle-mcp-manager-api.js";
import { mcpAppHandlers } from "./mcp-app.js";

function stubResponder() {
  return vi.fn();
}

describe("mcp.reloadRuntimes", () => {
  it("disposes all session MCP runtimes and acknowledges", async () => {
    const disposeSpy = vi
      .spyOn(managerApi, "disposeAllSessionMcpRuntimes")
      .mockResolvedValue(undefined);
    const respond = stubResponder();
    const handler = mcpAppHandlers["mcp.reloadRuntimes"];
    expect(handler).toBeDefined();

    await handler({
      request: { method: "mcp.reloadRuntimes", params: {} },
      params: {},
      respond: respond as unknown as Parameters<typeof handler>[0]["respond"],
      client: {} as never,
      context: {} as never,
    } as unknown as Parameters<typeof handler>[0]);

    expect(disposeSpy).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledWith(true, { ok: true });
    disposeSpy.mockRestore();
  });
});
