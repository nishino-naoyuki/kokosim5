import { abilityRank, pitchVelocity } from '../../core/abilities';
import type { Player, Position } from '../../core/types';
import { game, overall, touch } from '../../game/state';
import { registerActions, requestRender, shell, toast } from '../core';
import { HAND, POS_JA, POS_LONG, esc, rank } from '../format';
import { renderAvatarSvg } from '../../render/avatarSvg';

export interface LineupSlot {
  order: number; // 1..9
  pos: Position;
  playerId: string;
}

const POS_ALL: Position[] = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];

let lineup: LineupSlot[] = [];
let lineupSchoolId = '';
let selA: number | null = 2; // 0-indexed (default: 3番)
let selB: number | null = 4; // 0-indexed (default: 5番)
let subTab: 'LINEUP' | 'PITCHERS' | 'BENCH' = 'LINEUP';

function ensureLineup(mode: 'BALANCE' | 'BATTING' | 'DEFENSE' | 'GRADE' = 'BALANCE'): void {
  const s = game();
  if (lineup.length === 9 && lineupSchoolId === s.worldSeed && mode === 'BALANCE') return;
  lineupSchoolId = s.worldSeed;

  const used = new Set<string>();
  const scoreFor = (p: Player, pos: Position): number => {
    const a = p.abilities;
    const posBonus = p.position === pos ? 25 : 0;
    const gBonus = mode === 'GRADE' ? p.grade * 12 : 0;
    if (pos === 'P') return (p.position === 'P' ? 40 : 0) + overall(p) + gBonus;
    if (mode === 'BATTING') return posBonus + a.power * 0.45 + a.contact * 0.45 + a.speed * 0.1 + gBonus;
    if (mode === 'DEFENSE') return posBonus + a.fielding * 0.45 + a.arm * 0.25 + a.reaction * 0.3 + gBonus;
    return posBonus + overall(p) + p.condition * 2 + gBonus;
  };

  const chosen: { pos: Position; player: Player }[] = [];
  for (const pos of POS_ALL) {
    const cand = s.roster
      .filter((p) => !used.has(p.id) && !p.injury)
      .sort((a, b) => scoreFor(b, pos) - scoreFor(a, pos))[0] ?? s.roster.find((p) => !used.has(p.id))!;
    used.add(cand.id);
    chosen.push({ pos, player: cand });
  }

  // 打順編成: 3・4・5番に強打者、1・2番に俊足巧打、9番に投手
  const batScore = (p: Player) => p.abilities.power * 0.48 + p.abilities.contact * 0.42 + p.abilities.eye * 0.1;
  const spdScore = (p: Player) => p.abilities.speed * 0.55 + p.abilities.contact * 0.45;
  const pitcherSlot = chosen.find((c) => c.pos === 'P')!;
  const fielders = chosen.filter((c) => c.pos !== 'P');

  fielders.sort((a, b) => batScore(b.player) - batScore(a.player));
  const cleanups = fielders.slice(0, 3); // 4番, 3番, 5番
  const rest = fielders.slice(3).sort((a, b) => spdScore(b.player) - spdScore(a.player));

  const ordered = [
    rest[0],      // 1番
    rest[1],      // 2番
    cleanups[1],  // 3番
    cleanups[0],  // 4番
    cleanups[2],  // 5番
    rest[2],      // 6番
    rest[3],      // 7番
    rest[4],      // 8番
    pitcherSlot,  // 9番
  ];
  lineup = ordered.map((c, idx) => ({ order: idx + 1, pos: c.pos, playerId: c.player.id }));
}

function condCircle(c: number): string {
  if (c >= 3) return `<span class="badge" style="background:#dc2626;color:#fff">↑ 絶好調</span>`;
  if (c >= 1) return `<span class="badge" style="background:#f97316;color:#fff">↗ 好調</span>`;
  if (c === 0) return `<span class="badge" style="background:#eab308;color:#fff">→ 普通</span>`;
  if (c >= -2) return `<span class="badge" style="background:#2563eb;color:#fff">↘ 不調</span>`;
  return `<span class="badge" style="background:#7c3aed;color:#fff">↓ 絶不調</span>`;
}

function posFit(p: Player, pos: Position): { sym: string; color: string } {
  if (p.position === pos) return { sym: '◎', color: '#16a34a' };
  const sameGroup =
    (['1B', '2B', '3B', 'SS'].includes(p.position) && ['1B', '2B', '3B', 'SS'].includes(pos)) ||
    (['LF', 'CF', 'RF'].includes(p.position) && ['LF', 'CF', 'RF'].includes(pos));
  return sameGroup ? { sym: '◯', color: '#2563eb' } : { sym: '⚠️', color: '#d97706' };
}

