import { allSchools, ratingRank, schoolsOf } from '../../core/schools';
import { game } from '../../game/state';
import { registerActions, requestRender, schoolFull, shell } from '../core';
import { esc } from '../format';

type RecTab = 'TOURNAMENT' | 'HISTORY' | 'INDIVIDUAL' | 'TEAM' | 'CHAMPIONS' | 'RANKING';
let tab: RecTab = 'TOURNAMENT';
let selectedMatchNo = 142;
let rankScope: 'NATIONAL' | 'PREF' = 'NATIONAL';

// 過去大会トーナメント用状態
let selectedTourId = 'FUKUOKA_SUMMER_2026';
let selectedTourMatchId = 'FINAL';
let showScorebookModal = false;

interface TourMatchDetail {
  id: string;
  roundName: string;
  date: string;
  stadium: string;
  weather: string;
  attendance: string;
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
  lineA: (number | string)[];
  lineB: (number | string)[];
  hitsA: number;
  hitsB: number;
  errA: number;
  errB: number;
  pitcherWin: string;
  pitcherLose: string;
  hr?: string;
  keyStats: { player: string; pos: string; grade: number; stats: string }[];
  comment: string;
  scorebookRows?: { num: number; name: string; pos: string; ab: string[] }[];
}

interface TournamentData {
  id: string;
  name: string;
  year: number;
  region: string;
  schoolsCount: number;
  champion: string;
  championSub: string;
  runnerUp: string;
  bracketType: 'FUKUOKA_12' | 'KOSHIEN_8';
  matches: Record<string, TourMatchDetail>;
}

