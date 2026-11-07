import { BrowserProvider, Contract } from "ethers";
import {
  CHAIN_ID_HEX, EXPLORER_TX, STAKING_PRECOMPILE, DISTRIBUTION_PRECOMPILE,
  STAKING_ABI, DISTRIBUTION_ABI, GAS_LIMITS, FALLBACK_GAS_PRICE, UNBONDING_DAYS,
  E18, percentOf, delegateMax, format42, weiToDecimalString,
  getReadProvider, fetchValidators, fetchMyState, fetchValidatorCommission,
} from "./chain.js";
import { t, LANG, LOCALE } from "./i18n.js";

function initLangSelector() {
  const sel = document.getElementById("langSel");
  if (!sel) return;
  sel.value = LANG;
  sel.addEventListener("change", () => {
    const v = sel.value === "ja" ? "ja" : "en";
    try { localStorage.setItem("42staking_lang", v); } catch { /* ignore */ }
    location.href = v === "ja" ? "ja.html" : "en.html";
  });
}

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

function parseInputToWei(input) {
  const s = String(input).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(t("errAmountFormat"));
  const [w, f = ""] = s.split(".");
  if (f.length > 18) throw new Error(t("errAmountDecimals"));
  const v = BigInt(w) * E18 + BigInt(f.padEnd(18, "0") || "0");
  if (v <= 0n) throw new Error(t("errAmountPositive"));
  return v;
}
function commissionPct(commissionWei) {
  const pct = Number(BigInt(commissionWei || 0n)) / 1e16;
  return (Math.round(pct * 100) / 100).toString() + "%";
}
function fmtCompact(wei) {
  const n = Number(BigInt(wei || 0n) / E18);
  if (LANG === "ja") {
    if (n >= 1e8) return (n / 1e8).toLocaleString("ja-JP", { maximumFractionDigits: 2 }) + "億";
    if (n >= 1e4) return (n / 1e4).toLocaleString("ja-JP", { maximumFractionDigits: 2 }) + "万";
    return n.toLocaleString("ja-JP");
  }
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
}

// ---- state -------------------------------------------------------------------
let myAddress = null;
let validatorsAll = [];
let validatorsBonded = [];
let validatorsUnbonded = [];
let valByValoper = new Map();
let myState = null;
let myValidator = null; // validator object when connected address is an operator
let myCommissionWei = 0n;
const CLAIM_MIN_WEI = 10n ** 12n; // 0.000001 [42]

// ---- wallet ------------------------------------------------------------------
async function ensureChain(eth) {
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] });
  } catch (e) {
    if (e?.code === 4902 || /not added|unrecognized/i.test(String(e?.message ?? e))) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: CHAIN_ID_HEX,
          chainName: "42 Chain",
          nativeCurrency: { name: "42", symbol: "42", decimals: 18 },
          rpcUrls: ["https://evm-rpc.infinitedrive.xyz"],
          blockExplorerUrls: ["https://scan.infinitedrive.xyz"],
        }],
      });
    } else if (e?.code === 4001) {
      throw e;
    } else {
      // Some wallets return a different code for a missing chain; try add.
      try {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: CHAIN_ID_HEX, chainName: "42 Chain",
            nativeCurrency: { name: "42", symbol: "42", decimals: 18 },
            rpcUrls: ["https://evm-rpc.infinitedrive.xyz"],
            blockExplorerUrls: ["https://scan.infinitedrive.xyz"],
          }],
        });
      } catch { throw new Error(t("switchFailed") + (e?.message ?? e)); }
    }
  }
}

async function connect(btn) {
  const eth = window.ethereum;
  if (!eth) { alert(t("errNoWallet")); return; }
  btn.disabled = true; btn.textContent = t("connecting");
  try {
    const accounts = await eth.request({ method: "eth_requestAccounts" });
    if (!accounts?.length) throw new Error(t("errNoWallet"));
    await ensureChain(eth);
    myAddress = accounts[0];
    $("accountBox").innerHTML = `<div class="addr">${t("connectedAs")}${esc(myAddress)}</div>`;
    $("myPanel").classList.remove("hidden");
    await reloadAll();
  } catch (e) {
    btn.disabled = false; btn.textContent = t("connectBtn");
    alert(t("connectFailed") + (e?.message ?? e));
  }
}

