import { fatigueZone } from '../../core/fatigue';
import type { Player, TrainingMenu } from '../../core/types';
import { autoAssignAll, game, setAllMenu, setMenu } from '../../game/state';
import { registerActions, requestRender, shell, toast } from '../core';
import { MENU_META, MENU_ORDER, POS_JA, esc, personalityLabel, rank } from '../format';

type ViewMode = 'BOARD' | 'LIST';
let viewMode: ViewMode = 'BOARD';
let selectedPlayerId: string | null = null;

function fatigueColor(f: number): string {
  const z = fatigueZone(f);
  return z === 'SAFE' ? '#16a34a' : z === 'CAUTION' ? '#d97706' : '#dc2626';
}

function playerChip(p: Player, jersey: number): string {
  const f = Math.round(p.fatigue);
  const warn = f >= 80;
  const inj = !!p.injury;
  const sel = selectedPlayerId === p.id;
  return `<div class="chip ${warn ? 'warn' : ''} ${inj ? 'inj' : ''} ${sel ? 'sel-chip' : ''}" draggable="true" data-act="tr-tap-chip" data-player-id="${p.id}">
    <div class="l1">
      <span>:: #${jersey} ${esc(p.name.family)} ${esc(p.name.given)}</span>
      <span style="color:${fatigueColor(f)}">${inj ? '🚑療養' : `疲労:${f}%`}</span>
    </div>
    <div class="l2">
      <span>${p.grade}年・${POS_JA[p.position]} (${esc(personalityLabel(p))})</span>
      <span class="bar"><i style="width:${Math.min(100, f)}%;background:${fatigueColor(f)}"></i></span>
    </div>
  </div>`;
}

function boardView(): string {
  const s = game();
  const cards = MENU_ORDER.map((menu) => {
    const meta = MENU_META[menu];
    const members = s.roster.filter((p) => (s.assignments[p.id] ?? 'REST') === menu);
    const canTapDrop = Boolean(selectedPlayerId && (s.assignments[selectedPlayerId] ?? 'REST') !== menu);
    return `<div class="tr-card ${meta.rest ? 'rest' : ''} ${canTapDrop ? 'over' : ''}" data-drop-menu="${menu}" data-act="tr-tap-card">
      <h4>
        <span>【${meta.title}】 ${meta.sub}</span>
        <button class="all" data-act="tr-set-all" data-menu="${menu}">全員に設定</button>
      </h4>
      <div class="tr-meta">
        <span>負荷: <b>${meta.load}</b></span>
        <span class="${meta.danger ? 'dg' : ''}">けが率: <b>${meta.injury}${meta.danger ? '[危険]' : ''}</b></span>
        <span style="margin-left:auto">参加人数: <b>${members.length}名</b></span>
        <div class="g">${meta.rest ? '効果: ' : '成長: '}<b>${meta.growth}</b></div>
      </div>
      <div class="tr-chips">
        ${members.map((p) => playerChip(p, s.jersey[p.id] ?? 99)).join('')}
        ${meta.rest ? `<div style="grid-column:1/-1;border:2px dashed #22a05a;border-radius:6px;padding:8px;text-align:center;color:#15803d;font-weight:800;font-size:12px">+ ここにドロップして休養！</div>` : ''}
      </div>
    </div>`;
  }).join('');
  return `<div class="tr-grid">${cards}</div>`;
}

