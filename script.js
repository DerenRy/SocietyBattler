const style = document.createElement('style');
style.innerHTML = `
    body { margin: 0; padding: 10px; display: flex; flex-direction: column; justify-content: center; align-items: center; background: #111; min-height: 100vh; font-family: sans-serif; color: white; }
    #game-container { display: flex; flex-direction: column; align-items: center; width: 100%; max-width: 500px; position: relative; }
    #battleCanvas { background: #1e272e; border: 4px solid #333; width: 100%; height: auto; display: block; }
    .controls-wrapper { width: 100%; display: flex; justify-content: center; gap: 15px; padding: 15px 0; background: rgba(0,0,0,0.5); }
    .btn-main { padding: 12px 25px; font-size: 14px; font-weight: bold; color: white; background: #0fbcf9; border: none; border-radius: 5px; cursor: pointer; text-transform: uppercase; box-shadow: 0 4px 0 #0984e3; transition: transform 0.1s; z-index: 110; }
    .btn-main:active { transform: translateY(2px); box-shadow: 0 2px 0 #0984e3; }
    #pauseBtn { background: #ff4757; box-shadow: 0 4px 0 #ff1f1f; display: none; }
    #skill-tooltip { pointer-events: none; z-index: 1000; max-width: 280px; width: auto; word-wrap: break-word; white-space: normal; display: flex; flex-direction: column; background: #111 !important; opacity: 0; visibility: hidden; border: 1px solid #444; box-shadow: 0 10px 30px rgba(0,0,0,1); padding: 12px; border-radius: 4px; transition: opacity 0.15s ease; }
    @media (max-width: 600px) { #battleCanvas { border-width: 2px; } .btn-main { padding: 10px 20px; font-size: 12px; } }
`;
document.head.appendChild(style);

let ctrlWrapper = document.querySelector('.controls-wrapper');
if (!ctrlWrapper) {
    ctrlWrapper = document.createElement('div');
    ctrlWrapper.className = 'controls-wrapper';
    document.body.appendChild(ctrlWrapper);
}