function renderConnectButton() {
  const box = $("accountBox");
  box.innerHTML = "";
  if (!window.ethereum) { $("walletMissing").classList.remove("hidden"); return; }
  $("walletMissing").classList.add("hidden");
  const b = document.createElement("button");
  b.className = "primary";
  b.textContent = t("connectBtn");
  b.addEventListener("click", () => connect(b));
  box.appendChild(b);
}

async function getSigner() {
  const bp = new BrowserProvider(window.ethereum);
  return bp.getSigner();
}
async function stakingSigner() {
  return new Contract(STAKING_PRECOMPILE, STAKING_ABI, await getSigner());
}
async function distSigner() {
  return new Contract(DISTRIBUTION_PRECOMPILE, DISTRIBUTION_ABI, await getSigner());
}
async function liveGasPrice() {
  try {
    const p = await getReadProvider();
    const fd = await p.getFeeData();
    return fd.gasPrice ?? FALLBACK_GAS_PRICE;
  } catch { return FALLBACK_GAS_PRICE; }
}

// ---- loading -------------------------------------------------------------------
function setStatus(id, msg, isErr = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle("err", isErr);
}

async function reloadAll() {
  setStatus("myStatus", t("loading"));
  try {
    const res = await fetchValidators();
    validatorsAll = res.all;
    validatorsBonded = res.bonded;
    validatorsUnbonded = res.unbonded;
    valByValoper = new Map(validatorsAll.map((v) => [v.valoper, v]));
    renderValidators();
    if (myAddress) {
      myState = await fetchMyState(myAddress, validatorsAll);
      myValidator = validatorsAll.find(
        (v) => v.operatorAddress.toLowerCase() === myAddress.toLowerCase()) || null;
      myCommissionWei = myValidator ? await fetchValidatorCommission(myValidator.valoper) : 0n;
      renderMine();
      renderCommission();
    }
    setStatus("myStatus", "");
  } catch (e) {
    setStatus("myStatus", t("readFailed") + (e?.message ?? e), true);
  }
}

// ---- rendering -----------------------------------------------------------------
function renderMine() {
  const s = myState;
  $("stAvailable").textContent = format42(s.balance) + " 42";
  $("stDelegated").textContent = format42(s.totalDelegated) + " 42";
  $("stRewards").textContent = format42(s.totalRewards) + " 42";
  $("stUnbonding").textContent = s.unbonding.length
    ? `${format42(s.unbondingTotal)} 42 (${s.unbonding.length})` : "0 42";
  const claimable = s.delegations.filter((d) => (d.rewardWei ?? 0n) >= CLAIM_MIN_WEI);
  $("claimAllBtn").disabled = !claimable.length;
  $("claimAllBtn").textContent = t("claimAllBtn");

  const box = $("myDelegations");
  if (!s.delegations.length) {
    box.innerHTML = `<p class="note">${t("noDelegations")}</p>`;
  } else {
    box.innerHTML = s.delegations.map((d) => `
      <div class="deleg">
        <div class="head">
          <b>${esc(d.validator.moniker || t("noName"))}</b>
          <span>${t("delegatedLine", format42(d.amountWei), format42(d.rewardWei ?? 0n))}</span>
        </div>
        <div class="row">
          <button data-act="more" data-val="${esc(d.validator.valoper)}">${t("actMore")}</button>
          <button data-act="undelegate" data-val="${esc(d.validator.valoper)}">${t("actUndelegate")}</button>
          <button data-act="redelegate" data-val="${esc(d.validator.valoper)}">${t("actRedelegate")}</button>
          <button data-act="withdraw" data-val="${esc(d.validator.valoper)}" ${(d.rewardWei ?? 0n) >= CLAIM_MIN_WEI ? "" : "disabled"}>${t("actWithdraw")}</button>
        </div>
      </div>`).join("");
  }
  const ub = $("myUnbonding");
  if (s.unbonding.length) {
    const nowSec = Math.floor(Date.now() / 1000);
    ub.innerHTML = `<h3 style="margin:14px 0 6px;font-size:15px;">${t("unbondingTitle", UNBONDING_DAYS)}</h3>` +
      s.unbonding.map((u) => {
        const dateStr = new Date(u.completionTime * 1000).toLocaleString(LOCALE);
        const daysLeft = Math.max(0, Math.ceil((u.completionTime - nowSec) / 86400));
        const line = daysLeft > 0
          ? t("unbondingLine", format42(u.balance), dateStr, daysLeft)
          : t("unbondingDone", format42(u.balance), dateStr);
        return `<div class="kv"><span>${esc(u.validator.moniker || t("noName"))}</span><b>${esc(line)}</b></div>`;
      }).join("");
  } else ub.innerHTML = "";
  bindDelegationButtons();
  renderValidators();
}

