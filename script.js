const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const hpText = document.getElementById('hpText');
const waveText = document.getElementById('waveText');
const finalWaveText = document.getElementById('finalWaveText');
const timeText = document.getElementById('timeText');
const scoreText = document.getElementById('scoreText');
const difficultyText = document.getElementById('difficultyText');

const startPanel = document.getElementById('startPanel');
const upgradePanel = document.getElementById('upgradePanel');
const gameOverPanel = document.getElementById('gameOverPanel');
const startButton = document.getElementById('startButton');
const restartButton = document.getElementById('restartButton');
const soundButton = document.getElementById('soundButton');
const upgradeCards = document.getElementById('upgradeCards');
const resultTitle = document.getElementById('resultTitle');
const resultText = document.getElementById('resultText');
const rankForm = document.getElementById('rankForm');
const nicknameInput = document.getElementById('nicknameInput');
const rankingList = document.getElementById('rankingList');

const keys = {};
const FINAL_WAVE = 20;
const RANKING_KEY = 'rogueBossPlayLogs';

let gameState = 'ready';
let lastTime = 0;
let bulletTimer = 0;
let specialTimer = 0;
let waveTimer = 0;
let scoreTimer = 0;
let animationId = null;
let rankSavedThisRun = false;
let lastResultIsWin = false;

const player = {
  x: canvas.width / 2,
  y: canvas.height - 80,
  radius: 14,
  hp: 3,
  maxHp: 3,
  speed: 260,
  invincible: 0,
};

const boss = {
  x: canvas.width / 2,
  y: 95,
  radius: 42,
};

let bullets = [];
let lasers = [];
let dangerZones = [];
let wave = 1;
let score = 0;
let waveDuration = 20;
let fireInterval = 1.1;
let bulletSpeed = 145;
let bulletCount = 8;

const upgrades = [
  {
    name: '최대 체력 +1',
    desc: '최대 HP가 1 증가하고 체력을 1 회복합니다.',
    apply: () => {
      player.maxHp += 1;
      player.hp = Math.min(player.maxHp, player.hp + 1);
    },
  },
  {
    name: '이동속도 +15%',
    desc: '탄막을 피하기 쉬워집니다.',
    apply: () => {
      player.speed *= 1.15;
    },
  },
  {
    name: '피격 무적 +0.4초',
    desc: '맞은 직후 무적 시간이 길어집니다.',
    apply: () => {
      player.invincibleBonus = (player.invincibleBonus || 0) + 0.4;
    },
  },
  {
    name: '체력 2 회복',
    desc: '현재 HP를 2 회복합니다.',
    apply: () => {
      player.hp = Math.min(player.maxHp, player.hp + 2);
    },
  },
  {
    name: '크기 감소',
    desc: '플레이어 충돌 범위가 작아집니다.',
    apply: () => {
      player.radius = Math.max(8, player.radius - 2);
    },
  },
  {
    name: '긴급 보호막',
    desc: '다음 웨이브 시작 후 2초간 무적입니다.',
    apply: () => {
      player.invincible = Math.max(player.invincible, 2);
    },
  },
];

const audio = {
  ctx: null,
  enabled: true,
  ambienceTimer: null,
};

function initAudio() {
  if (audio.ctx) return;
  audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
}

function resumeAudio() {
  initAudio();
  if (audio.ctx.state === 'suspended') audio.ctx.resume();
}

function setSoundButtonText() {
  soundButton.textContent = audio.enabled ? 'Sound ON' : 'Sound OFF';
}

function playTone({ frequency = 440, duration = 0.2, type = 'square', volume = 0.08, slideTo = null }) {
  if (!audio.enabled) return;
  resumeAudio();

  const now = audio.ctx.currentTime;
  const oscillator = audio.ctx.createOscillator();
  const gain = audio.ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, now + duration);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(gain);
  gain.connect(audio.ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.03);
}

