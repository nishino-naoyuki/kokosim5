import { pitchVelocity } from '../../core/abilities';
import type { Player } from '../../core/types';
import { game, overall } from '../../game/state';
import { openModal, registerActions, requestRender, shell } from '../core';
import { HAND, POS_JA, POS_LONG, esc, growthLabel, hash32, personalityLabel, posGroup, rank } from '../format';
import { renderAvatarSvg } from '../../render/avatarSvg';
import { uniformFigureSvg } from '../uniformSvg';

type PosFilter = 'ALL' | 'P' | 'C' | 'IF' | 'OF';
type GradeFilter = 'ALL' | '3' | '2' | '1';
type SortKey = 'overall' | 'batting' | 'defense' | 'velocity' | 'grade' | 'jersey';

let posF: PosFilter = 'ALL';
let gradeF: GradeFilter = 'ALL';
let sortK: SortKey = 'overall';
let sortDesc = true;

function subPositions(p: Player): string {
  const h = hash32(p.id);
  if (p.position === 'P') return h % 2 === 0 ? '外△' : '一△';
  if (p.position === 'C') return '一○ 外△';
  if (p.position === '1B') return '三△ 外○';
  if (p.position === '2B' || p.position === 'SS') return p.position === 'SS' ? '二○ 三○' : '遊○ 三△';
  if (p.position === '3B') return '一○ 二△';
  return '外○ 一△';
}

function condBadge(c: number): string {
  if (c >= 3) return `<span class="cond up">😄 絶好調 (+${c})</span>`;
  if (c >= 1) return `<span class="cond up">😊 好調 (+${c})</span>`;
  if (c === 0) return `<span class="cond">😐 普通 (0)</span>`;
  if (c >= -2) return `<span class="cond down">😟 不調 (${c})</span>`;
  return `<span class="cond down">😫 絶不調 (${c})</span>`;
}

function breakingList(p: Player): { name: string; val: number }[] {
  const h = hash32(p.id);
  const b = Math.round(p.abilities.breaking);
  const pool = ['スライダー', 'カーブ', 'フォーク', 'チェンジアップ', 'シンカー'];
  const p1 = pool[h % pool.length];
  const p2 = pool[(h + 2) % pool.length];
  return p.position === 'P' || b >= 55
    ? [
        { name: p1, val: b },
        { name: p2, val: Math.max(25, b - 8) },
      ]
    : [{ name: p1, val: Math.max(20, b - 10) }];
}

function sortValue(p: Player, jersey: Record<string, number>): number {
  const a = p.abilities;
  switch (sortK) {
    case 'overall': return overall(p);
    case 'batting': return a.power * 0.45 + a.contact * 0.45 + a.eye * 0.1;
    case 'defense': return a.fielding * 0.35 + a.arm * 0.25 + a.speed * 0.2 + a.reaction * 0.2;
    case 'velocity': return p.position === 'P' ? pitchVelocity(a.arm, a.form, p.traits) : 0;
    case 'grade': return p.grade;
    case 'jersey': return -(jersey[p.id] ?? 99);
  }
}

