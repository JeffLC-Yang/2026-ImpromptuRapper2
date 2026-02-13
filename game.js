import { AudioManager } from './audio.js';

const ANIMALS = [
    '🐭', '🐮', '🐯', '🐰', '🐲', '🐍', '🐴', '🐏', '🐵',
    '🐔', '🐶', '🐷', '🦆', '🦁', '🐘', '🐱', '🐟', '🐢'
];

// Speed Levels (Seconds per beat)
const SPEEDS = {
    1: 0.5,
    2: 0.4,
    3: 0.3,
    4: 0.26,
    5: 0.22
};

export class Game {
    constructor() {
        this.audio = new AudioManager();
        this.state = 'IDLE'; // IDLE, PLAYING, PAUSED, FINISHED
        this.params = {
            speed: 2,
            totalLevels: 10,
            poolSize: 18,
            complexity: 'random',
            fixedCount: 3
        };

        this.currentLevel = 0;
        this.data = {
            levels: []
        };

        this.loopId = null;
        this.nextNoteTime = 0;
        this.currentBeat = 0; // 0-15 (Total 16 beats)
        this.tempo = SPEEDS[2]; // seconds per beat

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
        this.nextNoteTime = this.audio.getCurrentTime() + 0.5; // Start after 0.5s delay
        this.state = 'PLAYING';
        this.updateVisualsClean();
        this.scheduler();
        this.renderLoop();
        console.log('Game Started w/ Params:', this.params);
    }

    restart(resetParams = false) {
        this.stop();
        if (resetParams) {
            // Logic handled by App (UI switch)
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
        }
    }

    resume() {
        if (this.state === 'PAUSED') {
            this.state = 'PLAYING';
            // Adjust nextNoteTime based on how long we were paused
            const now = this.audio.getCurrentTime();
            this.nextNoteTime += (now - this.pauseTime);
            this.scheduler();
            this.renderLoop();
        }
    }