function playHitSound() { playTone({ frequency: 150, slideTo: 70, duration: 0.18, type: 'sawtooth', volume: 0.12 }); }
function playStageClearSound() {
  playTone({ frequency: 392, duration: 0.1, type: 'square', volume: 0.08 });
  setTimeout(() => playTone({ frequency: 523, duration: 0.12, type: 'square', volume: 0.08 }), 90);
  setTimeout(() => playTone({ frequency: 784, duration: 0.18, type: 'square', volume: 0.08 }), 180);
}
function playStageFailSound() {
  playTone({ frequency: 180, slideTo: 90, duration: 0.45, type: 'triangle', volume: 0.12 });
  setTimeout(() => playTone({ frequency: 100, slideTo: 55, duration: 0.35, type: 'sawtooth', volume: 0.08 }), 130);
}
function playHoverSound() { playTone({ frequency: 620, duration: 0.045, type: 'square', volume: 0.035 }); }
function playSelectSound() { playTone({ frequency: 720, duration: 0.08, type: 'square', volume: 0.06 }); }
function playSaveSound() {
  playTone({ frequency: 523, duration: 0.08, type: 'square', volume: 0.06 });
  setTimeout(() => playTone({ frequency: 659, duration: 0.08, type: 'square', volume: 0.06 }), 80);
}
function playSpecialWarningSound() {
  playTone({ frequency: 260, slideTo: 170, duration: 0.2, type: 'square', volume: 0.07 });
}

function startAmbience() {
  stopAmbience();
  if (!audio.enabled) return;
  resumeAudio();

  audio.ambienceTimer = setInterval(() => {
    if (gameState === 'playing' || gameState === 'upgrade') {
      const base = Math.random() > 0.5 ? 196 : 220;
      playTone({ frequency: base, slideTo: base * 0.72, duration: 0.65, type: 'triangle', volume: 0.025 });
      setTimeout(() => playTone({ frequency: base / 2, duration: 0.35, type: 'sine', volume: 0.018 }), 220);
    }
  }, 850);
}

function stopAmbience() {
  if (audio.ambienceTimer) {
    clearInterval(audio.ambienceTimer);
    audio.ambienceTimer = null;
  }
}

function getStage(targetWave = wave) {
  return Math.min(5, Math.ceil(targetWave / 4));
}

function getStageWave(targetWave = wave) {
  return ((targetWave - 1) % 4) + 1;
}

function isBossWave(targetWave = wave) {
  return getStageWave(targetWave) === 4;
}

function getDifficultyInfo(targetWave = wave) {
  const stage = getStage(targetWave);
  const stageWave = getStageWave(targetWave);
  const bossWave = isBossWave(targetWave);

  const stageData = {
    1: { name: '1단계: 기본 탄막', pattern: '기본 탄막', color: '#74f0ff', waveDuration: 18, speedBonus: 0, countBonus: 0, intervalBonus: 0 },
    2: { name: '2단계: 추격/회전 탄막', pattern: '추격 + 회전', color: '#ffd166', waveDuration: 19, speedBonus: 24, countBonus: 2, intervalBonus: -0.08 },
    3: { name: '3단계: 혼합 + 장판', pattern: '혼합 + 경고 장판', color: '#ff9f1c', waveDuration: 20, speedBonus: 48, countBonus: 4, intervalBonus: -0.16 },
    4: { name: '4단계: 폭죽 탄막', pattern: '폭죽 2차 탄막', color: '#ff4d6d', waveDuration: 21, speedBonus: 72, countBonus: 5, intervalBonus: -0.24 },
    5: { name: '5단계: 레이저 지옥', pattern: '가로/세로 레이저', color: '#ff1b1c', waveDuration: 23, speedBonus: 96, countBonus: 6, intervalBonus: -0.32 },
  };

  return {
    ...stageData[stage],
    stage,
    stageWave,
    isBoss: bossWave,
    bossName: bossWave ? `CHAPTER ${stage} BOSS` : `Chapter ${stage}-${stageWave}`,
  };
}

function isEliteWave(targetWave = wave) {
  return isBossWave(targetWave);
}

function resetGame() {
  player.x = canvas.width / 2;
  player.y = canvas.height - 80;
  player.radius = 14;
  player.hp = 3;
  player.maxHp = 3;
  player.speed = 260;
  player.invincible = 0;
  player.invincibleBonus = 0;

  bullets = [];
  lasers = [];
  dangerZones = [];
  wave = 1;
  score = 0;
  bulletTimer = 0;
  specialTimer = 0;
  scoreTimer = 0;
  rankSavedThisRun = false;
  lastResultIsWin = false;
  finalWaveText.textContent = FINAL_WAVE;
  setWaveStats();
  updateHud();
}

