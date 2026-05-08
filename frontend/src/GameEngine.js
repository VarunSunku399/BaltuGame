// ─── Game Engine ──────────────────────────────────────────────────────────────
// Owns the canvas render loop, obstacle spawning, parallax backgrounds,
// particles system, and collision detection. Works directly with GameState.
// ─────────────────────────────────────────────────────────────────────────────

import { Player }    from './Player.js';
import { GameState } from './GameState.js';

// ── Obstacle types ────────────────────────────────────────────────────────────
const OBSTACLE_TYPES = [
  { id: 'cactus',   w: 28, h: 60,  color: '#06d6a0', label: '🌵' },
  { id: 'boulder',  w: 50, h: 44,  color: '#8b7355', label: '🪨' },
  { id: 'spike',    w: 22, h: 52,  color: '#ff6b6b', label: '⚡' },
  { id: 'wall',     w: 18, h: 90,  color: '#a78bfa', label: '🧱' }
];

// Stars & clouds for parallax layers
function makeStars(count) {
  return Array.from({ length: count }, () => ({
    x: Math.random() * 2000,
    y: Math.random() * 0.55, // fraction of canvas height
    size: 0.5 + Math.random() * 1.5,
    alpha: 0.3 + Math.random() * 0.7
  }));
}

function makeClouds(count) {
  return Array.from({ length: count }, (_, i) => ({
    x: i * 320 + Math.random() * 200,
    y: 0.05 + Math.random() * 0.28,
    w: 80 + Math.random() * 100,
    h: 30 + Math.random() * 20,
    speed: 0.08 + Math.random() * 0.06, // fraction of gameSpeed
    alpha: 0.08 + Math.random() * 0.1
  }));
}

