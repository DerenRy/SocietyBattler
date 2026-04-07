const style = document.createElement('style');
style.innerHTML = `
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap');
    body { margin: 0; padding: 20px 10px 10px 10px; display: flex; flex-direction: column; justify-content: center; align-items: center; background: #111; min-height: 100vh; font-family: 'Poppins', sans-serif; color: white; }
    #game-container { display: flex; flex-direction: column; align-items: center; width: 100%; max-width: 500px; position: relative; }
    #battleCanvas { background: #1e272e; border: 4px solid #333; width: 100%; height: auto; display: block; }
    .btn-main { padding: 12px 25px; font-size: 14px; font-weight: bold; color: white; background: #0fbcf9; border: none; border-radius: 5px; cursor: pointer; text-transform: uppercase; box-shadow: 0 4px 0 #0984e3; transition: transform 0.1s; z-index: 110; text-align: center; font-family: 'Poppins', sans-serif; }
    .btn-main:active { transform: translateY(2px); box-shadow: 0 2px 0 #0984e3; }
    #pauseBtn { background: #ff4757; box-shadow: 0 4px 0 #ff1f1f; display: none; }
    @media (max-width: 600px) { #battleCanvas { border-width: 2px; } .btn-main { padding: 10px 20px; font-size: 12px; } }
`;
document.head.appendChild(style);

const canvas = document.getElementById('battleCanvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const overlay = document.getElementById('overlay');
const overlayMsg = document.getElementById('overlay-msg');

const BUILD_VER = "v2.1.0";
canvas.width = 500; canvas.height = 500;
const arenaTop = 15, arenaLeft = 15, arenaRight = 485, arenaBottom = 485;

const charImages = {};
const charNames = ['Gojo', 'Sukuna', 'Pain', 'Naruto', 'Human', 'Goku', 'Spider', 'Levi'];
charNames.forEach(name => {
    const img = new Image();
    img.src = `image/${name.toLowerCase()}.jpg`; 
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
const sfxSpiderUlti = new Audio('audio/spider_ulti.mp3'); sfxSpiderUlti.volume = 1.0;
const sfxSpiderPassive = new Audio('audio/spider_passive.mp3'); sfxSpiderPassive.volume = 1.0;
const sfxLeviUlti = new Audio('audio/sword-slash-1.mp3'); sfxLeviUlti.volume = 0.8;

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
    'Human': { passive: 'Spam Mastery', pDesc: 'Low mana cap allows for incredibly fast ultimate casting.', ulti: 'Physical Burst', uDesc: 'Empowers the next collision to deal massive burst damage.' },
    'Naruto': { passive: 'Swift Clone', pDesc: 'Gains a speed boost for every active clone on the battlefield.', ulti: 'Kage Bunshin', uDesc: 'Summons shadow clones with no limit to overwhelm the enemy.' },
    'Gojo': { passive: 'Limitless', pDesc: 'Projects an aura that slows nearby enemies and boosts Gojo\'s speed.', ulti: 'Unlimited Void', uDesc: 'Stuns all enemies globally while healing and becoming near-invincible.' },
    'Sukuna': { passive: 'Fire Arrow', pDesc: 'Automatically fires a devastating tracking arrow periodically.', ulti: 'Malevolent Shrine', uDesc: 'Deploys a massive domain that continuously slashes caught enemies.' },
    'Pain': { passive: 'Bansho Tenin & Shinra Tensei', pDesc: 'Pulls nearby enemies, and releases a repelling shockwave after taking or dealing hits.', ulti: 'Almighty Push', uDesc: 'Unleashes a huge gravitational blast that heavily damages and knocks back enemies.' },
    'Goku': { passive: 'Ultra Instinct', pDesc: 'Awakens when HP is low, gaining massive speed and extra damage.', ulti: 'Kamehameha', uDesc: 'Fires a devastating, slowly tracking energy beam while moving slowly.' },
    'Spider': { passive: 'Web Swing', pDesc: 'Fires a web that pulls him to enemies or walls. Deals bonus DMG while swinging.', ulti: 'Web Shooter', uDesc: 'Fires 24 webs. Enemies hit take 3 DMG and are heavily slowed (90%) for 3s.' },
    'Levi': { passive: 'ODM Gear', pDesc: 'Automatically homes in on the closest enemy with a wide turning radius.', ulti: 'Spinning Slash', uDesc: 'Spins rapidly, gaining speed and passing through enemies without bouncing.' }
};

let allUnits = [];
let projectiles = [];
let gameStarted = false, isPaused = false, animationId;
let selectedChars = ["Human", "Spider"];
let lastTime = 0, scaleFactor = 1.0, globalTicker = 0;
const charColors = { 'Human': '#3498db', 'Naruto': '#f39c12', 'Gojo': '#7f8c8d', 'Sukuna': '#6c3226', 'Pain': '#e67e22', 'Goku': '#ff6b10', 'Spider': '#e10915', 'Levi': '#2c3e50' };

class Projectile {
    constructor(x, y, targetX, targetY, dmg, ownerIdx, type = 'normal') {
        this.x = x; this.y = y; this.radius = 16 * scaleFactor; this.dmg = dmg; this.ownerIdx = ownerIdx;
        this.type = type;
        this.speed = type.startsWith('web') ? 15 : 7; 
        if (type.startsWith('web')) this.radius = 8 * scaleFactor; 
        const dx = targetX - x, dy = targetY - y; const dist = Math.sqrt(dx*dx + dy*dy);
        this.vx = (dx/dist) * this.speed; this.vy = (dy/dist) * this.speed; 
        this.isDead = false; this.hitWall = false;
        this.flickerTicker = 0;
    }
    update() { 
        this.x += this.vx; this.y += this.vy; this.flickerTicker++; 
        if (this.x < 0 || this.x > 500 || this.y < 0 || this.y > 500) { this.isDead = true; this.hitWall = true; }
    }
    draw(ctx) {
        if (this.type.startsWith('web')) {
            ctx.save(); ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2);
            ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.shadowBlur = 10 * scaleFactor; ctx.shadowColor = "#ffffff"; ctx.restore();
        } else {
            ctx.save(); ctx.shadowBlur = (25 + Math.sin(this.flickerTicker * 0.3) * 10) * scaleFactor; ctx.shadowColor = "rgba(255, 69, 0, 0.9)";
            ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2); ctx.fillStyle = "#ff6b10"; ctx.fill();
            ctx.shadowBlur = 10 * scaleFactor; ctx.shadowColor = "#ffffff"; ctx.beginPath(); ctx.arc(this.x, this.y, this.radius * 0.6, 0, Math.PI*2);
            ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.restore();
        }
    }
}