function setWaveStats() {
  const difficulty = getDifficultyInfo(wave);
  const stage = difficulty.stage;
  const stageWave = difficulty.stageWave;
  const bossBonus = difficulty.isBoss ? 1 : 0;

  waveDuration = difficulty.waveDuration + bossBonus * 7;
  fireInterval = Math.max(0.26, 1.05 - stage * 0.08 - stageWave * 0.035 + difficulty.intervalBonus - bossBonus * 0.12);
  bulletSpeed = 135 + stage * 24 + stageWave * 8 + difficulty.speedBonus + bossBonus * 24;
  bulletCount = Math.min(30, 7 + stage * 2 + stageWave + difficulty.countBonus + bossBonus * 5);
  waveTimer = waveDuration;
  bulletTimer = 0;
  specialTimer = difficulty.stage >= 3 ? 1.6 : 999;
}

function startGame() {
  resumeAudio();
  resetGame();
  gameState = 'playing';
  startPanel.classList.add('hidden');
  upgradePanel.classList.add('hidden');
  gameOverPanel.classList.add('hidden');
  rankForm.classList.add('hidden');
  lastTime = performance.now();
  cancelAnimationFrame(animationId);
  startAmbience();
  animationId = requestAnimationFrame(gameLoop);
}

function nextWave() {
  bullets = [];
  lasers = [];
  dangerZones = [];

  if (wave >= FINAL_WAVE) {
    endGame(true);
    return;
  }

  gameState = 'upgrade';
  playStageClearSound();
  showUpgradePanel();
}

function applyWaveDifficulty() {
  wave += 1;
  setWaveStats();
}