export class GameEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');

    this.player    = new Player(canvas);
    this.obstacles = [];
    this.particles = [];

    this.stars  = makeStars(120);
    this.clouds = makeClouds(7);

    this.groundY = 0;   // updated each frame from canvas.height

    // Timing
    this.lastTime        = 0;
    this.spawnTimer      = 0;
    this.nextSpawnDelay  = 1.8;  // seconds
    this.speedRampTimer  = 0;
    this.scoreTimer      = 0;
    this.distanceMeter   = 0;

    // Ground line scroll offset
    this.groundOffset = 0;

    // Callbacks
    this.onDeath    = null;
    this.onScore    = null;

    this._raf = null;
    this._running = false;
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  start() {
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._running = true;
    this.lastTime = performance.now();
    this._raf = requestAnimationFrame(ts => this._loop(ts));
  }

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  reset() {
    this.player    = new Player(this.canvas);
    this.obstacles = [];
    this.particles = [];
    this.spawnTimer      = 0;
    this.nextSpawnDelay  = 1.8;
    this.speedRampTimer  = 0;
    this.scoreTimer      = 0;
    this.distanceMeter   = 0;
    this.groundOffset    = 0;
  }

  /** Called whenever a player presses space / taps */
  handleJump() {
    this.player.jump();
  }

  /** AI orchestrator feeds a correct answer result */
  handleCorrectAnswer() {
    this.player.applyCorrectEffect();
    this._burst(this.player.x + 28, this.player.y + 32, '#06d6a0', 20);
  }

  /** AI orchestrator feeds a wrong answer result */
  handleWrongAnswer() {
    this.player.applyWrongEffect();
    this._injectObstacle();
    this._burst(this.player.x + 28, this.player.y + 32, '#ff6b6b', 12);
  }

  handleTimeoutAnswer() {
    this.player.applyTimeoutEffect();
    this._injectObstacle();
  }

  // ── Resize ───────────────────────────────────────────────────────────────────

  _resize() {
    this.canvas.width  = this.canvas.clientWidth  * devicePixelRatio;
    this.canvas.height = this.canvas.clientHeight * devicePixelRatio;
    // Use setTransform instead of scale() to avoid stacking on every resize call
    this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  // ── Main Loop ────────────────────────────────────────────────────────────────

  _loop(ts) {
    if (!this._running) return;
    const dt = Math.min((ts - this.lastTime) / 1000, 0.05); // cap at 50ms
    this.lastTime = ts;

    if (GameState.status === 'running') {
      this._update(dt);
    }
    this._draw();

    this._raf = requestAnimationFrame(t => this._loop(t));
  }

  // ── Update ───────────────────────────────────────────────────────────────────

  _update(dt) {
    const W = this.canvas.width  / devicePixelRatio;
    const H = this.canvas.height / devicePixelRatio;
    this.groundY = H * 0.80;

    const spd = GameState.gameSpeed * this.player.speedMultiplier;

    // Ground scroll
    this.groundOffset = (this.groundOffset + spd * dt) % 40;

    // Clouds
    for (const c of this.clouds) {
      c.x -= spd * c.speed * dt;
      if (c.x + c.w < 0) c.x = W + c.w;
    }

    // Speed ramp over time
    this.speedRampTimer += dt;
    if (this.speedRampTimer > 4) {
      GameState.gameSpeed = Math.min(1100, GameState.gameSpeed + 14);
      this.speedRampTimer = 0;
    }

    // Score tick
    this.scoreTimer += dt;
    if (this.scoreTimer > 0.25) {
      GameState.addScore(5);
      this.scoreTimer = 0;
    }

    // Distance
    this.distanceMeter += spd * dt;
    GameState.distance = Math.floor(this.distanceMeter / 10);

    // Player
    this.player.update(dt, spd);

    // Obstacle spawn
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.nextSpawnDelay) {
      this.spawnTimer = 0;
      this.nextSpawnDelay = 1.4 + Math.random() * 1.8;
      this._spawnObstacle(W, H);
    }

    // Update obstacles
    for (const obs of this.obstacles) {
      obs.x -= spd * dt;
    }
    this.obstacles = this.obstacles.filter(o => o.x + o.w > -20);

    // Particles
    for (const p of this.particles) {
      p.x    += p.vx * dt;
      p.y    += p.vy * dt;
      p.vy   += 600 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);

    // Collision detection (only if player alive)
    if (!this.player.isDead) {
      const px = this.player.x + 10;
      const py = this.player.y + 8;
      const pw = this.player.width  - 18;
      const ph = this.player.height - 8;

      for (const obs of this.obstacles) {
        if (
          px < obs.x + obs.w - 6 &&
          px + pw > obs.x + 6 &&
          py < obs.y + obs.h - 4 &&
          py + ph > obs.y
        ) {
          this.player.die();
          this._burst(obs.x + obs.w / 2, obs.y, '#ff6b6b', 30);
          if (this.onDeath) this.onDeath();
          break;
        }
      }
    } else if (this.player.y > H + 200) {
      // Player has fallen off screen — ensure death callback fires
      if (GameState.status === 'running') {
        GameState.status = 'dead';
        if (this.onDeath) this.onDeath();
      }
    }
  }

  // ── Spawn helpers ─────────────────────────────────────────────────────────────

  _spawnObstacle(W, H) {
    const type = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
    this.obstacles.push({
      ...type,
      x: W + 40,
      y: this.groundY - type.h,
      wobble: 0
    });
  }

  _injectObstacle() {
    const W = this.canvas.width  / devicePixelRatio;
    const H = this.canvas.height / devicePixelRatio;
    const gY = H * 0.80;
    const type = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
    this.obstacles.push({
      ...type,
      x: W * 0.55,    // Slightly closer so player must react fast
      y: gY - type.h,
      wobble: 0
    });
  }

  // ── Particle burst ────────────────────────────────────────────────────────────

  _burst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 80 + Math.random() * 160;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80,
        life: 0.6 + Math.random() * 0.5,
        color,
        size: 3 + Math.random() * 5
      });
    }
  }

  // ── Draw ─────────────────────────────────────────────────────────────────────

  _draw() {
    const ctx = this.ctx;
    const W   = this.canvas.width  / devicePixelRatio;
    const H   = this.canvas.height / devicePixelRatio;

    // ── Background gradient ──
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0,   '#06060f');
    grad.addColorStop(0.7, '#0d0d1e');
    grad.addColorStop(1,   '#12122a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // ── Stars ──
    for (const s of this.stars) {
      ctx.save();
      ctx.globalAlpha = s.alpha * (0.7 + 0.3 * Math.sin(Date.now() * 0.001 + s.x));
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x % W, s.y * H, s.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Scroll stars slowly
      s.x -= GameState.gameSpeed * 0.015;
      if (s.x < 0) s.x += W;
    }

    // ── Clouds ──
    for (const c of this.clouds) {
      ctx.save();
      ctx.globalAlpha = c.alpha;
      ctx.fillStyle   = '#a0a0d0';
      ctx.beginPath();
      ctx.ellipse(c.x + c.w / 2, c.y * H, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ── Ground ──
    const groundTop = this.groundY || H * 0.80;

    // Ground body
    const gGrad = ctx.createLinearGradient(0, groundTop, 0, H);
    gGrad.addColorStop(0, '#1a1a3a');
    gGrad.addColorStop(1, '#0d0d20');
    ctx.fillStyle = gGrad;
    ctx.fillRect(0, groundTop, W, H - groundTop);

    // Ground top line + glow
    ctx.save();
    ctx.shadowBlur  = 12;
    ctx.shadowColor = '#7c5cfc';
    ctx.strokeStyle = '#7c5cfc';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundTop);
    ctx.lineTo(W, groundTop);
    ctx.stroke();
    ctx.restore();

    // Dashed ground markings (scrolling)
    ctx.save();
    ctx.strokeStyle = 'rgba(124,92,252,0.18)';
    ctx.lineWidth = 1;
    ctx.setLineDash([30, 20]);
    ctx.lineDashOffset = -this.groundOffset;
    ctx.beginPath();
    ctx.moveTo(0, groundTop + 12);
    ctx.lineTo(W, groundTop + 12);
    ctx.stroke();
    ctx.restore();

    // ── Obstacles ──
    for (const obs of this.obstacles) {
      ctx.save();
      ctx.shadowBlur  = 14;
      ctx.shadowColor = obs.color;
      ctx.fillStyle   = obs.color;

      // Rounded rectangle body
      ctx.beginPath();
      ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 6);
      ctx.fill();

      // Inner highlight
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.roundRect(obs.x + 4, obs.y + 4, obs.w * 0.4, obs.h * 0.3, 4);
      ctx.fill();

      ctx.restore();
    }

    // ── Particles ──
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle   = p.color;
      ctx.shadowBlur  = 8;
      ctx.shadowColor = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ── Player ──
    this.player.draw(ctx);

    // ── Distance meter ──
    ctx.save();
    ctx.font      = `700 13px 'Space Mono', monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.textAlign = 'right';
    ctx.fillText(`${GameState.distance}m`, W - 16, groundTop - 10);
    ctx.restore();
  }
}
