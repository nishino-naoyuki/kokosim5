import { createCustomSchool, DEFAULT_NEW_UNIFORM, PREFECTURES, REGION_BLOCKS, UNIFORM_COLORS, colorName, prefectureInfo, ratingRank, schoolsOf, type SchoolEntry } from '../../core/schools';
import type { UniformDesign } from '../../core/types';
import { createNewGame, hasSave, setGame, loadSave } from '../../game/state';
import { go, registerActions, requestRender, toast, schoolFull } from '../core';
import { esc, yen } from '../format';
import { contrastText, uniformChip, uniformFigureSvg } from '../uniformSvg';

type Mode = 'REAL' | 'NEW';
type Filter = 'ALL' | 'PRIVATE' | 'PUBLIC' | 'ELITE';

interface Draft {
  step: 1 | 2;
  mode: Mode;
  block: string;
  pref: string;
  filter: Filter;
  query: string;
  selectedId: string | null;
  newName: string;
  newPref: string;
  newPublic: boolean;
  motto: string;
  uniform: UniformDesign;
}

function freshDraft(): Draft {
  return {
    step: 1, mode: 'REAL', block: '九州・沖縄', pref: '福岡県', filter: 'ALL', query: '', selectedId: null,
    newName: '青雲', newPref: '福岡県', newPublic: false, motto: '不屈の闘志・甲子園初出場を目指す',
    uniform: { ...DEFAULT_NEW_UNIFORM },
  };
}

let d: Draft = freshDraft();

function autoNumberColor(u: UniformDesign): string {
  if (contrastText(u.shirtColor) === '#ffffff') return '#ffffff';
  return contrastText(u.underShirtColor) === '#ffffff' ? u.underShirtColor : '#14213d';
}

function selectedSchool(): SchoolEntry | null {
  if (d.mode === 'NEW') return null;
  return schoolsOf(d.pref).find((s) => s.id === d.selectedId) ?? null;
}

function visibleSchools(): SchoolEntry[] {
  const q = d.query.trim();
  return schoolsOf(d.pref)
    .filter((s) => (d.filter === 'PRIVATE' ? !s.isPublic : d.filter === 'PUBLIC' ? s.isPublic : d.filter === 'ELITE' ? s.baseRating >= 75 : true))
    .filter((s) => (q ? s.name.includes(q) : true))
    .sort((a, b) => b.baseRating - a.baseRating || a.name.localeCompare(b.name, 'ja'));
}

function schoolRows(): string {
  const list = visibleSchools();
  if (!list.length) return `<tr><td colspan="6" class="empty">該当する学校がありません</td></tr>`;
  return list
    .map(
      (s) => `<tr class="clickable ${s.id === d.selectedId ? 'sel' : ''}" data-act="pick-school" data-id="${s.id}">
      <td><input type="radio" ${s.id === d.selectedId ? 'checked' : ''} tabindex="-1"></td>
      <td><b>${esc(s.name)}</b>${s.real ? '' : ' <span class="badge" title="正式な実名データ未収録の仮名校">仮名</span>'}</td>
      <td><span class="badge ${s.isPublic ? 'green' : 'navy'}">${s.isPublic ? '公立' : '私立'}</span></td>
      <td>${esc(s.district)}</td>
      <td><span class="badge gold">Rank ${ratingRank(s.reputation)}</span></td>
      <td style="color:#475569">${esc(s.note)}</td></tr>`,
    )
    .join('');
}

