// ========================================================
// UI LAYOUT & RESPONSIVE CSS
// ========================================================
const style = document.createElement('style');
style.innerHTML = `
    body { margin: 0; padding: 10px; display: flex; flex-direction: column; justify-content: center; align-items: center; background: #111; min-height: 100vh; font-family: sans-serif; color: white; }
    #game-container { display: flex; flex-direction: column; align-items: center; width: 100%; max-width: 500px; }
    #battleCanvas { background: #1e272e; border: 4px solid #333; width: 100%; height: auto; display: block; }
    .controls-wrapper { width: 100%; display: flex; justify-content: center; gap: 15px; padding: 15px 0; background: rgba(0,0,0,0.5); }
    .btn-main { padding: 12px 25px; font-size: 14px; font-weight: bold; color: white; background: #0fbcf9; border: none; border-radius: 5px; cursor: pointer; text-transform: uppercase; box-shadow: 0 4px 0 #0984e3; transition: transform 0.1s; }
    .btn-main:active { transform: translateY(2px); box-shadow: 0 2px 0 #0984e3; }
    #pauseBtn { background: #ff4757; box-shadow: 0 4px 0 #ff1f1f; display: none; }
    #skill-tooltip { pointer-events: none; z-index: 1000; }
    @media (max-width: 600px) { #battleCanvas { border-width: 2px; } .btn-main { padding: 10px 20px; font-size: 12px; } }
`;
document.head.appendChild(style);

let ctrlWrapper = document.querySelector('.controls-wrapper');
if (!ctrlWrapper) {
    ctrlWrapper = document.createElement('div');
    ctrlWrapper.className = 'controls-wrapper';
    const gameContainer = document.getElementById('game-container') || document.body;
    gameContainer.appendChild(ctrlWrapper);
    const sBtn = document.getElementById('startBtn');
    const pBtn = document.getElementById('pauseBtn');
    if(sBtn) { sBtn.className = 'btn-main'; ctrlWrapper.appendChild(sBtn); }
    if(pBtn) { pBtn.className = 'btn-main'; ctrlWrapper.appendChild(pBtn); }
}

