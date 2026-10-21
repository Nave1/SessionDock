export type SshAuthenticationMethod = "password" | "private_key" | "ssh_agent" | "manual";

export function shouldPromptForPassword(
  protocol: string,
  authenticationMethod: SshAuthenticationMethod,
  password?: string,
  credentialProfileId?: string,
): boolean {
  return protocol === "ssh"
    && (authenticationMethod === "password" || authenticationMethod === "manual")
    && !password
    && !credentialProfileId;
}