/**
 * Nudot Studio Recreated WebGL Slider & Interactive Portfolio Experience
 * Features:
 * - Liquid Simplex Noise Distortion Shader with Dynamic Chromatic Aberration
 * - Real-time Mouse Parallax Physics
 * - Cosine Wave Drag Lines Responsive Indicator
 * - Kinetic Typography Slide Transitions
 * - 25 FPS Procedural Analog Film Grain Overlay
 */

// =========================================================
// 1. GLSL SHADERS (From Nudot Studio)
// =========================================================

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uTex1;
  uniform sampler2D uTex2;
  uniform float uProgress;
  uniform float uDirection;
  uniform float uTexReady;
  uniform vec2 uResolution;
  uniform vec2 uImageResolution;   // tex1 intrinsic resolution
  uniform vec2 uImageResolution2;  // tex2 intrinsic resolution
  uniform vec2 uMouse;
  varying vec2 vUv;

  vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m; m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // Cover aspect-ratio math: prevents image stretching
  vec2 fitCover(vec2 uvCoord, vec2 imgRes) {
    if (imgRes.x <= 0.0 || imgRes.y <= 0.0) return uvCoord;
    vec2 ratio = vec2(
        min((uResolution.x / uResolution.y) / (imgRes.x / imgRes.y), 1.0),
        min((uResolution.y / uResolution.x) / (imgRes.y / imgRes.x), 1.0)
    );
    return vec2(
        uvCoord.x * ratio.x + (1.0 - ratio.x) * 0.5,
        uvCoord.y * ratio.y + (1.0 - ratio.y) * 0.5
    );
  }

  void main() {
    vec2 uvA = fitCover(vUv, uImageResolution);
    vec2 uvB = fitCover(vUv, uImageResolution2);

    // Subtle scale & interactive mouse parallax offset
    uvA = (uvA - 0.5) * 0.96 + 0.5;
    uvA -= uMouse * 0.018;
    uvB = (uvB - 0.5) * 0.96 + 0.5;
    uvB -= uMouse * 0.018;

    float p = uProgress;

    // Fluid liquid simplex noise warp calculation
    vec2 uvNoise = mix(uvA, uvB, 0.5);
    float noiseVal = (p > 0.001 && p < 0.999) ? snoise(uvNoise * 3.5 + p * 2.5) : 0.0;
    float warp = noiseVal * p * (1.0 - p) * 0.32;

    vec2 center = vec2(0.5, 0.5);
    vec2 uv1 = mix(uvA, center, p * 0.15) + vec2(0.0, uDirection * p * 0.32) + warp;
    vec2 uv2 = mix(uvB, center, (1.0 - p) * 0.15) - vec2(0.0, uDirection * (1.0 - p) * 0.32) + warp;

    // Dynamic RGB shift / chromatic aberration
    float shift = 0.045 * p * (1.0 - p) * (noiseVal + 1.2);

    vec4 t1 = vec4(
        texture2D(uTex1, uv1 + vec2(shift, 0.0)).r,
        texture2D(uTex1, uv1).g,
        texture2D(uTex1, uv1 - vec2(shift, 0.0)).b,
        1.0
    );

    vec4 t2 = vec4(
        texture2D(uTex2, uv2 + vec2(shift, 0.0)).r,
        texture2D(uTex2, uv2).g,
        texture2D(uTex2, uv2 - vec2(shift, 0.0)).b,
        1.0
    );

    gl_FragColor = mix(t1, t2, smoothstep(0.0, 1.0, p));
  }