const canvas = document.getElementById('battleCanvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const overlay = document.getElementById('overlay');
const overlayMsg = document.getElementById('overlay-msg');
const tooltip = document.getElementById('skill-tooltip');

const BUILD_VER = "v1.6.7";
canvas.width = 500; canvas.height = 500;
const arenaTop = 15, arenaLeft = 15, arenaRight = 485, arenaBottom = 485;

// ========================================================
// ASSET CONFIGURATION (SFX & IMAGES)
// ========================================================
const charImages = {};
const charNames = ['Gojo', 'Sukuna', 'Pain', 'Naruto', 'Human'];

// Preload Images
charNames.forEach(name => {
    charImages[name] = new Image();
    charImages[name].src = `image/${name.toLowerCase()}.jpg`;
});

const soundPunch = new Audio('audio/punch(1).mp3'); soundPunch.volume = 0.2; 
const soundSlash = new Audio('audio/sword-slash-1.mp3'); soundSlash.volume = 0.5; 
const soundGravityHit = new Audio('audio/punch(1).mp3'); soundGravityHit.volume = 0.3; 
const soundWall = new Audio('audio/wall_hit.mp3'); soundWall.volume = 0.15; 

const voiceSukunaArrow = new Audio('audio/sukuna_fire.mp3'); voiceSukunaArrow.volume = 0.6;
const voiceSukunaAlt = new Audio('audio/sukuna_domain.mp3'); voiceSukunaAlt.volume = 1.0; 
const voiceGojoUlti = new Audio('audio/gojo_domain.mp3'); voiceGojoUlti.volume = 1.0; 
const voicePainPassive = new Audio('audio/pain_passive_push.mp3'); voicePainPassive.volume = 1.0; 
const voicePainUlti = new Audio('audio/pain_ulti.mp3'); voicePainUlti.volume = 0.7; 
const sfxNarutoUlti = new Audio('audio/naruto_ulti.mp3'); sfxNarutoUlti.volume = 0.5;

function playSFX(audio, boost = 1) {
    if (!gameStarted) return;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const soundClone = audio.cloneNode();
    const source = audioCtx.createMediaElementSource(soundClone);
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = boost; 
    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    soundClone.play().catch(() => {});
}

// ========================================================

const skillDetails = {
    'Human': { passive: 'Spam Mastery', pDesc: 'Mana cap is limited to <b style="color:#ffdd59">30 Mana</b>, allowing for frequent Ultimate casts.', ulti: 'Physical Burst', uDesc: 'Enhances next collision with <b style="color:#ff5e57">+3 DMG</b>. Effect expires after hitting an enemy.' },
    'Naruto': { passive: 'Infinite Army', pDesc: 'No limit on clones. Each active clone grants Naruto <b style="color:#ffdd59">+8% Speed</b>.', ulti: 'Kage Bunshin', uDesc: 'Summons <b style="color:#ffdd59">2 Clones</b> with <b style="color:#ff5e57">10 HP</b> and <b style="color:#ff5e57">3 DMG</b>.' },
    'Gojo': { passive: 'Infinity Aura', pDesc: 'Enemies within <b style="color:#0fbcf9">100px</b> radius are slowed by <b style="color:#ffdd59">90%</b>.', ulti: 'Unlimited Void', uDesc: 'Instantly restores <b style="color:#2ecc71">8 HP</b>, freezes all enemies for <b style="color:#ffdd59">4s</b>, and Gojo only takes <b style="color:#ff5e57">1 DMG</b> while active.' },
    'Sukuna': { passive: 'Giant Fire Arrow', pDesc: 'Auto-fires a massive arrow dealing <b style="color:#ff5e57">7 DMG</b> every <b style="color:#ffdd59">5s</b>.', ulti: 'Malevolent Shrine', uDesc: 'Deploys a bloody domain radius <b style="color:#0fbcf9">250px</b>. Cleaves enemies for <b style="color:#ff5e57">2 DMG</b> per tick.' },
    'Pain': { passive: 'Bansho Tenin', pDesc: 'Every <b style="color:#ffdd59">4 hits</b>, pulls enemies within <b style="color:#0fbcf9">90px</b> and deals damage.', ulti: 'Almighty Push', uDesc: 'Gravity blast in <b style="color:#0fbcf9">450px</b> area. <b style="color:#ffdd59">12.0 Push Power</b>.' }
};

let allUnits = [];
let projectiles = [];
let gameStarted = false;
let isPaused = false;
let animationId;
let selectedChars = ["Human", "Human"];
let lastTime = 0;
let screenShake = 0;
let scaleFactor = 1.0; 
let audioCtx;

const charColors = { 'Human': '#3498db', 'Naruto': '#f39c12', 'Gojo': '#7f8c8d', 'Sukuna': '#6c3226', 'Pain': '#e67e22' };

class Projectile {
    constructor(x, y, targetX, targetY, dmg, ownerIdx) {
        this.x = x; this.y = y; this.dmg = dmg; this.ownerIdx = ownerIdx;
        this.radius = 16 * scaleFactor; this.speed = 7;
        const dx = targetX - x, dy = targetY - y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        this.vx = (dx/dist) * this.speed; this.vy = (dy/dist) * this.speed;
        this.isDead = false;
    }
    update() { this.x += this.vx; this.y += this.vy; if (this.x < 0 || this.x > 500 || this.y < 0 || this.y > 500) this.isDead = true; }
    draw(ctx) { ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2); ctx.fillStyle = "#ff6b10"; ctx.shadowBlur = 20 * scaleFactor; ctx.shadowColor = "orange"; ctx.fill(); ctx.shadowBlur = 0; }
}