function renderCommission() {
  const panel = $("commissionPanel");
  if (!myValidator) { panel.classList.add("hidden"); return; }
  panel.classList.remove("hidden");
  $("commissionBody").textContent = t("commissionBody", format42(myCommissionWei));
  $("commissionBtn").disabled = myCommissionWei <= 0n;
}

function renderValidators() {
  const myByVal = new Map((myState?.delegations ?? []).map((d) => [d.validator.valoper, d]));
  const totalBonded = validatorsBonded.reduce((a, v) => a + v.tokens, 0n);
  const sharePct = (v) => totalBonded > 0n
    ? (Math.round(Number(v.tokens * 10000n / totalBonded)) / 100).toString() + "%" : "—";
  const bondedHtml = `
    <table>
      <tr><th>${t("thName")}</th><th>${t("thStatus")}</th><th>${t("thCommission")}</th><th>${t("thTotalStaked")}</th><th>${t("thShare")}</th><th></th></tr>
      ${validatorsBonded.map((v) => {
        const mine = myByVal.get(v.valoper);
        return `<tr>
          <td><b>${esc(v.moniker || t("noName"))}</b>${v.jailed ? '<span class="badge warn">' + t("jailedBadge") + '</span>' : ""}${mine ? `<div class="mine">${t("youLabel")}${format42(mine.amountWei)} 42</div>` : ""}</td>
          <td><span class="badge on">${t("statusBonded")}</span></td>
          <td>${commissionPct(v.commission)}</td>
          <td>${fmtCompact(v.tokens)} 42</td>
          <td>${sharePct(v)}</td>
          <td><button data-act="delegate" data-val="${esc(v.valoper)}" ${myAddress ? "" : "disabled"}>${t("delegateBtn")}</button></td>
        </tr>`;
      }).join("")}
    </table>`;
  const unbondedHtml = validatorsUnbonded.length ? `
    <details style="margin-top:12px;">
      <summary class="note">${t("unbondedTitle")} (${validatorsUnbonded.length})</summary>
      <table>
        <tr><th>${t("thName")}</th><th>${t("thStatus")}</th><th>${t("thCommission")}</th><th>${t("thTotalStaked")}</th></tr>
        ${validatorsUnbonded.map((v) => `<tr>
          <td><b>${esc(v.moniker || t("noName"))}</b></td>
          <td><span class="badge">${t("statusUnbonded")}</span></td>
          <td>${commissionPct(v.commission)}</td>
          <td>${fmtCompact(v.tokens)} 42</td>
        </tr>`).join("")}
      </table>
    </details>` : "";
  $("validatorList").innerHTML = bondedHtml + unbondedHtml;
  document.querySelectorAll('#validatorList [data-act="delegate"]').forEach((b) =>
    b.addEventListener("click", () => openDelegate(b.dataset.val)));
}

function bindDelegationButtons() {
  document.querySelectorAll("#myDelegations [data-act]").forEach((b) => {
    b.addEventListener("click", () => {
      const val = b.dataset.val;
      if (b.dataset.act === "more") openDelegate(val);
      else if (b.dataset.act === "undelegate") openUndelegate(val);
      else if (b.dataset.act === "redelegate") openRedelegate(val);
      else if (b.dataset.act === "withdraw") doWithdrawSingle(val);
    });
  });
}

