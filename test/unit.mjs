// Unit tests: bech32 Luke pair, percent chips, delegate MAX reserve.
import assert from "node:assert";
import {
  valoperFromHex, bech32Encode, hexToBytes,
  percentOf, delegateMax, gasReserve, format42, parse42ToWei, weiToDecimalString, E18,
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
assert.strictEqual(parse42ToWei("1.5"), 15n * E18 / 10n);
assert.strictEqual(weiToDecimalString(percentOf(delegateMax(bal, gp), 100)), weiToDecimalString(delegateMax(bal, gp)));
console.log("format/parse: OK");
console.log("ALL UNIT TESTS PASSED");
