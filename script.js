const canvas = document.getElementById('battleCanvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const overlay = document.getElementById('overlay');
const overlayMsg = document.getElementById('overlay-msg');
const tooltip = document.getElementById('skill-tooltip');

const BUILD_VER = "v1.5.3";

canvas.width = 500; canvas.height = 500;
const arenaTop = 15, arenaLeft = 15, arenaRight = 485, arenaBottom = 485;

// ========================================================
// ⚙️ ULTIMATE TUNING SECTION - EDIT DI SINI ANJING
// ========================================================

// 1. GLOBAL SETTINGS
const GLOBAL_GRAVITY_POWER = 0.5;
const GLOBAL_GRAVITY_RADIUS = 300;

// 2. GOJO TUNING
const GOJO_LIMITLESS_RADIUS = 100;
const GOJO_ULTI_STUN_DURATION = 4000;
const GOJO_ULTI_SPEED_MULT = 8.0;
const GOJO_ULTI_REDUCED_DMG = 1; // Damage yang diterima Gojo pas ulti

// 3. SUKUNA TUNING
const SUKUNA_ARROW_DAMAGE = 12;
const SUKUNA_DOMAIN_RADIUS = 250;
const SUKUNA_DOMAIN_DAMAGE = 2;
const SUKUNA_DOMAIN_DURATION = 3000;

// 4. PAIN TUNING
const PAIN_PASSIVE_RADIUS = 90;
const PAIN_ULTI_RADIUS = 700;
const PAIN_ULTI_DURATION = 4000;
const PAIN_AREA_DAMAGE = 1;
const PAIN_ULTI_DAMAGE = 2;
const PAIN_ULTI_PUSH_POWER = 6.0;    // Kekuatan dorongan Shinra Tensei
const PAIN_PASSIVE_PULL_POWER = 2.0; // Kekuatan tarikan magnet pasif

// 5. HUMAN & NARUTO
const HUMAN_BUFF_DAMAGE = 3;
const NARUTO_CLONE_HP = 10;
const NARUTO_CLONE_DMG = 3;

// 6. AUDIO AMPLIFIER
let audioCtx;
const soundPunch = new Audio('audio/punch(1).mp3');   soundPunch.volume = 0.2; 
const soundSlash = new Audio('audio/sword-slash-1.mp3'); soundSlash.volume = 0.5; 
const soundGravityHit = new Audio('audio/punch(1).mp3'); soundGravityHit.volume = 0.3; 

const voiceSukunaArrow = new Audio('audio/sukuna_fire.mp3');   voiceSukunaArrow.volume = 0.6;
const voiceSukunaUlti  = new Audio('audio/sukuna_domain.mp3'); voiceSukunaUlti.volume = 1.0; 
const voiceGojoUlti    = new Audio('audio/gojo_domain.mp3');   voiceGojoUlti.volume = 1.0; 
const voicePainPassive = new Audio('audio/pain_passive_push.mp3'); voicePainPassive.volume = 1.0; 
const voicePainUlti    = new Audio('audio/pain_ulti.mp3');     voicePainUlti.volume = 0.7; 
const sfxNarutoUlti    = new Audio('audio/naruto_ulti.mp3');   sfxNarutoUlti.volume = 0.5;

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

let allUnits = [];
let projectiles = [];
let gameStarted = false;
let isPaused = false;
let animationId;
let selectedChars = ["Human", "Human"];
let lastTime = 0;

const charColors = { 'Human': '#3498db', 'Naruto': '#f39c12', 'Gojo': '#7f8c8d', 'Sukuna': '#6c3226', 'Pain': '#e67e22' };

const skillDetails = {
    'Human': { passive: 'Spam Mastery', desc: 'Mana rendah (30).', ulti: 'Physical Burst: +3 DMG.' },
    'Naruto': { passive: 'Infinite Army', desc: 'Tidak ada batas klon.', ulti: 'Kage Bunshin: 2 Klon.' },
    'Gojo': { passive: 'Infinity Speed', desc: 'Speed +65% jika musuh dekat.', ulti: 'Unlimited Void: Stun & DMG Resistance.' },
    'Sukuna': { passive: 'Fire Arrow', desc: 'Panah otomatis (12 DMG).', ulti: 'Malevolent Shrine: Area DMG.' },
    'Pain': { passive: 'Reactive Push', desc: 'Push tiap 4 benturan.', ulti: 'Almighty Push.' }
};

class Projectile {
    constructor(x, y, targetX, targetY, dmg, ownerIdx) {
        this.x = x; this.y = y; this.dmg = dmg; this.ownerIdx = ownerIdx;
        this.radius = 8; this.speed = 7;
        const dx = targetX - x, dy = targetY - y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        this.vx = (dx/dist) * this.speed; this.vy = (dy/dist) * this.speed;
        this.isDead = false;
    }
    update() { this.x += this.vx; this.y += this.vy; if (this.x < 0 || this.x > 500 || this.y < 0 || this.y > 500) this.isDead = true; }
    draw(ctx) { ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2); ctx.fillStyle = "#ff6b10"; ctx.shadowBlur = 15; ctx.shadowColor = "red"; ctx.fill(); ctx.shadowBlur = 0; }
}