const canvas = document.getElementById('battleCanvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const overlay = document.getElementById('overlay');
const overlayMsg = document.getElementById('overlay-msg');
const tooltip = document.getElementById('skill-tooltip');

if(startBtn) { startBtn.className = 'btn-main'; ctrlWrapper.appendChild(startBtn); }
if(pauseBtn) { pauseBtn.className = 'btn-main'; ctrlWrapper.appendChild(pauseBtn); }

const BUILD_VER = "v1.9.1";
canvas.width = 500; canvas.height = 500;
const arenaTop = 15, arenaLeft = 15, arenaRight = 485, arenaBottom = 485;

const charImages = {};
const charNames = ['Gojo', 'Sukuna', 'Pain', 'Naruto', 'Human', 'Goku'];
charNames.forEach(name => {
    const img = new Image();
    img.src = `image/${name.toLowerCase()}.${name === 'Goku' ? 'png' : 'jpg'}`;
    charImages[name] = img;
});
const bgImage = new Image(); bgImage.src = 'image/battlefield.jpeg';

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

const voiceGokuUlti = new Audio('audio/goku_ulti.mp3'); voiceGokuUlti.volume = 0.8;
const sfxGokuPassive = new Audio('audio/goku_passive.mp3'); sfxGokuPassive.volume = 1.0;

const lastPlayed = new Map();
function playSFX(audio, boost = 1) {
    if (!gameStarted || isPaused) return;
    const now = Date.now();
    if (lastPlayed.has(audio.src) && now - lastPlayed.get(audio.src) < 80) return;
    lastPlayed.set(audio.src, now);
    const soundClone = audio.cloneNode();
    soundClone.volume = Math.min(1, audio.volume * boost);
    soundClone.play().catch(() => {});
}

const skillDetails = {
    'Human': { passive: 'Spam Mastery', pDesc: 'Mana cap: 30.', ulti: 'Physical Burst', uDesc: 'Bonus +3 DMG on next hit.' },
    'Naruto': { passive: 'Swift Clone', pDesc: '+8% Speed per clone.', ulti: 'Kage Bunshin', uDesc: 'Summons 2 Clones.' },
    'Gojo': { passive: 'Limitless', pDesc: 'Slows enemies, Gojo gains Speed.', ulti: 'Unlimited Void', uDesc: 'Heal +8, Global stun, 1 DMG taken.' },
    'Sukuna': { passive: 'Fire Arrow', pDesc: 'Fires arrow for 7 DMG.', ulti: 'Malevolent Shrine', uDesc: 'Continuous heavy Area DMG.' },
    'Pain': { passive: 'Bansho Tenin', pDesc: 'Pulls enemies. 4th hit repels.', ulti: 'Shinra Tensei', uDesc: 'Huge blast radius.' },
    'Goku': { passive: 'Ultra Instinct', pDesc: 'HP < 50%: +100% Speed & +3 DMG.', ulti: 'Kamehameha', uDesc: 'Wide beam tracking. 4 DMG/tick.' }
};

let allUnits = [];
let projectiles = [];
let gameStarted = false, isPaused = false, animationId;
let selectedChars = ["Human", "Goku"];
let lastTime = 0, screenShake = 0, scaleFactor = 1.0, globalTicker = 0;
const charColors = { 'Human': '#3498db', 'Naruto': '#f39c12', 'Gojo': '#7f8c8d', 'Sukuna': '#6c3226', 'Pain': '#e67e22', 'Goku': '#ff6b10' };

class Projectile {
    constructor(x, y, targetX, targetY, dmg, ownerIdx) {
        this.x = x; this.y = y; this.radius = 16 * scaleFactor; this.dmg = dmg; this.ownerIdx = ownerIdx;
        const dx = targetX - x, dy = targetY - y; const dist = Math.sqrt(dx*dx + dy*dy);
        this.vx = (dx/dist) * 7; this.vy = (dy/dist) * 7; this.isDead = false;
        this.flickerTicker = 0;
    }
    update() { this.x += this.vx; this.y += this.vy; this.flickerTicker++; if (this.x < 0 || this.x > 500 || this.y < 0 || this.y > 500) this.isDead = true; }
    draw(ctx) {
        ctx.save();
        ctx.shadowBlur = (25 + Math.sin(this.flickerTicker * 0.3) * 10) * scaleFactor;
        ctx.shadowColor = "rgba(255, 69, 0, 0.9)";
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2);
        ctx.fillStyle = "#ff6b10"; ctx.fill();
        ctx.shadowBlur = 10 * scaleFactor; ctx.shadowColor = "#ffffff";
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius * 0.6, 0, Math.PI*2);
        ctx.fillStyle = "#ffffff"; ctx.fill();
        ctx.restore();
    }
}

class Unit {
    constructor(name, hp, dmg, speed, color, startX, startY, playerIdx, isClone = false) {
        this.name = name; this.playerIdx = playerIdx; this.hp = hp; this.maxHp = hp; this.dmg = dmg;
        this.baseSpeed = speed; this.currentSpeedMult = 1.0; this.color = color; this.x = startX; this.y = startY; this.radius = 35 * scaleFactor;
        this.isClone = isClone;
        this.maxMana = (name === "Human") ? 30 : (name === "Naruto" ? 60 : (name === "Goku" ? 180 : 150));
        this.mana = 0; this.isStunned = false; this.stunTimer = 0; this.isSkillActive = false; this.skillTimer = 0;
        this.nextHitExtraDmg = 0; this.passiveTimer = 0; this.painCollisionCount = 0; this.painPushTimer = 0; this.isPainPushing = false;
        this.gravityDmgTimer = 0; this.trailPositions = [];
        const angle = Math.random() * Math.PI * 2; this.dirX = Math.cos(angle); this.dirY = Math.sin(angle);
        this.isDead = false; this.hitTimer = 0; this.immuneTimer = 5;
        this.shrineRotationOffset = 0; this.kamehamehaAngle = 0; this.kamehamehaTickTimer = 0;
        this.passiveTriggered = false;
    }

    applyDamage(amount, type = 'physical') {
        if (this.isDead) return;
        let finalDmg = (this.name === "Gojo" && this.isSkillActive) ? 1 : amount;
        this.hp -= finalDmg; this.hitTimer = 5;
        if (type === 'physical') playSFX(soundPunch); else if (type === 'shrine' || type === 'kamehameha') playSFX(soundSlash, 1.2); else if (type === 'gravity') playSFX(soundGravityHit);
        if (!this.isClone && !this.isSkillActive) this.mana = Math.min(this.maxMana, this.mana + 5);
        if (this.hp <= 0) { this.hp = 0; this.isDead = true; }
    }