function step1(): string {
  const info = prefectureInfo(d.pref);
  const cnt = (f: Filter) => schoolsOf(d.pref).filter((s) => (f === 'PRIVATE' ? !s.isPublic : f === 'PUBLIC' ? s.isPublic : f === 'ELITE' ? s.baseRating >= 75 : true)).length;
  const sel = selectedSchool();

  const left = `<div class="card">
    <div class="toggle">
      <button class="${d.mode === 'REAL' ? 'on' : ''}" data-act="set-mode" data-mode="REAL">🏫 実在校から選ぶ</button>
      <button class="${d.mode === 'NEW' ? 'on' : ''}" data-act="set-mode" data-mode="NEW">✏️ 新規作成</button>
    </div>
    <div class="tabs-mini">${REGION_BLOCKS.map((b) => `<button class="${b === d.block ? 'on' : ''}" data-act="set-block" data-block="${b}">${b}</button>`).join('')}</div>
    <div class="pref-list">${PREFECTURES.filter((p) => p.block === d.block)
      .map((p) => `<button class="${p.name === (d.mode === 'NEW' ? d.newPref : d.pref) ? 'on' : ''}" data-act="set-pref" data-pref="${p.name}">${p.name}<small>(${p.count}校${p.districts.length > 1 ? ' / ' + p.districts.join('・') : ''})</small></button>`)
      .join('')}</div>
    <div class="pref-sum"><b>${info.name}</b>：加盟 ${info.count}校<br>夏の大会：${esc(info.summer)}</div>
  </div>`;

  let center: string;
  let right: string;
  if (d.mode === 'REAL') {
    center = `<div class="card">
      <h3>${info.name}の高校データベース（${info.count}校）</h3>
      <div class="toolbar"><input id="q" type="search" placeholder="🔍 校名検索（例: 九国、大濠、東福岡…）" value="${esc(d.query)}">
        <span class="chips">${(
          [['ALL', 'すべて'], ['PRIVATE', '私立'], ['PUBLIC', '公立'], ['ELITE', '強豪(戦力75+)']] as [Filter, string][]
        ).map(([k, l]) => `<button class="${d.filter === k ? 'on' : ''}" data-act="set-filter" data-filter="${k}">${l} (${cnt(k)})</button>`).join('')}</span></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>校名</th><th>区分</th><th>地区</th><th>名声</th><th>特徴</th></tr></thead>
      <tbody id="school-tbody">${schoolRows()}</tbody></table></div>
      <div style="font-size:11px;color:#64748b;margin-top:6px">※「仮名」表示の学校は、正式な実名データ未収録のため自動生成された仮称です（実名データで順次差し替え予定）。</div>
    </div>`;
    right = `<div class="card">${
      sel
        ? `<h3>選択校プロフィール</h3>
        <div class="sum-name">${esc(schoolFull(sel.name))}</div>
        <div><span class="badge ${sel.isPublic ? 'green' : 'navy'}">${sel.isPublic ? '公立' : '私立'}</span> <span class="badge gold">Rank ${ratingRank(sel.reputation)}</span> <span class="badge">${esc(sel.prefecture)}・${esc(sel.district)}</span></div>
        <dl class="kv"><dt>基準戦力</dt><dd>${sel.baseRating}（安定度 ${sel.stability}）</dd>
        <dt>投手力</dt><dd>${ratingRank(sel.pitching)}${sel.pitching}</dd><dt>打撃力</dt><dd>${ratingRank(sel.batting)}${sel.batting}</dd><dt>守備力</dt><dd>${ratingRank(sel.defense)}${sel.defense}</dd>
        <dt>部員数</dt><dd>30名固定（1年10／2年10／3年10）</dd><dt>ユニフォーム</dt><dd>${uniformChip(sel.uniform)}</dd></dl>
        ${sel.note ? `<div class="note-box">「${esc(sel.note)}」</div>` : ''}`
        : `<h3>選択校プロフィール</h3><div class="empty">中央の一覧から学校を選んでください</div>`
    }</div>`;
  } else {
    center = `<div class="card form-card">
      <h3>新規高校を作成して参入</h3>
      <div class="field"><label>学校名</label><div style="display:flex;gap:8px;align-items:center"><input id="newName" type="text" maxlength="12" value="${esc(d.newName)}" style="flex:1"><b>高等学校</b></div></div>
      <div class="field"><label>都道府県（左のリストでも変更できます）</label><div><b>${esc(d.newPref)}</b>　<span class="badge">${prefectureInfo(d.newPref).count}校加盟</span></div></div>
      <div class="field"><label>設置区分</label><div class="seg"><button class="${!d.newPublic ? 'on' : ''}" data-act="set-public" data-v="0">私立</button><button class="${d.newPublic ? 'on' : ''}" data-act="set-public" data-v="1">公立</button></div></div>
      <div class="field"><label>チームモットー</label><input id="motto" type="text" maxlength="30" value="${esc(d.motto)}"></div>
      <div class="note-box">新規校は <b>Rank D（新規参入・挑戦校）</b> からの叩き上げスタートです。初期部費は ${yen(1_500_000)}。</div>
    </div>`;
    right = `<div class="card"><h3>チームプレビュー</h3>
      <div class="sum-name">${esc(schoolFull(d.newName || '（校名未入力）'))}</div>
      <div><span class="badge ${d.newPublic ? 'green' : 'navy'}">${d.newPublic ? '公立' : '私立'}</span> <span class="badge gold">Rank D</span> <span class="badge">${esc(d.newPref)}</span></div>
      <dl class="kv"><dt>初期部費</dt><dd>${yen(1_500_000)}</dd><dt>部員数</dt><dd>30名固定</dd><dt>大会</dt><dd>${esc(prefectureInfo(d.newPref).summer)}</dd></dl></div>`;
  }

  return `<div class="sel-grid">${left}${center}${right}</div>`;
}