class Unit {
    constructor(name, hp, dmg, speed, color, startX, startY, playerIdx, isClone = false) {
        this.name = name; this.playerIdx = playerIdx; this.hp = hp; this.maxHp = hp; this.dmg = dmg;
        this.baseSpeed = speed; this.currentSpeedMult = 1.0; this.color = color; this.x = startX; this.y = startY; this.radius = 35;
        this.isClone = isClone;
        this.maxMana = (name === "Human") ? 30 : (name === "Naruto" ? 60 : 150);
        this.mana = 0; this.isStunned = false; this.stunTimer = 0; this.isSkillActive = false; this.skillTimer = 0;
        this.nextHitExtraDmg = 0; this.passiveTimer = 0;
        this.painCollisionCount = 0; this.painPushTimer = 0; this.isPainPushing = false;
        this.trailPositions = [];
        const angle = Math.random() * Math.PI * 2; this.dirX = Math.cos(angle); this.dirY = Math.sin(angle);
        this.isDead = false; this.hitTimer = 0; this.immuneTimer = 5;
    }

    applyDamage(amount, type = 'physical') {
        if (this.isDead) return;

        // --- UPDATE GOJO ULTI RESISTANCE v1.5.3 ---
        let finalDmg = amount;
        if (this.name === "Gojo" && this.isSkillActive) {
            finalDmg = GOJO_ULTI_REDUCED_DMG; // Hanya kena 1 damage
        }

        this.hp -= finalDmg;
        this.hitTimer = 5;
        
        if (type === 'physical') playSFX(soundPunch);
        else if (type === 'shrine') playSFX(soundSlash, 1.2); 
        else if (type === 'gravity') playSFX(soundGravityHit);

        if (!this.isClone && !this.isSkillActive) this.mana = Math.min(this.maxMana, this.mana + 5);
        if (this.hp <= 0) { this.hp = 0; this.isDead = true; }
    }

