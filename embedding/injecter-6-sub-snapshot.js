// injecter / sub-snapshot - 스냅샷
// 역할: 스냅샷 목록, 복원, 삭제
// 의존: injecter-3 (settings, db, C, restoreSnapshot)
(async function(){
  'use strict';
  if(document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded)) { console.error('[LoreInj:sub-snapshot] settings 미로드'); return; }
  if (_w.__LoreInj.__subSnapshotLoaded) return;

  const { C, db, restoreSnapshot } = _w.__LoreInj;

  async function readSnapshotEntries(snapshot) {
    if (Array.isArray(snapshot && snapshot.data)) return snapshot.data;
    if (snapshot && snapshot.dataGzip && typeof C.unpackJsonFromStorage === 'function') {
      const unpacked = await C.unpackJsonFromStorage(snapshot, 'data', 'dataGzip', 'dataEncoding');
      return Array.isArray(unpacked) ? unpacked : [];
    }
    return [];
  }

  function summaryText(entry) {
    const summary = entry && entry.summary;
    if (summary && typeof summary === 'object') return String(summary.full || summary.compact || summary.micro || '');
    return String(summary || entry && entry.inject && (entry.inject.full || entry.inject.compact || entry.inject.micro) || '');
  }

  _w.__LoreInj.registerSubMenu = _w.__LoreInj.registerSubMenu || function() {};

  _w.__LoreInj.registerSubMenu('snapshot', function(modal) {
    modal.createSubMenu('스냅샷', (m) => {
      const renderSnapshotUI = async (panel) => {
        panel.addBoxedField('', '', { onInit: async (nd) => {
          C.setFullWidth(nd);
          const t = document.createElement('div'); t.textContent = '스냅샷 복원'; t.style.cssText = 'font-size:14px;color:#ccc;font-weight:bold;margin-bottom:8px;'; nd.appendChild(t);
          const snaps = await db.snapshots.orderBy('timestamp').reverse().toArray();
          if (!snaps.length) { nd.appendChild(Object.assign(document.createElement('div'), { textContent: '저장된 스냅샷이 없습니다.', style: 'color:#888;font-size:12px;' })); return; }
          const list = document.createElement('div'); list.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-height:520px;overflow-y:auto;';
          for (const s of snaps) {
            const row = document.createElement('div'); row.style.cssText = 'padding:8px;background:#1a1a1a;border:1px solid #333;border-radius:4px;';
            const header = document.createElement('div'); header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;';
            const info = document.createElement('div'); info.style.cssText = 'display:flex;flex-direction:column;min-width:0;';
            const itemCount = Number.isFinite(Number(s.itemCount)) ? Number(s.itemCount) : (Array.isArray(s.data) ? s.data.length : '?');
            const sTitle = document.createElement('span'); sTitle.textContent = `[${s.packName}] ${s.label} (${itemCount}개)`; sTitle.style.cssText = 'font-size:12px;color:#4a9;font-weight:bold;';
            const sTime = document.createElement('span'); sTime.textContent = new Date(s.timestamp).toLocaleString(); sTime.style.cssText = 'font-size:10px;color:#888;';
            info.appendChild(sTitle); info.appendChild(sTime);
            const btnWrap = document.createElement('div'); btnWrap.style.cssText = 'display:flex;gap:4px;';
            const rBtn = document.createElement('button'); rBtn.textContent = '복원'; rBtn.style.cssText = 'padding:4px 8px;font-size:11px;border-radius:3px;background:#258;color:#fff;border:none;cursor:pointer;';
            rBtn.onclick = async () => { if (confirm(`[${s.packName}] 팩을 이 시점으로 복원할 것?\n기존 데이터는 덮어씌워집니다.`)) { await restoreSnapshot(s.id); alert('복원 완료.'); m.replaceContentPanel(renderSnapshotUI, '스냅샷 관리'); } };
            const dBtn = document.createElement('button'); dBtn.textContent = '삭제'; dBtn.style.cssText = 'padding:4px 8px;font-size:11px;border-radius:3px;background:transparent;color:#d66;border:1px solid #d66;cursor:pointer;';
            dBtn.onclick = async () => { if (confirm('삭제?')) { await db.snapshots.delete(s.id); m.replaceContentPanel(renderSnapshotUI, '스냅샷 관리'); } };
            btnWrap.appendChild(rBtn); btnWrap.appendChild(dBtn);
            header.appendChild(info); header.appendChild(btnWrap); row.appendChild(header);

            const details = document.createElement('details'); details.style.cssText = 'margin-top:7px;border-top:1px solid #2d2d2d;padding-top:6px;';
            const detailsSummary = document.createElement('summary'); detailsSummary.textContent = '저장된 내용 보기'; detailsSummary.style.cssText = 'cursor:pointer;font-size:11px;color:#8bc;user-select:none;'; details.appendChild(detailsSummary);
            const body = document.createElement('div'); body.style.cssText = 'margin-top:7px;font-size:11px;color:#aaa;'; details.appendChild(body);
            let loaded = false;
            details.addEventListener('toggle', async () => {
              if (!details.open || loaded) return;
              loaded = true; body.textContent = '불러오는 중...';
              try {
                const entries = await readSnapshotEntries(s);
                body.innerHTML = '';
                if (!entries.length) { body.textContent = '이 스냅샷에서 확인할 로어가 없음.'; return; }
                const count = document.createElement('div'); count.textContent = '로어 ' + entries.length + '개'; count.style.cssText = 'color:#888;margin-bottom:5px;'; body.appendChild(count);
                for (const entry of entries) {
                  const item = document.createElement('div'); item.style.cssText = 'padding:7px 0;border-bottom:1px dashed #2a2a2a;';
                  const name = document.createElement('div'); name.textContent = '[' + (entry.type || 'lore') + '] ' + (entry.name || entry.title || '(이름 없음)'); name.style.cssText = 'font-weight:bold;color:#ccc;margin-bottom:3px;'; item.appendChild(name);
                  const state = entry.state && typeof entry.state === 'object' ? JSON.stringify(entry.state) : String(entry.state || '');
                  if (state) { const stateEl = document.createElement('div'); stateEl.textContent = '현재 상태: ' + state; stateEl.style.cssText = 'color:#8a9;margin-bottom:3px;word-break:break-word;'; item.appendChild(stateEl); }
                  const summary = summaryText(entry);
                  if (summary) { const summaryEl = document.createElement('div'); summaryEl.textContent = summary; summaryEl.style.cssText = 'line-height:1.45;white-space:pre-wrap;word-break:break-word;'; item.appendChild(summaryEl); }
                  if (Array.isArray(entry.triggers) && entry.triggers.length) { const triggerEl = document.createElement('div'); triggerEl.textContent = '호출 단서: ' + entry.triggers.join(', '); triggerEl.style.cssText = 'color:#777;margin-top:3px;word-break:break-word;'; item.appendChild(triggerEl); }
                  body.appendChild(item);
                }
                const raw = document.createElement('details'); raw.style.cssText = 'margin-top:8px;';
                const rawSummary = document.createElement('summary'); rawSummary.textContent = '원본 JSON 보기'; rawSummary.style.cssText = 'cursor:pointer;color:#777;'; raw.appendChild(rawSummary);
                const pre = document.createElement('pre'); pre.textContent = JSON.stringify(entries, null, 2); pre.style.cssText = 'max-height:280px;overflow:auto;white-space:pre-wrap;word-break:break-all;background:#0d0d0d;padding:8px;border:1px solid #292929;font-size:10px;color:#999;'; raw.appendChild(pre); body.appendChild(raw);
              } catch (error) {
                body.textContent = '내용을 열 수 없음: ' + (error.message || String(error)); body.style.color = '#d66';
              }
            });
            row.appendChild(details); list.appendChild(row);
          }
          nd.appendChild(list);
        }});
      };
      m.replaceContentPanel(renderSnapshotUI, '스냅샷 관리');
    });
  });

  _w.__LoreInj.__subSnapshotLoaded = true;
})();
