const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const hpText = document.getElementById('hpText');
const waveText = document.getElementById('waveText');
const timeText = document.getElementById('timeText');
const scoreText = document.getElementById('scoreText');
const startPanel = document.getElementById('startPanel');
const upgradePanel = document.getElementById('upgradePanel');
const gameOverPanel = document.getElementById('gameOverPanel');
const startButton = document.getElementById('startButton');
const restartButton = document.getElementById('restartButton');
const soundButton = document.getElementById('soundButton');
const upgradeCards = document.getElementById('upgradeCards');
const resultTitle = document.getElementById('resultTitle');
const resultText = document.getElementById('resultText');

const keys = {};
let gameState = 'ready';
let lastTime = 0;
let bulletTimer = 0;
let waveTimer = 0;
let scoreTimer = 0;
let ambienceTimer = 0;
let animationId = null;

const player = {
  x: canvas.width / 2,
  y: canvas.height - 80,
  radius: 14,
  hp: 3,
  maxHp: 3,
  speed: 260,
  invincible: 0,
};

const boss = { x: canvas.width / 2, y: 100, scale: 6 };
let bullets = [];
let wave = 1;
let score = 0;
let waveDuration = 20;
let fireInterval = 1.1;
let bulletSpeed = 145;
let bulletCount = 8;

const audio = {
  ctx: null,
  masterGain: null,
  enabled: true,
};

function setupAudio() {
  if (audio.ctx) return;
  audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
  audio.masterGain = audio.ctx.createGain();
  audio.masterGain.gain.value = audio.enabled ? 0.7 : 0;
  audio.masterGain.connect(audio.ctx.destination);
}

function resumeAudio() {
  setupAudio();
  if (audio.ctx.state === 'suspended') audio.ctx.resume();
}

function setSoundEnabled(enabled) {
  audio.enabled = enabled;
  soundButton.textContent = enabled ? 'Sound ON' : 'Sound OFF';
  soundButton.classList.toggle('muted', !enabled);
  if (audio.masterGain) {
    const now = audio.ctx.currentTime;
    audio.masterGain.gain.cancelScheduledValues(now);
    audio.masterGain.gain.setTargetAtTime(enabled ? 0.7 : 0, now, 0.04);
  }
}

