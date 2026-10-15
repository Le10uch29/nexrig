/// <reference types="@webgpu/types" />
import { frameTime, type BenchPreset } from "./config";
import { cubeVertices, WGSL } from "./scene";
import type { DisposableRenderer } from "./webgl2";

/**
 * WebGPU workload: the same scene, rendered into an off-screen texture at the preset's fixed size.
 * `sync` waits for queue.onSubmittedWorkDone(), i.e. until the GPU has finished the frame.
 * `preview` copies the texture to the canvas outside the timed part.
 */
export async function createWebGPURenderer(canvas: HTMLCanvasElement, preset: BenchPreset): Promise<DisposableRenderer> {
  const gpu = navigator.gpu;
  if (!gpu) throw new Error("WebGPU недоступен.");
  const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("Адаптер WebGPU недоступен.");
  const device = await adapter.requestDevice();
  let lost: string | null = null;
  void device.lost.then((info) => {
    lost = info.message || "устройство потеряно";
  });

  canvas.width = preset.width;
  canvas.height = preset.height;
  const context = canvas.getContext("webgpu");
  if (!context) throw new Error("Не удалось создать контекст WebGPU.");
  const format = gpu.getPreferredCanvasFormat();
  context.configure({ device, format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST, alphaMode: "opaque" });

  const shader = device.createShaderModule({ code: WGSL });
  const info = await shader.getCompilationInfo();
  const error = info.messages.find((m) => m.type === "error");
  if (error) throw new Error(`Ошибка шейдера WebGPU: ${error.message}`);

  const vertices = cubeVertices();
  const vbo = device.createBuffer({ size: vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(vbo, 0, vertices);
  const ubo = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: shader,
      entryPoint: "vs",
      buffers: [
        {
          arrayStride: 24,
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x3" },
            { shaderLocation: 1, offset: 12, format: "float32x3" },
          ],
        },
      ],
    },
    fragment: { module: shader, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
    depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
  });
  const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubo } }] });
  const target = device.createTexture({ size: [preset.width, preset.height], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
  const depth = device.createTexture({ size: [preset.width, preset.height], format: "depth24plus", usage: GPUTextureUsage.RENDER_ATTACHMENT });
  const targetView = target.createView();
  const depthView = depth.createView();
  const uniforms = new ArrayBuffer(16);
  const f32 = new Float32Array(uniforms);
  const u32 = new Uint32Array(uniforms);
  f32[1] = preset.width / preset.height;
  u32[2] = preset.iterations;

  return {
    frame(index) {
      f32[0] = frameTime(index);
      device.queue.writeBuffer(ubo, 0, uniforms);
      const enc = device.createCommandEncoder();
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: targetView, clearValue: { r: 0.03, g: 0.03, b: 0.06, a: 1 }, loadOp: "clear", storeOp: "store" }],
        depthStencilAttachment: { view: depthView, depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "discard" },
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.setVertexBuffer(0, vbo);
      pass.draw(36, preset.instances);
      pass.end();
      device.queue.submit([enc.finish()]);
    },
    async sync() {
      await device.queue.onSubmittedWorkDone();
      if (lost) throw new Error(`Устройство WebGPU потеряно: ${lost}`);
    },
    preview() {
      const enc = device.createCommandEncoder();
      enc.copyTextureToTexture({ texture: target }, { texture: context.getCurrentTexture() }, [preset.width, preset.height]);
      device.queue.submit([enc.finish()]);
    },
    dispose() {
      target.destroy();
      depth.destroy();
      vbo.destroy();
      ubo.destroy();
      device.destroy();
    },
  };
}
