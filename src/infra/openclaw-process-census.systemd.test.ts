import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mockProcessPlatform } from "../test-utils/vitest-spies.js";

const { members } = vi.hoisted(() => ({ members: vi.fn() }));

vi.mock("../process/supervisor/service-child-group-ownership.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../process/supervisor/service-child-group-ownership.js")
  >()),
  readProcessGroupMembers: members,
}));
vi.mock("./container-environment.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./container-environment.js")>()),
  isContainerEnvironment: () => false,
}));
// Unreadable working directories stay absent from the directory map.
vi.mock("./gateway-process-argv.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./gateway-process-argv.js")>()),
  readProcessWorkingDirectories: () => new Map(),
}));
import { inspectOtherOpenClawProcesses } from "./openclaw-process-census.js";

const getuidDescriptor = Object.getOwnPropertyDescriptor(process, "getuid");

beforeEach(() => {
  mockProcessPlatform("linux");
  Object.defineProperty(process, "getuid", { configurable: true, value: () => 1000 });
});

afterEach(() => {
  vi.restoreAllMocks();
  if (getuidDescriptor) {
    Object.defineProperty(process, "getuid", getuidDescriptor);
  }
});

const managerPid = process.pid + 10;
const helperPid = process.pid + 11;

const handoffRefs = {
  runId: "systemd-reexec-update-run",
  artifactPaths: ["/tmp/openclaw-update-runtime-Ab1234"],
};

it("does not let a reexec'd systemd user manager block update-repair evidence", () => {
  members.mockReturnValue([
    { pid: process.pid, state: "S", command: { ppid: 0, argv: ["openclaw-doctor"] } },
    {
      pid: managerPid,
      state: "S",
      command: {
        ppid: 1,
        argv: ["/usr/lib/systemd/systemd", "--user", "--deserialize=8"],
        uid: 1000,
      },
    },
    { pid: helperPid, state: "S", command: { ppid: managerPid, argv: ["(sd-pam)"], uid: 1000 } },
  ]);
  expect(inspectOtherOpenClawProcesses()).toEqual({ pids: [] });
  expect(inspectOtherOpenClawProcesses(handoffRefs)).toEqual({
    matchingPids: [],
    unverifiedPids: [],
  });
});

it("keeps the systemd login-process exemption off unrelated user-manager arguments", () => {
  members.mockReturnValue([
    { pid: process.pid, state: "S", command: { ppid: 0, argv: ["openclaw-doctor"] } },
    {
      pid: managerPid,
      state: "S",
      command: {
        ppid: 1,
        argv: ["/usr/lib/systemd/systemd", "--user", "--unit=other.service"],
        uid: 1000,
      },
    },
    { pid: helperPid, state: "S", command: { ppid: managerPid, argv: ["(sd-pam)"], uid: 1000 } },
  ]);
  expect(inspectOtherOpenClawProcesses()).toEqual({
    pids: expect.arrayContaining([helperPid]),
    warnings: expect.arrayContaining([
      expect.stringContaining(`PID ${helperPid}: working directory is unavailable`),
    ]),
  });
});