`;

// =========================================================
// 2. WEBGL MANAGER CLASS
// =========================================================

class WebGLManager {
  constructor(containerId, imageUrls) {
    this.container = document.getElementById(containerId);
    this.imageUrls = imageUrls;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    
    this.activeTextureIndex = 0;
    this.textureLoader = new THREE.TextureLoader();
    this.textureLoader.setCrossOrigin('anonymous');
    this.textureCache = {};
    this.textureResolutions = {};
    
    this.mouse = new THREE.Vector2(0, 0);
    this.targetMouse = new THREE.Vector2(0, 0);

    const size = this.getRenderSize();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(size.width, size.height);
    this.container.appendChild(this.renderer.domElement);

    this.initShader();
    this.initEvents();
    this.startRenderLoop();
  }

  getRenderSize() {
    return {
      width: this.container ? (this.container.clientWidth || window.innerWidth) : window.innerWidth,
      height: this.container ? (this.container.clientHeight || window.innerHeight) : window.innerHeight
    };
  }

  initShader() {
    const size = this.getRenderSize();
    this.geometry = new THREE.PlaneGeometry(2, 2);

    // Initial 1x1 black fallback texture
    const fallbackTex = new THREE.DataTexture(new Uint8Array([10, 10, 10, 255]), 1, 1, THREE.RGBAFormat);
    fallbackTex.needsUpdate = true;

    this.material = new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      uniforms: {
        uTex1: { value: fallbackTex },
        uTex2: { value: fallbackTex },
        uProgress: { value: 0.0 },
        uDirection: { value: 1.0 },
        uTexReady: { value: 1.0 },
        uResolution: { value: new THREE.Vector2(size.width, size.height) },
        uImageResolution: { value: new THREE.Vector2(1920, 1080) },
        uImageResolution2: { value: new THREE.Vector2(1920, 1080) },
        uMouse: { value: new THREE.Vector2(0, 0) }
      },
      depthTest: false,
      depthWrite: false
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);

    // Load first slide texture immediately
    this.loadTextureAt(0).then(tex => {
      if (tex) {
        this.material.uniforms.uTex1.value = tex;
        this.applyTextureResolution(0, tex, 1);
        this.applyTextureResolution(0, tex, 2);
      }
    });

    // Preload next textures asynchronously
    for (let i = 1; i < this.imageUrls.length; i++) {
      this.loadTextureAt(i);
    }
  }

  loadTextureAt(index) {
    if (this.textureCache[index]) {
      return Promise.resolve(this.textureCache[index]);
    }
    const url = this.imageUrls[index];
    if (!url) return Promise.resolve(null);

    return new Promise((resolve) => {
      this.textureLoader.load(
        url,
        (tex) => {
          tex.generateMipmaps = true;
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          this.textureCache[index] = tex;
          
          if (tex.image) {
            this.textureResolutions[index] = new THREE.Vector2(tex.image.width || 1920, tex.image.height || 1080);
          }
          resolve(tex);
        },
        undefined,
        () => resolve(null)
      );
    });
  }

  applyTextureResolution(index, texture, slot) {
    const resUniform = slot === 1 ? this.material.uniforms.uImageResolution : this.material.uniforms.uImageResolution2;
    if (this.textureResolutions[index]) {
      resUniform.value.copy(this.textureResolutions[index]);
    } else if (texture && texture.image) {
      resUniform.value.set(texture.image.width || 1920, texture.image.height || 1080);
    }
  }

  transition(currentIndex, nextIndex, direction, onComplete) {
    Promise.all([
      this.loadTextureAt(currentIndex),
      this.loadTextureAt(nextIndex)
    ]).then(([currentTex, nextTex]) => {
      if (!currentTex || !nextTex) {
        if (onComplete) onComplete();
        return;
      }

      this.material.uniforms.uTex1.value = currentTex;
      this.material.uniforms.uTex2.value = nextTex;
      this.applyTextureResolution(currentIndex, currentTex, 1);
      this.applyTextureResolution(nextIndex, nextTex, 2);
      this.material.uniforms.uDirection.value = direction;
      this.material.uniforms.uProgress.value = 0.0;
      this.activeTextureIndex = currentIndex;

      // GSAP smooth exponential transition matching Nudot Studio
      gsap.to(this.material.uniforms.uProgress, {
        value: 1.0,
        duration: 1.4,
        ease: "expo.inOut",
        onComplete: () => {
          this.material.uniforms.uTex1.value = nextTex;
          this.material.uniforms.uProgress.value = 0.0;
          this.activeTextureIndex = nextIndex;
          this.applyTextureResolution(nextIndex, nextTex, 1);
          this.applyTextureResolution(nextIndex, nextTex, 2);
          if (onComplete) onComplete();
        }
      });
    });
  }

  initEvents() {
    window.addEventListener("resize", () => {
      const size = this.getRenderSize();
      this.renderer.setSize(size.width, size.height);
      this.material.uniforms.uResolution.value.set(size.width, size.height);
    }, { passive: true });

    window.addEventListener("mousemove", (e) => {
      this.targetMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.targetMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    }, { passive: true });
  }

  startRenderLoop() {
    const loop = () => {
      requestAnimationFrame(loop);
      // Smooth lerp mouse physics
      this.mouse.x += (this.targetMouse.x - this.mouse.x) * 0.06;
      this.mouse.y += (this.targetMouse.y - this.mouse.y) * 0.06;
      this.material.uniforms.uMouse.value.copy(this.mouse);

      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }
}

// =========================================================
// 3. SLIDESHOW & CONTROLS CLASS
// =========================================================

class Slideshow {
  constructor(webglManager, slidesData) {
    this.webgl = webglManager;
    this.slides = slidesData;
    this.slidesTotal = slidesData.length;
    this.current = 0;
    this.isAnimating = false;
    this.autoLoopTimer = null;

    this.initDOM();
    this.initDragGestures();
    this.initKeyboard();
    this.startAutoLoop();
  }

  initDOM() {
    // Slide counter total
    const totalEl = document.querySelector(".total-slides");
    if (totalEl) totalEl.textContent = String(this.slidesTotal).padStart(2, "0");

    // Thumbnails container
    const thumbsContainer = document.querySelector(".slide-thumbs");
    if (thumbsContainer) {
      thumbsContainer.innerHTML = "";
      this.slides.forEach((slide, idx) => {
        const thumb = document.createElement("div");
        thumb.className = `slide-thumb ${idx === 0 ? "active" : ""}`;
        thumb.style.backgroundImage = `url("${slide.thumb || slide.image}")`;
        thumb.setAttribute("data-index", idx);

        thumb.addEventListener("click", () => {
          this.stopAutoLoop();
          this.goTo(idx);
          this.startAutoLoop();
        });

        thumb.addEventListener("mouseenter", () => {
          updateDragLines(idx, this.slidesTotal);
        });

        thumbsContainer.appendChild(thumb);
      });

      thumbsContainer.addEventListener("mouseleave", () => {
        updateDragLines(this.current, this.slidesTotal);
      });
    }

    // Prev / Next button listeners
    document.querySelector(".prev-slide")?.addEventListener("click", () => {
      this.stopAutoLoop();
      this.prev();
      this.startAutoLoop();
    });

    document.querySelector(".next-slide")?.addEventListener("click", () => {
      this.stopAutoLoop();
      this.next();
      this.startAutoLoop();
    });

    // Build the 60 drag indicator lines
    buildDragLines();
    this.updateUI(0);
  }

  goTo(index) {
    if (this.isAnimating || index === this.current) return;
    this.isAnimating = true;

    const prev = this.current;
    this.current = index;
    const direction = index > prev ? 1 : -1;

    this.updateUI(index);

    this.webgl.transition(prev, this.current, direction, () => {
      this.isAnimating = false;
    });
  }

  next() {
    if (this.isAnimating) return;
    const nextIdx = (this.current + 1) % this.slidesTotal;
    this.isAnimating = true;

    const prev = this.current;
    this.current = nextIdx;

    this.updateUI(nextIdx);

    this.webgl.transition(prev, this.current, 1, () => {
      this.isAnimating = false;
    });
  }

  prev() {
    if (this.isAnimating) return;
    const prevIdx = (this.current - 1 + this.slidesTotal) % this.slidesTotal;
    this.isAnimating = true;

    const prev = this.current;
    this.current = prevIdx;

    this.updateUI(prevIdx);

    this.webgl.transition(prev, this.current, -1, () => {
      this.isAnimating = false;
    });
  }

  updateUI(index) {
    const data = this.slides[index];

    // Counter
    const counterEl = document.querySelector(".current-slide");
    if (counterEl) counterEl.textContent = String(index + 1).padStart(2, "0");

    // Thumbnails active state
    document.querySelectorAll(".slide-thumb").forEach((thumb, i) => {
      thumb.classList.toggle("active", i === index);
    });

    // Kinetic Slide Title Animation
    const titleContainer = document.querySelector(".slide-title-container");
    const currentTitle = document.querySelector(".slide-title");
    if (titleContainer && currentTitle) {
      const newTitle = document.createElement("div");
      newTitle.className = "slide-title enter-up";
      newTitle.textContent = data.title;
      titleContainer.appendChild(newTitle);

      currentTitle.classList.add("exit-up");
      requestAnimationFrame(() => {
        newTitle.classList.remove("enter-up");
      });
      setTimeout(() => {
        if (currentTitle.parentNode) currentTitle.remove();
      }, 600);
    }

    // Metadata & Tags
    const categoryEl = document.querySelector(".project-category");
    if (categoryEl && data.category) categoryEl.textContent = data.category;

    const yearEl = document.querySelector(".project-year");
    if (yearEl && data.year) yearEl.textContent = data.year;

    const tagsContainer = document.querySelector(".project-tags");
    if (tagsContainer && data.tags) {
      tagsContainer.innerHTML = data.tags.map(t => `<span class="tag">${t}</span>`).join("");
    }

    // Dynamic Cosine Wave drag lines
    updateDragLines(index, this.slidesTotal);
  }

  initDragGestures() {
    let startX = 0;
    let isDragging = false;
    const container = document.getElementById("webgl-container");

    container.addEventListener("mousedown", (e) => {
      isDragging = true;
      startX = e.clientX;
      this.stopAutoLoop();
    });

    window.addEventListener("mouseup", (e) => {
      if (!isDragging) return;
      isDragging = false;
      const diff = startX - e.clientX;
      if (Math.abs(diff) > 55) {
        if (diff > 0) this.next();
        else this.prev();
      }
      this.startAutoLoop();
    });

    // Touch swipe support for mobile
    let touchStartX = 0;
    container.addEventListener("touchstart", (e) => {
      touchStartX = e.touches[0].clientX;
      this.stopAutoLoop();
    }, { passive: true });

    container.addEventListener("touchend", (e) => {
      const touchEndX = e.changedTouches[0].clientX;
      const diff = touchStartX - touchEndX;
      if (Math.abs(diff) > 50) {
        if (diff > 0) this.next();
        else this.prev();
      }
      this.startAutoLoop();
    }, { passive: true });
  }

  initKeyboard() {
    window.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") {
        this.stopAutoLoop();
        this.next();
        this.startAutoLoop();
      } else if (e.key === "ArrowLeft") {
        this.stopAutoLoop();
        this.prev();
        this.startAutoLoop();
      }
    });
  }

  startAutoLoop() {
    this.stopAutoLoop();
    this.autoLoopTimer = setInterval(() => {
      if (!this.isAnimating) this.next();
    }, 6000);
  }

  stopAutoLoop() {
    if (this.autoLoopTimer) {
      clearInterval(this.autoLoopTimer);
      this.autoLoopTimer = null;
    }
  }
}

// =========================================================
// 4. REACTIVE COSINE WAVE DRAG INDICATOR
// =========================================================

let dragLinesCache = [];
const TOTAL_DRAG_LINES = 56;

function buildDragLines() {
  const container = document.querySelector(".drag-indicator");
  if (!container) return;

  container.innerHTML = "";
  dragLinesCache = [];

  for (let i = 0; i < TOTAL_DRAG_LINES; i++) {
    const line = document.createElement("div");
    line.className = "drag-line";
    container.appendChild(line);
    dragLinesCache.push(line);
  }
}

function updateDragLines(activeIndex, totalSlides) {
  if (!dragLinesCache.length || activeIndex === null) return;

  const totalWidth = 600; // Reference container width
  const thumbWidth = totalWidth / Math.max(totalSlides, 1);
  const centerPosition = (activeIndex + 0.5) * thumbWidth;
  const lineWidth = totalWidth / dragLinesCache.length;
  const baseHeight = 12;

  dragLinesCache.forEach((line, i) => {
    const linePosition = (i + 0.5) * lineWidth;
    const distFromCenter = Math.abs(linePosition - centerPosition);
    const maxDistance = thumbWidth * 0.9;

    if (distFromCenter <= maxDistance) {
      const normalizedDist = distFromCenter / maxDistance;
      const waveHeight = Math.cos((normalizedDist * Math.PI) / 2);
      const height = baseHeight + waveHeight * 32;
      const opacity = 0.25 + waveHeight * 0.55;

      line.style.height = `${height}px`;
      line.style.backgroundColor = `rgba(255, 255, 255, ${opacity})`;
      line.style.transitionDelay = `${normalizedDist * 0.05}s`;
    } else {
      line.style.height = `${baseHeight}px`;
      line.style.backgroundColor = "rgba(255, 255, 255, 0.2)";
      line.style.transitionDelay = "0s";
    }
  });
}

// =========================================================
// 5. FILM GRAIN PROCEDURAL OVERLAY (25 FPS)
// =========================================================

function initFilmGrain() {
  const canvas = document.getElementById("film-grain-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  const FRAMES = 10;
  const frames = [];
  let frameIdx = 0;

  function bakeFrames() {
    frames.length = 0;
    for (let f = 0; f < FRAMES; f++) {
      const idata = ctx.createImageData(width, height);
      const buf = new Uint32Array(idata.data.buffer);
      for (let p = 0; p < buf.length; p++) {
        if (Math.random() < 0.65) {
          buf[p] = 0xffffffff;
        }
      }
      frames.push(idata);
    }
  }

  bakeFrames();

  window.addEventListener("resize", () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    bakeFrames();
  }, { passive: true });

  setInterval(() => {
    if (frames.length > 0) {
      frameIdx = (frameIdx + 1) % FRAMES;
      ctx.putImageData(frames[frameIdx], 0, 0);
    }
  }, 1000 / 25);
}

// =========================================================
// 6. CUSTOM MAGNETIC CURSOR FOLLOWER
// =========================================================

function initCursor() {
  const dot = document.querySelector(".cursor-dot");
  const follower = document.querySelector(".cursor-follower");
  if (!dot || !follower) return;

  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let followerX = mouseX;
  let followerY = mouseY;

  window.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    dot.style.transform = `translate(${mouseX}px, ${mouseY}px)`;
  });

  function renderCursor() {
    followerX += (mouseX - followerX) * 0.15;
    followerY += (mouseY - followerY) * 0.15;
    follower.style.transform = `translate(${followerX}px, ${followerY}px)`;
    requestAnimationFrame(renderCursor);
  }
  renderCursor();

  document.querySelectorAll("a, button, .slide-thumb, .counter-nav").forEach(el => {
    el.addEventListener("mouseenter", () => document.body.classList.add("cursor-active"));
    el.addEventListener("mouseleave", () => document.body.classList.remove("cursor-active"));
  });
}

// =========================================================
// 7. INITIALIZE EVERYTHING
// =========================================================

document.addEventListener("DOMContentLoaded", () => {
  // Collect slide data from DOM
  const slideElements = Array.from(document.querySelectorAll(".slide__img"));
  const slidesData = slideElements.map(el => ({
    image: el.dataset.image,
    thumb: el.dataset.thumb || el.dataset.image,
    title: el.dataset.title || "Untitled Project",
    category: el.dataset.category || "Creative Direction",
    year: el.dataset.year || "2026",
    tags: (el.dataset.tags || "").split(",").map(t => t.trim()).filter(Boolean)
  }));

  const imageUrls = slidesData.map(s => s.image);

  // Initialize WebGL Manager
  const webglManager = new WebGLManager("webgl-container", imageUrls);

  // Initialize Slideshow UI & Controller
  new Slideshow(webglManager, slidesData);

  // Initialize Film Grain & Custom Cursor
  initFilmGrain();
  initCursor();
});

