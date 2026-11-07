// 42 Chain connection, precompile ABIs, bech32 and amount helpers.
// All chain facts below were probed live on 2026-11-07 (see README).
import { JsonRpcProvider, Contract } from "ethers";

export const CHAIN_ID = 421018;
// 421018 decimal = 0x66c9a (verified: (421018).toString(16) === "66c9a").
export const CHAIN_ID_HEX = "0x66c9a";
export const COSMOS_CHAIN_ID = "infinite_421018-1";
export const EXPLORER = "https://scan.infinitedrive.xyz";
export const EXPLORER_TX = EXPLORER + "/tx/";

export const RPC_URLS = [
  "https://evm-rpc.infinitedrive.xyz",
  "https://evm-rpc-infinite.mschihuahua.org",
  "https://evm-rpc.infinitepanda.xyz",
];

export const STAKING_PRECOMPILE = "0x0000000000000000000000000000000000000800";
export const DISTRIBUTION_PRECOMPILE = "0x0000000000000000000000000000000000000801";

export const PAGE_REQUEST = { key: "0x", offset: 0, limit: 100, countTotal: true, reverse: false };

export const STAKING_ABI = [
  "function validators(string status, tuple(bytes key, uint64 offset, uint64 limit, bool countTotal, bool reverse) pageRequest) view returns (tuple(string operatorAddress, string consensusPubkey, bool jailed, uint8 status, uint256 tokens, uint256 delegatorShares, tuple(string moniker, string identity, string website, string securityContact, string details) description, int64 unbondingHeight, int64 unbondingTime, uint256 commission, uint256 minSelfDelegation)[] validators, tuple(bytes nextKey, uint64 total) pageResponse)",
  "function delegation(address delegatorAddress, string validatorAddress) view returns (uint256 shares, tuple(string denom, uint256 amount) balance)",
  "function unbondingDelegation(address delegatorAddress, string validatorAddress) view returns (tuple(string delegatorAddress, string validatorAddress, tuple(int64 creationHeight, int64 completionTime, uint256 initialBalance, uint256 balance, uint64 unbondingId, bool unbondingOnHold)[] entries) unbondingDelegation)",
  "function delegate(address delegatorAddress, string validatorAddress, uint256 amount) returns (bool success)",
  "function undelegate(address delegatorAddress, string validatorAddress, uint256 amount) returns (int64 completionTime)",
  "function redelegate(address delegatorAddress, string validatorSrcAddress, string validatorDstAddress, uint256 amount) returns (int64 completionTime)",
];

export const DISTRIBUTION_ABI = [
  "function delegationTotalRewards(address delegatorAddress) view returns (tuple(string validatorAddress, tuple(string denom, uint256 amount)[] reward)[] rewards)",
  "function delegationRewards(address delegatorAddress, string validatorAddress) view returns (tuple(string denom, uint256 amount)[] rewards)",
  "function validatorCommission(string validatorAddress) view returns (tuple(string denom, uint256 amount)[] commission)",
  "function validatorOutstandingRewards(string validatorAddress) view returns (tuple(string denom, uint256 amount)[] rewards)",
  "function withdrawDelegatorRewards(address delegatorAddress, string validatorAddress) returns (tuple(string denom, uint256 amount)[] amount)",
  "function withdrawValidatorCommission(string validatorAddress) returns (tuple(string denom, uint256 amount)[] amount)",
];

export const GAS_LIMITS = {
  delegate: 250000n,
  undelegate: 250000n,
  redelegate: 300000n,
  claim: 150000n,
  commission: 150000n,
};
// Fallback gas price measured live 2026-11-07 (eth_gasPrice).
export const FALLBACK_GAS_PRICE = 5625000000n;
export const UNBONDING_DAYS = 21;

// ---- bech32 (BIP-173, encode only) ------------------------------------------
const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
function bech32Polymod(values) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= GEN[i];
  }
  return chk;
}
function bech32HrpExpand(hrp) {
  const out = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}
function convertBits(data, from, to, pad) {
  let acc = 0, bits = 0;
  const out = [];
  const maxv = (1 << to) - 1;
  for (const value of data) {
    acc = (acc << from) | value;
    bits += from;
    while (bits >= to) { bits -= to; out.push((acc >> bits) & maxv); }
  }
  if (pad) { if (bits) out.push((acc << (to - bits)) & maxv); }
  else if (bits >= from || ((acc << (to - bits)) & maxv)) throw new Error("invalid padding");
  return out;
}
export function bech32Encode(hrp, bytes) {
  const data = convertBits(Array.from(bytes), 8, 5, true);
  const values = [...bech32HrpExpand(hrp), ...data];
  const polymod = bech32Polymod([...values, 0, 0, 0, 0, 0, 0]) ^ 1;
  let out = hrp + "1";
  for (const d of data) out += BECH32_CHARSET[d];
  for (let i = 0; i < 6; i++) out += BECH32_CHARSET[(polymod >> (5 * (5 - i))) & 31];
  return out;
}
export function hexToBytes(hex) {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}
export function valoperFromHex(operatorHex) {
  if (!operatorHex || !operatorHex.startsWith("0x")) return operatorHex;
  return bech32Encode("infinitevaloper", hexToBytes(operatorHex));
}
export function accountBech32FromHex(addrHex) {
  if (!addrHex || !addrHex.startsWith("0x")) return addrHex;
  return bech32Encode("infinite", hexToBytes(addrHex));
}

