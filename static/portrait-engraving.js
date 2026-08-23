const vertexShaderSource = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fragmentShaderSource = `
  precision mediump float;
  uniform sampler2D u_image;
  uniform vec2 u_resolution;
  uniform vec3 u_ink;
  uniform float u_hover;
  varying vec2 v_uv;

  void main() {
    vec3 image = texture2D(u_image, vec2(v_uv.x, 1.0 - v_uv.y)).rgb;
    float tone = dot(image, vec3(0.2126, 0.7152, 0.0722));
    float primaryWave = 0.5 + 0.5 * sin((v_uv.x * u_resolution.x * 0.28 + v_uv.y * u_resolution.y * 0.28) * 6.2831853);
    float primary = smoothstep(0.82 - tone * 0.48, 0.97, primaryWave) * smoothstep(0.04, 0.22, tone);
    float crossWave = 0.5 + 0.5 * sin((v_uv.x * u_resolution.x * 0.19 - v_uv.y * u_resolution.y * 0.19) * 6.2831853);
    float midtone = smoothstep(0.1, 0.32, tone) * (1.0 - smoothstep(0.55, 0.9, tone));
    float crosshatch = smoothstep(0.9, 0.985, crossWave) * midtone * u_hover;
    gl_FragColor = vec4(u_ink, clamp(primary + crosshatch, 0.0, 1.0));
  }
`;

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

function createProgram(gl) {
  const vertex = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  if (!vertex || !fragment) return null;

  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
  gl.deleteProgram(program);
  return null;
}

function inkColor() {
  return document.documentElement.dataset.theme === "light" ? [0.18, 0.17, 0.15] : [0.92, 0.86, 0.7];
}

function initializePortrait(element) {
  const canvas = element.querySelector("canvas");
  const fallback = element.querySelector("img");
  const interactionTarget = element.closest(".brand-lockup") || element;
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false }) || canvas.getContext("experimental-webgl", { alpha: true, premultipliedAlpha: false });
  if (!gl) return;

  const program = createProgram(gl);
  if (!program) return;

  const position = gl.getAttribLocation(program, "a_position");
  const resolution = gl.getUniformLocation(program, "u_resolution");
  const hover = gl.getUniformLocation(program, "u_hover");
  const ink = gl.getUniformLocation(program, "u_ink");
  const texture = gl.createTexture();
  const buffer = gl.createBuffer();
  let hovered = 0;

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const render = () => {
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = element.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.round(width * scale));
    const nextHeight = Math.max(1, Math.round(height * scale));
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(resolution, canvas.width, canvas.height);
    gl.uniform1f(hover, hovered);
    gl.uniform3fv(ink, inkColor());
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  const loadTexture = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fallback);
    element.classList.add("is-rendered");
    render();
  };

  if (fallback.complete && fallback.naturalWidth) loadTexture();
  else fallback.addEventListener("load", loadTexture, { once: true });

  interactionTarget.addEventListener("mouseenter", () => { hovered = 1; render(); });
  interactionTarget.addEventListener("mouseleave", () => { hovered = 0; render(); });
  interactionTarget.addEventListener("focus", () => { hovered = 1; render(); });
  interactionTarget.addEventListener("blur", () => { hovered = 0; render(); });
  new ResizeObserver(render).observe(element);
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}

document.querySelectorAll("[data-portrait-engraving]").forEach(initializePortrait);
