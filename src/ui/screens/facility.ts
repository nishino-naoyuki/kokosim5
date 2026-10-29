import { SCOUT_TABLE, type ScoutTier } from '../../core/newcomers';
import { game, touch } from '../../game/state';
import { registerActions, requestRender, shell, toast } from '../core';
import { esc, yen } from '../format';

export type FacilityCategory = 'ALL' | 'PHYSICAL' | 'TECH' | 'GROUND' | 'CARE' | 'OTHER';

export interface FacilityItem {
  id: string;
  name: string;
  kana: string;
  category: Exclude<FacilityCategory, 'ALL'>;
  price: number;
  monthly?: boolean;
  effect: string;
  detail: string;
  icon: string;
}

export const FACILITY_ITEMS: readonly FacilityItem[] = [
  {
    id: 'icing',
    name: 'アイシングセット（肩・肘用）',
    kana: 'あいしんぐせっと',
    category: 'CARE',
    price: 45_000,
    effect: '登板後の投手疲労回復速度 +20% / 肩肘の炎症抑制',
    detail: '投球練習後および試合登板後のアイシングケアを徹底し、投手の肩・肘の故障リスクを抑えます。',
    icon: '🧊',
  },
  {
    id: 'ladder',
    name: 'アジリティラダー（瞬発力）',
    kana: 'あじりてぃらだー',
    category: 'PHYSICAL',
    price: 30_000,
    effect: '機動練習時の反応速度・加速(隠し)の成長 +15%',
    detail: '俊敏なフットワークを養い、守備の一歩目の反応速度と盗塁スタートの加速力を高めます。',
    icon: '🪜',
  },
  {
    id: 'dome',
    name: '雨天練習用簡易ドームハウス',
    kana: 'うてんれんしゅうようかんいどーむはうす',
    category: 'GROUND',
    price: 3_200_000,
    effect: '雨天・冬季もグラウンド練習効果の 80% を維持',
    detail: '全天候型の室内練習スペースを確保し、悪天候や冬場でも高い練習効率を維持します。',
    icon: '🏟️',
  },
  {
    id: 'weight_rack',
    name: 'ウエイトトレーニングラックセット',
    kana: 'うえいととれーにんぐらっくせっと',
    category: 'PHYSICAL',
    price: 850_000,
    effect: 'フィジカル練習時の長打力・肩の強さ成長 +35%',
    detail: '本格的なフリーウエイト設備を導入し、高校球児の飛距離と強肩を支える筋力を鍛え上げます。',
    icon: '🏋️',
  },
  {
    id: 'black_soil',
    name: '甲子園黒土ブレンド（補充）',
    kana: 'こうしえんくろつちぶれんど',
    category: 'GROUND',
    price: 600_000,
    effect: '内野守備練習の成長 +20% / ゴロエラー率 -15%',
    detail: '水はけとバウンド安定性に優れた黒土を内野に敷き詰め、実戦さながらのノック環境を作ります。',
    icon: '⛰️',
  },
  {
    id: 'o2_capsule',
    name: '酸素カプセル（高気圧キャビン）',
    kana: 'さんそかぷせる',
    category: 'CARE',
    price: 1_200_000,
    effect: '全員の疲労蓄積 -25% / 実効けが危険率 30% 軽減',
    detail: '部室棟に高気圧酸素カプセルを設置し、ハードな練習後の疲労回復を劇的に早めます。',
    icon: '🫧',
  },
  {
    id: 'speed_gun',
    name: 'スピードガン（高精度モデル）',
    kana: 'すぴーどがん',
    category: 'TECH',
    price: 180_000,
    effect: '投手の最高球速・制球の伸びを可視化 / 投球練習効率 +15%',
    detail: 'ブルペンでの球速と回転感覚を即座にフィードバックし、投球フォーム改善を促します。',
    icon: '🔫',
  },
  {
    id: 'new_bat',
    name: '低反発新基準バット（10本）',
    kana: 'ていはんぱつしんきじゅんばっと',
    category: 'TECH',
    price: 350_000,
    effect: '芯で捉える打撃技術 / ミート力・選球眼成長 +25%',
    detail: '高校野球公式戦の新基準金属バットを揃え、木製に近い芯でのミート技術を徹底的に磨きます。',
    icon: '🏏',
  },
  {
    id: 'night_light',
    name: 'ナイター夜間照明設備',
    kana: 'ないたーやかんしょうめいせつび',
    category: 'GROUND',
    price: 2_500_000,
    effect: '放課後練習時間を +1h 延長（全練習の獲得経験値 +20%）',
    detail: '日が短い秋・冬でも夕暮れ後の練習時間を確保し、年間を通じた総合的な成長速度を引き上げます。',
    icon: '💡',
  },
  {
    id: 'protein',
    name: 'プロテイン定期便（ホエイ）',
    kana: 'ぷろていんていきびん',
    category: 'CARE',
    price: 80_000,
    monthly: true,
    effect: '部員全員の筋力回復促進 / 長打・走力成長 +15%',
    detail: '練習直後のゴールデンタイムにホエイプロテインを支給し、効率的な体づくりを支えます。',
    icon: '🥤',
  },
  {
    id: 'safety_net',
    name: '防球ネット増設（特大フェンス）',
    kana: 'ぼうきゅうねっとぞうせつ',
    category: 'GROUND',
    price: 450_000,
    effect: 'フリー打撃でのフルスイング許可 / 打撃練習効率 +15%',
    detail: '校舎や近隣への飛び出しを防ぎ、強打者が思い切り長打を狙える環境を整えます。',
    icon: '🕸️',
  },
  {
    id: 'rotor_machine',
    name: '3ローター変化球マシン',
    kana: 'さんろーたーへんかきゅうましん',
    category: 'TECH',
    price: 1_500_000,
    effect: '打撃練習の長打・ミート成長 +30% / 変化球対応UP',
    detail: '150km/hの剛速球から鋭いスライダー・フォークまで再現する最新鋭マシンを導入します。',
    icon: '⚙️',
  },
  {
    id: 'micro_bus',
    name: '遠征用マイクロバス（中古）',
    kana: 'えんせいようまいくろばす',
    category: 'OTHER',
    price: 1_800_000,
    effect: '他県強豪との練習試合遠征費 -50% / 移動疲労軽減',
    detail: '専用マイクロバスを所有し、週末の練習試合や合宿への移動負担と遠征費を大幅に抑えます。',
    icon: '🚌',
  },
];

