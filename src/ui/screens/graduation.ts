import type { Player } from '../../core/types';
import { game, overall } from '../../game/state';
import { go, registerActions, schoolFull } from '../core';
import { POS_LONG, esc, hash32 } from '../format';
import { renderAvatarSvg } from '../../render/avatarSvg';

interface CareerPath {
  badge: string;
  team: string;
  benefit: string;
  color: string;
}

function decideCareer(p: Player): CareerPath {
  const ov = overall(p);
  const h = hash32(p.id);
  if (ov >= 78 || p.monster) {
    const npb = ['福岡ソフトバンク', '阪神タイガース', '読売ジャイアンツ', '北海道日本ハム', '横浜DeNA', '広島東洋'];
    return {
      badge: '【プロ野球】',
      team: `${npb[h % npb.length]} (ドラフト指名)`,
      benefit: 'OB効果: 高額部費寄付 ＆ 最高級マシン寄贈',
      color: 'gold',
    };
  }
  if (ov >= 65) {
    const corp = ['トヨタ自動車', 'ENEOS', 'Honda', '日本生命', '東京ガス'];
    return {
      badge: '【社会人野球】',
      team: `${corp[h % corp.length]} (名門企業チーム)`,
      benefit: 'OB効果: 臨時コーチ参加 (指定練習の成長率2倍)',
      color: 'navy',
    };
  }
  if (ov >= 52) {
    const univ = ['明治大学', '早稲田大学', '慶應義塾大学', '法政大学', '亜細亜大学', '九州産業大学'];
    return {
      badge: '【大学野球】',
      team: `${univ[h % univ.length]} (大学野球連盟)`,
      benefit: 'OB効果: 合同練習・実戦アドバイス (度胸UP)',
      color: 'navy',
    };
  }
  if (h % 2 === 0) {
    return {
      badge: '【スポーツ用品店】',
      team: 'ミズノ・地域支社',
      benefit: 'OB効果: 練習器具・バット割引クーポン提供',
      color: 'green',
    };
  }
  return {
    badge: '【地元公務員】',
    team: '県庁・市役所',
    benefit: 'OB効果: ドリンク・プロテイン定期差し入れ',
    color: 'pink',
  };
}

export function renderGraduation(): string {
  const s = game();
  const grads = s.lastGraduates.length ? s.lastGraduates : s.roster.filter((p) => p.grade === 3);

  const cards = grads
    .map((p, idx) => {
      const c = decideCareer(p);
      return `<div class="fresh-card">
        <div class="fresh-top">
          ${renderAvatarSvg(p.faceSeed, '#1e293b', 62)}
          <div>
            <div class="fresh-nm">#${idx + 1} ${esc(p.name.family)} ${esc(p.name.given)}</div>
            <div class="fresh-sub">3年・${POS_LONG[p.position]}</div>
            <span class="badge red" style="margin-top:3px">🌺 卒業生</span>
          </div>
        </div>
        <div><span class="badge ${c.color}">${c.badge}</span> <b>${esc(c.team)}</b></div>
        <div style="font-size:11.5px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px;color:#166534;font-weight:700">${esc(c.benefit)}</div>
      </div>`;
    })
    .join('');

  return `
  <header class="light-head">
    <div class="logo">${esc(schoolFull(s.school.name))} <small>(${esc(s.school.prefecture)})</small></div>
    <span class="badge pink" style="font-size:13px;padding:4px 10px">🌸 ${s.date.year}年3月1日 卒業証書授与式</span>
  </header>
  <div class="light-body">
    <div class="ent-head">
      <div>
        <h1>卒業生 旅立ちの門出 ＆ OB進路発表</h1>
        <div style="font-size:13px;color:#475569;font-weight:700;margin-top:4px">「監督、3年間熱いご指導を本当にありがとうございました！」</div>
      </div>
    </div>
    <div class="fresh-grid">${cards}</div>
  </div>
  <footer class="light-foot">
    <div class="note">※卒業生は「名誉OB」として殿堂入りし、今後定期的にグラウンドを訪問して差し入れや指導を行います。</div>
    <div class="acts">
      <button class="btn big" data-act="grad-records">📸 卒業記念を記録室で確認する</button>
      <button class="btn gold big" data-act="grad-main">🌸 卒業生を見送り、春のシーズンへ進む ▶</button>
    </div>
  </footer>`;
}

registerActions({
  'grad-records': () => go('records'),
  'grad-main': () => go('main'),
});