function playTone({ frequency, type = 'square', start = 0, duration = 0.2, volume = 0.12, detuneEnd = null }) {
  if (!audio.enabled) return;
  resumeAudio();
  const now = audio.ctx.currentTime + start;
  const osc = audio.ctx.createOscillator();
  const gain = audio.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);
  if (detuneEnd) osc.frequency.exponentialRampToValueAtTime(detuneEnd, now + duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(audio.masterGain);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function playGhostAmbience() {
  if (!audio.enabled || gameState !== 'playing') return;
  // 지속 노이즈 대신 귀신의집 느낌의 짧은 픽셀 멜로디 이벤트
  const patterns = [
    [392, 370, 330, 294],
    [523, 494, 392, 311],
    [330, 247, 262, 196],
  ];
  const notes = patterns[Math.floor(Math.random() * patterns.length)];
  notes.forEach((note, i) => {
    playTone({ frequency: note, type: i % 2 ? 'triangle' : 'square', start: i * 0.18, duration: 0.32, volume: 0.055, detuneEnd: Math.max(80, note * 0.82) });
  });
  playTone({ frequency: 98, type: 'triangle', start: 0.05, duration: 1.0, volume: 0.035, detuneEnd: 73 });
}

function playHitSound() {
  if (!audio.enabled) return;
  playTone({ frequency: 180, type: 'sawtooth', duration: 0.13, volume: 0.25, detuneEnd: 52 });
  playTone({ frequency: 70, type: 'square', start: 0.02, duration: 0.12, volume: 0.18, detuneEnd: 38 });
}

const upgrades = [
  { name: '최대 체력 +1', desc: '최대 HP가 1 증가하고 체력을 1 회복합니다.', apply: () => { player.maxHp += 1; player.hp = Math.min(player.maxHp, player.hp + 1); } },
  { name: '이동속도 +15%', desc: '탄막을 피하기 쉬워집니다.', apply: () => { player.speed *= 1.15; } },
  { name: '피격 무적 +0.4초', desc: '맞은 직후 무적 시간이 길어집니다.', apply: () => { player.invincibleBonus = (player.invincibleBonus || 0) + 0.4; } },
  { name: '체력 2 회복', desc: '현재 HP를 2 회복합니다.', apply: () => { player.hp = Math.min(player.maxHp, player.hp + 2); } },
  { name: '크기 감소', desc: '플레이어 충돌 범위가 작아집니다.', apply: () => { player.radius = Math.max(8, player.radius - 2); } },
];

function resetGame() {
  Object.assign(player, { x: canvas.width / 2, y: canvas.height - 80, radius: 14, hp: 3, maxHp: 3, speed: 260, invincible: 0, invincibleBonus: 0 });
  bullets = [];
  wave = 1;
  score = 0;
  waveDuration = 20;
  fireInterval = 1.1;
  bulletSpeed = 145;
  bulletCount = 8;
  bulletTimer = 0;
  waveTimer = waveDuration;
  scoreTimer = 0;
  ambienceTimer = 1.5;
  updateHud();
}

function startGame() {
  resumeAudio();
  resetGame();
  gameState = 'playing';
  startPanel.classList.add('hidden');
  upgradePanel.classList.add('hidden');
  gameOverPanel.classList.add('hidden');
  lastTime = performance.now();
  cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(gameLoop);
}

function nextWave() {
  gameState = 'upgrade';
  bullets = [];
  showUpgradePanel();
}

function applyWaveDifficulty() {
  wave += 1;
  waveDuration = Math.min(35, waveDuration + 2);
  fireInterval = Math.max(0.35, fireInterval - 0.09);
  bulletSpeed += 18;
  bulletCount = Math.min(22, bulletCount + 1);
  waveTimer = waveDuration;
  bulletTimer = 0;
  ambienceTimer = 1.2;
}

function showUpgradePanel() {
  upgradeCards.innerHTML = '';
  [...upgrades].sort(() => Math.random() - 0.5).slice(0, 3).forEach((upgrade) => {
    const card = document.createElement('div');
    card.className = 'upgrade-card';
    card.innerHTML = `<h3>${upgrade.name}</h3><p>${upgrade.desc}</p>`;
    card.addEventListener('click', () => {
      upgrade.apply();
      applyWaveDifficulty();
      updateHud();
      upgradePanel.classList.add('hidden');
      gameState = 'playing';
      lastTime = performance.now();
      animationId = requestAnimationFrame(gameLoop);
    });
    upgradeCards.appendChild(card);
  });
  upgradePanel.classList.remove('hidden');
}

function spawnPattern() {
  if (wave % 3 === 0) spawnSpiralBullets();
  else if (wave % 2 === 0) spawnAimedBullets();
  else spawnCircleBullets();
}

function spawnCircleBullets() {
  const angleOffset = Math.random() * Math.PI * 2;
  for (let i = 0; i < bulletCount; i++) createBullet(angleOffset + (Math.PI * 2 * i) / bulletCount, bulletSpeed);
}

function spawnAimedBullets() {
  const baseAngle = Math.atan2(player.y - boss.y, player.x - boss.x);
  const spread = 0.55;
  const count = Math.min(9, 3 + Math.floor(wave / 2));
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    createBullet(baseAngle - spread / 2 + spread * t, bulletSpeed + 30);
  }
}

function spawnSpiralBullets() {
  const baseAngle = performance.now() / 600;
  const count = Math.min(14, bulletCount);
  for (let i = 0; i < count; i++) createBullet(baseAngle + (Math.PI * 2 * i) / count, bulletSpeed + 20);
}

function createBullet(angle, speed) {
  bullets.push({ x: boss.x, y: boss.y + 18, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: 7 });
}

function update(dt) {
  updatePlayer(dt);
  updateBullets(dt);
  checkCollisions();

  bulletTimer += dt;
  waveTimer -= dt;
  scoreTimer += dt;
  ambienceTimer -= dt;

  if (bulletTimer >= fireInterval) { bulletTimer = 0; spawnPattern(); }
  if (scoreTimer >= 0.25) { scoreTimer = 0; score += 1; }
  if (ambienceTimer <= 0) { playGhostAmbience(); ambienceTimer = 4.5 + Math.random() * 3.5; }
  if (player.invincible > 0) player.invincible -= dt;
  if (waveTimer <= 0) { score += wave * 25; nextWave(); }
  updateHud();
}

function updatePlayer(dt) {
  let dx = 0, dy = 0;
  if (keys.ArrowLeft || keys.a || keys.A) dx -= 1;
  if (keys.ArrowRight || keys.d || keys.D) dx += 1;
  if (keys.ArrowUp || keys.w || keys.W) dy -= 1;
  if (keys.ArrowDown || keys.s || keys.S) dy += 1;
  if (dx || dy) { const len = Math.hypot(dx, dy); dx /= len; dy /= len; }
  player.x = clamp(player.x + dx * player.speed * dt, player.radius, canvas.width - player.radius);
  player.y = clamp(player.y + dy * player.speed * dt, player.radius, canvas.height - player.radius);
}

