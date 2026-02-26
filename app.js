// --- AUDIO MANAGER ---
class AudioManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
        this.masterGain.gain.value = 1.0; // Main volume tuned down slightly
    }

    async init() {
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
    }

    // Sound A: Mid-pitch short whistle (800Hz)
    playA(time) {
        this.playTone(time, 800, 'triangle', 0.1, 0.5);
    }

    // Sound B: Low-pitch long whistle (600Hz)
    playB(time) {
        this.playTone(time, 600, 'sine', 0.3, 0.6);
    }

    // Sound C: High-pitch short whistle (1200Hz)
    playC(time) {
        this.playTone(time, 1200, 'triangle', 0.05, 0.5);
    }

    // Sound D: Mid-pitch short drum ("Pung")
    playD(time) {
        this.playDrum(time, 200, 100, 0.1);
    }

    // Sound E: High-pitch short drum ("Pa")
    playE(time) {
        this.playDrum(time, 400, 200, 0.08);
    }

    // Sound F: Cymbals (Noise burst)
    playF(time) {
        this.playNoise(time, 0.1);
    }

    // Helper: Play Tonal Sound
    playTone(time, freq, type, duration, vol) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(vol, time + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(time);
        osc.stop(time + duration + 0.1);
    }

    // Helper: Play Drum Sound (Sweep)
    playDrum(time, startFreq, endFreq, duration) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.frequency.setValueAtTime(startFreq, time);
        osc.frequency.exponentialRampToValueAtTime(endFreq, time + duration);

        gain.gain.setValueAtTime(0.8, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(time);
        osc.stop(time + duration);
    }

    // Helper: Play Noise (Cymbal/Hi-hat ish)
    playNoise(time, duration) {
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 5000;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.3, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        noise.start(time);
        noise.stop(time + duration);
    }

    getCurrentTime() {
        return this.ctx.currentTime;
    }
}

// --- GAME LOGIC ---
const ANIMALS = [
    '🐭', '🐮', '🐯', '🐰', '🐲', '🐍', '🐴', '🐏', '🐵',
    '🐔', '🐶', '🐷', '🦆', '🦁', '🐘', '🐱', '🐟', '🐢'
];

const ANAN1 = [
    '船', '床', '張', '詹', '山', '商', '辦', '棒'
];

const SHENREN = [
    '真', '蒸', '身', '聲', '人', '仍', '神', '繩'
];

const SPEEDS = {
    1: 0.5,
    2: 0.4,
    3: 0.3,
    4: 0.26,
    5: 0.22
};

class Game {
    constructor() {
        this.audio = new AudioManager();
        this.state = 'IDLE';
        this.params = {
            speed: 2,
            totalLevels: 10,
            poolSize: 18,
            poolType: 'animals',
            complexity: 'random',
            fixedCount: 3
        };

        this.currentLevel = 0;
        this.data = { levels: [] };

        this.loopId = null;
        this.timerId = null;
        this.nextNoteTime = 0;
        this.currentBeat = 0;
        this.tempo = SPEEDS[2];

        this.gridCells = document.querySelectorAll('.grid-cell');
        this.statusText = document.getElementById('status-text');
        this.levelDisplay = document.getElementById('current-level');
        this.totalLevelDisplay = document.getElementById('total-levels');
    }

    setParams(params) {
        this.params = { ...this.params, ...params };
        this.tempo = SPEEDS[this.params.speed];
    }

    async start() {
        await this.audio.init();
        this.generateLevels();
        this.currentLevel = 1;
        this.currentBeat = 0;
        this.nextNoteTime = this.audio.getCurrentTime() + 0.5;
        this.state = 'PLAYING';
        this.scheduler();
        this.renderLoop();
        console.log('Game Started');
    }

    restart(resetParams = false) {
        this.stop();
        if (resetParams) {
            // Handled by UI reset
        } else {
            this.start();
        }
    }

    stop() {
        this.state = 'IDLE';
        cancelAnimationFrame(this.loopId);
        clearTimeout(this.timerId);
    }

    pause() {
        if (this.state === 'PLAYING') {
            this.state = 'PAUSED';
            this.pauseTime = this.audio.getCurrentTime();
            clearTimeout(this.timerId);
        }
    }

    resume() {
        if (this.state === 'PAUSED') {
            this.state = 'PLAYING';
            const now = this.audio.getCurrentTime();
            // nextNoteTime needs to be shifted by the duration we were paused
            // current 'now' is much larger than 'pauseTime'.
            // The difference (now - pauseTime) is how long we slept.
            // We need to ADD this difference to nextNoteTime to push it into the future.
            this.nextNoteTime += (now - this.pauseTime);
            this.scheduler();
            this.renderLoop();
        }
    }

