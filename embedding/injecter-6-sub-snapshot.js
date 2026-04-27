// injecter / sub-snapshot — 로어 스냅샷 (백업)
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

  _w.__LoreInj.registerSubMenu = _w.__LoreInj.registerSubMenu || function() {};

  _w.__LoreInj.registerSubMenu('snapshot', function(modal) {
    modal.createSubMenu('로어 스냅샷 (백업)', (m) => {
      const renderSnapshotUI = async (panel) => {
        panel.addBoxedField('', '', { onInit: async (nd) => {
          C.setFullWidth(nd);
          const t = document.createElement('div'); t.textContent = '스냅샷 복원'; t.style.cssText = 'font-size:14px;color:#ccc;font-weight:bold;margin-bottom:8px;'; nd.appendChild(t);
          const snaps = await db.snapshots.orderBy('timestamp').reverse().toArray();
          if (!snaps.length) { nd.appendChild(Object.assign(document.createElement('div'), { textContent: '저장된 스냅샷이 없습니다.', style: 'color:#888;font-size:12px;' })); return; }
          const list = document.createElement('div'); list.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto;';
          for (const s of snaps) {
            const row = document.createElement('div'); row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px;background:#1a1a1a;border:1px solid #333;border-radius:4px;';
            const info = document.createElement('div'); info.style.cssText = 'display:flex;flex-direction:column;';
            const sTitle = document.createElement('span'); sTitle.textContent = `[${s.packName}] ${s.label} (${s.data.length}개)`; sTitle.style.cssText = 'font-size:12px;color:#4a9;font-weight:bold;';
            const sTime = document.createElement('span'); sTime.textContent = new Date(s.timestamp).toLocaleString(); sTime.style.cssText = 'font-size:10px;color:#888;';
            info.appendChild(sTitle); info.appendChild(sTime);
            const btnWrap = document.createElement('div'); btnWrap.style.cssText = 'display:flex;gap:4px;';
            const rBtn = document.createElement('button'); rBtn.textContent = '복원'; rBtn.style.cssText = 'padding:4px 8px;font-size:11px;border-radius:3px;background:#258;color:#fff;border:none;cursor:pointer;';
            rBtn.onclick = async () => { if (confirm(`[${s.packName}] 팩을 이 시점으로 복원할 것?\n기존 데이터는 덮어씌워집니다.`)) { await restoreSnapshot(s.id); alert('복원 완료.'); m.replaceContentPanel(renderSnapshotUI, '스냅샷 관리'); } };
            const dBtn = document.createElement('button'); dBtn.textContent = '삭제'; dBtn.style.cssText = 'padding:4px 8px;font-size:11px;border-radius:3px;background:transparent;color:#d66;border:1px solid #d66;cursor:pointer;';
            dBtn.onclick = async () => { if (confirm('삭제?')) { await db.snapshots.delete(s.id); m.replaceContentPanel(renderSnapshotUI, '스냅샷 관리'); } };
            btnWrap.appendChild(rBtn); btnWrap.appendChild(dBtn);
            row.appendChild(info); row.appendChild(btnWrap); list.appendChild(row);
          }
          nd.appendChild(list);
        }});
      };
      m.replaceContentPanel(renderSnapshotUI, '스냅샷 관리');
    });
  });

  _w.__LoreInj.__subSnapshotLoaded = true;
})();