    update(deltaTime) {
        if (this.isDead) return;
        if (this.hitTimer > 0) this.hitTimer--;
        if (this.immuneTimer > 0) this.immuneTimer--;
        if (this.stunTimer > 0) { this.stunTimer -= deltaTime; if (this.stunTimer <= 0) this.isStunned = false; return; }

        if (this.name === "Goku" && !this.isDead && !this.isClone) {
            if (this.hp < (this.maxHp * 0.5)) {
                if (!this.passiveTriggered) { playSFX(sfxGokuPassive); this.passiveTriggered = true; }
                this.currentSpeedMult = 2.0; this.dmg = 8;
            } else { this.currentSpeedMult = 1.0; this.dmg = 5; this.passiveTriggered = false; }
        } else this.currentSpeedMult = 1.0;

        const dxC = 250 - this.x, dyC = 250 - this.y, dC = Math.sqrt(dxC**2 + dyC**2);
        if (dC < 300 && dC > 10) { this.x += (dxC / dC) * 0.5; this.y += (dyC / dC) * 0.5; }
        
        if (!this.isDead && !this.isClone) {
            if (this.name === "Naruto") { const clones = allUnits.filter(u => u.isClone && u.playerIdx === this.playerIdx && !u.isDead).length; this.currentSpeedMult += (clones * 0.08); }
            if (this.name === "Gojo") { this.currentSpeedMult += 0.3; const enemyNear = allUnits.some(u => u.playerIdx !== this.playerIdx && !u.isDead && Math.sqrt((u.x-this.x)**2 + (u.y-this.y)**2) < 100 + u.radius); if (enemyNear) this.currentSpeedMult += 0.65; }
            if (this.name === "Sukuna") { this.passiveTimer += deltaTime; if (this.passiveTimer >= 5000) { const target = allUnits.find(u => u.playerIdx !== this.playerIdx && !u.isDead); if (target) { projectiles.push(new Projectile(this.x, this.y, target.x, target.y, 7, this.playerIdx)); playSFX(voiceSukunaArrow); } this.passiveTimer = 0; } }
            if (this.name === "Pain") { this.gravityDmgTimer += deltaTime; if (this.isPainPushing) { this.painPushTimer -= deltaTime; if (this.painPushTimer <= 0) { this.isPainPushing = false; this.painCollisionCount = 0; } } const r = this.isSkillActive ? 450 : 90; const p = this.isSkillActive ? 12.0 : (this.isPainPushing ? 12.0 : 4.0); const interval = this.isSkillActive ? 600 : 400; allUnits.forEach(u => { if (u.playerIdx !== this.playerIdx && !u.isDead) { const dx = this.x - u.x, dy = this.y - u.y, dist = Math.sqrt(dx*dx + dy*dy); if (dist < r + u.radius) { if (this.isSkillActive || this.isPainPushing) { u.x -= (dx/dist) * p; u.y -= (dy/dist) * p; } else { if (dist > this.radius) { u.x += (dx/dist) * p; u.y += (dy/dist) * p; } } if (this.gravityDmgTimer >= interval) u.applyDamage(2, 'gravity'); } } }); if (this.gravityDmgTimer >= interval) this.gravityDmgTimer = 0; }
        }
        
        allUnits.forEach(other => { if (other.name === "Gojo" && !other.isDead && other.playerIdx !== this.playerIdx) { const d = Math.sqrt((this.x - other.x)**2 + (this.y - other.y)**2); if (d < 100 + this.radius) this.currentSpeedMult *= 0.1; } });
        
        if (this.skillTimer > 0) { 
            this.skillTimer -= deltaTime; 
            if (this.name === "Sukuna") { screenShake = 5; this.shrineRotationOffset += 0.05; this.domainDmgTimer += deltaTime; if (this.domainDmgTimer >= 100) { allUnits.forEach(u => { if (u.playerIdx !== this.playerIdx && !u.isDead) { if (Math.sqrt((u.x-this.x)**2+(u.y-this.y)**2) < 250+u.radius) u.applyDamage(2, 'shrine'); } }); this.domainDmgTimer = 0; } } 
            if (this.name === "Goku" && this.isSkillActive) {
                this.currentSpeedMult *= 0.20; 
                let t = allUnits.reduce((closest, u) => { if (u.playerIdx === this.playerIdx || u.isDead) return closest; const d = Math.sqrt((u.x-this.x)**2 + (u.y-this.y)**2); return (!closest || d < closest.d) ? {u, d} : closest; }, null);
                if (t) { const tA = Math.atan2(t.u.y - this.y, t.u.x - this.x); let aD = tA - this.kamehamehaAngle; while (aD < -Math.PI) aD += Math.PI * 2; while (aD > Math.PI) aD -= Math.PI * 2; this.kamehamehaAngle += aD * 0.0144; }
                this.kamehamehaTickTimer += deltaTime;
                if (this.kamehamehaTickTimer >= 200) { allUnits.forEach(u => { if (u.playerIdx === this.playerIdx || u.isDead) return; const dx = u.x - this.x, dy = u.y - this.y; const lx = dx * Math.cos(-this.kamehamehaAngle) - dy * Math.sin(-this.kamehamehaAngle); const ly = dx * Math.sin(-this.kamehamehaAngle) + dy * Math.cos(-this.kamehamehaAngle); if (lx > this.radius && lx < 1000 && Math.abs(ly) < (55 * scaleFactor + u.radius)) u.applyDamage(4, 'kamehameha'); }); this.kamehamehaTickTimer = 0; }
            }
            if (this.skillTimer <= 0) { this.isSkillActive = false; screenShake = 0; } 
        }
        if (!this.isClone && !this.isSkillActive) { this.mana = Math.min(this.maxMana, this.mana + (10 * (deltaTime / 1000))); if (this.mana >= this.maxMana) this.useSkill(); }
        let sS = (this.name === "Gojo" && this.isSkillActive) ? 8.0 : this.currentSpeedMult; 
        this.x += this.dirX * this.baseSpeed * sS * 5; this.y += this.dirY * this.baseSpeed * sS * 5;
        if (this.x - this.radius < arenaLeft) { this.x = arenaLeft + this.radius; this.dirX *= -1; playSFX(soundWall); } if (this.x + this.radius > arenaRight) { this.x = arenaRight - this.radius; this.dirX *= -1; playSFX(soundWall); } if (this.y - this.radius < arenaTop) { this.y = arenaTop + this.radius; this.dirY *= -1; playSFX(soundWall); } if (this.y + this.radius > arenaBottom) { this.y = arenaBottom - this.radius; this.dirY *= -1; playSFX(soundWall); }
    }

