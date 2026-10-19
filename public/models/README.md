# 3D models

No GLB/glTF files are bundled yet: every component renders a procedural model
(`components/builder/scene/models.tsx`). The procedural models are being replaced gradually.

## Where to see what needs a model

- **Studio → «Список моделей»** (`/studio`): every catalog component, the model it renders today and
  the registry keys a GLB can be registered under.
- **`/studio/models.csv`**: the same list as CSV (opens in Excel), one row per component.

GLB is supported for: case, motherboard, CPU, GPU, storage, PSU. RAM kits, fan packs and coolers
(with a separately placed AIO radiator) are multi-part and stay procedural for now.

## Adding a model

1. Use only files you may legally ship (own models, manufacturer-licensed, or a library license that
   allows redistribution). Record the license in the registry entry.
2. Open **Studio → «3D-модели»**, load the `.glb` (or `.gltf` with its `.bin` and textures — selecting
   the folder is easiest). Draco and KTX2 files are refused with an explanation; re-export without them.
3. Choose the **reference part** — the procedural model the file replaces. Coordinates are then the
   same as in `/builder`; align scale, position, rotation and pivot over the reference.
4. Optional: **«Показать в конструкторе»** previews the model in `/builder` instead of that one
   component until the page reloads (a banner there shows it and disconnects it).
5. Put the file in this folder, e.g. `public/models/gpu/rtx-4070-fe.glb` (meshopt-compressed,
   textures ≤ 2K), restart the site, enter the path in Studio and press «Проверить». Only a path
   that was found is written to the export.
6. **«Скачать JSON трансформации»** and add its `asset` to `MODEL_ASSETS` in
   `features/models/registry.ts` under `registryKey` (exact component id, `exactProduct: true`) or a
   generic key such as `gpu:RTX 4070` / `case:generic` (generic models must not claim to be exact).

If a file is missing or fails to load, the procedural model is shown automatically.

## Removing old procedural models

Do not delete a procedural model while any component of its category still uses it — it is also the
fallback when a GLB fails to load. «Список моделей» marks a category «процедурную можно удалить» only
when every component in it has a GLB; delete the model then (and its branch in `SlotRenderer`/`PcScene`).
After that a GLB that fails to load has no fallback, so check every file of the category in Studio first.