const TOURNAMENTS: Record<string, TournamentData> = {
  FUKUOKA_SUMMER_2026: {
    id: 'FUKUOKA_SUMMER_2026',
    name: '第108回 全国高校野球選手権 福岡大会（2026年 夏）',
    year: 2026,
    region: '福岡県（全135校 / 決勝トーナメント12校）',
    schoolsCount: 135,
    champion: '青雲高校（福岡）',
    championSub: '★ 3年ぶり4回目 甲子園出場決定！',
    runnerUp: '福岡大大濠',
    bracketType: 'FUKUOKA_12',
    matches: {
      FINAL: {
        id: 'FINAL',
        roundName: '決勝戦',
        date: '2026/07/28',
        stadium: '北九州市民球場',
        weather: '晴れ・32℃',
        attendance: '21,000人（満員御礼）',
        teamA: '福岡大大濠',
        teamB: '青雲',
        scoreA: 2,
        scoreB: 3,
        lineA: [0, 0, 1, 0, 0, 1, 0, 0, 0],
        lineB: [0, 0, 0, 0, 1, 0, 1, 0, '1x'],
        hitsA: 6,
        hitsB: 9,
        errA: 1,
        errB: 0,
        pitcherWin: '神崎 晴樹（3年） 9回 132球 被安打6 奪三振11 四死球2 自責点2',
        pitcherLose: '馬原 孝浩（3年） 8回2/3 128球 被安打9 奪三振7 四死球3 自責点3',
        hr: '逢坂 慶次 1号ソロ（7回裏・青雲）',
        keyStats: [
          { player: '神崎 晴樹', pos: '投', grade: 3, stats: '9回2失点11Kの熱投完投 ＆ 9回裏同点打の起点' },
          { player: '逢坂 慶次', pos: '三', grade: 3, stats: '4打数2安打1本塁打1打点（7回裏に同点ソロ弾）' },
          { player: '坂本 健吾', pos: '捕', grade: 2, stats: '9回裏2死満塁から右中間へ劇的サヨナラ適時打！' },
        ],
        comment:
          '1点を追う9回裏2死満塁、坂本が放った打球は右中間を真っ二つに破る劇的サヨナラ打！3年ぶり4回目の全国選手権出場を掴み取った。神崎のエースとしての力投と、最後まで諦めなかった選手たちを誇りに思う。',
        scorebookRows: [
          { num: 1, name: '五十嵐 翔', pos: '遊', ab: ['四球', '三振', '左安', '三ゴ', '中安'] },
          { num: 2, name: '早坂 隼人', pos: '二', ab: ['投犠', '右飛', '遊直', '一ゴ', '敬遠'] },
          { num: 3, name: '成瀬 翔', pos: '中', ab: ['三振', '左飛', '四球', '左安', '投ゴ'] },
          { num: 4, name: '神崎 晴樹', pos: '投', ab: ['中安', '三邪', '三振', '二直', '中安'] },
          { num: 5, name: '逢坂 慶次', pos: '三', ab: ['二ゴ', '四球', '左本', '三振', '四球'] },
          { num: 6, name: '坂本 健吾', pos: '捕', ab: ['三振', '中安', '遊ゴ', '三振', '右2x'] },
          { num: 7, name: '神保 陸', pos: '右', ab: ['右飛', '三振', '右安', '遊ゴ', '—'] },
          { num: 8, name: '橘 慎之介', pos: '一', ab: ['投ゴ', '左直', '三ゴ', '捕邪', '—'] },
          { num: 9, name: '宮本 健太郎', pos: '左', ab: ['三振', '一ゴ', '中安', '三振', '—'] },
        ],
      },
      SF1: {
        id: 'SF1',
        roundName: '準決勝 第1試合',
        date: '2026/07/26',
        stadium: '平和台球場',
        weather: '晴れ・31℃',
        attendance: '16,500人',
        teamA: '九州国際大付',
        teamB: '青雲',
        scoreA: 3,
        scoreB: 5,
        lineA: [1, 0, 0, 2, 0, 0, 0, 0, 0],
        lineB: [0, 1, 0, 0, 3, 0, 1, 0, 'X'],
        hitsA: 7,
        hitsB: 11,
        errA: 0,
        errB: 1,
        pitcherWin: '神崎 晴樹（3年） 9回 124球 被安打7 奪三振9 自責点3',
        pitcherLose: '楠本 豪（3年） 6回 102球 被安打8 奪三振6 自責点4',
        hr: '神保 陸 1号2ラン（5回裏・青雲）',
        keyStats: [
          { player: '神保 陸', pos: '右', grade: 1, stats: '4打数3安打2打点 逆転2ラン本塁打' },
          { player: '五十嵐 翔', pos: '遊', grade: 2, stats: '4打数2安打2得点 2盗塁' },
        ],
        comment:
          '宿敵・九国大付との一騎打ち。1年生神保の起死回生2ランで5回裏に逆転。終盤は神崎が気迫の投球で反撃を断った。',
      },
      SF2: {
        id: 'SF2',
        roundName: '準決勝 第2試合',
        date: '2026/07/26',
        stadium: '平和台球場',
        weather: '晴れ・33℃',
        attendance: '15,000人',
        teamA: '西日本短大付',
        teamB: '福岡大大濠',
        scoreA: 2,
        scoreB: 4,
        lineA: [0, 0, 1, 0, 1, 0, 0, 0, 0],
        lineB: [2, 0, 0, 0, 0, 2, 0, 0, 'X'],
        hitsA: 6,
        hitsB: 8,
        errA: 1,
        errB: 0,
        pitcherWin: '馬原 孝浩（3年） 9回 115球 被安打6 奪三振8 自責点2',
        pitcherLose: '西短エース 8回 120球 被安打8 奪三振7 自責点4',
        keyStats: [{ player: '馬原 孝浩', pos: '投', grade: 3, stats: '9回2失点完投 投打でチームを牽引' }],
        comment:
          '福大大濠が初回に2点を先制、同点とされた6回に下位打線の連打で突き放し、西短大付の反撃を振り切った。',
      },
      QF1: {
        id: 'QF1',
        roundName: '準々決勝 第1試合',
        date: '2026/07/23',
        stadium: '小郡市野球場',
        weather: '曇り・29℃',
        attendance: '7,800人',
        teamA: '福岡第一',
        teamB: '青雲',
        scoreA: 2,
        scoreB: 7,
        lineA: [0, 0, 1, 0, 0, 0, 1, 0, 0],
        lineB: [2, 0, 0, 3, 0, 1, 0, 1, 'X'],
        hitsA: 5,
        hitsB: 13,
        errA: 2,
        errB: 0,
        pitcherWin: '浅川 颯太（2年） 7回 95球 被安打4 奪三振6 自責点2',
        pitcherLose: '福岡第一先発 5回 88球 被安打8 自責点5',
        keyStats: [{ player: '成瀬 翔', pos: '中', grade: 2, stats: '5打数4安打3打点 2本の二塁打' }],
        comment:
          '序盤から打線が好調で13安打7得点。先発の2年生浅川が7回2失点と好投し快勝でベスト4進出を果たした。',
      },
      QF2: {
        id: 'QF2',
        roundName: '準々決勝 第2試合',
        date: '2026/07/23',
        stadium: '小郡市野球場',
        weather: '曇り・29℃',
        attendance: '6,200人',
        teamA: '東福岡',
        teamB: '九州国際大付',
        scoreA: 4,
        scoreB: 6,
        lineA: [1, 0, 2, 0, 0, 1, 0, 0, 0],
        lineB: [0, 0, 1, 2, 0, 0, 3, 0, 'X'],
        hitsA: 8,
        hitsB: 10,
        errA: 1,
        errB: 1,
        pitcherWin: '九国大付リリーフ 4回 無失点',
        pitcherLose: '東福岡先発 6回1/3 5失点',
        keyStats: [{ player: '九国4番', pos: '一', grade: 3, stats: '7回裏逆転2点タイムリー' }],
        comment: '九国大付が7回裏に長打攻勢で3点を奪い逆転。東福岡の粘りを振り切った。',
      },
      QF3: {
        id: 'QF3',
        roundName: '準々決勝 第3試合',
        date: '2026/07/23',
        stadium: '北九州市民球場',
        weather: '晴れ・31℃',
        attendance: '5,500人',
        teamA: '自由ケ丘',
        teamB: '西日本短大付',
        scoreA: 1,
        scoreB: 4,
        lineA: [0, 0, 0, 1, 0, 0, 0, 0, 0],
        lineB: [1, 0, 2, 0, 1, 0, 0, 0, 'X'],
        hitsA: 4,
        hitsB: 9,
        errA: 0,
        errB: 0,
        pitcherWin: '西短エース 9回 4安打1失点完投',
        pitcherLose: '自由ケ丘先発 6回 4失点',
        keyStats: [{ player: '西短3番', pos: '遊', grade: 3, stats: '3打数2安打2打点' }],
        comment: '西短のエースが安定した制球で自由ケ丘打線を4安打に抑え込み完投勝利。',
      },
      QF4: {
        id: 'QF4',
        roundName: '準々決勝 第4試合',
        date: '2026/07/23',
        stadium: '北九州市民球場',
        weather: '晴れ・32℃',
        attendance: '6,100人',
        teamA: '真颯館',
        teamB: '福岡大大濠',
        scoreA: 3,
        scoreB: 5,
        lineA: [0, 0, 0, 2, 0, 1, 0, 0, 0],
        lineB: [0, 2, 0, 0, 3, 0, 0, 0, 'X'],
        hitsA: 7,
        hitsB: 8,
        errA: 1,
        errB: 0,
        pitcherWin: '大濠先発 6回 3失点',
        pitcherLose: '真颯館先発 5回 5失点',
        keyStats: [{ player: '大濠5番', pos: '捕', grade: 2, stats: '5回裏勝ち越しタイムリー二塁打' }],
        comment: '福大大濠が中盤5回に集中打で勝ち越し。真颯館の終盤の追い上げをリリーフが断った。',
      },
      R1_1: {
        id: 'R1_1',
        roundName: '1回戦',
        date: '2026/07/20',
        stadium: '春日公園野球場',
        weather: '晴れ・30℃',
        attendance: '3,200人',
        teamA: '飯塚',
        teamB: '福岡第一',
        scoreA: 1,
        scoreB: 5,
        lineA: [0, 0, 0, 0, 1, 0, 0, 0, 0],
        lineB: [1, 0, 2, 0, 0, 2, 0, 0, 'X'],
        hitsA: 5,
        hitsB: 9,
        errA: 1,
        errB: 0,
        pitcherWin: '福岡第一先発 9回 1失点完投',
        pitcherLose: '飯塚先発 5回 3失点',
        keyStats: [{ player: '福岡第一1番', pos: '中', grade: 3, stats: '4打数3安打3得点' }],
        comment: '福岡第一が機動力を絡めた攻撃で着実に加点し、飯塚を破り2回戦で青雲への挑戦権を獲得。',
      },
      R1_2: {
        id: 'R1_2',
        roundName: '1回戦',
        date: '2026/07/20',
        stadium: '春日公園野球場',
        weather: '晴れ・31℃',
        attendance: '3,500人',
        teamA: '筑陽学園',
        teamB: '東福岡',
        scoreA: 3,
        scoreB: 4,
        lineA: [0, 1, 0, 0, 2, 0, 0, 0, 0],
        lineB: [2, 0, 0, 0, 0, 1, 0, 1, 'X'],
        hitsA: 7,
        hitsB: 8,
        errA: 0,
        errB: 1,
        pitcherWin: '東福岡リリーフ 3回 無失点',
        pitcherLose: '筑陽学園先発 8回 4失点',
        keyStats: [{ player: '東福岡4番', pos: '三', grade: 3, stats: '8回裏決勝タイムリー安打' }],
        comment: '強豪私立対決。東福岡が8回裏に一打勝ち越し、9回を抑えて2回戦進出。',
      },
      R1_3: {
        id: 'R1_3',
        roundName: '1回戦',
        date: '2026/07/20',
        stadium: '久留米市野球場',
        weather: '晴れ・32℃',
        attendance: '2,900人',
        teamA: '祐誠',
        teamB: '自由ケ丘',
        scoreA: 1,
        scoreB: 8,
        lineA: [0, 0, 1, 0, 0, 0, 0],
        lineB: [3, 0, 1, 2, 0, 2, 'X'],
        hitsA: 4,
        hitsB: 11,
        errA: 2,
        errB: 0,
        pitcherWin: '自由ケ丘エース 7回 1失点（7回コールド）',
        pitcherLose: '祐誠先発 4回 6失点',
        keyStats: [{ player: '自由ケ丘打線', pos: 'チ', grade: 3, stats: '11安打8得点 猛打爆発' }],
        comment: '自由ケ丘が序盤から打線爆発、7回コールド勝ちで2回戦へ駒を進めた。',
      },
      R1_4: {
        id: 'R1_4',
        roundName: '1回戦',
        date: '2026/07/20',
        stadium: '久留米市野球場',
        weather: '晴れ・33℃',
        attendance: '3,100人',
        teamA: '小倉',
        teamB: '真颯館',
        scoreA: 2,
        scoreB: 3,
        lineA: [1, 0, 0, 0, 0, 1, 0, 0, 0],
        lineB: [0, 0, 0, 1, 0, 0, 1, 0, '1x'],
        hitsA: 6,
        hitsB: 7,
        errA: 1,
        errB: 0,
        pitcherWin: '真颯館エース 9回 2失点完投',
        pitcherLose: '小倉エース 8回2/3 3失点',
        keyStats: [{ player: '真颯館6番', pos: '一', grade: 2, stats: '9回裏サヨナラ犠牲フライ' }],
        comment: '伝統公立・小倉と新興勢力・真颯館の好投手戦。9回裏1死三塁から犠飛でサヨナラ決着。',
      },
    },
  },

  KOSHIEN_SUMMER_2025: {
    id: 'KOSHIEN_SUMMER_2025',
    name: '第107回 全国高校野球選手権大会（2025年 夏の甲子園）',
    year: 2025,
    region: '全国47都道府県（甲子園49代表 / 準々決勝以降8校）',
    schoolsCount: 49,
    champion: '青雲高校（福岡県代表）',
    championSub: '★ 初出場 初優勝・全国制覇！深紅の大優勝旗を獲得！',
    runnerUp: '仙台育英（宮城県代表）',
    bracketType: 'KOSHIEN_8',
    matches: {
      FINAL: {
        id: 'FINAL',
        roundName: '決勝戦',
        date: '2025/08/23',
        stadium: '阪神甲子園球場',
        weather: '晴れ・34℃',
        attendance: '45,000人（満員札止め）',
        teamA: '仙台育英',
        teamB: '青雲',
        scoreA: 3,
        scoreB: 5,
        lineA: [0, 1, 0, 0, 0, 2, 0, 0, 0],
        lineB: [2, 0, 0, 1, 0, 2, 0, 0, 'X'],
        hitsA: 8,
        hitsB: 11,
        errA: 1,
        errB: 0,
        pitcherWin: '神崎 晴樹（2年） 9回 138球 被安打8 奪三振12 自責点3',
        pitcherLose: '仙台育英エース 6回 5失点',
        hr: '逢坂 慶次 大会第6号2ラン（6回裏・青雲）',
        keyStats: [
          { player: '逢坂 慶次', pos: '三', grade: 2, stats: '4打数3安打1本塁打3打点（大会新記録タイ6HR）' },
          { player: '神崎 晴樹', pos: '投', grade: 2, stats: '9回3失点12奪三振完投勝利で胴上げ投手' },
        ],
        comment:
          '満員の甲子園。同点に追いつかれた直後の6回裏、4番逢坂がバックスクリーンへ叩き込む勝ち越し2ラン！2年生エース神崎が最終回を3者連続三振で締めくくり、青雲高校が悲願の全国制覇を達成！',
      },
      SF1: {
        id: 'SF1',
        roundName: '準決勝 第1試合',
        date: '2025/08/21',
        stadium: '阪神甲子園球場',
        weather: '晴れ・33℃',
        attendance: '42,000人',
        teamA: '大阪桐蔭',
        teamB: '仙台育英',
        scoreA: 3,
        scoreB: 5,
        lineA: [1, 0, 0, 0, 2, 0, 0, 0, 0],
        lineB: [0, 2, 0, 0, 0, 3, 0, 0, 'X'],
        hitsA: 7,
        hitsB: 9,
        errA: 1,
        errB: 0,
        pitcherWin: '仙台育英先発 9回 3失点完投',
        pitcherLose: '大阪桐蔭先発 6回 5失点',
        keyStats: [{ player: '仙台育英3番', pos: '左', grade: 3, stats: '6回裏逆転2点適時打' }],
        comment: '名門対決。仙台育英が6回裏の集中打で大阪桐蔭を逆転、2年連続の決勝進出を決めた。',
      },
      SF2: {
        id: 'SF2',
        roundName: '準決勝 第2試合',
        date: '2025/08/21',
        stadium: '阪神甲子園球場',
        weather: '晴れ・35℃',
        attendance: '43,000人',
        teamA: '広陵',
        teamB: '青雲',
        scoreA: 2,
        scoreB: 4,
        lineA: [0, 0, 0, 1, 0, 1, 0, 0, 0],
        lineB: [1, 0, 1, 0, 2, 0, 0, 0, 'X'],
        hitsA: 6,
        hitsB: 8,
        errA: 0,
        errB: 0,
        pitcherWin: '神崎 晴樹（2年） 9回 118球 被安打6 奪三振10 自責点2',
        pitcherLose: '広陵先発 8回 4失点',
        keyStats: [{ player: '神崎 晴樹', pos: '投', grade: 2, stats: '最速154km/h計測 9回2失点完投' }],
        comment: '広陵の巧打線を神崎が最速154km/hの剛速球でねじ伏せ、九州勢として堂々の決勝進出。',
      },
      QF1: {
        id: 'QF1',
        roundName: '準々決勝 第1試合',
        date: '2025/08/19',
        stadium: '阪神甲子園球場',
        weather: '晴れ・32℃',
        attendance: '38,000人',
        teamA: '横浜',
        teamB: '大阪桐蔭',
        scoreA: 4,
        scoreB: 6,
        lineA: [0, 2, 0, 0, 1, 0, 1, 0, 0],
        lineB: [1, 0, 3, 0, 0, 2, 0, 0, 'X'],
        hitsA: 8,
        hitsB: 10,
        errA: 1,
        errB: 0,
        pitcherWin: '大阪桐蔭リリーフ 4回 1失点',
        pitcherLose: '横浜先発 6回 6失点',
        keyStats: [{ player: '桐蔭4番', pos: '三', grade: 3, stats: '3回逆転3ラン本塁打' }],
        comment: '東西の横綱対決。大阪桐蔭が中盤の本塁打で主導権を握り逃げ切り。',
      },
      QF2: {
        id: 'QF2',
        roundName: '準々決勝 第2試合',
        date: '2025/08/19',
        stadium: '阪神甲子園球場',
        weather: '晴れ・33℃',
        attendance: '39,000人',
        teamA: '智弁和歌山',
        teamB: '仙台育英',
        scoreA: 3,
        scoreB: 5,
        lineA: [1, 0, 0, 2, 0, 0, 0, 0, 0],
        lineB: [0, 1, 0, 0, 3, 1, 0, 0, 'X'],
        hitsA: 7,
        hitsB: 9,
        errA: 0,
        errB: 1,
        pitcherWin: '仙台育英先発 9回 3失点',
        pitcherLose: '智弁先発 6回 5失点',
        keyStats: [{ player: '仙台育英5番', pos: '一', grade: 3, stats: '5回同点適時打' }],
        comment: '激戦の末、仙台育英の投手陣の継投が冴え智弁和歌山に競り勝った。',
      },
      QF3: {
        id: 'QF3',
        roundName: '準々決勝 第3試合',
        date: '2025/08/19',
        stadium: '阪神甲子園球場',
        weather: '晴れ・34℃',
        attendance: '36,000人',
        teamA: '星稜',
        teamB: '広陵',
        scoreA: 1,
        scoreB: 4,
        lineA: [0, 0, 0, 1, 0, 0, 0, 0, 0],
        lineB: [0, 2, 0, 0, 1, 0, 1, 0, 'X'],
        hitsA: 5,
        hitsB: 8,
        errA: 0,
        errB: 0,
        pitcherWin: '広陵先発 9回 1失点完投',
        pitcherLose: '星稜先発 7回 4失点',
        keyStats: [{ player: '広陵先発', pos: '投', grade: 3, stats: '5安打1失点完投' }],
        comment: '広陵が堅実な守備と小技を絡めた攻撃で星稜を圧倒し4強へ。',
      },
      QF4: {
        id: 'QF4',
        roundName: '準々決勝 第4試合',
        date: '2025/08/19',
        stadium: '阪神甲子園球場',
        weather: '晴れ・34℃',
        attendance: '37,000人',
        teamA: '健大高崎',
        teamB: '青雲',
        scoreA: 2,
        scoreB: 6,
        lineA: [0, 0, 0, 2, 0, 0, 0, 0, 0],
        lineB: [1, 0, 3, 0, 0, 1, 1, 0, 'X'],
        hitsA: 6,
        hitsB: 11,
        errA: 1,
        errB: 0,
        pitcherWin: '神崎 晴樹（2年） 9回 125球 被安打6 奪三振11 自責点2',
        pitcherLose: '健大高崎先発 5回 4失点',
        hr: '逢坂 慶次 大会第5号3ラン（3回裏・青雲）',
        keyStats: [{ player: '逢坂 慶次', pos: '三', grade: 2, stats: '3回裏に右中間へ豪快な先制3ランHR' }],
        comment: '機動力の健大高崎に対し、青雲は逢坂の3ランと神崎の快速球で圧倒。初のベスト4進出！',
      },
    },
  },
};