class Unit {
    constructor(name, hp, dmg, speed, color, startX, startY, playerIdx, isClone = false) {
        this.name = name; this.playerIdx = playerIdx; this.hp = hp; this.maxHp = hp; this.dmg = dmg;
        this.baseSpeed = speed; this.currentSpeedMult = 1.0; this.color = color; this.x = startX; this.y = startY; this.radius = 35 * scaleFactor;
        this.isClone = isClone;
        this.maxMana = (name === "Human") ? 30 : (name === "Naruto" ? 60 : 150);
        this.mana = 0; this.isStunned = false; this.stunTimer = 0; this.isSkillActive = false; this.skillTimer = 0;
        this.nextHitExtraDmg = 0; this.passiveTimer = 0; this.painCollisionCount = 0; this.painPushTimer = 0; this.isPainPushing = false;
        this.gravityDmgTimer = 0; this.trailPositions = [];
        const angle = Math.random() * Math.PI * 2; this.dirX = Math.cos(angle); this.dirY = Math.sin(angle);
        this.isDead = false; this.hitTimer = 0; this.immuneTimer = 5;
    }

    applyDamage(amount, type = 'physical') {
        if (this.isDead) return;
        let finalDmg = (this.name === "Gojo" && this.isSkillActive) ? 1 : amount;
        this.hp -= finalDmg;
        this.hitTimer = 5;
        if (type === 'physical') playSFX(soundPunch); else if (type === 'shrine') playSFX(soundSlash, 1.2); else if (type === 'gravity') playSFX(soundGravityHit);
        if (!this.isClone && !this.isSkillActive) this.mana = Math.min(this.maxMana, this.mana + 5);
        if (this.hp <= 0) { this.hp = 0; this.isDead = true; }
    }

    update(deltaTime) {
        if (this.isDead) return;
        if (this.hitTimer > 0) this.hitTimer--;
        if (this.immuneTimer > 0) this.immuneTimer--;
        if (this.stunTimer > 0) { this.stunTimer -= deltaTime; if (this.stunTimer <= 0) this.isStunned = false; return; }
        this.currentSpeedMult = 1.0;
        const dxCenter = 250 - this.x; const dyCenter = 250 - this.y; const distCenter = Math.sqrt(dxCenter**2 + dyCenter**2);
        if (distCenter < 300 && distCenter > 10) { this.x += (dxCenter / distCenter) * 0.5; this.y += (dyCenter / distCenter) * 0.5; }
        if (!this.isDead && !this.isClone) {
            if (this.name === "Naruto") { const clones = allUnits.filter(u => u.isClone && u.playerIdx === this.playerIdx && !u.isDead).length; this.currentSpeedMult += (clones * 0.08); }
            if (this.name === "Gojo") { this.currentSpeedMult += 0.3; const enemyNear = allUnits.some(u => u.playerIdx !== this.playerIdx && !u.isDead && Math.sqrt((u.x-this.x)**2 + (u.y-this.y)**2) < 100 + u.radius); if (enemyNear) this.currentSpeedMult += 0.65; }
            if (this.name === "Sukuna") { this.passiveTimer += deltaTime; if (this.passiveTimer >= 5000) { const target = allUnits.find(u => u.playerIdx !== this.playerIdx && !u.isDead); if (target) { projectiles.push(new Projectile(this.x, this.y, target.x, target.y, 7, this.playerIdx)); playSFX(voiceSukunaArrow); } this.passiveTimer = 0; } }
            if (this.name === "Pain") { this.gravityDmgTimer += deltaTime; if (this.isPainPushing) { this.painPushTimer -= deltaTime; if (this.painPushTimer <= 0) { this.isPainPushing = false; this.painCollisionCount = 0; } } const r = this.isSkillActive ? 450 : 90; const p = this.isSkillActive ? 12.0 : (this.isPainPushing ? 12.0 : 4.0); const interval = this.isSkillActive ? 600 : 400; allUnits.forEach(u => { if (u.playerIdx !== this.playerIdx && !u.isDead) { const dx = this.x - u.x, dy = this.y - u.y, dist = Math.sqrt(dx*dx + dy*dy); if (dist < r + u.radius) { if (this.isSkillActive || this.isPainPushing) { u.x -= (dx/dist) * p; u.y -= (dy/dist) * p; } else { if (dist > this.radius) { u.x += (dx/dist) * p; u.y += (dy/dist) * p; } } if (this.gravityDmgTimer >= interval) u.applyDamage(2, 'gravity'); } } }); if (this.gravityDmgTimer >= interval) this.gravityDmgTimer = 0; }
        }
        allUnits.forEach(other => { if (other.name === "Gojo" && !other.isDead && other.playerIdx !== this.playerIdx) { const d = Math.sqrt((this.x - other.x)**2 + (this.y - other.y)**2); if (d < 100 + this.radius) { this.currentSpeedMult *= 0.1; } } });
        if (this.skillTimer > 0) { this.skillTimer -= deltaTime; if (this.name === "Sukuna") { screenShake = 5; this.domainDmgTimer += deltaTime; if (this.domainDmgTimer >= 100) { allUnits.forEach(u => { if (u.playerIdx !== this.playerIdx && !u.isDead) { const d = Math.sqrt((u.x - this.x)**2 + (u.y - this.y)**2); if (d < 250 + u.radius) u.applyDamage(2, 'shrine'); } }); this.domainDmgTimer = 0; } } if (this.skillTimer <= 0) { this.isSkillActive = false; screenShake = 0; } }
        if (!this.isClone && !this.isSkillActive) { this.mana = Math.min(this.maxMana, this.mana + (10 * (deltaTime / 1000))); if (this.mana >= this.maxMana) this.useSkill(); }
        let speedScale = (this.name === "Gojo" && this.isSkillActive) ? 8.0 : this.currentSpeedMult; this.x += this.dirX * this.baseSpeed * speedScale * 5; this.y += this.dirY * this.baseSpeed * speedScale * 5;
        if (this.name === "Gojo" && this.isSkillActive) { this.trailPositions.push({x: this.x, y: this.y}); if (this.trailPositions.length > 5) this.trailPositions.shift(); } else this.trailPositions = [];
        if (this.x - this.radius < arenaLeft) { this.x = arenaLeft + this.radius; this.dirX *= -1; playSFX(soundWall); } if (this.x + this.radius > arenaRight) { this.x = arenaRight - this.radius; this.dirX *= -1; playSFX(soundWall); } if (this.y - this.radius < arenaTop) { this.y = arenaTop + this.radius; this.dirY *= -1; playSFX(soundWall); } if (this.y + this.radius > arenaBottom) { this.y = arenaBottom - this.radius; this.dirY *= -1; playSFX(soundWall); }
    }

