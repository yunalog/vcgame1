const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const hpText = document.getElementById('hpText');
const waveText = document.getElementById('waveText');
const finalWaveText = document.getElementById('finalWaveText');
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
const rankForm = document.getElementById('rankForm');
const nicknameInput = document.getElementById('nicknameInput');
const rankingList = document.getElementById('rankingList');

const keys = {};
const FINAL_WAVE = 7;
const RANKING_KEY = 'rogueBossPlayLogs';

let gameState = 'ready';
let lastTime = 0;
let bulletTimer = 0;
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
  if (audio.ctx.state === 'suspended') {
    audio.ctx.resume();
  }
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
  if (slideTo) {
    oscillator.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(gain);
  gain.connect(audio.ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.03);
}

function playHitSound() {
  playTone({ frequency: 150, slideTo: 70, duration: 0.18, type: 'sawtooth', volume: 0.12 });
}

function playStageClearSound() {
  playTone({ frequency: 392, duration: 0.1, type: 'square', volume: 0.08 });
  setTimeout(() => playTone({ frequency: 523, duration: 0.12, type: 'square', volume: 0.08 }), 90);
  setTimeout(() => playTone({ frequency: 784, duration: 0.18, type: 'square', volume: 0.08 }), 180);
}

function playStageFailSound() {
  playTone({ frequency: 180, slideTo: 90, duration: 0.45, type: 'triangle', volume: 0.12 });
  setTimeout(() => playTone({ frequency: 100, slideTo: 55, duration: 0.35, type: 'sawtooth', volume: 0.08 }), 130);
}

function playHoverSound() {
  playTone({ frequency: 620, duration: 0.045, type: 'square', volume: 0.035 });
}

function playSelectSound() {
  playTone({ frequency: 720, duration: 0.08, type: 'square', volume: 0.06 });
}

function playSaveSound() {
  playTone({ frequency: 523, duration: 0.08, type: 'square', volume: 0.06 });
  setTimeout(() => playTone({ frequency: 659, duration: 0.08, type: 'square', volume: 0.06 }), 80);
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
  wave = 1;
  score = 0;
  waveDuration = 20;
  fireInterval = 1.1;
  bulletSpeed = 145;
  bulletCount = 8;
  bulletTimer = 0;
  waveTimer = waveDuration;
  scoreTimer = 0;
  rankSavedThisRun = false;
  lastResultIsWin = false;
  finalWaveText.textContent = FINAL_WAVE;
  updateHud();
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
  waveDuration = Math.min(35, waveDuration + 2);
  fireInterval = Math.max(0.35, fireInterval - 0.09);
  bulletSpeed += 18;
  bulletCount = Math.min(22, bulletCount + 1);
  waveTimer = waveDuration;
  bulletTimer = 0;
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
  if (wave % 3 === 0) {
    spawnSpiralBullets();
  } else if (wave % 2 === 0) {
    spawnAimedBullets();
  } else {
    spawnCircleBullets();
  }
}

function spawnCircleBullets() {
  const angleOffset = Math.random() * Math.PI * 2;

  for (let i = 0; i < bulletCount; i++) {
    const angle = angleOffset + (Math.PI * 2 * i) / bulletCount;
    createBullet(angle, bulletSpeed);
  }
}

function spawnAimedBullets() {
  const baseAngle = Math.atan2(player.y - boss.y, player.x - boss.x);
  const spread = 0.55;
  const count = Math.min(9, 3 + Math.floor(wave / 2));

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    const angle = baseAngle - spread / 2 + spread * t;
    createBullet(angle, bulletSpeed + 30);
  }
}

function spawnSpiralBullets() {
  const baseAngle = performance.now() / 600;
  const count = Math.min(14, bulletCount);

  for (let i = 0; i < count; i++) {
    const angle = baseAngle + (Math.PI * 2 * i) / count;
    createBullet(angle, bulletSpeed + 20);
  }
}

function createBullet(angle, speed) {
  bullets.push({
    x: boss.x,
    y: boss.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: 7,
  });
}

