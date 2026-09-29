/// <reference lib="webworker" />
import { meshChunk } from '../geometry/mesher';
import { transferables, type MeshRequest, type MeshResponse } from './protocol';

self.onmessage = (e: MessageEvent<MeshRequest>) => {
  const { id, features, origin, theme } = e.data;
  try {
    const mesh = meshChunk(features, origin, theme);
    (self as unknown as Worker).postMessage(
      { id, mesh } satisfies MeshResponse,
      transferables(mesh),
    );
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) } satisfies MeshResponse);
  }
};
