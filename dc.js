/*
 * Mini runtime per i file .dc.html del prototipo "Gestionale Beauty".
 * Legge il template (holes {{ }}, sc-for, sc-if, dc-import), esegue la classe
 * Component (renderVals, setState, componentDidMount) e aggiorna la pagina con morphdom.
 */
(function () {
  'use strict';
  var sources = {};      // nome -> { tpl: DocumentFragment, Comp: class }
  var instances = {};    // chiave -> { comp, name }
  var seen = null;
  var handlers = [];
  var root = null;
  var rootName = null;
  var scheduled = false;
  var mountQueue = [];

  function DCLogic() { this.props = {}; this.state = {}; }
  DCLogic.prototype.setState = function (obj, cb) {
    if (typeof obj === 'function') obj = obj(this.state, this.props);
    if (obj && typeof obj === 'object') this.state = Object.assign({}, this.state, obj);
    schedule();
    if (cb) Promise.resolve().then(cb);
  };
  DCLogic.prototype.forceUpdate = function () { schedule(); };
  window.DCLogic = DCLogic;

  function schedule() {
    if (scheduled || !root) return;
    scheduled = true;
    Promise.resolve().then(function () { scheduled = false; render(); });
  }

  // ---------- caricamento dei sorgenti ----------
  function load(name) {
    if (sources[name]) return Promise.resolve(sources[name]);
    return fetch('src/' + name + '.dc.html').then(function (r) { return r.text(); }).then(function (txt) {
      var m = txt.match(/<x-dc>([\s\S]*)<\/x-dc>/);
      var body = m ? m[1] : '';
      body = body.replace(/<helmet>[\s\S]*?<\/helmet>/, '');
      // sc-for / sc-if diventano <template>, così il parser HTML non li sposta fuori dalle tabelle
      body = body.replace(/<sc-for\b/g, '<template data-sc="for"').replace(/<\/sc-for>/g, '</template>')
                 .replace(/<sc-if\b/g, '<template data-sc="if"').replace(/<\/sc-if>/g, '</template>')
                 .replace(/<dc-import\b/g, '<template data-sc="import"').replace(/<\/dc-import>/g, '</template>');
      var t = document.createElement('template');
      t.innerHTML = body;
      var sm = txt.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/);
      var code = sm ? sm[1] : 'class Component extends DCLogic { renderVals() { return {}; } }';
      var Comp = new Function('DCLogic', code + '\n;return Component;')(DCLogic);
      var src = { tpl: t.content, Comp: Comp };
      sources[name] = src;
      // carica in anticipo i figli importati
      var kids = [];
      t.content.querySelectorAll('template').forEach(function (n) { scanImports(n, kids); });
      return Promise.all(kids.map(load)).then(function () { return src; });
    });
  }
  function scanImports(tplEl, out) {
    if (tplEl.getAttribute('data-sc') === 'import') out.push(tplEl.getAttribute('name'));
    tplEl.content.querySelectorAll('template').forEach(function (n) { scanImports(n, out); });
  }

  // ---------- valutazione delle holes ----------
  function look(expr, scope) {
    expr = expr.trim();
    if (expr === 'true') return true;
    if (expr === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
    var v = scope, parts = expr.split('.');
    for (var i = 0; i < parts.length; i++) { if (v == null) return undefined; v = v[parts[i]]; }
    return v;
  }
  function interp(str, scope) {
    var m = str.match(/^\s*\{\{([^}]*)\}\}\s*$/);
    if (m) return look(m[1], scope);
    if (str.indexOf('{{') < 0) return str;
    return str.replace(/\{\{([^}]*)\}\}/g, function (_, e) { var v = look(e, scope); return v == null ? '' : String(v); });
  }

  // ---------- eventi (delegati dalla radice) ----------
  var EVT = {
    onClick: 'click', onInput: 'input', onChange: 'change', onSubmit: 'submit', onKeyDown: 'keydown',
    onKeyUp: 'keyup', onMouseDown: 'mousedown', onMouseMove: 'mousemove', onMouseUp: 'mouseup',
    onMouseLeave: 'mouseleave', onMouseEnter: 'mouseenter', onTouchStart: 'touchstart', onTouchMove: 'touchmove',
    onTouchEnd: 'touchend', onDragStart: 'dragstart', onDragOver: 'dragover', onDragLeave: 'dragleave',
    onDrop: 'drop', onDragEnd: 'dragend', onFocus: 'focusin', onBlur: 'focusout', onDoubleClick: 'dblclick',
    onPointerDown: 'pointerdown', onPointerMove: 'pointermove', onPointerUp: 'pointerup'
  };
  var NOBUBBLE = { mouseleave: 1, mouseenter: 1 };
  function attachRoot(el) {
    Object.keys(EVT).forEach(function (k) {
      var type = EVT[k];
      el.addEventListener(type, function (ev) { dispatch(type, ev); }, { capture: !!NOBUBBLE[type], passive: type.indexOf('touch') === 0 ? false : undefined });
    });
  }
  function wrap(ev, el, stop) {
    return new Proxy(ev, {
      get: function (t, p) {
        if (p === 'currentTarget') return el;
        if (p === 'stopPropagation') return function () { stop.v = true; t.stopPropagation(); };
        if (p === 'nativeEvent') return t;
        var v = t[p];
        return typeof v === 'function' ? v.bind(t) : v;
      }
    });
  }
  function dispatch(type, ev) {
    var attr = 'data-ev-' + type;
    var stop = { v: false };
    if (NOBUBBLE[type]) {
      var t0 = ev.target;
      if (t0 && t0.getAttribute && t0.hasAttribute(attr)) { var f0 = handlers[+t0.getAttribute(attr)]; if (f0) f0(wrap(ev, t0, stop)); }
      return;
    }
    var el = ev.target;
    while (el && el !== root.parentNode) {
      if (el.getAttribute && el.hasAttribute(attr)) {
        var f = handlers[+el.getAttribute(attr)];
        if (f) f(wrap(ev, el, stop));
        if (stop.v) break;
      }
      el = el.parentNode;
    }
  }

  // ---------- render ----------
  var BOOL = { disabled: 1, checked: 1, selected: 1, readonly: 1, required: 1, hidden: 1, multiple: 1, autofocus: 1, open: 1, novalidate: 1 };
  var SVGNS = 'http://www.w3.org/2000/svg';
  function camel(s) { return s.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); }); }

  function renderComp(name, props, key, parent) {
    var src = sources[name];
    var inst = instances[key];
    if (!inst || inst.name !== name) {
      var comp = new src.Comp();
      comp.props = props || {};
      comp.state = comp.state || {};
      inst = instances[key] = { comp: comp, name: name };
      mountQueue.push(comp);
    } else {
      inst.comp.props = props || {};
    }
    seen[key] = true;
    var vals = {};
    try { vals = inst.comp.renderVals() || {}; } catch (e) { console.error(name + '.renderVals()', e); }
    var counter = { n: 0 };
    src.tpl.childNodes.forEach(function (ch) { expand(ch, vals, parent, key, counter); });
  }

  function expand(node, scope, parent, key, counter) {
    if (node.nodeType === 3) { parent.appendChild(document.createTextNode(interp(node.textContent, scope))); return; }
    if (node.nodeType !== 1) return;
    var tag = node.localName;
    if (tag === 'template') {
      var kind = node.getAttribute('data-sc');
      if (kind === 'for') {
        var list = interp(node.getAttribute('list') || '', scope) || [];
        var as = node.getAttribute('as') || 'item';
        for (var i = 0; i < list.length; i++) {
          var sc = Object.create(scope); sc[as] = list[i]; sc.$index = i;
          node.content.childNodes.forEach(function (ch) { expand(ch, sc, parent, key, counter); });
        }
      } else if (kind === 'if') {
        if (interp(node.getAttribute('value') || '', scope)) node.content.childNodes.forEach(function (ch) { expand(ch, scope, parent, key, counter); });
      } else if (kind === 'import') {
        var props = {}, nm = node.getAttribute('name');
        for (var a = 0; a < node.attributes.length; a++) {
          var at = node.attributes[a];
          if (at.name === 'name' || at.name === 'data-sc' || at.name.indexOf('hint-') === 0) continue;
          props[camel(at.name)] = interp(at.value, scope);
        }
        renderComp(nm, props, key + '/' + nm + '#' + (counter.n++), parent);
      }
      return;
    }
    var isSvg = tag === 'svg' || parent.namespaceURI === SVGNS;
    var el = isSvg ? document.createElementNS(SVGNS, node.tagName === 'svg' ? 'svg' : node.localName) : document.createElement(tag);
    for (var j = 0; j < node.attributes.length; j++) {
      var att = node.attributes[j], n = att.name;
      var v = interp(att.value, scope);
      var m = n.match(/^on([a-z]+)$/i);
      if (m) {
        // l'attributo arriva in minuscolo dal parser: ritrova il nome React
        var react = Object.keys(EVT).filter(function (k) { return k.toLowerCase() === n.toLowerCase(); })[0];
        if (react && typeof v === 'function') {
          var id = handlers.push(v) - 1;
          el.setAttribute('data-ev-' + EVT[react], id);
          // onChange sui campi di testo: React lo chiama a ogni carattere
          if (react === 'onChange' && (tag === 'textarea' || (tag === 'input' && !/checkbox|radio|range/.test(node.getAttribute('type') || '')))) el.setAttribute('data-ev-input', id);
          if (react === 'onChange' && tag === 'input' && (node.getAttribute('type') || '') === 'range') el.setAttribute('data-ev-input', id);
        }
        continue;
      }
      if (BOOL[n]) { if (v === true || v === '' || (v && v !== 'false')) el.setAttribute(n, ''); continue; }
      if (v === undefined || v === null || v === false) continue;
      if (typeof v === 'function' || typeof v === 'object') continue;
      try { el.setAttribute(n, String(v)); } catch (e) {}
    }
    if (tag === 'textarea') {
      var tv = node.getAttribute('value');
      if (tv != null) { el.textContent = String(interp(tv, scope) ?? ''); el.removeAttribute('value'); }
    }
    var kids = tag === 'template' ? [] : node.childNodes;
    kids.forEach(function (ch) { expand(ch, scope, el, key, counter); });
    if (tag === 'select') {
      var sv = node.getAttribute('value');
      if (sv != null) el.setAttribute('data-value', interp(sv, scope));
    }
    parent.appendChild(el);
  }

  function render() {
    handlers = [];
    seen = {};
    var frag = document.createElement('div');
    frag.id = root.id;
    frag.className = root.className;
    renderComp(rootName, window.DC_PROPS || {}, 'root', frag);
    morphdom(root, frag, {
      onBeforeElUpdated: function (from, to) {
        if ((from.tagName === 'INPUT' || from.tagName === 'TEXTAREA') && !to.hasAttribute('value') && from.type !== 'checkbox' && from.type !== 'radio') {
          to.value = from.value;
        }
        if (from.tagName === 'INPUT' && to.hasAttribute('value')) { var nv = to.getAttribute('value'); if (from.value !== nv) from.value = nv; }
        return true;
      }
    });
    // smonta i componenti spariti
    Object.keys(instances).forEach(function (k) {
      if (!seen[k]) { var c = instances[k].comp; delete instances[k]; try { c.componentWillUnmount && c.componentWillUnmount(); } catch (e) {} }
    });
    var q = mountQueue; mountQueue = [];
    q.forEach(function (c) { try { c.componentDidMount && c.componentDidMount(); } catch (e) { console.error(e); } });
  }

  window.DC = {
    mount: function (name, el) {
      root = el; rootName = name;
      attachRoot(el);
      load(name).then(render);
    }
  };
})();
