// Unit tests: bech32 Luke pair, percent chips, delegate MAX reserve.
import assert from "node:assert";
import {
  valoperFromHex, bech32Encode, hexToBytes,
  percentOf, delegateMax, gasReserve, format42, format42Int, format42Personal, parse42ToWei, weiToDecimalString, E18,
} from "../src/chain.js";

// bech32 known pair (live-verified)
const lukeHex = "0x65b18070198Ef86DF379dd695AC8Cb350Cd2d03F";
const lukeValoper = "infinitevaloper1vkccquqe3muxmumem4544jxtx5xd95pl34rsp5";
assert.strictEqual(valoperFromHex(lukeHex), lukeValoper, "Luke valoper");
assert.strictEqual(valoperFromHex(lukeHex.toLowerCase()), lukeValoper, "Luke valoper lowercase");
// account prefix uses same bytes, different hrp
assert.strictEqual(bech32Encode("infinite", hexToBytes(lukeHex)).startsWith("infinite1vkcc"), true);
console.log("bech32: OK", lukeValoper);

// percent chips
assert.strictEqual(percentOf(1000n * E18, 25), 250n * E18);
assert.strictEqual(percentOf(1000n * E18, 50), 500n * E18);
assert.strictEqual(percentOf(1000n * E18, 75), 750n * E18);
assert.strictEqual(percentOf(1000n * E18, 100), 1000n * E18);
assert.strictEqual(percentOf(1n, 25), 0n); // floor
console.log("percentOf: OK");

// delegate MAX reserve: 300000 * gasPrice * 1.5
const gp = 5625000000n;
assert.strictEqual(gasReserve(gp), (300000n * gp * 3n) / 2n);
assert.strictEqual(gasReserve(gp), 2531250000000000n); // 0.00253125 [42] in wei
const bal = 100n * E18;
assert.strictEqual(delegateMax(bal, gp), bal - 2531250000000000n);
assert.strictEqual(delegateMax(1000n, gp), 0n); // balance below reserve -> 0
assert.strictEqual(delegateMax(0n, gp), 0n);
console.log("delegateMax: OK reserve =", weiToDecimalString(gasReserve(gp)), "42");

// format / parse roundtrip
assert.strictEqual(format42(401139878041663617428n), "401.1398");
assert.strictEqual(format42(10868000000000000000000n), "10,868");
// Integer-only display variant: fraction truncated (floored), never rounded.
const trillionWei = 1000048951521n * E18 + 52n * E18 / 100n; // 1,000,048,951,521.52 [42]
assert.strictEqual(format42Int(trillionWei), "1,000,048,951,521");
assert.strictEqual(format42Int(1999999999999999999n), "1"); // 1.999… -> 1, not 2
assert.strictEqual(format42Int(999999999999999999n), "0"); // 0.999… -> 0
assert.strictEqual(format42Int(-1500000000000000000n), "-1");
// Personal display (2026-11-26): up to 3 decimals, trailing zeros trimmed,
// truncated never rounded; sub-0.001 positives stay visible.
assert.strictEqual(format42Personal(0n), "0");
assert.strictEqual(format42Personal(42n * E18 / 1000n), "0.042");
assert.strictEqual(format42Personal(15n * E18 / 10n), "1.5");
assert.strictEqual(format42Personal(123456n * E18 / 10000n), "12.345"); // 12.3456 -> truncated
assert.strictEqual(format42Personal(4n * E18 / 10000n), "0.0004"); // not crushed to "0"
assert.strictEqual(format42Personal(10850n * E18), "10,850");
assert.strictEqual(format42Personal(-15n * E18 / 10n), "-1.5");
assert.strictEqual(parse42ToWei("1.5"), 15n * E18 / 10n);
assert.strictEqual(weiToDecimalString(percentOf(delegateMax(bal, gp), 100)), weiToDecimalString(delegateMax(bal, gp)));
console.log("format/parse: OK");

// Connect button: always visible (regression guard for the source wiring).
// - rendered immediately + unconditionally, never gated on window.ethereum
// - provider re-acquired at click time; late injection handled
// - no-wallet click shows the guidance card next to the still-visible
//   button instead of an alert that leaves the card hidden forever
import { readFileSync } from "node:fs";
const mainSrc = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
assert.ok(mainSrc.includes("\nrenderConnectButton();\nattachWalletListeners(getProvider());"),
  "connect button rendered immediately, not only on window load");
assert.ok(!/if\s*\(\s*window\.ethereum\s*\)\s*\{?\s*renderConnectButton/.test(mainSrc),
  "connect button render must not be gated on window.ethereum");
assert.ok(mainSrc.includes('window.addEventListener("ethereum#initialized"'),
  "late provider injection (ethereum#initialized) handled");
assert.ok(mainSrc.includes("const eth = getProvider();"),
  "provider re-acquired at click time");
assert.ok(mainSrc.includes("if (!eth) { showNoWalletGuidance(); return; }"),
  "no-wallet click shows guidance, keeps button visible");
assert.ok(mainSrc.includes('el.classList.remove("hidden")'),
  "guidance card is unhidden on no-wallet click");
assert.ok(!mainSrc.includes('alert(t("errNoWallet"))'),
  "no-wallet path must not be alert-only");
console.log("connect-button always-visible: OK");
console.log("ALL UNIT TESTS PASSED");
