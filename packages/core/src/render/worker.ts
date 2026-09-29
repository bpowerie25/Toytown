/// <reference lib="webworker" />
import { processChunk } from './chunk';
import { transferables, type ChunkRequest, type ChunkResponse } from './protocol';

self.onmessage = (e: MessageEvent<ChunkRequest>) => {
  const { id, ...request } = e.data;
  try {
    const result = processChunk(request);
    (self as unknown as Worker).postMessage(
      { id, ...result } satisfies ChunkResponse,
      transferables(result),
    );
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) } satisfies ChunkResponse);
  }
};
