(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const state = {
    font: null,
    fontName: "",
    fontBuffer: null,
    fontFaceName: "",
    selectedGlyph: null,
    glyphs: [],
    transforms: { scaleX: 100, scaleY: 100, slant: 0, weight: 0 },
    edits: {},
    projectDirty: false,
    fontFace: null,
    dotMode: false
  };

  const els = {
    fontInput: $("fontFileInput"), projectInput: $("projectFileInput"),
    glyphGrid: $("glyphGrid"), glyphSearch: $("glyphSearch"), glyphFilter: $("glyphFilter"),
    glyphCount: $("glyphCount"), fontStatus: $("fontStatus"), selectedTitle: $("selectedGlyphTitle"),
    selectedMeta: $("selectedGlyphMeta"), largeGlyph: $("largeGlyph"), previewSize: $("previewSize"),
    previewSizeValue: $("previewSizeValue"), specimenText: $("specimenText"), specimenPreview: $("specimenPreview"),
    specimenSize: $("specimenSize"), lineHeight: $("lineHeight"), projectFontName: $("projectFontName"),
    projectSelected: $("projectSelected"), projectState: $("projectState"), toast: $("toast"),
    scaleX: $("scaleX"), scaleY: $("scaleY"), slant: $("slant"), weight: $("weight")
  };

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => els.toast.classList.remove("show"), 3200);
  }

  function markDirty() {
    state.projectDirty = true;
    els.projectState.textContent = "未保存の変更";
    els.projectState.style.color = "#f0c77a";
  }

  function safeGlyphName(glyph, index) {
    return glyph && glyph.name ? glyph.name : `glyph-${index}`;
  }

  function getUnicode(glyph) {
    if (!glyph) return null;
    if (glyph.unicode != null) return glyph.unicode;
    if (glyph.unicodes && glyph.unicodes.length) return glyph.unicodes[0];
    return null;
  }

  function glyphChar(glyph) {
    const cp = getUnicode(glyph);
    if (cp == null || cp < 0 || cp > 0x10FFFF) return "□";
    const s = String.fromCodePoint(cp);
    return s.trim() === "" ? "␠" : s;
  }

  function getCategory(cp, char) {
    if (cp == null) return "other";
    if ((cp >= 0x30 && cp <= 0x39) || (cp >= 0x41 && cp <= 0x5A) || (cp >= 0x61 && cp <= 0x7A)) return "latin";
    if ((cp >= 0x3040 && cp <= 0x309F) || (cp >= 0x30A0 && cp <= 0x30FF)) return "kana";
    if (/^[\p{P}\p{S}]$/u.test(char)) return "symbol";
    return "other";
  }

  function makeGlyphList() {
    if (!state.font) return [];
    const list = [];
    const glyphSet = state.font.glyphs;
    for (let i = 0; i < glyphSet.length; i++) {
      const glyph = glyphSet.get(i);
      const cp = getUnicode(glyph);
      const char = glyphChar(glyph);
      list.push({ index: i, name: safeGlyphName(glyph, i), cp, char, category: getCategory(cp, char), advanceWidth: glyph.advanceWidth || 0 });
    }
    return list;
  }

  function renderGlyphGrid() {
    const query = els.glyphSearch.value.trim().toLowerCase();
    const filter = els.glyphFilter.value;
    let visible = state.glyphs.filter(g => {
      if (filter !== "all" && g.category !== filter) return false;
      if (!query) return true;
      return g.char.toLowerCase().includes(query) || g.name.toLowerCase().includes(query) ||
        (g.cp != null && g.cp.toString(16).includes(query.replace(/^u\+?/, "")));
    });

    els.glyphGrid.replaceChildren();
    els.glyphCount.textContent = `${visible.length.toLocaleString()} / ${state.glyphs.length.toLocaleString()} GLYPHS`;
    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = state.font ? "一致する文字がありません。" : "フォントを読み込むとここに文字が表示されます。";
      els.glyphGrid.append(empty);
      return;
    }

    // DOMを巨大化させないため、一覧表示は最大2500グリフに制限。
    const limit = visible.slice(0, 2500);
    const frag = document.createDocumentFragment();
    for (const g of limit) {
      const button = document.createElement("button");
      button.className = "glyph-cell" + (state.selectedGlyph === g.index ? " selected" : "");
      button.type = "button";
      button.title = `${g.name} · ${g.cp == null ? "Unicodeなし" : "U+" + g.cp.toString(16).toUpperCase().padStart(4, "0")}`;
      const char = document.createElement("span");
      char.className = "glyph-char";
      char.textContent = g.char;
      const code = document.createElement("span");
      code.className = "glyph-code";
      code.textContent = g.cp == null ? `#${g.index}` : g.cp.toString(16).toUpperCase().padStart(4, "0");
      button.append(char, code);
      button.addEventListener("click", () => selectGlyph(g.index));
      frag.append(button);
    }
    els.glyphGrid.append(frag);
    if (visible.length > 2500) {
      const note = document.createElement("div");
      note.className = "empty-state";
      note.textContent = `表示負荷を抑えるため先頭2,500件を表示中（全${visible.length.toLocaleString()}件）。検索で絞り込めます。`;
      els.glyphGrid.append(note);
    }
  }

  function getSelectedInfo() {
    return state.glyphs.find(g => g.index === state.selectedGlyph);
  }

  function selectGlyph(index) {
    state.selectedGlyph = index;
    const info = getSelectedInfo();
    if (!info || !state.font) return;
    const glyph = state.font.glyphs.get(index);
    const cpText = info.cp == null ? "Unicode割当なし" : `U+${info.cp.toString(16).toUpperCase().padStart(4, "0")}`;
    els.selectedTitle.textContent = info.char === " " ? "SPACE" : info.char;
    els.selectedMeta.textContent = `${info.name}  ·  ${cpText}  ·  グリフ番号 ${index}  ·  送り幅 ${Math.round(info.advanceWidth)}`;
    els.projectSelected.textContent = info.cp == null ? info.name : `${info.char} (${cpText})`;
    els.resetGlyphBtn.disabled = false;
    renderGlyphGrid();
    renderLargeGlyph(glyph, info);
  }

  function renderLargeGlyph(glyph, info) {
    const char = info ? info.char : "ƒ";
    els.largeGlyph.textContent = char;
    els.largeGlyph.style.fontFamily = state.fontFaceName ? `"${state.fontFaceName}", serif` : "serif";
    applyTransforms();
    els.previewHint.textContent = info ? `${info.name} · ${info.cp == null ? "no Unicode" : "U+" + info.cp.toString(16).toUpperCase()}` : "選択した文字のプレビュー";
  }

  function applyTransforms() {
    const { scaleX, scaleY, slant, weight } = state.transforms;
    els.largeGlyph.style.transform = `scale(${scaleX / 100}, ${scaleY / 100}) skewX(${slant}deg)`;
    els.largeGlyph.style.webkitTextStroke = weight > 0 ? `${weight * 0.35}px currentColor` : "0 transparent";
    els.scaleX.value = scaleX; els.scaleY.value = scaleY; els.slant.value = slant; els.weight.value = weight;
    $("scaleXValue").textContent = `${scaleX}%`;
    $("scaleYValue").textContent = `${scaleY}%`;
    $("slantValue").textContent = `${slant}°`;
    $("weightValue").textContent = `${weight} px`;
    if (state.selectedGlyph != null) {
      state.edits[String(state.selectedGlyph)] = { ...state.transforms, dotMode: state.dotMode };
    }
  }

  function applySavedTransform(index) {
    const saved = state.edits[String(index)];
    state.transforms = saved ? { scaleX: saved.scaleX ?? 100, scaleY: saved.scaleY ?? 100, slant: saved.slant ?? 0, weight: saved.weight ?? 0 } :
      { scaleX: 100, scaleY: 100, slant: 0, weight: 0 };
    state.dotMode = !!(saved && saved.dotMode);
    applyTransforms();
    els.largeGlyph.style.imageRendering = state.dotMode ? "pixelated" : "auto";
    els.largeGlyph.style.textShadow = state.dotMode ? "1px 0 currentColor, -1px 0 currentColor" : "0 0 45px #a58bff17";
  }

  function refreshSelectedGlyph() {
    if (state.selectedGlyph == null || !state.font) return;
    const info = getSelectedInfo();
    if (info) {
      const glyph = state.font.glyphs.get(state.selectedGlyph);
      renderLargeGlyph(glyph, info);
    }
  }

  function updateSpecimen() {
    const text = els.specimenText.value;
    const size = Number(els.specimenSize.value);
    const lineHeight = Number(els.lineHeight.value);
    els.specimenPreview.textContent = text;
    els.specimenPreview.style.fontSize = `${size}px`;
    els.specimenPreview.style.lineHeight = String(lineHeight);
    els.specimenPreview.style.fontFamily = state.fontFaceName ? `"${state.fontFaceName}", serif` : "serif";
    if (!state.font) {
      $("specimenInfo").textContent = "システムの代替フォントで表示中。フォント読み込み後にプレビューを切り替えます。";
      return;
    }
    let missing = 0;
    for (const ch of text) {
      if (ch === "\n" || ch === "\r") continue;
      const cp = ch.codePointAt(0);
      if (state.font.charToGlyphIndex(ch) === 0 && cp !== 0) missing++;
    }
    $("specimenInfo").textContent = missing ? `フォントにグリフがない可能性のある文字：${missing}文字（ブラウザが代替フォントで表示する場合があります）` : "読み込んだフォントを優先して表示しています。";
  }

  async function loadFont(file) {
    if (!file) return;
    if (!window.opentype) {
      toast("フォント解析ライブラリを読み込めません。インターネット接続を確認してください。");
      return;
    }
    try {
      toast("フォントを解析しています…");
      const buffer = await file.arrayBuffer();
      const parsed = opentype.parse(buffer.slice(0));
      state.font = parsed;
      state.fontBuffer = buffer;
      state.fontName = file.name;
      state.glyphs = makeGlyphList();
      state.selectedGlyph = null;
      state.edits = {};
      state.transforms = { scaleX: 100, scaleY: 100, slant: 0, weight: 0 };
      state.dotMode = false;
      state.fontFaceName = `FontLabPreview_${Date.now()}`;
      if (state.fontFace) {
        try { document.fonts.delete(state.fontFace); } catch (_) {}
      }
      const blob = new Blob([buffer], { type: "font/ttf" });
      const url = URL.createObjectURL(blob);
      const face = new FontFace(state.fontFaceName, `url(${url})`);
      await face.load();
      document.fonts.add(face);
      state.fontFace = face;
      // URL can be revoked after FontFace has loaded.
      URL.revokeObjectURL(url);
      els.fontStatus.classList.add("ready");
      els.fontStatus.innerHTML = "<i></i> フォント読込済み";
      els.projectFontName.textContent = file.name;
      $("mapFootnote").textContent = "ファイルはこのブラウザ内で処理";
      renderGlyphGrid();
      const firstMapped = state.glyphs.find(g => g.cp != null);
      if (firstMapped) selectGlyph(firstMapped.index);
      updateSpecimen();
      markDirty();
      toast(`読み込み完了：${file.name}（${state.glyphs.length.toLocaleString()}グリフ）`);
    } catch (err) {
      console.error(err);
      toast("読み込みに失敗しました。対応形式のフォントか確認してください。");
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function projectData() {
    return {
      app: "Font Lab Web",
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      sourceFontName: state.fontName,
      selectedGlyph: state.selectedGlyph,
      transforms: state.transforms,
      dotMode: state.dotMode,
      edits: state.edits,
      specimenText: els.specimenText.value,
      specimenSize: Number(els.specimenSize.value),
      lineHeight: Number(els.lineHeight.value),
      previewSize: Number(els.previewSize.value),
      note: "このJSONは編集設定を保存します。元のフォントデータや再構築済みTTF/OTFは含みません。元フォントを別途保持してください。"
    };
  }

  function saveProject() {
    const data = projectData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const base = (state.fontName || "font-lab-project").replace(/\.[^.]+$/, "").replace(/[^\w\-ぁ-んァ-ヶ一-龠]+/g, "_");
    downloadBlob(blob, `${base || "font-lab"}-project.json`);
    state.projectDirty = false;
    els.projectState.textContent = "保存済み";
    els.projectState.style.color = "#7be0b0";
    toast("編集設定をJSONプロジェクトとして保存しました。");
  }

  async function loadProject(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!data || data.app !== "Font Lab Web" || data.schemaVersion !== 1) {
        throw new Error("Unsupported project");
      }
      state.edits = data.edits && typeof data.edits === "object" ? data.edits : {};
      state.transforms = data.transforms || { scaleX: 100, scaleY: 100, slant: 0, weight: 0 };
      state.dotMode = !!data.dotMode;
      els.specimenText.value = data.specimenText || "";
      els.specimenSize.value = String(data.specimenSize || 36);
      els.lineHeight.value = String(data.lineHeight || 1.5);
      els.previewSize.value = String(data.previewSize || 150);
      els.previewSizeValue.textContent = `${els.previewSize.value} px`;
      if (state.font && data.selectedGlyph != null && state.font.glyphs.get(data.selectedGlyph)) {
        selectGlyph(data.selectedGlyph);
        applySavedTransform(data.selectedGlyph);
      } else {
        applyTransforms();
      }
      updateSpecimen();
      markDirty();
      toast("プロジェクト設定を読み込みました。元フォントが必要な場合は同じフォントを読み込んでください。");
    } catch (err) {
      console.error(err);
      toast("プロジェクトを読み込めません。Font Lab WebのJSONか確認してください。");
    }
  }

  $("openFontBtn").addEventListener("click", () => els.fontInput.click());
  els.fontInput.addEventListener("change", e => loadFont(e.target.files[0]));
  $("saveProjectBtn").addEventListener("click", saveProject);
  $("loadProjectBtn").addEventListener("click", () => els.projectInput.click());
  els.projectInput.addEventListener("change", e => { if (e.target.files[0]) loadProject(e.target.files[0]); e.target.value = ""; });
  els.glyphSearch.addEventListener("input", renderGlyphGrid);
  els.glyphFilter.addEventListener("change", renderGlyphGrid);
  $("refreshGlyphsBtn").addEventListener("click", renderGlyphGrid);
  $("resetGlyphBtn").addEventListener("click", () => {
    if (state.selectedGlyph == null) return;
    delete state.edits[String(state.selectedGlyph)];
    state.transforms = { scaleX: 100, scaleY: 100, slant: 0, weight: 0 };
    state.dotMode = false;
    applyTransforms(); refreshSelectedGlyph(); markDirty(); toast("選択文字のプレビュー変形をリセットしました。");
  });
  $("resetTransformsBtn").addEventListener("click", () => {
    state.transforms = { scaleX: 100, scaleY: 100, slant: 0, weight: 0 };
    state.dotMode = false;
    applyTransforms(); refreshSelectedGlyph(); markDirty();
  });
  $("applyPresetBtn").addEventListener("click", () => {
    state.dotMode = !state.dotMode;
    els.largeGlyph.style.imageRendering = state.dotMode ? "pixelated" : "auto";
    els.largeGlyph.style.textShadow = state.dotMode ? "1px 0 currentColor, -1px 0 currentColor" : "0 0 45px #a58bff17";
    markDirty();
    toast(state.dotMode ? "ドット風プレビューを有効にしました（実際の輪郭変換ではありません）。" : "ドット風プレビューを解除しました。");
    if (state.selectedGlyph != null) state.edits[String(state.selectedGlyph)] = { ...state.transforms, dotMode: state.dotMode };
  });
  for (const [id, key] of [["scaleX","scaleX"],["scaleY","scaleY"],["slant","slant"],["weight","weight"]]) {
    $(id).addEventListener("input", e => {
      state.transforms[key] = Number(e.target.value);
      applyTransforms();
      markDirty();
    });
  }
  els.previewSize.addEventListener("input", () => {
    els.largeGlyph.style.fontSize = `${els.previewSize.value}px`;
    els.previewSizeValue.textContent = `${els.previewSize.value} px`;
    markDirty();
  });
  $("showGuides").addEventListener("change", e => {
    document.querySelector(".large-glyph-wrap").classList.toggle("guides-hidden", !e.target.checked);
  });
  els.specimenText.addEventListener("input", updateSpecimen);
  els.specimenSize.addEventListener("change", updateSpecimen);
  els.lineHeight.addEventListener("change", updateSpecimen);
  window.addEventListener("beforeunload", e => {
    if (state.projectDirty) { e.preventDefault(); e.returnValue = ""; }
  });

  // Initial state
  els.largeGlyph.style.fontSize = `${els.previewSize.value}px`;
  els.previewSizeValue.textContent = `${els.previewSize.value} px`;
  renderGlyphGrid();
  updateSpecimen();
})();