function showUpgradePanel() {
  upgradeCards.innerHTML = '';
  const picked = [...upgrades].sort(() => Math.random() - 0.5).slice(0, 3);

  picked.forEach((upgrade) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'upgrade-card';
    card.innerHTML = `<h3>${upgrade.name}</h3><p>${upgrade.desc}</p>`;
    card.addEventListener('mouseenter', playHoverSound);
    card.addEventListener('focus', playHoverSound);
    card.addEventListener('click', () => {
      playSelectSound();
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
  const info = getDifficultyInfo();

  if (info.stage === 1) {
    spawnCircleBullets(info.isBoss ? 1.25 : 1);
    return;
  }

  if (info.stage === 2) {
    if (info.isBoss) {
      spawnAimedBullets(1.2);
      setTimeout(() => spawnSpiralBullets(1.1), 220);
    } else {
      Math.random() > 0.5 ? spawnAimedBullets() : spawnSpiralBullets();
    }
    return;
  }

  if (info.stage === 3) {
    const roll = Math.random();
    if (roll < 0.34) spawnCircleBullets();
    else if (roll < 0.67) spawnAimedBullets();
    else spawnSpiralBullets();
    if (info.isBoss && Math.random() < 0.5) spawnDangerZoneAttack();
    return;
  }

  if (info.stage === 4) {
    if (info.isBoss) {
      spawnFireworkAttack(1.35);
      setTimeout(() => spawnCircleBullets(0.8), 260);
    } else {
      Math.random() < 0.55 ? spawnFireworkAttack() : spawnAimedBullets();
    }
    return;
  }

  // 5단계: 최종 챕터. 레이저와 기존 패턴을 모두 섞어서 사용
  const roll = Math.random();
  if (roll < 0.24) spawnCircleBullets();
  else if (roll < 0.48) spawnAimedBullets();
  else if (roll < 0.72) spawnSpiralBullets();
  else spawnFireworkAttack();
}

function spawnElitePattern() {
  const info = getDifficultyInfo();
  playSpecialWarningSound();

  // 각 챕터 보스전은 해당 단계의 패턴을 마무리하는 강화 패턴을 사용
  if (info.isBoss && info.stage === 1) {
    spawnCircleBullets(1.45);
    setTimeout(() => spawnCircleBullets(0.9), 300);
    return;
  }

  if (info.isBoss && info.stage === 2) {
    spawnAimedBullets(1.35);
    setTimeout(() => spawnSpiralBullets(1.25), 260);
    return;
  }

  if (info.stage === 3) {
    spawnDangerZoneAttack(info.isBoss ? 1.35 : 1);
    if (info.isBoss) setTimeout(() => spawnAimedBullets(1.05), 300);
    return;
  }

  if (info.stage === 4) {
    spawnFireworkAttack(info.isBoss ? 1.45 : 1);
    if (info.isBoss) setTimeout(() => spawnFireworkAttack(1.05), 420);
    return;
  }

  if (info.stage === 5) {
    spawnLaserAttack(info.isBoss ? 1.35 : 1);
    if (info.isBoss) {
      setTimeout(() => spawnFireworkAttack(1.1), 350);
      setTimeout(() => spawnDangerZoneAttack(1.1), 700);
    }
  }
}

function spawnCircleBullets(multiplier = 1) {
  const angleOffset = Math.random() * Math.PI * 2;
  const count = Math.floor(bulletCount * multiplier);
  for (let i = 0; i < count; i++) {
    const angle = angleOffset + (Math.PI * 2 * i) / count;
    createBullet(angle, bulletSpeed);
  }
}

function spawnAimedBullets(multiplier = 1) {
  const baseAngle = Math.atan2(player.y - boss.y, player.x - boss.x);
  const spread = 0.5 + getDifficultyInfo().stage * 0.12;
  const count = Math.min(16, Math.floor((3 + Math.floor(wave / 2)) * multiplier));

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    const angle = baseAngle - spread / 2 + spread * t;
    createBullet(angle, bulletSpeed + 30);
  }
}

function spawnSpiralBullets(multiplier = 1) {
  const baseAngle = performance.now() / (620 - getDifficultyInfo().stage * 90);
  const count = Math.min(24, Math.floor(bulletCount * multiplier));

  for (let i = 0; i < count; i++) {
    const angle = baseAngle + (Math.PI * 2 * i) / count;
    createBullet(angle, bulletSpeed + 20);
  }
}

function spawnLaserAttack(multiplier = 1) {
  const difficulty = getDifficultyInfo();
  const laserCount = Math.floor((2 + Math.floor(Math.random() * 2)) * multiplier);

  for (let i = 0; i < laserCount; i++) {
    const isVertical = Math.random() > 0.5;
    lasers.push({
      orientation: isVertical ? 'vertical' : 'horizontal',
      x: 80 + Math.random() * (canvas.width - 160),
      y: 80 + Math.random() * (canvas.height - 160),
      width: 16 + difficulty.stage * 4,
      warning: 0.8,
      active: 0.46,
      total: 1.26,
      hit: false,
    });
  }
}

function spawnFireworkAttack(multiplier = 1) {
  const info = getDifficultyInfo();
  const count = Math.floor((info.stage >= 5 ? 5 : 4) * multiplier);
  for (let i = 0; i < count; i++) {
    const angle = Math.PI / 2 + (Math.random() - 0.5) * 1.3;
    bullets.push({
      x: boss.x + (Math.random() - 0.5) * 120,
      y: boss.y,
      vx: Math.cos(angle) * 90,
      vy: Math.sin(angle) * 90,
      radius: 9,
      color: '#ff7a1a',
      splitTime: 0.55 + Math.random() * 0.35,
      splitCount: 8 + info.stage * 3 + (info.isBoss ? 4 : 0),
    });
  }
}

function spawnDangerZoneAttack(multiplier = 1) {
  const info = getDifficultyInfo();
  const zoneCount = Math.floor((2 + Math.floor(info.stage / 2) + (info.isBoss ? 2 : 0)) * multiplier);

  for (let i = 0; i < zoneCount; i++) {
    dangerZones.push({
      x: 90 + Math.random() * (canvas.width - 180),
      y: 150 + Math.random() * (canvas.height - 210),
      radius: 34 + info.stage * 5 + (info.isBoss ? 10 : 0),
      warning: 0.95,
      active: 0.28,
      total: 1.23,
      hit: false,
    });
  }
}

function createBullet(angle, speed) {
  bullets.push({
    x: boss.x,
    y: boss.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: 7,
    color: '#ffd166',
  });
}

function update(dt) {
  updatePlayer(dt);
  updateBullets(dt);
  updateLasers(dt);
  updateDangerZones(dt);
  checkCollisions();

  bulletTimer += dt;
  specialTimer += dt;
  waveTimer -= dt;
  scoreTimer += dt;

  if (bulletTimer >= fireInterval) {
    bulletTimer = 0;
    spawnPattern();
  }

  if (specialTimer >= (isBossWave(wave) ? 3.2 : 4.6) && getDifficultyInfo().stage >= 3) {
    specialTimer = 0;
    spawnElitePattern();
  }

  if (scoreTimer >= 0.25) {
    scoreTimer = 0;
    score += 1;
  }

  if (player.invincible > 0) player.invincible -= dt;

  if (waveTimer <= 0) {
    score += wave * 25;
    if (isBossWave(wave)) score += 150;
    nextWave();
  }

  updateHud();
}

function updatePlayer(dt) {
  let dx = 0;
  let dy = 0;

  if (keys.ArrowLeft || keys.a || keys.A) dx -= 1;
  if (keys.ArrowRight || keys.d || keys.D) dx += 1;
  if (keys.ArrowUp || keys.w || keys.W) dy -= 1;
  if (keys.ArrowDown || keys.s || keys.S) dy += 1;

  if (dx !== 0 || dy !== 0) {
    const length = Math.hypot(dx, dy);
    dx /= length;
    dy /= length;
  }

  player.x += dx * player.speed * dt;
  player.y += dy * player.speed * dt;

  player.x = clamp(player.x, player.radius, canvas.width - player.radius);
  player.y = clamp(player.y, player.radius, canvas.height - player.radius);
}

function updateBullets(dt) {
  const newBullets = [];

  bullets.forEach((bullet) => {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;

    if (bullet.splitTime !== undefined) {
      bullet.splitTime -= dt;
      if (bullet.splitTime <= 0) {
        for (let i = 0; i < bullet.splitCount; i++) {
          const angle = (Math.PI * 2 * i) / bullet.splitCount + Math.random() * 0.12;
          newBullets.push({
            x: bullet.x,
            y: bullet.y,
            vx: Math.cos(angle) * (bulletSpeed * 0.75),
            vy: Math.sin(angle) * (bulletSpeed * 0.75),
            radius: 6,
            color: '#ff3d00',
          });
        }
        bullet.remove = true;
      }
    }
  });

  bullets.push(...newBullets);
  bullets = bullets.filter((bullet) => !bullet.remove && bullet.x > -60 && bullet.x < canvas.width + 60 && bullet.y > -60 && bullet.y < canvas.height + 60);
}

function updateLasers(dt) {
  lasers.forEach((laser) => {
    laser.total -= dt;
    if (laser.warning > 0) laser.warning -= dt;
    else laser.active -= dt;
  });

  lasers = lasers.filter((laser) => laser.total > 0 && laser.active > -0.05);
}

function updateDangerZones(dt) {
  dangerZones.forEach((zone) => {
    zone.total -= dt;
    if (zone.warning > 0) zone.warning -= dt;
    else zone.active -= dt;
  });

  dangerZones = dangerZones.filter((zone) => zone.total > 0 && zone.active > -0.05);
}

function checkCollisions() {
  if (player.invincible > 0) return;

  for (const bullet of bullets) {
    const distance = Math.hypot(player.x - bullet.x, player.y - bullet.y);
    if (distance < player.radius + bullet.radius) {
      damagePlayer();
      bullets = bullets.filter((item) => item !== bullet);
      return;
    }
  }

  for (const laser of lasers) {
    const activeLaser = laser.warning <= 0 && laser.active > 0;
    const withinBeam = laser.orientation === 'horizontal'
      ? Math.abs(player.y - laser.y) < player.radius + laser.width / 2
      : Math.abs(player.x - laser.x) < player.radius + laser.width / 2;

    if (activeLaser && withinBeam && !laser.hit) {
      laser.hit = true;
      damagePlayer();
      return;
    }
  }

  for (const zone of dangerZones) {
    const activeZone = zone.warning <= 0 && zone.active > 0;
    const distance = Math.hypot(player.x - zone.x, player.y - zone.y);
    if (activeZone && distance < player.radius + zone.radius && !zone.hit) {
      zone.hit = true;
      damagePlayer();
      return;
    }
  }
}

function damagePlayer() {
  player.hp -= 1;
  player.invincible = 1.1 + (player.invincibleBonus || 0);
  playHitSound();
  if (player.hp <= 0) endGame(false);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawArena();
  drawBoss();
  drawDangerZones();
  drawLasers();
  drawBullets();
  drawPlayer();
}

function drawArena() {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.lineWidth = 1;

  for (let x = 0; x < canvas.width; x += 45) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 45) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  if (isBossWave()) {
    ctx.fillStyle = 'rgba(255, 40, 40, 0.08)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function drawPixelRect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function drawBoss() {
  const x = boss.x;
  const y = boss.y;
  const difficulty = getDifficultyInfo();
  const pulse = Math.sin(performance.now() / 180) * 2;

  ctx.fillStyle = isEliteWave() ? 'rgba(255, 0, 50, 0.25)' : 'rgba(255, 0, 50, 0.14)';
  ctx.beginPath();
  ctx.arc(x, y + 6, 72 + pulse * 3 + difficulty.stage * 3, 0, Math.PI * 2);
  ctx.fill();

  drawPixelRect(x - 56, y - 42, 20, 18, '#1a0508');
  drawPixelRect(x + 36, y - 42, 20, 18, '#1a0508');
  drawPixelRect(x - 68, y - 60, 16, 16, '#7c0712');
  drawPixelRect(x + 52, y - 60, 16, 16, '#7c0712');
  drawPixelRect(x - 42, y - 34, 84, 68, isEliteWave() ? '#c1121f' : '#8e0e18');
  drawPixelRect(x - 30, y - 22, 60, 48, '#1a0508');
  drawPixelRect(x - 20, y - 10, 12, 12, '#ff3030');
  drawPixelRect(x + 8, y - 10, 12, 12, '#ff3030');
  drawPixelRect(x - 18, y + 14, 36, 8, '#d6d6d6');
  drawPixelRect(x - 10, y + 14, 4, 10, '#050505');
  drawPixelRect(x + 6, y + 14, 4, 10, '#050505');
  drawPixelRect(x - 50, y + 22, 18, 28, '#1a0508');
  drawPixelRect(x + 32, y + 22, 18, 28, '#1a0508');

  ctx.fillStyle = difficulty.color;
  ctx.font = 'bold 18px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`${difficulty.bossName} / ${difficulty.pattern}`, boss.x, boss.y - 78);
}

function drawPlayer() {
  const blink = player.invincible > 0 && Math.floor(performance.now() / 90) % 2 === 0;
  if (blink) return;

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
    ctx.fillStyle = bullet.color || '#ffd166';
    ctx.fill();
  });
}

