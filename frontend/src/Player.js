// ─── Player Agent ─────────────────────────────────────────────────────────────
// Handles all player physics: position, velocity, jumping, and AI-driven effects
// ─────────────────────────────────────────────────────────────────────────────

export class Player {
  constructor(canvas) {
    this.canvas = canvas;

    // Dimensions
    this.width  = 56;
    this.height = 64;

    // Ground Y position
    this.groundY = 0; // set dynamically in update

    // Position
    this.x = 100;
    this.y = 0;

    // Physics
    this.vy           = 0;
    this.gravity      = 2200;   // px/s²
    this.jumpStrength = -720;   // px/s initial upward velocity
    this.isOnGround   = true;
    this.isDoubleJump = false;

    // AI-driven modifiers
    this.speedMultiplier = 1.0;   // increases on fast/correct answers
    this.boostTimer      = 0;     // seconds remaining for a boost
    this.shieldActive    = false; // correct answer streak shield
    this.comboCount      = 0;     // consecutive correct answers

    // Visual
    this.squishY       = 1.0;   // squish on landing
    this.legPhase      = 0;     // animation phase for legs
    this.trailParticles = [];   // speed trail
    this.isDead        = false;

    // Colors / theme
    this.bodyColor  = '#7c5cfc';
    this.eyeColor   = '#ffffff';
    this.legColor   = '#5a40cc';
    this.shieldColor = '#06d6a0';
  }

  /** Called when player presses jump */
  jump() {
    if (this.isDead) return;

    if (this.isOnGround) {
      this.vy = this.jumpStrength;
      this.isOnGround   = false;
      this.isDoubleJump = true;
      this.squishY = 0.7;
    } else if (this.isDoubleJump) {
      // Double-jump: only on correct answers via applyEffect
      this.vy = this.jumpStrength * 0.8;
      this.isDoubleJump = false;
    }
  }

  /** AI event: correct answer → boost + potentially double jump */
  applyCorrectEffect() {
    if (this.isDead) return;
    this.boostTimer      = 4;          // 4-second speed boost
    this.speedMultiplier = 1.45;
    this.isDoubleJump    = true;       // unlock extra jump
    this.comboCount++;
    if (this.comboCount >= 3) {
      this.shieldActive = true;
      this.comboCount   = 0;
    }
  }

  /** AI event: wrong answer → brief slow + lose shield */
  applyWrongEffect() {
    if (this.isDead) return;
    this.speedMultiplier = 0.7;
    this.boostTimer      = 2;
    this.shieldActive    = false;
    this.comboCount      = 0;
  }

  /** AI event: timed out → no effect, slight obstacle spawn signal */
  applyTimeoutEffect() {
    this.shieldActive = false;
  }

  /** Kill the player with a squish animation */
  die() {
    if (this.shieldActive) {
      // Shield absorbs one hit
      this.shieldActive = false;
      return;
    }
    this.isDead = true;
    this.vy = this.jumpStrength * 0.5;
  }

  update(dt, gameSpeed) {
    if (this.isDead) {
      // Death arc
      this.vy += this.gravity * 0.5 * dt;
      this.y  += this.vy * dt;
      return;
    }

    // Ground line: use clientHeight (CSS pixels) to match what the engine draws
    // canvas.height is in physical pixels (×devicePixelRatio) — wrong for positioning
    const cssH = this.canvas.clientHeight;
    this.groundY = cssH * 0.80 - this.height;

    // Gravity
    this.vy += this.gravity * dt;
    this.y  += this.vy * dt;

    // Land
    if (this.y >= this.groundY) {
      this.y          = this.groundY;
      this.vy         = 0;
      this.isOnGround = true;
      this.squishY    = 0.75; // squish on land
    }

    // Squish recovery
    if (this.squishY < 1.0) this.squishY = Math.min(1.0, this.squishY + dt * 6);

    // Boost timer
    if (this.boostTimer > 0) {
      this.boostTimer -= dt;
      if (this.boostTimer <= 0) {
        this.speedMultiplier = 1.0;
        this.boostTimer = 0;
      }
    }

    // Leg animation (faster when boosted)
    this.legPhase += dt * (isNaN(gameSpeed) ? 8 : gameSpeed * 0.012) * this.speedMultiplier;

    // Spawn trail particles when boosted
    if (this.speedMultiplier > 1.2) {
      this.trailParticles.push({
        x: this.x,
        y: this.y + this.height * 0.5,
        vx: -80 - Math.random() * 40,
        vy: (Math.random() - 0.5) * 40,
        life: 1,
        maxLife: 1,
        size: 4 + Math.random() * 4,
        color: this.shieldActive ? this.shieldColor : this.bodyColor
      });
    }

    // Update trail particles
    this.trailParticles = this.trailParticles.filter(p => {
      p.x    += p.vx * dt;
      p.y    += p.vy * dt;
      p.life -= dt * 3;
      return p.life > 0;
    });
  }

