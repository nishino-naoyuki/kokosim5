import { FIXED_EVENTS, nextMilestone, milestonesFor, isSunday } from '../../core/calendar';
import { QUOTA_MAX_DAYS, rechargeQuota } from '../../core/quota';
import type { Player, TrainingMenu } from '../../core/types';
import { game } from '../../game/state';
import { registerActions, shell, schoolFull } from '../core';
import { MENU_META, MENU_ORDER, esc } from '../format';

type Season = 'spring' | 'summer' | 'autumn' | 'winter';
const seasonOf = (m: number): Season => (m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter');

const SKY: Record<Season, [string, string]> = {
  spring: ['#a9d8ff', '#f9e6ef'],
  summer: ['#3b9bec', '#bfe4ff'],
  autumn: ['#f0a86c', '#fde7c4'],
  winter: ['#8fa9c4', '#e3eaf1'],
};
const GRASS: Record<Season, [string, string]> = {
  spring: ['#5fb04a', '#6cbb55'],
  summer: ['#3f9a38', '#49a841'],
  autumn: ['#8aa23d', '#97b047'],
  winter: ['#7d9a6a', '#88a475'],
};

/** グループごとの描画位置（SVG座標）を返す */
function slotPositions(menu: TrainingMenu, n: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const spread = (cx: number, cy: number, w: number, h: number, cols: number) => {
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      out.push({ x: cx + (c - (cols - 1) / 2) * (w / cols) + (r % 2) * 10, y: cy + r * (h / Math.max(1, Math.ceil(n / cols))) });
    }
  };
  switch (menu) {
    case 'BATTING': spread(165, 468, 190, 70, 4); break;
    case 'INFIELD': {
      const spots = [[700, 548], [560, 470], [840, 470], [630, 420], [770, 420], [700, 470], [520, 520], [880, 520], [700, 600], [600, 570], [800, 570]];
      for (let i = 0; i < n; i++) out.push({ x: spots[i % spots.length][0] + Math.floor(i / spots.length) * 14, y: spots[i % spots.length][1] });
      break;
    }
    case 'OUTFIELD': spread(1020, 372, 380, 36, 6); break;
    case 'PITCHING': spread(420, 410, 150, 36, 4); break;
    case 'PHYSICAL': spread(1180, 560, 230, 60, 4); break;
    case 'REST': spread(190, 378, 220, 20, 6); break;
  }
  return out;
}

function figure(_p: Player, x: number, y: number, menu: TrainingMenu, idx: number): string {
  const u = game().school.uniform;
  const s = 0.62 + ((y - 330) / 330) * 0.85;
  const cls = menu === 'OUTFIELD' || menu === 'PHYSICAL' ? 'run' : menu === 'BATTING' && idx % 2 === 0 ? 'swing' : '';
  const dx = menu === 'OUTFIELD' ? 90 : 50;
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(2)})"><use href="#pl" class="fig ${cls}" style="--cap:${u.capColor};--shirt:${u.shirtColor};--pants:${u.pantsColor};--under:${u.underShirtColor};--dx:${dx}px;animation-delay:${((idx * 0.37) % 2).toFixed(2)}s"/></g>`;
}

