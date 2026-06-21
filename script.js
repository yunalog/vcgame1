const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const hpText = document.getElementById('hpText');
const waveText = document.getElementById('waveText');
const finalWaveText = document.getElementById('finalWaveText');
const timeText = document.getElementById('timeText');
const scoreText = document.getElementById('scoreText');
const difficultyText = document.getElementById('difficultyText');
const starText = document.getElementById('starText');
const modeButtons = document.querySelectorAll('.mode-button');
const startTitle = document.getElementById('startTitle');
const lobbyModeText = document.getElementById('lobbyModeText');

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
const lobbyRankingList = document.getElementById('lobbyRankingList');
const volumeSlider = document.getElementById('volumeSlider');

const keys = {};
const FINAL_WAVE = 20;
const RANKING_KEY = 'rogueBossPlayLogs';
const STAR_GOAL = 3;
const MAX_STARS_PER_WAVE = 6;
const STAR_BONUS_SCORE = 50;
const STAR_SPAWN_INTERVAL = 3.2;

let gameState = 'ready';
let lastTime = 0;
let bulletTimer = 0;
let specialTimer = 0;
let waveTimer = 0;
let scoreTimer = 0;
let starTimer = 0;
let animationId = null;
let rankSavedThisRun = false;
let lastResultIsWin = false;
let selectedMode = { label: '무한모드', startWave: 1, endWave: null, infinite: true };
let currentRunEndWave = null;
let currentRunIsInfinite = true;
let currentRunLabel = '무한모드';

const player = {
  x: canvas.width / 2,
  y: canvas.height - 80,
  radius: 9,
  hp: 3,
  maxHp: 3,
  speed: 260,
  invincible: 0,
  sleepText: 0,
};

const boss = {
  x: canvas.width / 2,
  y: 95,
  radius: 42,
};

let bullets = [];
let lasers = [];
let dangerZones = [];
let stars = [];
let floatingTexts = [];
let wave = 1;
let score = 0;
let waveDuration = 20;
let fireInterval = 1.1;
let bulletSpeed = 145;
let bulletCount = 8;
let collectedStars = 0;
let spawnedStarsThisWave = 0;

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
      player.radius = Math.max(6, player.radius - 1);
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
  volume: 0.7,
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
  soundButton.textContent = audio.enabled ? 'SOUND ON' : 'SOUND OFF';
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
  gain.gain.exponentialRampToValueAtTime(volume * audio.volume, now + 0.02);
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
function playStarSound() {
  playTone({ frequency: 880, duration: 0.07, type: 'square', volume: 0.055 });
  setTimeout(() => playTone({ frequency: 1175, duration: 0.08, type: 'square', volume: 0.045 }), 60);
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
    1: { name: '1단계', pattern: '기본 탄막', color: '#74f0ff', waveDuration: 18, speedBonus: 0, countBonus: 0, intervalBonus: 0 },
    2: { name: '2단계', pattern: '추격 + 회전', color: '#ffd166', waveDuration: 19, speedBonus: 14, countBonus: 1, intervalBonus: -0.04 },
    3: { name: '3단계', pattern: '올빼미의 응시', color: '#d87cff', waveDuration: 20, speedBonus: 20, countBonus: 1, intervalBonus: -0.05 },
    4: { name: '4단계', pattern: '거리형 폭죽 탄막', color: '#ff4d6d', waveDuration: 21, speedBonus: 30, countBonus: 2, intervalBonus: -0.08 },
    5: { name: '5단계', pattern: '레이저 + 흡혈 탄막', color: '#ff1b1c', waveDuration: 23, speedBonus: 42, countBonus: 3, intervalBonus: -0.11 },
  };

  return {
    ...stageData[stage],
    stage,
    stageWave,
    isBoss: bossWave,
    bossName: bossWave ? ['','검은 구름','초승달','올빼미','늑대인간','뱀파이어'][stage] : '', 
  };
}

function isEliteWave(targetWave = wave) {
  return isBossWave(targetWave);
}

