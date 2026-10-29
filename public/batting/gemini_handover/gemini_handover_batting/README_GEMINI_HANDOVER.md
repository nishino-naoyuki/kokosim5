# Gemini引き継ぎ用 README

## 1. このフォルダに入っているもの
- storyboard_96_v6.txt
  - 全96フレームの設計書（文章）
- pose_data_v6.json
  - 全96フレームのボーン情報（3D/2D座標を含むJSON）
- pose_table_v6.csv
  - 全96フレームの主要パラメータ一覧
- validation_v6.txt
  - 検証メモ
- approved_40F_style_reference.png
  - 40Fの画風・人物・構図の参考画像
- storyboard_sheets/
  - 16コマ×6枚の絵コンテシート
- storyboard_frames_png/
  - 1〜96フレームを1枚ずつ書き出したPNG

## 2. このデータの前提条件
- 打者: 右打者
- 投手方向: 画面右
- 前足: 左足（画面右）
- 軸足: 右足（画面左）
- カメラ: 真横の固定
- バット: 金色の金属バット
- 靴: 黒いスパイク
- 画風参考: approved_40F_style_reference.png

## 3. pose_data_v6.json の構造
トップレベル:
- metadata
- frames: 96件の配列

各 frame 要素の主なキー:
- frame: フレーム番号 (1〜96)
- phase: 動作フェーズ
- body_orientation: right_batter_side_view
- left_is_front: true
- right_is_rear: true
- joints_world: 3D関節座標
- joints_screen_px: 2D投影座標（描画用）
- bat: バット情報
- notes: そのフレームのメモ

joints_world / joints_screen_px の関節名:
head, neck, shoulder_L, shoulder_R, elbow_L, elbow_R, wrist_L, wrist_R, chest, abdomen, pelvis, hip_L, hip_R, knee_L, knee_R, ankle_L, ankle_R, toe_L, toe_R, grip, bat_tip

左右の意味:
- *_L = 左側（右打者の前足側）
- *_R = 右側（右打者の軸足側）

## 4. Geminiへ渡すときの注意
- まず approved_40F_style_reference.png を画風アンカーとして使う
- 次に storyboard_96_v6.txt で全体の流れを理解させる
- そのうえで pose_data_v6.json を使い、各フレームの左右・骨格を守らせる
- 特に 11F, 30F, 40F, 50F, 70F, 82F, 83F, 90F は要重点確認
- 画像生成ではなく、可能ならボーン制御やキーフレーム補間で使う

## 5. 現状の注意点
- storyboard_frames_png は「Geminiに渡すための絵コンテ素材」であり、完成作画ではなくラフ寄り
- 最終作画は Gemini 側でボーンと画風を統一して再生成する想定