export function openPlayerDetailModal(playerId: string): void {
  const s = game();
  const p = s.roster.find((x) => x.id === playerId);
  if (!p) return;
  const a = p.abilities;
  const jNo = s.jersey[p.id] ?? 99;
  const kmh = pitchVelocity(a.arm, a.form, p.traits);
  const brks = breakingList(p);

  const bar = (label: string, val: number, desc: string, cls = '') => {
    const v = Math.round(val);
    return `<div class="ab-row" title="${esc(desc)}">
      <div><b>${label}</b></div>
      <div class="ab-bar ${cls || (v >= 80 ? 'hot' : '')}"><i style="width:${v}%"></i></div>
      <div style="text-align:right">${rank(v)}</div>
    </div>`;
  };

  // 学年・能力に応じた通算/公式戦/全国大会成績表示
  const games = p.grade === 3 ? 34 : p.grade === 2 ? 16 : 2;
  const ab = games * 3 + (hash32(p.id) % 5);
  const avg = Math.min(0.46, Math.max(0.18, (a.contact * 0.0032 + a.power * 0.001 + 0.08)));
  const hits = Math.round(ab * avg);
  const hr = Math.max(0, Math.round(((a.power - 42) / 55) * (games * 0.35)));
  const rbi = Math.max(hits > 0 ? 1 : 0, Math.round(hits * 0.65 + hr * 1.4));
  const bb = Math.max(0, Math.round((a.eye / 100) * games * 0.55));
  const so = Math.max(0, Math.round(((100 - a.contact) / 100) * games * 0.65));
  const sb = Math.max(0, Math.round(((a.speed - 45) / 55) * games * 0.35));
  const obp = (hits + bb) / Math.max(1, ab + bb);
  const slg = (hits + hr * 3) / Math.max(1, ab);

  const offGames = Math.max(1, Math.floor(games * 0.45));
  const offAb = offGames * 3;
  const offHits = Math.round(offAb * avg);
  const offHr = Math.max(0, Math.floor(hr * 0.45));

  openModal(`
  <div class="modal-back" data-act="close-modal-bg">
    <div class="modal">
      <div class="modal-head">
        <h2>👤 選手詳細 — #${jNo} ${esc(p.name.family)} ${esc(p.name.given)} (${p.grade}年・${POS_LONG[p.position]}) [${HAND(p)}]</h2>
        <span style="margin-left:12px">${condBadge(p.condition)}</span>
        <button class="x" data-act="close-modal">✕ 閉じる</button>
      </div>
      <div class="modal-body">
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px;background:#f8fafc;border:1px solid var(--border);border-radius:10px;padding:12px">
          <!-- 一覧と同一の公式アバター顔バッジ -->
          <div style="display:flex;align-items:center;gap:10px;width:100%;background:#ffffff;border:1px solid #cbd5e1;border-radius:8px;padding:6px 10px;box-shadow:0 1px 2px rgba(0,0,0,0.04)">
            ${renderAvatarSvg(p.faceSeed, s.school.uniform.capColor, 46)}
            <div>
              <div style="font-weight:900;color:var(--navy);font-size:14px">#${jNo} ${esc(p.name.family)} ${esc(p.name.given)}</div>
              <div style="font-size:11px;color:#64748b">${HAND(p)} ｜ ${p.grade}年・${POS_LONG[p.position]}</div>
            </div>
          </div>
          <!-- 個別faceSeed連動 全身立ち絵プレビュー -->
          ${uniformFigureSvg(s.school.uniform, { mark: s.school.name.slice(0, 4), number: jNo, width: 175, stage: true, faceSeed: p.faceSeed })}
          <div style="width:100%;font-size:12px">
            <div><b>守備適性</b>: メイン ${POS_LONG[p.position]} / サブ ${subPositions(p)}</div>
            <div style="margin-top:4px"><b>性格 / 成長型</b>: <span class="badge navy">${esc(personalityLabel(p))}</span> <span class="badge pink">${esc(growthLabel(p))}</span></div>
            <div style="margin-top:6px"><b>習得特性</b>:<br>
              ${p.traits.length ? p.traits.map((t) => `<span class="badge gold" style="margin:2px">★ ${esc(t)}</span>`).join('') : '<span style="color:#64748b">特になし（実戦で開花）</span>'}
            </div>
          </div>
        </div>
        <div>
          <h3 style="margin:0 0 8px;color:var(--navy);font-size:14px">【選手能力ステータス（全13項目 MAX 100）】</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
            <div class="card" style="padding:10px 12px">
              <div style="font-weight:800;font-size:12px;color:var(--navy);margin-bottom:4px">⚾ 打撃・走塁パラメータ</div>
              ${bar('長打力', a.power, 'スイング速度・打球初速')}
              ${bar('ミート力', a.contact, 'バットに当てる能力')}
              ${bar('選球眼', a.eye, 'ボールを見極める能力')}
              ${bar('走力', a.speed, 'トップスピードの速さ')}
              ${bar('※加速(隠し)', a.accel, 'トップスピード到達速度（内部隠し値）', 'hidden')}
              <div style="margin-top:8px;padding-top:6px;border-top:1px dashed #cbd5e1;font-size:12px">
                <div><b>【投手項目】最高球速: <span style="color:#dc2626;font-size:15px">${kmh} km/h</span></b></div>
                <div style="color:#475569;font-size:11px">（肩の強さ ${Math.round(a.arm)} × 投球フォーム ${Math.round(a.form)} より算出）</div>
                ${bar('投球フォーム', a.form, 'フォーム再現性・球速決定')}
                ${bar('スタミナ', a.stamina, '投球スタミナ・基礎体力')}
                <div style="margin-top:4px"><b>変化球(配列)</b>: ${brks.map((b) => `<span class="badge navy">${b.name}: ${b.val}</span>`).join(' ')}</div>
              </div>
            </div>
            <div class="card" style="padding:10px 12px">
              <div style="font-weight:800;font-size:12px;color:var(--navy);margin-bottom:4px">🛡️ 守備・精神・送球パラメータ</div>
              ${bar('捕球力', a.fielding, '守備力・エラー率低減')}
              ${bar('反応速度', a.reaction, '打球への初動・一歩目の速さ')}
              ${bar('肩の強さ', a.arm, '送球速度・投手基礎球速')}
              ${bar('コントロール', a.control, '送球正確性・投手制球力')}
              ${bar('判断力', a.judgment, '走塁・中継・送球先の状況判断')}
              ${bar('度胸', a.guts, 'プレッシャー耐性・実戦で上昇')}
              <div style="margin-top:8px;padding-top:6px;border-top:1px dashed #cbd5e1;font-size:12px">
                <div><b>疲労度</b>: <b>${Math.round(p.fatigue)}%</b> ${p.injury ? `<span class="badge red">🚑 ケガ療養中（全治${p.injury.daysRemaining}日）</span>` : ''}</div>
              </div>
            </div>
          </div>

          <h3 style="margin:12px 0 6px;color:var(--navy);font-size:14px">【打撃成績（3大区分 常時集計・対比表示）】</h3>
          <table class="stat-table">
            <thead>
              <tr><th>成績区分</th><th>打率</th><th>試合</th><th>打数</th><th>安打</th><th>本塁打</th><th>打点</th><th>三振</th><th>四球</th><th>盗塁</th><th>出塁率</th><th>OPS</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><b>① 通算成績</b></td>
                <td><b>.${String(Math.round(avg * 1000)).padStart(3, '0')}</b></td>
                <td>${games}</td><td>${ab}</td><td>${hits}</td><td>${hr}</td><td>${rbi}</td><td>${so}</td><td>${bb}</td><td>${sb}</td>
                <td>.${String(Math.round(obp * 1000)).padStart(3, '0')}</td>
                <td><b>${(obp + slg).toFixed(3)}</b></td>
              </tr>
              <tr>
                <td><b>② 公式戦成績</b></td>
                <td>.${String(Math.round((offHits / Math.max(1, offAb)) * 1000)).padStart(3, '0')}</td>
                <td>${offGames}</td><td>${offAb}</td><td>${offHits}</td><td>${offHr}</td><td>${Math.round(rbi * 0.45)}</td><td>${Math.round(so * 0.45)}</td><td>${Math.round(bb * 0.45)}</td><td>${Math.round(sb * 0.45)}</td>
                <td>.${String(Math.round(obp * 1000)).padStart(3, '0')}</td>
                <td>${(obp + slg).toFixed(3)}</td>
              </tr>
              <tr>
                <td><b>③ 全国大会(甲子園)</b></td>
                <td>.---</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>.---</td><td>.---</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>`);
}

