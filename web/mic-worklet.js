// Turns microphone audio into 24 kHz mono PCM16 in 40 ms chunks for the server's speech socket.
// Each message is {pcm: ArrayBuffer, rms}; rms (0..1) drives the open-mic voice detector.
const OUT_RATE = 24000, CHUNK = 960;

class MicTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / OUT_RATE;
    this.pos = 0;      // read position into the current block; -1 is the last sample of the previous block
    this.prev = 0;
    this.buf = new Int16Array(CHUNK);
    this.n = 0;
    this.sq = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch || !ch.length) return true;
    const len = ch.length;
    let pos = this.pos;
    // linear interpolation; mic input is already band-limited enough for speech recognition
    while (pos <= len - 1) {
      const i = Math.floor(pos), f = pos - i;
      const a = i < 0 ? this.prev : ch[i];
      const s = f && i + 1 < len ? a + (ch[i + 1] - a) * f : a;
      const c = s < -1 ? -1 : s > 1 ? 1 : s;
      this.buf[this.n++] = c * 32767;
      this.sq += c * c;
      if (this.n === CHUNK) {
        const out = this.buf.slice().buffer;
        this.port.postMessage({ pcm: out, rms: Math.sqrt(this.sq / CHUNK) }, [out]);
        this.n = 0; this.sq = 0;
      }
      pos += this.step;
    }
    this.pos = pos - len;
    this.prev = ch[len - 1];
    return true;
  }
}
registerProcessor('mic-tap', MicTap);
