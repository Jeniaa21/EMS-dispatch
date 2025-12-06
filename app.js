// Firebase
const firebaseConfig={
  apiKey:"AIzaSyBsHFp5MfmldTvcDkatE4P9gXNRZ1Ivk0o",
  authDomain:"YOUR_DOMAIN",
  projectId:"YOUR_PROJECT_ID"
};
firebase.initializeApp(firebaseConfig);
const db=firebase.firestore();

const board=document.getElementById('board');
const devToggle=document.getElementById('devToggle');
let devMode=false;
let columns=[];
let cards=[];

// Dev mode
devToggle.addEventListener('change',e=>{
  devMode=e.target.checked;
  document.body.classList.toggle('dev-on',devMode);
  setupMode();
});

function setupMode(){
  if(devMode){
    listenRealtime();
  }else{
    stopRealtime();
    listenHeartbeat();
    loadOnce();
  }
}

// HEARTBEAT
let heartbeatTimer=null;
function listenHeartbeat(){
  db.collection('meta').doc('heartbeat').onSnapshot(()=>{
    if(heartbeatTimer) return;
    heartbeatTimer=setTimeout(()=>{
      loadOnce();
      heartbeatTimer=null;
    },1000);
  });
}

function touchHeartbeat(){
  db.collection('meta').doc('heartbeat').set({
    updatedAt:firebase.firestore.FieldValue.serverTimestamp()
  },{merge:true});
}

// DATA
let unsub=[];
function listenRealtime(){
  unsub.push(
    db.collection('columns').onSnapshot(s=>{
      columns=s.docs.map(d=>({id:d.id,...d.data()}));
      render();
    })
  );
  unsub.push(
    db.collection('cards').onSnapshot(s=>{
      cards=s.docs.map(d=>({id:d.id,...d.data()}));
      render();
    })
  );
}

function stopRealtime(){
  unsub.forEach(u=>u());
  unsub=[];
}

async function loadOnce(){
  const c=await db.collection('columns').get();
  const t=await db.collection('cards').get();
  columns=c.docs.map(d=>({id:d.id,...d.data()}));
  cards=t.docs.map(d=>({id:d.id,...d.data()}));
  render();
}

// RENDER
function render(){
  board.innerHTML='';
  columns.forEach(col=>{
    const div=document.createElement('div');
    div.className='column';
    div.innerHTML=`<h2>${col.name}</h2>`;
    cards.filter(c=>c.columnId===col.id).forEach(card=>{
      const cd=document.createElement('div');
      cd.className='card';
      cd.textContent=card.title;
      div.appendChild(cd);
    });
    board.appendChild(div);
  });
}

// INIT
loadOnce();
