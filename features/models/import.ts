/**
 * Pure checks for importing local glTF models: which file is the model, which external files a
 * .gltf needs, which extensions can be decoded here. No DOM or Three.js — unit-tested.
 */

/** Hard limit for one import; larger scenes are impractical in the browser preview. */
export const MAX_IMPORT_BYTES = 200 * 1024 * 1024;

export interface ImportFile {
  name: string;
  size: number;
  /** Relative path when a folder was dropped (webkitRelativePath), otherwise the name. */
  path?: string;
}

export type ImportErrorCode = "no-model" | "several-models" | "too-large" | "empty" | "bad-json" | "bad-glb" | "not-gltf2" | "missing-dependencies" | "unsupported-extension" | "parse-failed";

/** An import problem with a message meant for the user. */
export class ModelImportError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = "ModelImportError";
  }
}

const ext = (name: string) => name.toLowerCase().split(".").pop() ?? "";

export type ModelKind = "glb" | "gltf";

/** Picks the model file among the selected files; the others are treated as its dependencies. */
export function classifyFiles<F extends ImportFile>(files: F[]): { main: F; kind: ModelKind; others: F[] } {
  if (files.length === 0) throw new ModelImportError("empty", "Файлы не выбраны.");
  const models = files.filter((f) => ext(f.name) === "glb" || ext(f.name) === "gltf");
  if (models.length === 0) throw new ModelImportError("no-model", "Среди выбранных файлов нет модели .glb или .gltf.", files.map((f) => f.name));
  if (models.length > 1) throw new ModelImportError("several-models", "Выбрано несколько моделей. Загрузите одну модель .glb или .gltf вместе с её файлами.", models.map((f) => f.name));
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > MAX_IMPORT_BYTES) throw new ModelImportError("too-large", `Файлы весят ${formatBytes(total)} — больше лимита ${formatBytes(MAX_IMPORT_BYTES)} для просмотра в браузере.`);
  const main = models[0];
  if (main.size === 0) throw new ModelImportError("empty", `Файл ${main.name} пустой.`);
  return { main, kind: ext(main.name) as ModelKind, others: files.filter((f) => f !== main) };
}

/** The binary glTF header: magic "glTF", version 2. */
export function checkGlbHeader(bytes: Uint8Array): void {
  const magic = bytes.length >= 12 ? String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) : "";
  if (magic !== "glTF") throw new ModelImportError("bad-glb", "Файл не является бинарным glTF (.glb): нет заголовка «glTF». Возможно, файл повреждён или это другой формат с расширением .glb.");
  const version = bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24);
  if (version !== 2) throw new ModelImportError("not-gltf2", `Поддерживается glTF 2.0, а у файла версия ${version}.`);
}