function drawDangerZones() {
  dangerZones.forEach((zone) => {
    const activeZone = zone.warning <= 0 && zone.active > 0;
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
    ctx.fillStyle = activeZone ? 'rgba(255, 90, 0, 0.46)' : 'rgba(255, 40, 40, 0.18)';
    ctx.fill();
    ctx.strokeStyle = activeZone ? 'rgba(255, 240, 120, 0.9)' : 'rgba(255, 90, 90, 0.7)';
    ctx.lineWidth = activeZone ? 4 : 2;
    ctx.stroke();

    if (!activeZone) {
      ctx.beginPath();
      ctx.moveTo(zone.x - zone.radius * 0.6, zone.y);
      ctx.lineTo(zone.x + zone.radius * 0.6, zone.y);
      ctx.moveTo(zone.x, zone.y - zone.radius * 0.6);
      ctx.lineTo(zone.x, zone.y + zone.radius * 0.6);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });
}

function drawLasers() {
  lasers.forEach((laser) => {
    const activeLaser = laser.warning <= 0 && laser.active > 0;
    ctx.fillStyle = activeLaser ? 'rgba(255, 20, 20, 0.72)' : 'rgba(255, 255, 255, 0.22)';

    if (laser.orientation === 'horizontal') {
      ctx.fillRect(0, laser.y - laser.width / 2, canvas.width, laser.width);
      ctx.fillStyle = activeLaser ? 'rgba(255, 240, 160, 0.85)' : 'rgba(255, 60, 60, 0.25)';
      ctx.fillRect(0, laser.y - 2, canvas.width, 4);
    } else {
      ctx.fillRect(laser.x - laser.width / 2, 0, laser.width, canvas.height);
      ctx.fillStyle = activeLaser ? 'rgba(255, 240, 160, 0.85)' : 'rgba(255, 60, 60, 0.25)';
      ctx.fillRect(laser.x - 2, 0, 4, canvas.height);
    }
  });
}

function updateHud() {
  hpText.textContent = `${player.hp}/${player.maxHp}`;
  waveText.textContent = wave;
  timeText.textContent = Math.max(0, Math.ceil(waveTimer));
  scoreText.textContent = score;
  const difficulty = getDifficultyInfo();
  if (difficultyText) {
    difficultyText.textContent = `${difficulty.name}${difficulty.isBoss ? ' / 보스전' : ''}`;
  }
}

function endGame(isWin) {
  gameState = 'over';
  cancelAnimationFrame(animationId);
  stopAmbience();

  lastResultIsWin = isWin;
  resultTitle.textContent = isWin ? 'Ending Clear!' : 'Game Over';
  resultText.textContent = `결과: ${isWin ? '엔딩 클리어' : '게임오버'} / 도달 웨이브: ${wave}/${FINAL_WAVE} / 최종 점수: ${score}`;

  if (isWin) playStageClearSound();
  else playStageFailSound();

  rankSavedThisRun = false;
  rankForm.classList.remove('hidden');
  nicknameInput.value = '';
  setTimeout(() => nicknameInput.focus(), 100);

  renderRankings();
  gameOverPanel.classList.remove('hidden');
}

function getRankings() {
  const saved = localStorage.getItem(RANKING_KEY);
  if (!saved) return [];
  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveRanking(nickname) {
  const cleanName = nickname.trim().slice(0, 12) || '이름없는 도전자';
  const rankings = getRankings();

  rankings.push({
    name: cleanName,
    score,
    wave,
    result: lastResultIsWin ? 'CLEAR' : 'FAIL',
    date: new Date().toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
  });

  rankings.sort((a, b) => {
    const clearDiff = Number(b.result === 'CLEAR') - Number(a.result === 'CLEAR');
    return clearDiff || b.wave - a.wave || b.score - a.score;
  });
  localStorage.setItem(RANKING_KEY, JSON.stringify(rankings.slice(0, 10)));
}

function renderRankings() {
  const rankings = getRankings();
  rankingList.innerHTML = '';

  if (rankings.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.textContent = '아직 저장된 플레이 로그가 없습니다.';
    rankingList.appendChild(emptyItem);
    return;
  }

  rankings.forEach((rank) => {
    const item = document.createElement('li');
    const resultLabel = rank.result === 'CLEAR' ? '엔딩 클리어' : '게임오버';
    item.innerHTML = `<strong>${rank.name}</strong> — ${resultLabel} / Wave ${rank.wave} <span class="rank-meta">/ ${rank.score}점 / ${rank.date}</span>`;
    rankingList.appendChild(item);
  });
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

function handleStartClick(event) {
  event.preventDefault();
  startGame();
}

startButton.addEventListener('click', handleStartClick);
restartButton.addEventListener('click', handleStartClick);

soundButton.addEventListener('click', () => {
  audio.enabled = !audio.enabled;
  setSoundButtonText();
  if (audio.enabled && (gameState === 'playing' || gameState === 'upgrade')) startAmbience();
  else stopAmbience();
});

rankForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (rankSavedThisRun) return;

  saveRanking(nicknameInput.value);
  rankSavedThisRun = true;
  rankForm.classList.add('hidden');
  playSaveSound();
  renderRankings();
});

resetGame();
renderRankings();
setSoundButtonText();
draw();