    useSkill() {
        this.mana = 0; if (this.name === "Naruto") { playSFX(sfxNarutoUlti, 1); for (let i = 0; i < 2; i++) { const nc = new Unit("Clone", 10, 3, this.baseSpeed, this.color, this.x, this.y, this.playerIdx, true); const a = Math.random() * Math.PI * 2; nc.dirX = Math.cos(a); nc.dirY = Math.sin(a); nc.x += nc.dirX * 15; nc.y += nc.dirY * 15; nc.immuneTimer = 5; allUnits.push(nc); } } else if (this.name === "Gojo") { playSFX(voiceGojoUlti, 1.5); this.hp = Math.min(this.maxHp, this.hp + 8); this.isSkillActive = true; this.skillTimer = 3000; allUnits.forEach(u => { if (u.playerIdx !== this.playerIdx) { u.isStunned = true; u.stunTimer = 3000; } }); } else if (this.name === "Human") { this.nextHitExtraDmg = 3; this.isSkillActive = true; } else if (this.name === "Sukuna") { playSFX(voiceSukunaAlt, 3.5); this.isSkillActive = true; this.skillTimer = 3000; this.domainDmgTimer = 0; } else if (this.name === "Pain") { playSFX(voicePainUlti, 1.5); this.isSkillActive = true; this.skillTimer = 4000; this.gravityDmgTimer = 0; }
    }