/** The JSON chunk of a .glb (needed to find external references and extensions). */
export function glbJson(bytes: Uint8Array): GltfJson {
  checkGlbHeader(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(12, true);
  const type = view.getUint32(16, true);
  if (type !== 0x4e4f534a) throw new ModelImportError("bad-glb", "В файле .glb нет JSON-блока — файл повреждён.");
  return parseGltfJson(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
}

export interface GltfJson {
  asset?: { version?: string };
  buffers?: { uri?: string }[];
  images?: { uri?: string; bufferView?: number }[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
}

export function parseGltfJson(text: string): GltfJson {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ModelImportError("bad-json", "Файл .gltf не читается как JSON — он повреждён или это не glTF.");
  }
  if (!json || typeof json !== "object") throw new ModelImportError("bad-json", "Файл .gltf не содержит описания сцены.");
  const g = json as GltfJson;
  const version = g.asset?.version;
  if (!version || !version.startsWith("2")) throw new ModelImportError("not-gltf2", `Поддерживается glTF 2.0, а у файла версия ${version ?? "не указана"}.`);
  return g;
}

/** External files a glTF refers to (buffers and images), excluding embedded data: URIs. */
export function externalDependencies(json: GltfJson): string[] {
  const uris = [...(json.buffers ?? []), ...(json.images ?? [])].map((x) => x.uri).filter((u): u is string => typeof u === "string" && u.length > 0 && !u.startsWith("data:"));
  return [...new Set(uris.map(normalizeUri))];
}

/** Absolute URLs cannot be resolved from local files and would mean network access. */
export function isRemoteUri(uri: string) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(uri);
}

function normalizeUri(uri: string) {
  let u = uri;
  try {
    u = decodeURIComponent(uri);
  } catch {
    // keep as written
  }
  return u.replace(/\\/g, "/").replace(/^\.\//, "");
}

const base = (p: string) => p.replace(/\\/g, "/").split("/").pop()!.toLowerCase();

/**
 * Maps each dependency to a selected file — by relative path first, then by file name.
 * Throws with the list of missing files: a partial set must not look like a successful import.
 */
export function resolveDependencies<F extends ImportFile>(deps: string[], files: F[]): Map<string, F> {
  const remote = deps.filter(isRemoteUri);
  if (remote.length) throw new ModelImportError("missing-dependencies", "Модель ссылается на файлы в интернете. Скачайте их и загрузите вместе с моделью.", remote);
  const byPath = new Map(files.map((f) => [normalizeUri(f.path ?? f.name).toLowerCase(), f]));
  const byName = new Map(files.map((f) => [base(f.name), f]));
  const found = new Map<string, F>();
  const missing: string[] = [];
  for (const d of deps) {
    const hit = [...byPath.entries()].find(([p]) => p === d.toLowerCase() || p.endsWith(`/${d.toLowerCase()}`))?.[1] ?? byName.get(base(d));
    if (hit) found.set(d, hit);
    else missing.push(d);
  }
  if (missing.length)
    throw new ModelImportError(
      "missing-dependencies",
      `Модели не хватает ${missing.length === 1 ? "файла" : `${missing.length} файлов`}. Выберите .gltf вместе со всеми файлами, на которые он ссылается (буферы .bin и текстуры), или загрузите модель одним .glb.`,
      missing,
    );
  return found;
}

/** Extensions three's GLTFLoader decodes here without extra decoder files or network. */
const SUPPORTED_REQUIRED = new Set([
  "KHR_materials_unlit",
  "KHR_texture_transform",
  "KHR_mesh_quantization",
  "KHR_materials_emissive_strength",
  "KHR_materials_clearcoat",
  "KHR_materials_transmission",
  "KHR_materials_ior",
  "KHR_materials_specular",
  "KHR_materials_volume",
  "KHR_materials_sheen",
  "KHR_materials_iridescence",
  "KHR_materials_anisotropy",
  "KHR_materials_dispersion",
  "KHR_lights_punctual",
  "KHR_texture_webp",
  "EXT_texture_webp",
  "EXT_texture_avif",
  "EXT_meshopt_compression",
  "EXT_mesh_gpu_instancing",
]);

const EXTENSION_HINT: Record<string, string> = {
  KHR_draco_mesh_compression: "сжатие Draco — пересохраните модель без Draco (или с meshopt)",
  KHR_texture_basisu: "текстуры KTX2/Basis — пересохраните с PNG, JPEG или WebP",
};

/** Required extensions the preview cannot decode — the model would load wrong, so it is refused. */
export function unsupportedExtensions(json: GltfJson): string[] {
  return (json.extensionsRequired ?? []).filter((e) => !SUPPORTED_REQUIRED.has(e));
}

export function assertSupported(json: GltfJson) {
  const bad = unsupportedExtensions(json);
  if (bad.length) throw new ModelImportError("unsupported-extension", "Модель использует расширения glTF, которые просмотр пока не поддерживает.", bad.map((e) => (EXTENSION_HINT[e] ? `${e}: ${EXTENSION_HINT[e]}` : e)));
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}