// Particle System
let particles = [];
class Particle {
    constructor(x, y, color, speedBase = 2, size = 3) {
        this.x = x;
        this.y = y;
        this.color = color;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * speedBase + 1;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.radius = Math.random() * size * scaleFactor + 1;
        this.life = 1.0; 
        this.decay = Math.random() * 0.05 + 0.02; 
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
    }
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life); 
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.restore();
    }
}
function spawnParticles(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) particles.push(new Particle(x, y, color));
}

class Unit {
    constructor(name, hp, dmg, speed, color, startX, startY, playerIdx, isClone = false) {
        this.name = name; this.playerIdx = playerIdx; this.hp = hp; this.maxHp = hp; this.dmg = dmg;
        this.baseSpeed = speed; this.currentSpeedMult = 1.0; this.color = color; this.x = startX; this.y = startY; this.radius = 35 * scaleFactor;
        this.isClone = isClone;
        this.maxMana = (name === "Human") ? 30 : (name === "Naruto" ? 60 : (name === "Goku" ? 180 : (name === "Levi" ? 70 : 150)));
        this.mana = 0; this.isStunned = false; this.stunTimer = 0; this.isSkillActive = false; this.skillTimer = 0;
        this.nextHitExtraDmg = 0; this.passiveTimer = 0; this.painCollisionCount = 0; this.painPushTimer = 0; this.isPainPushing = false;
        this.gravityDmgTimer = 0; const angle = Math.random() * Math.PI * 2; this.dirX = Math.cos(angle); this.dirY = Math.sin(angle);
        this.isDead = false; this.hitTimer = 0; this.immuneTimer = 5;
        this.shrineRotationOffset = 0; this.kamehamehaAngle = 0; this.kamehamehaTickTimer = 0;
        this.passiveTriggered = false; this.domainDmgTimer = 0; this.painPushRadius = 0;
        this.isSwinging = false; this.swingTarget = null; this.webSlowTimer = 0;
        this.trailPositions = [];
    }
    startSwing(tx, ty) {
        this.isSwinging = true;
        let clampedX = Math.max(arenaLeft + this.radius + 5, Math.min(tx, arenaRight - this.radius - 5));
        let clampedY = Math.max(arenaTop + this.radius + 5, Math.min(ty, arenaBottom - this.radius - 5));
        this.swingTarget = {x: clampedX, y: clampedY}; this.nextHitExtraDmg = 10;
    }
    applyDamage(amount, type = 'physical') {
        if (this.isDead) return;
        if (this.name === "Levi" && this.isSkillActive) return; 

        let finalDmg = (this.name === "Gojo" && this.isSkillActive) ? 1 : amount;
        this.hp -= finalDmg; this.hitTimer = 5;
        if (type === 'physical' || type === 'kamehameha') playSFX(soundPunch); 
        else if (type === 'shrine' || type === 'slash') playSFX(soundSlash, 1.2); 
        else if (type === 'gravity') playSFX(soundGravityHit);
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
        if (this.webSlowTimer > 0) { this.webSlowTimer -= deltaTime; this.currentSpeedMult *= 0.1; }
        const dxC = 250 - this.x, dyC = 250 - this.y, dC = Math.sqrt(dxC**2 + dyC**2);
        if (dC < 300 && dC > 10 && !this.isSwinging) { this.x += (dxC / dC) * 0.5; this.y += (dyC / dC) * 0.5; }
        if (!this.isDead && !this.isClone) {
            if (this.name === "Naruto") { const clones = allUnits.filter(u => u.isClone && u.playerIdx === this.playerIdx && !u.isDead).length; this.currentSpeedMult += (clones * 0.08); }
            if (this.name === "Gojo") { this.currentSpeedMult += 0.3; const enemyNear = allUnits.some(u => u.playerIdx !== this.playerIdx && !u.isDead && Math.sqrt((u.x-this.x)**2 + (u.y-this.y)**2) < 100 + u.radius); if (enemyNear) this.currentSpeedMult += 0.65; }
            if (this.name === "Sukuna") { this.passiveTimer += deltaTime; if (this.passiveTimer >= 5000) { const target = allUnits.find(u => u.playerIdx !== this.playerIdx && !u.isDead); if (target) { projectiles.push(new Projectile(this.x, this.y, target.x, target.y, 7, this.playerIdx, 'normal')); playSFX(voiceSukunaArrow); } this.passiveTimer = 0; } }
            if (this.name === "Spider") {
                this.passiveTimer += deltaTime;
                if (this.passiveTimer >= 5000 && !this.isSwinging) {
                    let closest = null, minDist = Infinity;
                    allUnits.forEach(u => { if (u.playerIdx !== this.playerIdx && !u.isDead) { let d = Math.sqrt((u.x-this.x)**2 + (u.y-this.y)**2); if (d < minDist) { minDist = d; closest = u; } } });
                    if (closest) { projectiles.push(new Projectile(this.x, this.y, closest.x, closest.y, 0, this.playerIdx, 'web_passive')); playSFX(sfxSpiderPassive, 0.8); }
                    this.passiveTimer = 0;
                }
                if (this.isSwinging && this.swingTarget) {
                    const dx = this.swingTarget.x - this.x, dy = this.swingTarget.y - this.y, dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist < 15) { this.isSwinging = false; this.nextHitExtraDmg = 0; } else { this.dirX = dx / dist; this.dirY = dy / dist; this.currentSpeedMult = 4.0; }
                }
            }
            if (this.name === "Levi") {
                let closest = null, minDist = Infinity;
                allUnits.forEach(u => { if (u.playerIdx !== this.playerIdx && !u.isDead) { let d = Math.sqrt((u.x-this.x)**2 + (u.y-this.y)**2); if (d < minDist) { minDist = d; closest = u; } } });
                if (closest) {
                    const dxTarget = closest.x - this.x, dyTarget = closest.y - this.y, distTarget = Math.sqrt(dxTarget*dxTarget + dyTarget*dyTarget);
                    if (distTarget > 0) {
                        const turnRate = 0.03;
                        this.dirX += ((dxTarget/distTarget) - this.dirX) * turnRate;
                        this.dirY += ((dyTarget/distTarget) - this.dirY) * turnRate;
                        const cDist = Math.sqrt(this.dirX**2 + this.dirY**2);
                        this.dirX /= cDist; this.dirY /= cDist;
                    }
                }
                this.currentSpeedMult = this.isSkillActive ? 3.0 : 1.0; 
            }
            if (this.name === "Pain") { 
                this.gravityDmgTimer += deltaTime; 
                if (this.isPainPushing || this.isSkillActive) {
                    this.painPushRadius += (this.isSkillActive ? 25 : 15); if (this.painPushRadius > (this.isSkillActive ? 450 : 150)) this.painPushRadius = 0;
                } else { this.painPushRadius -= 5; if (this.painPushRadius < 0) this.painPushRadius = 90; }
                if (this.isPainPushing) { this.painPushTimer -= deltaTime; if (this.painPushTimer <= 0) { this.isPainPushing = false; this.painCollisionCount = 0; } } 
                const pushRadius = this.isSkillActive ? 450 : 150, interval = this.isSkillActive ? 600 : 400; 
                allUnits.forEach(u => { 
                    if (u.playerIdx !== this.playerIdx && !u.isDead) { 
                        const dx = u.x - this.x, dy = u.y - this.y, dist = Math.sqrt(dx*dx + dy*dy);
                        if (this.isSkillActive || this.isPainPushing) { if (dist < pushRadius + u.radius && dist > 0) { u.x += (dx/dist) * (this.isSkillActive ? 18.0 : 12.0); u.y += (dy/dist) * (this.isSkillActive ? 18.0 : 12.0); if (this.gravityDmgTimer >= interval) u.applyDamage(2, 'gravity'); } }
                        else { if (dist < 90 + u.radius && dist > this.radius + u.radius) { u.x -= (dx/dist) * 4.0; u.y -= (dy/dist) * 4.0; if (this.gravityDmgTimer >= interval) u.applyDamage(2, 'gravity'); } } 
                    } 
                }); 
                if (this.gravityDmgTimer >= interval) this.gravityDmgTimer = 0; 
            }
        }
        allUnits.forEach(other => { if (other.name === "Gojo" && !other.isDead && other.playerIdx !== this.playerIdx) { const d = Math.sqrt((this.x - other.x)**2 + (this.y - other.y)**2); if (d < 100 + this.radius) { this.currentSpeedMult *= 0.1; } } });
        if (this.skillTimer > 0) { 
            this.skillTimer -= deltaTime; 
            if (this.name === "Sukuna") { 
                this.shrineRotationOffset += 0.05; this.domainDmgTimer += deltaTime; 
                if (this.domainDmgTimer >= 100) { 
                    allUnits.forEach(u => { if (u.playerIdx !== this.playerIdx && !u.isDead) { if (Math.sqrt((u.x-this.x)**2+(u.y-this.y)**2) < 250+u.radius) u.applyDamage(2, 'shrine'); } }); 
                    this.domainDmgTimer = 0; 
                } 
            } 
            if (this.name === "Goku" && this.isSkillActive) {
                this.currentSpeedMult *= 0.20; 
                let t = allUnits.reduce((closest, u) => { if (u.playerIdx === this.playerIdx || u.isDead) return closest; const d = Math.sqrt((u.x-this.x)**2 + (u.y-this.y)**2); return (!closest || d < closest.d) ? {u, d} : closest; }, null);
                if (t) { const tA = Math.atan2(t.u.y - this.y, t.u.x - this.x); let aD = tA - this.kamehamehaAngle; while (aD < -Math.PI) aD += Math.PI * 2; while (aD > Math.PI) aD -= Math.PI * 2; this.kamehamehaAngle += aD * 0.0144; }
                this.kamehamehaTickTimer += deltaTime;
                if (this.kamehamehaTickTimer >= 200) { allUnits.forEach(u => { if (u.playerIdx === this.playerIdx || u.isDead) return; const dx = u.x - this.x, dy = u.y - this.y; const lx = dx * Math.cos(-this.kamehamehaAngle) - dy * Math.sin(-this.kamehamehaAngle); const ly = dx * Math.sin(-this.kamehamehaAngle) + dy * Math.cos(-this.kamehamehaAngle); if (lx > this.radius && lx < 1000 && Math.abs(ly) < (55 * scaleFactor + u.radius)) u.applyDamage(4, 'kamehameha'); }); this.kamehamehaTickTimer = 0; }
            }
            if (this.name === "Levi" && this.isSkillActive) {
                if (Math.random() < 0.2) playSFX(sfxLeviUlti, 0.4);
            }
            if (this.skillTimer <= 0) { this.isSkillActive = false; } 
        }