const SAMPLE_MATCHES = [
  {
    no: 142,
    tournament: '春季地区予選 2回戦',
    kind: 'OFFICIAL',
    win: true,
    myScore: 5,
    oppScore: 3,
    opponent: '東福岡',
    date: '2026/04/19',
    stadium: '北九州市民球場',
    lineA: [0, 1, 0, 2, 0, 0, 1, 1, 0],
    lineB: [1, 0, 0, 0, 2, 0, 0, 0, 0],
    hitsA: 10,
    hitsB: 7,
    errA: 0,
    errB: 1,
    comment: '7回表に4番のタイムリー二塁打で勝ち越し。エースが9回7安打3失点完投で接戦を制した。',
  },
  {
    no: 141,
    tournament: '春季地区予選 1回戦',
    kind: 'OFFICIAL',
    win: true,
    myScore: 7,
    oppScore: 2,
    opponent: '修猷館',
    date: '2026/04/15',
    stadium: '春日公園野球場',
    lineA: [2, 0, 1, 0, 3, 0, 0, 1, 0],
    lineB: [0, 0, 1, 0, 0, 1, 0, 0, 0],
    hitsA: 12,
    hitsB: 6,
    errA: 1,
    errB: 2,
    comment: '初回から打線が繋がり12安打7得点。投打が噛み合い初戦を快勝。',
  },
  {
    no: 140,
    tournament: '春季練習試合',
    kind: 'PRACTICE',
    win: false,
    myScore: 3,
    oppScore: 4,
    opponent: '九州国際大付',
    date: '2026/04/11',
    stadium: '自校グラウンド',
    lineA: [0, 0, 1, 0, 0, 2, 0, 0, 0],
    lineB: [0, 2, 0, 0, 0, 1, 0, 0, 1],
    hitsA: 8,
    hitsB: 9,
    errA: 1,
    errB: 0,
    comment: '強豪・九国大付と互角の投手戦を演じるも、9回裏にサヨナラ打を許し惜敗。大きな収穫のある一戦。',
  },
];

/**
 * 昔ながらの日刊スポーツ風 新聞トーナメント勝敗表 (SVGレンダラー)
 * シード校（青雲、九国、西短、大濠）は1回戦をスキップして2回戦縦線へ直通！
 * 勝者ラインは赤太線(2.5px)、敗者はグレー細線(1.2px)
 * 各山にスコアをダイレクト刻印、クリックで右ペイン連動
 */