const PIN_COORDS: Record<Position, { x: number; y: number }> = {
  CF: { x: 250, y: 48 },
  LF: { x: 105, y: 84 },
  RF: { x: 395, y: 84 },
  SS: { x: 192, y: 145 },
  '2B': { x: 308, y: 145 },
  '3B': { x: 142, y: 198 },
  '1B': { x: 358, y: 198 },
  P: { x: 250, y: 196 },
  C: { x: 250, y: 262 },
};

function fieldSvg(): string {
  const s = game();
  const pins = lineup
    .map((slot, idx) => {
      const p = s.roster.find((x) => x.id === slot.playerId)!;
      const pt = PIN_COORDS[slot.pos];
      const fit = posFit(p, slot.pos);
      const isA = selA === idx;
      const isB = selB === idx;
      const stroke = isA ? '#2563eb' : isB ? '#ea580c' : '#1e3a8a';
      const bg = isA ? '#dbeafe' : isB ? '#ffedd5' : '#ffffff';
      return `<g class="field-pin" transform="translate(${pt.x} ${pt.y})" data-pin-idx="${idx}" style="cursor:grab">
        <rect x="-52" y="-18" width="104" height="34" rx="8" fill="${bg}" stroke="${stroke}" stroke-width="${isA || isB ? 3 : 1.8}"/>
        <text x="0" y="-3" text-anchor="middle" font-size="11" font-weight="900" fill="#0f172a">${POS_JA[slot.pos]} #${s.jersey[p.id] ?? 99} ${esc(p.name.family)}</text>
        <text x="0" y="11" text-anchor="middle" font-size="10" font-weight="800" fill="${fit.color}">打順${slot.order}番・適性${fit.sym}</text>
      </g>`;
    })
    .join('');

  return `<svg viewBox="0 0 500 295" width="100%" height="250" style="background:linear-gradient(180deg,#15803d 0%,#166534 100%);border-radius:10px;border:1px solid #cbd5e1;user-select:none">
    <!-- 外野アーク・内野黒土 -->
    <path d="M 30 285 Q 250 -20 470 285 Z" fill="#22c55e" opacity="0.25"/>
    <polygon points="250,122 365,200 250,272 135,200" fill="#b07d4f" stroke="#ffffff" stroke-width="2"/>
    <polygon points="250,145 330,200 250,250 170,200" fill="#16a34a" opacity="0.65"/>
    <circle cx="250" cy="198" r="14" fill="#b07d4f" stroke="#fff" stroke-width="1.2"/>
    <line x1="250" y1="272" x2="60" y2="140" stroke="#fff" stroke-width="2"/>
    <line x1="250" y1="272" x2="440" y2="140" stroke="#fff" stroke-width="2"/>
    ${pins}
  </svg>`;
}

