// firebase-app.js
// Módulo ES: inicialização Firebase (Firestore/Storage/Auth) + helpers para site (inclui chat).
// CDN modular SDK 9.x (compatível com import type="module").

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-analytics.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, getDocs, query, where, orderBy, limit,
  onSnapshot, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { getStorage, ref as storageRef, getDownloadURL, uploadBytes } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js";

/* ==========================
   Configure seu firebaseConfig aqui.
   Verifique storageBucket no Console (normalmente "<project-id>.appspot.com").
   ========================== */
const firebaseConfig = {
  apiKey: "AIzaSyDD33nsm-Jk3vZt3pSxV6zBZDrWC8qWCp4",
  authDomain: "xanxwer.firebaseapp.com",
  projectId: "xanxwer",
  storageBucket: "xanxwer.firebasestorage.app", // confirme no Console
  messagingSenderId: "788787150303",
  appId: "1:788787150303:web:ac6dd538fe8a925ad7d86a",
  measurementId: "G-JYV9PW3BKN"
};

let app = null, db = null, storage = null, auth = null, analytics = null;
const DEFAULT_TIMEOUT_MS = 8000;

function withTimeout(promise, ms = DEFAULT_TIMEOUT_MS){
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Firebase')), ms))]);
}

/* ---------- Init ---------- */
export function initFirebase(config = firebaseConfig, options = { enableAnalytics: true, signInAnon: true }){
  if(app) return { app, db, storage, auth, analytics };
  app = initializeApp(config);
  db = getFirestore(app);
  storage = getStorage(app);
  auth = getAuth(app);
  if(options.enableAnalytics){
    try{ analytics = getAnalytics(app); } catch(e){ console.warn('Analytics não inicializado:', e.message); }
  }
  if(options.signInAnon) signInAnonymouslyIfNeeded().catch(e=>console.warn('signInAnonymously falhou:', e.message));
  console.info('Firebase inicializado');
  return { app, db, storage, auth, analytics };
}

/* ---------- Auth helpers ---------- */
export async function signInAnonymouslyIfNeeded(){
  if(!auth) throw new Error('Firebase não inicializado');
  if(auth.currentUser) return auth.currentUser;
  try{
    const res = await signInAnonymously(auth);
    return res.user;
  }catch(err){
    console.warn('signInAnonymously falhou:', err);
    return null;
  }
}

/* ---------- Firestore: municipal data ---------- */
/**
 * Espera documento: collection 'municipios' doc 'xanxere' com chaves: energia, ar, agua, co2, noticias, videos (opcional).
 */
export async function fetchMunicipalData({ collectionName = 'municipios', docId = 'xanxere' } = {}){
  if(!db) throw new Error('Firebase não inicializado');
  try{
    const ref = doc(db, collectionName, docId);
    const snap = await withTimeout(getDoc(ref));
    if(!snap.exists()) return {};
    return snap.data() || {};
  }catch(err){ console.warn('fetchMunicipalData erro', err); return {}; }
}

/* ---------- Noticias ---------- */
export async function fetchNews({ collectionName = 'noticias', municipio = 'xanxere', limitSize = 10 } = {}){
  if(!db) throw new Error('Firebase não inicializado');
  try{
    const col = collection(db, collectionName);
    const q = query(col, where('municipio','==',municipio), orderBy('date','desc'), limit(limitSize));
    const snaps = await withTimeout(getDocs(q));
    const items = [];
    snaps.forEach(d => items.push({ id: d.id, ...d.data() }));
    return items;
  }catch(err){ console.warn('fetchNews erro', err); return []; }
}

