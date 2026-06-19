/* ui.js — DiaryWell small UI helpers.
   Toast, confirm modal, view switching, date utils.
*/
(function (global) {
  'use strict';

  var toastTimer = null;
  function toast(msg, ms) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, ms || 2200);
  }

  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var modal = document.getElementById('confirm');
      var title = document.getElementById('confirmTitle');
      var body = document.getElementById('confirmBody');
      var ok = document.getElementById('confirmOk');
      var cancel = document.getElementById('confirmCancel');
      title.textContent = opts.title || 'Are you sure?';
      body.textContent = opts.body || '';
      ok.textContent = opts.okText || 'Confirm';
      cancel.textContent = opts.cancelText || 'Cancel';
      ok.className = 'btn ' + (opts.okStyle || 'warn');
      modal.hidden = false;

      function cleanup(value) {
        modal.hidden = true;
        ok.removeEventListener('click', onOk);
        cancel.removeEventListener('click', onCancel);
        resolve(value);
      }
      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }
      ok.addEventListener('click', onOk);
      cancel.addEventListener('click', onCancel);
    });
  }

  function isoToday() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function isoFromDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function pad(n) { return String(n).padStart(2, '0'); }

  function parseISO(s) {
    if (!s) return null;
    var p = String(s).split('-');
    if (p.length !== 3) return null;
    var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    return isNaN(d.getTime()) ? null : d;
  }

  function friendlyDate(s) {
    var d = parseISO(s) || new Date();
    var opts = { weekday: 'long', month: 'long', day: 'numeric' };
    try {
      return d.toLocaleDateString(undefined, opts);
    } catch (e) {
      return s;
    }
  }

  function vibrate(pattern) {
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (e) { /* iOS may throw */ }
    }
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function daysAgo(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    return isoFromDate(d);
  }

  function rangeOfDays(n) {
    // Returns an array of ISO date strings ending today, length n.
    var out = [];
    for (var i = n - 1; i >= 0; i--) out.push(daysAgo(i));
    return out;
  }

  global.DiaryUI = {
    toast: toast,
    confirm: confirmDialog,
    isoToday: isoToday,
    isoFromDate: isoFromDate,
    parseISO: parseISO,
    friendlyDate: friendlyDate,
    vibrate: vibrate,
    escapeHtml: escapeHtml,
    rangeOfDays: rangeOfDays,
    daysAgo: daysAgo
  };
})(window);