function swatchRow(key: keyof UniformDesign, label: string, extra = ''): string {
  const cur = d.uniform[key] as string | undefined;
  return `<div class="ctl-row"><div class="lb">${label}</div><div class="swatches">
    ${UNIFORM_COLORS.map((c) => `<button class="sw ${cur === c.hex ? 'on' : ''}" title="${c.name}" style="background:${c.hex}" data-act="uni-set" data-key="${key}" data-val="${c.hex}"></button>`).join('')}
    <span class="cur" style="background:${cur ?? '#fff'};color:${contrastText(cur ?? '#ffffff')}">[ ${esc(colorName(cur ?? ''))} ]</span>${extra}</div></div>`;
}

function seg(key: string, items: [string, string][], cur: string): string {
  return `<div class="seg">${items.map(([v, l]) => `<button class="${cur === v ? 'on' : ''}" data-act="uni-set" data-key="${key}" data-val="${v}">${l}</button>`).join('')}</div>`;
}

function step2(): string {
  const sel = selectedSchool();
  const name = d.mode === 'REAL' && sel ? sel.name : d.newName;
  const pref = d.mode === 'REAL' && sel ? sel.prefecture : d.newPref;
  const u = { ...d.uniform, numberColor: autoNumberColor(d.uniform) };
  const info = prefectureInfo(pref);
  const year = 2026;
  return `<div class="uni-grid">
    <div style="display:flex;flex-direction:column;gap:12px;min-height:0">
      <div class="card"><h3>スクール情報カード</h3>
        <div class="school-card"><div class="crest" style="background:${u.capColor}">${esc((name || '校')[0])}</div>
          <div><div style="font-size:11px;color:var(--muted);font-weight:700">学校名称</div><div class="nm">${esc(schoolFull(name))}</div></div>
          <div class="rg"><span>地域</span><b>${esc(pref)}</b></div></div></div>
      <div class="card" style="overflow:auto"><h3>ユニフォームカスタマイズコントロール</h3>
        ${swatchRow('capColor', '① 帽子の色')}
        ${swatchRow('helmetColor', '② ヘルメットの色')}
        <div class="ctl-row"><div class="lb">③ デザインパターン</div><div>${seg('style', [['NORMAL', '1：無地'], ['PINSTRIPE', '2：縦じま'], ['ACCENT_LINE', '3：中央ライン']], d.uniform.style)}</div></div>
        ${d.uniform.style !== 'NORMAL' ? swatchRow('accentLineColor', '　 ライン・縦じまの色') : ''}
        ${swatchRow('shirtColor', '④ 上着の色')}
        ${swatchRow('underShirtColor', '⑤ アンダーシャツの色')}
        ${swatchRow('pantsColor', '⑥ パンツの色')}
        <div class="ctl-row"><div class="lb">⑦ ソックスのデザイン</div><div>${seg('socksType', [['PLAIN', '無地'], ['ONE_LINE', '1本ライン'], ['TWO_LINE', '2本ライン']], d.uniform.socksType)}</div></div>
        ${swatchRow('socksBaseColor', '　 ソックスの色')}
        ${d.uniform.socksType !== 'PLAIN' ? swatchRow('socksLineColor', '　 ソックスのライン色') : ''}
      </div>
    </div>
    <div class="stage-wrap">${uniformFigureSvg(u, { mark: (name || 'SEIUN').slice(0, 4), number: 1, width: 280 })}
      <div class="facts">
        <div>初期名声ランク<b>${d.mode === 'NEW' ? 'Rank D（新規参入・挑戦校）' : `Rank ${sel ? ratingRank(sel.reputation) : 'D'}`}</b></div>
        <div>部員数<b>30名固定（1年10／2年10／3年10）</b></div>
        <div>初期部費<b>${yen(d.mode === 'NEW' || !sel ? 1_500_000 : 1_500_000 + Math.round((sel.reputation * 40_000) / 10_000) * 10_000)}</b></div>
        <div>エントリー大会<b>第${year - 1918}回 ${esc(pref.replace(/[都道府県]$/, ''))}大会（${esc(info.districts[0] === '全県' ? '全県一斉' : info.districts.join('・'))}）</b></div>
      </div></div>
  </div>`;
}