function renderTournamentSvg(tour: TournamentData, activeMatchId: string): string {
  const isKoshien = tour.bracketType === 'KOSHIEN_8';

  if (isKoshien) {
    // 甲子園 8校トーナメント
    const schools = [
      { name: '大阪桐蔭（大阪）', isMy: false },
      { name: '横浜（神奈川）', isMy: false },
      { name: '仙台育英（宮城）', isMy: false },
      { name: '智弁和歌山（和歌山）', isMy: false },
      { name: '広陵（広島）', isMy: false },
      { name: '星稜（石川）', isMy: false },
      { name: '青雲（福岡）★自校', isMy: true },
      { name: '健大高崎（群馬）', isMy: false },
    ];

    const rowY = [40, 100, 160, 220, 280, 340, 400, 460];
    const xSchool = 170;
    const xQf = 300;
    const xSf = 430;
    const xFinal = 550;
    const xChamp = 650;

    const yQf = [70, 190, 310, 430];
    const ySf = [130, 370];
    const yFinal = 250;

    return `
    <svg viewBox="0 0 780 520" style="width:100%;min-width:680px;height:auto;background:#ffffff;border-radius:8px;font-family:'Hiragino Sans', 'Yu Gothic UI', Meiryo, sans-serif;">
      <!-- 背景罫線・新聞風微細ボーダー -->
      <rect x="0" y="0" width="780" height="520" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
      
      <!-- ラウンドヘッダー -->
      <g font-size="11" font-weight="800" fill="#64748b" text-anchor="middle">
        <text x="235" y="20">準々決勝（ベスト8）</text>
        <text x="365" y="20">準決勝（ベスト4）</text>
        <text x="490" y="20">決勝戦</text>
        <text x="630" y="20">深紅の大優勝旗</text>
      </g>

      <!-- 学校名リスト -->
      ${schools
        .map((sc, i) => {
          const y = rowY[i];
          const bg = sc.isMy ? '#fef3c7' : '#f8fafc';
          const stroke = sc.isMy ? '#f59e0b' : '#e2e8f0';
          const textFill = sc.isMy ? '#b45309' : '#1e293b';
          const fontW = sc.isMy ? '900' : '700';
          return `
          <g>
            <rect x="10" y="${y - 14}" width="150" height="28" rx="5" fill="${bg}" stroke="${stroke}" stroke-width="${sc.isMy ? 1.5 : 1}"/>
            <text x="85" y="${y + 4}" font-size="12" font-weight="${fontW}" fill="${textFill}" text-anchor="middle">${esc(sc.name)}</text>
          </g>`;
        })
        .join('')}

      <!-- 水平線 (学校 -> QF) -->
      ${rowY
        .map((y, i) => {
          // 青雲(6), 仙台育英(2), 広陵(4), 大阪桐蔭(0) がQF勝者
          const isWinner = i === 0 || i === 2 || i === 4 || i === 6;
          const stroke = isWinner ? '#dc2626' : '#94a3b8';
          const width = isWinner ? '2.5' : '1.2';
          return `<line x1="${xSchool}" y1="${y}" x2="${xQf}" y2="${y}" stroke="${stroke}" stroke-width="${width}"/>`;
        })
        .join('')}

      <!-- QF コの字 & ジャンクション -->
      <!-- QF1: 桐蔭 vs 横浜 (y=40 vs 100) -->
      <path d="M ${xQf} 40 V 100" stroke="#94a3b8" stroke-width="1.2" fill="none"/>
      <path d="M ${xQf} 40 V 70" stroke="#dc2626" stroke-width="2.5" fill="none"/>
      <line x1="${xQf}" y1="${yQf[0]}" x2="${xSf}" y2="${yQf[0]}" stroke="#94a3b8" stroke-width="1.2"/>

      <!-- QF2: 仙台育英 vs 智弁和歌山 (y=160 vs 220) -->
      <path d="M ${xQf} 160 V 220" stroke="#94a3b8" stroke-width="1.2" fill="none"/>
      <path d="M ${xQf} 160 V 190" stroke="#dc2626" stroke-width="2.5" fill="none"/>
      <line x1="${xQf}" y1="${yQf[1]}" x2="${xSf}" y2="${yQf[1]}" stroke="#dc2626" stroke-width="2.5"/>

      <!-- QF3: 広陵 vs 星稜 (y=280 vs 340) -->
      <path d="M ${xQf} 280 V 340" stroke="#94a3b8" stroke-width="1.2" fill="none"/>
      <path d="M ${xQf} 280 V 310" stroke="#dc2626" stroke-width="2.5" fill="none"/>
      <line x1="${xQf}" y1="${yQf[2]}" x2="${xSf}" y2="${yQf[2]}" stroke="#94a3b8" stroke-width="1.2"/>

      <!-- QF4: 青雲 vs 健大高崎 (y=400 vs 460) -->
      <path d="M ${xQf} 400 V 460" stroke="#94a3b8" stroke-width="1.2" fill="none"/>
      <path d="M ${xQf} 400 V 430" stroke="#dc2626" stroke-width="2.5" fill="none"/>
      <line x1="${xQf}" y1="${yQf[3]}" x2="${xSf}" y2="${yQf[3]}" stroke="#dc2626" stroke-width="2.5"/>

      <!-- SF コの字 -->
      <!-- SF1: 桐蔭(y=70) vs 仙台育英(y=190) -->
      <path d="M ${xSf} 70 V 190" stroke="#94a3b8" stroke-width="1.2" fill="none"/>
      <path d="M ${xSf} 130 V 190" stroke="#dc2626" stroke-width="2.5" fill="none"/>
      <line x1="${xSf}" y1="${ySf[0]}" x2="${xFinal}" y2="${ySf[0]}" stroke="#94a3b8" stroke-width="1.2"/>

      <!-- SF2: 広陵(y=310) vs 青雲(y=430) -->
      <path d="M ${xSf} 310 V 430" stroke="#94a3b8" stroke-width="1.2" fill="none"/>
      <path d="M ${xSf} 370 V 430" stroke="#dc2626" stroke-width="2.5" fill="none"/>
      <line x1="${xSf}" y1="${ySf[1]}" x2="${xFinal}" y2="${ySf[1]}" stroke="#dc2626" stroke-width="2.5"/>

      <!-- FINAL コの字 -->
      <path d="M ${xFinal} 130 V 370" stroke="#94a3b8" stroke-width="1.2" fill="none"/>
      <path d="M ${xFinal} 250 V 370" stroke="#dc2626" stroke-width="2.5" fill="none"/>
      <line x1="${xFinal}" y1="${yFinal}" x2="${xChamp}" y2="${yFinal}" stroke="#dc2626" stroke-width="3"/>

      <!-- 優勝フラッグ -->
      <g transform="translate(${xChamp + 5}, ${yFinal - 20})">
        <rect x="0" y="0" width="105" height="40" rx="6" fill="#fef3c7" stroke="#d97706" stroke-width="2"/>
        <text x="52" y="16" font-size="11" font-weight="900" fill="#b45309" text-anchor="middle">🏆 全国制覇</text>
        <text x="52" y="32" font-size="12" font-weight="900" fill="#dc2626" text-anchor="middle">青雲高校</text>
      </g>

      <!-- インタラクティブ試合ノード（クリックで詳細連動） -->
      ${renderMatchNode('FINAL', xFinal + 20, yFinal - 8, '5 - 3', activeMatchId === 'FINAL', '決勝')}
      ${renderMatchNode('SF1', xSf + 15, ySf[0] - 8, '5 - 3', activeMatchId === 'SF1', '準決勝1')}
      ${renderMatchNode('SF2', xSf + 15, ySf[1] - 8, '4 - 2', activeMatchId === 'SF2', '準決勝2')}
      ${renderMatchNode('QF1', xQf + 10, yQf[0] - 8, '6 - 4', activeMatchId === 'QF1', '準々決1')}
      ${renderMatchNode('QF2', xQf + 10, yQf[1] - 8, '5 - 3', activeMatchId === 'QF2', '準々決2')}
      ${renderMatchNode('QF3', xQf + 10, yQf[2] - 8, '4 - 1', activeMatchId === 'QF3', '準々決3')}
      ${renderMatchNode('QF4', xQf + 10, yQf[3] - 8, '6 - 2', activeMatchId === 'QF4', '準々決4')}
    </svg>`;
  }

  // 福岡県大会 12校トーナメント（シードバイパス正統新聞スタイル）
  const schools = [
    { seed: '第1シード', name: '青雲 ★自校', isMy: true, isSeed: true },
    { seed: '', name: '福岡第一', isMy: false, isSeed: false },
    { seed: '', name: '飯塚', isMy: false, isSeed: false },
    { seed: '', name: '東福岡', isMy: false, isSeed: false },
    { seed: '', name: '筑陽学園', isMy: false, isSeed: false },
    { seed: '第4シード', name: '九州国際大付', isMy: false, isSeed: true },
    { seed: '第2シード', name: '西日本短大付', isMy: false, isSeed: true },
    { seed: '', name: '自由ケ丘', isMy: false, isSeed: false },
    { seed: '', name: '祐誠', isMy: false, isSeed: false },
    { seed: '', name: '真颯館', isMy: false, isSeed: false },
    { seed: '', name: '小倉', isMy: false, isSeed: false },
    { seed: '第3シード', name: '福岡大大濠', isMy: false, isSeed: true },
  ];

  const rowY = [24, 68, 112, 156, 200, 244, 288, 332, 376, 420, 464, 508];
  const xSchool = 180;
  const xR1 = 290;
  const xR2 = 400; // QF
  const xR3 = 510; // SF
  const xFinal = 620;
  const xChamp = 710;

  const yR1 = [90, 178, 354, 442];
  const yQf = [57, 211, 321, 475];
  const ySf = [134, 398];
  const yFinal = 266;

  return `
  <svg viewBox="0 0 830 540" style="width:100%;min-width:720px;height:auto;background:#ffffff;border-radius:8px;font-family:'Hiragino Sans', 'Yu Gothic UI', Meiryo, sans-serif;">
    <rect x="0" y="0" width="830" height="540" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>

    <!-- ラウンドヘッダー -->
    <g font-size="11" font-weight="800" fill="#64748b" text-anchor="middle">
      <text x="235" y="16">1回戦</text>
      <text x="345" y="16">準々決勝（シード合流）</text>
      <text x="455" y="16">準決勝</text>
      <text x="565" y="16">決勝戦</text>
      <text x="730" y="16">甲子園出場校</text>
    </g>

    <!-- 学校名リスト -->
    ${schools
      .map((sc, i) => {
        const y = rowY[i];
        const bg = sc.isMy ? '#fef3c7' : sc.isSeed ? '#eff6ff' : '#f8fafc';
        const stroke = sc.isMy ? '#f59e0b' : sc.isSeed ? '#bfdbfe' : '#e2e8f0';
        const textFill = sc.isMy ? '#b45309' : sc.isSeed ? '#1e3a8a' : '#1e293b';
        const fontW = sc.isMy || sc.isSeed ? '900' : '700';
        return `
        <g>
          <rect x="10" y="${y - 14}" width="160" height="28" rx="5" fill="${bg}" stroke="${stroke}" stroke-width="${sc.isMy ? 1.5 : 1}"/>
          ${sc.seed ? `<text x="18" y="${y + 4}" font-size="10" font-weight="800" fill="#b45309">${esc(sc.seed)}</text>` : ''}
          <text x="${sc.seed ? 100 : 90}" y="${y + 4}" font-size="11.5" font-weight="${fontW}" fill="${textFill}" text-anchor="middle">${esc(sc.name)}</text>
        </g>`;
      })
      .join('')}

    <!-- 1. シード校の直通水平線（1回戦スキップして2回戦柱へスーッと直通！） -->
    <!-- Row 0: 青雲 (自校・優勝) -> 赤太線 (2.5px) -->
    <line x1="${xSchool}" y1="${rowY[0]}" x2="${xR2}" y2="${rowY[0]}" stroke="#dc2626" stroke-width="2.5"/>
    
    <!-- Row 5: 九州国際大付 (Seed) -> 赤太線(QF勝利) -->
    <line x1="${xSchool}" y1="${rowY[5]}" x2="${xR2}" y2="${rowY[5]}" stroke="#dc2626" stroke-width="2.5"/>

    <!-- Row 6: 西日本短大付 (Seed) -> 赤太線(QF勝利) -->
    <line x1="${xSchool}" y1="${rowY[6]}" x2="${xR2}" y2="${rowY[6]}" stroke="#dc2626" stroke-width="2.5"/>

    <!-- Row 11: 福岡大大濠 (Seed) -> 赤太線(QF, SF勝利) -->
    <line x1="${xSchool}" y1="${rowY[11]}" x2="${xR2}" y2="${rowY[11]}" stroke="#dc2626" stroke-width="2.5"/>

    <!-- 2. ノーシード校の1回戦（コの字山） -->
    <!-- Row 1: 福岡第一 (勝) vs Row 2: 飯塚 (敗) -->
    <line x1="${xSchool}" y1="${rowY[1]}" x2="${xR1}" y2="${rowY[1]}" stroke="#dc2626" stroke-width="2.5"/>
    <line x1="${xSchool}" y1="${rowY[2]}" x2="${xR1}" y2="${rowY[2]}" stroke="#94a3b8" stroke-width="1.2"/>
    <path d="M ${xR1} ${rowY[1]} V ${rowY[2]}" stroke="#94a3b8" stroke-width="1.2" fill="none"/>
    <path d="M ${xR1} ${rowY[1]} V ${yR1[0]}" stroke="#dc2626" stroke-width="2.5" fill="none"/>
    <line x1="${xR1}" y1="${yR1[0]}" x2="${xR2}" y2="${yR1[0]}" stroke="#94a3b8" stroke-width="1.2"/>

    <!-- Row 3: 東福岡 (勝) vs Row 4: 筑陽学園 (敗) -->
    <line x1="${xSchool}" y1="${rowY[3]}" x2="${xR1}" y2="${rowY[3]}" stroke="#dc2626" stroke-width="2.5"/>
    <line x1="${xSchool}" y1="${rowY[4]}" x2="${xR1}" y2="${rowY[4]}" stroke="#94a3b8" stroke-width="1.2"/>
    <path d="M ${xR1} ${rowY[3]} V ${rowY[4]}" stroke="#94a3b8" stroke-width="1.2" fill="none"/>
    <path d="M ${xR1} ${rowY[3]} V ${yR1[1]}" stroke="#dc2626" stroke-width="2.5" fill="none"/>
    <line x1="${xR1}" y1="${yR1[1]}" x2="${xR2}" y2="${yR1[1]}" stroke="#94a3b8" stroke-width="1.2"/>

    <!-- Row 7: 自由ケ丘 (勝) vs Row 8: 祐誠 (敗) -->
    <line x1="${xSchool}" y1="${rowY[7]}" x2="${xR1}" y2="${rowY[7]}" stroke="#dc2626" stroke-width="2.5"/>
    <line x1="${xSchool}" y1="${rowY[8]}" x2="${xR1}" y2="${rowY[8]}" stroke="#94a3b8" stroke-width="1.2"/>
    <path d="M ${xR1} ${rowY[7]} V ${rowY[8]}" stroke="#94a3b8" stroke-width="1.2" fill="none"/>
    <path d="M ${xR1} ${rowY[7]} V ${yR1[2]}" stroke="#dc2626" stroke-width="2.5" fill="none"/>
    <line x1="${xR1}" y1="${yR1[2]}" x2="${xR2}" y2="${yR1[2]}" stroke="#94a3b8" stroke-width="1.2"/>

    <!-- Row 9: 真颯館 (勝) vs Row 10: 小倉 (敗) -->
    <line x1="${xSchool}" y1="${rowY[9]}" x2="${xR1}" y2="${rowY[9]}" stroke="#dc2626" stroke-width="2.5"/>
    <line x1="${xSchool}" y1="${rowY[10]}" x2="${xR1}" y2="${rowY[10]}" stroke="#94a3b8" stroke-width="1.2"/>
    <path d="M ${xR1} ${rowY[9]} V ${rowY[10]}" stroke="#94a3b8" stroke-width="1.2" fill="none"/>
    <path d="M ${xR1} ${rowY[9]} V ${yR1[3]}" stroke="#dc2626" stroke-width="2.5" fill="none"/>
    <line x1="${xR1}" y1="${yR1[3]}" x2="${xR2}" y2="${yR1[3]}" stroke="#94a3b8" stroke-width="1.2"/>

    <!-- 3. 2回戦（準々決勝 QF）コの字柱 -->
    <!-- QF1: 青雲(Row 0: 24) vs 福岡第一(yR1[0]: 90) -> 青雲勝利 -->
    <path d="M ${xR2} 24 V 90" stroke="#94a3b8" stroke-width="1.2" fill="none"/>
    <path d="M ${xR2} 24 V ${yQf[0]}" stroke="#dc2626" stroke-width="2.5" fill="none"/>
    <line x1="${xR2}" y1="${yQf[0]}" x2="${xR3}" y2="${yQf[0]}" stroke="#dc2626" stroke-width="2.5"/>

    <!-- QF2: 東福岡(yR1[1]: 178) vs 九国大付(Row 5: 244) -> 九国大付勝利 -->
    <path d="M ${xR2} 178 V 244" stroke="#94a3b8" stroke-width="1.2" fill="none"/>
    <path d="M ${xR2} ${yQf[1]} V 244" stroke="#dc2626" stroke-width="2.5" fill="none"/>
    <line x1="${xR2}" y1="${yQf[1]}" x2="${xR3}" y2="${yQf[1]}" stroke="#94a3b8" stroke-width="1.2"/>

    <!-- QF3: 西短大付(Row 6: 288) vs 自由ケ丘(yR1[2]: 354) -> 西短大付勝利 -->
    <path d="M ${xR2} 288 V 354" stroke="#94a3b8" stroke-width="1.2" fill="none"/>
    <path d="M ${xR2} 288 V ${yQf[2]}" stroke="#dc2626" stroke-width="2.5" fill="none"/>
    <line x1="${xR2}" y1="${yQf[2]}" x2="${xR3}" y2="${yQf[2]}" stroke="#94a3b8" stroke-width="1.2"/>

    <!-- QF4: 真颯館(yR1[3]: 442) vs 福大大濠(Row 11: 508) -> 福大大濠勝利 -->
    <path d="M ${xR2} 442 V 508" stroke="#94a3b8" stroke-width="1.2" fill="none"/>
    <path d="M ${xR2} ${yQf[3]} V 508" stroke="#dc2626" stroke-width="2.5" fill="none"/>
    <line x1="${xR2}" y1="${yQf[3]}" x2="${xR3}" y2="${yQf[3]}" stroke="#dc2626" stroke-width="2.5"/>

    <!-- 4. 準決勝（SF）コの字柱 -->
    <!-- SF1: 青雲(57) vs 九国大付(211) -> 青雲勝利 -->
    <path d="M ${xR3} 57 V 211" stroke="#94a3b8" stroke-width="1.2" fill="none"/>
    <path d="M ${xR3} 57 V ${ySf[0]}" stroke="#dc2626" stroke-width="2.5" fill="none"/>
    <line x1="${xR3}" y1="${ySf[0]}" x2="${xFinal}" y2="${ySf[0]}" stroke="#dc2626" stroke-width="2.5"/>

    <!-- SF2: 西短大付(321) vs 福大大濠(475) -> 福大大濠勝利 -->
    <path d="M ${xR3} 321 V 475" stroke="#94a3b8" stroke-width="1.2" fill="none"/>
    <path d="M ${xR3} ${ySf[1]} V 475" stroke="#dc2626" stroke-width="2.5" fill="none"/>
    <line x1="${xR3}" y1="${ySf[1]}" x2="${xFinal}" y2="${ySf[1]}" stroke="#94a3b8" stroke-width="1.2"/>

    <!-- 5. 決勝戦（FINAL）コの字柱 -->
    <!-- FINAL: 青雲(134) vs 福大大濠(398) -> 青雲劇的サヨナラ勝ち！ -->
    <path d="M ${xFinal} 134 V 398" stroke="#94a3b8" stroke-width="1.2" fill="none"/>
    <path d="M ${xFinal} 134 V ${yFinal}" stroke="#dc2626" stroke-width="2.5" fill="none"/>
    <line x1="${xFinal}" y1="${yFinal}" x2="${xChamp}" y2="${yFinal}" stroke="#dc2626" stroke-width="3"/>

    <!-- 優勝栄誉枠 -->
    <g transform="translate(${xChamp + 5}, ${yFinal - 24})">
      <rect x="0" y="0" width="105" height="48" rx="6" fill="#fef3c7" stroke="#d97706" stroke-width="2"/>
      <text x="52" y="17" font-size="11" font-weight="900" fill="#b45309" text-anchor="middle">🏆 優勝（甲子園）</text>
      <text x="52" y="32" font-size="13" font-weight="900" fill="#dc2626" text-anchor="middle">青雲高校</text>
      <text x="52" y="44" font-size="9" font-weight="700" fill="#78350f" text-anchor="middle">3年ぶり4回目</text>
    </g>

    <!-- インタラクティブ試合ノード（スコア刻印＆クリック連動） -->
    ${renderMatchNode('FINAL', xFinal + 20, yFinal - 10, '3x - 2 (サヨナラ)', activeMatchId === 'FINAL', '決勝')}
    ${renderMatchNode('SF1', xR3 + 12, ySf[0] - 8, '5 - 3', activeMatchId === 'SF1', '準決勝1')}
    ${renderMatchNode('SF2', xR3 + 12, ySf[1] - 8, '4 - 2', activeMatchId === 'SF2', '準決勝2')}
    ${renderMatchNode('QF1', xR2 + 10, yQf[0] - 8, '7 - 2', activeMatchId === 'QF1', '準々決1')}
    ${renderMatchNode('QF2', xR2 + 10, yQf[1] - 8, '6 - 4', activeMatchId === 'QF2', '準々決2')}
    ${renderMatchNode('QF3', xR2 + 10, yQf[2] - 8, '4 - 1', activeMatchId === 'QF3', '準々決3')}
    ${renderMatchNode('QF4', xR2 + 10, yQf[3] - 8, '5 - 3', activeMatchId === 'QF4', '準々決4')}
    ${renderMatchNode('R1_1', xR1 + 10, yR1[0] - 8, '5 - 1', activeMatchId === 'R1_1', '1回戦')}
    ${renderMatchNode('R1_2', xR1 + 10, yR1[1] - 8, '4 - 3', activeMatchId === 'R1_2', '1回戦')}
    ${renderMatchNode('R1_3', xR1 + 10, yR1[2] - 8, '8 - 1 (7コ)', activeMatchId === 'R1_3', '1回戦')}
    ${renderMatchNode('R1_4', xR1 + 10, yR1[3] - 8, '3 - 2', activeMatchId === 'R1_4', '1回戦')}
  </svg>`;
}

