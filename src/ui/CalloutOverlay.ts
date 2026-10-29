/**
 * 高校野球シミュレーション5 (KokoSim 5)
 * ダイナミック・コールアウト ＆ 超ド迫力特大スコア表示システム
 * 
 * - 野球漫画・ゲーム風の極太ポップフォント（Mochiy Pop One）
 * - 三振は燃え盛る炎、四球は氷結、死球はショックマゼンタ、ストライク・ボール・本塁打も専用演出
 * - 得点・押し出し時は画面中央に3倍サイズの超特大スコアボードを堂々表示
 * - 演出中は試合の自動進行をしっかり待機させ、余韻を味わえるテンポ制御
 */

import { sfx } from '../audio/sfx';

export type CalloutKind =
  | 'STRIKE'
  | 'SWINGING_STRIKE'
  | 'STRIKEOUT'
  | 'BALL'
  | 'WALK'
  | 'DEADBALL'
  | 'FOUL'
  | 'HIT'
  | 'DOUBLE'
  | 'TRIPLE'
  | 'HOMERUN'
  | 'OUT'
  | 'DOUBLE_PLAY'
  | 'SAC_BUNT';

export interface CalloutOptions {
  subText?: string;
  durationMs?: number;
  isPushOutRun?: boolean; // 押し出し得点か
}

export interface BigScoreOptions {
  teamAName: string;
  teamBName: string;
  scoreA: number;
  scoreB: number;
  badgeText?: string;
  durationMs?: number;
}

class CalloutOverlayManager {
  private container: HTMLElement | null = null;
  private currentTimeout: number | null = null;
  private activeResolve: (() => void) | null = null;

  public init(parent?: HTMLElement): void {
    if (this.container && document.body.contains(this.container)) return;
    const target = parent || document.getElementById('viewport-stage') || document.getElementById('app') || document.body;
    
    let el = document.getElementById('kokosim-callout-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'kokosim-callout-overlay';
      el.className = 'kokosim-callout-overlay';
      target.appendChild(el);
    }
    this.container = el;
  }

  /**
   * 現在の演出を強制終了・クリーンアップ
   */
  public clear(): void {
    if (this.currentTimeout !== null) {
      clearTimeout(this.currentTimeout);
      this.currentTimeout = null;
    }
    if (this.container) {
      this.container.innerHTML = '';
      this.container.className = 'kokosim-callout-overlay';
    }
    if (this.activeResolve) {
      const resolve = this.activeResolve;
      this.activeResolve = null;
      resolve();
    }
  }

  /**
   * ポップなコールアウト演出を表示（演出完了まで待機可能なPromiseを返却）
   */
  public showCallout(kind: CalloutKind, options?: CalloutOptions): Promise<void> {
    this.clear();
    this.init();

    return new Promise((resolve) => {
      this.activeResolve = resolve;
      if (!this.container) {
        resolve();
        return;
      }

      // 音響効果
      switch (kind) {
        case 'STRIKE':
        case 'SWINGING_STRIKE':
          sfx.playCallChime('STRIKE');
          break;
        case 'STRIKEOUT':
          sfx.playCallChime('OUT');
          break;
        case 'BALL':
        case 'WALK':
          sfx.playCallChime('BALL');
          break;
        case 'HIT':
        case 'DOUBLE':
        case 'TRIPLE':
        case 'HOMERUN':
          sfx.playCallChime('HIT');
          break;
        case 'OUT':
        case 'DOUBLE_PLAY':
          sfx.playCallChime('OUT');
          break;
      }

      const duration = options?.durationMs ?? this.getDefaultDuration(kind);
      const svgHtml = this.generateSvg(kind, options?.subText);

      this.container.innerHTML = svgHtml;
      this.container.className = 'kokosim-callout-overlay active animate-in';

      // フェードアウト開始
      const fadeStart = Math.max(duration - 320, 200);
      this.currentTimeout = window.setTimeout(() => {
        if (this.container) {
          this.container.className = 'kokosim-callout-overlay active animate-out';
        }
        this.currentTimeout = window.setTimeout(() => {
          this.clear();
        }, 320);
      }, fadeStart);
    });
  }

