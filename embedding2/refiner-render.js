// crack-lore-refiner / render 모듈
// 역할: 교정 텍스트 정규화, 안전한 표시용 렌더링, 마크다운 제거 유틸
(function () {
  'use strict';

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  if (_w.__LoreRefinerRender) return;

  function stripMarkdown(text) {
    return String(text || '')
      .replace(/```\w*\n?/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/^#+\s+/gm, '')
      .replace(/^[-*+]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      .replace(/^>\s+/gm, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  function normalizeReplacementText(text) {
    let out = String(text == null ? '' : text);

    // 모델이 교정 JSON 바깥에 붙인 전체 래퍼만 제거한다.
    // 답변 내부의 실제 코드블록은 보존해야 하므로, 텍스트 전체가 단일 fence일 때만 벗긴다.
    const trimmed = out.trim();
    const wholeFence = trimmed.match(/^```(?:text|markdown|md)?\s*\n([\s\S]*?)\n```$/i);
    if (wholeFence) out = wholeFence[1];

    return out.replace(/\r\n/g, '\n');
  }

  function renderPlainText(text) {
    const wrap = document.createElement('div');
    wrap.className = 'lore-refiner-rendered lore-refiner-plain';
    wrap.style.whiteSpace = 'pre-wrap';
    wrap.style.wordBreak = 'break-word';
    wrap.style.lineHeight = 'inherit';
    wrap.textContent = normalizeReplacementText(text);
    return wrap;
  }

  function renderSafe(text) {
    const normalized = normalizeReplacementText(text);

    // 직접 innerHTML을 만들지 않는다.
    // 새로고침 후 원래 앱 렌더러가 최종 마크다운 표시를 맡고,
    // 즉시 반영 화면은 pre-wrap 텍스트로 안정성을 우선한다.
    return renderPlainText(normalized);
  }

  _w.__LoreRefinerRender = {
    stripMarkdown,
    normalizeReplacementText,
    renderPlainText,
    renderSafe
  };


})();