// ---- modal ---------------------------------------------------------------------
let modalSubmit = null;
function openModal(title, bodyHtml, okLabel, onSubmit) {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = bodyHtml;
  $("modalOk").textContent = okLabel;
  $("modalOk").classList.remove("hidden");
  $("modalOk").disabled = false;
  $("modalCancel").textContent = t("cancel");
  setStatus("modalStatus", "");
  modalSubmit = onSubmit;
  $("modalBack").classList.remove("hidden");
}
function closeModal() { $("modalBack").classList.add("hidden"); modalSubmit = null; }

function amountField(maxWei) {
  return `
    <label>${t("amountLabel")}</label>
    <input class="amount" id="amtInput" inputmode="decimal" placeholder="0.0" />
    <div class="chips">
      ${[25, 50, 75].map((p) => `<button data-pct="${p}">${p}%</button>`).join("")}
      <button data-pct="100">MAX</button>
    </div>
    <div class="kv"><span>${t("maxLabel")}</span><b id="maxValue">${format42(maxWei)} 42</b></div>
    <p class="note">${t("gasNote")}</p>`;
}
function bindChips(getMax) {
  document.querySelectorAll(".chips [data-pct]").forEach((b) =>
    b.addEventListener("click", () => {
      const max = typeof getMax === "function" ? getMax() : getMax;
      const v = percentOf(max, Number(b.dataset.pct));
      $("amtInput").value = weiToDecimalString(v);
    }));
}
function readAmount(maxWei) {
  const v = parseInputToWei($("amtInput").value);
  const max = typeof maxWei === "function" ? maxWei() : maxWei;
  if (v > max) throw new Error(t("errOverMax"));
  return v;
}

async function openDelegate(valoper) {
  const v = valByValoper.get(valoper);
  if (!v || !myState) return;
  const gasPrice = await liveGasPrice();
  const max = delegateMax(myState.balance, gasPrice);
  openModal(t("titleDelegate"), `
    <div class="kv"><span>${t("kvDelegateTo")}</span><b>${esc(v.moniker || "")}</b></div>
    <div class="kv"><span>${t("kvCommission")}</span><b>${commissionPct(v.commission)}</b></div>
    ${amountField(max)}
    <p class="note">${t("delegateNote", UNBONDING_DAYS)}</p>
  `, t("confirmInWallet"), async () => {
    const amt = readAmount(max);
    const c = await stakingSigner();
    const tx = await c.delegate(myAddress, valoper, amt, { gasLimit: GAS_LIMITS.delegate });
    await tx.wait();
    return tx.hash;
  });
  bindChips(max);
}

function openUndelegate(valoper) {
  const d = myState.delegations.find((x) => x.validator.valoper === valoper);
  if (!d) return;
  const max = d.amountWei;
  openModal(t("titleUndelegate"), `
    <div class="kv"><span>${t("kvUndelegateFrom")}</span><b>${esc(d.validator.moniker || "")}</b></div>
    ${amountField(max)}
    <p class="note">${t("undelegateNote", UNBONDING_DAYS)}</p>
  `, t("confirmInWallet"), async () => {
    const amt = readAmount(max);
    const c = await stakingSigner();
    const tx = await c.undelegate(myAddress, valoper, amt, { gasLimit: GAS_LIMITS.undelegate });
    await tx.wait();
    return tx.hash;
  });
  bindChips(max);
}

function openRedelegate(srcValoper) {
  const d = myState.delegations.find((x) => x.validator.valoper === srcValoper);
  if (!d) return;
  const max = d.amountWei;
  const targets = validatorsBonded.filter((v) => v.valoper !== srcValoper);
  openModal(t("titleRedelegate"), `
    <div class="kv"><span>${t("kvMoveFrom")}</span><b>${esc(d.validator.moniker || "")}</b></div>
    <label>${t("moveToLabel")}</label>
    <select class="target" id="dstSelect">
      ${targets.map((v) => `<option value="${esc(v.valoper)}">${esc(v.moniker || t("noName"))}${t("optionCommission", commissionPct(v.commission))}</option>`).join("")}
    </select>
    ${amountField(max)}
    <p class="note">${t("redelegateNote")}</p>
  `, t("confirmInWallet"), async () => {
    const amt = readAmount(max);
    const dst = $("dstSelect").value;
    const c = await stakingSigner();
    const tx = await c.redelegate(myAddress, srcValoper, dst, amt, { gasLimit: GAS_LIMITS.redelegate });
    await tx.wait();
    return tx.hash;
  });
  bindChips(max);
}

