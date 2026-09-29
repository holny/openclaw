// Real-path coverage for the restart-recovery discovery yield (#149935): timers
// queued before the scan must run between store probes instead of waiting for
// the combined length of every synchronous probe.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as sessionAccessor from "../../config/sessions/session-accessor.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import {
  createSessionEntry,
  type SessionEntryFixture,
} from "../subagent-test-fixtures.test-helpers.js";
import { discoverRestartRecoveryStoreTargets } from "./main-session-restart-recovery-shared.js";

function runningMainSessionEntry(
  overrides: Partial<SessionEntryFixture> = {},
): ReturnType<typeof createSessionEntry> {
  return createSessionEntry({
    sessionId: "main-session",
    updatedAt: Date.now() - 10_000,
    status: "running",
    ...overrides,
  });
}

describe("restart recovery discovery yield", () => {
  it("lets timers queued before discovery run between store probes", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-recovery-yield-"));
    try {
      const sessionsDirA = path.join(tmpDir, "agents", "yield-a", "sessions");
      const sessionsDirB = path.join(tmpDir, "agents", "yield-b", "sessions");
      await fs.mkdir(sessionsDirA, { recursive: true });
      await fs.mkdir(sessionsDirB, { recursive: true });
      const writeMainSession = async (sessionsDir: string, sessionKey: string) => {
        await sessionAccessor.replaceSessionEntry(
          { storePath: path.join(sessionsDir, "sessions.json"), sessionKey },
          runningMainSessionEntry(),
        );
      };
      await writeMainSession(sessionsDirA, "agent:yield-a:main");
      await writeMainSession(sessionsDirB, "agent:yield-b:main");
      const cfg = {
        agents: { list: [{ id: "yield-a", default: true }, { id: "yield-b" }] },
      } as OpenClawConfig;

      // Observation point: with two stores and a per-target yield, an immediate
      // queued after discovery starts must run while the scan is unsettled AND
      // exactly one probe has happened (between probe 1 and probe 2). A single
      // yield before all probes (or none) would leave probeCount at 0 or 2
      // respectively, so this pins the mid-scan interleaving (#149935 Rev 1).
      const probeSpy = vi.spyOn(sessionAccessor, "hasSessionEntriesByStatusReadOnly");
      let settled = false;
      let observedUnsettled = false;
      let observedProbes = -1;
      const pending = discoverRestartRecoveryStoreTargets({
        cfg,
        stateDir: tmpDir,
        statuses: ["running"],
      }).then((targets) => {
        settled = true;
        return targets;
      });
      setImmediate(() => {
        observedUnsettled = !settled;
        observedProbes = probeSpy.mock.calls.length;
      });
      const storeTargets = await pending;

      // The pre-scan timer must have run while discovery was still probing: the
      // probe chain yields one macrotask between targets instead of blocking for
      // the combined length of every store probe (#149935).
      expect(observedUnsettled).toBe(true);
      expect(observedProbes).toBe(1);
      expect(storeTargets).toContainEqual({
        agentId: "yield-a",
        storePath: path.join(sessionsDirA, "sessions.json"),
      });
      expect(storeTargets).toContainEqual({
        agentId: "yield-b",
        storePath: path.join(sessionsDirB, "sessions.json"),
      });
      probeSpy.mockRestore();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