export function renderPlayers(): string {
  const s = game();
  const list = s.roster
    .filter((p) => (posF === 'ALL' ? true : posGroup(p.position) === posF))
    .filter((p) => (gradeF === 'ALL' ? true : String(p.grade) === gradeF))
    .slice()
    .sort((a, b) => (sortDesc ? 1 : -1) * (sortValue(b, s.jersey) - sortValue(a, s.jersey)));

  const gradeBadge = (g: number) =>
    g === 3 ? `<span class="badge gold">3年</span>` : g === 2 ? `<span class="badge navy">2年</span>` : `<span class="badge green">1年</span>`;

  const rows = list
    .map((p) => {
      const a = p.abilities;
      const jNo = s.jersey[p.id] ?? 99;
      const kmh = pitchVelocity(a.arm, a.form, p.traits);
      const isP = p.position === 'P';
      return `<tr class="clickable" data-act="pl-detail" data-id="${p.id}">
        <td style="display:flex;align-items:center;gap:6px">
          ${renderAvatarSvg(p.faceSeed, s.school.uniform.capColor, 38)}
          <b>#${jNo}</b>
        </td>
        <td><b>${esc(p.name.family)} ${esc(p.name.given)}</b><div style="font-size:11px;color:#64748b">${HAND(p)} / ${esc(personalityLabel(p))}</div></td>
        <td>${gradeBadge(p.grade)}</td>
        <td><span class="badge ${isP ? 'red' : p.position === 'C' ? 'navy' : 'green'}">${POS_JA[p.position]}</span></td>
        <td style="font-size:12px;color:#475569">${subPositions(p)}</td>
        <td>ミート ${rank(a.contact)} ／ 長打 ${rank(a.power)} ／ 選球 ${rank(a.eye)}</td>
        <td>走 ${rank(a.speed)} ／ 肩 ${rank(a.arm)} ／ 捕 ${rank(a.fielding)} ／ 反 ${rank(a.reaction)}</td>
        <td>${isP ? `<b>${kmh}km/h</b> ／ 制球 ${rank(a.control)} ／ 変化 ${rank(a.breaking)}` : '<span style="color:#94a3b8">-</span>'}</td>
        <td>${p.traits.length ? p.traits.map((t) => `<span class="badge gold">★${esc(t)}</span>`).join(' ') : '<span style="color:#94a3b8">—</span>'}</td>
        <td>${condBadge(p.condition)}</td>
      </tr>`;
    })
    .join('');

  const body = `<div class="pl-wrap">
    <div class="card" style="padding:10px 14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span style="font-size:12px;font-weight:800;color:var(--muted)">ポジション:</span>
        <span class="chips">
          ${([['ALL', '全員'], ['P', '投手'], ['C', '捕手'], ['IF', '内野手'], ['OF', '外野手']] as [PosFilter, string][])
            .map(([k, l]) => `<button class="${posF === k ? 'on' : ''}" data-act="pl-pos" data-v="${k}">${l}</button>`)
            .join('')}
        </span>
        <span style="font-size:12px;font-weight:800;color:var(--muted);margin-left:8px">学年:</span>
        <span class="chips">
          ${([['ALL', '全学年'], ['3', '3年'], ['2', '2年'], ['1', '1年']] as [GradeFilter, string][])
            .map(([k, l]) => `<button class="${gradeF === k ? 'on' : ''}" data-act="pl-grade" data-v="${k}">${l}</button>`)
            .join('')}
        </span>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span style="font-size:12px;font-weight:800;color:var(--muted)">ソート順:</span>
        ${(
          [
            ['overall', '総合力順'],
            ['batting', '打力順'],
            ['defense', '守備順'],
            ['velocity', '球速順'],
            ['grade', '学年順'],
            ['jersey', '背番号順'],
          ] as [SortKey, string][]
        )
          .map(([k, l]) => `<button class="btn ${sortK === k ? 'primary' : ''}" style="padding:5px 10px;font-size:12px" data-act="pl-sort" data-v="${k}">${l}${sortK === k ? (sortDesc ? ' ▼' : ' ▲') : ''}</button>`)
          .join('')}
      </div>
    </div>
    <div class="tbl-wrap">
      <table class="tbl pl">
        <thead>
          <tr>
            <th>顔 / 背番号</th><th>氏名</th><th>学年</th><th>メイン</th><th>サブ適性</th>
            <th>打撃能力 (ミート/長打/選球)</th><th>守備能力 (走/肩/捕/反)</th><th>投手能力 (球速/制球/変化)</th><th>特性能力</th><th>調子</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="font-size:12px;color:#475569">💡 任意の選手行をクリックすると、全身立ち絵・全13項目ステータス・3区分打撃成績の<b>「選手詳細ポップアップモーダル」</b>が開きます。</div>
  </div>`;

  return shell('players', '選手一覧（ロスター管理 ＆ 詳細ポップアップ）', body);
}

registerActions({
  'pl-pos': (el) => {
    posF = el.dataset.v as PosFilter;
    requestRender();
  },
  'pl-grade': (el) => {
    gradeF = el.dataset.v as GradeFilter;
    requestRender();
  },
  'pl-sort': (el) => {
    const k = el.dataset.v as SortKey;
    if (sortK === k) sortDesc = !sortDesc;
    else {
      sortK = k;
      sortDesc = true;
    }
    requestRender();
  },
  'pl-detail': (el) => openPlayerDetailModal(el.dataset.id!),
});