    generateLevels() {
        this.data.levels = [];
        // Pool of animals to use for the WHOLE game session
        const sessionPool = ANIMALS.slice(0, this.params.poolSize);

        for (let i = 0; i < this.params.totalLevels; i++) {
            let count = 0;
            const levelNum = i + 1;

            if (this.params.complexity === 'fixed') {
                count = parseInt(this.params.fixedCount);
            } else if (this.params.complexity === 'increasing') {
                // L1: 2, L2: 3, L3: 4 ... L7+: 8
                count = Math.min(8, levelNum + 1);
            } else {
                // Random 2-8
                count = Math.floor(Math.random() * (8 - 2 + 1)) + 2;
            }

            // Cap by pool size
            count = Math.min(count, this.params.poolSize);

            // Select 'count' unique animals from sessionPool
            const levelAnimals = this.shuffleArray([...sessionPool]).slice(0, count);

            // Fill 8 grid slots with these animals randomly
            const grid = [];
            for (let j = 0; j < 8; j++) {
                grid.push(levelAnimals[Math.floor(Math.random() * levelAnimals.length)]);
            }

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

        // Schedule ahead
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
                this.finishGame();
            } else {
                // Prepare visual update for next level? 
                // Actually visual update happens on beat 0 of new level
            }
        }
    }

    scheduleBeat(beat, time) {
        if (this.currentLevel > this.params.totalLevels) return;

        // --- AUDIO SCHEDULING ---
        // A: Every beat (0-15) - "Chu" (Metronome)
        // Except maybe silent on specific beats? User said "A is mid short whistle... done on beats". 
        // Assuming all 16 beats given context.
        this.audio.playA(time);

        // B: Low Long Whistle - First 8 beats (0-7), with A.
        if (beat < 8) {
            this.audio.playB(time);
        }

        // C: High Short Whistle - First 8 beats (0-7), with A.
        if (beat < 8) {
            this.audio.playC(time);
        }

        // F: Cymbals - Even beats: 2,4,6,8,10,12,14,16 (Indices 1,3,5,7,9,11,13,15)
        if ((beat + 1) % 2 === 0) {
            this.audio.playF(time);
        }

        // D & E: 32nd notes pattern. "DDED DDED DDED DDED..."
        // Pattern len = 4 (DDED). 
        // One beat = 2 sub-beats (since D&E are half-beat duration?)
        // User says: "D&E appear on 16 beats... but patter is half of beat... 32 times"
        // So for each Beat 'i', we have 2 sub-events: at 'time' and 'time + tempo/2'
        // Pattern String: D D E D (Repeat 8 times to get 32)
        // Seq: 
        // Beat 0: D (0.0), D (0.5)
        // Beat 1: E (0.0), D (0.5) 
        // Beat 2: D (0.0), D (0.5)
        // Beat 3: E (0.0), D (0.5) ... Wait logic check
        // Pattern: D D E D D D E D ...
        // Index 0: D, 1: D, 2: E, 3: D.
        // Beat 0 covers Index 0, 1.
        // Beat 1 covers Index 2, 3.
        // Beat 2 covers Index 0, 1 (Reset pattern? or continuous?)
        // "DDED DDED..." implies continuous repeating 4-step pattern.

        // Let's map global sub-beat index (0-31)
        const sub1 = beat * 2;
        const sub2 = beat * 2 + 1;

        const playDE = (subIndex, offset) => {
            const patternIndex = subIndex % 4; // 0,1,2,3
            // Pattern: 0=D, 1=D, 2=E, 3=D
            if (patternIndex === 2) {
                this.audio.playE(time + offset);
            } else {
                this.audio.playD(time + offset);
            }
        };

        playDE(sub1, 0);
        playDE(sub2, this.tempo / 2);


        // --- VISUAL SCHEDULING (Approximate sync) ---
        // Use requestAnimationFrame for immediate updates, 
        // but set "Timeouts" for precise future visuals if needed.
        // Since we are in a lookahead, we queue drawing commands.
        // Or simpler: We just use the fact that Audio is scheduled ahead, 
        // but visuals trigger roughly NOW or slightly delayed.
        // For a simple game, triggering visual callback based on time difference is better.

        const delay = (time - this.audio.getCurrentTime()) * 1000;
        setTimeout(() => {
            this.handleVisuals(this.currentLevel, beat);
        }, Math.max(0, delay));
    }

    handleVisuals(levelNum, beat) {
        if (this.state !== 'PLAYING') return;
        if (levelNum > this.params.totalLevels) return;

        // Level Data (0-based index)
        const levelData = this.data.levels[levelNum - 1];

        // BEAT 0: PREPARE LEVEL (Show Grid)
        if (beat === 0) {
            this.levelDisplay.innerText = levelNum;
            this.totalLevelDisplay.innerText = this.params.totalLevels;
            this.statusText.innerText = '準備...';
            this.statusText.style.color = '#fbbf24'; // Amber
            this.renderGrid(levelData.grid);
        }

        // BEAT 8: START ACTION TEXT
        if (beat === 8) {
            this.statusText.innerText = 'Action!';
            this.statusText.style.color = '#f43f5e'; // Red
        }

        // Reset all active cells first
        this.gridCells.forEach(c => c.classList.remove('active'));

        // LIGHT UP LOGIC
        // Top Row: Beats 1, 2, 3, 4 (Indices 0-3) -> Grid 0, 1, 2, 3
        // Prompt: "Beat 1 lights top-left... Beat 4 lights 4th"
        // Prompt says "From 5th beat... bottom row"
        // Let's map Beat (1-based) to Grid Index.
        // Beat 0: Prep (No light)
        // Wait, prompt: "Next 8 beats... 1-4 top row... 5-8 bottom row"
        // This means beats 8,9,10,11 (0-indexed) are Top Row?
        // Let's re-read carefully:
        // "First 8 beats... prep" (0-7)
        // "Next 8 beats... 1st beat lights top-left..." (8-15)
        // So Beat 8 (Game Beat) = Action Beat 1 -> Grid 0
        // Beat 9 -> Grid 1
        // ...
        // Beat 15 -> Grid 7

        if (beat >= 8 && beat < 16) {
            const gridIndex = beat - 8;
            const cell = this.gridCells[gridIndex];
            if (cell) {
                cell.classList.add('active');
                // Auto remove after some time? CSS transition handles fade in, 
                // we should remove 'active' on next beat or short timeout.
                // But code above "Reset all active cells" handles cleanup for next frame.
            }
        }
    }

    renderGrid(icons) {
        this.gridCells.forEach((cell, i) => {
            cell.innerText = icons[i];
            cell.classList.remove('pop-in');
            // Force reflow
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
        this.state = 'FINISHED';
        this.statusText.innerText = '完成!';
        this.statusText.style.color = '#4ade80'; // Green
        setTimeout(() => {
            alert('Game Over! Good job!');
            // Show overlay or restart
            document.getElementById('restart-game-btn').click();
        }, 1000);
    }
}