        if (this.name === "Levi" && this.isSkillActive) {
            this.trailPositions.push({ x: this.x, y: this.y });
            if (this.trailPositions.length > 15) this.trailPositions.shift();
        } else if (this.trailPositions.length > 0) {
            this.trailPositions.shift();
        }

        if (!this.isClone && !this.isSkillActive) { this.mana = Math.min(this.maxMana, this.mana + (10 * (deltaTime / 1000))); if (this.mana >= this.maxMana) this.useSkill(); }
        let sS = (this.name === "Gojo" && this.isSkillActive) ? 8.0 : this.currentSpeedMult; 
        this.x += this.dirX * this.baseSpeed * sS * 5; this.y += this.dirY * this.baseSpeed * sS * 5;
        let hitWall = false;
        if (this.x - this.radius < arenaLeft) { this.x = arenaLeft + this.radius; this.dirX *= -1; hitWall = true; spawnParticles(arenaLeft, this.y, '#ffffff', 5); } 
        if (this.x + this.radius > arenaRight) { this.x = arenaRight - this.radius; this.dirX *= -1; hitWall = true; spawnParticles(arenaRight, this.y, '#ffffff', 5); } 
        if (this.y - this.radius < arenaTop) { this.y = arenaTop + this.radius; this.dirY *= -1; hitWall = true; spawnParticles(this.x, arenaTop, '#ffffff', 5); } 
        if (this.y + this.radius > arenaBottom) { this.y = arenaBottom - this.radius; this.dirY *= -1; hitWall = true; spawnParticles(this.x, arenaBottom, '#ffffff', 5); }
        if (hitWall) { playSFX(soundWall); if (this.name === "Spider" && this.isSwinging) { this.isSwinging = false; this.nextHitExtraDmg = 0; } }
    }
    useSkill() {
        this.mana = 0; 
        if (this.name === "Naruto") { playSFX(sfxNarutoUlti, 1); for (let i = 0; i < 2; i++) { const nc = new Unit("Clone", 10, 3, this.baseSpeed, this.color, this.x, this.y, this.playerIdx, true); const a = Math.random() * Math.PI * 2; nc.dirX = Math.cos(a); nc.dirY = Math.sin(a); nc.x += nc.dirX * 15; nc.y += nc.dirY * 15; allUnits.push(nc); } } 
        else if (this.name === "Gojo") { playSFX(voiceGojoUlti, 1.5); this.hp = Math.min(this.maxHp, this.hp + 8); this.isSkillActive = true; this.skillTimer = 3000; allUnits.forEach(u => { if (u.playerIdx !== this.playerIdx) { u.isStunned = true; u.stunTimer = 3000; } }); } 
        else if (this.name === "Human") { this.nextHitExtraDmg = 3; this.isSkillActive = true; } 
        else if (this.name === "Sukuna") { playSFX(voiceSukunaAlt, 3.5); this.isSkillActive = true; this.skillTimer = 3000; this.domainDmgTimer = 0; } 
        else if (this.name === "Pain") { playSFX(voicePainUlti, 1.5); this.isSkillActive = true; this.skillTimer = 4000; this.gravityDmgTimer = 0; }
        else if (this.name === "Goku") { playSFX(voiceGokuUlti, 1.2); this.isSkillActive = true; this.skillTimer = 3000; let t = allUnits.reduce((closest, u) => { if (u.playerIdx === this.playerIdx || u.isDead) return closest; const d = Math.sqrt((u.x-this.x)**2 + (u.y-this.y)**2); return (!closest || d < closest.d) ? {u, d} : closest; }, null); this.kamehamehaAngle = t ? Math.atan2(t.u.y - this.y, t.u.x - this.x) : Math.random()*Math.PI*2; }
        else if (this.name === "Spider") {
            playSFX(sfxSpiderUlti, 1.5); this.isSkillActive = true; this.skillTimer = 500;
            for(let i=0; i<24; i++) { const angle = (Math.PI * 2 / 24) * i; projectiles.push(new Projectile(this.x, this.y, this.x + Math.cos(angle)*100, this.y + Math.sin(angle)*100, 3, this.playerIdx, 'web_ulti')); }
        }
        else if (this.name === "Levi") { playSFX(sfxLeviUlti, 1.5); this.isSkillActive = true; this.skillTimer = 3000; }
    }
    checkCollision(other) {
        if (this.isDead || other.isDead) return;
        const dx = other.x - this.x, dy = other.y - this.y, dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < this.radius + other.radius) {
            if (this.playerIdx !== other.playerIdx && this.immuneTimer <= 0 && other.immuneTimer <= 0) {
                if (this.name === "Pain" && !this.isPainPushing && !this.isSkillActive) { this.painCollisionCount++; if (this.painCollisionCount >= 4) { playSFX(voicePainPassive, 1.2); this.isPainPushing = true; this.painPushTimer = 1500; } }
                if (other.name === "Pain" && !other.isPainPushing && !other.isSkillActive) { other.painCollisionCount++; if (other.painCollisionCount >= 4) { playSFX(voicePainPassive, 1.2); other.isPainPushing = true; other.painPushTimer = 1500; } }
                
                this.applyDamage(other.dmg + (other.nextHitExtraDmg || 0), other.name === "Levi" && other.isSkillActive ? 'slash' : 'physical'); 
                other.applyDamage(this.dmg + (this.nextHitExtraDmg || 0), this.name === "Levi" && this.isSkillActive ? 'slash' : 'physical');
                
                if (this.name === "Human" || other.name === "Human") { this.nextHitExtraDmg = 0; this.isSkillActive = false; if (other.name === "Human") { other.nextHitExtraDmg = 0; other.isSkillActive = false; } }
                if (this.name === "Spider" && this.isSwinging) { this.isSwinging = false; this.nextHitExtraDmg = 0; }
                if (other.name === "Spider" && other.isSwinging) { other.isSwinging = false; other.nextHitExtraDmg = 0; }
                this.immuneTimer = 5; other.immuneTimer = 5;
            }
            let skipBounce = false;
            if ((this.name === "Levi" && this.isSkillActive) || (other.name === "Levi" && other.isSkillActive)) skipBounce = true;
            if (!skipBounce) {
                const nx = dx / dist, ny = dy / dist, d1 = this.dirX * nx + this.dirY * ny; this.dirX -= 2 * d1 * nx; this.dirY -= 2 * d1 * ny;
                const d2 = other.dirX * (-nx) + other.dirY * (-ny); other.dirX -= 2 * d2 * (-nx); other.dirY -= 2 * d2 * (-ny);
                const ov = (this.radius + other.radius) - dist; this.x -= nx * (ov / 2); this.y -= ny * (ov / 2); other.x += nx * (ov / 2); other.y += ny * (ov / 2);
            }
        }
    }
    draw(ctx) {
        if (this.isDead) return;

        if (this.name === "Levi" && this.trailPositions.length > 1) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(this.trailPositions[0].x, this.trailPositions[0].y);
            for (let i = 1; i < this.trailPositions.length; i++) {
                ctx.lineTo(this.trailPositions[i].x, this.trailPositions[i].y);
            }
            ctx.strokeStyle = "rgba(200, 230, 255, 0.6)"; 
            ctx.lineWidth = this.radius * 1.5; 
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.shadowBlur = 15;
            ctx.shadowColor = "#74b9ff";
            ctx.stroke();
            ctx.restore();
        }

        if (this.name === "Spider" && this.isSwinging && this.swingTarget) {
            ctx.save(); ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.swingTarget.x, this.swingTarget.y);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.8)"; ctx.lineWidth = 3 * scaleFactor; ctx.stroke(); ctx.restore();
        }
        if (this.name === "Pain") { 
            ctx.save(); ctx.beginPath(); ctx.arc(this.x, this.y, this.painPushRadius, 0, Math.PI*2); 
            if (this.isSkillActive || this.isPainPushing) {
                let grad = ctx.createRadialGradient(this.x, this.y, this.radius, this.x, this.y, this.painPushRadius);
                grad.addColorStop(0, "rgba(180, 0, 255, 0.6)"); grad.addColorStop(1, "rgba(180, 0, 255, 0)");
                ctx.fillStyle = grad; ctx.fill(); ctx.strokeStyle = "rgba(200, 50, 255, 0.8)"; ctx.lineWidth = 3; ctx.stroke();
            } else { ctx.strokeStyle = "rgba(180, 0, 255, 0.9)"; ctx.lineWidth = 6 * scaleFactor; ctx.setLineDash([12, 15]); ctx.lineDashOffset = -globalTicker * 2; ctx.stroke(); ctx.fillStyle = "rgba(150, 0, 255, 0.15)"; ctx.beginPath(); ctx.arc(this.x, this.y, 90, 0, Math.PI*2); ctx.fill(); }
            ctx.restore();
        }
        if (this.name === "Gojo") { 
            const rad = 100 + Math.sin(globalTicker * 0.05) * 10;
            let grd = ctx.createRadialGradient(this.x, this.y, this.radius, this.x, this.y, rad);
            grd.addColorStop(0, "rgba(0, 255, 255, 0.2)"); grd.addColorStop(1, "rgba(0, 255, 255, 0)");
            ctx.beginPath(); ctx.arc(this.x, this.y, rad, 0, Math.PI*2); ctx.fillStyle = grd; ctx.fill();
            ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(globalTicker * 0.02); ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI*2); ctx.strokeStyle = "rgba(0, 255, 255, 0.4)"; ctx.lineWidth = 2; ctx.setLineDash([10, 20]); ctx.stroke(); ctx.restore(); 
        }
        if (this.name === "Sukuna" && this.isSkillActive) { 
            ctx.beginPath(); ctx.arc(this.x, this.y, 250, 0, Math.PI * 2); ctx.fillStyle = "rgba(108, 0, 0, 0.2)"; ctx.fill();
            ctx.save(); ctx.beginPath(); ctx.arc(this.x, this.y, 250, 0, Math.PI * 2); ctx.strokeStyle = "rgba(139, 0, 0, 0.8)"; ctx.lineWidth = 4 * scaleFactor; ctx.setLineDash([20, 15]); ctx.lineDashOffset = -this.shrineRotationOffset * 35; ctx.stroke(); ctx.restore();
        }
        if (this.name === "Goku" && this.hp < (this.maxHp * 0.5)) {
            ctx.save(); ctx.shadowBlur = (25 + Math.sin(globalTicker * 0.15) * 10) * scaleFactor; ctx.shadowColor = "#00f2ff"; ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.strokeStyle = "#00f2ff"; ctx.lineWidth = 4 * scaleFactor; ctx.stroke(); ctx.restore();
        }
        if (this.isSkillActive && this.name === "Goku") {
            ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.kamehamehaAngle); ctx.shadowBlur = 40 * scaleFactor; ctx.shadowColor = "#00c3ff";
            ctx.fillStyle = "rgba(0, 195, 255, 0.6)"; ctx.fillRect(0, -55, 1000, 110); ctx.fillStyle = "#ffffff"; ctx.shadowBlur = 15; ctx.fillRect(0, -19, 1000, 38); ctx.restore();
        }
        
        ctx.save(); 
        ctx.translate(this.x, this.y);
        ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.clip();
        
        const img = (this.name === "Clone" || this.name === "Naruto") ? charImages["Naruto"] : charImages[this.name];
        if (img && img.complete && img.naturalWidth !== 0) {
            ctx.drawImage(img, -this.radius, -this.radius, this.radius * 2, this.radius * 2);
        } else { 
            ctx.fillStyle = this.color; 
            ctx.fillRect(-this.radius, -this.radius, this.radius * 2, this.radius * 2);
        }
        
        if (this.hitTimer > 0) { ctx.fillStyle = "rgba(255, 255, 255, 0.5)"; ctx.fillRect(-this.radius, -this.radius, this.radius * 2, this.radius * 2); }
        ctx.restore(); 
        
        if (this.name === "Levi" && this.isSkillActive) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(globalTicker * 0.6); 
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 10, 0, Math.PI * 0.6);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
            ctx.lineWidth = 6 * scaleFactor;
            ctx.lineCap = "round";
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 18, Math.PI, Math.PI * 1.6);
            ctx.strokeStyle = "rgba(116, 185, 255, 0.9)";
            ctx.lineWidth = 4 * scaleFactor;
            ctx.lineCap = "round";
            ctx.stroke();
            ctx.restore();
        }

        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.strokeStyle = "white"; ctx.lineWidth = 2 * scaleFactor; ctx.stroke();
        
        if (this.isStunned) {
            ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(-globalTicker * 0.1); ctx.beginPath(); ctx.arc(0, 0, this.radius + 10, 0, Math.PI * 2); ctx.strokeStyle = "#ffea00"; ctx.lineWidth = 4; ctx.setLineDash([15, 10]); ctx.stroke();
            ctx.font = `${16 * scaleFactor}px 'Poppins', sans-serif`; ctx.fillText("⭐", 0, -(this.radius + 15)); ctx.fillText("⭐", 0, (this.radius + 15)); ctx.restore();
            ctx.fillStyle = "rgba(0, 0, 0, 0.5)"; ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill(); 
        }
        if (this.webSlowTimer > 0) {
            ctx.save(); ctx.beginPath(); ctx.arc(this.x, this.y, this.radius + 5, 0, Math.PI*2); ctx.strokeStyle = "rgba(255, 255, 255, 0.8)"; ctx.setLineDash([5, 5]); ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
        }
        let hpVal = Math.round(Math.max(0, this.hp)); ctx.font = `bold ${22 * scaleFactor}px 'Poppins', sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.strokeStyle = "black"; ctx.lineWidth = 4 * scaleFactor; ctx.strokeText(hpVal, this.x, this.y); ctx.fillStyle = "white"; ctx.fillText(hpVal, this.x, this.y);
    }
}

function adjustScaling() { scaleFactor = (window.innerWidth < 600) ? 0.6 : 1.0; }

function updateSkillInfo(pIdx, charName) {
    const d = skillDetails[charName]; const box = document.getElementById(`p${pIdx+1}-skill-info`);
    if (box && d) {
        box.innerHTML = `
            <div style="border-bottom: 1px solid #555; padding-bottom: 4px; margin-bottom: 6px;"><b style="font-size: 13px; color: #fff; font-family: 'Poppins', sans-serif;">${charName.toUpperCase()}</b></div>
            <div style="margin-bottom: 6px; font-family: 'Poppins', sans-serif;"><b style="color: #0fbcf9;">PASSIVE: ${d.passive.toUpperCase()}</b><br><span style="color: #eee; display: block; margin-top: 2px;">${d.pDesc}</span></div>
            <div style="font-family: 'Poppins', sans-serif;"><b style="color: #ff4757;">ULTIMATE: ${d.ulti.toUpperCase()}</b><br><span style="color: #eee; display: block; margin-top: 2px;">${d.uDesc}</span></div>`;
    }
}

function injectChars() { 
    const panels = document.querySelectorAll('.char-options'); 
    panels.forEach((p, i) => { 
        p.innerHTML = ''; const sel = document.createElement('select'); sel.className = 'char-select'; sel.style.cssText = "padding: 8px; width: 100%; background: #222; color: #fff; border: 1px solid #555; border-radius: 4px; font-weight: bold; margin-bottom: 10px; cursor: pointer; font-family: 'Poppins', sans-serif;";
        Object.keys(charColors).forEach(name => { const opt = document.createElement('option'); opt.value = name; opt.innerText = name.toUpperCase(); if(selectedChars[i] === name) opt.selected = true; sel.appendChild(opt); }); 
        sel.onchange = (e) => { if (gameStarted && !isPaused) { sel.value = selectedChars[i]; return; } selectChar(i, e.target.value); };
        p.appendChild(sel); const infoBox = document.createElement('div'); infoBox.id = `p${i+1}-skill-info`; infoBox.style.cssText = "background: rgba(0,0,0,0.6); padding: 10px; border-radius: 5px; border: 1px solid #444; font-size: 11px; text-align: left; font-family: 'Poppins', sans-serif;";
        p.appendChild(infoBox); updateSkillInfo(i, selectedChars[i]);
        if (i === 0) {
            const btnWrapper = document.createElement('div'); btnWrapper.style.cssText = "display: flex; gap: 10px; margin-top: 10px; width: 100%; justify-content: space-between;";
            if (startBtn) { startBtn.className = 'btn-main'; startBtn.style.flex = "1"; startBtn.style.padding = "10px"; startBtn.style.fontSize = "12px"; startBtn.style.fontFamily = "'Poppins', sans-serif"; btnWrapper.appendChild(startBtn); }
            if (pauseBtn) { pauseBtn.className = 'btn-main'; pauseBtn.style.flex = "1"; pauseBtn.style.padding = "10px"; pauseBtn.style.fontSize = "12px"; pauseBtn.style.fontFamily = "'Poppins', sans-serif"; btnWrapper.appendChild(pauseBtn); }
            p.appendChild(btnWrapper);
        }
    }); 
}

window.selectChar = function(pIdx, char) { if (gameStarted && !isPaused) return; selectedChars[pIdx] = char; updateSkillInfo(pIdx, char); };

function updateUI() { 
    if (gameStarted) {
        const p1 = allUnits.find(u => u.playerIdx === 0 && !u.isClone), p2 = allUnits.find(u => u.playerIdx === 1 && !u.isClone);
        if(p1) document.querySelectorAll('.stat-box-p1 .char-name, #p1-stat-name, .player1-stat-name, #p1-char-name').forEach(el => { el.innerText = p1.name.toUpperCase(); el.style.fontFamily = "'Poppins', sans-serif"; });
        if(p2) document.querySelectorAll('.stat-box-p2 .char-name, #p2-stat-name, .player2-stat-name, #p2-char-name').forEach(el => { el.innerText = p2.name.toUpperCase(); el.style.fontFamily = "'Poppins', sans-serif"; });
    }
    allUnits.forEach(u => { 
        if (u.isClone) return; const id = u.playerIdx === 0 ? "p1" : "p2";
        const hpBar = document.getElementById(`${id}-hp-bar`), manaBar = document.getElementById(`${id}-mana-bar`), hpText = document.getElementById(`${id}-hp-text`), manaText = document.getElementById(`${id}-mana-text`);
        if (hpBar) hpBar.style.width = Math.max(0, (u.hp / u.maxHp) * 100) + "%"; if (manaBar) manaBar.style.width = (u.mana / u.maxMana) * 100 + "%";
        if (hpText) { hpText.innerText = `${Math.round(u.hp)} / ${u.maxHp}`; hpText.style.fontFamily = "'Poppins', sans-serif"; }
        if (manaText) { manaText.innerText = `${Math.round(u.mana)} / ${u.maxMana}`; manaText.style.fontFamily = "'Poppins', sans-serif"; }
    }); 
}

function startActualGame() { 
    adjustScaling(); allUnits = []; projectiles = []; particles = [];
    selectedChars.forEach((char, i) => { allUnits.push(new Unit(char, 100, 5, 0.9, charColors[char], i === 0 ? 80 : 420, 250, i)); }); 
    gameStarted = true; isPaused = false; if (overlay) { overlay.style.opacity = "0"; overlay.style.pointerEvents = "none"; }
    if (pauseBtn) pauseBtn.style.display = "block"; if (startBtn) startBtn.innerText = "RESTART"; lastTime = performance.now(); 
}

function update(time) { 
    if (isPaused) return; const dt = time - lastTime; lastTime = time; ctx.clearRect(0, 0, canvas.width, canvas.height); globalTicker++;
    if (bgImage.complete && bgImage.naturalWidth !== 0) { ctx.drawImage(bgImage, arenaLeft, arenaTop, arenaRight - arenaLeft, arenaBottom - arenaTop); ctx.fillStyle = "rgba(0, 0, 0, 0.4)"; ctx.fillRect(arenaLeft, arenaTop, arenaRight - arenaLeft, arenaBottom - arenaTop); }
    else { ctx.fillStyle = '#1e272e'; ctx.fillRect(arenaLeft, arenaTop, arenaRight - arenaLeft, arenaBottom - arenaTop); }
    ctx.save();
    const gs = allUnits.find(u => u.name === "Gojo" && u.isSkillActive); if (gs) { ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillRect(arenaLeft, arenaTop, arenaRight - arenaLeft, arenaBottom - arenaTop); }
    
    allUnits.forEach(u => {
        if (u.isClone && !u.isDead) {
            const parent = allUnits.find(p => p.playerIdx === u.playerIdx && !p.isClone);
            if (!parent || parent.isDead) { u.isDead = true; u.hp = 0; }
        }
    });

    projectiles = projectiles.filter(p => !p.isDead);
    projectiles.forEach(p => { 
        p.update(); p.draw(ctx); 
        if (p.type === 'web_passive' && p.hitWall) { const owner = allUnits.find(u => u.playerIdx === p.ownerIdx && !u.isClone && !u.isDead); if (owner) owner.startSwing(p.x, p.y); }
        if (!p.isDead) {
            allUnits.forEach(u => { 
                if (u.playerIdx !== p.ownerIdx && !u.isDead && Math.sqrt((u.x-p.x)**2+(u.y-p.y)**2) < u.radius+p.radius) { 
                    if (p.type === 'web_passive') { const owner = allUnits.find(o => o.playerIdx === p.ownerIdx && !o.isClone && !o.isDead); if (owner) owner.startSwing(u.x, u.y); }
                    else if (p.type === 'web_ulti') { u.webSlowTimer = 3000; u.applyDamage(p.dmg); } else { u.applyDamage(p.dmg); }
                    p.isDead=true; 
                } 
            }); 
        }
    }); 
    
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
        p.update();
        p.draw(ctx);
    });

    for (let i = 0; i < allUnits.length; i++) { for (let j = i + 1; j < allUnits.length; j++) { allUnits[i].checkCollision(allUnits[j]); } allUnits[i].update(dt); allUnits[i].draw(ctx); }
    ctx.restore();
    if (gameStarted) {
        updateUI(); const p1_u = allUnits.filter(u => u.playerIdx === 0 && !u.isClone && !u.isDead), p2_u = allUnits.filter(u => u.playerIdx === 1 && !u.isClone && !u.isDead);
        if (p1_u.length === 0 || p2_u.length === 0) {
            if (overlay) { overlay.style.opacity = "1"; overlay.style.pointerEvents = "all"; }
            let wN = p1_u.length > 0 ? allUnits.find(u => u.playerIdx === 0 && !u.isClone).name : (p2_u.length > 0 ? allUnits.find(u => u.playerIdx === 1 && !u.isClone).name : "");
            if (overlayMsg) overlayMsg.innerHTML = wN ? `<span style="font-size: 48px; color: ${charColors[wN]}; font-weight: bold; font-family: 'Poppins', sans-serif;">${wN.toUpperCase()} WIN</span>` : `<span style="font-size: 48px; color: #fff; font-weight: bold; font-family: 'Poppins', sans-serif;">DRAW</span>`;
            gameStarted = false; if (pauseBtn) pauseBtn.style.display = "none";
        }
    }
    animationId = requestAnimationFrame(update);
}
if (startBtn) startBtn.addEventListener('click', () => { if(animationId) cancelAnimationFrame(animationId); startActualGame(); requestAnimationFrame(update); });
if (pauseBtn) pauseBtn.addEventListener('click', () => { isPaused = !isPaused; if (isPaused) { if (overlay) { overlay.style.opacity = "1"; overlay.style.pointerEvents = "all"; } if (overlayMsg) { overlayMsg.innerText = "Paused"; overlayMsg.style.fontFamily = "'Poppins', sans-serif"; } pauseBtn.innerText = "RESUME"; } else { if (overlay) overlay.style.opacity = "0"; pauseBtn.innerText = "PAUSE"; lastTime = performance.now(); requestAnimationFrame(update); } });
injectChars(); adjustScaling(); requestAnimationFrame(update);