function compareCard(): string {
  const s = game();
  const slotA = selA !== null ? lineup[selA] : null;
  const slotB = selB !== null ? lineup[selB] : null;
  const pA = slotA ? s.roster.find((x) => x.id === slotA.playerId) ?? null : null;
  const pB = slotB ? s.roster.find((x) => x.id === slotB.playerId) ?? null : null;

  const oneCard = (p: Player | null, slot: LineupSlot | null, tag: 'A' | 'B') => {
    if (!p || !slot) {
      return `<div class="card" style="border:2px dashed #cbd5e1;text-align:center;color:#64748b;padding:24px">左の打順リストから【選択選手 ${tag}】をクリックしてください</div>`;
    }
    const a = p.abilities;
    const fit = posFit(p, slot.pos);
    return `<div class="card" style="border:2px solid ${tag === 'A' ? '#2563eb' : '#ea580c'};padding:10px 12px">
      <div style="display:flex;gap:10px;align-items:center">
        ${renderAvatarSvg(p.faceSeed, s.school.uniform.capColor, 50)}
        <div style="flex:1">
          <div style="font-size:11px;font-weight:800;color:${tag === 'A' ? '#2563eb' : '#ea580c'}">【選択選手 ${tag}】 ${slot.order}番・${POS_LONG[slot.pos]}</div>
          <div style="font-size:15px;font-weight:900;color:var(--navy)">#${s.jersey[p.id] ?? 99} ${esc(p.name.family)} ${esc(p.name.given)} <small>(${p.grade}年・${HAND(p)})</small></div>
        </div>
        ${condCircle(p.condition)}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:8px;font-size:12px;background:#f8fafc;padding:6px;border-radius:6px">
        <div>ミート ${rank(a.contact)}</div>
        <div>長打力 ${rank(a.power)}</div>
        <div>選球眼 ${rank(a.eye)}</div>
        <div>走力 ${rank(a.speed)}</div>
        <div>肩の強さ ${rank(a.arm)}</div>
        <div>捕球力 ${rank(a.fielding)}</div>
      </div>
      <div style="margin-top:6px;font-size:11.5px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px">
        <span>現在守備適性: <b style="color:${fit.color}">${POS_LONG[slot.pos]} ${fit.sym}</b>（本職:${POS_JA[p.position]}）</span>
        <span>特性: ${p.traits.length ? p.traits.map((t) => `<span class="badge gold">★${esc(t)}</span>`).join(' ') : 'なし'}</span>
      </div>
    </div>`;
  };

  let advice = '左リストで2選手を選択すると、打撃・守備・調子の直接比較と采配アドバイスが表示されます。';
  if (pA && pB && slotA && slotB) {
    const batA = pA.abilities.power + pA.abilities.contact + pA.condition * 3;
    const batB = pB.abilities.power + pB.abilities.contact + pB.condition * 3;
    const defA = pA.abilities.fielding + pA.abilities.reaction;
    const defB = pB.abilities.fielding + pB.abilities.reaction;
    advice = `📊 <b>采配サマリー比較</b>：打撃・調子総合は <b>${esc(batA >= batB ? pA.name.family : pB.name.family)}</b> が優勢 ／ 守備反応は <b>${esc(defA >= defB ? pA.name.family : pB.name.family)}</b> が優勢。下のボタンで打順のみ・守備のみを自在に入れ替えられます。`;
  }

  return `<div class="card" style="padding:10px 12px">
    <h3 style="margin-bottom:8px">⚖️ 選択選手 2者直接比較カード</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${oneCard(pA, slotA, 'A')}
      ${oneCard(pB, slotB, 'B')}
    </div>
    <div style="margin-top:8px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:6px 10px;font-size:12px;color:#1e3a8a">${advice}</div>
  </div>`;
}

