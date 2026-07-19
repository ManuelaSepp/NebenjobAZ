const SCRIPT_URL="https://script.google.com/macros/s/AKfycbzKK0n1cfQnNY_VQ-G6vSFveHqMiXaZ3sL2dZWVDUKx2XMw2ZtjliDurWSZPn8nomocWA/exec";
const $=id=>document.getElementById(id),state={eintraege:[],taetigkeiten:[],kalenderDatum:new Date(),ausgewaehlt:null,originalDatum:null,soll:6,saldo:0};
const form=$("entryForm"),datum=$("datum"),taetigkeitenListe=$("taetigkeitenListe"),freieBox=$("freieBox"),freieTaetigkeit=$("freieTaetigkeit"),beginn=$("beginn"),ende=$("ende"),abwesenheit=$("abwesenheit"),notiz=$("notiz"),meldung=$("meldung");
const save=$("saveButton"),update=$("updateButton"),del=$("deleteButton"),cancel=$("cancelButton"),buttonRow=$("buttonRow");

window.onload=init;
form.onsubmit=speichern;
update.onclick=aktualisieren;
del.onclick=loeschen;
cancel.onclick=()=>resetForm();
beginn.oninput=stundenBerechnen;
ende.oninput=stundenBerechnen;
abwesenheit.onchange=handleAbwesenheit;
$("prevMonth").onclick=()=>monatWechseln(-1);
$("nextMonth").onclick=()=>monatWechseln(1);
datum.onchange=datumGeaendert;

async function init(){
  datum.value=iso(new Date());
  state.ausgewaehlt=datum.value;
  state.kalenderDatum=ausIso(datum.value);
  stundenBerechnen();
  await ladeMonat();
}

function minuten(t){
  if(!t)return null;
  const[a,b]=t.split(":").map(Number);
  return a*60+b;
}

function stundenBerechnen(){
  if(abwesenheit.value){
    $("stundenAnzeige").textContent=format(state.soll);
    return state.soll;
  }

  const a=minuten(beginn.value),b=minuten(ende.value);
  let h=0;

  if(a!==null&&b!==null){
    let diff=b-a;
    if(diff<0)diff+=1440;
    h=diff/60;
  }

  $("stundenAnzeige").textContent=format(h);
  return h;
}

function ausgewaehlteTaetigkeiten(){
  return [...taetigkeitenListe.querySelectorAll('input[type="checkbox"]:checked')]
    .map(input=>input.value);
}

function freieOptionAktiv(){
  return ausgewaehlteTaetigkeiten().includes("Andere Tätigkeit …");
}

function handleTaetigkeiten(){
  freieBox.classList.toggle("hidden",!freieOptionAktiv());
  if(!freieOptionAktiv())freieTaetigkeit.value="";
}

function handleAbwesenheit(){
  const x=!!abwesenheit.value;

  taetigkeitenListe.classList.toggle("disabled",x);
  taetigkeitenListe.querySelectorAll('input[type="checkbox"]').forEach(input=>{
    input.disabled=x;
    if(x)input.checked=false;
  });

  freieTaetigkeit.disabled=x;
  beginn.disabled=x;
  ende.disabled=x;

  if(x){
    freieTaetigkeit.value="";
    freieBox.classList.add("hidden");
  }

  stundenBerechnen();
}

function renderListe(){
  taetigkeitenListe.innerHTML="";

  state.taetigkeiten.forEach(v=>{
    const label=document.createElement("label");
    label.className="activity-option";

    const input=document.createElement("input");
    input.type="checkbox";
    input.value=v;
    input.addEventListener("change",handleTaetigkeiten);

    const text=document.createElement("span");
    text.textContent=v;

    label.append(input,text);
    taetigkeitenListe.appendChild(label);
  });

  handleTaetigkeiten();
}

function taetigkeitenSetzen(text){
  const teile=String(text||"")
    .split(",")
    .map(v=>v.trim())
    .filter(Boolean);

  const bekannte=new Set(state.taetigkeiten);
  const unbekannt=[];

  taetigkeitenListe.querySelectorAll('input[type="checkbox"]').forEach(input=>{
    input.checked=teile.includes(input.value);
  });

  teile.forEach(teil=>{
    if(!bekannte.has(teil))unbekannt.push(teil);
  });

  if(unbekannt.length){
    const andere=taetigkeitenListe.querySelector('input[value="Andere Tätigkeit …"]');
    if(andere)andere.checked=true;
    freieTaetigkeit.value=unbekannt.join(", ");
  }else{
    freieTaetigkeit.value="";
  }

  handleTaetigkeiten();
}