const CAT_LABEL: Record<FacilityCategory, string> = {
  ALL: '一覧',
  PHYSICAL: 'フィジカルトレーニング',
  TECH: '技術トレーニング',
  GROUND: 'グラウンド整備',
  CARE: '体調ケア',
  OTHER: 'その他・スカウト',
};

const CAT_BADGE: Record<Exclude<FacilityCategory, 'ALL'>, string> = {
  CARE: 'green',
  PHYSICAL: 'pink',
  GROUND: 'navy',
  TECH: 'red',
  OTHER: 'gold',
};

let cat: FacilityCategory = 'ALL';
let mode: 'LIST' | 'CARD' = 'LIST';
let sortBy: 'KANA' | 'PRICE_ASC' | 'PRICE_DESC' | 'CAT' = 'KANA';
let filterBy: 'ALL' | 'UNOWNED' | 'OWNED' = 'ALL';

function filteredItems(): FacilityItem[] {
  const s = game();
  const owned = new Set(s.facilities);
  return FACILITY_ITEMS.filter((it) => (cat === 'ALL' ? true : it.category === cat))
    .filter((it) => (filterBy === 'UNOWNED' ? !owned.has(it.id) : filterBy === 'OWNED' ? owned.has(it.id) : true))
    .slice()
    .sort((a, b) => {
      if (sortBy === 'PRICE_ASC') return a.price - b.price;
      if (sortBy === 'PRICE_DESC') return b.price - a.price;
      if (sortBy === 'CAT') return a.category.localeCompare(b.category);
      return a.kana.localeCompare(b.kana, 'ja');
    });
}

