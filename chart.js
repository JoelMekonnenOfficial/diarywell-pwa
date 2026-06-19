/* chart.js — DiaryWell hand-rolled Canvas charts.
   Three drawing functions:
     - DiaryChart.line(canvas, data, opts)         — single-series line with axis
     - DiaryChart.bars(container, items, opts)     — DOM-based horizontal bars (no canvas)
     - DiaryChart.heatmap(canvas, days, opts)      — calendar heatmap, returns {cells} for hit-testing
   All drawing uses devicePixelRatio for crisp lines. No external libs.
*/
(function (global) {
  'use strict';

  function readVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function setupCanvas(canvas, cssW, cssH) {
    var dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  /* ---------- Line chart ---------- */

  function line(canvas, points, opts) {
    opts = opts || {};
    if (!canvas) return;

    var parent = canvas.parentElement;
    var cssW = Math.max(280, parent.clientWidth - 4);
    var cssH = opts.height || 180;
    var ctx = setupCanvas(canvas, cssW, cssH);

    var padL = 28, padR = 10, padT = 10, padB = 26;
    var plotW = cssW - padL - padR;
    var plotH = cssH - padT - padB;

    var stroke = opts.stroke || readVar('--accent', '#7C3AED');
    var fill = opts.fill || hexToRgba(stroke, 0.15);
    var grid = opts.grid || readVar('--border', '#E4E4EE');
    var text = readVar('--text-muted', '#6b7280');
    var bgGap = readVar('--surface-2', '#f1f1f7');

    ctx.clearRect(0, 0, cssW, cssH);

    var min = opts.min != null ? opts.min : 0;
    var max = opts.max != null ? opts.max : 10;

    // Grid lines
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.font = '11px ' + readVar('--font', 'system-ui');
    ctx.fillStyle = text;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    var ticks = opts.yTicks || 4;
    for (var i = 0; i <= ticks; i++) {
      var y = padT + (plotH * i) / ticks;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(cssW - padR, y);
      ctx.stroke();
      var v = max - ((max - min) * i) / ticks;
      ctx.fillText(formatLabel(v, opts.fmt), padL - 4, y);
    }

    if (!points || points.length === 0) {
      ctx.textAlign = 'center';
      ctx.fillStyle = text;
      ctx.fillText('No data yet — your first check-ins will show up here.', cssW / 2, cssH / 2);
      return;
    }

    // X positions
    var n = points.length;
    var xAt = function (i) {
      if (n === 1) return padL + plotW / 2;
      return padL + (plotW * i) / (n - 1);
    };
    var yAt = function (val) {
      if (val == null || isNaN(val)) return null;
      var t = (val - min) / (max - min);
      return padT + plotH - t * plotH;
    };

    // Draw missing-day gaps as light vertical bands
    for (var k = 0; k < n; k++) {
      if (points[k].v == null) {
        ctx.fillStyle = bgGap;
        var x0 = xAt(k) - Math.max(1, plotW / Math.max(n, 1) / 2);
        var x1 = xAt(k) + Math.max(1, plotW / Math.max(n, 1) / 2);
        ctx.globalAlpha = 0.35;
        ctx.fillRect(x0, padT, x1 - x0, plotH);
        ctx.globalAlpha = 1;
      }
    }

    // Build polyline path (skip nulls)
    var segments = [];
    var current = [];
    for (var i2 = 0; i2 < n; i2++) {
      if (points[i2].v == null || isNaN(points[i2].v)) {
        if (current.length) { segments.push(current); current = []; }
      } else {
        current.push({ x: xAt(i2), y: yAt(points[i2].v) });
      }
    }
    if (current.length) segments.push(current);

    // Area fill (under each segment)
    ctx.fillStyle = fill;
    segments.forEach(function (seg) {
      if (seg.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(seg[0].x, padT + plotH);
      seg.forEach(function (p) { ctx.lineTo(p.x, p.y); });
      ctx.lineTo(seg[seg.length - 1].x, padT + plotH);
      ctx.closePath();
      ctx.fill();
    });

    // Stroke line(s)
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    segments.forEach(function (seg) {
      ctx.beginPath();
      seg.forEach(function (p, j) {
        if (j === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    });

    // Dots
    ctx.fillStyle = stroke;
    segments.forEach(function (seg) {
      seg.forEach(function (p) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    // X labels (first / mid / last)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = text;
    var labelsToShow = n <= 7 ? n : 3;
    for (var li = 0; li < labelsToShow; li++) {
      var idx = labelsToShow === 1 ? 0 :
        Math.round((n - 1) * (li / (labelsToShow - 1)));
      ctx.fillText(shortDate(points[idx].date), xAt(idx), padT + plotH + 6);
    }
  }

  function formatLabel(v, fmt) {
    if (fmt === 'int') return Math.round(v).toString();
    return Math.round(v * 10) / 10 + '';
  }

  function shortDate(d) {
    if (!d) return '';
    var parts = String(d).split('-');
    if (parts.length !== 3) return d;
    var mm = parseInt(parts[1], 10), dd = parseInt(parts[2], 10);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[mm - 1] + ' ' + dd;
  }

  function hexToRgba(hex, a) {
    hex = String(hex).trim();
    if (hex.indexOf('#') !== 0) return 'rgba(124,58,237,' + a + ')';
    if (hex.length === 4) hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    var r = parseInt(hex.slice(1,3), 16) || 0;
    var g = parseInt(hex.slice(3,5), 16) || 0;
    var b = parseInt(hex.slice(5,7), 16) || 0;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /* ---------- Horizontal bars (DOM, accessible) ---------- */

  function bars(container, items, opts) {
    opts = opts || {};
    container.innerHTML = '';
    if (!items || items.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = opts.emptyText || 'No data yet.';
      container.appendChild(empty);
      return;
    }
    var max = Math.max.apply(null, items.map(function (i) { return i.value; }));
    if (max <= 0) max = 1;
    items.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'bar-item';
      var label = document.createElement('span');
      label.textContent = item.label;
      var count = document.createElement('span');
      count.className = 'bar-count';
      count.textContent = item.count != null ? item.count : item.value;
      var bar = document.createElement('div');
      bar.className = 'bar-bar';
      var fill = document.createElement('div');
      fill.className = 'bar-fill';
      fill.style.width = Math.round((item.value / max) * 100) + '%';
      if (item.color) fill.style.background = item.color;
      bar.appendChild(fill);
      row.appendChild(label);
      row.appendChild(count);
      row.appendChild(bar);
      container.appendChild(row);
    });
  }

  /* ---------- Calendar heatmap ---------- */
  /* Layout: 12 columns (weeks) by default, 7 rows (Mon..Sun).
     Returns { cells: [{x,y,w,h,date,score}], cellAt(px,py) -> cell } */
  function heatmap(canvas, days, opts) {
    opts = opts || {};
    if (!canvas) return null;

    var weeks = opts.weeks || 12;
    var parent = canvas.parentElement;
    var cssW = Math.max(320, parent.clientWidth - 24);
    var cellGap = 3;
    var labelW = 22;
    var labelH = 14;
    var available = cssW - labelW - 8;
    var cell = Math.max(14, Math.floor((available - cellGap * (weeks - 1)) / weeks));
    var gridH = cell * 7 + cellGap * 6 + labelH + 6;
    var cssH = gridH;
    var ctx = setupCanvas(canvas, cssW, cssH);

    ctx.clearRect(0, 0, cssW, cssH);

    var palette = [
      readVar('--cell-0', '#ECECF3'),
      readVar('--cell-1', '#D7CBF5'),
      readVar('--cell-2', '#B79CEC'),
      readVar('--cell-3', '#946EE0'),
      readVar('--cell-4', '#7245CB'),
      readVar('--cell-5', '#4F2DA1')
    ];
    var emptyColor = readVar('--border', '#E4E4EE');
    var textCol = readVar('--text-muted', '#6b7280');

    // Map date -> entry score (0..10), where higher = tougher day.
    var map = {};
    days.forEach(function (d) {
      map[d.date] = d;
    });

    // Anchor: today on the right column. Compute the date range.
    var today = startOfDay(opts.today || new Date());
    // Find this week's Sunday-ish: we'll align so the rightmost column ends with "today's weekday" filled.
    var totalDays = weeks * 7;
    var firstDate = new Date(today);
    firstDate.setDate(firstDate.getDate() - (totalDays - 1));

    // Draw weekday labels (Mon..Sun) on the left
    ctx.font = '11px ' + readVar('--font', 'system-ui');
    ctx.fillStyle = textCol;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    var dayLabels = ['Mon','','Wed','','Fri','',''];
    for (var r = 0; r < 7; r++) {
      if (dayLabels[r]) {
        var yy = labelH + 6 + r * (cell + cellGap) + cell / 2;
        ctx.fillText(dayLabels[r], labelW - 4, yy);
      }
    }

    // We want column = week index, row = weekday (Mon=0..Sun=6)
    var startX = labelW + 4;
    var startY = labelH + 6;

    var cells = [];
    var monthMarkers = [];

    for (var i = 0; i < totalDays; i++) {
      var d = new Date(firstDate);
      d.setDate(firstDate.getDate() + i);
      var col = Math.floor(i / 7);
      var row = mondayBased(d.getDay());

      // Recompute alignment: each column should be a Mon..Sun week. So find col by alignment of "today" being last.
      // Simpler approach: align by date relative to today, using day-of-week.
      // We'll override col/row using calendar weeks aligned to Monday.
      var diff = Math.floor((startOfDay(d).getTime() - startOfDay(firstDate).getTime()) / 86400000);
      // Use weeks-based row/col with Monday as row 0:
      var firstMon = new Date(firstDate);
      firstMon.setDate(firstMon.getDate() - mondayBased(firstMon.getDay()));
      var diffFromMon = Math.floor((startOfDay(d).getTime() - startOfDay(firstMon).getTime()) / 86400000);
      var col2 = Math.floor(diffFromMon / 7);
      var row2 = mondayBased(d.getDay());

      var x = startX + col2 * (cell + cellGap);
      var y = startY + row2 * (cell + cellGap);

      // Skip cells outside the visible week-range (if alignment overflows)
      if (col2 < 0 || col2 >= weeks + 1) continue;

      var key = isoDate(d);
      var entry = map[key];
      var score = entry ? scoreOf(entry) : null;
      var color;
      if (entry == null) {
        color = palette[0];
      } else {
        // Map 0..10 -> bucket 1..5
        var bucket = Math.min(5, Math.max(1, Math.ceil(score / 2)));
        color = palette[bucket];
      }

      ctx.fillStyle = color;
      ctx.fillRect(x, y, cell, cell);

      // Border for today
      if (sameDay(d, today)) {
        ctx.strokeStyle = readVar('--accent', '#7C3AED');
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
      }

      cells.push({
        date: key,
        x: x, y: y, w: cell, h: cell,
        score: score,
        entry: entry || null,
        col: col2, row: row2
      });

      // Month label on top of column when this is the first day or first of month
      if (d.getDate() === 1) {
        monthMarkers.push({ col: col2, name: monthName(d) });
      }
    }

    // Top month labels
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = textCol;
    monthMarkers.forEach(function (m) {
      var x = startX + m.col * (cell + cellGap);
      ctx.fillText(m.name, x, 0);
    });

    function cellAt(px, py) {
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        if (px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h) return c;
      }
      return null;
    }

    return { cells: cells, cellAt: cellAt, cellSize: cell };
  }

  function scoreOf(e) {
    // Higher = tougher day.
    // mood (1..5) where 5 is best -> contributes (5-mood)*2 -> 0..8
    // pain (0..10) -> direct 0..10
    // We average them; if either missing, use the other.
    var parts = [];
    if (e.mood) parts.push((5 - Math.max(1, Math.min(5, e.mood))) * 2);
    if (e.pain != null) parts.push(Math.max(0, Math.min(10, e.pain)));
    if (parts.length === 0) return 0;
    return parts.reduce(function (a, b) { return a + b; }, 0) / parts.length;
  }

  function startOfDay(d) {
    var x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }
  function isoDate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + dd;
  }
  function sameDay(a, b) { return isoDate(a) === isoDate(b); }
  function mondayBased(jsDay) {
    // JS: 0=Sun,1=Mon..6=Sat. We want Mon=0..Sun=6.
    return (jsDay + 6) % 7;
  }
  function monthName(d) {
    var m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return m[d.getMonth()];
  }

  global.DiaryChart = {
    line: line,
    bars: bars,
    heatmap: heatmap,
    scoreOf: scoreOf,
    isoDate: isoDate
  };
})(window);
