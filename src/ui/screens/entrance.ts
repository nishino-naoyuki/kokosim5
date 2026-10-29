import { pitchVelocity } from '../../core/abilities';
import { SCOUT_TABLE } from '../../core/newcomers';
import { game, overall, touch } from '../../game/state';
import { go, registerActions, schoolFull } from '../core';
import { HAND, POS_LONG, esc, growthLabel, juniorTeam, personalityLabel, rank, stars } from '../format';
import { renderAvatarSvg } from '../../render/avatarSvg';
import type { Player } from '../../core/types';

function scoutComment(fresh: Player[]): string {
  const monster = fresh.find((p) => p.monster);
  if (monster) {
    return `「監督、とんでもない子が来ました…！${esc(monster.name.family)}${esc(monster.name.given)}は10年に1人の逸材、いや、それ以上かもしれません」`;
  }
  const pitchers = fresh.filter((p) => p.position === 'P').sort((a, b) => pitchVelocity(b.abilities.arm, b.abilities.form, b.traits) - pitchVelocity(a.abilities.arm, a.abilities.form, a.traits));
  const hitters = fresh.filter((p) => p.position !== 'P').sort((a, b) => b.abilities.power + b.abilities.contact - (a.abilities.power + a.abilities.contact));
  const p = pitchers[0];
  const h = hitters[0];
  const best = fresh.slice().sort((a, b) => overall(b) - overall(a))[0];
  const kmh = p ? pitchVelocity(p.abilities.arm, p.abilities.form, p.traits) : 0;
  return `「今年の注目は、最速${kmh}km/hの${p ? esc(p.name.family) : ''}と、長打の光る${h ? esc(h.name.family) : ''}。総合では${esc(best.name.family)}${esc(best.name.given)}が頭ひとつ抜けています」`;
}

function card(p: Player, jersey: number, pref: string): string {
  const st = stars(p);
  const kmh = pitchVelocity(p.abilities.arm, p.abilities.form, p.traits);
  const a = p.abilities;
  return `<div class="fresh-card ${p.monster ? 'monster' : ''}">
    <div class="fresh-top">${renderAvatarSvg(p.faceSeed, game().school.uniform.capColor, 62)}
      <div style="min-width:0"><div class="fresh-nm">#${jersey} ${esc(p.name.family)} ${esc(p.name.given)}</div>
        <div class="fresh-sub">${POS_LONG[p.position]} [${HAND(p)}]</div>
        <div class="fresh-sub">${esc(juniorTeam(p, pref))}</div></div></div>
    <div style="display:flex;gap:4px;flex-wrap:wrap"><span class="badge navy">${esc(personalityLabel(p))}</span><span class="badge pink">${esc(growthLabel(p))}</span>
      ${p.traits.map((t) => `<span class="badge gold">★${esc(t)}</span>`).join('')}</div>
    <div class="fresh-stats">${
      p.position === 'P'
        ? `<span>球速 <b>${kmh}km/h</b></span><span>制球 ${rank(a.control)}</span><span>変化球 ${rank(a.breaking)}</span><span>体力 ${rank(a.stamina)}</span>`
        : `<span>長打 ${rank(a.power)}</span><span>ミート ${rank(a.contact)}</span><span>走力 ${rank(a.speed)}</span><span>捕球 ${rank(a.fielding)}</span>`
    }</div>
    <div><span class="stars">${st.text}</span> ${st.special ? '<span class="badge gold">特級ルーキー</span>' : ''}</div>
  </div>`;
}

export function renderEntrance(): string {
  const s = game();
  const fresh = s.roster.filter((p) => p.grade === 1);
  const scout = SCOUT_TABLE[s.scout];
  return `
  <header class="light-head">
    <div class="logo">${esc(schoolFull(s.school.name))} <small>(${esc(s.school.prefecture)})</small></div>
    <span class="badge pink" style="font-size:13px;padding:4px 10px">🌸 ${s.date.year}年度 新入部員入部式 (${s.date.month}月${s.date.day}日)</span>
  </header>
  <div class="light-body">
    <div class="ent-head"><h1>${s.date.year}年度 新入部員入部式 ＆ スカウト成果報告</h1>
      <div class="card scout-card"><div class="face">🕴️</div><div><b>担当スカウト: ${esc(scout.label)}</b><div class="cmt">${scoutComment(fresh)}</div></div></div></div>
    <div class="fresh-grid">${fresh.map((p) => card(p, s.jersey[p.id], s.school.prefecture)).join('')}</div>
  </div>
  <footer class="light-foot">
    <div class="note">新入部員: ${fresh.length}名合流 (全部員数: ${s.roster.length}名)</div>
    <div class="acts">
      <button class="btn primary big" data-act="entrance-roster">📋 選手名鑑・ロスターへ登録する ▶</button>
      <button class="btn big" data-act="entrance-training">⚾ オーダー・練習編成へ進む</button>
    </div>
  </footer>`;
}

registerActions({
  'entrance-roster': () => {
    game().entranceShown = true;
    touch();
    go('players');
  },
  'entrance-training': () => {
    game().entranceShown = true;
    touch();
    go('training');
  },
});
