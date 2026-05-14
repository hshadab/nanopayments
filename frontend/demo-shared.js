(function (ns) {

  ns.sleep = function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  };

  ns.setProgress = function setProgress(pct) {
    document.getElementById("progress-bar").style.width = pct + "%";
  };

  ns.demoFetch = async function demoFetch(path, body) {
    const opts = body
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : { method: (path.includes("proof-status") || path.includes("wallet-info")) ? "GET" : "POST" };
    const res = await fetch(path, opts);
    return res.json();
  };

  const JSON_TOKEN_RE = /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

  ns.highlightJson = function highlightJson(obj, classMap) {
    const json = JSON.stringify(obj, null, 2);
    return json.replace(JSON_TOKEN_RE, function (match) {
      let cls = classMap.num;
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? classMap.key : classMap.str;
      } else if (/true|false/.test(match)) {
        cls = classMap.bool;
      } else if (/null/.test(match)) {
        cls = classMap.nul;
      }
      return '<span class="' + cls + '">' + match + '</span>';
    });
  };

  ns.animateCounter = function animateCounter(el, target, duration) {
    if (duration === undefined) duration = 600;
    const startTime = performance.now();
    function tick(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      el.textContent = Math.round(target * progress);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  };

  ns.createWalletTracker = function createWalletTracker(opts) {
    const balanceEl = document.getElementById(opts.balanceId);
    const spentEl = document.getElementById(opts.spentId);
    const blockedEl = document.getElementById(opts.blockedId);
    const flashTarget = opts.flashTargetId ? document.getElementById(opts.flashTargetId) : null;

    const state = { spent: 0, blocked: 0 };

    async function fetchWalletInfo() {
      const info = await ns.demoFetch("/demo/wallet-info");
      if (info.ok && balanceEl) {
        balanceEl.textContent = info.gateway.available;
      }
      return info;
    }

    return {
      state,

      async init() {
        try {
          const info = await fetchWalletInfo();
          if (info.ok && opts.onInit) opts.onInit(info);
        } catch { /* server not ready yet */ }
      },

      async refreshBalance() {
        try { await fetchWalletInfo(); } catch { /* ignore */ }
      },

      addSpent(usdc) {
        state.spent += usdc;
        spentEl.textContent = "$" + state.spent.toFixed(3);
        spentEl.classList.remove("flash");
        void spentEl.offsetWidth;
        spentEl.classList.add("flash");
        this.refreshBalance();
      },

      addBlocked(usdc) {
        state.blocked += usdc;
        blockedEl.textContent = "$" + state.blocked.toFixed(3);
        if (flashTarget) {
          flashTarget.classList.remove("blocked");
          void flashTarget.offsetWidth;
          flashTarget.classList.add("blocked");
        }
      },

      reset() {
        state.spent = 0;
        state.blocked = 0;
        spentEl.textContent = "$0.000";
        blockedEl.textContent = "$0.000";
        this.init();
      },
    };
  };

  // Cumulative set of rule numbers that have fired during the current demo run.
  // Persists across scenes; reset by resetFiredRules() at the top of runDemo.
  ns._firedRules = new Set();
  ns._firedTotal = 9;

  function updateFiredCounter() {
    const el = document.getElementById("rules-fired-counter");
    if (!el) return;
    const n = ns._firedRules.size;
    el.textContent = `${n}/${ns._firedTotal} fired`;
    el.classList.toggle("has-fired", n > 0);
  }

  ns.highlightRules = function highlightRules(rules, mode, selector, baseClass) {
    rules.forEach(r => {
      const el = document.querySelector(`${selector}[data-rule="${r}"]`);
      if (el) {
        // Re-trigger CSS animation by clearing the className first, forcing
        // a reflow, then applying the active class.
        el.className = baseClass;
        void el.offsetWidth;
        el.className = `${baseClass} ${mode}`;
      }
      if (typeof r === "number") ns._firedRules.add(r);
    });
    updateFiredCounter();
  };

  ns.clearRuleHighlights = function clearRuleHighlights(selector, baseClass) {
    document.querySelectorAll(selector).forEach(el => {
      el.className = baseClass;
    });
  };

  ns.resetFiredRules = function resetFiredRules() {
    ns._firedRules.clear();
    updateFiredCounter();
  };

  // Maps the free-text `detail` field returned by Preflight checkIt onto
  // the structured rule IDs in PAYMENT_POLICY_RULES (1..9).
  ns.parseViolatedRules = function parseViolatedRules(reason, isBlocked, hint) {
    const violated = new Set();
    const text = (reason || "").toLowerCase();

    // If the server provided an explicit numeric hint (violated_rule), trust it.
    if (typeof hint === "number" && hint >= 1 && hint <= 9) {
      violated.add(hint);
    }

    // Text heuristics. Order doesn't matter — keep them broad and fall through.
    if (/amount|exceeds?|limit|0\.05|over the cap/.test(text)) violated.add(1);
    if (/recipient|vendor|registry|allowlist|approved/.test(text)) violated.add(2);
    if (/daily|aggregate|1\.00|day/.test(text)) violated.add(3);
    if (/urgenc|urgent|hurry|deadline|seconds/.test(text)) violated.add(4);
    if (/emotion|appeal|please|begging/.test(text)) violated.add(5);
    if (/authority|cfo|ceo|treasury|operations team/.test(text)) violated.add(6);
    if (/override|ignore|previous|system note|rule 1-9|disregard/.test(text)) violated.add(7);
    if (/negative|below zero/.test(text)) violated.add(8);
    if (/service|category|data api|weather|market|risk/.test(text)) {
      // Only fire R9 when the text talks about category violation, not just mentioning weather.
      if (/category|service|not.*api|mismatch|social media|engagement/.test(text)) {
        violated.add(9);
      }
    }
    if (/social media|engagement boost/.test(text)) violated.add(9);

    // Fallback: if blocked but we couldn't parse anything, light a sensible default.
    if (violated.size === 0 && isBlocked) {
      [1, 4, 7].forEach(r => violated.add(r));
    }
    return Array.from(violated).sort((a, b) => a - b);
  };

  // Human-readable descriptions for each policy rule.
  ns.RULE_DESCRIPTIONS = {
    1: "Amount exceeds 0.05 USDC per-transaction cap",
    2: "Recipient not in approved vendor registry",
    3: "Daily aggregate transfers exceed 1.00 USDC",
    4: "Urgency tactic detected in action description",
    5: "Emotional appeal detected in action description",
    6: "False authority claim detected in action description",
    7: "Override / ignore-rules attempt detected",
    8: "Transfer amount is negative",
    9: "Service category outside approved data-API set",
  };

  ns.RULE_KINDS = {
    1: "numeric", 2: "numeric", 3: "numeric", 4: "semantic",
    5: "semantic", 6: "semantic", 7: "semantic", 8: "numeric", 9: "semantic",
  };

  ns.truncAddr = function truncAddr(addr) {
    if (!addr || addr.length < 12) return addr || "?";
    return addr.slice(0, 6) + "..." + addr.slice(-4);
  };

})(window.DemoShared = window.DemoShared || {});
