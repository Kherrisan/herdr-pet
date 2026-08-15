import { describe, expect, it } from "vitest";
import defaultStudioDocument from "../../third-party/avatar-lab/src/features/studio/defaultStudioDocument.json";
import { builtInAvatarProject, parseAvatarProject } from "./project";

describe("Avatar Studio project adapter", () => {
  it("resolves the built-in Strobi project through the official exporter", () => {
    expect(builtInAvatarProject.avatarId).toBe("strobi");
    expect(builtInAvatarProject.payload.version).toBe(1);
    expect(builtInAvatarProject.animationKeys).toContain("idle");
  });

  it("selects another avatar while preserving the shared behavior library", () => {
    const source = JSON.stringify(defaultStudioDocument);
    const requested = defaultStudioDocument.library.avatars[1];
    const resolved = parseAvatarProject(source, requested.id);
    expect(resolved.avatarId).toBe(requested.id);
    expect(resolved.avatarName).toBe(requested.name);
    expect(resolved.animationKeys).toContain("working");
  });

  it("rejects unsupported Studio project versions", () => {
    expect(() => parseAvatarProject('{"version":999}')).toThrow();
  });
});