    useSkill() {
        this.mana = 0; 
        if (this.name === "Naruto") { playSFX(sfxNarutoUlti, 1); for (let i = 0; i < 2; i++) { const nc = new Unit("Clone", 10, 3, this.baseSpeed, this.color, this.x, this.y, this.playerIdx, true); const a = Math.random() * Math.PI * 2; nc.dirX = Math.cos(a); nc.dirY = Math.sin(a); nc.x += nc.dirX * 15; nc.y += nc.dirY * 15; allUnits.push(nc); } } 
        else if (this.name === "Gojo") { playSFX(voiceGojoUlti, 1.5); this.hp = Math.min(this.maxHp, this.hp + 8); this.isSkillActive = true; this.skillTimer = 3000; allUnits.forEach(u => { if (u.playerIdx !== this.playerIdx) { u.isStunned = true; u.stunTimer = 3000; } }); } 
        else if (this.name === "Human") { this.nextHitExtraDmg = 3; this.isSkillActive = true; } 
        else if (this.name === "Sukuna") { playSFX(voiceSukunaAlt, 3.5); this.isSkillActive = true; this.skillTimer = 3000; } 
        else if (this.name === "Pain") { playSFX(voicePainUlti, 1.5); this.isSkillActive = true; this.skillTimer = 4000; }
        else if (this.name === "Goku") { playSFX(voiceGokuUlti, 1.2); this.isSkillActive = true; this.skillTimer = 3000; let t = allUnits.reduce((closest, u) => { if (u.playerIdx === this.playerIdx || u.isDead) return closest; const d = Math.sqrt((u.x-this.x)**2 + (u.y-this.y)**2); return (!closest || d < closest.d) ? {u, d} : closest; }, null); this.kamehamehaAngle = t ? Math.atan2(t.u.y - this.y, t.u.x - this.x) : Math.random()*Math.PI*2; }
    }