    update(deltaTime) {
        if (this.isDead) return;
        if (this.hitTimer > 0) this.hitTimer--;
        if (this.immuneTimer > 0) this.immuneTimer--;
        if (this.stunTimer > 0) { this.stunTimer -= deltaTime; if (this.stunTimer <= 0) this.isStunned = false; return; }

        this.currentSpeedMult = 1.0;

        const dxCenter = 250 - this.x;
        const dyCenter = 250 - this.y;
        const distCenter = Math.sqrt(dxCenter**2 + dyCenter**2);
        if (distCenter < GLOBAL_GRAVITY_RADIUS && distCenter > 10) {
            this.x += (dxCenter / distCenter) * GLOBAL_GRAVITY_POWER;
            this.y += (dyCenter / distCenter) * GLOBAL_GRAVITY_POWER;
        }

        if (!this.isDead && !this.isClone) {
            if (this.name === "Naruto") {
                const clones = allUnits.filter(u => u.isClone && u.playerIdx === this.playerIdx && !u.isDead).length;
                this.currentSpeedMult += (clones * 0.08);
            }
            if (this.name === "Gojo") {
                this.currentSpeedMult += 0.3;
                const enemyNear = allUnits.some(u => u.playerIdx !== this.playerIdx && !u.isDead && Math.sqrt((u.x-this.x)**2 + (u.y-this.y)**2) < GOJO_LIMITLESS_RADIUS + u.radius);
                if (enemyNear) this.currentSpeedMult += 0.65; 
            }
            if (this.name === "Sukuna") {
                this.passiveTimer += deltaTime;
                if (this.passiveTimer >= 5000) {
                    const target = allUnits.find(u => u.playerIdx !== this.playerIdx && !u.isDead);
                    if (target) {
                        projectiles.push(new Projectile(this.x, this.y, target.x, target.y, SUKUNA_ARROW_DAMAGE, this.playerIdx));
                        playSFX(voiceSukunaArrow); 
                    }
                    this.passiveTimer = 0;
                }
            }
            if (this.name === "Pain") {
                this.gravityDmgTimer += deltaTime;
                if (this.isPainPushing) { this.painPushTimer -= deltaTime; if (this.painPushTimer <= 0) { this.isPainPushing = false; this.painCollisionCount = 0; } }
                
                // --- UPDATE PAIN POWER v1.5.3 ---
                const r = this.isSkillActive ? PAIN_ULTI_RADIUS : PAIN_PASSIVE_RADIUS;
                const p = this.isSkillActive ? PAIN_ULTI_PUSH_POWER : (this.isPainPushing ? PAIN_ULTI_PUSH_POWER : PAIN_PASSIVE_PULL_POWER);
                const interval = this.isSkillActive ? 600 : 400;

                allUnits.forEach(u => {
                    if (u.playerIdx !== this.playerIdx && !u.isDead) {
                        const dx = this.x - u.x, dy = this.y - u.y, dist = Math.sqrt(dx*dx + dy*dy);
                        if (dist < r + u.radius) {
                            if (this.isSkillActive || this.isPainPushing) { u.x -= (dx/dist) * p; u.y -= (dy/dist) * p; }
                            else { if (dist > this.radius) { u.x += (dx/dist) * p; u.y += (dy/dist) * p; } }
                            if (this.gravityDmgTimer >= interval) u.applyDamage(this.isSkillActive ? PAIN_ULTI_DAMAGE : PAIN_AREA_DAMAGE, 'gravity'); 
                        }
                    }
                });
                if (this.gravityDmgTimer >= interval) this.gravityDmgTimer = 0;
            }
        }

        allUnits.forEach(other => {
            if (other.name === "Gojo" && !other.isDead && other.playerIdx !== this.playerIdx) {
                const d = Math.sqrt((this.x - other.x)**2 + (this.y - other.y)**2);
                if (d < GOJO_LIMITLESS_RADIUS + this.radius) { this.currentSpeedMult *= 0.1; }
            }
        });

        if (this.skillTimer > 0) {
            this.skillTimer -= deltaTime;
            if (this.name === "Sukuna") {
                this.domainDmgTimer += deltaTime;
                if (this.domainDmgTimer >= 100) {
                    allUnits.forEach(u => { if (u.playerIdx !== this.playerIdx && !u.isDead) { const d = Math.sqrt((u.x - this.x)**2 + (u.y - this.y)**2); if (d < SUKUNA_DOMAIN_RADIUS + u.radius) u.applyDamage(SUKUNA_DOMAIN_DAMAGE, 'shrine'); } });
                    this.domainDmgTimer = 0;
                }
            }
            if (this.skillTimer <= 0) this.isSkillActive = false;
        }

        if (!this.isClone && !this.isSkillActive) {
            this.mana = Math.min(this.maxMana, this.mana + (10 * (deltaTime / 1000)));
            if (this.mana >= this.maxMana) this.useSkill();
        }

        let speedScale = (this.name === "Gojo" && this.isSkillActive) ? GOJO_ULTI_SPEED_MULT : this.currentSpeedMult;
        this.x += this.dirX * this.baseSpeed * speedScale * 5; this.y += this.dirY * this.baseSpeed * speedScale * 5;

        if (this.name === "Gojo" && this.isSkillActive) { 
            this.trailPositions.push({x: this.x, y: this.y}); 
            if (this.trailPositions.length > 5) this.trailPositions.shift(); 
        } else this.trailPositions = [];

        if (this.x - this.radius < arenaLeft) { this.x = arenaLeft + this.radius; this.dirX *= -1; }
        if (this.x + this.radius > arenaRight) { this.x = arenaRight - this.radius; this.dirX *= -1; }
        if (this.y - this.radius < arenaTop) { this.y = arenaTop + this.radius; this.dirY *= -1; }
        if (this.y + this.radius > arenaBottom) { this.y = arenaBottom - this.radius; this.dirY *= -1; }
    }

