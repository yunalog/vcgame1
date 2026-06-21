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

const boss = {
  x: canvas.width / 2,
  y: 95,
  radius: 34,
};

let bullets = [];
let wave = 1;
let score = 0;

const audio = {
  ctx: null,
  masterGain: null,
  bgGain: null,
  droneOsc: null,
  pulseOsc: null,
  lfo: null,
  lfoGain: null,
  noiseSource: null,
  noiseGain: null,
  noiseFilter: null,
  enabled: true,
  started: false,
};

function setupAudio() {
  if (audio.ctx) return;

  audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
  audio.masterGain = audio.ctx.createGain();
  audio.masterGain.gain.value = audio.enabled ? 0.55 : 0;
  audio.masterGain.connect(audio.ctx.destination);

  audio.bgGain = audio.ctx.createGain();
  audio.bgGain.gain.value = 0.045;
  audio.bgGain.connect(audio.masterGain);

  const now = audio.ctx.currentTime;

  audio.droneOsc = audio.ctx.createOscillator();
  audio.droneOsc.type = 'sine';
  audio.droneOsc.frequency.value = 58;

  audio.pulseOsc = audio.ctx.createOscillator();
  audio.pulseOsc.type = 'triangle';
  audio.pulseOsc.frequency.value = 87;

  audio.lfo = audio.ctx.createOscillator();
  audio.lfo.type = 'sine';
  audio.lfo.frequency.value = 0.13;

  audio.lfoGain = audio.ctx.createGain();
  audio.lfoGain.gain.value = 0.025;
  audio.lfo.connect(audio.lfoGain);
  audio.lfoGain.connect(audio.bgGain.gain);

  const noiseBuffer = audio.ctx.createBuffer(1, audio.ctx.sampleRate * 2, audio.ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  audio.noiseSource = audio.ctx.createBufferSource();
  audio.noiseSource.buffer = noiseBuffer;
  audio.noiseSource.loop = true;

  audio.noiseFilter = audio.ctx.createBiquadFilter();
  audio.noiseFilter.type = 'lowpass';
  audio.noiseFilter.frequency.value = 420;

  audio.noiseGain = audio.ctx.createGain();
  audio.noiseGain.gain.value = 0.015;

  audio.droneOsc.connect(audio.bgGain);
  audio.pulseOsc.connect(audio.bgGain);
  audio.noiseSource.connect(audio.noiseFilter);
  audio.noiseFilter.connect(audio.noiseGain);
  audio.noiseGain.connect(audio.masterGain);

  audio.droneOsc.start(now);
  audio.pulseOsc.start(now);
  audio.lfo.start(now);
  audio.noiseSource.start(now);
  audio.started = true;
}

function resumeAudio() {
  setupAudio();
  if (audio.ctx.state === 'suspended') {
    audio.ctx.resume();
  }
}

function setSoundEnabled(enabled) {
  audio.enabled = enabled;
  soundButton.textContent = enabled ? 'Sound ON' : 'Sound OFF';
  soundButton.classList.toggle('muted', !enabled);

  if (audio.masterGain) {
    const now = audio.ctx.currentTime;
    audio.masterGain.gain.cancelScheduledValues(now);
    audio.masterGain.gain.setTargetAtTime(enabled ? 0.55 : 0, now, 0.04);
  }
}

function playHitSound() {
  if (!audio.enabled) return;
  resumeAudio();

  const now = audio.ctx.currentTime;
  const hitOsc = audio.ctx.createOscillator();
  const hitGain = audio.ctx.createGain();
  const noiseBuffer = audio.ctx.createBuffer(1, audio.ctx.sampleRate * 0.15, audio.ctx.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);

  for (let i = 0; i < noiseData.length; i++) {
    noiseData[i] = Math.random() * 2 - 1;
  }

  const noise = audio.ctx.createBufferSource();
  const noiseFilter = audio.ctx.createBiquadFilter();
  const noiseGain = audio.ctx.createGain();

  hitOsc.type = 'sawtooth';
  hitOsc.frequency.setValueAtTime(170, now);
  hitOsc.frequency.exponentialRampToValueAtTime(55, now + 0.12);

  hitGain.gain.setValueAtTime(0.001, now);
  hitGain.gain.exponentialRampToValueAtTime(0.32, now + 0.015);
  hitGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 900;
  noiseFilter.Q.value = 0.8;

  noiseGain.gain.setValueAtTime(0.22, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

  hitOsc.connect(hitGain);
  hitGain.connect(audio.masterGain);
  noise.buffer = noiseBuffer;
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(audio.masterGain);

  hitOsc.start(now);
  noise.start(now);
  hitOsc.stop(now + 0.18);
  noise.stop(now + 0.15);
}

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
}

function showUpgradePanel() {
  upgradeCards.innerHTML = '';
  const picked = [...upgrades].sort(() => Math.random() - 0.5).slice(0, 3);

  picked.forEach((upgrade) => {
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
      playHitSound();
      player.invincible = 1.1 + (player.invincibleBonus || 0);
      bullets = bullets.filter((item) => item !== bullet);

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
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
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

function drawBoss() {
  ctx.beginPath();
  ctx.arc(boss.x, boss.y, boss.radius, 0, Math.PI * 2);
  ctx.fillStyle = '#ff5c8a';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(boss.x - 12, boss.y - 7, 5, 0, Math.PI * 2);
  ctx.arc(boss.x + 12, boss.y - 7, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#13172b';
  ctx.fill();

  ctx.fillStyle = 'white';
  ctx.font = 'bold 18px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`BOSS Lv.${wave}`, boss.x, boss.y - 48);
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

window.addEventListener('keydown', (event) => {
  keys[event.key] = true;
});

window.addEventListener('keyup', (event) => {
  keys[event.key] = false;
});

soundButton.addEventListener('click', () => {
  resumeAudio();
  setSoundEnabled(!audio.enabled);
});

startButton.addEventListener('click', startGame);
resoundButton.addEventListener('click', () => {
  resumeAudio();
  setSoundEnabled(!audio.enabled);
});

startButton.addEventListener('click', startGame);

setSoundEnabled(true);
resetGame();
draw();
