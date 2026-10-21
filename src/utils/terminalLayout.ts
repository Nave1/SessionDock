export function fitTerminalWhenVisible(
  container: Pick<HTMLElement, "clientWidth" | "clientHeight">,
  fit: () => void,
): boolean {
  if (container.clientWidth <= 0 || container.clientHeight <= 0) return false;
  fit();
  return true;
}