  /**
   * 3倍サイズの超特大スコアボード表示（得点・押し出し時に画面中央にド迫力表示）
   */
  public showBigScore(options: BigScoreOptions): Promise<void> {
    this.clear();
    this.init();

    return new Promise((resolve) => {
      this.activeResolve = resolve;
      if (!this.container) {
        resolve();
        return;
      }

      sfx.playCallChime('HIT');

      const duration = options.durationMs ?? 2000;
      const badge = (options.badgeText || '得点！').replace(/^[^\w\u3000-\u9faf\u3040-\u309f\uff00-\uffef\s]+/, '').trim();
      const a = options.teamAName || '九工大';
      const b = options.teamBName || '翔青';
      const sA = options.scoreA ?? 0;
      const sB = options.scoreB ?? 0;

      // チーム名の長さに応じた動的スケーリング（はみ出し防止＆迫力最大化）
      const totalLen = a.length + b.length;
      const fontSize = totalLen <= 6 ? 112 : totalLen <= 8 ? 96 : 82;
      const letterSpacing = totalLen <= 6 ? 6 : 4;
      const strokeWidth = totalLen <= 6 ? 18 : 15;

      const svgScoreHtml = `
        <div class="big-score-wrapper animate-bounce-pop">
          <div class="big-score-badge-pill">
            <span class="badge-text">${badge}</span>
          </div>
          <div class="big-score-box">
            <svg class="big-score-svg" viewBox="0 0 1280 240" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="scoreGoldGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#ffffff"/>
                  <stop offset="25%" stop-color="#fff9c4"/>
                  <stop offset="50%" stop-color="#ffca28"/>
                  <stop offset="80%" stop-color="#ff8f00"/>
                  <stop offset="100%" stop-color="#e65100"/>
                </linearGradient>
                <filter id="scoreGoldAura" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur1"/>
                  <feGaussianBlur in="SourceGraphic" stdDeviation="16" result="blur2"/>
                  <feColorMatrix in="blur2" type="matrix" values="
                    1 0 0 0 1
                    0 0.7 0 0 0.4
                    0 0 0 0 0
                    0 0 0 2.2 0" result="goldGlow"/>
                  <feMerge>
                    <feMergeNode in="goldGlow"/>
                    <feMergeNode in="blur1"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              <text x="50%" y="62%" text-anchor="middle" dominant-baseline="central"
                font-family="'Mochiy Pop One', 'Dela Gothic One', sans-serif"
                font-size="${fontSize}" font-weight="900" letter-spacing="${letterSpacing}"
                fill="url(#scoreGoldGrad)" stroke="#1a0500" stroke-width="${strokeWidth}" stroke-linejoin="round"
                paint-order="stroke fill" filter="url(#scoreGoldAura)">
                ${a}  ${sA} - ${sB}  ${b}
              </text>
            </svg>
          </div>
        </div>
      `;

      this.container.innerHTML = svgScoreHtml;
      this.container.className = 'kokosim-callout-overlay active animate-in';

      const fadeStart = Math.max(duration - 350, 300);
      this.currentTimeout = window.setTimeout(() => {
        if (this.container) {
          this.container.className = 'kokosim-callout-overlay active animate-out';
        }
        this.currentTimeout = window.setTimeout(() => {
          this.clear();
        }, 350);
      }, fadeStart);
    });
  }

  private getDefaultDuration(kind: CalloutKind): number {
    switch (kind) {
      case 'STRIKEOUT':
        return 1700; // 三振は燃える炎をしっかり味わう
      case 'WALK':
        return 1500; // 氷結四球
      case 'DEADBALL':
        return 1600; // 死球ショック
      case 'HOMERUN':
        return 2200; // ホームラン特大
      case 'DOUBLE_PLAY':
        return 1500;
      case 'HIT':
      case 'DOUBLE':
      case 'TRIPLE':
        return 1300;
      case 'STRIKE':
      case 'SWINGING_STRIKE':
      case 'BALL':
      case 'FOUL':
      case 'OUT':
      case 'SAC_BUNT':
      default:
        return 1150;
    }
  }