    checkCollision(other) {
        if (this.isDead || other.isDead) return; const dx = other.x - this.x, dy = other.y - this.y, dist = Math.sqrt(dx * dx + dy * dy); if (dist < this.radius + other.radius) { if (this.playerIdx !== other.playerIdx && this.immuneTimer <= 0 && other.immuneTimer <= 0) { if (this.name === "Pain" && !this.isPainPushing && !this.isSkillActive) { this.painCollisionCount++; if (this.painCollisionCount >= 4) { playSFX(voicePainPassive, 1.2); this.isPainPushing = true; this.painPushTimer = 1500; } } if (other.name === "Pain" && !other.isPainPushing && !other.isSkillActive) { other.painCollisionCount++; if (other.painCollisionCount >= 4) { playSFX(voicePainPassive, 1.2); other.isPainPushing = true; other.painPushTimer = 1500; } } this.applyDamage(other.dmg + (other.nextHitExtraDmg || 0), 'physical'); other.applyDamage(this.dmg + (this.nextHitExtraDmg || 0), 'physical'); if (this.name === "Human") { this.nextHitExtraDmg = 0; this.isSkillActive = false; } if (other.name === "Human") { other.nextHitExtraDmg = 0; other.isSkillActive = false; } if (!this.isClone && !this.isSkillActive) this.mana = Math.min(this.maxMana, this.mana + 6); if (!other.isClone && !other.isSkillActive) other.mana = Math.min(other.maxMana, other.mana + 6); this.hitTimer = 5; other.hitTimer = 5; this.immuneTimer = 5; other.immuneTimer = 5; } this.bounce(other, dx, dy, dist); }
    }

    bounce(other, dx, dy, dist) { const nx = dx / dist, ny = dy / dist; const d1 = this.dirX * nx + this.dirY * ny; this.dirX -= 2 * d1 * nx; this.dirY -= 2 * d1 * ny; const d2 = other.dirX * (-nx) + other.dirY * (-ny); other.dirX -= 2 * d2 * (-nx); other.dirY -= 2 * d2 * (-ny); const ov = (this.radius + other.radius) - dist; this.x -= nx * (ov / 2); this.y -= ny * (ov / 2); other.x += nx * (ov / 2); other.y += ny * (ov / 2); }

