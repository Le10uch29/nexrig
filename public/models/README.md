# 3D models

No GLB/glTF files are bundled: every component renders an improved procedural model.

To add a real model:

1. Use only files you may legally ship (own models, manufacturer-licensed, or a library license that allows redistribution). Record the license in the registry entry.
2. Put the file here, e.g. `public/models/gpu/rtx-4070-fe.glb` (Draco/meshopt-compressed, textures ≤ 2K).
3. Register it in `features/models/registry.ts` under the exact component id (set `exactProduct: true`) or a generic key such as `gpu:RTX 4070` (generic models must not claim to be the exact product).
4. Align it with the procedural model's local origin using `scale`, `rotation` and `anchorOffset`, and set `boundingBox` so selection boxes and labels fit.

If the file is missing or fails to load, the procedural model is shown automatically.
