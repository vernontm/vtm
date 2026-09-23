/* ==========================================================================
   Lisa V Green Inspires - prayer guide opt-in
   --------------------------------------------------------------------------
   ONE THING TO SET BEFORE THIS GOES LIVE: CONFIG.endpoint below.
   Everything else works as-is. See README.md for the three wiring options.
   ========================================================================== */

var CONFIG = {
  // Where the subscriber goes. Leave "" and the form runs in demo mode:
  // it validates, shows the real success state, and posts nothing.
  endpoint: "",

  // "mailerlite" posts a MailerLite embedded-form payload.
  // "json" posts {name, email, source} to your own endpoint (VTM eCRM, a
  // serverless function, Zapier catch hook, anything that takes JSON).
  mode: "json",

  // Tags the lead so the welcome sequence knows where it came from.
  source: "prayer-guide-landing",

  // Optional. Send people to a thank-you page instead of the inline success
  // panel, e.g. "/prayer-guide/thank-you". Leave "" to stay on the page.
  redirect: ""
};

(function () {
  "use strict";

  var yr = document.getElementById("year");
  if (yr) yr.textContent = String(new Date().getFullYear());

  function looksLikeEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v.trim());
  }

  function successPanel(name) {
    var who = name ? name.trim().split(/\s+/)[0] : "";
    var el = document.createElement("div");
    el.className = "thanks";
    el.setAttribute("role", "status");
    el.innerHTML =
      "<h3>" + (who ? "It is on its way, " + escapeHtml(who) + "." : "It is on its way.") + "</h3>" +
      "<p>Check your inbox in the next few minutes for <em>When You Do Not Have the Words</em>. " +
      "If it is not there, look in promotions or spam and drag it over so the next one lands right.</p>";
    return el;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function send(name, email) {
    if (!CONFIG.endpoint) {
      // Demo mode: no endpoint wired yet.
      return new Promise(function (res) { setTimeout(res, 550); });
    }

    if (CONFIG.mode === "mailerlite") {
      var fd = new FormData();
      fd.append("fields[name]", name);
      fd.append("fields[email]", email);
      fd.append("ml-submit", "1");
      fd.append("anticsrf", "true");
      return fetch(CONFIG.endpoint, { method: "POST", body: fd });
    }

    return fetch(CONFIG.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name,
        email: email,
        source: CONFIG.source,
        page: location.pathname
      })
    }).then(function (r) {
      if (!r.ok) throw new Error("Request failed with status " + r.status);
      return r;
    });
  }

  function wire(form) {
    var nameEl = form.querySelector('input[name="name"]');
    var mailEl = form.querySelector('input[name="email"]');
    var btn = form.querySelector("button");
    var msg = form.querySelector(".optin__msg");
    var label = btn.textContent;

    function fail(field, text) {
      field.setAttribute("aria-invalid", "true");
      field.focus();
      msg.textContent = text;
      msg.className = "optin__msg optin__msg--err";
    }

    form.addEventListener("input", function (e) {
      e.target.removeAttribute("aria-invalid");
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      msg.textContent = "";
      msg.className = "optin__msg";

      var name = nameEl.value.trim();
      var email = mailEl.value.trim();

      if (name.length < 2) return fail(nameEl, "Please add your first name.");
      if (!looksLikeEmail(email)) return fail(mailEl, "Please check that email address.");

      btn.disabled = true;
      btn.textContent = "Sending…";

      send(name, email)
        .then(function () {
          if (CONFIG.redirect) {
            location.href = CONFIG.redirect;
            return;
          }
          form.replaceWith(successPanel(name));
        })
        .catch(function (err) {
          btn.disabled = false;
          btn.textContent = label;
          msg.textContent = "Something went wrong on our end. Please try again in a moment.";
          msg.className = "optin__msg optin__msg--err";
          if (window.console) console.error("[optin]", err);
        });
    });
  }

  var forms = document.querySelectorAll(".optin");
  for (var i = 0; i < forms.length; i++) wire(forms[i]);
})();
