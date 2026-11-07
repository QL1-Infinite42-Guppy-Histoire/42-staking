// Live read smoke test using the site's own chain module (same ABIs).
import {
  fetchValidators, fetchDelegation, fetchTotalRewards, fetchMyState, format42,
} from "../src/chain.js";

const LUKE = "0x65b18070198Ef86DF379dd695AC8Cb350Cd2d03F";
const LUKE_VALOPER = "infinitevaloper1vkccquqe3muxmumem4544jxtx5xd95pl34rsp5";

const { all, bonded, unbonded } = await fetchValidators();
console.log(`validators: all=${all.length} bonded=${bonded.length} unbonded=${unbonded.length}`);
if (bonded.length !== 23) throw new Error(`expected 23 bonded, got ${bonded.length}`);
console.log("bonded top3:", bonded.slice(0, 3).map((v) => `${v.moniker} ${format42(v.tokens)}`).join(" | "));
console.log("unbonded:", unbonded.map((v) => v.moniker).join(", "));

const lukeVal = all.find((v) => v.valoper === LUKE_VALOPER);
if (!lukeVal) throw new Error("Luke validator not found via valoper conversion");
console.log("Luke valoper conversion in list: OK", lukeVal.moniker, lukeVal.operatorAddress);

const del = await fetchDelegation(LUKE, LUKE_VALOPER);
console.log(`Luke delegation to own validator: ${format42(del)} [42] (raw ${del})`);
const delNum = Number(del) / 1e18;
if (Math.abs(delNum - 10868) > 50) throw new Error(`Luke delegation drift too large: ${delNum}`);

const rewards = await fetchTotalRewards(LUKE);
const lukeRew = rewards.get(LUKE_VALOPER) ?? 0n;
console.log(`Luke total rewards (own validator): ${format42(lukeRew)} [42]`);
if (!(Number(lukeRew) / 1e18 > 400)) throw new Error(`Luke rewards too low: ${format42(lukeRew)}`);

const state = await fetchMyState(LUKE, all);
console.log(`Luke scan: delegations=${state.delegations.length} unbondingEntries=${state.unbonding.length} totalDelegated=${format42(state.totalDelegated)} totalRewards=${format42(state.totalRewards)}`);
if (state.unbonding.length !== 0) throw new Error(`expected 0 unbonding entries for Luke, got ${state.unbonding.length}`);
console.log("LIVE SMOKE PASSED");