function listView(): string {
  const s = game();
  const rows = s.roster
    .map((p) => {
      const f = Math.round(p.fatigue);
      const cur = s.assignments[p.id] ?? 'REST';
      const a = p.abilities;
      return `<tr>
        <td><b>#${s.jersey[p.id] ?? 99}</b></td>
        <td><b>${esc(p.name.family)} ${esc(p.name.given)}</b></td>
        <td>${p.grade}年</td>
        <td><span class="badge navy">${POS_JA[p.position]}</span></td>
        <td>${esc(personalityLabel(p))}</td>
        <td><span style="color:${fatigueColor(f)};font-weight:800">${f}%</span> <span class="bar"><i style="width:${Math.min(100, f)}%;background:${fatigueColor(f)}"></i></span></td>
        <td>長打 ${rank(a.power)} / ミート ${rank(a.contact)} / 走 ${rank(a.speed)} / 捕 ${rank(a.fielding)} / 肩 ${rank(a.arm)}</td>
        <td>
          <select data-act-change="tr-select-one" data-id="${p.id}">
            ${MENU_ORDER.map((m) => `<option value="${m}" ${cur === m ? 'selected' : ''}>【${MENU_META[m].title}】${MENU_META[m].sub}</option>`).join('')}
          </select>
        </td>
      </tr>`;
    })
    .join('');
  return `<div class="list-view">
    <table class="tbl">
      <thead><tr><th>背番号</th><th>氏名</th><th>学年</th><th>守備</th><th>性格</th><th>疲労度</th><th>主要能力</th><th>個別練習メニュー</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

export function renderTraining(): string {
  const body = `<div class="tr-wrap">
    <div class="tr-bar">
      <div class="seg" style="width:360px">
        <button class="${viewMode === 'BOARD' ? 'on' : ''}" data-act="tr-view" data-v="BOARD">練習メニュー別ボード (ドラッグ割当)</button>
        <button class="${viewMode === 'LIST' ? 'on' : ''}" data-act="tr-view" data-v="LIST">部員一覧リスト表示</button>
      </div>
      <div class="hint">🔹 操作方法: 部員チップをタップ選択➜移動先カードをタップ（またはドラッグ＆ドロップ）で変更 ｜ [全員に設定] で一括適用</div>
      <button class="btn green" data-act="tr-rest-all">全員を全体休養に</button>
      <button class="btn" data-act="tr-auto-all">ポジションおまかせ ▼</button>
    </div>
    ${viewMode === 'BOARD' ? boardView() : listView()}
  </div>`;
  return shell('training', '練習指示（メニュー別ボード ＆ ドラッグ編成）', body);
}

export function bindTraining(root: HTMLElement): void {
  let draggedPlayerId: string | null = null;
  root.querySelectorAll<HTMLElement>('[data-player-id]').forEach((chip) => {
    chip.addEventListener('dragstart', (ev) => {
      draggedPlayerId = chip.dataset.playerId!;
      ev.dataTransfer?.setData('text/plain', draggedPlayerId);
    });
  });

  root.querySelectorAll<HTMLElement>('[data-drop-menu]').forEach((card) => {
    card.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      card.classList.add('over');
    });
    card.addEventListener('dragleave', () => card.classList.remove('over'));
    card.addEventListener('drop', (ev) => {
      ev.preventDefault();
      card.classList.remove('over');
      const pid = draggedPlayerId || ev.dataTransfer?.getData('text/plain');
      const menu = card.dataset.dropMenu as TrainingMenu;
      if (pid && menu) {
        setMenu(pid, menu);
        requestRender();
      }
    });
  });

  root.querySelectorAll<HTMLSelectElement>('[data-act-change="tr-select-one"]').forEach((sel) => {
    sel.addEventListener('change', () => {
      setMenu(sel.dataset.id!, sel.value as TrainingMenu);
      requestRender();
    });
  });
}

registerActions({
  'tr-tap-chip': (el) => {
    const pid = el.dataset.playerId;
    if (!pid) return;
    selectedPlayerId = selectedPlayerId === pid ? null : pid;
    requestRender();
  },
  'tr-tap-card': (el) => {
    if (!selectedPlayerId) return;
    const menu = el.dataset.dropMenu as TrainingMenu | undefined;
    if (!menu) return;
    setMenu(selectedPlayerId, menu);
    selectedPlayerId = null;
    requestRender();
  },
  'tr-view': (el) => {
    viewMode = el.dataset.v as ViewMode;
    selectedPlayerId = null;
    requestRender();
  },
  'tr-set-all': (el) => {
    const m = el.dataset.menu as TrainingMenu;
    setAllMenu(m);
    selectedPlayerId = null;
    toast(`全部員を「【${MENU_META[m].title}】」へ一括設定しました`);
    requestRender();
  },
  'tr-rest-all': () => {
    setAllMenu('REST');
    selectedPlayerId = null;
    toast('全部員を「休養・ケア」に設定しました');
    requestRender();
  },
  'tr-auto-all': () => {
    autoAssignAll();
    selectedPlayerId = null;
    toast('ポジション別のおまかせ練習メニューに振り分けました');
    requestRender();
  },
});