function renderMatchNode(
  id: string,
  x: number,
  y: number,
  scoreLabel: string,
  isActive: boolean,
  roundShort: string,
): string {
  const isSelected = isActive;
  const bg = isSelected ? '#f59e0b' : '#ffffff';
  const stroke = isSelected ? '#d97706' : '#cbd5e1';
  const textFill = isSelected ? '#ffffff' : '#dc2626';

  return `
  <g class="clickable" data-act="tour-pick-match" data-mid="${id}" style="cursor:pointer">
    <title>${esc(roundShort)}: ${esc(scoreLabel)}</title>
    <!-- 当たり判定拡張領域 -->
    <rect x="${x - 6}" y="${y - 12}" width="80" height="24" fill="transparent"/>
    
    <!-- スコア刻印バッジ -->
    <rect x="${x - 4}" y="${y - 10}" width="76" height="20" rx="4" fill="${bg}" stroke="${stroke}" stroke-width="${isSelected ? 2 : 1}"/>
    <text x="${x + 34}" y="${y + 4}" font-size="10" font-weight="900" fill="${textFill}" text-anchor="middle">${esc(scoreLabel)}</text>
    
    ${
      isSelected
        ? `
      <!-- 選択中リング＆インジケータ -->
      <circle cx="${x - 12}" cy="${y}" r="6" fill="#f59e0b" stroke="#ffffff" stroke-width="2"/>
      <rect x="${x - 4}" y="${y - 24}" width="76" height="13" rx="3" fill="#1e3a8a"/>
      <text x="${x + 34}" y="${y - 14}" font-size="9" font-weight="900" fill="#fef3c7" text-anchor="middle">詳細表示中 ▶</text>`
        : ''
    }
  </g>`;
}