export function listenNews({ collectionName = 'noticias', municipio = 'xanxere', onUpdate, limitSize = 20 } = {}){
  if(!db) throw new Error('Firebase não inicializado');
  const col = collection(db, collectionName);
  const q = query(col, where('municipio','==',municipio), orderBy('date','desc'), limit(limitSize));
  const unsub = onSnapshot(q, snapshot=>{
    const items = [];
    snapshot.forEach(d => items.push({ id: d.id, ...d.data() }));
    try{ onUpdate && onUpdate(items); }catch(e){ console.error('onUpdate callback erro', e); }
  }, err => console.error('listenNews erro', err));
  return unsub;
}

/* ---------- Videos ---------- */
export async function fetchVideos({ collectionName = 'videos', municipio = 'xanxere', limitSize = 20 } = {}){
  if(!db) throw new Error('Firebase não inicializado');
  try{
    const col = collection(db, collectionName);
    const q = query(col, where('municipio','==',municipio), orderBy('publishedAt','desc'), limit(limitSize));
    const snaps = await withTimeout(getDocs(q));
    const items = [];
    snaps.forEach(d => items.push({ id: d.id, ...d.data() }));
    return items;
  }catch(err){ console.warn('fetchVideos erro', err); return []; }
}

/* ---------- Chat (coleção 'chat') ---------- */
/**
 * Envia mensagem de chat
 * documento: collection 'chat' campos: municipio, author, text, createdAt
 */
export async function sendChatMessage({ municipio = 'xanxere', author = 'Visitante', text = '' } = {}){
  if(!db) throw new Error('Firebase não inicializado');
  if(!text || text.trim().length === 0) return null;
  const safeText = String(text).trim().slice(0, 1000);
  try{
    const docRef = await addDoc(collection(db, 'chat'), {
      municipio,
      author,
      text: safeText,
      createdAt: serverTimestamp()
    });
    return { id: docRef.id };
  }catch(err){
    console.error('sendChatMessage erro', err);
    throw err;
  }
}

/**
 * Escuta chat em tempo real (onSnapshot)
 */
export function listenChat({ municipio = 'xanxere', onUpdate, limitSize = 200 } = {}){
  if(!db) throw new Error('Firebase não inicializado');
  const col = collection(db, 'chat');
  const q = query(col, where('municipio','==',municipio), orderBy('createdAt','asc'), limit(limitSize));
  const unsub = onSnapshot(q, snapshot=>{
    const msgs = [];
    snapshot.forEach(d => msgs.push({ id: d.id, ...d.data() }));
    try{ onUpdate && onUpdate(msgs); }catch(e){ console.error('onUpdate handler erro', e); }
  }, err => console.error('listenChat erro', err));
  return unsub;
}

/* ---------- Storage helpers ---------- */
export async function getImageURL(path){
  if(!storage) throw new Error('Firebase não inicializado');
  try{
    const ref = storageRef(storage, path);
    const url = await withTimeout(getDownloadURL(ref));
    return url;
  }catch(err){ console.warn('getImageURL erro', err); return null; }
}

export async function uploadImage(file, destino){
  if(!storage) throw new Error('Firebase não inicializado');
  if(!file || !destino) throw new Error('file e destino obrigatórios');
  try{
    const ref = storageRef(storage, destino);
    const snap = await withTimeout(uploadBytes(ref, file));
    const url = await getDownloadURL(ref);
    return { fullPath: snap.ref.fullPath, url };
  }catch(err){ console.error('uploadImage erro', err); throw err; }
}

/* ---------- Chart helper ---------- */
export function updateChartData(chart, labels, data, labelName = ''){
  if(!chart) return;
  chart.data.labels = labels;
  chart.data.datasets = [{ label: labelName || (chart.data.datasets[0] && chart.data.datasets[0].label) || '', data, backgroundColor: chart.data.datasets[0]?.backgroundColor || '#2f8f4a' }];
  chart.update();
}

/* ---------- Export default ---------- */
export default {
  initFirebase,
  signInAnonymouslyIfNeeded,
  fetchMunicipalData,
  fetchNews,
  listenNews,
  fetchVideos,
  getImageURL,
  uploadImage,
  sendChatMessage,
  listenChat,
  updateChartData
};