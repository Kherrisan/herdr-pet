import { createServer } from "node:net";
import { unlink } from "node:fs/promises";

const socketPath = process.argv[2];
const scenario = process.argv[3] ?? "sleeping";
if (!socketPath) throw new Error("Usage: node perf-fake-herdr.mjs <socket-path>");
if (!new Set(["sleeping", "idle", "working", "blocked", "completion", "stress"]).has(scenario)) {
  throw new Error(`Unsupported performance scenario: ${scenario}`);
}
await unlink(socketPath).catch((error) => {
  if (error.code !== "ENOENT") throw error;
});

let stressStarted = false;
let stressDisconnected = false;

const stressAgents = Array.from({ length: 10 }, (_, index) => ({
  workspace_id: `stress-workspace-${index % 2}`,
  pane_id: `stress:agent-${index}`,
  agent: `fixture-${index + 1}`,
  agent_status: stressDisconnected ? "idle" : "working",
}));

const stressEvent = (index, status) => JSON.stringify({
  event: "pane.agent_status_changed",
  data: {
    pane_id: `stress:agent-${index}`,
    workspace_id: `stress-workspace-${index % 2}`,
    agent: `fixture-${index + 1}`,
    agent_status: status,
  },
});

const runStressScenario = (socket) => {
  if (stressStarted) return;
  stressStarted = true;
  for (let cycle = 0; cycle < 10; cycle += 1) {
    setTimeout(() => {
      if (socket.destroyed) return;
      for (let index = 0; index < 10; index += 1) socket.write(`${stressEvent(index, "working")}\n`);
    }, 200 + cycle * 70);
    setTimeout(() => {
      if (socket.destroyed) return;
      for (let index = 0; index < 10; index += 1) socket.write(`${stressEvent(index, "done")}\n`);
    }, 225 + cycle * 70);
  }
  setTimeout(() => {
    if (!socket.destroyed) socket.write(`${stressEvent(0, "blocked")}\n`);
  }, 480);
  setTimeout(() => {
    stressDisconnected = true;
    socket.destroy();
  }, 1_050);
};

const server = createServer((socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
  let pending = "";
  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    pending += chunk;
    const newline = pending.indexOf("\n");
    if (newline < 0) return;
    const line = pending.slice(0, newline);
    pending = pending.slice(newline + 1);
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      socket.end('{"error":{"code":"invalid_json","message":"invalid JSON"}}\n');
      return;
    }
    if (request.method === "ping") {
      socket.end(`${JSON.stringify({ id: request.id, result: { type: "pong", version: "perf-fixture", protocol: 20 } })}\n`);
    } else if (request.method === "session.snapshot") {
      const panes = scenario === "sleeping"
        ? []
        : scenario === "stress"
          ? stressAgents.map((agent) => ({ pane_id: agent.pane_id }))
          : [{ pane_id: "perf:agent" }];
      const agentStatus = scenario === "completion" ? "working" : scenario;
      const agents = scenario === "sleeping"
        ? []
        : scenario === "stress"
          ? stressAgents.map((agent) => ({
              ...agent,
              agent_status: stressDisconnected ? "idle" : "working",
            }))
        : [{ workspace_id: "perf", pane_id: "perf:agent", agent: "fixture", agent_status: agentStatus }];
      socket.end(`${JSON.stringify({ id: request.id, result: { type: "session_snapshot", snapshot: { version: "perf-fixture", protocol: 20, panes, agents } } })}\n`);
    } else if (request.method === "events.subscribe") {
      socket.write(`${JSON.stringify({ id: request.id, result: { type: "subscribed" } })}\n`);
      if (scenario === "completion") {
        setTimeout(() => {
          if (!socket.destroyed) {
            socket.write(`${JSON.stringify({ event: "pane.agent_status_changed", data: { pane_id: "perf:agent", workspace_id: "perf", agent: "fixture", agent_status: "done" } })}\n`);
          }
        }, 1_000);
      } else if (scenario === "stress") {
        runStressScenario(socket);
      }
    } else {
      socket.end(`${JSON.stringify({ id: request.id, error: { code: "unknown_method", message: "unknown method" } })}\n`);
    }
  });
});

const sockets = new Set();
const stop = () => {
  for (const socket of sockets) socket.destroy();
  server.close(() => void unlink(socketPath).catch(() => undefined));
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.listen(socketPath);