    useSkill() {
        this.mana = 0;
        if (this.name === "Naruto") {
            playSFX(sfxNarutoUlti, 1);
            for (let i = 0; i < 2; i++) {
                const nc = new Unit("Clone", NARUTO_CLONE_HP, NARUTO_CLONE_DMG, this.baseSpeed, this.color, this.x, this.y, this.playerIdx, true);
                const a = Math.random() * Math.PI * 2; nc.dirX = Math.cos(a); nc.dirY = Math.sin(a);
                nc.x += nc.dirX * 15; nc.y += nc.dirY * 15; nc.immuneTimer = 5; allUnits.push(nc);
            }
        } 
        else if (this.name === "Gojo") { 
            playSFX(voiceGojoUlti, 1.5); 
            this.isSkillActive = true; this.skillTimer = GOJO_ULTI_STUN_DURATION; 
            allUnits.forEach(u => { if (u.playerIdx !== this.playerIdx) { u.isStunned = true; u.stunTimer = GOJO_ULTI_STUN_DURATION; } }); 
        }
        else if (this.name === "Human") { this.nextHitExtraDmg = HUMAN_BUFF_DAMAGE; this.isSkillActive = true; }
        else if (this.name === "Sukuna") { 
            playSFX(voiceSukunaUlti, 3.5); 
            this.isSkillActive = true; this.skillTimer = SUKUNA_DOMAIN_DURATION; this.domainDmgTimer = 0; 
        }
        else if (this.name === "Pain") { 
            playSFX(voicePainUlti, 1.5);
            this.isSkillActive = true; this.skillTimer = PAIN_ULTI_DURATION; 
        }
    }

