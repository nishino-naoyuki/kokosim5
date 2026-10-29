/**
 * Web Audio API による高校野球シンセサイザー効果音エンジン
 * 外部音声ファイル不要・完全自前生成でゼロ遅延＆PC・スマホ両対応
 */
class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  private getContext(): AudioContext | null {
    if (this.isMuted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  /**
   * 1. 捕球音（パシィン！：キャッチャーミットの鋭い革の破裂音＋低音の芯）
   */
  playMittCatch(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // ミットの革破裂音（帯域制限ホワイトノイズ）
    const bufSize = Math.floor(ctx.sampleRate * 0.08);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.22));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(850, now);
    filter.Q.setValueAtTime(3.2, now);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.75, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    // ボールがミット芯に届いた衝撃の低域 thump
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.07);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.45, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(ctx.destination);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);

    noise.start(now);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  /**
   * 2. 打撃音（カキーン！：甲子園特有の金属バット共鳴音＋鋭い芯のヒット感）
   */
  playBatHit(isHomerun = false): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 金属バットの高域倍音共鳴（2280Hz & 1140Hz）
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(2280, now);
    osc1.frequency.exponentialRampToValueAtTime(2050, now + (isHomerun ? 0.48 : 0.32));

    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1140, now);
    osc2.frequency.exponentialRampToValueAtTime(980, now + 0.26);

    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(isHomerun ? 0.95 : 0.75, now);
    g1.gain.exponentialRampToValueAtTime(0.001, now + (isHomerun ? 0.48 : 0.32));

    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(isHomerun ? 0.6 : 0.45, now);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    // インパクトのアタックノイズ
    const bufSize = Math.floor(ctx.sampleRate * 0.04);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.15));
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.55, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc1.connect(g1);
    g1.connect(ctx.destination);
    osc2.connect(g2);
    g2.connect(ctx.destination);
    noise.connect(nGain);
    nGain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    noise.start(now);
    osc1.stop(now + 0.5);
    osc2.stop(now + 0.3);
  }

  /**
   * 3. 審判・判定コール（テレビ中継風の控えめなアタックトーン）
   */
  playCallChime(kind: 'STRIKE' | 'BALL' | 'OUT' | 'HIT'): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const freq = kind === 'HIT' ? 659.25 : kind === 'STRIKE' ? 587.33 : kind === 'OUT' ? 440 : 349.23; // E5, D5, A4, F4
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.28);
  }
}

export const sfx = new SoundEngine();
