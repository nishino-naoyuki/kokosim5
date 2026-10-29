import { dateKey, milestonesFor, type GameDate } from '../core/calendar';
import { reputationRank } from '../core/types';
import { QUOTA_MAX_DAYS, msUntilNextDay, rechargeQuota } from '../core/quota';
import { advanceGame, game, applyTicket, type AdvanceReport } from '../game/state';
import type { AdvanceUnit } from '../core/calendar';
import { esc, rankLabel, repLabel, yen } from './format';
import { shade } from './uniformSvg';

export type ScreenId = 'setup' | 'entrance' | 'graduation' | 'main' | 'players' | 'training' | 'order' | 'facility' | 'records' | 'match';

export type ActionFn = (el: HTMLElement, ev: Event) => void;
export const actions: Record<string, ActionFn> = {};
export function registerActions(a: Record<string, ActionFn>): void {
  Object.assign(actions, a);
}

let renderHook: () => void = () => undefined;
export function setRenderHook(fn: () => void): void {
  renderHook = fn;
}
export function requestRender(): void {
  renderHook();
}

export function go(id: ScreenId): void {
  if (location.hash === `#/${id}`) requestRender();
  else location.hash = `#/${id}`;
}

export const schoolFull = (name: string): string => (/高校$|高等学校$/.test(name) ? name : `${name}高校`);

const NAV: { id: ScreenId; label: string }[] = [
  { id: 'main', label: '🏟️ メイン' },
  { id: 'match', label: '⚾ 試合' },
  { id: 'players', label: '選手一覧' },
  { id: 'training', label: '練習指示' },
  { id: 'order', label: 'オーダー' },
  { id: 'facility', label: '部費・設備' },
  { id: 'records', label: '記録室' },
];

/** マネジメント画面の共通フレーム（ヘッダー＋フッターナビ） */
export function shell(active: ScreenId, title: string, body: string): string {
  const s = game();
  const cap = s.school.uniform.capColor;
  const rep = Math.round(s.school.reputation);
  const members = s.roster.length;
  return `
  <header class="m-head">
    <div class="crest clickable" data-act="go" data-to="main" style="cursor:pointer;background:${cap};color:#fff;border-color:${shade('#f5b73c', 0)}" title="トップ画面（グラウンド）へ戻る">${esc(s.school.name[0])}</div>
    <div class="sn clickable" data-act="go" data-to="main" style="cursor:pointer" title="トップ画面（グラウンド）へ戻る">[${esc(schoolFull(s.school.name))} (${esc(s.school.prefecture)})]</div>
    ${title ? `<div class="ttl">${esc(title)} <span style="opacity:.7;font-size:12px">/ 部員${members}名</span></div>` : ''}
    <div class="right">
      <div class="rank-bar">チームランク <span style="font-size:22px;color:#f5b73c">${reputationRank(rep)}</span>
        <span style="opacity:.8">${esc(repLabel(rep))} ${rep}/100</span>
        <span class="meter"><i style="width:${rep}%"></i></span></div>
      <div class="funds">部費 ${yen(s.funds)}</div>
    </div>
  </header>
  <main class="m-body">${body}</main>
  <footer class="m-foot">
    ${NAV.map((n) => `<button class="navbtn ${n.id === active ? 'active' : ''}" data-act="go" data-to="${n.id}">${n.label}</button>`).join('')}
    <button class="advbtn" data-act="open-advance">日程を進める ▶</button>
  </footer>`;
}

// ---------------------------------------------------------------------------
// モーダル
// ---------------------------------------------------------------------------
export function modalHost(): HTMLElement {
  return document.getElementById('modal-host')!;
}
export function openModal(html: string): void {
  modalHost().innerHTML = html;
}
export function closeModal(): void {
  modalHost().innerHTML = '';
}