    checkCollision(other) {
        if (this.isDead || other.isDead) return;
        const dx = other.x - this.x, dy = other.y - this.y, dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < this.radius + other.radius) {
            if (this.playerIdx !== other.playerIdx && this.immuneTimer <= 0 && other.immuneTimer <= 0) {
                if (this.name === "Pain" && !this.isPainPushing && !this.isSkillActive) { 
                    this.painCollisionCount++; 
                    if (this.painCollisionCount >= 4) { playSFX(voicePainPassive, 1.2); this.isPainPushing = true; this.painPushTimer = 1500; } 
                }
                if (other.name === "Pain" && !other.isPainPushing && !other.isSkillActive) { 
                    other.painCollisionCount++; 
                    if (other.painCollisionCount >= 4) { playSFX(voicePainPassive, 1.2); other.isPainPushing = true; other.painPushTimer = 1500; } 
                }
                
                // Tabrakan fisik - Gojo tidak lagi full immune tapi pakai damage reduksi di applyDamage
                this.applyDamage(other.dmg + (other.nextHitExtraDmg || 0), 'physical');
                other.applyDamage(this.dmg + (this.nextHitExtraDmg || 0), 'physical');
                
                if (this.name === "Human") { this.nextHitExtraDmg = 0; this.isSkillActive = false; }
                if (other.name === "Human") { other.nextHitExtraDmg = 0; other.isSkillActive = false; }
                if (!this.isClone && !this.isSkillActive) this.mana = Math.min(this.maxMana, this.mana + 6);
                if (!other.isClone && !other.isSkillActive) other.mana = Math.min(other.maxMana, other.mana + 6);
                this.hitTimer = 5; other.hitTimer = 5; this.immuneTimer = 5; other.immuneTimer = 5;
            }
            this.bounce(other, dx, dy, dist);
        }
    }

    bounce(other, dx, dy, dist) {
        const nx = dx / dist, ny = dy / dist;
        const d1 = this.dirX * nx + this.dirY * ny; this.dirX -= 2 * d1 * nx; this.dirY -= 2 * d1 * ny;
        const d2 = other.dirX * (-nx) + other.dirY * (-ny); other.dirX -= 2 * d2 * (-nx); other.dirY -= 2 * d2 * (-ny);
        const ov = (this.radius + other.radius) - dist; this.x -= nx * (ov / 2); this.y -= ny * (ov / 2); other.x += nx * (ov / 2); other.y += ny * (ov / 2);
    }

    draw(ctx) {
        if (this.isDead) return;
        if (this.name === "Pain" && !this.isDead) { ctx.beginPath(); ctx.arc(this.x, this.y, (this.isSkillActive ? PAIN_ULTI_RADIUS : PAIN_PASSIVE_RADIUS), 0, Math.PI*2); ctx.fillStyle = (this.isSkillActive || this.isPainPushing) ? "rgba(255, 255, 255, 0.25)" : "rgba(0, 0, 0, 0.15)"; ctx.fill(); }
        if (this.name === "Gojo" && !this.isDead) { ctx.beginPath(); ctx.arc(this.x, this.y, GOJO_LIMITLESS_RADIUS, 0, Math.PI*2); ctx.fillStyle = "rgba(0, 255, 255, 0.05)"; ctx.fill(); }
        if (this.isSkillActive && this.name === "Sukuna") { ctx.beginPath(); ctx.arc(this.x, this.y, SUKUNA_DOMAIN_RADIUS, 0, Math.PI * 2); ctx.fillStyle = "rgba(255, 0, 0, 0.15)"; ctx.fill(); }
        if (this.trailPositions.length > 0) { this.trailPositions.forEach((pos, i) => { ctx.beginPath(); ctx.arc(pos.x, pos.y, this.radius, 0, Math.PI*2); ctx.fillStyle = `rgba(149, 165, 166, ${(i+1)*0.04})`; ctx.fill(); }); }
        ctx.save(); if (this.isClone) ctx.globalAlpha = 0.6;
        let c = (this.name === "Gojo") ? "#7f8c8d" : (this.name === "Sukuna" ? "#5d0000" : (this.name === "Pain" ? "#e67e22" : this.color));
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = (this.hitTimer > 0) ? "white" : c; ctx.fill(); ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
        if (this.isStunned) { ctx.fillStyle = "yellow"; ctx.font = "20px Arial"; ctx.fillText("💫", this.x, this.y - 45); }
        ctx.fillStyle = this.hitTimer > 0 ? "black" : "white"; ctx.font = "bold 16px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(Math.round(Math.max(0, this.hp)), this.x, this.y);
    }
}

/* ... Fungsi UI & Core Game Start/Update tetap sama seperti versi sebelumnya ... */