  draw(ctx) {
    const cx = this.x + this.width  / 2;
    const cy = this.y + this.height / 2;

    // Draw trail
    for (const p of this.trailParticles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife) * 0.6;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, this.squishY);

    const hw = this.width  / 2;
    const hh = this.height / 2;

    // Shield glow
    if (this.shieldActive) {
      ctx.save();
      ctx.shadowBlur  = 24;
      ctx.shadowColor = this.shieldColor;
      ctx.strokeStyle = this.shieldColor;
      ctx.lineWidth   = 2.5;
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(Date.now() * 0.006);
      ctx.beginPath();
      ctx.ellipse(0, 0, hw + 12, hh + 10, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Speed glow when boosted
    if (this.speedMultiplier > 1.2) {
      ctx.shadowBlur  = 18;
      ctx.shadowColor = this.bodyColor;
    }

    // Body
    ctx.fillStyle = this.bodyColor;
    ctx.beginPath();
    ctx.roundRect(-hw, -hh, this.width, this.height, 10);
    ctx.fill();

    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.roundRect(-hw + 5, -hh + 5, this.width * 0.45, this.height * 0.35, 6);
    ctx.fill();

    // Eye
    ctx.fillStyle = this.eyeColor;
    ctx.beginPath();
    ctx.arc(hw - 14, -hh + 16, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.arc(hw - 12, -hh + 16, 4, 0, Math.PI * 2);
    ctx.fill();

    // Mouth / expression
    ctx.strokeStyle = this.eyeColor;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (this.isDead) {
      // X eyes on death
      ctx.moveTo(hw - 18, -hh + 10); ctx.lineTo(hw - 10, -hh + 22);
      ctx.moveTo(hw - 10, -hh + 10); ctx.lineTo(hw - 18, -hh + 22);
    } else {
      ctx.arc(hw - 6, -hh + 24, 6, 0.2, Math.PI - 0.2);
    }
    ctx.stroke();

    // Animated legs
    const legW = 10, legH = 18;
    const swing = Math.sin(this.legPhase) * 8;
    ctx.fillStyle = this.legColor;
    // Left leg
    ctx.save();
    ctx.translate(-8, hh - 4);
    ctx.rotate(swing * 0.05);
    ctx.beginPath();
    ctx.roundRect(-legW/2, 0, legW, legH * (0.7 + 0.3 * Math.abs(Math.sin(this.legPhase))), 4);
    ctx.fill();
    ctx.restore();
    // Right leg
    ctx.save();
    ctx.translate(8, hh - 4);
    ctx.rotate(-swing * 0.05);
    ctx.beginPath();
    ctx.roundRect(-legW/2, 0, legW, legH * (0.7 + 0.3 * Math.abs(Math.cos(this.legPhase))), 4);
    ctx.fill();
    ctx.restore();

    // Arms swinging
    ctx.strokeStyle = this.legColor;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.save();
    ctx.translate(-hw + 2, -5);
    ctx.rotate(-swing * 0.06 - 0.3);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-14, 14); ctx.stroke();
    ctx.restore();

    ctx.restore(); // end squish scale
  }
}
