
// script.js (melhorado) - funcionalidade de CRUD + edição via admin + preview de imagens
// Requisitos: substituir storageBucket no firebaseConfig se for diferente.

const firebaseConfig = {
  apiKey: "AIzaSyAaD28o-yjtl9Huqut9_cL9KQQ4TM4N85I",
  authDomain: "xanxere-ba9c1.firebaseapp.com",
  projectId: "xanxere-ba9c1",
  storageBucket: "xanxere-ba9c1.appspot.com",
  messagingSenderId: "944479736218",
  appId: "1:944479736218:web:53a60c07c90984e8b3aa23",
  measurementId: "G-2HFZ6X1L5W"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();
let analytics = null;
try { analytics = firebase.analytics(); } catch (e) { /* ok em file:// pode falhar */ }

// Pequenos helpers
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
function showToast(text, ms = 2500) { const t = $('#toast'); if (!t) { alert(text); return; } t.hidden = false; t.textContent = text; setTimeout(()=> t.hidden = true, ms); }
function formatRelative(ts){ if(!ts) return 'agora'; const d = ts.toDate ? ts.toDate() : new Date(ts); const diff = Date.now() - d.getTime(); const mins = Math.floor(diff/60000); if(mins<1) return 'agora'; if(mins<60) return `${mins}min atrás`; const hrs = Math.floor(mins/60); if(hrs<24) return `${hrs}h atrás`; return d.toLocaleDateString('pt-BR'); }
function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

// Estado
const STATE = {
  adminLogged: false,
  adminPassword: 'admin123',
  currentUser: null,
  data: { ocorrencias: [], noticias: [], empresas: [], doacoes: [], chat: [] },
  bairros: new Set()
};

// Inicialização
document.addEventListener('DOMContentLoaded', init);
function init(){
  bindUI();
  startRealtimeListeners();
  // placeholders
  renderHomeFeatured(); renderFeed(); renderNoticias(); renderEmpresas(); renderDoacoes(); renderChat();
}

function bindUI(){
  $$('.nav-link').forEach(btn => btn.addEventListener('click', ()=> showPage(btn.dataset.target)));
  $('#home-btn')?.addEventListener('click', ()=> showPage('home'));
  $('#menu-toggle')?.addEventListener('click', ()=> { const nav = $('#main-nav'); nav.style.display = nav.style.display === 'flex' ? 'none' : 'flex'; });
  $('#theme-toggle')?.addEventListener('click', ()=> { document.documentElement.classList.toggle('dark-mode'); });
  $('#open-oco')?.addEventListener('click', ()=> openModal('#ocorrencia-modal'));
  $$('#ocorrencia-modal [data-close]').forEach(b => b.addEventListener('click', ()=> closeModal('#ocorrencia-modal')));
  $$('#noticia-modal [data-close]').forEach(b => b.addEventListener('click', ()=> closeModal('#noticia-modal')));
  $$('#admin-login-modal [data-close]').forEach(b => b.addEventListener('click', ()=> closeModal('#admin-login-modal')));
  $('#form-ocorrencia')?.addEventListener('submit', handleOcorrenciaSubmit);
  $('#form-noticia')?.addEventListener('submit', handleNoticiaSubmit);
  $('#form-admin-login')?.addEventListener('submit', handleAdminLogin);
  $('#chat-form')?.addEventListener('submit', handleChatSubmit);
  $('#filter-categoria')?.addEventListener('change', renderFeedFiltered);
  $('#filter-bairro')?.addEventListener('change', renderFeedFiltered);
  $('#filter-status')?.addEventListener('change', renderFeedFiltered);
  $('#filter-empresas-nome')?.addEventListener('input', renderEmpresas);
  $('#filter-doacoes-nome')?.addEventListener('input', renderDoacoesFiltered);
  $('#filter-tipo-doacao')?.addEventListener('change', renderDoacoesFiltered);
  $('#clear-filters')?.addEventListener('click', ()=>{ ['#filter-categoria','#filter-bairro','#filter-status'].forEach(id=> { if($(id)) $(id).value = ''; }); renderFeed(); });
  $('#admin-open')?.addEventListener('click', ()=> { if(STATE.adminLogged) openAdminPanel(); else openModal('#admin-login-modal'); });
  $('#admin-logout')?.addEventListener('click', ()=> { STATE.adminLogged=false; $('#admin-panel').style.display='none'; showToast('Desconectado'); });
  // image previews
  $('#oco-foto')?.addEventListener('change', e => previewImage(e.target.files[0], '#oco-preview'));
  $('#not-capa')?.addEventListener('change', e => previewImage(e.target.files[0], '#not-capa-preview'));
  $('#edit-oco-foto')?.addEventListener('change', e => previewImage(e.target.files[0], '#edit-oco-preview'));
  $('#edit-not-capa')?.addEventListener('change', e => previewImage(e.target.files[0], '#edit-not-capa-preview'));
  // edit form handlers
  $('#form-edit-ocorrencia')?.addEventListener('submit', handleEditOcorrenciaSubmit);
  $('#form-edit-noticia')?.addEventListener('submit', handleEditNoticiaSubmit);

  // close modals clicking outside
  $$('.modal').forEach(modal => modal.addEventListener('click', e => { if(e.target === modal) { modal.setAttribute('aria-hidden','true'); modal.style.display = 'none'; } }));
}

function showPage(id){ $$('.page').forEach(p => p.classList.remove('active')); const page = $('#'+id); if(page) page.classList.add('active'); window.scrollTo(0,0); }

// Modal helpers
function openModal(sel){ const m = $(sel); if(!m) return; m.style.display = 'flex'; m.setAttribute('aria-hidden','false'); }
function closeModal(sel){ const m = $(sel); if(!m) return; m.style.display = 'none'; m.setAttribute('aria-hidden','true'); }

// Image preview
function previewImage(file, targetSelector){
  const container = $(targetSelector);
  if(!container) return;
  container.innerHTML = '';
  if(!file) { container.setAttribute('aria-hidden','true'); return; }
  const img = document.createElement('img'); img.style.maxWidth='100%'; img.style.borderRadius='8px';
  const reader = new FileReader();
  reader.onload = e => { img.src = e.target.result; container.appendChild(img); container.setAttribute('aria-hidden','false'); };
  reader.readAsDataURL(file);
}

// Realtime listeners
function startRealtimeListeners(){
  db.collection('ocorrencias').orderBy('dataRegistro','desc').onSnapshot(snap => {
    STATE.data.ocorrencias = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    STATE.bairros = new Set(STATE.data.ocorrencias.map(o => o.bairro).filter(Boolean));
    populateBairros();
    renderHomeFeatured(); renderFeed(); renderAdminOcorrencias(); updateStats();
  }, e => console.error('ocorrencias snapshot', e));

  db.collection('noticias').orderBy('dataRegistro','desc').onSnapshot(snap => {
    STATE.data.noticias = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderHomeFeatured(); renderNoticias(); renderAdminNoticias(); updateStats();
  }, e => console.error('noticias snapshot', e));

  db.collection('empresas').orderBy('dataRegistro','desc').onSnapshot(snap => {
    STATE.data.empresas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderEmpresas(); renderHomeFeatured(); renderAdminEmpresas(); updateStats();
  }, e => console.error('empresas snapshot', e));

  db.collection('doacoes').orderBy('dataRegistro','desc').onSnapshot(snap => {
    STATE.data.doacoes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderDoacoes(); renderAdminDoacoes();
  }, e => console.error('doacoes snapshot', e));

  db.collection('chat').orderBy('timestamp','asc').onSnapshot(snap => {
    STATE.data.chat = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderChat(); renderAdminChat(); updateStats();
  }, e => console.error('chat snapshot', e));
}

// Stats + UI helpers
function updateStats(){
  $('#stat-ocorrencias').textContent = STATE.data.ocorrencias.length || 0;
  $('#stat-noticias').textContent = STATE.data.noticias.length || 0;
  $('#stat-empresas').textContent = STATE.data.empresas.length || 0;
  const users = new Set(STATE.data.chat.map(m => m.usuario).filter(Boolean));
  $('#stat-usuarios').textContent = users.size;
  $('#admin-oco-total').textContent = STATE.data.ocorrencias.length || 0;
  $('#admin-users-total').textContent = users.size;
  $('#admin-oco-resolvidas').textContent = STATE.data.ocorrencias.filter(o=> o.status === 'resolvido').length;
  $('#admin-oco-pendentes').textContent = STATE.data.ocorrencias.filter(o=> o.status !== 'resolvido').length;
}

function populateBairros(){
  const sel = $('#filter-bairro'); if(!sel) return;
  sel.innerHTML = '<option value="">Todos bairros</option>';
  Array.from(STATE.bairros).sort().forEach(b => { const opt = document.createElement('option'); opt.value = b; opt.textContent = b; sel.appendChild(opt); });
}

// Renders
function renderHomeFeatured(){
  const fo = $('#featured-ocorrencias'); if(fo) { const arr = STATE.data.ocorrencias.slice(0,3); fo.innerHTML = arr.length ? arr.map(o=> `<div class="feed-item"><h4>${escapeHtml(o.categoria)}</h4><p>${escapeHtml(o.bairro)} - ${escapeHtml(o.rua)}</p><small>${formatRelative(o.dataRegistro)}</small></div>`).join('') : '<div class="list-empty">Nenhuma ocorrência</div>'; }
  const fn = $('#featured-noticias'); if(fn) { const arr = STATE.data.noticias.slice(0,3); fn.innerHTML = arr.length ? arr.map(n=> `<div class="feed-item"><h4>${escapeHtml(n.titulo)}</h4><p>${escapeHtml(n.subtitulo || n.conteudo?.slice(0,120))}</p><small>${formatRelative(n.dataRegistro)}</small></div>`).join('') : '<div class="list-empty">Nenhuma notícia</div>'; }
  const fe = $('#featured-empresas'); if(fe) { const arr = STATE.data.empresas.slice(0,3); fe.innerHTML = arr.length ? arr.map(e=> `<div class="feed-item"><h4>${escapeHtml(e.nome)}</h4><p>${escapeHtml(e.ajuda || e.descricao?.slice(0,120))}</p></div>`).join('') : '<div class="list-empty">Nenhuma empresa</div>'; }
}

function renderFeed(){
  const list = $('#feed-list'); if(!list) return;
  if(STATE.data.ocorrencias.length === 0){ list.innerHTML = '<div class="empty-state">Nenhuma ocorrência registrada</div>'; return; }
  list.innerHTML = STATE.data.ocorrencias.map(o => feedItemHtml(o)).join('');
}
function renderFeedFiltered(){
  const cat = $('#filter-categoria')?.value || '';
  const bairro = $('#filter-bairro')?.value || '';
  const status = $('#filter-status')?.value || '';
  const arr = STATE.data.ocorrencias.filter(o => (!cat||o.categoria===cat) && (!bairro||o.bairro===bairro) && (!status||o.status===status));
  const list = $('#feed-list'); if(!list) return;
  if(arr.length === 0){ list.innerHTML = '<div class="empty-state">Nenhuma ocorrência encontrada</div>'; return; }
  list.innerHTML = arr.map(o => feedItemHtml(o)).join('');
}
function feedItemHtml(o){ return `<article class="feed-item" data-id="${o.id}"><h4>${escapeHtml(o.categoria)} <small style="color:${o.status==='resolvido'?'#16a34a':'#f59e0b'}">· ${o.status||'novo'}</small></h4><p>${escapeHtml(o.bairro)} — ${escapeHtml(o.rua)}</p><p style="color:var(--muted)">${escapeHtml((o.descricao||'').slice(0,200))}${(o.descricao||'').length>200?'...':''}</p><div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px"><small style="color:var(--muted)">${formatRelative(o.dataRegistro)}</small><div style="display:flex;gap:8px"><button class="btn" onclick="likeOcorrencia('${o.id}')"><i class="fas fa-heart"></i> ${o.curtidas||0}</button><button class="btn" onclick="openEditOcorrencia('${o.id}')">Editar</button></div></div></article>`; }

function renderNoticias(){
  const c = $('#noticias-list'); if(!c) return;
  if(STATE.data.noticias.length === 0){ c.innerHTML = '<div class="empty-state">Nenhuma notícia publicada</div>'; return; }
  c.innerHTML = STATE.data.noticias.map(n => `<article class="card"><h3>${escapeHtml(n.titulo)}</h3><p style="color:var(--muted)">${escapeHtml(n.subtitulo||n.conteudo?.slice(0,140))}...</p><small style="color:var(--muted)">${formatRelative(n.dataRegistro)}</small><div style="margin-top:8px"><button class="btn" onclick="openEditNoticia('${n.id}')">Editar</button></div></article>`).join('');
}

function renderChat(){
  const el = $('#chat-messages'); if(!el) return;
  if(STATE.data.chat.length === 0){ el.innerHTML = '<div class="empty-state">Seja o primeiro a enviar uma mensagem!</div>'; return; }
  el.innerHTML = STATE.data.chat.map(m => `<div style="padding:8px;border-radius:8px;background:${m.usuario===STATE.currentUser? '#e6fffa':'#fff'};margin-bottom:8px"><strong>${escapeHtml(m.usuario)}</strong><div style="color:var(--muted)">${escapeHtml(m.mensagem)}</div><small style="color:var(--muted)">${formatRelative(m.timestamp)}</small></div>`).join('');
  el.scrollTop = el.scrollHeight;
}

function renderEmpresas(){
  const el = $('#empresas-list'); if(!el) return;
  const term = $('#filter-empresas-nome')?.value?.toLowerCase()||'';
  const arr = STATE.data.empresas.filter(e => !term || (e.nome||'').toLowerCase().includes(term) || (e.descricao||'').toLowerCase().includes(term));
  if(arr.length===0){ el.innerHTML = '<div class="empty-state">Nenhuma empresa cadastrada</div>'; return; }
  el.innerHTML = arr.map(e => `<div class="card"><h3>${escapeHtml(e.nome)}</h3><p style="color:var(--muted)">${escapeHtml(e.descricao)}</p><small style="color:var(--muted)">${e.telefone||'Sem telefone'}</small><div style="margin-top:8px"><button class="btn" onclick="openEditEmpresa('${e.id}')">Editar</button></div></div>`).join('');
}

function renderDoacoes(){
  const el = $('#doacoes-list'); if(!el) return; renderDoacoesFiltered();
}
function renderDoacoesFiltered(){
  const term = $('#filter-doacoes-nome')?.value?.toLowerCase()||'';
  const tipo = $('#filter-tipo-doacao')?.value||'';
  const arr = STATE.data.doacoes.filter(d => ( !term || (d.nome||'').toLowerCase().includes(term) || (d.bairro||'').toLowerCase().includes(term) ) && ( !tipo || (d.tiposDoacao||[]).includes(tipo) || d.tipo === tipo ));
  const el = $('#doacoes-list'); if(!el) return;
  if(arr.length===0){ el.innerHTML = '<div class="empty-state">Nenhum ponto de doação</div>'; return; }
  el.innerHTML = arr.map(d => `<div class="card"><h3>${escapeHtml(d.nome)}</h3><p style="color:var(--muted)">${escapeHtml(d.bairro)} — ${escapeHtml(d.tipo||'')}</p><div style="margin-top:8px">${(d.tiposDoacao||[]).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div><div style="margin-top:8px"><button class="btn" onclick="openEditDoacao('${d.id}')">Editar</button></div></div>`).join('');
}

// CRUD actions - create
async function handleOcorrenciaSubmit(e){ e.preventDefault();
  const categoria = $('#oco-categoria').value;
  const bairro = $('#oco-bairro').value.trim();
  const rua = $('#oco-rua').value.trim();
  const descricao = $('#oco-descricao').value.trim();
  const anonimo = $('#oco-anonimo').checked;
  const fotoInput = $('#oco-foto');
  if(!categoria || !bairro || !rua || !descricao){ showToast('Preencha todos os campos'); return; }
  try {
    let fotoUrl = null;
    if(fotoInput && fotoInput.files && fotoInput.files[0]) fotoUrl = await uploadAndCompressImage(fotoInput.files[0], 'ocorrencias');
    const payload = { categoria, bairro, rua, descricao, fotoUrl, autor: anonimo ? 'Anônimo' : (STATE.currentUser||'Visitante'), anonimo, status:'novo', dataRegistro: firebase.firestore.FieldValue.serverTimestamp(), curtidas:0, comentarios:[], visualizacoes:0 };
    await db.collection('ocorrencias').add(payload);
    $('#form-ocorrencia').reset(); $('#oco-preview').innerHTML=''; closeModal('#ocorrencia-modal'); showToast('Ocorrência publicada');
    if(analytics) analytics.logEvent('ocorrencia_criada',{categoria});
  } catch(err){ console.error(err); showToast('Erro ao publicar ocorrência'); }
}

async function handleNoticiaSubmit(e){ e.preventDefault(); if(!STATE.adminLogged) { showToast('Apenas admins podem publicar'); return; }
  const titulo = $('#not-titulo').value.trim(); const subtitulo = $('#not-subtitulo').value.trim(); const categoria = $('#not-categoria').value; const conteudo = $('#not-conteudo').value.trim(); const capa = $('#not-capa');
  if(!titulo || !conteudo){ showToast('Título e conteúdo são necessários'); return; }
  try { let capaUrl = null; if(capa && capa.files && capa.files[0]) capaUrl = await uploadAndCompressImage(capa.files[0], 'noticias'); const payload = { titulo, subtitulo, categoria, conteudo, capaUrl, autor:'Administrador', dataRegistro: firebase.firestore.FieldValue.serverTimestamp(), curtidas:0 }; await db.collection('noticias').add(payload); $('#form-noticia').reset(); $('#not-capa-preview').innerHTML=''; closeModal('#noticia-modal'); showToast('Notícia publicada'); if(analytics) analytics.logEvent('noticia_criada',{categoria}); } catch(e){ console.error(e); showToast('Erro ao publicar notícia'); }
}

async function handleChatSubmit(e){ e.preventDefault(); const input = $('#chat-input'); if(!input) return; const mensagem = input.value.trim(); if(!mensagem) return; if(!STATE.currentUser){ const nome = prompt('Como você se chama?'); if(!nome) return; STATE.currentUser = nome; } try { await db.collection('chat').add({ usuario: STATE.currentUser, mensagem, timestamp: firebase.firestore.FieldValue.serverTimestamp() }); input.value=''; if(analytics) analytics.logEvent('chat_mensagem_enviada'); } catch(e){ console.error(e); showToast('Erro ao enviar mensagem'); } }

// likes
async function likeOcorrencia(id){ try { const doc = await db.collection('ocorrencias').doc(id).get(); const curtidas = (doc.data()?.curtidas||0)+1; await db.collection('ocorrencias').doc(id).update({ curtidas }); } catch(e){ console.error(e); } }

// EDIT functionality: open forms prefilled and update
async function openEditOcorrencia(id){
  const oco = STATE.data.ocorrencias.find(x=>x.id===id);
  if(!oco){ showToast('Ocorrência não encontrada'); return; }
  openModal('#edit-ocorrencia-modal');
  $('#edit-oco-id').value = oco.id;
  // populate selects
  const catSel = $('#edit-oco-categoria'); if(catSel){ catSel.innerHTML = '<option value="buraco">Buraco</option><option value="iluminacao">Iluminação</option><option value="arvore">Árvore</option><option value="esgoto">Esgoto</option><option value="agua">Falta de água</option><option value="lixo">Lixo</option><option value="outro">Outro</option>'; catSel.value = oco.categoria || ''; }
  $('#edit-oco-bairro').value = oco.bairro || ''; $('#edit-oco-rua').value = oco.rua || ''; $('#edit-oco-descricao').value = oco.descricao || ''; $('#edit-oco-status').value = oco.status || 'novo';
  if(oco.fotoUrl) previewImageUrl(oco.fotoUrl, '#edit-oco-preview');
}
async function handleEditOcorrenciaSubmit(e){ e.preventDefault(); const id = $('#edit-oco-id').value; if(!id) return; const categoria = $('#edit-oco-categoria').value; const bairro = $('#edit-oco-bairro').value.trim(); const rua = $('#edit-oco-rua').value.trim(); const descricao = $('#edit-oco-descricao').value.trim(); const status = $('#edit-oco-status').value; const fileInput = $('#edit-oco-foto'); try { let fotoUrl = null; if(fileInput && fileInput.files && fileInput.files[0]) fotoUrl = await uploadAndCompressImage(fileInput.files[0], 'ocorrencias'); const payload = { categoria, bairro, rua, descricao, status, ...(fotoUrl?{fotoUrl}:{}), updatedAt: firebase.firestore.FieldValue.serverTimestamp() }; await db.collection('ocorrencias').doc(id).update(payload); closeModal('#edit-ocorrencia-modal'); showToast('Ocorrência atualizada'); } catch(e){ console.error(e); showToast('Erro ao salvar'); } }

// edit noticia
async function openEditNoticia(id){
  const not = STATE.data.noticias.find(x=>x.id===id); if(!not){ showToast('Notícia não encontrada'); return; }
  openModal('#edit-noticia-modal'); $('#edit-not-id').value = not.id; $('#edit-not-titulo').value = not.titulo||''; $('#edit-not-subtitulo').value = not.subtitulo||''; $('#edit-not-categoria').value = not.categoria||'geral'; $('#edit-not-conteudo').value = not.conteudo||''; if(not.capaUrl) previewImageUrl(not.capaUrl, '#edit-not-capa-preview');
}
async function handleEditNoticiaSubmit(e){ e.preventDefault(); const id = $('#edit-not-id').value; if(!id) return; const titulo = $('#edit-not-titulo').value.trim(); const subtitulo = $('#edit-not-subtitulo').value.trim(); const categoria = $('#edit-not-categoria').value; const conteudo = $('#edit-not-conteudo').value.trim(); const capa = $('#edit-not-capa'); try { let capaUrl = null; if(capa && capa.files && capa.files[0]) capaUrl = await uploadAndCompressImage(capa.files[0], 'noticias'); const payload = { titulo, subtitulo, categoria, conteudo, ...(capaUrl?{capaUrl}:{}) , updatedAt: firebase.firestore.FieldValue.serverTimestamp() }; await db.collection('noticias').doc(id).update(payload); closeModal('#edit-noticia-modal'); showToast('Notícia atualizada'); } catch(e){ console.error(e); showToast('Erro ao salvar notícia'); } }

// edit empresa / doacao quick open (populates simple edit via admin panel modal implementation if needed)
async function openEditEmpresa(id){ const emp = STATE.data.empresas.find(x=>x.id===id); if(!emp){ showToast('Empresa não encontrada'); return; } // open a simple prompt-based editor for speed (can be extended to modal)
  const nome = prompt('Nome', emp.nome||''); if(nome===null) return;
  const descricao = prompt('Descrição', emp.descricao||''); if(descricao===null) return;
  const ajuda = prompt('Como ajuda', emp.ajuda||''); if(ajuda===null) return;
  try { await db.collection('empresas').doc(id).update({ nome, descricao, ajuda, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }); showToast('Empresa atualizada'); } catch(e){ console.error(e); showToast('Erro') }
}
async function openEditDoacao(id){ const d = STATE.data.doacoes.find(x=>x.id===id); if(!d){ showToast('Ponto não encontrado'); return; } const nome = prompt('Nome', d.nome||''); if(nome===null) return; const bairro = prompt('Bairro', d.bairro||''); if(bairro===null) return; try{ await db.collection('doacoes').doc(id).update({ nome, bairro, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }); showToast('Ponto atualizado'); }catch(e){ console.error(e); showToast('Erro') } }

// admin: open panel
function openAdminPanel(){ $('#admin-panel').style.display = 'block'; $('#admin-panel').setAttribute('aria-hidden','false'); renderAdminOcorrencias(); renderAdminNoticias(); renderAdminEmpresas(); renderAdminDoacoes(); renderAdminChat(); showToast('Painel aberto'); }

// admin renders
function renderAdminOcorrencias(){ const c = $('#admin-oco-list'); if(!c) return; const arr = STATE.data.ocorrencias; if(arr.length===0){ c.innerHTML = '<div class="empty-state">Sem ocorrências</div>'; return; } c.innerHTML = arr.map(o => `<div style="padding:12px;border-bottom:1px solid #eef6f5;display:flex;justify-content:space-between;align-items:center"><div><strong>${escapeHtml(o.categoria)}</strong><div style="color:var(--muted)">${escapeHtml(o.bairro)} — ${escapeHtml(o.rua)}</div><small style="color:var(--muted)">${formatRelative(o.dataRegistro)}</small></div><div style="display:flex;gap:8px"><button class="btn" onclick="openEditOcorrencia('${o.id}')">Editar</button><button class="btn" onclick="deleteOcorrencia('${o.id}')">Deletar</button></div></div>`).join(''); }
function renderAdminNoticias(){ const c = $('#admin-noticias-list'); if(!c) return; const arr = STATE.data.noticias; if(arr.length===0){ c.innerHTML = '<div class="empty-state">Sem notícias</div>'; return; } c.innerHTML = arr.map(n => `<div style="padding:12px;border-bottom:1px solid #eef6f5;display:flex;justify-content:space-between"><div><strong>${escapeHtml(n.titulo)}</strong><div style="color:var(--muted)">${escapeHtml(n.categoria)}</div></div><div><button class="btn" onclick="openEditNoticia('${n.id}')">Editar</button><button class="btn" onclick="deleteNoticia('${n.id}')">Deletar</button></div></div>`).join(''); }
function renderAdminEmpresas(){ const c = $('#admin-empresas-list'); if(!c) return; const arr = STATE.data.empresas; if(arr.length===0){ c.innerHTML = '<div class="empty-state">Sem empresas</div>'; return; } c.innerHTML = arr.map(n => `<div style="padding:12px;border-bottom:1px solid #eef6f5;display:flex;justify-content:space-between"><div><strong>${escapeHtml(n.nome)}</strong><div style="color:var(--muted)">${escapeHtml(n.ajuda||n.descricao)}</div></div><div><button class="btn" onclick="openEditEmpresa('${n.id}')">Editar</button><button class="btn" onclick="deleteEmpresa('${n.id}')">Deletar</button></div></div>`).join(''); }
function renderAdminDoacoes(){ const c = $('#admin-doacoes-list'); if(!c) return; const arr = STATE.data.doacoes; if(arr.length===0){ c.innerHTML = '<div class="empty-state">Sem pontos</div>'; return; } c.innerHTML = arr.map(n => `<div style="padding:12px;border-bottom:1px solid #eef6f5;display:flex;justify-content:space-between"><div><strong>${escapeHtml(n.nome)}</strong><div style="color:var(--muted)">${escapeHtml(n.bairro)} — ${(n.tiposDoacao||[]).join(', ')}</div></div><div><button class="btn" onclick="openEditDoacao('${n.id}')">Editar</button><button class="btn" onclick="deleteDoacao('${n.id}')">Deletar</button></div></div>`).join(''); }
function renderAdminChat(){ const c = $('#admin-chat-list'); if(!c) return; const arr = STATE.data.chat; if(arr.length===0){ c.innerHTML = '<div class="empty-state">Sem mensagens</div>'; return; } c.innerHTML = arr.map(m => `<div style="padding:12px;border-bottom:1px solid #eef6f5;display:flex;justify-content:space-between"><div><strong>${escapeHtml(m.usuario)}</strong><div style="color:var(--muted)">${escapeHtml(m.mensagem)}</div></div><div><button class="btn" onclick="deleteChat('${m.id}')">Deletar</button></div></div>`).join(''); }

// deletes
async function deleteOcorrencia(id){ if(!confirm('Deletar ocorrência?')) return; try{ await db.collection('ocorrencias').doc(id).delete(); showToast('Deletada'); }catch(e){ console.error(e); showToast('Erro'); } }
async function deleteNoticia(id){ if(!confirm('Deletar notícia?')) return; try{ await db.collection('noticias').doc(id).delete(); showToast('Deletada'); }catch(e){ console.error(e); showToast('Erro'); } }
async function deleteEmpresa(id){ if(!confirm('Deletar empresa?')) return; try{ await db.collection('empresas').doc(id).delete(); showToast('Deletada'); }catch(e){ console.error(e); showToast('Erro'); } }
async function deleteDoacao(id){ if(!confirm('Deletar ponto?')) return; try{ await db.collection('doacoes').doc(id).delete(); showToast('Deletado'); }catch(e){ console.error(e); showToast('Erro'); } }
async function deleteChat(id){ if(!confirm('Deletar mensagem?')) return; try{ await db.collection('chat').doc(id).delete(); showToast('Deletada'); }catch(e){ console.error(e); showToast('Erro'); } }

// Edit helpers require previewImageUrl to show existing remote images
function previewImageUrl(url, targetSelector){ const container = $(targetSelector); if(!container) return; container.innerHTML=''; const img = document.createElement('img'); img.src = url; img.style.maxWidth='100%'; img.style.borderRadius='8px'; container.appendChild(img); container.setAttribute('aria-hidden','false'); }

// Admin login
async function handleAdminLogin(e){ e.preventDefault(); const pass = $('#admin-password').value; if(pass === STATE.adminPassword){ STATE.adminLogged = true; closeModal('#admin-login-modal'); openAdminPanel(); showToast('Acesso concedido'); if(analytics) analytics.logEvent('admin_login'); } else { showToast('Senha incorreta'); if(analytics) analytics.logEvent('admin_login_failed'); } }

// Image compress/upload
function compressImageToBlob(file, maxWidth=1200, quality=0.8){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if(width > maxWidth){ height = Math.round((height * maxWidth)/width); width = maxWidth; }
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img,0,0,width,height);
        canvas.toBlob(blob => { if(!blob) reject('erro compressao'); else resolve(blob); }, 'image/jpeg', quality);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadAndCompressImage(file, folder = 'uploads'){
  if(!file) return null;
  if(file.size > 8 * 1024 * 1024) throw new Error('Arquivo muito grande (max 8MB)');
  const blob = await compressImageToBlob(file, 1200, 0.8);
  const filename = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2,9)}.jpg`;
  const ref = storage.ref().child(filename);
  const snap = await ref.put(blob);
  return await snap.ref.getDownloadURL();
}

// small search
function handleGlobalSearch(e){
  const term = (e.target.value||'').trim().toLowerCase();
  if(term.length < 2) return;
  const results = [];
  STATE.data.ocorrencias.forEach(o => { if((o.bairro||'').toLowerCase().includes(term) || (o.descricao||'').toLowerCase().includes(term) || (o.categoria||'').toLowerCase().includes(term)) results.push({tipo:'ocorrencia', item:o}); });
  STATE.data.noticias.forEach(n => { if((n.titulo||'').toLowerCase().includes(term) || (n.conteudo||'').toLowerCase().includes(term)) results.push({tipo:'noticia', item:n}); });
  STATE.data.empresas.forEach(emp => { if((emp.nome||'').toLowerCase().includes(term) || (emp.descricao||'').toLowerCase().includes(term)) results.push({tipo:'empresa', item:emp}); });
  showToast(`${results.length} resultados (veja console)`); console.log('Resultados busca:', results);
}

// Expor algumas funções necessárias a botoes inline
window.likeOcorrencia = likeOcorrencia;
window.openEditOcorrencia = openEditOcorrencia;
window.openEditNoticia = openEditNoticia;
window.openEditEmpresa = openEditEmpresa;
window.openEditDoacao = openEditDoacao;
window.deleteOcorrencia = deleteOcorrencia;
window.deleteNoticia = deleteNoticia;
window.deleteEmpresa = deleteEmpresa;
window.deleteDoacao = deleteDoacao;
window.deleteChat = deleteChat;

// init fallback
document.addEventListener('DOMContentLoaded', ()=> {
  renderHomeFeatured(); renderFeed(); renderNoticias(); renderEmpresas(); renderDoacoes(); renderChat();
});