import type { Rng } from './rng';
import type { PlayerName } from './types';

export type NameRegion =
  | 'hokkaido'
  | 'tohoku'
  | 'kanto'
  | 'hokushinetsu'
  | 'tokai'
  | 'kinki'
  | 'chugoku'
  | 'shikoku'
  | 'kyushu'
  | 'okinawa';

/** 都道府県 → 名字地域 */
export const PREFECTURE_REGION: Record<string, NameRegion> = {
  北海道: 'hokkaido',
  青森県: 'tohoku', 岩手県: 'tohoku', 宮城県: 'tohoku', 秋田県: 'tohoku', 山形県: 'tohoku', 福島県: 'tohoku',
  茨城県: 'kanto', 栃木県: 'kanto', 群馬県: 'kanto', 埼玉県: 'kanto', 千葉県: 'kanto', 東京都: 'kanto', 神奈川県: 'kanto', 山梨県: 'kanto',
  新潟県: 'hokushinetsu', 富山県: 'hokushinetsu', 石川県: 'hokushinetsu', 福井県: 'hokushinetsu', 長野県: 'hokushinetsu',
  岐阜県: 'tokai', 静岡県: 'tokai', 愛知県: 'tokai', 三重県: 'tokai',
  滋賀県: 'kinki', 京都府: 'kinki', 大阪府: 'kinki', 兵庫県: 'kinki', 奈良県: 'kinki', 和歌山県: 'kinki',
  鳥取県: 'chugoku', 島根県: 'chugoku', 岡山県: 'chugoku', 広島県: 'chugoku', 山口県: 'chugoku',
  徳島県: 'shikoku', 香川県: 'shikoku', 愛媛県: 'shikoku', 高知県: 'shikoku',
  福岡県: 'kyushu', 佐賀県: 'kyushu', 長崎県: 'kyushu', 熊本県: 'kyushu', 大分県: 'kyushu', 宮崎県: 'kyushu', 鹿児島県: 'kyushu',
  沖縄県: 'okinawa',
};

/** 全国共通名字（初期辞書。本番では約1,000種まで拡張する） */
export const COMMON_SURNAMES: readonly string[] = [
  '佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤',
  '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水',
  '山崎', '森', '池田', '橋本', '阿部', '石川', '山下', '中島', '石井', '小川',
  '前田', '岡田', '長谷川', '藤田', '後藤', '近藤', '村上', '遠藤', '青木', '坂本',
  '斉藤', '福田', '太田', '西村', '藤井', '金子', '岡本', '藤原', '三浦', '中野',
  '原田', '松田', '竹内', '小野', '田村', '中山', '和田', '石田', '上田', '森田',
  '原', '柴田', '酒井', '工藤', '横山', '宮崎', '宮本', '内田', '高木', '安藤',
  '谷口', '大野', '丸山', '今井', '河野', '藤本', '村田', '武田', '上野', '杉山',
  '千葉', '菊池', '堀', '大塚', '平野', '久保', '松井', '小島', '島田', '望月',
  '浅川', '橘', '堂本', '神保', '瀬戸', '神崎', '柘山', '結城', '馬原', '白石',
];

/** 地域特有名字 */
export const REGIONAL_SURNAMES: Record<NameRegion, readonly string[]> = {
  hokkaido: ['佐藤', '高橋', '三浦', '工藤', '吉田', '菊地', '小松', '佐野', '蝦名', '須藤'],
  tohoku: ['工藤', '佐々木', '千葉', '及川', '菊池', '佐藤', '阿部', '鎌田', '三浦', '畠山', '熊谷', '小野寺'],
  kanto: ['関口', '大塚', '須藤', '杉本', '飯田', '山岸', '新井', '小倉', '栗原', '矢島'],
  hokushinetsu: ['堂前', '北野', '寺西', '竹内', '笹川', '五十嵐', '小林', '宮島', '土田', '黒川'],
  tokai: ['鈴木', '加藤', '伊藤', '近藤', '服部', '杉浦', '大村', '山内', '鬼頭', '榊原'],
  kinki: ['中谷', '西田', '南', '奥野', '辻', '北川', '森本', '東', '浅野', '上村'],
  chugoku: ['藤井', '岡', '難波', '三宅', '守屋', '村岡', '光井', '梶谷', '安部', '神田'],
  shikoku: ['岡', '山中', '合田', '村上', '大西', '宮内', '三好', '森岡', '武市', '山本'],
  kyushu: ['古賀', '黒木', '白水', '野中', '堤', '大庭', '城戸', '江口', '松尾', '久保田', '緒方', '原口', '田代', '吉村'],
  okinawa: ['比嘉', '金城', '大城', '照屋', '玉城', '島袋', '仲村', '宮城', '新垣', '上原', '知念', '具志堅'],
};

/** 高校野球らしい爽やかな名前 */
export const GIVEN_NAMES: readonly string[] = [
  '健太郎', '翔', '陸', '大和', '太陽', '蓮', '颯太', '航希', '隼人', '拓海',
  '悠真', '駿', '翼', '健', '誠', '大輝', '蒼', '海斗', '陽斗', '拓真',
  '健吾', '慎之介', '陸斗', '将太', '涼介', '勇気', '直樹', '光輝', '雄大', '一樹',
  '悠斗', '奏太', '凌', '朝陽', '晴', '樹', '龍之介', '康介', '亮', '圭佑',
  '俊介', '達也', '秀一', '大地', '優', '柊', '湊', '岳', '剛', '修平',
  '孝太', '忠', '友哉', '旭', '響', '礼', '渉', '匠', '智也', '雅人',
];

/** 地域名字を使う比率（設計書：70% 地元特有 / 30% 全国共通） */
export const REGIONAL_SURNAME_RATIO = 0.7;

export function pickSurname(prefecture: string, rng: Rng): string {
  const region = PREFECTURE_REGION[prefecture];
  if (region && rng.chance(REGIONAL_SURNAME_RATIO)) return rng.pick(REGIONAL_SURNAMES[region]);
  return rng.pick(COMMON_SURNAMES);
}

export function fullName(n: PlayerName): string {
  return `${n.family}${n.given}`;
}

/**
 * 同一校内で同姓同名にならない名前を生成する。
 * `taken` に「姓+名」を登録しながら使う。
 */
export function generateUniqueName(prefecture: string, taken: Set<string>, rng: Rng): PlayerName {
  for (let i = 0; i < 200; i++) {
    const name: PlayerName = { family: pickSurname(prefecture, rng), given: rng.pick(GIVEN_NAMES) };
    const key = fullName(name);
    if (!taken.has(key)) {
      taken.add(key);
      return name;
    }
  }
  // 極めて稀なフォールバック（辞書を使い切った場合）
  const name: PlayerName = { family: rng.pick(COMMON_SURNAMES), given: `${rng.pick(GIVEN_NAMES)}${taken.size}` };
  taken.add(fullName(name));
  return name;
}

/**
 * スコアボード表示用の識別名。同姓がいる場合「宮本健」のように名の頭1文字を付ける。
 */
export function scoreboardNames(roster: readonly PlayerName[]): string[] {
  const familyCount = new Map<string, number>();
  for (const n of roster) familyCount.set(n.family, (familyCount.get(n.family) ?? 0) + 1);
  return roster.map((n) => ((familyCount.get(n.family) ?? 0) > 1 ? `${n.family}${n.given[0]}` : n.family));
}