function doWithdrawSingle(valoper) {
  const v = valByValoper.get(valoper);
  openModal(t("titleWithdraw"), `
    <p>${esc(v?.moniker || valoper)}</p>
    <p class="note">${t("gasNote")}</p>
  `, t("confirmInWallet"), async () => {
    const c = await distSigner();
    const tx = await c.withdrawDelegatorRewards(myAddress, valoper, { gasLimit: GAS_LIMITS.claim });
    await tx.wait();
    return tx.hash;
  });
}

async function doClaimAll() {
  if (!myState) return;
  const targets = myState.delegations.filter((d) => (d.rewardWei ?? 0n) >= CLAIM_MIN_WEI);
  if (!targets.length) return;
  const btn = $("claimAllBtn");
  btn.disabled = true;
  let done = 0;
  try {
    const c = await distSigner();
    for (const d of targets) {
      setStatus("myStatus", t("claimProgress", done, targets.length));
      const tx = await c.withdrawDelegatorRewards(myAddress, d.validator.valoper, { gasLimit: GAS_LIMITS.claim });
      await tx.wait();
      done++;
    }
    setStatus("myStatus", t("claimDone", done, targets.length));
  } catch (e) {
    setStatus("myStatus", t("claimStopped", done, targets.length) + " " + (e?.message ?? e), true);
  } finally {
    btn.disabled = false;
    // Refresh balances/rewards without wiping the result message afterwards.
    const msg = $("myStatus").textContent;
    await reloadAll();
    if (msg) setStatus("myStatus", msg, $("myStatus").classList.contains("err"));
  }
}

function doClaimCommission() {
  if (!myValidator) return;
  openModal(t("titleCommission"), `
    <p>${t("commissionBody", format42(myCommissionWei))}</p>
    <p class="note">${t("gasNote")}</p>
  `, t("confirmInWallet"), async () => {
    const c = await distSigner();
    const tx = await c.withdrawValidatorCommission(myValidator.valoper, { gasLimit: GAS_LIMITS.commission });
    await tx.wait();
    return tx.hash;
  });
}

// ---- wiring ----------------------------------------------------------------------
$("reloadBtn").addEventListener("click", reloadAll);
$("claimAllBtn").addEventListener("click", doClaimAll);
$("commissionBtn").addEventListener("click", doClaimCommission);
$("modalCancel").addEventListener("click", closeModal);
$("modalOk").addEventListener("click", async () => {
  if (!modalSubmit) return;
  const ok = $("modalOk");
  ok.disabled = true;
  setStatus("modalStatus", t("approveInWallet"));
  try {
    const hash = await modalSubmit();
    setStatus("modalStatus", "");
    $("modalBody").innerHTML = `
      <p>${t("doneMsg")}</p>
      <p class="addr">${t("txLabel")}<a href="${EXPLORER_TX}${esc(hash)}" target="_blank" rel="noreferrer">${esc(hash)}</a></p>`;
    ok.classList.add("hidden");
    $("modalCancel").textContent = t("close");
    await reloadAll();
  } catch (e) {
    const msg = String(e?.message ?? e);
    setStatus("modalStatus", /rejected|denied|user rejected/i.test(msg)
      ? t("cancelledInWallet") : t("failedPrefix") + msg, true);
  } finally {
    ok.disabled = false;
  }
});
window.addEventListener("load", () => {
  initLangSelector();
  renderConnectButton();
  reloadAll().catch(() => {});
  if (window.ethereum) {
    window.ethereum.on?.("accountsChanged", () => location.reload());
    window.ethereum.on?.("chainChanged", () => location.reload());
  }
});
