export class AudioManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
        this.masterGain.gain.value = 0.5; // Main volume
    }

    async init() {
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
    }

    // Sound A: Mid-pitch short whistle (800Hz)
    // "Chu"
    playA(time) {
        this.playTone(time, 800, 'triangle', 0.1, 0.1);
    }

    // Sound B: Low-pitch long whistle (600Hz)
    // "Whoooo"
    playB(time) {
        this.playTone(time, 600, 'sine', 0.3, 0.2); // Longer duration
    }

    // Sound C: High-pitch short whistle (1200Hz)
    // "Peep"
    playC(time) {
        this.playTone(time, 1200, 'triangle', 0.05, 0.1); // Shorter
    }

    // Sound D: Mid-pitch short drum ("Pung")
    playD(time) {
        this.playDrum(time, 200, 100, 0.1);
    }

    // Sound E: High-pitch short drum ("Pa")
    playE(time) {
        this.playDrum(time, 400, 200, 0.08); // Higher pitch, shorter
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
        osc.frequency.exponentialRampToValueAtTime(endFreq, time + duration); // Pitch drop
        
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

        // Bandpass filter to make it sound more like a cymbal (high freq)
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