function resetGame(startWave = selectedMode.startWave, endWave = selectedMode.endWave, infinite = selectedMode.infinite) {
  player.x = canvas.width / 2;
  player.y = canvas.height - 80;
  player.radius = 7;
  player.hp = 3;
  player.maxHp = 3;
  player.speed = 260;
  player.invincible = 0;
  player.invincibleBonus = 0;
  player.sleepText = 0;

  bullets = [];
  lasers = [];
  dangerZones = [];
  stars = [];
  floatingTexts = [];
  wave = startWave;
  score = 0;
  bulletTimer = 0;
  specialTimer = 0;
  scoreTimer = 0;
  starTimer = 0;
  collectedStars = 0;
  spawnedStarsThisWave = 0;
  rankSavedThisRun = false;
  lastResultIsWin = false;
  currentRunEndWave = infinite ? null : endWave;
  currentRunIsInfinite = Boolean(infinite);
  currentRunLabel = selectedMode.label;
  finalWaveText.textContent = infinite ? '∞' : endWave;
  setWaveStats();
  updateHud();
}
function setWaveStats() {
  const difficulty = getDifficultyInfo(wave);
  const stage = difficulty.stage;
  const stageWave = difficulty.stageWave;
  const bossBonus = difficulty.isBoss ? 1 : 0;

  waveDuration = difficulty.waveDuration + bossBonus * 7;
  fireInterval = Math.max(0.46, 1.08 - stage * 0.045 - stageWave * 0.025 + difficulty.intervalBonus - bossBonus * 0.08);
  bulletSpeed = 122 + stage * 14 + stageWave * 5 + difficulty.speedBonus + bossBonus * 14;
  bulletCount = Math.min(22, 6 + stage + stageWave + difficulty.countBonus + bossBonus * 3);
  waveTimer = waveDuration;
  bulletTimer = 0;
  specialTimer = difficulty.stage >= 3 ? 2.4 : 999;
  starTimer = 0;
  collectedStars = 0;
  spawnedStarsThisWave = 0;
  stars = [];
  floatingTexts = [];
  spawnStar();
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
  stars = [];
  floatingTexts = [];

  if (!currentRunIsInfinite && wave >= currentRunEndWave) {
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
      spawnFireworkAttack(1.05);
      setTimeout(() => spawnCircleBullets(0.65), 360);
    } else {
      Math.random() < 0.24 ? spawnFireworkAttack(0.75) : spawnAimedBullets(0.85);
    }
    return;
  }

  // 5단계: 최종 챕터. 레이저와 기존 패턴을 모두 섞어서 사용
  const roll = Math.random();
  if (roll < 0.24) spawnCircleBullets();
  else if (roll < 0.48) spawnAimedBullets();
  else if (roll < 0.72) spawnSpiralBullets();
  else spawnFireworkAttack(0.65);
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
    spawnFireworkAttack(info.isBoss ? 0.9 : 0.65);
    if (info.isBoss) setTimeout(() => spawnFireworkAttack(0.55), 760);
    return;
  }

  if (info.stage === 5) {
    spawnLaserAttack(info.isBoss ? 1.35 : 1);
    if (info.isBoss) {
      setTimeout(() => spawnFireworkAttack(0.55), 680);
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
  const spread = 0.42 + getDifficultyInfo().stage * 0.09;
  const count = Math.min(11, Math.floor((3 + Math.floor(wave / 3)) * multiplier));

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    const angle = baseAngle - spread / 2 + spread * t;
    createBullet(angle, bulletSpeed + 30);
  }
}

function spawnSpiralBullets(multiplier = 1) {
  const baseAngle = performance.now() / (760 - getDifficultyInfo().stage * 70);
  const count = Math.min(18, Math.floor(bulletCount * multiplier));

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
      width: 14 + difficulty.stage * 3,
      warning: 0.95,
      active: 0.38,
      total: 1.33,
      hit: false,
    });
  }
}

