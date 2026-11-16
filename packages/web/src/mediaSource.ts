import {
  needsLocalMediaBridge,
  serverConnectionError,
  serverRequestOptions,
} from "./localNetwork.ts";

export type MediaSource = { src: string; release: () => void };
export async function loadMediaSource(
  url: string,
  pageProtocol: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<MediaSource> {
  // Keep direct streaming/Range for HTTPS. For local HTTP use an explicit LNA
  // fetch and a blob URL so <audio> does not upgrade/block mixed media requests.
  if (!needsLocalMediaBridge(url, pageProtocol))
    return { src: url, release: () => {} };
  let response: Response;
  try {
    response = await fetcher(url, serverRequestOptions(url, { signal }));
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(serverConnectionError(url));
  }
  if (!response.ok)
    throw new Error(
      "음악 파일을 불러오지 못했습니다. 서버에 다시 연결해 주세요",
    );
  const blob = await response.blob();
  signal.throwIfAborted();
  const src = URL.createObjectURL(blob);
  return { src, release: () => URL.revokeObjectURL(src) };
}
