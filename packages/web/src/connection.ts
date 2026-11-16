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
  if (pageProtocol === "https:" && url.protocol !== "https:")
    throw new Error("HTTPS 웹에서는 HTTPS 서버 주소가 필요합니다");
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
