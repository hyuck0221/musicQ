import { serverAddressSpace } from "./localNetwork.ts";
import type { Connection } from "./types";

export function normalizeConnection(
  value: unknown,
  pageProtocol: string,
): Connection {
  if (
    !value ||
    typeof value !== "object" ||
    !("url" in value) ||
    !("token" in value) ||
    typeof value.url !== "string" ||
    typeof value.token !== "string"
  )
    throw new Error("서버 주소와 연결 키를 입력해 주세요");
  const url = new URL(value.url.trim());
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("http(s) 서버 주소와 포트만 입력해 주세요");
  const space = serverAddressSpace(url);
  if (pageProtocol === "https:" && url.protocol === "http:" && !space)
    throw new Error(
      "HTTP는 localhost·로컬 IP·.local 서버에서만 사용할 수 있습니다. 외부 서버는 HTTPS 주소를 입력해 주세요",
    );
  if (space && url.hostname.endsWith("."))
    url.hostname = url.hostname.slice(0, -1);
  const token = value.token.trim();
  if (!token) throw new Error("서버의 연결 키를 입력해 주세요");
  return { url: url.origin, token };
}
export function readSavedConnection(
  storage: Pick<Storage, "getItem">,
  pageProtocol: string,
): Connection | null {
  try {
    return normalizeConnection(
      JSON.parse(storage.getItem("musicq.connection") || "null"),
      pageProtocol,
    );
  } catch {
    return null;
  }
}
