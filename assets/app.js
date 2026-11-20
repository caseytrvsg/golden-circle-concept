/* Golden Circle — ordering front-end (menu, basket, checkout, hours). */
(function () {
  "use strict";

  /* ---------------- Settings (edit these) ---------------- */
  const CONFIG = {
    phone: "01235 510615",
    collectionMins: 20,
    deliveryMins: 45,
    deliveryFee: 2.5,          // placeholder — confirm with the restaurant
    deliveryMin: 0,            // minimum order for delivery (0 = none) — placeholder
    freeDeliveryOver: 15,      // free delivery once the basket reaches this amount
    deliveryAreas: ["OX11", "OX10", "OX12", "OX13", "OX14"], // placeholder delivery postcodes
    slotStep: 15,
    // Opening hours by weekday (0 = Sunday). [openMinutes, closeMinutes] or null when closed.
    hours: { 0: [1020, 1320], 1: null, 2: [1020, 1320], 3: [1020, 1320], 4: [1020, 1320], 5: [1020, 1320], 6: [1020, 1320] },
  };
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const TILE_IMAGES = {
    "starters": "1534422298391-e4f8c172dddb",
    "noodles": "1585032226651-759b368d7246",
    "sweet-sour": "1623689046286-01d812cc8bad",
    "soups": "1582878826629-29b7ad1cdc43",
    "chicken": "1525755662778-989d0524087e",
    "curry": "1617093727343-374698b1b08d",
    "vegetable": "1564834724105-918b73d1b9e0",
  };
  const TILE_ORDER = ["starters", "noodles", "sweet-sour", "soups", "chicken", "curry", "vegetable", "duck"];
  const CHILLI = '<span class="chilli" title="Spicy" aria-label="Spicy"><svg viewBox="0 0 24 24"><path d="M14.5 3.2c-.4-.9-1.6-1-2.1-.1-.3.5-.2 1.1.2 1.5.5.5.6 1.1.4 1.6-2.6.4-4.5 2.7-5 5.5-.6 3.4-2.3 5.6-4.9 7-.7.4-.5 1.4.2 1.6 6.5 1.6 13.3-1.2 15.4-7.7.8-2.5.2-5-1.6-6.6.3-1.2-.4-2.4-1.6-2.8z"/></svg></span>';

  /* ---------------- Helpers ---------------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => "£" + (Math.round(n * 100) / 100).toFixed(2);
  const fmtTime = (mins) => {
    const h = Math.floor(mins / 60), m = mins % 60, ap = h >= 12 ? "pm" : "am", hh = ((h + 11) % 12) + 1;
    return hh + (m ? ":" + String(m).padStart(2, "0") : "") + ap;
  };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };

  const MENU = window.MENU || { categories: [], popular: [] };
  const ITEMS = {};
  MENU.categories.forEach((c) => c.items.forEach((it) => { ITEMS[it.id] = Object.assign({ cat: c }, it); }));

  /* ---------------- State ---------------- */
  const state = {
    mode: store.get("gc_mode", "collection"),
    cart: store.get("gc_cart_v1", []),
  };
  const save = () => { store.set("gc_cart_v1", state.cart); store.set("gc_mode", state.mode); };

  /* ---------------- Opening hours (UK time) ---------------- */
  function londonNow() {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t).value;
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
    return { day, mins: parseInt(get("hour"), 10) * 60 + parseInt(get("minute"), 10) };
  }
  function openStatus() {
    const now = londonNow(), today = CONFIG.hours[now.day];
    if (today && now.mins >= today[0] && now.mins < today[1]) {
      return { open: true, text: "Open now · until " + fmtTime(today[1]), now };
    }
    for (let i = 0; i < 8; i++) {
      const d = (now.day + i) % 7, h = CONFIG.hours[d];
      if (!h) continue;
      if (i === 0 && now.mins >= h[0]) continue;
      const when = i === 0 ? "today" : i === 1 ? "tomorrow" : DAYS[d];
      return { open: false, text: "Closed · opens " + when + " at " + fmtTime(h[0]), now };
    }
    return { open: false, text: "Closed", now };
  }
  function renderHours() {
    const st = openStatus();
    const pill = $("#statusPill");
    pill.classList.toggle("is-open", st.open);
    pill.classList.toggle("is-closed", !st.open);
    $("span", pill).textContent = st.text;
    const note = st.open
      ? "We're open — ordering takes about two minutes."
      : st.text + ". You can pre-order now for later.";
    $("#heroHoursNote").textContent = note;
    $("#menuHoursNote").textContent = st.text + " · Collection from 4 The Croft, Didcot";

    const order = [1, 2, 3, 4, 5, 6, 0];
    $("#hoursTable").innerHTML = order.map((d) => {
      const h = CONFIG.hours[d];
      return '<tr class="' + (d === st.now.day ? "is-today" : "") + '"><td>' + DAYS[d] + "</td><td>" + (h ? fmtTime(h[0]) + " – " + fmtTime(h[1]) : "Closed") + "</td></tr>";
    }).join("");
  }

  function timeSlots() {
    const now = londonNow(), slots = [];
    for (let i = 0; i < 4 && slots.length < 80; i++) {
      const d = (now.day + i) % 7, h = CONFIG.hours[d];
      if (!h) continue;
      const lead = state.mode === "delivery" ? CONFIG.deliveryMins : CONFIG.collectionMins;
      let start = h[0] + (state.mode === "delivery" ? 30 : 15);
      if (i === 0) start = Math.max(start, Math.ceil((now.mins + lead) / CONFIG.slotStep) * CONFIG.slotStep);
      const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : DAYS[d];
      for (let t = start; t <= h[1]; t += CONFIG.slotStep) slots.push({ value: label + " " + fmtTime(t), label: label + " · " + fmtTime(t) });
    }
    return slots;
  }

  /* ---------------- Home ---------------- */
  function renderHome() {
    const bySlug = {};
    MENU.categories.forEach((c) => (bySlug[c.slug] = c));
    const tiles = TILE_ORDER.map((slug) => {
      const c = bySlug[slug];
      if (!c) return "";
      const img = TILE_IMAGES[slug];
      return '<a class="tile' + (img ? "" : " tile--plain") + '" href="#/menu/' + slug + '">' +
        (img ? '<img src="https://images.unsplash.com/photo-' + img + '?auto=format&fit=crop&w=900&q=70" alt="" loading="lazy">' : "") +
        '<span class="tile__zh" lang="zh">' + esc(c.zh) + "</span>" +
        "<span><strong>" + esc(c.name) + "</strong><small>" + c.items.length + " dishes</small></span></a>";
    }).join("");
    $("#catTiles").innerHTML = tiles +
      '<a class="tile tile--plain" href="#/menu"><span class="tile__zh" lang="zh">全</span><span><strong>Everything</strong><small>All ' + MENU.categories.length + " categories →</small></span></a>";

    $("#popularGrid").innerHTML = MENU.popular.map((id, i) => {
      const it = ITEMS[id];
      if (!it) return "";
      return '<article class="pcard">' +
        '<span class="pcard__rank">' + String(i + 1).padStart(2, "0") + "</span>" +
        '<span class="pcard__name">' + esc(it.name) + (it.spicy ? " " + CHILLI : "") + "</span>" +
        '<span class="pcard__cat">' + esc(it.cat.name) + "</span>" +
        '<div class="pcard__foot"><span class="price">' + money(it.price) + "</span>" +
        '<button class="addbtn" type="button" data-add="' + id + '" aria-label="Add ' + esc(it.name) + '">+</button></div></article>';
    }).join("");
  }

  /* ---------------- Menu ---------------- */
  function itemRow(it) {
    const size = it.mods.find((m) => m.name === "Size");
    const up = size && size.choices.find((c) => c.price > 0);
    const sub = up ? "<small>" + esc(up.name) + " +" + money(up.price) + "</small>" : "";
    return '<button type="button" class="mitem" data-open="' + it.id + '">' +
      '<span class="mitem__no">' + it.no + "</span>" +
      '<span class="mitem__main"><span class="mitem__name">' + esc(it.name) + (it.spicy ? CHILLI : "") + "</span>" +
      (it.desc ? '<span class="mitem__desc">' + esc(it.desc) + "</span>" : "") + "</span>" +
      '<span class="mitem__side"><span class="mitem__price">' + money(it.price) + sub + "</span>" +
      '<span class="addbtn" data-add="' + it.id + '" aria-hidden="true">+</span></span></button>';
  }
  const CAT_NOTES = {
    "Egg Dishes": "Omelettes are served with chips.",
    "Sweet & Sour": "Battered and served with sweet & sour sauce.",
    "Duck": "Roast duck, carved and wok-tossed in your choice of sauce.",
    "3 Meats": "Chicken, beef & pork together in one dish.",
  };
  function renderMenu(filter) {
    const q = (filter || "").trim().toLowerCase();
    let html = '<div class="legend"><span>' + CHILLI + " Spicy</span><span>Most mains come in Regular or Large</span><span>Prices include VAT</span></div>";
    let shown = 0;
    MENU.categories.forEach((c) => {
      const items = q ? c.items.filter((it) => (it.name + " " + it.desc + " " + c.name).toLowerCase().includes(q)) : c.items;
      if (!items.length) return;
      shown += items.length;
      html += '<section class="mcat" id="cat-' + c.slug + '" data-slug="' + c.slug + '">' +
        '<div class="mcat__head"><h2>' + esc(c.name) + '</h2><span class="mcat__zh" lang="zh">' + esc(c.zh) + '</span><span class="mcat__count">' + items.length + " items</span></div>" +
        (CAT_NOTES[c.name] ? '<p class="mcat__note">' + CAT_NOTES[c.name] + "</p>" : "") +
        '<div class="mlist">' + items.map(itemRow).join("") + "</div></section>";
    });
    if (!shown) html += '<div class="noresults"><p><strong>No dishes match “' + esc(filter) + "”.</strong></p><p>Try “chicken”, “rice” or “satay”.</p></div>";
    $("#menuBody").innerHTML = html;
    $("#catChips").innerHTML = MENU.categories
      .filter((c) => !q || $("#cat-" + c.slug))
      .map((c) => '<button type="button" class="chip" data-chip="' + c.slug + '">' + esc(c.name) + "</button>").join("");
    markInCart();
    spy();
  }
  let observer;
  function spy() {
    if (observer) observer.disconnect();
    if (!("IntersectionObserver" in window)) return;
    observer = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setActiveChip(e.target.dataset.slug); });
    }, { rootMargin: "-45% 0px -50% 0px" });
    $$(".mcat").forEach((s) => observer.observe(s));
  }
  function setActiveChip(slug) {
    $$(".chip").forEach((c) => {
      const on = c.dataset.chip === slug;
      c.classList.toggle("is-active", on);
      if (on) {
        const bar = $("#catChips");
        bar.scrollTo({ left: c.offsetLeft - bar.clientWidth / 2 + c.clientWidth / 2, behavior: "smooth" });
      }
    });
  }
  function scrollToCat(slug) {
    const el = $("#cat-" + slug);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); setActiveChip(slug); }
  }
  function markInCart() {
    const ids = new Set(state.cart.map((l) => l.id));
    $$(".mitem").forEach((b) => b.classList.toggle("in-cart", ids.has(b.dataset.open)));
  }

  /* ---------------- Item modal ---------------- */
  let current = null, qty = 1;
  function openItem(id) {
    const it = ITEMS[id];
    if (!it) return;
    current = it; qty = 1;
    $("#itemCat").innerHTML = '<span lang="zh">' + esc(it.cat.zh) + "</span> · " + esc(it.cat.name) + " · No. " + it.no;
    $("#itemTitle").textContent = it.name;
    $("#itemDesc").textContent = it.desc || "Cooked fresh to order.";
    $("#itemMods").innerHTML = it.mods.map((m, gi) =>
      '<div class="modgroup"><div class="modgroup__title">' + esc(m.name) + "<small>Required</small></div>" +
      m.choices.map((c, ci) =>
        '<label class="opt"><input type="radio" name="mod' + gi + '" value="' + ci + '"' + (ci === 0 ? " checked" : "") + "><span>" + esc(c.name) + "</span><em>" + (c.price ? "+" + money(c.price) : "") + "</em></label>"
      ).join("") + "</div>"
    ).join("") +
      '<label class="field"><span>Special requests <em>(optional)</em></span><textarea id="itemNote" rows="2" placeholder="e.g. no onions, extra spicy"></textarea></label>';
    updateModalPrice();
    showOverlay("#itemOverlay");
  }
  function selectedMods() {
    return current.mods.map((m, gi) => {
      const el = $('#itemMods input[name="mod' + gi + '"]:checked');
      const c = m.choices[el ? +el.value : 0];
      return { group: m.name, name: c.name, price: c.price || 0 };
    });
  }
  function updateModalPrice() {
    if (!current) return;
    const unit = current.price + selectedMods().reduce((s, m) => s + m.price, 0);
    $("#qtyVal").textContent = qty;
    $("#addBtn").textContent = "Add " + qty + " to basket · " + money(unit * qty);
  }

  /* ---------------- Cart ---------------- */
  function addToCart(id, mods, n, note) {
    const it = ITEMS[id];
    const unit = it.price + mods.reduce((s, m) => s + m.price, 0);
    const key = id + "|" + mods.map((m) => m.name).join("|") + "|" + (note || "");
    const line = state.cart.find((l) => l.key === key);
    if (line) line.qty += n;
    else state.cart.push({ key, id, name: it.name, no: it.no, unit, qty: n, mods, note: note || "" });
    save(); renderCart(); markInCart();
    toast("<b>" + esc(it.name) + "</b> added to your basket");
    const b = $("#cartBtn"); b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump");
  }
  function quickAdd(id) {
    const it = ITEMS[id];
    if (!it) return;
    if (it.mods.length) openItem(id);
    else addToCart(id, [], 1, "");
  }
  const subtotal = () => state.cart.reduce((s, l) => s + l.unit * l.qty, 0);
  const count = () => state.cart.reduce((s, l) => s + l.qty, 0);
  function totals() {
    const sub = subtotal();
    const free = sub >= CONFIG.freeDeliveryOver;
    const fee = state.mode === "delivery" && sub > 0 && !free ? CONFIG.deliveryFee : 0;
    const toFree = state.mode === "delivery" && !free ? CONFIG.freeDeliveryOver - sub : 0;
    return { sub, fee, free, toFree, total: sub + fee, short: state.mode === "delivery" ? Math.max(0, CONFIG.deliveryMin - sub) : 0 };
  }
  function renderCart() {
    const t = totals(), n = count();
    const lines = state.cart.length
      ? state.cart.map((l, i) => {
          const mods = l.mods.filter((m) => !(m.group === "Size" && m.name === "Regular")).map((m) => m.name);
          if (l.note) mods.push("“" + l.note + "”");
          return '<div class="cline"><span class="cline__name">' + esc(l.name) + '</span><span class="cline__price">' + money(l.unit * l.qty) + "</span>" +
            (mods.length ? '<span class="cline__mods">' + esc(mods.join(" · ")) + "</span>" : "") +
            '<div class="cline__ctrl"><span class="stepper"><button type="button" data-dec="' + i + '" aria-label="Remove one">−</button><span>' + l.qty + '</span><button type="button" data-inc="' + i + '" aria-label="Add one">+</button></span>' +
            '<button type="button" class="linkbtn" data-del="' + i + '">Remove</button></div></div>';
        }).join("")
      : '<div class="cartempty"><span class="cartempty__ico" lang="zh">空</span>Your basket is empty.<br>Add a few favourites from the menu.</div>';
    $$("[data-cartlist]").forEach((el) => (el.innerHTML = lines));

    const tot = state.cart.length
      ? '<div class="trow"><span>Subtotal</span><span>' + money(t.sub) + "</span></div>" +
        (state.mode === "delivery" ? '<div class="trow"><span>Delivery</span><span>' + (t.fee ? money(t.fee) : '<b class="freetag">FREE</b>') + "</span></div>" : "") +
        '<div class="trow trow--total"><span>Total</span><span>' + money(t.total) + "</span></div>" +
        (t.toFree > 0 ? '<p class="freenote">Add <b>' + money(t.toFree) + "</b> more for <b>free delivery</b>" + '<span class="freebar"><i style="width:' + Math.min(100, (t.sub / CONFIG.freeDeliveryOver) * 100).toFixed(0) + '%"></i></span></p>' : "") +
        (state.mode === "delivery" && t.free ? '<p class="freenote freenote--ok">You’ve unlocked <b>free delivery</b></p>' : "") +
        (t.short > 0 ? '<p class="minnote">Add ' + money(t.short) + " more to reach the " + money(CONFIG.deliveryMin) + " delivery minimum — or switch to collection.</p>" : "")
      : "";
    $$("[data-carttotals]").forEach((el) => {
      const cta = el.hasAttribute("data-nocta") ? "" :
        '<button type="button" class="btn btn--red btn--block" data-checkout' + (!state.cart.length || t.short > 0 ? " disabled" : "") + ">" +
        (state.cart.length ? "Go to checkout · " + money(t.total) : "Checkout") + "</button>";
      el.innerHTML = tot + cta;
    });
    $("#cartCount").textContent = n;
    $("#mobileCount").textContent = n;
    $("#mobileTotal").textContent = money(t.total);
    $("#mobileBar").hidden = !(n && currentView === "menu");
    const placeBtn = $("#placeBtn");
    if (placeBtn) placeBtn.textContent = "Place order · " + money(t.total);
  }

  /* ---------------- Mode ---------------- */
  function setMode(mode) {
    state.mode = mode; save();
    $$("[data-modeswitch] button").forEach((b) => b.classList.toggle("is-on", b.dataset.mode === mode));
    $$("[data-modetag]").forEach((el) => (el.textContent = mode === "delivery" ? "Delivery" : "Collection"));
    $("#addressSet").hidden = mode !== "delivery";
    $("[data-paystep]").textContent = mode === "delivery" ? "5" : "4";
    $("[data-cashword]").textContent = mode === "delivery" ? "delivery" : "collection";
    $("#asapNote").textContent = "Ready in about " + (mode === "delivery" ? CONFIG.deliveryMins + " min, delivered" : CONFIG.collectionMins + " min for collection");
    fillSlots();
    renderCart();
  }
  function fillSlots() {
    const sel = $("#slotSelect"), slots = timeSlots(), st = openStatus();
    sel.innerHTML = slots.map((s) => '<option value="' + esc(s.value) + '">' + esc(s.label) + "</option>").join("") || "<option value=''>No slots available</option>";
    const asap = $('input[name="when"][value="asap"]');
    asap.disabled = !st.open;
    asap.closest(".radio-card").style.opacity = st.open ? "" : ".5";
    if (!st.open) {
      $('input[name="when"][value="later"]').checked = true;
      $("#asapNote").textContent = "Unavailable — we're closed right now";
    }
    $("#slotField").hidden = !$('input[name="when"][value="later"]').checked;
  }

  /* ---------------- Checkout ---------------- */
  function placeOrder(e) {
    e.preventDefault();
    const f = e.target, err = $("#formError");
    const t = totals(), errors = [];
    $$(".field", f).forEach((x) => x.classList.remove("is-invalid"));
    const bad = (name, msg) => { const el = f.elements[name]; if (el) el.closest(".field").classList.add("is-invalid"); errors.push(msg); };
    if (!state.cart.length) errors.push("Your basket is empty.");
    if (!f.elements.name.value.trim()) bad("name", "Please enter your name.");
    if (f.elements.phone.value.replace(/\D/g, "").length < 10) bad("phone", "Please enter a valid phone number.");
    const email = f.elements.email.value.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) bad("email", "Please check your email address.");
    if (state.mode === "delivery") {
      if (!f.elements.address1.value.trim()) bad("address1", "Please enter your delivery address.");
      const pc = f.elements.postcode.value.trim().toUpperCase().replace(/\s+/g, " ");
      if (!/^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/.test(pc)) bad("postcode", "Please enter a full UK postcode.");
      else if (!CONFIG.deliveryAreas.includes(pc.replace(" ", "").slice(0, -3))) bad("postcode", "Sorry, we don't deliver to " + pc + " yet — collection is available.");
      if (t.short > 0) errors.push("Delivery orders need a minimum of " + money(CONFIG.deliveryMin) + ".");
    }
    const later = f.elements.when.value === "later";
    if (later && !f.elements.slot.value) errors.push("Please choose a time slot.");
    if (errors.length) { err.innerHTML = errors.map(esc).join("<br>"); err.hidden = false; err.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    err.hidden = true;

    const order = {
      ref: "GC-" + Math.random().toString(36).slice(2, 6).toUpperCase(),
      mode: state.mode,
      when: later ? f.elements.slot.value : "ASAP (about " + (state.mode === "delivery" ? CONFIG.deliveryMins : CONFIG.collectionMins) + " min)",
      name: f.elements.name.value.trim(),
      total: t.total,
      items: count(),
      pay: f.elements.pay.value,
    };
    store.set("gc_last_order", order);
    state.cart = []; save(); renderCart();
    f.reset(); setMode(state.mode);
    location.hash = "#/confirmed";
  }
  function renderConfirmed() {
    const o = store.get("gc_last_order", null);
    if (!o) { location.hash = "#/"; return; }
    $("#confirmText").textContent = "Thanks " + o.name.split(" ")[0] + "! We've received your order and the kitchen is getting started. " +
      (o.mode === "delivery" ? "We'll bring it straight to your door." : "Come and collect it from 4 The Croft, Didcot.") + " (This is a design concept, so this demo order was not sent to the restaurant.)";
    const rows = [["Order", o.ref], [o.mode === "delivery" ? "Delivery" : "Collection", o.when], ["Items", o.items], ["Total", money(o.total) + (o.pay === "cash" ? " · pay on " + (o.mode === "delivery" ? "delivery" : "collection") : " · card")]];
    $("#confirmMeta").innerHTML = rows.map((r) => "<div><dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd></div>").join("");
  }

  /* ---------------- Overlays & toast ---------------- */
  let lastFocus = null;
  function showOverlay(sel) {
    lastFocus = document.activeElement;
    const o = $(sel); o.hidden = false; document.body.style.overflow = "hidden";
    const focusable = $("button, input, textarea", o); if (focusable) setTimeout(() => focusable.focus(), 30);
  }
  function hideOverlays() {
    $$(".overlay").forEach((o) => (o.hidden = true));
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  let toastTimer;
  function toast(html) {
    const t = $("#toast"); t.innerHTML = html; t.classList.add("is-on");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("is-on"), 2200);
  }

  /* ---------------- Router ---------------- */
  let currentView = "home";
  function route() {
    const parts = (location.hash.replace(/^#\/?/, "") || "home").split("/");
    let view = parts[0] || "home";
    if (!$('[data-view="' + view + '"]')) view = "home";
    if (view === "checkout" && !state.cart.length) { location.hash = "#/menu"; return; }
    const changed = view !== currentView;
    currentView = view;
    hideOverlays();
    $$(".view").forEach((v) => (v.hidden = v.dataset.view !== view));
    $$("[data-route]").forEach((a) => a.classList.toggle("is-active", a.dataset.route === view || (view === "checkout" && a.dataset.route === "menu")));
    if (view === "confirmed") renderConfirmed();
    if (view === "checkout") fillSlots();
    renderCart();
    if (view === "menu" && parts[1]) setTimeout(() => scrollToCat(parts[1]), changed ? 60 : 0);
    else if (changed) window.scrollTo(0, 0);
    document.title = { home: "Golden Circle Chinese Takeaway · Didcot", menu: "Menu & online ordering · Golden Circle Didcot", checkout: "Checkout · Golden Circle", confirmed: "Order received · Golden Circle", contact: "Contact · Golden Circle Didcot", terms: "Terms & conditions · Golden Circle" }[view];
  }

  /* ---------------- Events ---------------- */
  document.addEventListener("click", (e) => {
    const t = e.target;
    const add = t.closest("[data-add]");
    if (add) { e.preventDefault(); e.stopPropagation(); quickAdd(add.dataset.add); return; }
    const open = t.closest("[data-open]");
    if (open) { openItem(open.dataset.open); return; }
    const chip = t.closest("[data-chip]");
    if (chip) { scrollToCat(chip.dataset.chip); return; }
    const mode = t.closest("[data-modeswitch] button");
    if (mode) { setMode(mode.dataset.mode); return; }
    if (t.closest("[data-checkout]")) { location.hash = "#/checkout"; return; }
    const inc = t.closest("[data-inc]"), dec = t.closest("[data-dec]"), del = t.closest("[data-del]");
    if (inc) { state.cart[+inc.dataset.inc].qty++; save(); renderCart(); return; }
    if (dec) { const l = state.cart[+dec.dataset.dec]; l.qty--; if (l.qty < 1) state.cart.splice(+dec.dataset.dec, 1); save(); renderCart(); markInCart(); if (currentView === "checkout" && !state.cart.length) location.hash = "#/menu"; return; }
    if (del) { state.cart.splice(+del.dataset.del, 1); save(); renderCart(); markInCart(); if (currentView === "checkout" && !state.cart.length) location.hash = "#/menu"; return; }
    if (t.closest("[data-close]") || t.classList.contains("overlay")) { hideOverlays(); return; }
  });
  $("#cartBtn").addEventListener("click", () => showOverlay("#cartOverlay"));
  $("#mobileBar").addEventListener("click", () => showOverlay("#cartOverlay"));
  $("#qtyMinus").addEventListener("click", () => { qty = Math.max(1, qty - 1); updateModalPrice(); });
  $("#qtyPlus").addEventListener("click", () => { qty = Math.min(20, qty + 1); updateModalPrice(); });
  $("#itemMods").addEventListener("change", updateModalPrice);
  $("#addBtn").addEventListener("click", () => {
    const note = ($("#itemNote") || {}).value || "";
    addToCart(current.id, selectedMods(), qty, note.trim());
    hideOverlays();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideOverlays(); });
  let searchTimer;
  $("#menuSearch").addEventListener("input", (e) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => renderMenu(e.target.value), 120); });
  $$('input[name="when"]').forEach((r) => r.addEventListener("change", () => ($("#slotField").hidden = !$('input[name="when"][value="later"]').checked)));
  $("#checkoutForm").addEventListener("submit", placeOrder);
  $("#contactForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target; let ok = true;
    ["name", "email", "message"].forEach((n) => { const v = f.elements[n].value.trim(); const bad = !v || (n === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)); f.elements[n].closest(".field").classList.toggle("is-invalid", bad); if (bad) ok = false; });
    if (!ok) return;
    f.reset(); $("#contactOk").hidden = false;
  });
  window.addEventListener("hashchange", route);

  /* ---------------- Boot ---------------- */
  $("#year").textContent = new Date().getFullYear();
  renderHours();
  renderHome();
  renderMenu("");
  setMode(state.mode);
  route();
  setInterval(renderHours, 60000);
})();