// ---------------------------------------------------------------------------
// 日程進行パネル
// ---------------------------------------------------------------------------
function fmtMs(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}分${String(s % 60).padStart(2, '0')}秒`;
}

export function openAdvancePanel(message?: string): void {
  const s = game();
  rechargeQuota(s.quota, Date.now());
  const q = s.quota;
  const next = msUntilNextDay(q, Date.now());
  const over = q.days > QUOTA_MAX_DAYS;
  openModal(`
  <div class="modal-back" data-act="close-modal-bg">
    <div class="adv-panel">
      <div class="modal-head"><h2>⏩ 日程を進める — ${dateKey(s.date)}</h2><button class="x" data-act="close-modal">✕</button></div>
      <div class="adv-body">
        <div class="quota-line">
          <span>⏳ 進行可能日数: <span style="color:${over ? '#b45309' : '#166534'}">${q.days}日</span> / 自然回復上限 ${QUOTA_MAX_DAYS}日 ${over ? '<span class="badge gold">上限突破中</span>' : ''}</span>
          <span style="font-size:11px;color:#64748b">${q.days >= QUOTA_MAX_DAYS ? '満タン' : `次の1日回復まで ${fmtMs(next)}`}</span>
        </div>
        <button class="btn primary" data-act="advance" data-unit="DAY">▶ 1日進める <small>練習成長・疲労を1日分</small></button>
        <button class="btn primary" data-act="advance" data-unit="WEEK">⏩ 1週間進める <small>7日（試合・行事で自動停止）</small></button>
        <button class="btn primary" data-act="advance" data-unit="MONTH">⏭ 1か月進める <small>30日（Safety Stop付）</small></button>
        <div class="ticket-row">
          <button class="btn" data-act="ticket" data-kind="FREE" ${s.tickets.free <= 0 ? 'disabled' : ''} title="無料チケットは上限90日までしか溜まりません">🎫 無料チケット (${s.tickets.free}枚)<br><small>+90日・上限90まで</small></button>
          <button class="btn gold" data-act="ticket" data-kind="PAID" ${s.tickets.paid <= 0 ? 'disabled' : ''} title="課金チケットのみ上限90日を突破できます">💎 青雲チケット (${s.tickets.paid}枚)<br><small>+90日・上限突破OK</small></button>
        </div>
        ${message ? `<div class="note-box">${message}</div>` : ''}
        <div class="log-box">${s.log.slice(0, 8).map((l) => esc(l)).join('<br>') || '—'}</div>
        <div style="font-size:11px;color:#64748b">※ 決済連携（青雲チケット購入）はフェーズ4で実装します。現在はテスト用にチケットを付与できます。</div>
        <button class="btn" data-act="grant-test-ticket">🧪 テスト用：青雲チケットを1枚付与</button>
      </div>
    </div>
  </div>`);
}

// ---------------------------------------------------------------------------
// イベント（マネージャー大写し＋ADVメッセージ）
// ---------------------------------------------------------------------------
export function managerSvg(): string {
  return `<svg viewBox="0 0 200 260" width="200" aria-label="マネージャー">
    <path d="M30 260 Q40 170 100 165 Q160 170 170 260 Z" fill="#fff" stroke="#1b1f2a" stroke-width="3"/>
    <path d="M78 170 L100 205 L122 170 Z" fill="#1e3a8a" stroke="#1b1f2a" stroke-width="2.5"/>
    <path d="M100 205 L92 236 L108 236 Z" fill="#b91c1c" stroke="#1b1f2a" stroke-width="2"/>
    <rect x="86" y="140" width="28" height="34" rx="8" fill="#fbdcc4" stroke="#1b1f2a" stroke-width="2.5"/>
    <path d="M44 100 Q40 30 100 28 Q160 30 156 100 Q160 150 148 180 L136 150 L64 150 L52 180 Q40 150 44 100 Z" fill="#4b2e1f" stroke="#1b1f2a" stroke-width="3"/>
    <path d="M58 92 Q58 150 100 156 Q142 150 142 92 Q142 52 100 50 Q58 52 58 92 Z" fill="#fde4cf" stroke="#1b1f2a" stroke-width="3"/>
    <path d="M56 86 Q70 50 100 56 Q132 50 144 86 Q128 66 100 72 Q72 66 56 86 Z" fill="#4b2e1f" stroke="#1b1f2a" stroke-width="2"/>
    <ellipse cx="80" cy="104" rx="10" ry="12" fill="#fff" stroke="#1b1f2a" stroke-width="2.5"/>
    <ellipse cx="120" cy="104" rx="10" ry="12" fill="#fff" stroke="#1b1f2a" stroke-width="2.5"/>
    <circle cx="81" cy="106" r="6.5" fill="#5b3a29"/><circle cx="119" cy="106" r="6.5" fill="#5b3a29"/>
    <circle cx="78" cy="102" r="2.4" fill="#fff"/><circle cx="116" cy="102" r="2.4" fill="#fff"/>
    <path d="M70 90 Q80 84 90 90 M110 90 Q120 84 130 90" stroke="#3b2418" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M100 112 L98 124 L103 124" stroke="#c98a63" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M86 134 Q100 146 114 134" fill="#fff" stroke="#8a3a2a" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="68" cy="124" r="7" fill="#f9a8b8" opacity=".5"/><circle cx="132" cy="124" r="7" fill="#f9a8b8" opacity=".5"/>
    <path d="M150 62 L168 48 L166 74 Z M150 62 L134 48 L136 74 Z" fill="#ec4899" stroke="#1b1f2a" stroke-width="2"/>
  </svg>`;
}

let eventStep: (() => boolean) | null = null;

export function showEvent(who: string, lines: string[], afterKey?: string): void {
  let i = 0;
  const draw = () => {
    openModal(`<div class="ev-wrap" data-act="event-next" data-after="${afterKey ?? ''}">
      <div class="ev-chara">${managerSvg()}</div>
      <div class="ev-msg"><span class="who">${esc(who)}</span><p>${lines[i]}</p><div class="go">${i < lines.length - 1 ? '▽' : '▶ 閉じる'}</div></div>
    </div>`);
  };
  eventStep = () => {
    i++;
    if (i >= lines.length) return false;
    draw();
    return true;
  };
  draw();
}

export function stepEvent(): boolean {
  return eventStep ? eventStep() : false;
}

const EVENT_TEXT: Record<string, (d: GameDate) => string[]> = {
  ENTRANCE: () => ['監督、入学式が終わりました！新入部員のみなさんが集まっています。', '今年も10名の新しい仲間が加わりますよ。さっそくご挨拶に行きましょう！'],
  MIDTERM_TEST: () => ['監督、中間テストの時期です。赤点を取ると練習に出られなくなってしまいます…。', '部員たちには勉強もがんばるよう伝えておきますね。'],
  DRAW_CEREMONY: () => ['監督、地方大会の組み合わせ抽選会の日です。', 'どんな山に入るか、ドキドキしますね！'],
  FINAL_TEST: () => ['監督、期末テストの時期です。学業と野球の両立、応援しています！'],
  RETIREMENT: () => ['監督、3年生が引退して新チームが始動する日です。', '新しいチームでも、みんなで甲子園を目指しましょう！'],
  SUMMER_CAMP: () => ['監督、夏季強化合宿が始まります！体力づくりの大チャンスですね。'],
  SPORTS_FESTIVAL: () => ['監督、体育祭の日です！部活対抗リレーでは野球部も出場しますよ。'],
  DRAFT: () => ['監督、今日はプロ野球ドラフト会議の日です。', 'プロ志望届を出した3年生の運命の日…ドキドキしますね。'],
  WINTER_BAN_START: () => ['監督、今日から対外試合禁止期間に入ります。じっくり基礎を固めましょう。'],
  WINTER_CAMP: () => ['監督、冬季強化合宿が始まります！筋力と守備の基礎を鍛えましょう。'],
  SENBATSU_SELECTION: () => ['監督、センバツ選考委員会の日です。吉報を待ちましょう…！'],
  GRADUATION: () => ['監督、卒業式の日です。3年生たち、3年間本当にお疲れさまでした。', '卒業生はこれから「名誉OB」として、グラウンドを訪ねてくれますよ。'],
};

/** 進行結果をプレイヤーに知らせる（行事ならマネージャー会話、それ以外はトースト） */
export function reportAdvance(rep: AdvanceReport): void {
  const s = game();
  const r = rep.result;
  const lines: string[] = [];
  if (rep.event) lines.push(...(EVENT_TEXT[rep.event.kind]?.(s.date) ?? [esc(rep.event.label)]));
  if (r.stopReason === 'OFFICIAL_MATCH') {
    const tomorrow = new Date(Date.UTC(s.date.year, s.date.month - 1, s.date.day + 1));
    const m = milestonesFor(s.school.prefecture).find(
      (x) => (x.month === s.date.month && x.day === s.date.day) || (x.month === tomorrow.getUTCMonth() + 1 && x.day === tomorrow.getUTCDate()),
    );
    lines.push(`監督、公式大会「${esc(m?.label ?? '公式戦')}」が近づいています！（※試合進行・大会画面はフェーズ3で実装予定です）`);
  }
  if (r.stopReason === 'MAJOR_INJURY') {
    for (const inj of rep.injuries.filter((i) => i.label !== '軽傷')) lines.push(`監督、${esc(inj.name)}くんが${esc(inj.label)}です…全治${inj.days}日とのことです。`);
  }
  if (r.stopReason === 'QUOTA_EMPTY') lines.push('監督、進行可能日数がなくなりました。しばらく待つか、チケットを使えば再開できます。');
  if (lines.length) {
    showEvent('マネージャー 橘 葵', lines, rep.event?.kind === 'ENTRANCE' && !s.entranceShown ? 'entrance' : rep.event?.kind === 'GRADUATION' ? 'graduation' : '');
  } else {
    toast(`${r.daysAdvanced}日進めました（${dateKey(s.date)}）${rep.injuries.length ? ` ／ ケガ人${rep.injuries.length}名` : ''}`);
  }
}

export function toast(msg: string): void {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:absolute;left:50%;bottom:84px;transform:translateX(-50%);background:#0f172aee;color:#fff;padding:9px 18px;border-radius:999px;font-size:13px;font-weight:700;z-index:9999;box-shadow:0 6px 20px rgba(0,0,0,.35);pointer-events:none;white-space:nowrap';
  (document.getElementById('viewport-stage') ?? document.body).appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

registerActions({
  go: (el) => go(el.dataset.to as ScreenId),
  'open-advance': () => openAdvancePanel(),
  'close-modal': () => closeModal(),
  'close-modal-bg': (el, ev) => {
    if (ev.target === el) closeModal();
  },
  advance: (el) => {
    const rep = advanceGame(el.dataset.unit as AdvanceUnit);
    closeModal();
    requestRender();
    reportAdvance(rep);
  },
  ticket: (el) => {
    try {
      applyTicket(el.dataset.kind as 'FREE' | 'PAID');
    } catch (e) {
      toast((e as Error).message);
    }
    openAdvancePanel(el.dataset.kind === 'PAID' ? '💎 青雲チケットを使用しました（上限90日を突破してチャージ）' : '🎫 無料チケットを使用しました（上限90日まで）');
    requestRender();
  },
  'grant-test-ticket': () => {
    game().tickets.paid += 1;
    openAdvancePanel('🧪 テスト用に青雲チケットを1枚付与しました');
    requestRender();
  },
  'event-next': (el) => {
    if (stepEvent()) return;
    const after = el.dataset.after;
    closeModal();
    if (after === 'entrance') go('entrance');
    else if (after === 'graduation') go('graduation');
    else requestRender();
  },
});

export { rankLabel };