/**
 * 過去大会戦績タブ（新聞風トーナメント表 ＆ 山クリック連動スコアボード詳細）
 */
function tabTournament(): string {
  const tour = TOURNAMENTS[selectedTourId] ?? TOURNAMENTS.FUKUOKA_SUMMER_2026;
  const match = tour.matches[selectedTourMatchId] ?? tour.matches.FINAL ?? Object.values(tour.matches)[0];

  const svgHtml = renderTournamentSvg(tour, match.id);

  const scorebookModalHtml = showScorebookModal && match.scorebookRows
    ? `
    <div class="modal-back" data-act="tour-close-scorebook-bg">
      <div class="modal" style="max-width:840px">
        <div class="modal-head">
          <h2>📖 全打席スコアブック — ${esc(match.roundName)}（${esc(match.teamB)} vs ${esc(match.teamA)}）</h2>
          <button class="x" data-act="tour-close-scorebook">✕ 閉じる</button>
        </div>
        <div style="padding:16px 20px">
          <div style="font-size:12px;color:var(--muted);margin-bottom:10px">
            実施日: ${match.date} / 球場: ${esc(match.stadium)} / 観客: ${esc(match.attendance)}
          </div>
          <div class="tbl-wrap">
            <table class="tbl" style="font-size:12px">
              <thead>
                <tr>
                  <th>打順</th><th>守備</th><th>選手名</th>
                  <th>1回</th><th>2回</th><th>3回</th><th>4回</th><th>5回</th><th>6回</th><th>7回</th><th>8回</th><th>9回</th>
                </tr>
              </thead>
              <tbody>
                ${match.scorebookRows
                  .map(
                    (r) => `<tr>
                    <td><b>${r.num}</b></td>
                    <td><span class="badge navy">${r.pos}</span></td>
                    <td><b>${esc(r.name)}</b></td>
                    ${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<td>${r.ab[i] ?? '—'}</td>`).join('')}
                  </tr>`,
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
          <div class="note-box" style="margin-top:14px">
            <b>📝 監督スコア総括:</b><br>${esc(match.comment)}
          </div>
        </div>
      </div>
    </div>`
    : '';

  return `
  <div style="display:flex;flex-direction:column;height:100%;min-height:0;gap:10px">
    <!-- 大会切り替えツールバー -->
    <div class="card" style="padding:8px 14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-weight:900;color:var(--navy);font-size:13px">🏆 大会選択:</span>
        <select class="field" style="padding:5px 10px;font-weight:800;border-radius:6px;border:1px solid #cbd5e1" data-act="tour-select-tour">
          <option value="FUKUOKA_SUMMER_2026" ${selectedTourId === 'FUKUOKA_SUMMER_2026' ? 'selected' : ''}>第108回 全国高校野球選手権 福岡大会（2026年 夏）</option>
          <option value="KOSHIEN_SUMMER_2025" ${selectedTourId === 'KOSHIEN_SUMMER_2025' ? 'selected' : ''}>第107回 全国高校野球選手権大会（2025年 夏の甲子園）</option>
        </select>
        <span class="badge gold" style="font-size:12px;padding:4px 10px">${esc(tour.championSub)}</span>
      </div>
      <div style="font-size:12px;color:var(--muted);font-weight:700">
        地域: <b>${esc(tour.region)}</b>
      </div>
    </div>

    <!-- メイン2ペイン構成 (左: 新聞風トーナメント表 / 右: スコアボード詳細) -->
    <div style="flex:1;min-height:0;display:grid;grid-template-columns:1.2fr 1fr;gap:12px">
      
      <!-- 左ペイン: 新聞風トーナメント勝敗表 -->
      <div class="card" style="display:flex;flex-direction:column;min-height:0;overflow:hidden">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <h3 style="margin:0">📰 昔ながらの日刊スポーツ風 新聞トーナメント勝敗表</h3>
          <span style="font-size:11px;color:var(--muted);font-weight:700">※山のスコアをクリックすると右ペイン連動</span>
        </div>
        <div style="flex:1;overflow:auto;border:1px solid var(--border);border-radius:8px;background:#ffffff;padding:6px">
          ${svgHtml}
        </div>
      </div>

      <!-- 右ペイン: 山クリック連動 スコアボード詳細パネル -->
      <div class="card" style="display:flex;flex-direction:column;min-height:0;overflow:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <h3 style="margin:0">🏟️ 試合詳細スコアボード — ${esc(match.roundName)}</h3>
          <span class="badge navy">${match.date}</span>
        </div>
        
        <div style="font-size:11.5px;color:var(--muted);margin-bottom:8px">
          📍 ${esc(match.stadium)} ｜ 天候: ${esc(match.weather)} ｜ 観客: ${esc(match.attendance)}
        </div>

        <!-- 試合カードヘッダー -->
        <div style="background:linear-gradient(135deg,#1e3a8a,#0f172a);color:#fff;padding:10px 14px;border-radius:8px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:12px;opacity:.85">${match.scoreA > match.scoreB ? '勝者' : '敗戦'}: ${esc(match.teamA)}</div>
            <div style="font-size:22px;font-weight:900;letter-spacing:.05em">
              ${esc(match.teamA)} <span style="color:#f59e0b">${match.scoreA}</span> - <span style="color:#f59e0b">${match.scoreB}</span> ${esc(match.teamB)}
            </div>
          </div>
          <div style="text-align:right">
            <span class="badge gold" style="font-size:12px;padding:4px 10px">${match.scoreB > match.scoreA ? '○ 勝利' : '● 敗戦'}</span>
            <div style="font-size:11px;opacity:.85;margin-top:4px">${match.roundName}</div>
          </div>
        </div>

        <!-- 9イニング本格スコアボード -->
        <table class="stat-table" style="margin-bottom:10px">
          <thead>
            <tr>
              <th style="text-align:left">チーム</th>
              ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `<th>${i}</th>`).join('')}
              <th style="background:#fef3c7;color:#b45309">R</th>
              <th>H</th>
              <th>E</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="text-align:left;font-weight:900">${esc(match.teamA)}</td>
              ${match.lineA.map((r) => `<td>${r}</td>`).join('')}
              ${match.lineA.length < 9 ? Array.from({ length: 9 - match.lineA.length }).map(() => '<td>-</td>').join('') : ''}
              <td style="background:#fef3c7;font-weight:900;color:#b45309">${match.scoreA}</td>
              <td>${match.hitsA}</td>
              <td>${match.errA}</td>
            </tr>
            <tr>
              <td style="text-align:left;font-weight:900;color:var(--navy)">${esc(match.teamB)}</td>
              ${match.lineB.map((r) => `<td>${r}</td>`).join('')}
              ${match.lineB.length < 9 ? Array.from({ length: 9 - match.lineB.length }).map(() => '<td>-</td>').join('') : ''}
              <td style="background:#fef3c7;font-weight:900;color:#b45309">${match.scoreB}</td>
              <td>${match.hitsB}</td>
              <td>${match.errB}</td>
            </tr>
          </tbody>
        </table>

        <!-- 責任投手・バッテリー・本塁打 -->
        <div style="background:#f8fafc;border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:11.5px;line-height:1.6;margin-bottom:10px">
          <div><b>勝 投手:</b> ${esc(match.pitcherWin)}</div>
          <div><b>負 投手:</b> ${esc(match.pitcherLose)}</div>
          ${match.hr ? `<div style="color:#b45309;font-weight:800"><b>⚾ 本塁打:</b> ${esc(match.hr)}</div>` : ''}
        </div>

        <!-- 主要選手スタッツ -->
        <div style="margin-bottom:10px">
          <div style="font-size:12px;font-weight:800;color:var(--navy);margin-bottom:4px">🌟 キーマンスタッツ</div>
          <div style="display:flex;flex-direction:column;gap:4px">
            ${match.keyStats
              .map(
                (k) => `
              <div style="font-size:11.5px;background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:5px 8px;display:flex;align-items:center;gap:8px">
                <span class="badge navy">${k.pos}</span>
                <span style="font-weight:800;color:#1e293b">${esc(k.player)} (${k.grade}年)</span>
                <span style="color:#475569;margin-left:auto">${esc(k.stats)}</span>
              </div>`,
              )
              .join('')}
          </div>
        </div>

        <!-- 監督戦評 -->
        <div class="note-box" style="margin-top:auto">
          <b>📝 監督戦評・試合ハイライト</b><br>
          ${esc(match.comment)}
        </div>

        <!-- スコアブック開くボタン -->
        ${
          match.scorebookRows
            ? `<button class="btn primary" style="width:100%;margin-top:10px" data-act="tour-open-scorebook">
            📖 この決勝戦の全打席スコアブックを開く
          </button>`
            : ''
        }
      </div>
    </div>
  </div>
  ${scorebookModalHtml}
  `;
}

function tabHistory(): string {
  const s = game();
  const sel = SAMPLE_MATCHES.find((m) => m.no === selectedMatchNo) ?? SAMPLE_MATCHES[0];

  const rows = SAMPLE_MATCHES.map(
    (m) => `<tr class="clickable ${m.no === sel.no ? 'sel' : ''}" data-act="rec-pick-match" data-no="${m.no}">
      <td><b>${m.no}</b></td>
      <td>${esc(m.tournament)}</td>
      <td><span class="badge ${m.win ? 'gold' : 'navy'}">${m.win ? '○ 勝' : '● 敗'}</span> <b>${m.myScore}-${m.oppScore}</b> vs ${esc(m.opponent)}</td>
      <td>${m.date}</td>
    </tr>`,
  ).join('');

  return `<div style="display:grid;grid-template-columns:1fr 1.15fr;gap:12px;height:100%;min-height:0">
    <div class="card" style="display:flex;flex-direction:column;min-height:0">
      <h3>📋 自チーム全対戦戦績一覧（最新順・行クリックでスコアボード表示）</h3>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>No ▲▼</th><th>大会名 ▲▼</th><th>スコア / 対戦相手 ▲▼</th><th>日付 ▲▼</th></tr></thead><tbody>${rows}</tbody></table></div>
    </div>
    <div class="card" style="overflow:auto">
      <h3>🏟️ スコアボード詳細 — No.${sel.no} ${esc(sel.tournament)} (${sel.date} / ${esc(sel.stadium)})</h3>
      <table class="stat-table" style="margin-bottom:10px">
        <thead>
          <tr><th style="text-align:left">チーム</th>${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `<th>${i}</th>`).join('')}<th>R</th><th>H</th><th>E</th></tr>
        </thead>
        <tbody>
          <tr><td style="text-align:left;font-weight:900;color:var(--navy)">${esc(s.school.name)}</td>${sel.lineA.map((r) => `<td>${r}</td>`).join('')}<td><b>${sel.myScore}</b></td><td>${sel.hitsA}</td><td>${sel.errA}</td></tr>
          <tr><td style="text-align:left;font-weight:900">${esc(sel.opponent)}</td>${sel.lineB.map((r) => `<td>${r}</td>`).join('')}<td><b>${sel.oppScore}</b></td><td>${sel.hitsB}</td><td>${sel.errB}</td></tr>
        </tbody>
      </table>
      <div class="note-box"><b>📝 監督戦評・試合ハイライト</b><br>${esc(sel.comment)}</div>
    </div>
  </div>`;
}

function tabIndividual(): string {
  const cards = [
    ['1試合最多本塁打', '3 本塁打', '逢坂 慶次（甲子園2回戦 vs仙台育英）'],
    ['1試合最多打点', '8 打点', '逢坂 慶次（満塁弾含む2発）'],
    ['1試合最多安打', '5 安打', '早坂 隼人（5打数5安打の猛打賞）'],
    ['1試合最多盗塁', '4 盗塁', '五十嵐 翔（快足リードオフマン）'],
    ['1試合最多奪三振', '19 奪三振', '神崎 晴樹（県大会決勝 vs九国大付）'],
    ['公式戦最速球速', '154 km/h', '神崎 晴樹（甲子園準決勝計測）'],
  ];
  return `<div class="card">
    <h3>🏅 公式大会 歴代個人最高記録（1試合・大会通算殿堂アーカイブ）</h3>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
      ${cards
        .map(
          ([title, val, holder]) => `<div class="card" style="background:#f8fafc">
          <div style="font-size:12px;color:var(--muted);font-weight:800">${title}</div>
          <div style="font-size:24px;font-weight:900;color:var(--navy);margin:4px 0">${val}</div>
          <div style="font-size:12px;color:#b45309;font-weight:700">👑 ${holder}</div>
        </div>`,
        )
        .join('')}
    </div>
  </div>`;
}

function tabTeam(): string {
  const cards = [
    ['1試合最多得点', '22 得点', '県大会2回戦（7回コールド）'],
    ['1試合最多安打', '25 安打', '先発全員安打・チーム打率.581'],
    ['1試合最多本塁打', '5 本塁打', '秋季地区大会準々決勝'],
    ['1イニング最多得点', '11 得点', '打者15人の猛攻'],
    ['連続イニング無失点', '34 回連続', '秋季地区大会〜明治神宮大会'],
    ['連続無失策試合', '7 試合連続', '計63イニング失策ゼロ・守備率1.000'],
  ];
  return `<div class="card">
    <h3>🏆 公式大会 チーム歴代最高記録（攻撃・守備）</h3>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
      ${cards
        .map(
          ([title, val, sub]) => `<div class="card" style="background:#f8fafc">
          <div style="font-size:12px;color:var(--muted);font-weight:800">${title}</div>
          <div style="font-size:24px;font-weight:900;color:var(--navy);margin:4px 0">${val}</div>
          <div style="font-size:12px;color:#475569;font-weight:700">${sub}</div>
        </div>`,
        )
        .join('')}
    </div>
  </div>`;
}

function tabChampions(): string {
  const champs = [
    ['第107回 夏の選手権', '青雲高校（福岡県）', '仙台育英（宮城県）', '5 - 3'],
    ['第97回 春のセンバツ', '横浜（神奈川県）', '智弁和歌山（和歌山県）', '4 - 2'],
    ['第106回 夏の選手権', '京都国際（京都府）', '関東一（東京都）', '2 - 1 (延長10回TB)'],
    ['第96回 春のセンバツ', '健大高崎（群馬県）', '報徳学園（兵庫県）', '3 - 2'],
    ['第105回 夏の選手権', '慶應義塾（神奈川県）', '仙台育英（宮城県）', '8 - 2'],
  ];
  return `<div class="card">
    <h3>👑 甲子園全国大会（センバツ・夏の選手権）歴代優勝校アーカイブ</h3>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>大会回次・名称</th><th>🏆 優勝校</th><th>🥈 準優勝校</th><th>決勝スコア</th></tr></thead>
      <tbody>
        ${champs.map(([t, w, r, sc]) => `<tr><td><b>${t}</b></td><td><span class="badge gold">優勝</span> <b>${w}</b></td><td>${r}</td><td><b>${sc}</b></td></tr>`).join('')}
      </tbody>
    </table></div>
  </div>`;
}

function tabRanking(): string {
  const s = game();
  const pool = rankScope === 'NATIONAL' ? allSchools() : schoolsOf(s.school.prefecture);
  const top = pool
    .slice()
    .sort((a, b) => b.baseRating - a.baseRating || b.stability - a.stability)
    .slice(0, 50);

  return `<div class="card" style="display:flex;flex-direction:column;height:100%;min-height:0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <h3 style="margin:0">📊 全国4,000校 AI戦力格付けランキング（上位50校表示）</h3>
      <div class="chips">
        <button class="${rankScope === 'NATIONAL' ? 'on' : ''}" data-act="rec-rank-scope" data-v="NATIONAL">全国ランキング (${allSchools().length}校)</button>
        <button class="${rankScope === 'PREF' ? 'on' : ''}" data-act="rec-rank-scope" data-v="PREF">${esc(s.school.prefecture)}内ランキング (${schoolsOf(s.school.prefecture).length}校)</button>
      </div>
    </div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>順位</th><th>高校名</th><th>都道府県</th><th>区分</th><th>総合ランク</th><th>基準戦力</th><th>投手力</th><th>打撃力</th><th>守備力</th><th>特徴</th></tr></thead>
      <tbody>
        ${top
          .map(
            (sch, idx) => `<tr class="${sch.name === s.school.name ? 'sel' : ''}">
            <td><b>#${idx + 1}</b></td>
            <td><b>${esc(schoolFull(sch.name))}</b></td>
            <td>${esc(sch.prefecture)}</td>
            <td><span class="badge ${sch.isPublic ? 'green' : 'navy'}">${sch.isPublic ? '公立' : '私立'}</span></td>
            <td><span class="badge gold">Rank ${ratingRank(sch.baseRating)}</span></td>
            <td><b>${sch.baseRating}</b></td>
            <td>${ratingRank(sch.pitching)}${sch.pitching}</td>
            <td>${ratingRank(sch.batting)}${sch.batting}</td>
            <td>${ratingRank(sch.defense)}${sch.defense}</td>
            <td style="color:#475569">${esc(sch.note)}</td>
          </tr>`,
          )
          .join('')}
      </tbody>
    </table></div>
  </div>`;
}

export function renderRecords(): string {
  const content =
    tab === 'TOURNAMENT'
      ? tabTournament()
      : tab === 'HISTORY'
        ? tabHistory()
        : tab === 'INDIVIDUAL'
          ? tabIndividual()
          : tab === 'TEAM'
            ? tabTeam()
            : tab === 'CHAMPIONS'
              ? tabChampions()
              : tabRanking();

  const body = `<div style="padding:10px 16px;height:100%;display:flex;flex-direction:column;gap:10px">
    <div class="card" style="padding:8px 14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div class="chips">
        <button class="${tab === 'TOURNAMENT' ? 'on' : ''}" data-act="rec-tab" data-v="TOURNAMENT">🏆 過去大会戦績（新聞風トーナメント）</button>
        <button class="${tab === 'HISTORY' ? 'on' : ''}" data-act="rec-tab" data-v="HISTORY">📋 戦績（全対戦スコア連動）</button>
        <button class="${tab === 'INDIVIDUAL' ? 'on' : ''}" data-act="rec-tab" data-v="INDIVIDUAL">🏅 個人記録</button>
        <button class="${tab === 'TEAM' ? 'on' : ''}" data-act="rec-tab" data-v="TEAM">🛡️ チーム記録</button>
        <button class="${tab === 'CHAMPIONS' ? 'on' : ''}" data-act="rec-tab" data-v="CHAMPIONS">👑 歴代優勝校</button>
        <button class="${tab === 'RANKING' ? 'on' : ''}" data-act="rec-tab" data-v="RANKING">📊 全国4,000校 戦力ランキング</button>
      </div>
    </div>
    <div style="flex:1;min-height:0">${content}</div>
  </div>`;

  return shell('records', '栄光の記録室（レコードルーム）', body);
}

registerActions({
  'rec-tab': (el) => {
    tab = el.dataset.v as RecTab;
    requestRender();
  },
  'rec-pick-match': (el) => {
    selectedMatchNo = Number(el.dataset.no);
    requestRender();
  },
  'rec-rank-scope': (el) => {
    rankScope = el.dataset.v as 'NATIONAL' | 'PREF';
    requestRender();
  },
  'tour-select-tour': (el) => {
    selectedTourId = (el as HTMLSelectElement).value;
    selectedTourMatchId = 'FINAL';
    requestRender();
  },
  'tour-pick-match': (el) => {
    const mid = el.dataset.mid;
    if (mid) {
      selectedTourMatchId = mid;
      requestRender();
    }
  },
  'tour-open-scorebook': () => {
    showScorebookModal = true;
    requestRender();
  },
  'tour-close-scorebook': () => {
    showScorebookModal = false;
    requestRender();
  },
  'tour-close-scorebook-bg': (el, ev) => {
    if (ev.target === el) {
      showScorebookModal = false;
      requestRender();
    }
  },
});
