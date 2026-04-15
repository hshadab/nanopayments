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

  ns.highlightRules = function highlightRules(rules, mode, selector, baseClass) {
    rules.forEach(r => {
      const el = document.querySelector(`${selector}[data-rule="${r}"]`);
      if (el) el.className = `${baseClass} ${mode}`;
    });
  };

  ns.clearRuleHighlights = function clearRuleHighlights(selector, baseClass) {
    document.querySelectorAll(selector).forEach(el => {
      el.className = baseClass;
    });
  };

  ns.parseViolatedRules = function parseViolatedRules(reason, isBlocked) {
    const violated = [];
    const text = reason || "";
    if (/amount|limit|exceed|0\.05/i.test(text)) violated.push(1);
    if (/urgency|urgent/i.test(text)) violated.push(4);
    if (/override|ignore|previous/i.test(text)) violated.push(7);
    if (violated.length === 0 && isBlocked) violated.push(1, 4, 7);
    return violated;
  };

  ns.truncAddr = function truncAddr(addr) {
    if (!addr || addr.length < 12) return addr || "?";
    return addr.slice(0, 6) + "..." + addr.slice(-4);
  };

})(window.DemoShared = window.DemoShared || {});