  /**
   * 各種演出に応じたSVGマークアップを生成
   */
  private generateSvg(kind: CalloutKind, customSubText?: string): string {
    const width = 880;
    const height = 180;

    let mainText = 'ストライク！';
    let subText = customSubText || '';
    let gradDef = '';
    let filterDef = '';
    let filterId = '';
    let gradId = '';
    let strokeColor = '#000000';
    let fontSize = 76;
    let letterSpacing = 6;

    switch (kind) {
      case 'STRIKEOUT': {
        mainText = '三　振！';
        subText = customSubText || 'BATTER OUT!';
        gradId = 'cgFire';
        filterId = 'cfFire';
        strokeColor = '#2b0500';
        fontSize = 86;
        letterSpacing = 10;
        gradDef = `
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="18%" stop-color="#fff59d"/>
            <stop offset="42%" stop-color="#ffb300"/>
            <stop offset="70%" stop-color="#f4511e"/>
            <stop offset="100%" stop-color="#b71c1c"/>
          </linearGradient>
        `;
        filterDef = `
          <filter id="${filterId}" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur1"/>
            <feGaussianBlur in="SourceGraphic" stdDeviation="15" result="blur2"/>
            <feColorMatrix in="blur2" type="matrix" values="
              1 0 0 0 1
              0 0.38 0 0 0.1
              0 0 0 0 0
              0 0 0 2.4 0" result="fireColor"/>
            <feMerge>
              <feMergeNode in="fireColor"/>
              <feMergeNode in="blur1"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        `;
        break;
      }

      case 'WALK': {
        mainText = 'フォアボール';
        subText = customSubText || 'TAKE YOUR BASE';
        gradId = 'cgIce';
        filterId = 'cfIce';
        strokeColor = '#001a33';
        fontSize = 80;
        letterSpacing = 6;
        gradDef = `
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="25%" stop-color="#e0f7fa"/>
            <stop offset="55%" stop-color="#80d8ff"/>
            <stop offset="85%" stop-color="#0091ea"/>
            <stop offset="100%" stop-color="#01579b"/>
          </linearGradient>
        `;
        filterDef = `
          <filter id="${filterId}" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur1"/>
            <feGaussianBlur in="SourceGraphic" stdDeviation="15" result="blur2"/>
            <feColorMatrix in="blur2" type="matrix" values="
              0 0 0 0 0.2
              0 0.85 0 0 0.85
              0 0 1 0 1
              0 0 0 2.2 0" result="iceColor"/>
            <feMerge>
              <feMergeNode in="iceColor"/>
              <feMergeNode in="blur1"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        `;
        break;
      }

      case 'DEADBALL': {
        mainText = 'デッドボール';
        subText = customSubText || 'HIT BY PITCH!';
        gradId = 'cgDead';
        filterId = 'cfDead';
        strokeColor = '#2b0012';
        fontSize = 80;
        letterSpacing = 6;
        gradDef = `
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="25%" stop-color="#ff80ab"/>
            <stop offset="55%" stop-color="#ff1744"/>
            <stop offset="85%" stop-color="#c51162"/>
            <stop offset="100%" stop-color="#880e4f"/>
          </linearGradient>
        `;
        filterDef = `
          <filter id="${filterId}" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur1"/>
            <feGaussianBlur in="SourceGraphic" stdDeviation="15" result="blur2"/>
            <feColorMatrix in="blur2" type="matrix" values="
              1 0 0 0 1
              0 0 0 0 0.1
              0 0 0.5 0 0.4
              0 0 0 2.4 0" result="deadColor"/>
            <feMerge>
              <feMergeNode in="deadColor"/>
              <feMergeNode in="blur1"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        `;
        break;
      }

      case 'STRIKE': {
        mainText = 'ストライク！';
        subText = customSubText || 'CALLED STRIKE!';
        gradId = 'cgStrike';
        filterId = 'cfStrike';
        strokeColor = '#3a2000';
        fontSize = 82;
        gradDef = `
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="30%" stop-color="#fff59d"/>
            <stop offset="65%" stop-color="#ffca28"/>
            <stop offset="100%" stop-color="#f57f17"/>
          </linearGradient>
        `;
        filterDef = `
          <filter id="${filterId}" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur1"/>
            <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="blur2"/>
            <feColorMatrix in="blur2" type="matrix" values="
              1 0 0 0 1
              0 0.75 0 0 0.4
              0 0 0 0 0
              0 0 0 2.2 0" result="strikeColor"/>
            <feMerge>
              <feMergeNode in="strikeColor"/>
              <feMergeNode in="blur1"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        `;
        break;
      }

      case 'SWINGING_STRIKE': {
        mainText = '空　振　り！';
        subText = customSubText || 'SWING & MISS!';
        gradId = 'cgSwing';
        filterId = 'cfSwing';
        strokeColor = '#3b0d0c';
        fontSize = 82;
        gradDef = `
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="30%" stop-color="#ffcdd2"/>
            <stop offset="65%" stop-color="#ef5350"/>
            <stop offset="100%" stop-color="#b71c1c"/>
          </linearGradient>
        `;
        filterDef = `
          <filter id="${filterId}" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur1"/>
            <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="blur2"/>
            <feColorMatrix in="blur2" type="matrix" values="
              1 0 0 0 1
              0 0.2 0 0 0.1
              0 0 0 0 0
              0 0 0 2.2 0" result="swingColor"/>
            <feMerge>
              <feMergeNode in="swingColor"/>
              <feMergeNode in="blur1"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        `;
        break;
      }

      case 'BALL': {
        mainText = 'ボール！';
        subText = customSubText || 'BALL';
        gradId = 'cgBall';
        filterId = 'cfBall';
        strokeColor = '#03260d';
        fontSize = 82;
        gradDef = `
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="30%" stop-color="#e8f5e9"/>
            <stop offset="60%" stop-color="#69f0ae"/>
            <stop offset="100%" stop-color="#00c853"/>
          </linearGradient>
        `;
        filterDef = `
          <filter id="${filterId}" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur1"/>
            <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="blur2"/>
            <feColorMatrix in="blur2" type="matrix" values="
              0 0 0 0 0.1
              0 1 0 0 0.9
              0 0 0.4 0 0.3
              0 0 0 2.2 0" result="ballColor"/>
            <feMerge>
              <feMergeNode in="ballColor"/>
              <feMergeNode in="blur1"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        `;
        break;
      }

      case 'FOUL': {
        mainText = 'ファウル！';
        subText = customSubText || 'FOUL BALL';
        gradId = 'cgFoul';
        filterId = 'cfFoul';
        strokeColor = '#1f0d3d';
        fontSize = 80;
        gradDef = `
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="30%" stop-color="#f3e8ff"/>
            <stop offset="65%" stop-color="#c084fc"/>
            <stop offset="100%" stop-color="#7e22ce"/>
          </linearGradient>
        `;
        filterDef = `
          <filter id="${filterId}" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur1"/>
            <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="blur2"/>
            <feColorMatrix in="blur2" type="matrix" values="
              0.8 0 0 0 0.8
              0 0.2 0 0 0.2
              0 0 1 0 1
              0 0 0 2.2 0" result="foulColor"/>
            <feMerge>
              <feMergeNode in="foulColor"/>
              <feMergeNode in="blur1"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        `;
        break;
      }

      case 'HIT':
      case 'DOUBLE':
      case 'TRIPLE': {
        mainText = kind === 'TRIPLE' ? '3-BASE HIT!' : kind === 'DOUBLE' ? '2-BASE HIT!' : 'ヒット！';
        subText = customSubText || (kind === 'TRIPLE' ? '適時三塁打!' : kind === 'DOUBLE' ? '適時二塁打!' : 'クリーンヒット!');
        gradId = 'cgHit';
        filterId = 'cfHit';
        strokeColor = '#002538';
        fontSize = 82;
        gradDef = `
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="25%" stop-color="#e0f7fa"/>
            <stop offset="55%" stop-color="#26c6da"/>
            <stop offset="100%" stop-color="#00838f"/>
          </linearGradient>
        `;
        filterDef = `
          <filter id="${filterId}" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur1"/>
            <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="blur2"/>
            <feColorMatrix in="blur2" type="matrix" values="
              0 0 0 0 0.1
              0 0.8 0 0 0.8
              0 0 1 0 1
              0 0 0 2.4 0" result="hitColor"/>
            <feMerge>
              <feMergeNode in="hitColor"/>
              <feMergeNode in="blur1"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        `;
        break;
      }

      case 'HOMERUN': {
        mainText = '本塁打！！';
        subText = customSubText || '甲子園スタンド直撃 本塁打!!';
        gradId = 'cgHR';
        filterId = 'cfHR';
        strokeColor = '#2b0900';
        fontSize = 88;
        letterSpacing = 8;
        gradDef = `
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="20%" stop-color="#fff9c4"/>
            <stop offset="45%" stop-color="#ffca28"/>
            <stop offset="75%" stop-color="#ff6f00"/>
            <stop offset="100%" stop-color="#bf360c"/>
          </linearGradient>
        `;
        filterDef = `
          <filter id="${filterId}" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur1"/>
            <feGaussianBlur in="SourceGraphic" stdDeviation="16" result="blur2"/>
            <feColorMatrix in="blur2" type="matrix" values="
              1 0 0 0 1
              0 0.7 0 0 0.4
              0 0 0 0 0
              0 0 0 2.6 0" result="hrColor"/>
            <feMerge>
              <feMergeNode in="hrColor"/>
              <feMergeNode in="blur1"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        `;
        break;
      }

      case 'DOUBLE_PLAY': {
        mainText = 'ダブルプレー！';
        subText = customSubText || '電光石火の併殺打 4-6-3!!';
        gradId = 'cgDp';
        filterId = 'cfDp';
        strokeColor = '#0f172a';
        fontSize = 76;
        gradDef = `
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="40%" stop-color="#cbd5e1"/>
            <stop offset="100%" stop-color="#64748b"/>
          </linearGradient>
        `;
        filterDef = `
          <filter id="${filterId}" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur1"/>
            <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur2"/>
            <feColorMatrix in="blur2" type="matrix" values="
              0.5 0 0 0 0.5
              0 0.6 0 0 0.6
              0 0 0.8 0 0.8
              0 0 0 2.0 0" result="dpColor"/>
            <feMerge>
              <feMergeNode in="dpColor"/>
              <feMergeNode in="blur1"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        `;
        break;
      }

      case 'SAC_BUNT': {
        mainText = '送りバント成功';
        subText = customSubText || '手堅い進塁打';
        gradId = 'cgBunt';
        filterId = 'cfBunt';
        strokeColor = '#06202e';
        fontSize = 76;
        gradDef = `
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="35%" stop-color="#bae6fd"/>
            <stop offset="100%" stop-color="#38bdf8"/>
          </linearGradient>
        `;
        filterDef = `
          <filter id="${filterId}" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur1"/>
            <feColorMatrix in="blur1" type="matrix" values="
              0 0 0 0 0.2
              0 0.7 0 0 0.8
              0 0 1 0 1
              0 0 0 2.0 0" result="buntColor"/>
            <feMerge>
              <feMergeNode in="buntColor"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        `;
        break;
      }

      case 'OUT':
      default: {
        mainText = 'アウト！';
        subText = customSubText || 'OUT!';
        gradId = 'cgOut';
        filterId = 'cfOut';
        strokeColor = '#1e293b';
        fontSize = 82;
        gradDef = `
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="40%" stop-color="#e2e8f0"/>
            <stop offset="100%" stop-color="#94a3b8"/>
          </linearGradient>
        `;
        filterDef = `
          <filter id="${filterId}" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur1"/>
            <feColorMatrix in="blur1" type="matrix" values="
              0.5 0 0 0 0.5
              0 0.5 0 0 0.5
              0 0 0.5 0 0.5
              0 0 0 1.8 0" result="outColor"/>
            <feMerge>
              <feMergeNode in="outColor"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        `;
        break;
      }
    }

    return `
      <div class="callout-card-wrapper animate-bounce-pop">
        <svg class="callout-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
          <defs>
            ${gradDef}
            ${filterDef}
          </defs>
          <text x="50%" y="${subText ? '52%' : '58%'}" text-anchor="middle" dominant-baseline="central"
            font-family="'Mochiy Pop One', 'Dela Gothic One', sans-serif"
            font-size="${fontSize}" font-weight="900" letter-spacing="${letterSpacing}"
            fill="url(#${gradId})" stroke="${strokeColor}" stroke-width="15" stroke-linejoin="round"
            paint-order="stroke fill" filter="url(#${filterId})">
            ${mainText}
          </text>
        </svg>
        ${subText ? `<div class="callout-sub-badge">${subText}</div>` : ''}
      </div>
    `;
  }
}

export const calloutOverlay = new CalloutOverlayManager();