export function renderSetup(): string {
  const canNext = d.mode === 'REAL' ? !!selectedSchool() : d.newName.trim().length > 0;
  return `
  <header class="light-head">
    <div class="logo">⚾ 高校野球シミュレーション5<small>KokoSim 5</small></div>
    <div class="title">${d.step === 1 ? '【ステップ1】監督就任：都道府県 ＆ 高校の選択' : '【ステップ2】監督就任：ユニフォーム詳細エディット'}</div>
    <div class="steps"><span class="${d.step === 1 ? 'on' : ''}">① 高校選択</span><span class="${d.step === 2 ? 'on' : ''}">② ユニフォーム</span><span>③ ゲーム開始</span></div>
  </header>
  <div class="light-body">${d.step === 1 ? step1() : step2()}</div>
  <footer class="light-foot">
    <div class="note">${d.step === 1 ? '※「新規作成」を選ぶと、オリジナル校名でこの県の大会に参入できます。部員は1学年10名・計30名で固定です。' : '部員数: 30名固定（1年10名 / 2年10名 / 3年10名）'}</div>
    <div class="acts">
      ${hasSave() && d.step === 1 ? `<button class="btn" data-act="continue-game">▶ セーブデータから続ける</button>` : ''}
      ${d.step === 2 ? `<button class="btn" data-act="setup-back">◀ 戻る</button>` : ''}
      <button class="btn" data-act="setup-reset">↺ リセット・最初から</button>
      ${d.step === 1
        ? `<button class="btn primary big" data-act="setup-next" ${canNext ? '' : 'disabled'}>次へ：ユニフォーム詳細設定へ ▶</button>`
        : `<button class="btn gold big" data-act="setup-start">⚾ この高校・ユニフォームで監督就任する！ ▶</button>`}
    </div>
  </footer>`;
}

export function bindSetup(root: HTMLElement): void {
  const q = root.querySelector<HTMLInputElement>('#q');
  q?.addEventListener('input', () => {
    d.query = q.value;
    const tb = root.querySelector('#school-tbody');
    if (tb) tb.innerHTML = schoolRows();
  });
  root.querySelector<HTMLInputElement>('#newName')?.addEventListener('input', (e) => {
    d.newName = (e.target as HTMLInputElement).value;
  });
  root.querySelector<HTMLInputElement>('#motto')?.addEventListener('input', (e) => {
    d.motto = (e.target as HTMLInputElement).value;
  });
}

registerActions({
  'set-mode': (el) => {
    d.mode = el.dataset.mode as Mode;
    if (d.mode === 'NEW') d.newPref = d.pref;
    requestRender();
  },
  'set-block': (el) => {
    d.block = el.dataset.block!;
    requestRender();
  },
  'set-pref': (el) => {
    const p = el.dataset.pref!;
    if (d.mode === 'NEW') d.newPref = p;
    else {
      d.pref = p;
      d.selectedId = null;
      d.query = '';
    }
    requestRender();
  },
  'set-filter': (el) => {
    d.filter = el.dataset.filter as Filter;
    requestRender();
  },
  'set-public': (el) => {
    d.newPublic = el.dataset.v === '1';
    requestRender();
  },
  'pick-school': (el) => {
    d.selectedId = el.dataset.id!;
    const s = schoolsOf(d.pref).find((x) => x.id === d.selectedId);
    if (s) d.uniform = { ...s.uniform };
    requestRender();
  },
  'uni-set': (el) => {
    (d.uniform as unknown as Record<string, string>)[el.dataset.key!] = el.dataset.val!;
    requestRender();
  },
  'setup-next': () => {
    d.step = 2;
    if (d.mode === 'NEW' && !d.uniform) d.uniform = { ...DEFAULT_NEW_UNIFORM };
    requestRender();
  },
  'setup-back': () => {
    d.step = 1;
    requestRender();
  },
  'setup-reset': () => {
    d = freshDraft();
    requestRender();
  },
  'continue-game': () => {
    const s = loadSave();
    if (!s) return toast('セーブデータがありません');
    setGame(s);
    go('main');
  },
  'setup-start': () => {
    const uniform: UniformDesign = { ...d.uniform, numberColor: autoNumberColor(d.uniform) };
    let school: SchoolEntry;
    if (d.mode === 'REAL') {
      const s = selectedSchool();
      if (!s) return toast('学校を選んでください');
      school = { ...s, uniform };
    } else {
      school = createCustomSchool(d.newName.trim() || '青雲', d.newPref, d.newPublic, uniform, d.motto);
    }
    setGame(createNewGame(school, '監督'));
    d = freshDraft();
    go('entrance');
  },
});