    generateLevels() {
        this.data.levels = [];
        let sourcePool = ANIMALS;
        if (this.params.poolType === 'anan1') sourcePool = ANAN1;
        if (this.params.poolType === 'shenren') sourcePool = SHENREN;
        const sessionPool = sourcePool.slice(0, this.params.poolSize);

        for (let i = 0; i < this.params.totalLevels; i++) {
            let count = 0;
            const levelNum = i + 1;

            if (this.params.complexity === 'fixed') {
                count = parseInt(this.params.fixedCount);
            } else if (this.params.complexity === 'increasing') {
                // L1: 2, L2: 3 ... L7+: 8
                count = Math.min(8, levelNum + 1);
            } else {
                // Random 2-8
                count = Math.floor(Math.random() * (8 - 2 + 1)) + 2;
            }

            count = Math.min(count, this.params.poolSize);
            const levelAnimals = this.shuffleArray([...sessionPool]).slice(0, count);

            const grid = [...levelAnimals];
            while (grid.length < 8) {
                grid.push(levelAnimals[Math.floor(Math.random() * levelAnimals.length)]);
            }
            this.shuffleArray(grid);

            this.data.levels.push({
                grid: grid,
                animals: levelAnimals
            });
        }
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    scheduler() {
        if (this.state !== 'PLAYING') return;

        while (this.nextNoteTime < this.audio.getCurrentTime() + 0.1) {
            this.scheduleBeat(this.currentBeat, this.nextNoteTime);
            this.nextNote();
        }
        this.timerId = setTimeout(() => this.scheduler(), 25);
    }

    nextNote() {
        this.nextNoteTime += this.tempo;
        this.currentBeat++;
        if (this.currentBeat >= 16) {
            this.currentBeat = 0;
            this.currentLevel++;
            if (this.currentLevel > this.params.totalLevels) {
                // Don't advance, just finish
                setTimeout(() => this.finishGame(), this.tempo * 1000);
            }
        }
    }

    scheduleBeat(beat, time) {
        if (this.currentLevel > this.params.totalLevels) return;

        const level = this.currentLevel;

        // Audio
        this.audio.playA(time);

        if (beat < 8) {
            this.audio.playB(time);
            this.audio.playC(time);
        }

        if ((beat + 1) % 2 === 0) {
            this.audio.playF(time);
        }

        // Sub-beats for D/E
        const sub1 = beat * 2;
        const sub2 = beat * 2 + 1;

        const playDE = (subIndex, offset) => {
            const patternIndex = subIndex % 4;
            if (patternIndex === 2) {
                this.audio.playE(time + offset);
            } else {
                this.audio.playD(time + offset);
            }
        };

        playDE(sub1, 0);
        playDE(sub2, this.tempo / 2);

        // Visuals Trigger
        const delay = (time - this.audio.getCurrentTime()) * 1000;
        setTimeout(() => {
            this.handleVisuals(level, beat);
        }, Math.max(0, delay));
    }

    handleVisuals(levelNum, beat) {
        // Allow visuals to update if playing OR recently finished (for the last beat)
        if (this.state !== 'PLAYING' && this.state !== 'FINISHED') return;
        if (levelNum > this.params.totalLevels) return;

        const levelData = this.data.levels[levelNum - 1];

        // BEAT 0: SHOW GRID
        if (beat === 0) {
            this.levelDisplay.innerText = levelNum;
            this.totalLevelDisplay.innerText = this.params.totalLevels;
            this.statusText.innerText = '準備...';
            this.statusText.style.color = '#fbbf24';
            this.renderGrid(levelData.grid);
        }

        // BEAT 8: ACTION
        if (beat === 8) {
            this.statusText.innerText = 'Action!';
            this.statusText.style.color = '#f43f5e';
        }

        this.gridCells.forEach(c => c.classList.remove('active'));

        // LIGHT UP
        if (beat >= 8 && beat < 16) {
            const gridIndex = beat - 8;
            if (this.gridCells[gridIndex]) {
                this.gridCells[gridIndex].classList.add('active');
            }
        }
    }

    renderGrid(icons) {
        this.gridCells.forEach((cell, i) => {
            cell.innerText = icons[i];
            cell.classList.remove('pop-in');
            void cell.offsetWidth;
            cell.classList.add('pop-in');
        });
    }

    renderLoop() {
        if (this.state === 'PLAYING') {
            this.loopId = requestAnimationFrame(() => this.renderLoop());
        }
    }

    finishGame() {
        this.stop();
        this.state = 'FINISHED';
        this.statusText.innerText = '完成!';
        this.statusText.style.color = '#4ade80';

        // Show End Screen with delay
        setTimeout(() => {
            const overlay = document.getElementById('overlay');
            const endModal = document.getElementById('end-modal');
            const pauseModal = document.getElementById('pause-modal');

            overlay.classList.remove('hidden');
            endModal.classList.remove('hidden');
            pauseModal.classList.add('hidden');
        }, 1000);
    }
}

// --- APP GLUE ---
class App {
    constructor() {
        this.game = new Game();
        this.bindEvents();
        this.triggerInitialUpdates();
    }

