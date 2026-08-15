import defaultStudioDocument from "../../third-party/avatar-lab/src/features/studio/defaultStudioDocument.json";
import { resolveAvatarBehavior } from "../../third-party/avatar-lab/src/features/avatar/avatars";
import {
  createAvatarExportPayload,
  type AvatarExportPayload,
} from "../../third-party/avatar-lab/src/features/export/exporter";
import {
  parseImportedStudioDocument,
  type StudioDocument,
} from "../../third-party/avatar-lab/src/features/studio/studioDocument";

export const builtInStudioDocument = defaultStudioDocument as unknown as StudioDocument;

export interface ResolvedAvatarProject {
  document: StudioDocument;
  avatarId: string;
  avatarName: string;
  payload: AvatarExportPayload;
  animationKeys: string[];
}

export function resolveStudioAvatar(
  document: StudioDocument,
  requestedAvatarId?: string | null,
): ResolvedAvatarProject {
  const avatar =
    document.library.avatars.find((candidate) => candidate.id === requestedAvatarId) ??
    document.library.avatars.find(
      (candidate) => candidate.id === document.library.activeAvatarId,
    ) ??
    document.library.avatars[0];
  if (!avatar) throw new Error("Avatar Studio 工程中没有 Avatar");
  const behavior = resolveAvatarBehavior(avatar, {
    expressions: document.expressions,
    sequences: document.sequences,
  });
  const payload = createAvatarExportPayload(avatar, behavior.expressions, behavior.sequences);
  return {
    document,
    avatarId: avatar.id,
    avatarName: avatar.name,
    animationKeys: Object.keys(payload.animations),
    payload,
  };
}

export function parseAvatarProject(
  source: string,
  requestedAvatarId?: string | null,
): ResolvedAvatarProject {
  const document = parseImportedStudioDocument(source, builtInStudioDocument);
  return resolveStudioAvatar(document, requestedAvatarId);
}

export const builtInAvatarProject = resolveStudioAvatar(builtInStudioDocument, "strobi");
