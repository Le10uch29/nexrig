import { frameTime, type BenchPreset } from "./config";
import type { BenchRenderer } from "./runner";
import { cubeVertices, GLSL_FRAGMENT, GLSL_VERTEX } from "./scene";

export interface DisposableRenderer extends BenchRenderer {
  dispose(): void;
}

/**
 * WebGL2 workload: renders into an off-screen framebuffer at the preset's fixed size (not tied to
 * the display or its refresh rate). `sync` reads one pixel back, which waits for the GPU to finish
 * the frame. `preview` copies the off-screen frame to the visible canvas, outside the timed part.
 */
export function createWebGL2Renderer(canvas: HTMLCanvasElement, preset: BenchPreset): DisposableRenderer {
  canvas.width = preset.width;
  canvas.height = preset.height;
  const gl = canvas.getContext("webgl2", { antialias: false, depth: false, powerPreference: "high-performance", preserveDrawingBuffer: false });
  if (!gl) throw new Error("WebGL2 недоступен.");

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Ошибка шейдера: ${gl.getShaderInfoLog(s) ?? ""}`);
    return s;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, GLSL_VERTEX));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, GLSL_FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Ошибка программы: ${gl.getProgramInfoLog(program) ?? ""}`);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, cubeVertices(), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  const color = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, color);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, preset.width, preset.height);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
  const depth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, preset.width, preset.height);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Не удалось создать off-screen буфер WebGL2.");

  gl.useProgram(program);
  const uTime = gl.getUniformLocation(program, "uTime");
  gl.uniform1f(gl.getUniformLocation(program, "uAspect"), preset.width / preset.height);
  gl.uniform1i(gl.getUniformLocation(program, "uIterations"), preset.iterations);
  gl.enable(gl.DEPTH_TEST);
  gl.viewport(0, 0, preset.width, preset.height);
  const pixel = new Uint8Array(4);

  return {
    frame(index) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.clearColor(0.03, 0.03, 0.06, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform1f(uTime, frameTime(index));
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, preset.instances);
    },
    async sync() {
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      if (gl.isContextLost()) throw new Error("Контекст WebGL2 потерян (драйвер или браузер сбросил GPU).");
    },
    preview() {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.blitFramebuffer(0, 0, preset.width, preset.height, 0, 0, preset.width, preset.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    },
    dispose() {
      gl.deleteFramebuffer(fbo);
      gl.deleteRenderbuffer(color);
      gl.deleteRenderbuffer(depth);
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    },
  };
}