// ---- amount helpers (pure, unit-tested) --------------------------------------
export const E18 = 10n ** 18n;
export function percentOf(maxWei, pct) {
  return (BigInt(maxWei) * BigInt(pct)) / 100n;
}
// Delegate MAX = balance - reserve; reserve = 300000 gas * gasPrice * 1.5.
export function gasReserve(gasPriceWei) {
  return (300000n * BigInt(gasPriceWei) * 3n) / 2n;
}
export function delegateMax(balanceWei, gasPriceWei) {
  const bal = BigInt(balanceWei);
  const reserve = gasReserve(gasPriceWei);
  return bal > reserve ? bal - reserve : 0n;
}
export function format42(wei, maxDp = 4) {
  let v = BigInt(wei || 0n);
  const neg = v < 0n; if (neg) v = -v;
  const whole = v / E18;
  const frac = (v % E18).toString().padStart(18, "0").slice(0, maxDp).replace(/0+$/, "");
  return (neg ? "-" : "") + whole.toLocaleString("en-US") + (frac ? "." + frac : "");
}
export function weiToDecimalString(v) {
  v = BigInt(v);
  const whole = v / E18;
  const frac = (v % E18).toString().padStart(18, "0").replace(/0+$/, "");
  return whole.toString() + (frac ? "." + frac : "");
}
export function parse42ToWei(input) {
  const s = String(input).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("invalid amount format");
  const [w, f = ""] = s.split(".");
  if (f.length > 18) throw new Error("too many decimals");
  const v = BigInt(w) * E18 + BigInt((f.padEnd(18, "0") || "0"));
  return v;
}
// Distribution amounts: the raw integer IS the amount in wei (drop).
// Live-verified 2026-11-07: delegationTotalRewards and delegationRewards
// for the same pair returned the identical raw 401139878041663617428,
// which format42() renders as 401.139… [42]. validatorCommission raw
// 44612281593929121404 renders as 44.61… [42] on the same scale.
export function totalRewardRawToWei(raw) { return BigInt(raw); }
export function decRewardRawToWei(raw) { return BigInt(raw); }

