// crack-lore-refiner / modal 모듈
// 역할: 응답 교정 확인 창을 넓고 읽기 쉽게 표시
(function () {
  'use strict';

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  if (_w.__LoreRefinerModal) return;

  function ensureStyle() {
    if (document.getElementById('lore-refiner-modal-style')) return;

    const style = document.createElement('style');
    style.id = 'lore-refiner-modal-style';
    style.textContent = [
      '#refiner-confirm-overlay{',
      'position:fixed;',
      'inset:0;',
      'z-index:999999;',
      'display:flex;',
      'align-items:center;',
      'justify-content:center;',
      'box-sizing:border-box;',
      'padding:20px;',
      'background:rgba(0,0,0,.72);',
      '}',
      '.lore-refiner-modal{',
      'width:min(920px,calc(100vw - 40px));',
      'max-height:min(820px,calc(100vh - 40px));',
      'display:flex;',
      'flex-direction:column;',
      'overflow:hidden;',
      'box-sizing:border-box;',
      'border:1px solid #333;',
      'border-radius:10px;',
      'background:#1a1a1a;',
      'color:#ddd;',
      'box-shadow:0 16px 40px rgba(0,0,0,.55);',
      'font-family:inherit;',
      '}',
      '.lore-refiner-modal-header{',
      'padding:18px 20px 12px;',
      'border-bottom:1px solid #2b2b2b;',
      '}',
      '.lore-refiner-modal-title{',
      'font-size:16px;',
      'font-weight:700;',
      'color:#4a9;',
      '}',
      '.lore-refiner-modal-body{',
      'display:flex;',
      'flex-direction:column;',
      'gap:14px;',
      'overflow:auto;',
      'padding:16px 20px;',
      '}',
      '.lore-refiner-field-title{',
      'margin-bottom:6px;',
      'font-size:12px;',
      'font-weight:700;',
      'color:#aaa;',
      '}',
      '.lore-refiner-reason{',
      'white-space:pre-wrap;',
      'word-break:break-word;',
      'box-sizing:border-box;',
      'padding:10px 12px;',
      'border:1px solid #2d2d2d;',
      'border-radius:6px;',
      'background:#222;',
      'font-size:13px;',
      'line-height:1.55;',
      'color:#ddd;',
      '}',
      '.lore-refiner-textarea{',
      'width:100%;',
      'min-height:260px;',
      'height:min(52vh,520px);',
      'box-sizing:border-box;',
      'padding:12px;',
      'border:1px solid #444;',
      'border-radius:6px;',
      'background:#0a0a0a;',
      'color:#fff;',
      'font-size:13px;',
      'line-height:1.55;',
      'font-family:inherit;',
      'resize:vertical;',
      '}',
      '.lore-refiner-modal-actions{',
      'position:sticky;',
      'bottom:0;',
      'display:flex;',
      'justify-content:flex-end;',
      'gap:10px;',
      'padding:14px 20px;',
      'border-top:1px solid #2b2b2b;',
      'background:#1a1a1a;',
      '}',
      '.lore-refiner-button{',
      'min-height:40px;',
      'padding:9px 16px;',
      'border:none;',
      'border-radius:6px;',
      'font-weight:700;',
      'cursor:pointer;',
      'font-family:inherit;',
      '}',
      '.lore-refiner-button-secondary{',
      'background:#444;',
      'color:#ddd;',
      '}',
      '.lore-refiner-button-primary{',
      'background:#285;',
      'color:#fff;',
      '}',
      '@media (max-width:520px){',
      '#refiner-confirm-overlay{',
      'align-items:flex-end;',
      'padding:10px;',
      '}',
      '.lore-refiner-modal{',
      'width:calc(100vw - 20px);',
      'max-height:calc(100vh - 20px);',
      'border-radius:10px 10px 0 0;',
      '}',
      '.lore-refiner-modal-header{padding:14px 14px 10px;}',
      '.lore-refiner-modal-body{padding:14px;}',
      '.lore-refiner-textarea{min-height:220px;height:48vh;}',
      '.lore-refiner-modal-actions{',
      'display:grid;',
      'grid-template-columns:1fr 1fr;',
      'padding:12px 14px calc(12px + env(safe-area-inset-bottom));',
      '}',
      '}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function close(overlay) {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  function show(reason, refinedText, onConfirm, onCancel, options) {
    options = options || {};

    const existing = document.getElementById('refiner-confirm-overlay');
    if (existing) close(existing);

    ensureStyle();

    const overlay = document.createElement('div');
    overlay.id = 'refiner-confirm-overlay';

    const box = document.createElement('div');
    box.className = 'lore-refiner-modal';

    const header = document.createElement('div');
    header.className = 'lore-refiner-modal-header';

    const title = document.createElement('div');
    title.className = 'lore-refiner-modal-title';
    title.textContent = options.title || '응답 교정 제안';

    const body = document.createElement('div');
    body.className = 'lore-refiner-modal-body';

    const reasonWrap = document.createElement('section');
    const reasonTitle = document.createElement('div');
    reasonTitle.className = 'lore-refiner-field-title';
    reasonTitle.textContent = '교정 이유';
    const reasonBox = document.createElement('div');
    reasonBox.className = 'lore-refiner-reason';
    reasonBox.textContent = reason || '이유 없음';
    reasonWrap.appendChild(reasonTitle);
    reasonWrap.appendChild(reasonBox);

    const originalText = options.originalText || '';
    let originalWrap = null;
    if (originalText) {
      originalWrap = document.createElement('section');
      const originalTitle = document.createElement('div');
      originalTitle.className = 'lore-refiner-field-title';
      originalTitle.textContent = '원문';
      const originalBox = document.createElement('div');
      originalBox.className = 'lore-refiner-reason';
      originalBox.style.maxHeight = '180px';
      originalBox.style.overflow = 'auto';
      originalBox.textContent = originalText;
      originalWrap.appendChild(originalTitle);
      originalWrap.appendChild(originalBox);
    }

    const editWrap = document.createElement('section');
    const editTitle = document.createElement('div');
    editTitle.className = 'lore-refiner-field-title';
    editTitle.textContent = '수정된 응답';
    const refTa = document.createElement('textarea');
    refTa.className = 'lore-refiner-textarea';
    refTa.value = refinedText || '';
    editWrap.appendChild(editTitle);
    editWrap.appendChild(refTa);

    const actions = document.createElement('div');
    actions.className = 'lore-refiner-modal-actions';

    const btnCancel = document.createElement('button');
    btnCancel.className = 'lore-refiner-button lore-refiner-button-secondary';
    btnCancel.textContent = '원본 유지';
    btnCancel.onclick = function () {
      close(overlay);
      if (typeof onCancel === 'function') onCancel();
      if (typeof options.afterClose === 'function') options.afterClose();
    };

    const btnConfirm = document.createElement('button');
    btnConfirm.className = 'lore-refiner-button lore-refiner-button-primary';
    btnConfirm.textContent = '교정본 적용';
    btnConfirm.onclick = function () {
      close(overlay);
      if (typeof onConfirm === 'function') onConfirm(refTa.value);
      if (typeof options.afterClose === 'function') options.afterClose();
    };

    actions.appendChild(btnCancel);
    actions.appendChild(btnConfirm);
    header.appendChild(title);
    body.appendChild(reasonWrap);
    if (originalWrap) body.appendChild(originalWrap);
    body.appendChild(editWrap);
    box.appendChild(header);
    box.appendChild(body);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    setTimeout(function () {
      try { refTa.focus(); } catch (e) {}
    }, 0);

    return overlay;
  }

  _w.__LoreRefinerModal = { show, close };

})();