function update(dt) {
  updatePlayer(dt);
  updateBullets(dt);
  checkCollisions();

  bulletTimer += dt;
  waveTimer -= dt;
  scoreTimer += dt;

  if (bulletTimer >= fireInterval) {
    bulletTimer = 0;
    spawnPattern();
  }

  if (scoreTimer >= 0.25) {
    scoreTimer = 0;
    score += 1;
  }

  if (player.invincible > 0) {
    player.invincible -= dt;
  }

  if (waveTimer <= 0) {
    score += wave * 25;
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
  bullets.forEach((bullet) => {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
  });

  bullets = bullets.filter((bullet) => {
    return (
      bullet.x > -40 &&
      bullet.x < canvas.width + 40 &&
      bullet.y > -40 &&
      bullet.y < canvas.height + 40
    );
  });
}

function checkCollisions() {
  if (player.invincible > 0) return;

  for (const bullet of bullets) {
    const distance = Math.hypot(player.x - bullet.x, player.y - bullet.y);

    if (distance < player.radius + bullet.radius) {
      player.hp -= 1;
      player.invincible = 1.1 + (player.invincibleBonus || 0);
      bullets = bullets.filter((item) => item !== bullet);
      playHitSound();

      if (player.hp <= 0) {
        endGame(false);
      }
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
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.lineWidth = 1;

  for (let x = 0; x < canvas.width; x += 45) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y < canvas.height; y += 45) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function drawPixelRect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function drawBoss() {
  const x = boss.x;
  const y = boss.y;
  const pulse = Math.sin(performance.now() / 180) * 2;

  ctx.fillStyle = 'rgba(255, 0, 50, 0.14)';
  ctx.beginPath();
  ctx.arc(x, y + 6, 72 + pulse * 3, 0, Math.PI * 2);
  ctx.fill();

  drawPixelRect(x - 56, y - 42, 20, 18, '#1a0508');
  drawPixelRect(x + 36, y - 42, 20, 18, '#1a0508');
  drawPixelRect(x - 68, y - 60, 16, 16, '#7c0712');
  drawPixelRect(x + 52, y - 60, 16, 16, '#7c0712');
  drawPixelRect(x - 42, y - 34, 84, 68, '#8e0e18');
  drawPixelRect(x - 30, y - 22, 60, 48, '#1a0508');
  drawPixelRect(x - 20, y - 10, 12, 12, '#ff3030');
  drawPixelRect(x + 8, y - 10, 12, 12, '#ff3030');
  drawPixelRect(x - 18, y + 14, 36, 8, '#d6d6d6');
  drawPixelRect(x - 10, y + 14, 4, 10, '#050505');
  drawPixelRect(x + 6, y + 14, 4, 10, '#050505');
  drawPixelRect(x - 50, y + 22, 18, 28, '#1a0508');
  drawPixelRect(x + 32, y + 22, 18, 28, '#1a0508');

  ctx.fillStyle = 'white';
  ctx.font = 'bold 18px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`DEMON Lv.${wave}`, boss.x, boss.y - 78);
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
    ctx.fillStyle = '#ffd166';
    ctx.fill();
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
  stopAmbience();

  lastResultIsWin = isWin;
  resultTitle.textContent = isWin ? 'Ending Clear!' : 'Game Over';
  resultText.textContent = `결과: ${isWin ? '엔딩 클리어' : '게임오버'} / 도달 웨이브: ${wave}/${FINAL_WAVE} / 최종 점수: ${score}`;

  if (isWin) {
    playStageClearSound();
  } else {
    playStageFailSound();
  }

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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

window.addEventListener('keydown', (event) => {
  keys[event.key] = true;
});

window.addEventListener('keyup', (event) => {
  keys[event.key] = false;
});

function handleStartClick(event) {
  event.preventDefault();
  startGame();
}

startButton.addEventListener('click', handleStartClick);
restartButton.addEventListener('click', handleStartClick);

soundButton.addEventListener('click', () => {
  audio.enabled = !audio.enabled;
  setSoundButtonText();
  if (audio.enabled && (gameState === 'playing' || gameState === 'upgrade')) {
    startAmbience();
  } else {
    stopAmbience();
  }
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