function daten(){
  const ausgewaehlt=ausgewaehlteTaetigkeiten()
    .filter(v=>v!=="Andere Tätigkeit …");

  const frei=freieOptionAktiv()?freieTaetigkeit.value.trim():"";
  if(frei)ausgewaehlt.push(frei);

  return{
    datum:datum.value,
    taetigkeit:ausgewaehlt.join(", "),
    beginn:beginn.value,
    ende:ende.value,
    stunden:stundenBerechnen(),
    abwesenheit:abwesenheit.value,
    notiz:notiz.value
  };
}

function validiere(d){
  if(!d.datum)return"Bitte Datum auswählen.";
  if(d.abwesenheit)return"";
  if(!d.taetigkeit)return"Bitte mindestens eine Tätigkeit auswählen oder eintragen.";
  if(freieOptionAktiv()&&!freieTaetigkeit.value.trim())return"Bitte die weitere Tätigkeit eintragen.";
  if(!d.beginn||!d.ende)return"Bitte Beginn und Ende eintragen.";
  if(!(d.stunden>0))return"Die Arbeitszeit muss größer als 0 sein.";
  return"";
}

async function laden(){
  const r=await jsonp({
    action:"init",
    jahr:state.kalenderDatum.getFullYear(),
    monat:state.kalenderDatum.getMonth()+1
  });
  if(!r.ok)throw new Error(r.message);
  return r;
}

async function ladeMonat(){
  try{
    zeige("Lade Daten ...","");
    const r=await laden();
    state.eintraege=r.eintraege||[];
    state.taetigkeiten=r.taetigkeiten||[];
    state.soll=Number(r.sollstunden)||6;
    state.saldo=Number(r.gesamtSaldo)||0;
    renderListe();
    renderKalender();
    renderWoche();
    renderStatistik();
    zeige("","");
  }catch(e){
    zeige("Fehler: "+e.message,"error");
  }
}

async function speichern(e){
  e.preventDefault();
  const d=daten(),f=validiere(d);
  if(f)return zeige(f,"error");
  if(state.eintraege.some(x=>x.datum===d.datum)){
    return zeige("Für dieses Datum gibt es bereits einen Eintrag.","error");
  }
  await aktion("save",d);
}

async function aktualisieren(){
  const d={...daten(),originalDatum:state.originalDatum},f=validiere(d);
  if(f)return zeige(f,"error");
  await aktion("update",d);
}

async function loeschen(){
  if(!confirm("Eintrag wirklich löschen?"))return;
  await aktion("delete",{datum:state.originalDatum});
}

async function aktion(action,payload){
  try{
    zeige("Bitte warten ...","");
    const r=await jsonp({action,payload:JSON.stringify(payload)});
    if(!r.ok)throw new Error(r.message);
    zeige(r.message,"success");
    resetForm(false);
    await ladeMonat();
  }catch(e){
    zeige("Fehler: "+e.message,"error");
  }
}

function eintragLaden(e){
  state.originalDatum=e.datum;
  datum.value=e.datum;
  taetigkeitenSetzen(e.taetigkeit);
  beginn.value=e.beginn||"07:00";
  ende.value=e.ende||"13:00";
  abwesenheit.value=e.abwesenheit||"";
  notiz.value=e.notiz||"";
  handleAbwesenheit();
  editMode(true);
  window.scrollTo({top:0,behavior:"smooth"});
}

function resetForm(heute=true){
  state.originalDatum=null;
  editMode(false);

  taetigkeitenListe.querySelectorAll('input[type="checkbox"]').forEach(input=>{
    input.checked=false;
    input.disabled=false;
  });

  freieTaetigkeit.value="";
  beginn.value="07:00";
  ende.value="13:00";
  abwesenheit.value="";
  notiz.value="";

  if(heute){
    datum.value=iso(new Date());
    state.ausgewaehlt=datum.value;
  }

  handleTaetigkeiten();
  handleAbwesenheit();
  stundenBerechnen();
}

function editMode(a){
  save.hidden=a;
  update.hidden=!a;
  del.hidden=!a;
  buttonRow.classList.toggle("edit-mode",a);
}

