import { useEffect, useRef, useState } from 'react';

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
varying vec2 v_uv;
uniform vec2 u_resolution;
uniform float u_time;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float total = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    total += noise(p) * amplitude;
    p *= 2.02;
    amplitude *= 0.5;
  }
  return total;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 centered = uv - 0.5;
  centered.x *= u_resolution.x / max(u_resolution.y, 1.0);

  float radial = smoothstep(0.95, 0.0, length(centered));
  float sweep = sin((uv.y + u_time * 0.01) * 140.0) * 0.5 + 0.5;
  float grain = fbm(uv * 4.2 + vec2(u_time * 0.018, -u_time * 0.012));
  float coarse = fbm(uv * 1.4 + vec2(-u_time * 0.007, u_time * 0.005));

  vec3 teal = vec3(0.0, 0.60, 0.57);
  vec3 deepTeal = vec3(0.0, 0.30, 0.28);
  vec3 base = vec3(0.006, 0.007, 0.010);

  float contour = smoothstep(0.36, 0.86, coarse) * radial;
  vec3 color = base;
  color += teal * contour * 0.072;
  color += deepTeal * pow(1.0 - length(centered * vec2(0.88, 1.14)), 4.8) * 0.028;
  color += vec3(grain * 0.05 + sweep * 0.003) * radial;

  gl_FragColor = vec4(color, 0.31);
}
`;

const createShader = (gl: WebGLRenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }

  return shader;
};

const createProgram = (gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string) => {
  const vertex = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return null;

  const program = gl.createProgram();
  if (!program) return null;

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);

  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  return program;
};

export default function GlobalNoise() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = motionPreference.matches;
    const handleMotionPrefChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
    };

    motionPreference.addEventListener('change', handleMotionPrefChange);

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power',
    });

    if (!gl) {
      setFallback(true);
      motionPreference.removeEventListener('change', handleMotionPrefChange);
      return;
    }

    const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    if (!program) {
      setFallback(true);
      motionPreference.removeEventListener('change', handleMotionPrefChange);
      return;
    }

    const positionBuffer = gl.createBuffer();
    if (!positionBuffer) {
      setFallback(true);
      motionPreference.removeEventListener('change', handleMotionPrefChange);
      return;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1,
        1, -1,
        -1, 1,
        -1, 1,
        1, -1,
        1, 1,
      ]),
      gl.STATIC_DRAW,
    );

    gl.useProgram(program);
    const positionLocation = gl.getAttribLocation(program, 'a_position');
    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
    const timeLocation = gl.getUniformLocation(program, 'u_time');

    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(Math.floor(window.innerWidth * dpr), 1);
      const height = Math.max(Math.floor(window.innerHeight * dpr), 1);

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;
      }

      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    resize();
    window.addEventListener('resize', resize);

    let rafId: number | null = null;
    const start = performance.now();

    const render = () => {
      const elapsed = (performance.now() - start) / 1000;
      const t = reducedMotion ? 0 : elapsed;

      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
      gl.uniform1f(timeLocation, t);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      rafId = window.requestAnimationFrame(render);
    };

    render();

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      motionPreference.removeEventListener('change', handleMotionPrefChange);
      gl.deleteBuffer(positionBuffer);
      gl.deleteProgram(program);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none z-0 opacity-[0.14] mix-blend-soft-light"
        aria-hidden="true"
      />
      {fallback && <div className="ta-noise-fallback" aria-hidden="true" />}
      <div className="ta-sand-bg-glow" aria-hidden="true" />
    </>
  );
}