// ---- read provider with RPC rotation ----------------------------------------
let cachedProvider = null;
let cachedStaking = null;
let cachedDist = null;
export async function getReadProvider() {
  if (cachedProvider) {
    try { await cachedProvider.getBlockNumber(); return cachedProvider; }
    catch { cachedProvider = null; cachedStaking = null; cachedDist = null; }
  }
  let lastErr = null;
  for (const url of RPC_URLS) {
    try {
      const p = new JsonRpcProvider(url, CHAIN_ID);
      await p.getBlockNumber();
      cachedProvider = p;
      return p;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("all RPCs unreachable");
}
export async function getStakingRead() {
  const p = await getReadProvider();
  if (!cachedStaking) cachedStaking = new Contract(STAKING_PRECOMPILE, STAKING_ABI, p);
  return cachedStaking;
}
export async function getDistRead() {
  const p = await getReadProvider();
  if (!cachedDist) cachedDist = new Contract(DISTRIBUTION_PRECOMPILE, DISTRIBUTION_ABI, p);
  return cachedDist;
}

export async function fetchValidators() {
  const c = await getStakingRead();
  const fetchStatus = async (status) => {
    const [list] = await c.validators(status, PAGE_REQUEST);
    return list.map((v) => {
      const operator = v.operatorAddress ?? v[0];
      const desc = v.description ?? v[6];
      return {
        operatorAddress: operator,
        valoper: operator && operator.startsWith("0x") ? valoperFromHex(operator) : operator,
        moniker: desc?.moniker ?? desc?.[0] ?? "",
        jailed: Boolean(v.jailed ?? v[2]),
        status: Number(v.status ?? v[3]),
        tokens: BigInt(v.tokens ?? v[4] ?? 0n),
        delegatorShares: v.delegatorShares ?? v[5],
        commission: BigInt(v.commission ?? v[9] ?? 0n),
        website: desc?.website ?? desc?.[2] ?? "",
        details: desc?.details ?? desc?.[4] ?? "",
      };
    });
  };
  const all = await fetchStatus("");
  const bonded = all.filter((v) => v.status === 3 && !v.jailed)
    .sort((a, b) => (b.tokens > a.tokens ? 1 : b.tokens < a.tokens ? -1 : 0));
  const unbonded = all.filter((v) => !(v.status === 3 && !v.jailed));
  return { all, bonded, unbonded };
}

export async function fetchDelegation(delegator, valoper) {
  const c = await getStakingRead();
  try {
    const res = await c.delegation(delegator, valoper);
    const balance = res.balance ?? res[1];
    const amount = balance?.amount ?? balance?.[1] ?? 0n;
    return BigInt(amount);
  } catch { return 0n; }
}

export async function fetchUnbonding(delegator, valoper) {
  const c = await getStakingRead();
  try {
    const res = await c.unbondingDelegation(delegator, valoper);
    const ub = res.unbondingDelegation ?? res;
    const entries = ub.entries ?? ub[2] ?? [];
    return Array.from(entries).map((e) => ({
      creationHeight: Number(e.creationHeight ?? e[0] ?? 0),
      completionTime: Number(e.completionTime ?? e[1] ?? 0),
      initialBalance: BigInt(e.initialBalance ?? e[2] ?? 0n),
      balance: BigInt(e.balance ?? e[3] ?? 0n),
      unbondingId: (e.unbondingId ?? e[4] ?? 0).toString(),
    }));
  } catch { return []; }
}

export async function fetchTotalRewards(delegator) {
  const c = await getDistRead();
  try {
    const res = await c.delegationTotalRewards(delegator);
    const list = res.rewards ?? res;
    const out = new Map();
    for (const item of Array.from(list)) {
      const valoper = item.validatorAddress ?? item[0];
      const rewards = item.reward ?? item[1] ?? [];
      let sum = 0n;
      for (const r of Array.from(rewards)) {
        const denom = r.denom ?? r[0];
        const amount = r.amount ?? r[1] ?? 0n;
        if (denom === "drop") sum += totalRewardRawToWei(amount);
      }
      out.set(valoper, sum);
    }
    return out;
  } catch { return new Map(); }
}

export async function fetchDelegationRewards(delegator, valoper) {
  const c = await getDistRead();
  try {
    const res = await c.delegationRewards(delegator, valoper);
    const list = res.rewards ?? res;
    let sum = 0n;
    for (const r of Array.from(list)) {
      const denom = r.denom ?? r[0];
      const amount = r.amount ?? r[1] ?? 0n;
      if (denom === "drop") sum += decRewardRawToWei(amount);
    }
    return sum;
  } catch { return 0n; }
}

export async function fetchValidatorCommission(valoper) {
  const c = await getDistRead();
  try {
    const res = await c.validatorCommission(valoper);
    const list = res.commission ?? res;
    let sum = 0n;
    for (const r of Array.from(list)) {
      const denom = r.denom ?? r[0];
      const amount = r.amount ?? r[1] ?? 0n;
      if (denom === "drop") sum += decRewardRawToWei(amount);
    }
    return sum;
  } catch { return 0n; }
}

export async function fetchMyState(address, validatorsAll) {
  const provider = await getReadProvider();
  const balance = await provider.getBalance(address);
  const delegations = [];
  const unbonding = [];
  // No list methods exist on this chain: scan every validator (25 calls,
  // in parallel batches).
  const scanned = await Promise.all(validatorsAll.map(async (v) => {
    const [amt, ubEntries] = await Promise.all([
      fetchDelegation(address, v.valoper),
      fetchUnbonding(address, v.valoper),
    ]);
    return { v, amt, ubEntries };
  }));
  for (const { v, amt, ubEntries } of scanned) {
    if (amt > 0n) delegations.push({ validator: v, amountWei: amt });
    for (const e of ubEntries) unbonding.push({ validator: v, ...e });
  }
  const rewardsByValoper = await fetchTotalRewards(address);
  let totalDelegated = 0n, totalRewards = 0n;
  for (const d of delegations) {
    totalDelegated += d.amountWei;
    // Prefer per-validator delegationRewards (Dec scale) when the total
    // map has no entry; otherwise use the total map (already wei-scale).
    let rew = rewardsByValoper.get(d.validator.valoper);
    if (rew === undefined) rew = await fetchDelegationRewards(address, d.validator.valoper);
    d.rewardWei = rew;
    totalRewards += rew;
  }
  let unbondingTotal = 0n;
  for (const u of unbonding) unbondingTotal += u.balance;
  return { balance, delegations, unbonding, totalDelegated, totalRewards, unbondingTotal, rewardsByValoper };
}