function spawnFireworkAttack(multiplier = 1) {
  const info = getDifficultyInfo();
  const baseCount = info.stage >= 5 ? 2 : 1;
  const count = Math.max(1, Math.floor(baseCount * multiplier));

  for (let i = 0; i < count; i++) {
    const angle = Math.PI / 2 + (Math.random() - 0.5) * 0.9;
    bullets.push({
      x: boss.x + (Math.random() - 0.5) * 100,
      y: boss.y,
      vx: Math.cos(angle) * 82,
      vy: Math.sin(angle) * 105,
      radius: 8,
      color: '#ff7a1a',
      splitTime: 1.15 + Math.random() * 0.35,
      splitY: boss.y + 270 + Math.random() * 110,
      splitCount: 3 + Math.floor(info.stage * 1.1) + (info.isBoss ? 1 : 0),
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
  updateStars(dt);
  updateFloatingTexts(dt);
  checkCollisions();

  bulletTimer += dt;
  specialTimer += dt;
  waveTimer -= dt;
  scoreTimer += dt;
  starTimer += dt;

  if (bulletTimer >= fireInterval) {
    bulletTimer = 0;
    spawnPattern();
  }

  if (specialTimer >= (isBossWave(wave) ? 4.2 : 5.8) && getDifficultyInfo().stage >= 3) {
    specialTimer = 0;
    spawnElitePattern();
  }

  if (scoreTimer >= 0.25) {
    scoreTimer = 0;
    score += 1;
  }

  if (starTimer >= STAR_SPAWN_INTERVAL) {
    starTimer = 0;
    spawnStar();
  }

  if (player.invincible > 0) player.invincible -= dt;
  if (player.sleepText > 0) player.sleepText -= dt;

  if (waveTimer <= 0) {
    if (collectedStars < STAR_GOAL) {
      endGame(false);
      return;
    }

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
      const farEnoughFromBoss = bullet.splitY !== undefined && bullet.y >= bullet.splitY;
      if (bullet.splitTime <= 0 || farEnoughFromBoss) {
        for (let i = 0; i < bullet.splitCount; i++) {
          const angle = (Math.PI * 2 * i) / bullet.splitCount + Math.random() * 0.1;
          newBullets.push({
            x: bullet.x,
            y: bullet.y,
            vx: Math.cos(angle) * (bulletSpeed * 0.45),
            vy: Math.sin(angle) * (bulletSpeed * 0.45),
            radius: 5,
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


function spawnStar() {
  if (!currentRunIsInfinite && spawnedStarsThisWave >= MAX_STARS_PER_WAVE) return;

  // 하단 목표/HP 안내 UI와 겹치지 않도록 별은 전투 구역 안쪽에만 생성
  const margin = 42;
  const minY = 138;
  const bottomSafeArea = 126;
  const maxY = canvas.height - bottomSafeArea;
  const star = {
    x: margin + Math.random() * (canvas.width - margin * 2),
    y: minY + Math.random() * Math.max(1, maxY - minY),
    radius: 11,
    pulse: Math.random() * Math.PI * 2,
  };

  stars.push(star);
  spawnedStarsThisWave += 1;
}

function updateStars(dt) {
  stars.forEach((star) => {
    star.pulse += dt * 4;
  });
}

function updateFloatingTexts(dt) {
  floatingTexts.forEach((text) => {
    text.y -= 42 * dt;
    text.life -= dt;
  });
  floatingTexts = floatingTexts.filter((text) => text.life > 0);
}

function checkStarCollisions() {
  for (const star of stars) {
    const distance = Math.hypot(player.x - star.x, player.y - star.y);
    if (distance < player.radius + star.radius) {
      collectedStars += 1;
      stars = stars.filter((item) => item !== star);
      playStarSound();

      if (collectedStars > STAR_GOAL) {
        score += STAR_BONUS_SCORE;
        floatingTexts.push({
          x: player.x + player.radius + 8,
          y: player.y - player.radius - 6,
          text: `+${STAR_BONUS_SCORE}`,
          life: 0.8,
        });
      }
      return;
    }
  }
}

function checkCollisions() {
  checkStarCollisions();

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
  player.sleepText = 0.85;
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
  drawStars();
  drawPlayer();
  drawFloatingTexts();
}

function drawArena() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#2a1238');
  gradient.addColorStop(0.55, '#1a1028');
  gradient.addColorStop(1, '#0b0712');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(255, 204, 102, 0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 32) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 32) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  ctx.fillStyle = 'rgba(255, 120, 180, 0.06)';
  ctx.fillRect(0, 0, canvas.width, 68);
  ctx.fillRect(0, canvas.height - 86, canvas.width, 86);

  if (isBossWave()) {
    ctx.fillStyle = 'rgba(192, 75, 127, 0.16)';
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
  const info = getDifficultyInfo();
  const pulse = Math.sin(performance.now() / 180) * 3;

  ctx.fillStyle = info.isBoss ? 'rgba(255, 84, 148, 0.22)' : 'rgba(255, 204, 102, 0.10)';
  ctx.beginPath();
  ctx.arc(x, y + 8, 70 + pulse + info.stage * 2, 0, Math.PI * 2);
  ctx.fill();

  if (info.stage === 1) drawCloudBoss(x, y);
  else if (info.stage === 2) drawMoonBoss(x, y);
  else if (info.stage === 3) drawOwlBoss(x, y);
  else if (info.stage === 4) drawWerewolfBoss(x, y);
  else drawVampireBoss(x, y);

  ctx.fillStyle = info.color;
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(info.bossName, boss.x, boss.y - 78);
}

function drawCloudBoss(x, y) {
  drawPixelRect(x - 56, y - 22, 112, 44, '#101018');
  drawPixelRect(x - 72, y - 10, 32, 32, '#101018');
  drawPixelRect(x + 40, y - 10, 32, 32, '#101018');
  drawPixelRect(x - 32, y - 42, 64, 32, '#181424');
  drawPixelRect(x - 26, y - 4, 12, 12, '#ffcc66');
  drawPixelRect(x + 14, y - 4, 12, 12, '#ffcc66');
  drawPixelRect(x - 20, y + 20, 40, 8, '#4b1d5a');
}

function drawMoonBoss(x, y) {
  drawPixelRect(x - 16, y - 56, 32, 112, '#ffcc66');
  drawPixelRect(x + 4, y - 44, 34, 88, '#2a1238');
  drawPixelRect(x - 10, y - 14, 8, 8, '#7d295d');
  drawPixelRect(x - 2, y + 18, 22, 6, '#7d295d');
}

function drawOwlBoss(x, y) {
  drawPixelRect(x - 46, y - 48, 92, 88, '#4b1d5a');
  drawPixelRect(x - 60, y - 58, 28, 28, '#2a1238');
  drawPixelRect(x + 32, y - 58, 28, 28, '#2a1238');
  drawPixelRect(x - 34, y - 22, 24, 24, '#ffcc66');
  drawPixelRect(x + 10, y - 22, 24, 24, '#ffcc66');
  drawPixelRect(x - 25, y - 13, 8, 8, '#120812');
  drawPixelRect(x + 19, y - 13, 8, 8, '#120812');
  drawPixelRect(x - 6, y + 2, 12, 14, '#c04b7f');
  drawPixelRect(x - 26, y + 28, 52, 8, '#2a1238');
}

function drawWerewolfBoss(x, y) {
  drawPixelRect(x - 42, y - 46, 84, 86, '#3a2630');
  drawPixelRect(x - 58, y - 58, 28, 30, '#1a1018');
  drawPixelRect(x + 30, y - 58, 28, 30, '#1a1018');
  drawPixelRect(x - 30, y - 16, 16, 16, '#ffcc66');
  drawPixelRect(x + 14, y - 16, 16, 16, '#ffcc66');
  drawPixelRect(x - 20, y - 8, 8, 8, '#08050a');
  drawPixelRect(x + 16, y - 8, 8, 8, '#08050a');
  drawPixelRect(x - 10, y + 8, 20, 12, '#c04b7f');
  drawPixelRect(x - 22, y + 24, 44, 8, '#f5e1d8');
}

function drawVampireBoss(x, y) {
  drawPixelRect(x - 48, y - 50, 96, 96, '#1a0b18');
  drawPixelRect(x - 64, y - 62, 28, 34, '#2a1238');
  drawPixelRect(x + 36, y - 62, 28, 34, '#2a1238');
  drawPixelRect(x - 32, y - 20, 22, 18, '#ff3d7f');
  drawPixelRect(x + 10, y - 20, 22, 18, '#ff3d7f');
  drawPixelRect(x - 20, y + 12, 40, 8, '#f5e1d8');
  drawPixelRect(x - 12, y + 12, 6, 16, '#ffffff');
  drawPixelRect(x + 6, y + 12, 6, 16, '#ffffff');
  drawPixelRect(x - 56, y + 30, 112, 22, '#7d295d');
}

function drawPlayer() {
  const blink = player.invincible > 0 && Math.floor(performance.now() / 90) % 2 === 0;
  if (blink) return;

  const x = Math.round(player.x);
  const y = Math.round(player.y);
  const s = 0.65;

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x - 14 * s, y + 12 * s, 28 * s, 5 * s);

  // pillow
  drawPixelRect(x + 7 * s, y - 3 * s, 13 * s, 18 * s, '#fff4da');
  drawPixelRect(x + 9 * s, y - 1 * s, 9 * s, 14 * s, '#ffd9ec');

  // pajama body
  drawPixelRect(x - 9 * s, y - 2 * s, 18 * s, 20 * s, '#7ec8ff');
  drawPixelRect(x - 8 * s, y + 3 * s, 16 * s, 3 * s, '#416d9c');
  drawPixelRect(x - 8 * s, y + 11 * s, 16 * s, 3 * s, '#416d9c');

  // head and sleep cap
  drawPixelRect(x - 8 * s, y - 18 * s, 16 * s, 14 * s, '#ffd6b3');
  drawPixelRect(x - 10 * s, y - 23 * s, 18 * s, 7 * s, '#c04b7f');
  drawPixelRect(x + 6 * s, y - 26 * s, 7 * s, 7 * s, '#ffcc66');

  // face
  drawPixelRect(x - 4 * s, y - 12 * s, 2 * s, 2 * s, '#2a1238');
  drawPixelRect(x + 4 * s, y - 12 * s, 2 * s, 2 * s, '#2a1238');
  drawPixelRect(x - 3 * s, y - 7 * s, 6 * s, 2 * s, '#7d295d');

  // legs
  drawPixelRect(x - 8 * s, y + 18 * s, 6 * s, 8 * s, '#7ec8ff');
  drawPixelRect(x + 2 * s, y + 18 * s, 6 * s, 8 * s, '#7ec8ff');
  drawPixelRect(x - 9 * s, y + 26 * s, 8 * s, 3 * s, '#fff4da');
  drawPixelRect(x + 1 * s, y + 26 * s, 8 * s, 3 * s, '#fff4da');

  if (player.sleepText > 0) {
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#ffcc66';
    ctx.textAlign = 'center';
    ctx.fillText('Zzz', x, y - 23);
  }
}

function drawBullets() {
  bullets.forEach((bullet) => {
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fillStyle = bullet.color || '#ffd166';
    ctx.fill();
  });
}


function drawStars() {
  stars.forEach((star) => {
    const r = star.radius + Math.sin(star.pulse) * 1.8;
    ctx.save();
    ctx.translate(star.x, star.y);
    ctx.rotate(star.pulse * 0.18);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * i) / 10;
      const radius = i % 2 === 0 ? r : r * 0.45;
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffd166';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  });
}

function drawFloatingTexts() {
  floatingTexts.forEach((item) => {
    ctx.globalAlpha = Math.max(0, item.life / 0.8);
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd166';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 4;
    ctx.strokeText(item.text, item.x, item.y);
    ctx.fillText(item.text, item.x, item.y);
    ctx.globalAlpha = 1;
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
  hpText.textContent = '♥'.repeat(Math.max(0, player.hp)) + '♡'.repeat(Math.max(0, player.maxHp - player.hp));
  const hudInfo = getDifficultyInfo();
  waveText.textContent = `${hudInfo.stage}-${hudInfo.stageWave}`;
  timeText.textContent = Math.max(0, Math.ceil(waveTimer));
  scoreText.textContent = score;
  const difficulty = hudInfo;
  if (starText) {
    starText.textContent = `${Math.min(collectedStars, STAR_GOAL)}/${STAR_GOAL}`;
    starText.parentElement.classList.toggle('star-complete', collectedStars >= STAR_GOAL);
  }

  if (difficultyText) {
    difficultyText.textContent = `${difficulty.name}${difficulty.isBoss ? ' / 보스전' : ''}`;
  }
}

function endGame(isWin) {
  gameState = 'over';
  cancelAnimationFrame(animationId);
  stopAmbience();

  lastResultIsWin = isWin;
  const resultName = isWin ? (currentRunIsInfinite ? '꿈의 균열이 열렸습니다' : '악몽에서 깨어났습니다') : '악몽에 잠식되었습니다';
  resultTitle.textContent = resultName;
  resultText.textContent = `모드: ${currentRunLabel} / 결과: ${resultName} / 도달 웨이브: ${wave}${currentRunIsInfinite ? '' : `/${currentRunEndWave}`} / 별: ${collectedStars}/${STAR_GOAL} / 최종 점수: ${score}`;

  if (isWin) playStageClearSound();
  else playStageFailSound();

  rankSavedThisRun = false;
  if (currentRunIsInfinite) {
    rankForm.classList.remove('hidden');
    nicknameInput.value = '';
    setTimeout(() => nicknameInput.focus(), 100);
  } else {
    rankForm.classList.add('hidden');
  }

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
  const lists = [rankingList, lobbyRankingList].filter(Boolean);

  lists.forEach((list) => {
    list.innerHTML = '';

    if (rankings.length === 0) {
      const emptyItem = document.createElement('li');
      emptyItem.textContent = '아직 저장된 무한모드 기록이 없습니다.';
      list.appendChild(emptyItem);
      return;
    }

    rankings.forEach((rank) => {
      const item = document.createElement('li');
      const resultLabel = rank.result === 'CLEAR' ? '균열 발견' : '잠식';
      item.innerHTML = `<strong>${rank.name}</strong> — ${rank.score}점 <span class="rank-meta">/ Wave ${rank.wave} / ${resultLabel} / ${rank.date}</span>`;
      list.appendChild(item);
    });
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


function getModeFromButton(button) {
  return {
    label: button.dataset.label || '무한모드',
    startWave: Number(button.dataset.start || 1),
    endWave: button.dataset.infinite === 'true' ? null : Number(button.dataset.end || FINAL_WAVE),
    infinite: button.dataset.infinite === 'true',
  };
}

function showLobbyForMode(mode) {
  selectedMode = mode;
  gameState = 'ready';
  cancelAnimationFrame(animationId);
  stopAmbience();
  bullets = [];
  lasers = [];
  dangerZones = [];
  stars = [];
  floatingTexts = [];
  wave = mode.startWave;
  currentRunEndWave = mode.infinite ? null : mode.endWave;
  currentRunIsInfinite = mode.infinite;
  currentRunLabel = mode.label;
  finalWaveText.textContent = mode.infinite ? '∞' : mode.endWave;
  setWaveStats();

  if (startTitle) startTitle.textContent = `${mode.label} 로비`;
  if (lobbyModeText) {
    lobbyModeText.innerHTML = mode.infinite
      ? '당신은 반복되는 악몽에 갇혔습니다.<br />별의 조각을 모아 꿈의 균열을 열고, 끝없이 밀려오는 악몽에서 최대한 오래 버티세요.'
      : `당신은 반복되는 악몽에 갇혔습니다.<br />이 구간은 Wave ${mode.startWave}~${mode.endWave} 악몽입니다. 별의 조각 3개를 모아 꿈의 균열을 열고 다음 악몽으로 이동하세요.`;
  }

  startPanel.classList.remove('hidden');
  upgradePanel.classList.add('hidden');
  gameOverPanel.classList.add('hidden');
  rankForm.classList.add('hidden');
  updateHud();
  draw();
}

modeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    modeButtons.forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    playSelectSound();
    showLobbyForMode(getModeFromButton(button));
  });
});

window.addEventListener('keydown', (event) => { keys[event.key] = true; });
window.addEventListener('keyup', (event) => { keys[event.key] = false; });

function handleStartClick(event) {
  event.preventDefault();
  startGame();
}

startButton.addEventListener('click', handleStartClick);
restartButton.addEventListener('click', () => showLobbyForMode(selectedMode));

soundButton.addEventListener('click', () => {
  audio.enabled = !audio.enabled;
  setSoundButtonText();
  if (audio.enabled && (gameState === 'playing' || gameState === 'upgrade')) startAmbience();
  else stopAmbience();
});


if (volumeSlider) {
  volumeSlider.addEventListener('input', () => {
    audio.volume = Number(volumeSlider.value) / 100;
  });
}

rankForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (rankSavedThisRun) return;

  saveRanking(nicknameInput.value);
  rankSavedThisRun = true;
  rankForm.classList.add('hidden');
  playSaveSound();
  renderRankings();
});

const defaultModeButton = document.querySelector('.mode-button.active') || modeButtons[modeButtons.length - 1];
if (defaultModeButton) selectedMode = getModeFromButton(defaultModeButton);
showLobbyForMode(selectedMode);
renderRankings();
setSoundButtonText();
