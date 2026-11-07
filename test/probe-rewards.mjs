import { JsonRpcProvider, Contract } from "ethers";
const p = new JsonRpcProvider("https://evm-rpc.infinitedrive.xyz", 421018);
console.log("block", await p.getBlockNumber(), "gasPrice", (await p.getFeeData()).gasPrice?.toString());
const DIST="0x0000000000000000000000000000000000000801";
const STAKING="0x0000000000000000000000000000000000000800";
const LUKE="0x65b18070198Ef86DF379dd695AC8Cb350Cd2d03F";
const LUKE_VALOPER="infinitevaloper1vkccquqe3muxmumem4544jxtx5xd95pl34rsp5";
const dist = new Contract(DIST, [
  "function delegationTotalRewards(address) view returns (tuple(string validatorAddress, tuple(string denom, uint256 amount)[] reward)[] rewards)",
  "function delegationRewards(address,string) view returns (tuple(string denom, uint256 amount)[] rewards)",
  "function validatorCommission(string) view returns (tuple(string denom, uint256 amount)[] commission)",
  "function validatorOutstandingRewards(string) view returns (tuple(string denom, uint256 amount)[] rewards)",
], p);
const fmt=(r)=>JSON.stringify(r,(k,v)=>typeof v==="bigint"?v.toString():v);
console.log("totalRewards:", fmt(await dist.delegationTotalRewards(LUKE)));
try{ console.log("delegationRewards:", fmt(await dist.delegationRewards(LUKE, LUKE_VALOPER))); }catch(e){ console.log("delegationRewards ERR", e.message.slice(0,300)); }
try{ console.log("commission:", fmt(await dist.validatorCommission(LUKE_VALOPER))); }catch(e){ console.log("commission ERR", e.message.slice(0,300)); }
try{ console.log("outstanding:", fmt(await dist.validatorOutstandingRewards(LUKE_VALOPER))); }catch(e){ console.log("outstanding ERR", e.message.slice(0,300)); }
const staking = new Contract(STAKING, [
  "function delegation(address,string) view returns (uint256 shares, tuple(string denom, uint256 amount) balance)",
  "function unbondingDelegation(address,string) view returns (tuple(string delegatorAddress, string validatorAddress, tuple(int64 creationHeight, int64 completionTime, uint256 initialBalance, uint256 balance, uint64 unbondingId, bool unbondingOnHold)[] entries) unbondingDelegation)",
], p);
console.log("delegation Luke->Luke:", fmt(await staking.delegation(LUKE, LUKE_VALOPER)));
console.log("unbonding Luke:", fmt(await staking.unbondingDelegation(LUKE, LUKE_VALOPER)));
try{ console.log("delegation nonpair:", fmt(await staking.delegation(LUKE, "infinitevaloper1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq"))); }catch(e){ console.log("delegation nonpair ERR", e.message.slice(0,200)); }