function calendarHtml(): string {
  const s = game();
  const { year, month, day } = s.date;
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const ms = milestonesFor(s.school.prefecture);
  const cells: string[] = [];
  for (let i = 0; i < first; i++) cells.push('<div></div>');
  for (let dd = 1; dd <= days; dd++) {
    const m = ms.find((x) => x.month === month && x.day === dd);
    const ev = FIXED_EVENTS.find((x) => x.month === month && x.day === dd);
    const mark = m ? `<em title="${esc(m.label)}">⚾</em>` : ev ? `<em title="${esc(ev.label)}">${ev.kind.includes('TEST') ? '📝' : '📌'}</em>` : '';
    cells.push(`<div class="day ${dd === day ? 'today' : ''}" title="${esc(m?.label ?? ev?.label ?? '')}">${dd}${mark}</div>`);
  }
  const dows = ['日', '月', '火', '水', '木', '金', '土'];
  const nm = nextMilestone(s.date, s.school.prefecture);
  const cd = nm.daysLeft === 0 ? '本日開幕！' : `あと ${nm.daysLeft}日`;
  const jp = ['日', '月', '火', '水', '木', '金', '土'][new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `<div class="cal" data-act="cal-toggle">
    <div class="cal-compact"><div>📅</div><div class="d">${month}月${day}日 (${jp})</div><div class="c">${esc(nm.milestone.label)}まで <b>${nm.daysLeft}</b>日</div></div>
    <div class="cal-full"><h4>${year}年 ${month}月</h4>
      <div class="cal-grid">${dows.map((w, i) => `<div class="dow ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</div>`).join('')}${cells.join('')}</div>
      <div class="cal-band">${esc(nm.milestone.label)}まで ${cd}　${isSunday(s.date) ? '／ 今日は日曜（休養日）' : ''}</div></div>
  </div>`;
}

function scene(): string {
  const s = game();
  const season = seasonOf(s.date.month);
  const [sky1, sky2] = SKY[season];
  const [g1, g2] = GRASS[season];

  // 練習グループ
  const groups = new Map<TrainingMenu, Player[]>();
  for (const m of MENU_ORDER) groups.set(m, []);
  for (const p of s.roster) {
    const m: TrainingMenu = p.injury ? 'REST' : (s.assignments[p.id] ?? 'REST');
    groups.get(m)!.push(p);
  }
  let figs = '';
  let k = 0;
  for (const m of MENU_ORDER) {
    const list = groups.get(m)!;
    const pos = slotPositions(m, list.length);
    list.forEach((p, i) => {
      figs += figure(p, pos[i].x, pos[i].y, m, k++);
    });
  }

  const windows = (x0: number, x1: number, y: number) => {
    let w = '';
    for (let x = x0; x < x1; x += 22) w += `<rect x="${x}" y="${y}" width="14" height="14" fill="#a9c7e6" stroke="#6b7f96" stroke-width="1"/>`;
    return w;
  };
  const trees = [30, 120, 330, 430, 1010, 1100, 1210, 1320]
    .map((x, i) => `<g><rect x="${x - 3}" y="${300 + (i % 2) * 6}" width="6" height="30" fill="#5a3b24"/><circle cx="${x}" cy="${292 + (i % 2) * 6}" r="${26 + (i % 3) * 4}" fill="${season === 'autumn' ? '#c8742c' : season === 'winter' ? '#8b8f7a' : '#2f8a3c'}"/></g>`)
    .join('');
  const clouds = season === 'winter' ? '' : [[200, 70, 1], [620, 40, 1.3], [1000, 90, 0.9]]
    .map(([x, y, sc]) => `<g transform="translate(${x} ${y}) scale(${sc})" fill="#fff" opacity=".92"><ellipse cx="0" cy="0" rx="60" ry="20"/><ellipse cx="-30" cy="-12" rx="34" ry="20"/><ellipse cx="22" cy="-16" rx="40" ry="24"/></g>`)
    .join('');
  const petals = season === 'spring'
    ? Array.from({ length: 26 }, (_, i) => `<circle cx="${(i * 53) % 1376}" cy="${(i * 97) % 560}" r="3" fill="#f9b4c8" opacity=".75"/>`).join('')
    : '';
  const banner = `<g><rect x="716" y="214" width="20" height="104" fill="#fff" stroke="#c2410c" stroke-width="2"/>
    <text x="726" y="220" font-size="13" font-weight="900" fill="#b91c1c" style="writing-mode:vertical-rl;letter-spacing:2px" text-anchor="start">目指せ甲子園！</text>
    <rect x="740" y="214" width="20" height="104" fill="#fff" stroke="#c2410c" stroke-width="2"/>
    <text x="750" y="220" font-size="11" font-weight="900" fill="#1e3a8a" style="writing-mode:vertical-rl" text-anchor="start">${esc(schoolFull(s.school.name).slice(0, 7))}野球部</text></g>`;

  return `<svg class="bg" viewBox="0 0 1376 640" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky1}"/><stop offset="1" stop-color="${sky2}"/></linearGradient>
      <linearGradient id="dirt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c79a6b"/><stop offset="1" stop-color="#b98757"/></linearGradient>
      <g id="pl">
        <ellipse cx="0" cy="1" rx="9" ry="2.6" fill="#000" opacity=".22"/>
        <rect x="-5" y="-14" width="4.2" height="14" fill="var(--pants)" stroke="#1b1f2a" stroke-width=".8"/>
        <rect x="0.8" y="-14" width="4.2" height="14" fill="var(--pants)" stroke="#1b1f2a" stroke-width=".8"/>
        <rect x="-6.5" y="-27" width="13" height="14" rx="2.5" fill="var(--shirt)" stroke="#1b1f2a" stroke-width=".9"/>
        <rect x="-9" y="-26" width="3.4" height="11" rx="1.5" fill="var(--under)" stroke="#1b1f2a" stroke-width=".7"/>
        <rect x="5.6" y="-26" width="3.4" height="11" rx="1.5" fill="var(--under)" stroke="#1b1f2a" stroke-width=".7"/>
        <circle cx="0" cy="-32" r="5.2" fill="#f7d3b4" stroke="#1b1f2a" stroke-width=".9"/>
        <path d="M-5.4 -33 Q0 -41 5.4 -33 Z" fill="var(--cap)" stroke="#1b1f2a" stroke-width=".9"/>
        <rect x="-6.5" y="-34" width="9" height="1.8" fill="var(--cap)" stroke="#1b1f2a" stroke-width=".6"/>
      </g>
    </defs>
    <rect width="1376" height="640" fill="url(#sky)"/>
    ${clouds}
    <!-- 遠景の山並み -->
    <path d="M0 300 Q160 240 320 290 T640 280 T960 288 T1376 270 L1376 340 L0 340 Z" fill="${season === 'winter' ? '#9aa9b5' : '#7ea88a'}" opacity=".6"/>
    ${trees}
    <!-- 校舎 -->
    <g>
      <rect x="470" y="226" width="540" height="100" fill="#d9d3c3" stroke="#8b8576" stroke-width="2"/>
      <rect x="470" y="218" width="540" height="10" fill="#b3ad9d"/>
      ${windows(482, 700, 236)}${windows(482, 700, 262)}${windows(482, 700, 288)}
      ${windows(770, 998, 236)}${windows(770, 998, 262)}${windows(770, 998, 288)}
      <rect x="700" y="196" width="80" height="130" fill="#e8e2d2" stroke="#8b8576" stroke-width="2"/>
      <rect x="696" y="190" width="88" height="10" fill="#a29c8b"/>
      <rect x="722" y="300" width="36" height="26" fill="#6b7f96"/>
    </g>
    ${banner}
    <!-- バックネット・フェンス -->
    <rect x="0" y="326" width="1376" height="10" fill="#2f5d3a"/>
    <g stroke="#3d6b46" stroke-width="2" opacity=".85">${Array.from({ length: 24 }, (_, i) => `<line x1="${i * 60 + 20}" y1="170" x2="${i * 60 + 20}" y2="330"/>`).join('')}
      <line x1="0" y1="200" x2="1376" y2="200"/><line x1="0" y1="250" x2="1376" y2="250"/><line x1="0" y1="300" x2="1376" y2="300"/></g>
    <!-- グラウンド -->
    <polygon points="0,336 1376,336 1376,640 0,640" fill="${g1}"/>
    ${Array.from({ length: 10 }, (_, i) => `<polygon points="0,${336 + i * 32} 1376,${336 + i * 32} 1376,${336 + i * 32 + 16} 0,${336 + i * 32 + 16}" fill="${g2}" opacity=".55"/>`).join('')}
    <path d="M250 640 Q300 470 560 405 Q700 372 840 405 Q1100 470 1180 640 Z" fill="url(#dirt)"/>
    <ellipse cx="700" cy="478" rx="44" ry="14" fill="#b78652" stroke="#9a6d3f" stroke-width="2"/>
    <path d="M700 640 L330 478 M700 640 L1070 478" stroke="#fff" stroke-width="3" opacity=".9"/>
    <polygon points="700,420 760,462 700,506 640,462" fill="none" stroke="#fff" stroke-width="2" opacity=".6"/>
    <!-- バッティングケージ -->
    <g>
      <polygon points="40,430 290,430 330,520 20,540" fill="#2b6a3e" opacity=".22"/>
      <g stroke="#1f5a36" stroke-width="2" fill="none"><polyline points="40,540 40,420 300,420 300,540"/><polyline points="40,540 300,540"/>
        ${Array.from({ length: 9 }, (_, i) => `<line x1="${40 + i * 29}" y1="420" x2="${40 + i * 29}" y2="540" opacity=".55"/>`).join('')}
        ${Array.from({ length: 5 }, (_, i) => `<line x1="40" y1="${440 + i * 25}" x2="300" y2="${440 + i * 25}" opacity=".55"/>`).join('')}</g>
    </g>
    <!-- ベンチ -->
    <rect x="70" y="385" width="190" height="10" fill="#6b7f96" opacity=".7"/>
    ${figs}
    ${petals}
  </svg>`;
}

export function renderMain(): string {
  const s = game();
  rechargeQuota(s.quota, Date.now());
  const q = s.quota;
  const over = q.days > QUOTA_MAX_DAYS;
  const counts = MENU_ORDER.map((m) => {
    const n = s.roster.filter((p) => (p.injury ? 'REST' : s.assignments[p.id]) === m).length;
    return n ? `${MENU_META[m].title}${n}名` : '';
  }).filter(Boolean).join(' / ');
  const body = `<div class="scene">${scene()}
    <div class="quota-box"><b>⏳ 進行可能 ${q.days}日</b> ${over ? '<span class="badge gold">上限突破</span>' : ''}
      <div class="meter"><i style="width:${Math.min(100, (q.days / QUOTA_MAX_DAYS) * 100)}%"></i></div>
      <div class="sub">自然回復上限 ${QUOTA_MAX_DAYS}日 ／ チケット 無料${s.tickets.free}・青雲${s.tickets.paid}</div></div>
    ${calendarHtml()}
    <div class="banner-note">本日の練習: ${esc(counts || '—')} <button class="btn gold" data-act="start-demo-match" style="margin-left:14px;padding:4px 12px;font-size:12px;border-radius:6px;cursor:pointer">⚾ 練習試合を行う</button></div>
  </div>`;
  return shell('main' as never, '', body);
}

registerActions({
  'cal-toggle': (el) => el.classList.toggle('open'),
});
