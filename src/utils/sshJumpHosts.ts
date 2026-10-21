import type { Session } from "../types";

type JumpHostCandidate = Pick<
  Session,
  | "id"
  | "protocol"
  | "username"
  | "authentication_method"
  | "credential_profile_id"
  | "private_key_reference"
>;

export function isEligibleJumpHost(
  session: JumpHostCandidate,
  targetSessionId: string | undefined,
  selectedIds: string[],
): boolean {
  if (session.id === targetSessionId || session.protocol !== "ssh") return false;
  if (selectedIds.includes(session.id) || !session.username?.trim()) return false;
  if (session.authentication_method === "manual") return false;
  if (session.authentication_method === "password") return Boolean(session.credential_profile_id);
  if (session.authentication_method === "private_key") return Boolean(session.private_key_reference);
  return session.authentication_method === "ssh_agent";
}

export function moveJumpHostId(ids: string[], index: number, direction: -1 | 1): string[] {
  const destination = index + direction;
  if (index < 0 || index >= ids.length || destination < 0 || destination >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}