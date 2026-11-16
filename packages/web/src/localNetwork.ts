export type LocalAddressSpace = "local" | "loopback";
export type ServerRequestInit = RequestInit & {
  targetAddressSpace?: LocalAddressSpace;
};

// Match address forms the browser can classify before DNS resolution. Arbitrary
// public hostnames resolving to private IPs need HTTPS for their WebSocket URL.
export function serverAddressSpace(
  input: string | URL,
): LocalAddressSpace | null {
  const url = typeof input === "string" ? new URL(input) : input;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "[::1]")
    return "loopback";
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const parts = host.split(".").map(Number);
    if (parts[0] === 127) return "loopback";
    if (
      parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 169 && parts[1] === 254)
    )
      return "local";
  }
  if (host.startsWith("[")) {
    const first = parseInt(host.slice(1).split(":")[0], 16);
    if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80)
      return "local";
  }
  if (host.endsWith(".local")) return "local";
  return null;
}
export function serverRequestOptions(
  url: string,
  options: RequestInit = {},
): ServerRequestInit {
  const space = serverAddressSpace(url);
  return {
    ...options,
    mode: "cors",
    ...(space ? { targetAddressSpace: space, redirect: "error" as const } : {}),
  };
}
export function needsLocalPermission(url: string, pageProtocol: string) {
  return pageProtocol === "https:" && serverAddressSpace(url) !== null;
}
export function needsLocalMediaBridge(url: string, pageProtocol: string) {
  return (
    needsLocalPermission(url, pageProtocol) && new URL(url).protocol === "http:"
  );
}
export async function queryServerPermission(
  url: string,
  pageProtocol: string,
  permissions?: Pick<Permissions, "query">,
): Promise<PermissionState> {
  if (!needsLocalPermission(url, pageProtocol)) return "granted";
  if (!permissions?.query) return "prompt";
  const name =
    serverAddressSpace(url) === "loopback"
      ? "loopback-network"
      : "local-network";
  try {
    return (await permissions.query({ name: name as PermissionName })).state;
  } catch {
    // Unsupported granular names require a user-initiated connection attempt.
    // Never query the old "local-network-access" alias (unsafe on older Chrome).
    return "prompt";
  }
}
export function localPermissionMessage(state: PermissionState) {
  return state === "denied"
    ? "브라우저 사이트 설정에서 로컬 네트워크 접근을 허용한 뒤 다시 연결해 주세요"
    : "연결을 눌러 이 컴퓨터 또는 로컬 네트워크의 서버 접근을 허용해 주세요";
}
export function serverConnectionError(url: string) {
  return serverAddressSpace(url)
    ? "로컬 네트워크 권한과 서버 실행 상태를 확인해 주세요. 차단되는 브라우저에서는 HTTPS 주소를 사용하세요"
    : "서버 주소·실행 상태·허용 웹 주소를 확인해 주세요";
}
// Call only from an explicit Connect action. Fetch requests the browser-managed
// permission, then WebSocket can reuse it without non-standard constructor options.
export async function authorizeServer(
  url: string,
  pageProtocol: string,
  signal: AbortSignal,
  permissions?: Pick<Permissions, "query">,
  fetcher: typeof fetch = fetch,
) {
  if (!needsLocalPermission(url, pageProtocol)) return;
  const permission = await queryServerPermission(
    url,
    pageProtocol,
    permissions,
  );
  if (permission === "denied")
    throw new Error(localPermissionMessage(permission));
  let response: Response;
  try {
    response = await fetcher(
      url + "/health",
      serverRequestOptions(url, { signal }),
    );
  } catch {
    throw new Error(serverConnectionError(url));
  }
  if (!response.ok) throw new Error("서버 상태를 확인할 수 없습니다");
  const health = await response.json();
  if (health.name !== "musicQ")
    throw new Error("musicQ 서버 주소를 확인해 주세요");
}