    checkCollision(other) {
        if (this.isDead || other.isDead) return;
        const dx = other.x - this.x, dy = other.y - this.y, dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < this.radius + other.radius) {
            if (this.playerIdx !== other.playerIdx && this.immuneTimer <= 0 && other.immuneTimer <= 0) {
                this.applyDamage(other.dmg + (other.nextHitExtraDmg || 0));
                other.applyDamage(this.dmg + (this.nextHitExtraDmg || 0));
                if (this.name === "Human") { this.nextHitExtraDmg = 0; this.isSkillActive = false; }
                if (other.name === "Human") { other.nextHitExtraDmg = 0; other.isSkillActive = false; }
                this.immuneTimer = 5; other.immuneTimer = 5;
            }
            const nx = dx / dist, ny = dy / dist;
            const d1 = this.dirX * nx + this.dirY * ny; this.dirX -= 2 * d1 * nx; this.dirY -= 2 * d1 * ny;
            const d2 = other.dirX * (-nx) + other.dirY * (-ny); other.dirX -= 2 * d2 * (-nx); other.dirY -= 2 * d2 * (-ny);
            const ov = (this.radius + other.radius) - dist; this.x -= nx * (ov / 2); this.y -= ny * (ov / 2); other.x += nx * (ov / 2); other.y += ny * (ov / 2);
        }
    }

    draw(ctx) {
        if (this.isDead) return;
        if (this.name === "Pain" && !this.isDead) { ctx.beginPath(); ctx.arc(this.x, this.y, (this.isSkillActive ? 450 : 90), 0, Math.PI*2); ctx.fillStyle = (this.isSkillActive || this.isPainPushing) ? "rgba(255, 255, 255, 0.25)" : "rgba(0, 0, 0, 0.15)"; ctx.fill(); }
        if (this.name === "Gojo" && !this.isDead) { const p = Math.sin(globalTicker * 0.05) * 10; ctx.beginPath(); ctx.arc(this.x, this.y, 100 + p, 0, Math.PI*2); ctx.fillStyle = "rgba(0, 255, 255, 0.05)"; ctx.fill(); }
        if (this.name === "Sukuna" && this.isSkillActive) { ctx.beginPath(); ctx.arc(this.x, this.y, 250, 0, Math.PI * 2); ctx.fillStyle = "rgba(108, 0, 0, 0.2)"; ctx.fill(); ctx.save(); ctx.beginPath(); ctx.arc(this.x, this.y, 250, 0, Math.PI * 2); ctx.strokeStyle = "rgba(139, 0, 0, 0.8)"; ctx.lineWidth = 4 * scaleFactor; const dL = 20 * scaleFactor; const gL = 15 * scaleFactor; ctx.setLineDash([dL, gL]); ctx.lineDashOffset = -this.shrineRotationOffset * (dL + gL); ctx.stroke(); ctx.restore(); for(let i=0; i<10; i++) { let rx = this.x + (Math.random() - 0.5) * 450; let ry = this.y + (Math.random() - 0.5) * 450; let len = 20 + Math.random() * 40; let angle = Math.random() * Math.PI; ctx.beginPath(); ctx.moveTo(rx - Math.cos(angle) * len, ry - Math.sin(angle) * len); ctx.lineTo(rx + Math.cos(angle) * len, ry + Math.sin(angle) * len); ctx.strokeStyle = "rgba(255, 255, 255, 0.7)"; ctx.lineWidth = 1; ctx.stroke(); } }
        
        if (this.name === "Goku" && !this.isDead && this.hp < (this.maxHp * 0.5)) {
            ctx.save(); ctx.shadowBlur = (25 + Math.sin(globalTicker * 0.15) * 10) * scaleFactor; ctx.shadowColor = "#00f2ff"; ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.strokeStyle = "#00f2ff"; ctx.lineWidth = 4 * scaleFactor; ctx.stroke(); ctx.restore();
        }

        if (this.isSkillActive && this.name === "Goku") {
            ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.kamehamehaAngle);
            const beamWidth = 55 * scaleFactor; 
            ctx.shadowBlur = 40 * scaleFactor; ctx.shadowColor = "#00c3ff";
            ctx.fillStyle = "rgba(0, 195, 255, 0.6)"; ctx.fillRect(0, -beamWidth, 1000, beamWidth * 2);
            ctx.fillStyle = "#ffffff"; ctx.shadowBlur = 15 * scaleFactor; ctx.shadowColor = "#ffffff";
            ctx.fillRect(0, -(beamWidth * 0.35), 1000, beamWidth * 0.7);
            ctx.shadowBlur = 0;
            for(let i=0; i<8; i++) {
                ctx.beginPath(); ctx.arc(Math.random()*800, (Math.random()-0.5)*(beamWidth*1.5), 3*scaleFactor, 0, Math.PI*2);
                ctx.fillStyle = "rgba(255, 255, 255, 0.8)"; ctx.fill();
            }
            ctx.restore();
        }

        ctx.save(); ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.clip();
        const img = (this.name === "Clone" || this.name === "Naruto") ? charImages["Naruto"] : charImages[this.name];
        if (img && img.complete && img.naturalWidth !== 0) ctx.drawImage(img, this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
        else { ctx.fillStyle = this.color; ctx.fill(); }
        if (this.hitTimer > 0) { ctx.fillStyle = "rgba(255, 255, 255, 0.5)"; ctx.fillRect(this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2); }
        ctx.restore();
        
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.strokeStyle = "white"; ctx.lineWidth = 2 * scaleFactor; ctx.stroke();
        let hpVal = Math.round(Math.max(0, this.hp)); ctx.font = `bold ${22 * scaleFactor}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.strokeStyle = "black"; ctx.lineWidth = 4 * scaleFactor; ctx.strokeText(hpVal, this.x, this.y); ctx.fillStyle = "white"; ctx.fillText(hpVal, this.x, this.y);
    }
}

function adjustScaling() { const sW = window.innerWidth; scaleFactor = (sW < 600) ? 0.6 : 1.0; }
function spawnMenuSim() { allUnits = [new Unit("Human", 100, 5, 0.3, charColors["Human"], 120, 250, 0), new Unit("Human", 100, 5, 0.3, charColors["Human"], 380, 250, 1)]; }
function injectChars() { const panels = document.querySelectorAll('.char-options'); panels.forEach((p, i) => { p.innerHTML = ''; Object.keys(charColors).forEach(name => { const btn = document.createElement('button'); btn.className = `char-btn ${selectedChars[i] === name ? 'active' : ''}`; btn.innerText = name; btn.onclick = () => selectChar(i, name); btn.onmouseenter = () => showTooltip(name); btn.onmouseleave = hideTooltip; btn.onmousemove = moveTooltip; p.appendChild(btn); }); }); }

function showTooltip(name) { 
    const d = skillDetails[name]; 
    tooltip.innerHTML = `
        <div style="border-bottom: 1px solid #555; padding-bottom: 4px; margin-bottom: 8px;"><b style="font-size: 15px; color: #fff;">${name.toUpperCase()}</b></div>
        <div style="margin-bottom: 10px;"><b style="color: #0fbcf9; font-size: 11px;">PASSIVE:</b> <span style="font-size: 10.5px; color: #eee;">${d.pDesc}</span></div>
        <div><b style="color: #ff4757; font-size: 11px;">ULTIMATE:</b> <span style="font-size: 10.5px; color: #eee;">${d.uDesc}</span></div>`; 
    tooltip.style.visibility = "visible"; tooltip.style.opacity = "1"; 
}
function hideTooltip() { tooltip.style.opacity = "0"; tooltip.style.visibility = "hidden"; }
function moveTooltip(e) { tooltip.style.left = (e.clientX + 15) + 'px'; tooltip.style.top = (e.clientY + 15) + 'px'; }
window.selectChar = function(pIdx, char) { if (gameStarted && !isPaused) return; selectedChars[pIdx] = char; injectChars(); };

function updateUI() { 
    allUnits.forEach(u => { 
        if (u.isClone) return; const id = u.playerIdx === 0 ? "p1" : "p2";
        const hpBar = document.getElementById(`${id}-hp-bar`); const manaBar = document.getElementById(`${id}-mana-bar`);
        const hpText = document.getElementById(`${id}-hp-text`); const manaText = document.getElementById(`${id}-mana-text`);
        if (hpBar) hpBar.style.width = Math.max(0, (u.hp / u.maxHp) * 100) + "%";
        if (manaBar) manaBar.style.width = (u.mana / u.maxMana) * 100 + "%";
        if (hpText) hpText.innerText = `${Math.round(u.hp)} / ${u.maxHp}`;
        if (manaText) manaText.innerText = `${Math.round(u.mana)} / ${u.maxMana}`;
    }); 
}

function startActualGame() { 
    adjustScaling(); allUnits = []; projectiles = []; 
    selectedChars.forEach((char, i) => { allUnits.push(new Unit(char, 100, 5, 0.9, charColors[char], i === 0 ? 80 : 420, 250, i)); }); 
    gameStarted = true; isPaused = false; overlay.style.opacity = "0"; overlay.style.pointerEvents = "none"; 
    pauseBtn.style.display = "block"; startBtn.innerText = "RESTART"; lastTime = performance.now(); 
}

function update(time) { 
    if (isPaused) return; const dt = time - lastTime; lastTime = time; ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.setTransform(1, 0, 0, 1, 0, 0); globalTicker++;
    if (bgImage.complete && bgImage.naturalWidth !== 0) { ctx.drawImage(bgImage, arenaLeft, arenaTop, arenaRight - arenaLeft, arenaBottom - arenaTop); ctx.fillStyle = "rgba(0, 0, 0, 0.4)"; ctx.fillRect(arenaLeft, arenaTop, arenaRight - arenaLeft, arenaBottom - arenaTop); }
    else { ctx.fillStyle = '#1e272e'; ctx.fillRect(arenaLeft, arenaTop, arenaRight - arenaLeft, arenaBottom - arenaTop); }
    
    let shakeX = (Math.random() - 0.5) * screenShake; let shakeY = (Math.random() - 0.5) * screenShake; ctx.save(); ctx.translate(shakeX, shakeY);
    
    const gs = allUnits.find(u => u.name === "Gojo" && u.isSkillActive); 
    if (gs) { ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillRect(arenaLeft, arenaTop, arenaRight - arenaLeft, arenaBottom - arenaTop); }
    
    projectiles = projectiles.filter(p => !p.isDead);
    projectiles.forEach(p => { p.update(); p.draw(ctx); allUnits.forEach(u => { if (u.playerIdx !== p.ownerIdx && !u.isDead) { if (Math.sqrt((u.x-p.x)**2+(u.y-p.y)**2) < u.radius+p.radius) { u.applyDamage(p.dmg); p.isDead=true; } } }); }); 
    for (let i = 0; i < allUnits.length; i++) { 
        for (let j = i + 1; j < allUnits.length; j++) { allUnits[i].checkCollision(allUnits[j]); } 
        allUnits[i].update(dt); allUnits[i].draw(ctx); 
    }
    ctx.restore();
    if (gameStarted) {
        updateUI();
        const p1_u = allUnits.filter(u => u.playerIdx === 0 && !u.isClone && !u.isDead);
        const p2_u = allUnits.filter(u => u.playerIdx === 1 && !u.isClone && !u.isDead);
        if (p1_u.length === 0 || p2_u.length === 0) {
            overlay.style.opacity = "1"; overlay.style.pointerEvents = "all";
            let wN = p1_u.length > 0 ? allUnits.find(u => u.playerIdx === 0 && !u.isClone).name : (p2_u.length > 0 ? allUnits.find(u => u.playerIdx === 1 && !u.isClone).name : "");
            overlayMsg.innerHTML = wN ? `<span style="font-size: 48px; color: ${charColors[wN]}; font-weight: bold;">${wN.toUpperCase()} WIN</span>` : `<span style="font-size: 48px; color: #fff; font-weight: bold;">DRAW</span>`;
            gameStarted = false; pauseBtn.style.display = "none";
        }
    }
    animationId = requestAnimationFrame(update);
}

startBtn.addEventListener('click', () => { if(animationId) cancelAnimationFrame(animationId); startActualGame(); requestAnimationFrame(update); });
pauseBtn.addEventListener('click', () => { isPaused = !isPaused; if (isPaused) { overlay.style.opacity = "1"; overlay.style.pointerEvents = "all"; overlayMsg.innerText = "Paused"; pauseBtn.innerText = "RESUME"; } else { overlay.style.opacity = "0"; pauseBtn.innerText = "PAUSE"; lastTime = performance.now(); requestAnimationFrame(update); } });
injectChars(); spawnMenuSim(); adjustScaling(); requestAnimationFrame(update);