export function renderOrder(): string {
  ensureLineup();
  const s = game();

  // チーム守備レーティング算出
  const playersInLineup = lineup.map((l) => ({ slot: l, p: s.roster.find((x) => x.id === l.playerId)! }));
  const infAvg =
    playersInLineup.filter((x) => ['1B', '2B', '3B', 'SS'].includes(x.slot.pos)).reduce((acc, x) => acc + x.p.abilities.fielding, 0) / 4;
  const ofAvg =
    playersInLineup.filter((x) => ['LF', 'CF', 'RF'].includes(x.slot.pos)).reduce((acc, x) => acc + x.p.abilities.fielding + x.p.abilities.speed * 0.2, 0) / 3.6;
  const catcher = playersInLineup.find((x) => x.slot.pos === 'C')?.p;
  const leftBatters = playersInLineup.filter((x) => x.p.bats === 'L').length;
  const rightBatters = 9 - leftBatters;

  const leftList = lineup
    .map((slot, idx) => {
      const p = s.roster.find((x) => x.id === slot.playerId)!;
      const isA = selA === idx;
      const isB = selB === idx;
      const border = isA ? '2px solid #2563eb' : isB ? '2px solid #ea580c' : '1px solid #e2e8f0';
      const bg = isA ? '#eff6ff' : isB ? '#fff7ed' : p.condition <= -2 ? '#fef2f2' : '#ffffff';
      return `<div class="clickable" data-act="ord-pick" data-idx="${idx}" style="display:flex;align-items:center;gap:8px;padding:7px 10px;border:${border};background:${bg};border-radius:8px;margin-bottom:5px;cursor:pointer">
        <span style="width:24px;height:24px;border-radius:50%;background:${isA ? '#2563eb' : isB ? '#ea580c' : '#1e3a8a'};color:#fff;display:grid;place-items:center;font-weight:900;font-size:12px">${slot.order}</span>
        <span class="badge ${slot.pos === 'P' ? 'red' : slot.pos === 'C' ? 'navy' : 'green'}">${POS_JA[slot.pos]}</span>
        <b style="font-size:13.5px;color:var(--navy)">#${s.jersey[p.id] ?? 99} ${esc(p.name.family)} ${esc(p.name.given)}</b>
        <span style="font-size:11px;color:#64748b">${p.grade}年・${p.bats === 'R' ? '右打' : p.bats === 'L' ? '左打' : '両打'}</span>
        <span style="margin-left:auto">${condCircle(p.condition)}</span>
        <span class="badge" style="background:${isA ? '#2563eb' : isB ? '#ea580c' : '#e2e8f0'};color:${isA || isB ? '#fff' : '#334155'}">${isA ? '選択A' : isB ? '選択B' : '選択'}</span>
      </div>`;
    })
    .join('');

  const canSwap = selA !== null && selB !== null && selA !== selB;

  const benchList = s.roster
    .filter((p) => !lineup.some((l) => l.playerId === p.id))
    .map((p) => {
      const a = p.abilities;
      const kmh = pitchVelocity(a.arm, a.form, p.traits);
      return `<div class="card" style="padding:8px 10px;display:flex;align-items:center;gap:10px">
        ${renderAvatarSvg(p.faceSeed, s.school.uniform.capColor, 42)}
        <div style="flex:1">
          <div><b>#${s.jersey[p.id] ?? 99} ${esc(p.name.family)} ${esc(p.name.given)}</b> (${p.grade}年・${POS_LONG[p.position]})</div>
          <div style="font-size:11.5px;color:#475569">
            ${p.position === 'P' ? `球速 <b>${kmh}km/h</b> / 制球 ${rank(a.control)} / 変化 ${rank(a.breaking)}` : `ミート ${rank(a.contact)} / 長打 ${rank(a.power)} / 走 ${rank(a.speed)} / 捕 ${rank(a.fielding)}`}
          </div>
        </div>
        ${condCircle(p.condition)}
        ${
          selA !== null
            ? `<button class="btn primary" style="padding:6px 10px;font-size:12px" data-act="ord-sub-in" data-id="${p.id}">選択A(${lineup[selA].order}番)と交代</button>`
            : ''
        }
      </div>`;
    })
    .join('');

  const body = `<div style="padding:10px 16px;height:100%;display:flex;flex-direction:column;gap:10px">
    <div class="card" style="padding:8px 14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div class="chips">
        <button class="${subTab === 'LINEUP' ? 'on' : ''}" data-act="ord-tab" data-v="LINEUP">⚾ スタメン・打順編成</button>
        <button class="${subTab === 'BENCH' ? 'on' : ''}" data-act="ord-tab" data-v="BENCH">🔄 控え部員とスタメン入替 (${s.roster.length - 9}名)</button>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn" data-act="ord-auto" data-mode="BALANCE">おまかせ：バランス重視</button>
        <button class="btn" data-act="ord-auto" data-mode="BATTING">打力優先</button>
        <button class="btn" data-act="ord-auto" data-mode="DEFENSE">守備優先</button>
        <button class="btn" data-act="ord-auto" data-mode="GRADE">上級生優先</button>
        <button class="btn gold" data-act="ord-save">💾 オーダー保存</button>
      </div>
    </div>

    <div style="flex:1;min-height:0;display:grid;grid-template-columns:430px 1fr;gap:12px">
      <!-- 左ペイン：スタメン打順一覧 ＆ 入れ替え操作ボタン -->
      <div class="card" style="display:flex;flex-direction:column;min-height:0;padding:12px">
        <h3>📋 スタメン打順一覧（2選手クリックで比較・入替）</h3>
        <div style="flex:1;overflow:auto;padding-right:4px">${leftList}</div>
        <div style="border-top:1px solid var(--border);padding-top:8px;margin-top:6px;display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <button class="btn primary" data-act="ord-swap-bat" ${canSwap ? '' : 'disabled'}>⇅ 打順を入れ替える</button>
          <button class="btn primary" data-act="ord-swap-pos" ${canSwap ? '' : 'disabled'}>🛡️ 守備位置を入れ替える</button>
          <button class="btn gold" data-act="ord-swap-both" ${canSwap ? '' : 'disabled'}>🔄 完全スワップ (打順+守備)</button>
          <button class="btn" data-act="ord-clear-sel">✕ 選択解除</button>
        </div>
      </div>

      <!-- 右ペイン -->
      ${
        subTab === 'LINEUP'
          ? `<div style="display:flex;flex-direction:column;gap:10px;min-height:0;overflow:auto">
              <div class="card" style="padding:10px 12px;display:grid;grid-template-columns:1fr 220px;gap:12px;align-items:center">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                    <h3 style="margin:0">🏟️ 守備配置ミニ球場（ピンをクリックまたはドラッグ＆ドロップで守備スワップ）</h3>
                    <span class="badge navy">⇄ D&D守備スワップ対応</span>
                  </div>
                  ${fieldSvg()}
                </div>
                <div style="background:#f8fafc;border:1px solid var(--border);border-radius:10px;padding:10px;font-size:12.5px;line-height:1.8">
                  <div style="font-weight:900;color:var(--navy);border-bottom:1px solid #cbd5e1;padding-bottom:4px;margin-bottom:6px">🛡️ チーム守備レーティング</div>
                  <div>内野守備力: <b>${abilityRank(infAvg)} (${Math.round(infAvg)})</b></div>
                  <div>外野守備力: <b>${abilityRank(ofAvg)} (${Math.round(ofAvg)})</b></div>
                  <div>捕手肩力: <b>${catcher ? `${abilityRank(catcher.abilities.arm)} (${Math.round(catcher.abilities.arm)})` : '-'}</b></div>
                  <div>左右打席比: <b>左${leftBatters} / 右${rightBatters}</b></div>
                </div>
              </div>
              ${compareCard()}
            </div>`
          : `<div class="card" style="overflow:auto">
              <h3>🔄 控え部員リスト（左で選択Aにした打順枠と入れ替え可能）</h3>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:8px">${benchList}</div>
            </div>`
      }
    </div>
  </div>`;

  return shell('order', 'オーダー設定（2選手比較 ＆ ミニ球場D&D）', body);
}