function renderKalender(){
  const y=state.kalenderDatum.getFullYear(),m=state.kalenderDatum.getMonth(),first=new Date(y,m,1),last=new Date(y,m+1,0),offset=(first.getDay()+6)%7,map=new Map(state.eintraege.map(e=>[e.datum,e])),g=$("calendarGrid");

  $("monthLabel").textContent=state.kalenderDatum.toLocaleString("de-DE",{month:"long",year:"numeric"});
  g.innerHTML="";

  ["Mo","Di","Mi","Do","Fr","Sa","So"].forEach(n=>{
    const d=document.createElement("div");
    d.className="day-name";
    d.textContent=n;
    g.appendChild(d);
  });

  for(let i=0;i<offset;i++){
    const d=document.createElement("div");
    d.className="day-cell empty";
    g.appendChild(d);
  }

  for(let t=1;t<=last.getDate();t++){
    const dt=new Date(y,m,t),i=iso(dt),e=map.get(i),b=document.createElement("button");
    b.type="button";
    b.className="day-cell "+(e?(e.abwesenheit?"status-abwesenheit":"status-arbeit"):"")+(i===iso(new Date())?" today":"")+(i===state.ausgewaehlt?" selected":"");
    b.innerHTML=`<span class="day-number">${t}</span><span class="status-label">${e?(e.abwesenheit||format(e.stunden)+" h"):""}</span>`;
    b.onclick=()=>{
      state.ausgewaehlt=i;
      datum.value=i;
      e?eintragLaden(e):resetForm(false);
      datum.value=i;
      state.ausgewaehlt=i;
      renderKalender();
      renderWoche();
    };
    g.appendChild(b);
  }
}

function renderWoche(){
  const d=ausIso(state.ausgewaehlt||datum.value),kw=isoWoche(d),jahr=isoJahr(d);
  const ist=state.eintraege
    .filter(e=>{
      const x=ausIso(e.datum);
      return isoWoche(x)===kw&&isoJahr(x)===jahr;
    })
    .reduce((s,e)=>s+Number(e.anrechenbar||0),0);

  $("weekBox").innerHTML=`<strong>Diese Woche: ${format(ist)} von ${format(state.soll)} Stunden</strong><br>Wochensaldo: ${vorzeichen(ist-state.soll)} Stunden`;
}

function renderStatistik(){
  $("statStunden").textContent=format(
    state.eintraege.reduce((s,e)=>s+Number(e.stunden||0),0)
  );

  const el=$("statSaldo");
  el.textContent=vorzeichen(state.saldo);
  el.className=state.saldo>0?"plus":state.saldo<0?"minus":"";
}

async function datumGeaendert(){
  const d=ausIso(datum.value);
  const wechsel=d.getMonth()!==state.kalenderDatum.getMonth()||d.getFullYear()!==state.kalenderDatum.getFullYear();
  state.ausgewaehlt=datum.value;
  state.kalenderDatum=new Date(d.getFullYear(),d.getMonth(),1);
  wechsel?await ladeMonat():(renderKalender(),renderWoche());
}

async function monatWechseln(r){
  state.kalenderDatum=new Date(
    state.kalenderDatum.getFullYear(),
    state.kalenderDatum.getMonth()+r,
    1
  );
  state.ausgewaehlt=iso(state.kalenderDatum);
  datum.value=state.ausgewaehlt;
  await ladeMonat();
}

function jsonp(p){
  return new Promise((res,rej)=>{
    const cb="nebenjob"+Date.now()+Math.random().toString(36).slice(2),s=document.createElement("script"),t=setTimeout(()=>{
      clean();
      rej(new Error("Zeitüberschreitung"));
    },15000);

    function clean(){
      clearTimeout(t);
      delete window[cb];
      s.remove();
    }

    window[cb]=d=>{
      clean();
      res(d);
    };

    s.src=SCRIPT_URL+"?"+new URLSearchParams({...p,callback:cb,zeit:Date.now()});
    s.onerror=()=>{
      clean();
      rej(new Error("Verbindung fehlgeschlagen"));
    };

    document.head.appendChild(s);
  });
}

function iso(d){
  return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function ausIso(s){
  const[a,b,c]=s.split("-").map(Number);
  return new Date(a,b-1,c);
}

function isoWoche(d){
  const x=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  x.setUTCDate(x.getUTCDate()+4-(x.getUTCDay()||7));
  const y=new Date(Date.UTC(x.getUTCFullYear(),0,1));
  return Math.ceil((((x-y)/86400000)+1)/7);
}

function isoJahr(d){
  const x=new Date(d);
  x.setDate(x.getDate()+4-(x.getDay()||7));
  return x.getFullYear();
}

function format(v){
  return Number(v||0).toLocaleString("de-DE",{maximumFractionDigits:2});
}

function vorzeichen(v){
  return(v>0?"+":"")+format(v);
}

function zeige(t,k){
  meldung.textContent=t;
  meldung.className=k||"";
}
