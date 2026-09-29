// Real-path coverage for the restart-recovery discovery yield (#149935): timers
// queued before the scan must run between store probes instead of waiting for
// the combined length of every synchronous probe.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { replaceSessionEntry } from "../../config/sessions/session-accessor.js";
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
        await replaceSessionEntry(
          { storePath: path.join(sessionsDir, "sessions.json"), sessionKey },
          runningMainSessionEntry(),
        );
      };
      await writeMainSession(sessionsDirA, "agent:yield-a:main");
      await writeMainSession(sessionsDirB, "agent:yield-b:main");
      const cfg = {
        agents: { list: [{ id: "yield-a", default: true }, { id: "yield-b" }] },
      } as OpenClawConfig;

      let timerRan = false;
      setImmediate(() => {
        timerRan = true;
      });

      const storeTargets = await discoverRestartRecoveryStoreTargets({
        cfg,
        stateDir: tmpDir,
        statuses: ["running"],
      });

      // The pre-scan timer must have run while discovery was still probing: the
      // probe chain yields one macrotask between targets instead of blocking for
      // the combined length of every store probe (#149935).
      expect(timerRan).toBe(true);
      expect(storeTargets).toContainEqual({
        agentId: "yield-a",
        storePath: path.join(sessionsDirA, "sessions.json"),
      });
      expect(storeTargets).toContainEqual({
        agentId: "yield-b",
        storePath: path.join(sessionsDirB, "sessions.json"),
      });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