export function bindOrder(root: HTMLElement): void {
  let dragPinIdx: number | null = null;
  root.querySelectorAll<SVGGElement>('.field-pin').forEach((pin) => {
    const idx = Number(pin.dataset.pinIdx);
    pin.addEventListener('mousedown', () => {
      dragPinIdx = idx;
    });
    pin.addEventListener('mouseup', () => {
      if (dragPinIdx !== null && dragPinIdx !== idx) {
        const tmp = lineup[dragPinIdx].pos;
        lineup[dragPinIdx].pos = lineup[idx].pos;
        lineup[idx].pos = tmp;
        selA = dragPinIdx;
        selB = idx;
        dragPinIdx = null;
        toast('ミニ球場上で守備位置をスワップしました');
        requestRender();
      }
    });
  });
}

registerActions({
  'ord-tab': (el) => {
    subTab = el.dataset.v as 'LINEUP' | 'BENCH';
    requestRender();
  },
  'ord-pick': (el) => {
    const idx = Number(el.dataset.idx);
    if (selA === idx) selA = null;
    else if (selB === idx) selB = null;
    else if (selA === null) selA = idx;
    else selB = idx;
    requestRender();
  },
  'ord-swap-bat': () => {
    if (selA === null || selB === null) return;
    const a = lineup[selA];
    const b = lineup[selB];
    lineup[selA] = { order: a.order, pos: b.pos, playerId: b.playerId };
    lineup[selB] = { order: b.order, pos: a.pos, playerId: a.playerId };
    toast('打順を入れ替えました（守備位置は維持）');
    requestRender();
  },
  'ord-swap-pos': () => {
    if (selA === null || selB === null) return;
    const tmp = lineup[selA].pos;
    lineup[selA].pos = lineup[selB].pos;
    lineup[selB].pos = tmp;
    toast('守備位置を入れ替えました（打順は維持）');
    requestRender();
  },
  'ord-swap-both': () => {
    if (selA === null || selB === null) return;
    const tmp = lineup[selA].playerId;
    lineup[selA].playerId = lineup[selB].playerId;
    lineup[selB].playerId = tmp;
    toast('打順と守備位置を完全スワップしました');
    requestRender();
  },
  'ord-clear-sel': () => {
    selA = null;
    selB = null;
    requestRender();
  },
  'ord-auto': (el) => {
    lineup = [];
    ensureLineup(el.dataset.mode as 'BALANCE' | 'BATTING' | 'DEFENSE' | 'GRADE');
    toast('おまかせ自動編成を適用しました');
    requestRender();
  },
  'ord-sub-in': (el) => {
    if (selA === null) return;
    lineup[selA].playerId = el.dataset.id!;
    toast(`${lineup[selA].order}番に選手を起用しました`);
    requestRender();
  },
  'ord-save': () => {
    touch();
    toast('💾 オーダー設定を保存しました');
  },
});