    draw(ctx) {
        if (this.isDead) return;
        if (this.name === "Pain" && !this.isDead) { ctx.beginPath(); ctx.arc(this.x, this.y, (this.isSkillActive ? 450 : 90), 0, Math.PI*2); ctx.fillStyle = (this.isSkillActive || this.isPainPushing) ? "rgba(255, 255, 255, 0.25)" : "rgba(0, 0, 0, 0.15)"; ctx.fill(); }
        if (this.name === "Gojo" && !this.isDead) { ctx.beginPath(); ctx.arc(this.x, this.y, 100, 0, Math.PI*2); ctx.fillStyle = "rgba(0, 255, 255, 0.05)"; ctx.fill(); }
        if (this.isSkillActive && this.name === "Sukuna") { 
            ctx.beginPath(); ctx.arc(this.x, this.y, 250, 0, Math.PI * 2); ctx.fillStyle = "rgba(108, 0, 0, 0.2)"; ctx.fill(); ctx.strokeStyle = "rgba(255, 0, 0, 0.4)"; ctx.lineWidth = 3; ctx.stroke();
            for(let i=0; i<10; i++) { let rx = this.x + (Math.random() - 0.5) * 450; let ry = this.y + (Math.random() - 0.5) * 450; let len = 20 + Math.random() * 40; let angle = Math.random() * Math.PI; ctx.beginPath(); ctx.moveTo(rx - Math.cos(angle) * len, ry - Math.sin(angle) * len); ctx.lineTo(rx + Math.cos(angle) * len, ry + Math.sin(angle) * len); ctx.strokeStyle = "rgba(255, 255, 255, 0.7)"; ctx.lineWidth = 1; ctx.stroke(); }
        }
        if (this.trailPositions.length > 0) { this.trailPositions.forEach((pos, i) => { ctx.beginPath(); ctx.arc(pos.x, pos.y, this.radius, 0, Math.PI*2); ctx.fillStyle = `rgba(149, 165, 166, ${(i+1)*0.04})`; ctx.fill(); }); }
        
        // --- DRAW BALL AVATAR (v1.6.7) ---
        ctx.save();
        if (this.isClone) ctx.globalAlpha = 0.6;
        
        // Buat Kliping Bulat
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.clip();

        // Gambar Foto Karakter (Kalo gak ada foto, pake warna dasar)
        const img = (this.name === "Clone") ? charImages["Naruto"] : charImages[this.name];
        if (img && img.complete) {
            ctx.drawImage(img, this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
        } else {
            ctx.fillStyle = this.color;
            ctx.fill();
        }
        
        // Border Putih pas Kena Hit
        if (this.hitTimer > 0) {
            ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
            ctx.fill();
        }

        // Stroke Lingkaran
        ctx.restore();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2 * scaleFactor;
        ctx.stroke();

        if (this.isStunned) { ctx.fillStyle = "yellow"; ctx.font = `${20 * scaleFactor}px Arial`; ctx.fillText("💫", this.x, this.y - (45 * scaleFactor)); }
        let hpVal = Math.round(Math.max(0, this.hp)); ctx.font = `bold ${22 * scaleFactor}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.strokeStyle = "black"; ctx.lineWidth = 4 * scaleFactor; ctx.strokeText(hpVal, this.x, this.y); ctx.fillStyle = "white"; ctx.fillText(hpVal, this.x, this.y);
    }
}

function adjustScaling() { const screenWidth = window.innerWidth; scaleFactor = (screenWidth < 600) ? 0.6 : 1.0; allUnits.forEach(u => { u.radius = 35 * scaleFactor; }); }
window.addEventListener('resize', adjustScaling); adjustScaling();
function spawnMenuSim() { allUnits = []; allUnits.push(new Unit("Human", 100, 5, 0.3, charColors["Human"], 120, 250, 0)); allUnits.push(new Unit("Human", 100, 5, 0.3, charColors["Human"], 380, 250, 1)); }
function injectChars() { const panels = document.querySelectorAll('.char-options'); panels.forEach((p, i) => { p.innerHTML = ''; Object.keys(charColors).forEach(name => { const btn = document.createElement('button'); btn.className = `char-btn ${selectedChars[i] === name ? 'active' : ''}`; btn.innerText = name; btn.onclick = () => selectChar(i, name); btn.onmouseenter = (e) => showTooltip(name); btn.onmouseleave = hideTooltip; btn.onmousemove = moveTooltip; p.appendChild(btn); }); }); }
function showTooltip(name) { const d = skillDetails[name]; tooltip.innerHTML = `<div style="border-bottom: 1px solid #555; padding-bottom: 4px; margin-bottom: 8px;"><b style="font-size: 15px; color: #fff; letter-spacing: 1px;">${name.toUpperCase()}</b></div><div style="margin-bottom: 10px; min-width: 250px;"><b style="color: #0fbcf9; font-size: 11px;">PASSIVE: ${d.passive.toUpperCase()}</b><br><span style="font-size: 10.5px; color: #eee; line-height: 1.4; display: block; margin-top: 2px;">${d.pDesc}</span></div><div style="min-width: 250px;"><b style="color: #ff4757; font-size: 11px;">ULTIMATE: ${d.ulti.toUpperCase()}</b><br><span style="font-size: 10.5px; color: #eee; line-height: 1.4; display: block; margin-top: 2px;">${d.uDesc}</span></div>`; tooltip.style.opacity = 1; }
function hideTooltip() { tooltip.style.opacity = 0; }
function moveTooltip(e) { tooltip.style.left = (e.clientX + 15) + 'px'; tooltip.style.top = (e.clientY + 15) + 'px'; }
window.selectChar = function(pIdx, char) { if (gameStarted && !isPaused) return; selectedChars[pIdx] = char; injectChars(); document.getElementById(`p${pIdx+1}-name-display`).innerText = char.toUpperCase(); document.getElementById(`p${pIdx+1}-char-name`).innerText = char.toUpperCase(); };
function updateUI() { allUnits.forEach(u => { if (u.isClone) return; const id = u.playerIdx === 0 ? "p1" : "p2"; const hpB = document.getElementById(`${id}-hp-bar`); const hpWhite = document.getElementById(`${id}-hp-white`); const maB = document.getElementById(`${id}-mana-bar`); if(hpB) hpB.style.width = Math.max(0, (u.hp / u.maxHp) * 100) + "%"; if(hpWhite) hpWhite.style.width = Math.max(0, (u.hp / u.maxHp) * 100) + "%"; if(maB) maB.style.width = (u.mana / u.maxMana) * 100 + "%"; document.getElementById(`${id}-hp-text`).innerText = `${Math.round(u.hp)} / ${u.maxHp}`; document.getElementById(`${id}-mana-text`).innerText = `${Math.round(u.mana)} / ${u.maxMana}`; }); }
function startActualGame() { adjustScaling(); allUnits = []; projectiles = []; selectedChars.forEach((char, i) => { const sx = i === 0 ? 80 : 420; allUnits.push(new Unit(char, 100, 5, 0.9, charColors[char], sx, 250, i)); document.getElementById(`p${i+1}-char-name`).innerText = char.toUpperCase(); }); gameStarted = true; isPaused = false; overlay.style.opacity = "0"; overlay.style.pointerEvents = "none"; pauseBtn.style.display = "block"; startBtn.innerText = "RESTART"; lastTime = performance.now(); }

function update(time) { 
    if (isPaused) return; 
    const dt = time - lastTime; lastTime = time; 
    ctx.clearRect(0, 0, canvas.width, canvas.height); 
    let shakeX = (Math.random() - 0.5) * screenShake; let shakeY = (Math.random() - 0.5) * screenShake;
    ctx.save(); ctx.translate(shakeX, shakeY);
    const gs = allUnits.find(u => u.name === "Gojo" && u.isSkillActive); 
    ctx.fillStyle = gs ? '#000000' : '#1e272e'; 
    ctx.fillRect(arenaLeft, arenaTop, arenaRight - arenaLeft, arenaBottom - arenaTop); 
    projectiles = projectiles.filter(p => !p.isDead); 
    projectiles.forEach(p => { p.update(); p.draw(ctx); allUnits.forEach(u => { if (u.playerIdx !== p.ownerIdx && !u.isDead) { const d = Math.sqrt((u.x-p.x)**2+(u.y-p.y)**2); if (d < u.radius+p.radius) { u.applyDamage(p.dmg, 'shrine'); p.isDead=true; } } }); }); 
    for (let i = 0; i < allUnits.length; i++) { for (let j = i + 1; j < allUnits.length; j++) { allUnits[i].checkCollision(allUnits[j]); } allUnits[i].update(dt); allUnits[i].draw(ctx); } 
    ctx.restore();
    if (gameStarted) updateUI(); 
    if (gameStarted) { 
        const p1_units = allUnits.filter(u => u.playerIdx === 0 && !u.isClone && !u.isDead);
        const p2_units = allUnits.filter(u => u.playerIdx === 1 && !u.isClone && !u.isDead);
        if (p1_units.length === 0 || p2_units.length === 0) { 
            overlay.style.opacity = "1"; overlay.style.pointerEvents = "all"; 
            let winnerName = ""; let winnerColor = "#fff";
            if (p1_units.length > 0) { winnerName = p1_units[0].name.toUpperCase(); winnerColor = charColors[p1_units[0].name]; }
            else if (p2_units.length > 0) { winnerName = p2_units[0].name.toUpperCase(); winnerColor = charColors[p2_units[0].name]; }
            if (winnerName) { overlayMsg.innerHTML = `<span style="font-size: 48px; color: ${winnerColor}; text-shadow: 0 0 20px ${winnerColor}; font-weight: bold;">${winnerName} WIN</span>`; }
            else { overlayMsg.innerHTML = `<span style="font-size: 48px; color: #fff; font-weight: bold;">DRAW</span>`; }
            gameStarted = false; pauseBtn.style.display = "none"; 
        } 
    } 
    animationId = requestAnimationFrame(update); 
}

startBtn.addEventListener('click', () => { cancelAnimationFrame(animationId); startActualGame(); requestAnimationFrame(update); });
pauseBtn.addEventListener('click', () => { isPaused = !isPaused; if (isPaused) { overlay.style.opacity = "1"; overlay.style.pointerEvents = "all"; overlayMsg.innerHTML = `Game Paused`; pauseBtn.innerText = "RESUME"; } else { overlay.style.opacity = "0"; overlay.style.pointerEvents = "none"; pauseBtn.innerText = "PAUSE"; lastTime = performance.now(); requestAnimationFrame(update); } });
injectChars(); spawnMenuSim(); requestAnimationFrame(update);