    bindEvents() {
        this.addInputListener('speed-input', (val) => {
            const speeds = { 1: '0.5', 2: '0.4', 3: '0.3', 4: '0.26', 5: '0.22' };
            document.getElementById('speed-display').innerText = `Level ${val} (${speeds[val]}s)`;
        });

        this.addInputListener('levels-input', (val) => {
            document.getElementById('levels-display').innerText = `${val} 關`;
        });

        this.addInputListener('pool-input', (val) => {
            document.getElementById('pool-display').innerText = `${val} 種`;
        });

        document.getElementsByName('pool-type').forEach(r => {
            r.addEventListener('change', (e) => {
                const poolType = e.target.value;
                const poolInput = document.getElementById('pool-input');
                const poolLabel = document.getElementById('pool-label');

                let maxPool = 18;
                if (poolType === 'anan1' || poolType === 'shenren') {
                    maxPool = 8;
                    poolLabel.innerText = '圖案庫數量 (2-8)';
                } else {
                    poolLabel.innerText = '圖案庫數量 (2-18)';
                }

                poolInput.max = maxPool;
                if (parseInt(poolInput.value) > maxPool) {
                    poolInput.value = maxPool;
                }
                poolInput.dispatchEvent(new Event('input'));
            });
        });

        this.addInputListener('fixed-count-input', (val) => {
            document.getElementById('fixed-count-display').innerText = `${val} 個`;
        });

        document.getElementsByName('complexity').forEach(r => {
            r.addEventListener('change', (e) => {
                const fixedGroup = document.getElementById('fixed-count-group');
                fixedGroup.style.display = (e.target.value === 'fixed') ? 'flex' : 'none';
            });
        });

        document.getElementById('start-btn').addEventListener('click', () => this.startGame());

        document.getElementById('pause-btn').addEventListener('click', () => {
            this.game.pause();
            document.getElementById('overlay').classList.remove('hidden');
            document.getElementById('pause-modal').classList.remove('hidden');
            document.getElementById('end-modal').classList.add('hidden');
        });

        document.getElementById('resume-btn').addEventListener('click', () => {
            this.game.resume();
            document.getElementById('overlay').classList.add('hidden');
        });

        document.getElementById('restart-level-btn').addEventListener('click', () => {
            this.game.restart();
            document.getElementById('overlay').classList.add('hidden');
        });

        document.getElementById('restart-game-btn').addEventListener('click', () => {
            this.game.stop();
            document.getElementById('game-screen').classList.remove('active');
            document.getElementById('start-screen').classList.add('active');
            document.getElementById('overlay').classList.add('hidden');
        });

        // End Screen Buttons
        document.getElementById('end-restart-btn').addEventListener('click', () => {
            this.game.restart();
            document.getElementById('overlay').classList.add('hidden');
        });

        document.getElementById('end-newgame-btn').addEventListener('click', () => {
            this.game.stop();
            document.getElementById('game-screen').classList.remove('active');
            document.getElementById('start-screen').classList.add('active');
            document.getElementById('overlay').classList.add('hidden');
        });
    }

    addInputListener(id, callback) {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', (e) => callback(e.target.value));
        }
    }

    triggerInitialUpdates() {
        document.getElementById('speed-input').dispatchEvent(new Event('input'));
        document.getElementById('levels-input').dispatchEvent(new Event('input'));
        document.getElementById('pool-input').dispatchEvent(new Event('input'));
        document.getElementById('fixed-count-input').dispatchEvent(new Event('input'));
    }

    startGame() {
        const speed = parseInt(document.getElementById('speed-input').value);
        const totalLevels = parseInt(document.getElementById('levels-input').value);
        const poolSize = parseInt(document.getElementById('pool-input').value);

        let poolType = 'animals';
        document.getElementsByName('pool-type').forEach(r => {
            if (r.checked) poolType = r.value;
        });

        let complexity = 'random';
        document.getElementsByName('complexity').forEach(r => {
            if (r.checked) complexity = r.value;
        });

        const fixedCount = parseInt(document.getElementById('fixed-count-input').value);

        this.game.setParams({ speed, totalLevels, poolSize, poolType, complexity, fixedCount });

        document.getElementById('start-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('active');

        this.game.start();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new App();
});