function updateBullets(dt) {
  bullets.forEach((bullet) => { bullet.x += bullet.vx * dt; bullet.y += bullet.vy * dt; });
  bullets = bullets.filter((b) => b.x > -40 && b.x < canvas.width + 40 && b.y > -40 && b.y < canvas.height + 40);
}

function checkCollisions() {
  if (player.invincible > 0) return;
  for (const bullet of bullets) {
    if (Math.hypot(player.x - bullet.x, player.y - bullet.y) < player.radius + bullet.radius) {
      player.hp -= 1;
      playHitSound();
      player.invincible = 1.1 + (player.invincibleBonus || 0);
      bullets = bullets.filter((item) => item !== bullet);
      if (player.hp <= 0) endGame(false);
      return;
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawArena();
  drawBoss();
  drawBullets();
  drawPlayer();
}

function drawArena() {
  const gradient = ctx.createRadialGradient(canvas.width / 2, 120, 40, canvas.width / 2, 260, 520);
  gradient.addColorStop(0, '#261017');
  gradient.addColorStop(0.48, '#0d0b12');
  gradient.addColorStop(1, '#050507');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(255, 40, 40, 0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 45) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
  for (let y = 0; y < canvas.height; y += 45) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
}

function pixelRect(cx, cy, x, y, w, h, color, scale = boss.scale) {
  ctx.fillStyle = color;
  ctx.fillRect(cx + x * scale, cy + y * scale, w * scale, h * scale);
}

function drawBoss() {
  const s = boss.scale;
  const cx = boss.x - 10 * s;
  const cy = boss.y - 8 * s;
  const bob = Math.round(Math.sin(performance.now() / 300) * 1) * s;

  ctx.shadowColor = 'rgba(255, 0, 0, 0.7)';
  ctx.shadowBlur = 22;
  pixelRect(cx, cy + bob, 3, 0, 3, 3, '#8f1010');
  pixelRect(cx, cy + bob, 14, 0, 3, 3, '#8f1010');
  pixelRect(cx, cy + bob, 2, 2, 4, 2, '#d01b1b');
  pixelRect(cx, cy + bob, 14, 2, 4, 2, '#d01b1b');
  pixelRect(cx, cy + bob, 6, 3, 8, 2, '#191015');
  pixelRect(cx, cy + bob, 5, 5, 10, 7, '#c01818');
  pixelRect(cx, cy + bob, 4, 7, 12, 6, '#7a0c0c');
  pixelRect(cx, cy + bob, 2, 8, 3, 3, '#191015');
  pixelRect(cx, cy + bob, 15, 8, 3, 3, '#191015');
  pixelRect(cx, cy + bob, 7, 7, 2, 2, '#ffdf64');
  pixelRect(cx, cy + bob, 11, 7, 2, 2, '#ffdf64');
  pixelRect(cx, cy + bob, 8, 11, 4, 1, '#050507');
  pixelRect(cx, cy + bob, 8, 13, 2, 3, '#2a0505');
  pixelRect(cx, cy + bob, 11, 13, 2, 3, '#2a0505');
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#ffd9d2';
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`DEMON Lv.${wave}`, boss.x, boss.y - 62);
}

function drawPlayer() {
  if (player.invincible > 0 && Math.floor(performance.now() / 90) % 2 === 0) return;
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
  ctx.fillStyle = '#74f0ff';
  ctx.fill();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawBullets() {
  bullets.forEach((bullet) => {
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ff3b30';
    ctx.fill();
    ctx.shadowColor = 'rgba(255, 0, 0, 0.65)';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.shadowBlur = 0;
  });
}

function updateHud() {
  hpText.textContent = `${player.hp}/${player.maxHp}`;
  waveText.textContent = wave;
  timeText.textContent = Math.max(0, Math.ceil(waveTimer));
  scoreText.textContent = score;
}

function endGame(isWin) {
  gameState = 'over';
  cancelAnimationFrame(animationId);
  resultTitle.textContent = isWin ? 'Victory!' : 'Game Over';
  resultText.textContent = `도달 웨이브: ${wave} / 최종 점수: ${score}`;
  gameOverPanel.classList.remove('hidden');
}

function gameLoop(currentTime) {
  if (gameState !== 'playing') return;
  const dt = Math.min((currentTime - lastTime) / 1000, 0.033);
  lastTime = currentTime;
  update(dt);
  draw();
  animationId = requestAnimationFrame(gameLoop);
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

window.addEventListener('keydown', (event) => { keys[event.key] = true; });
window.addEventListener('keyup', (event) => { keys[event.key] = false; });
soundButton.addEventListener('click', () => { resumeAudio(); setSoundEnabled(!audio.enabled); });
startButton.addEventListener('click', startGame);
restartButton.addEventListener('click', startGame);

setSoundEnabled(true);
resetGame();
draw();
