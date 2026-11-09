# social

freddiefujiwara.com のアクセス解析ページ（https://freddiefujiwara.com/social/）。GA4 の集計を social-gas 経由で表示する自分専用ダッシュボード。

## 画面の内容

- 直近28日の合計（表示回数・ユーザー・セッション）
- 日別の表示回数の推移グラフ
- ページ別 上位10件
- 参照元（チャネル）上位8件

## 認証

他のアプリ（health・asset・tweet）と同じ方式。

- Googleログイン（許可されたアカウント）でデータ表示と一時アクセスリンクの発行ができる
- 一時アクセスリンク（`#share=...`、30日有効）ならログイン不要で開ける。再発行で旧リンクは無効になる
- ログイン保持も asset と同じ方式：Google の ID トークンは localStorage（`ga-google-id-token`）、共有トークンの控えは sessionStorage（`ga-share-token`）に保存し、次回訪問時に復元する。ステージングは同一オリジンのため、キーに `:staging` を付けて本番と混ざらないようにしている
- 認可の判定は social-gas 側で行い、クライアント側に許可メールの判定は持たせない

## 開発とデプロイ

- `npm test`：vitest 単体テスト
- `npm run build`：本番ビルド（dist、ベース /social/、本番 social-gas に接続）
- `npm run build:staging`：ステージングビルド（dist-staging、ベース /social/staging/、VITE_GAS_ENDPOINT で social-gas-staging に接続、VITE_STAGING=1 でバナー表示）
- CI：PR ではステージングへだけデプロイされ単体テスト＋E2E（e2e/staging.check.js、APP=ga）がゲートになる。main へのマージで本番へデプロイ