function spawnMenuSim() { allUnits = []; allUnits.push(new Unit("Human", 100, 5, 0.3, charColors["Human"], 120, 250, 0)); allUnits.push(new Unit("Human", 100, 5, 0.3, charColors["Human"], 380, 250, 1)); }
function injectChars() { const panels = document.querySelectorAll('.char-options'); panels.forEach((p, i) => { p.innerHTML = ''; Object.keys(charColors).forEach(name => { const btn = document.createElement('button'); btn.className = `char-btn ${selectedChars[i] === name ? 'active' : ''}`; btn.innerText = name; btn.onclick = () => selectChar(i, name); btn.onmouseenter = (e) => showTooltip(name); btn.onmouseleave = hideTooltip; btn.onmousemove = moveTooltip; p.appendChild(btn); }); }); }
function showTooltip(name) { const data = skillDetails[name]; tooltip.innerHTML = `<b>${name}</b><i>Passive:</i> ${data.passive}<br><small>${data.desc}</small><br><br><i>Ultimate:</i> ${data.ulti}`; tooltip.style.opacity = 1; }
function hideTooltip() { tooltip.style.opacity = 0; }
function moveTooltip(e) { tooltip.style.left = (e.clientX + 15) + 'px'; tooltip.style.top = (e.clientY + 15) + 'px'; }
window.selectChar = function(pIdx, char) { if (gameStarted && !isPaused) return; selectedChars[pIdx] = char; injectChars(); document.getElementById(`p${pIdx+1}-name-display`).innerText = char.toUpperCase(); document.getElementById(`p${pIdx+1}-char-name`).innerText = char.toUpperCase(); };
function updateUI() { allUnits.forEach(u => { if (u.isClone) return; const id = u.playerIdx === 0 ? "p1" : "p2"; const hpB = document.getElementById(`${id}-hp-bar`); const hpWhite = document.getElementById(`${id}-hp-white`); const maB = document.getElementById(`${id}-mana-bar`); if(hpB) hpB.style.width = Math.max(0, (u.hp / u.maxHp) * 100) + "%"; if(hpWhite) hpWhite.style.width = Math.max(0, (u.hp / u.maxHp) * 100) + "%"; if(maB) maB.style.width = (u.mana / u.maxMana) * 100 + "%"; document.getElementById(`${id}-hp-text`).innerText = `${Math.round(u.hp)} / ${u.maxHp}`; document.getElementById(`${id}-mana-text`).innerText = `${Math.round(u.mana)} / ${u.maxMana}`; }); }
function startActualGame() { allUnits = []; projectiles = []; selectedChars.forEach((char, i) => { const sx = i === 0 ? 80 : 420; allUnits.push(new Unit(char, 100, 5, 0.9, charColors[char], sx, 250, i)); document.getElementById(`p${i+1}-char-name`).innerText = char.toUpperCase(); }); gameStarted = true; isPaused = false; overlay.style.opacity = "0"; overlay.style.pointerEvents = "none"; pauseBtn.style.display = "block"; startBtn.innerText = "RESTART"; lastTime = performance.now(); }
function update(time) { if (isPaused) return; const dt = time - lastTime; lastTime = time; ctx.clearRect(0, 0, canvas.width, canvas.height); const gs = allUnits.find(u => u.name === "Gojo" && u.isSkillActive); ctx.fillStyle = gs ? '#000000' : '#1e272e'; ctx.fillRect(arenaLeft, arenaTop, arenaRight - arenaLeft, arenaBottom - arenaTop); projectiles = projectiles.filter(p => !p.isDead); projectiles.forEach(p => { p.update(); p.draw(ctx); allUnits.forEach(u => { if (u.playerIdx !== p.ownerIdx && !u.isDead) { const d = Math.sqrt((u.x-p.x)**2+(u.y-p.y)**2); if (d < u.radius+p.radius) { u.applyDamage(p.dmg, 'shrine'); p.isDead=true; } } }); }); for (let i = 0; i < allUnits.length; i++) { for (let j = i + 1; j < allUnits.length; j++) { allUnits[i].checkCollision(allUnits[j]); } allUnits[i].update(dt); allUnits[i].draw(ctx); } if (gameStarted) updateUI(); if (gameStarted) { const p1 = allUnits.some(u => u.playerIdx === 0 && !u.isClone && !u.isDead); const p2 = allUnits.some(u => u.playerIdx === 1 && !u.isClone && !u.isDead); if (!p1 || !p2) { overlay.style.opacity = "1"; overlay.style.pointerEvents = "all"; overlayMsg.innerHTML = (p1 || p2 ? (p1 ? "P1 WINS" : "P2 WINS") : "DRAW") + `<br><span style="font-size:12px; color:#888;">${BUILD_VER}</span>`; gameStarted = false; pauseBtn.style.display = "none"; } } animationId = requestAnimationFrame(update); }
startBtn.addEventListener('click', () => { cancelAnimationFrame(animationId); startActualGame(); requestAnimationFrame(update); });
pauseBtn.addEventListener('click', () => { isPaused = !isPaused; if (isPaused) { overlay.style.opacity = "1"; overlay.style.pointerEvents = "all"; overlayMsg.innerHTML = `Game Paused<br><span style="font-size:12px; color:#888;">${BUILD_VER}</span>`; pauseBtn.innerText = "RESUME"; } else { overlay.style.opacity = "0"; overlay.style.pointerEvents = "none"; pauseBtn.innerText = "PAUSE"; lastTime = performance.now(); requestAnimationFrame(update); } });
injectChars(); spawnMenuSim(); requestAnimationFrame(update);
