# 42 ステーキング（42 Chain）

42 Chain のバリデーターに、EVM ウォレットで 42 を**直接ステーキング**するための静的サイト。流動性ステーキング（st42）ではありません。QOM ステーキングサイト（QL1）と姉妹サイトです。

## 言語（English / 日本語）
- ルート（`index.html`）は言語ゲート：保存済みの選択（localStorage `42staking_lang`）が
  「ja」のときだけ日本語ページへ、それ以外は **英語がデフォルト**。
- 日本語ページ：`ja.html` ／ 英語ページ：`en.html`。両ページともヘッダー右上に
  言語セレクタがあり、切り替えると選択が保存される。
- QOM ステーキングサイトと同じ方式。文言は `src/i18n.js` の文字列テーブルに集約。

**公開サイト:** https://ql1-infinite42-guppy-histoire.github.io/42-staking/ （入口＝言語ゲート）
- 日本語: https://ql1-infinite42-guppy-histoire.github.io/42-staking/ja.html
- English: https://ql1-infinite42-guppy-histoire.github.io/42-staking/en.html

## 対応ウォレット
- **EVM ウォレット全般**（`window.ethereum`）：MetaMask、FoxWallet（EVM モード）、
  GuppyWallet ブラウザ拡張機能など。42 Chain（チェーンID 421018）へ自動で
  切り替え／追加を提案します（chainId は 16 進で `0x66c9a`）。

## できること
- 残高・ステーキング中・たまった報酬・解除手続き中の一覧
- バリデーター一覧（稼働中 23 件、手数料率・預かり合計・シェアつき）＋停止中 2 件（ステーキングボタンなし）
- ステーキングする／増やす／解除する（21日で戻る）／別のバリデーターへ移す／報酬を受け取る（全部まとめても可：1件につき1取引）
- バリデーター本人向け：コミッションの表示と受け取り
- 金額入力に 25% / 50% / 75% / MAX チップ（ステーキング MAX はガス代の予備
  ＝ 300,000 ガス × 現在のガス単価 × 1.5 を差し引いた額）

## 技術メモ（検証済み 2026-11-07）
- 読み取りは EVM RPC（`evm-rpc.infinitedrive.xyz` 主系＋2 系統へ自動切替、
  CORS 可）経由のプリコンパイル呼び出しのみ。ウォレット未接続でも
  バリデーター一覧は表示されます。
- ステーキング・プリコンパイル `0x0000…0800`：
  `validators`（稼働中 23 件・全員手数料 10% を実測）、`delegation`
  （フラットな ABI 形式でのみ復号可）、`unbondingDelegation`、
  書き込みは `delegate` / `undelegate` / `redelegate`
  （セレクタはエクスプローラ上の実取引サンプルで確認）。
- 配布プリコンパイル `0x0000…0801`：`delegationTotalRewards` /
  `delegationRewards` / `validatorCommission` の金額は raw 整数がそのまま
  wei（drop）単位（同一ペアで両メソッドが同値を返すことを実測）。
  報酬の受け取りは `withdrawDelegatorRewards(address,string)`
  （サンプル 294 件中 292 件がこの方式）、コミッションは
  `withdrawValidatorCommission(string)`。`claimRewards` は実取引の
  サンプルが無いため使っていません。
- バリデーターのアドレスは 0x 形式で返るため、`infinitevaloper` 接頭辞の
  bech32 へ変換して使います（既知ペアで単体テスト済み）。

## 正直な制限
- このチェーンにはステーキング一覧の取得メソッドが無いため、接続した人のステーキング状況は
  **全 25 バリデーターへの個別確認**（25 回の読み取り）で調べています。
- 「報酬を全部受け取る」は仕組み上、バリデーターごとに 1 件ずつ取引が
  必要です。途中でキャンセルすると、完了した件数を表示して止まります。
- 解除手続き中エントリの解釈は ABI に基づきます。空の場合（エントリなし）
  はチェーン上で検証済みですが、実エントリでの表示は未検証です。
- **実際の送金（ステーキングなど）はまだテストしていません。** 初回のステーキングは
  少額から試してください。

## 開発
```sh
npm install
npm run build        # docs/ に静的ファイルを出力（GitHub Pages が /docs を配信）
node test/unit.mjs   # bech32 / %チップ / MAX の単体テスト
node test/live-smoke.mjs  # ライブ読み取りスモークテスト
```

---

## English summary

A static site for **directly** staking 42 with 42 Chain validators with any
EVM wallet (MetaMask, FoxWallet in EVM mode, the GuppyWallet extension, …).
This is direct staking — not liquid staking (st42). Sister site to the
QOM staking site for QL1.

- **Language**: the root page is a language gate — English by default, Japanese
  (`ja.html`) only when that choice was saved (`42staking_lang` in localStorage).
  All UI strings live in the table in `src/i18n.js`.
- **Wallets**: `window.ethereum` only. The site proposes switching/adding
  42 Chain (EVM chain ID 421018 = `0x66c9a`).
- **Features**: balances / staking positions / pending rewards / unbonding list,
  validator list (23 bonded with commission, total stake and share; 2 unbonded
  shown greyed with no stake button), stake / add / unstake
  (21-day unbonding) / move to another validator / claim rewards (claim-all = one tx per
  validator, with progress), validator commission card for operators,
  25/50/75/MAX amount chips (stake MAX subtracts a gas reserve of
  300,000 gas × live gas price × 1.5).
- **Reads**: EVM RPC only (primary `evm-rpc.infinitedrive.xyz` with rotation),
  via the staking precompile `0x0000…0800` and distribution precompile
  `0x0000…0801`. Verified live 2026-11-07: `validators` (23 bonded, all 10%
  commission), flat-ABI `delegation`, `unbondingDelegation`,
  `delegationTotalRewards` / `delegationRewards` / `validatorCommission`
  (raw amounts are wei directly). Claims use `withdrawDelegatorRewards`
  (292 of 294 sampled distribution txs) — not the unsampled `claimRewards`.
- **Honest limits**: there is no staking-list method on this chain, so the
  site scans all 25 validators per account; unbonding-entry parsing is
  ABI-based with the empty case chain-verified; **no real-money send has been
  tested yet** — the first live stake should be a small amount.
- Private keys never leave the wallet; this site only relays signed txs.