function actionButton(it: FacilityItem): string {
  const s = game();
  const isOwned = s.facilities.includes(it.id);
  if (isOwned) {
    return it.monthly
      ? `<span class="badge navy" style="padding:5px 10px">契約中 [毎月自動]</span>`
      : `<span class="badge green" style="padding:5px 10px">購入済み ✔</span>`;
  }
  if (s.funds < it.price) {
    return `<button class="btn" disabled style="padding:5px 10px;font-size:12px">部費不足</button>`;
  }
  return `<button class="btn gold" style="padding:5px 12px;font-size:12px" data-act="fac-buy" data-id="${it.id}">購入する</button>`;
}

export function renderFacility(): string {
  const s = game();
  const items = filteredItems();

  const scoutSection = `<div class="card" style="margin-top:10px;padding:12px 14px">
    <h3>🕴️ 新入生発掘・担当スカウトマン年間契約（毎年4月8日の新入部員10名に反映）</h3>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
      ${(['NONE', 'REGIONAL', 'NATIONAL', 'ELITE'] as ScoutTier[])
        .map((tier) => {
          const info = SCOUT_TABLE[tier];
          const active = s.scout === tier;
          const desc =
            tier === 'NONE'
              ? '追加費用なし。自校の名声なりの新入生が入部。'
              : tier === 'REGIONAL'
                ? '県内シニア・ボーイズを調査。努力家の獲得率UP。'
                : tier === 'NATIONAL'
                  ? '全国から有望株を一本釣り。基準戦力+10相当で生成。'
                  : '天才肌または特殊能力を持つ特級新入生を確実に1名獲得。';
          return `<div class="card" style="border:${active ? '2px solid var(--gold)' : '1px solid var(--border)'};background:${active ? '#fffbeb' : '#fff'};padding:10px">
            <div style="font-weight:900;color:var(--navy)">${esc(info.label)}</div>
            <div style="font-size:13px;font-weight:800;color:#b45309;margin:4px 0">${yen(info.annualCost)} / 年</div>
            <div style="font-size:11.5px;color:#475569;min-height:36px">${desc}</div>
            <button class="btn ${active ? 'primary' : 'gold'}" style="width:100%;margin-top:6px;padding:6px" data-act="fac-scout" data-tier="${tier}" ${active ? 'disabled' : ''}>
              ${active ? '契約中 ✔' : 'このスカウトと契約'}
            </button>
          </div>`;
        })
        .join('')}
    </div>
  </div>`;

  const body = `<div style="padding:10px 16px;height:100%;display:flex;flex-direction:column;gap:10px;overflow:auto">
    <div class="card" style="padding:10px 14px;display:flex;flex-direction:column;gap:8px">
      <div class="chips" style="display:flex;gap:6px;flex-wrap:wrap">
        ${(['ALL', 'PHYSICAL', 'TECH', 'GROUND', 'CARE', 'OTHER'] as FacilityCategory[])
          .map((c) => `<button class="${cat === c ? 'on' : ''}" data-act="fac-cat" data-v="${c}">${CAT_LABEL[c]}</button>`)
          .join('')}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div class="seg" style="width:260px">
          <button class="${mode === 'LIST' ? 'on' : ''}" data-act="fac-mode" data-v="LIST">≡ 一覧表示（デフォルト）</button>
          <button class="${mode === 'CARD' ? 'on' : ''}" data-act="fac-mode" data-v="CARD">⊞ 詳細表示</button>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span style="font-size:12px;font-weight:800;color:var(--muted)">並び順:</span>
          <span class="chips">
            <button class="${sortBy === 'KANA' ? 'on' : ''}" data-act="fac-sort" data-v="KANA">あいうえお順</button>
            <button class="${sortBy === 'PRICE_ASC' ? 'on' : ''}" data-act="fac-sort" data-v="PRICE_ASC">価格が安い順</button>
            <button class="${sortBy === 'PRICE_DESC' ? 'on' : ''}" data-act="fac-sort" data-v="PRICE_DESC">価格が高い順</button>
            <button class="${sortBy === 'CAT' ? 'on' : ''}" data-act="fac-sort" data-v="CAT">ジャンル順</button>
          </span>
          <span style="font-size:12px;font-weight:800;color:var(--muted);margin-left:6px">絞り込み:</span>
          <span class="chips">
            <button class="${filterBy === 'ALL' ? 'on' : ''}" data-act="fac-filter" data-v="ALL">すべて</button>
            <button class="${filterBy === 'UNOWNED' ? 'on' : ''}" data-act="fac-filter" data-v="UNOWNED">未購入のみ</button>
            <button class="${filterBy === 'OWNED' ? 'on' : ''}" data-act="fac-filter" data-v="OWNED">購入済みのみ</button>
          </span>
        </div>
      </div>
    </div>

    ${
      mode === 'LIST'
        ? `<div class="tbl-wrap" style="background:#fff;flex:1;min-height:240px">
            <table class="tbl">
              <thead>
                <tr><th>品名 (あいうえお順)</th><th>ジャンル</th><th>値段</th><th>主な効果（全13パラメータ・疲労対応）</th><th style="text-align:right">購入状況 / アクション</th></tr>
              </thead>
              <tbody>
                ${items
                  .map(
                    (it) => `<tr>
                    <td><span style="font-size:16px;margin-right:6px">${it.icon}</span><b>${esc(it.name)}</b></td>
                    <td><span class="badge ${CAT_BADGE[it.category]}">${CAT_LABEL[it.category]}</span></td>
                    <td><b>${yen(it.price)}${it.monthly ? ' /月' : ''}</b></td>
                    <td style="color:#166534;font-weight:700">${esc(it.effect)}</td>
                    <td style="text-align:right">${actionButton(it)}</td>
                  </tr>`,
                  )
                  .join('')}
              </tbody>
            </table>
          </div>`
        : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:10px">
            ${items
              .map(
                (it) => `<div class="card" style="display:flex;flex-direction:column;gap:6px">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <span style="font-size:24px">${it.icon}</span>
                  <span class="badge ${CAT_BADGE[it.category]}">${CAT_LABEL[it.category]}</span>
                </div>
                <div style="font-size:15px;font-weight:900;color:var(--navy)">${esc(it.name)}</div>
                <div style="font-size:12px;color:#166534;font-weight:800">${esc(it.effect)}</div>
                <div style="font-size:11.5px;color:#475569;flex:1">${esc(it.detail)}</div>
                <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #eef2f7;padding-top:8px;margin-top:4px">
                  <b style="font-size:14px;color:#b45309">${yen(it.price)}${it.monthly ? '/月' : ''}</b>
                  ${actionButton(it)}
                </div>
              </div>`,
              )
              .join('')}
          </div>`
    }

    ${scoutSection}
  </div>`;

  return shell('facility', '部費・設備管理（備品購入・施設強化・スカウト契約）', body);
}

registerActions({
  'fac-cat': (el) => {
    cat = el.dataset.v as FacilityCategory;
    requestRender();
  },
  'fac-mode': (el) => {
    mode = el.dataset.v as 'LIST' | 'CARD';
    requestRender();
  },
  'fac-sort': (el) => {
    sortBy = el.dataset.v as 'KANA' | 'PRICE_ASC' | 'PRICE_DESC' | 'CAT';
    requestRender();
  },
  'fac-filter': (el) => {
    filterBy = el.dataset.v as 'ALL' | 'UNOWNED' | 'OWNED';
    requestRender();
  },
  'fac-buy': (el) => {
    const s = game();
    const it = FACILITY_ITEMS.find((x) => x.id === el.dataset.id);
    if (!it) return;
    if (s.facilities.includes(it.id)) return;
    if (s.funds < it.price) return toast('部費が足りません');
    s.funds -= it.price;
    s.facilities.push(it.id);
    s.log.unshift(`📦 設備「${it.name}」を導入しました（-${yen(it.price)}）`);
    touch();
    toast(`「${it.name}」を購入しました！`);
    requestRender();
  },
  'fac-scout': (el) => {
    const s = game();
    const tier = el.dataset.tier as ScoutTier;
    const cost = SCOUT_TABLE[tier].annualCost;
    if (cost > 0 && s.funds < cost) return toast('スカウト契約に必要な部費が足りません');
    if (cost > 0) s.funds -= cost;
    s.scout = tier;
    s.log.unshift(`🕴️ 「${SCOUT_TABLE[tier].label}」と年間契約を締結しました`);
    touch();
    toast(`${SCOUT_TABLE[tier].label}と契約しました！来春4月8日の新入生に反映されます`);
    requestRender();
  },
});
