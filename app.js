const SCRIPT_URL="https://script.google.com/macros/s/AKfycbzKK0n1cfQnNY_VQ-G6vSFveHqMiXaZ3sL2dZWVDUKx2XMw2ZtjliDurWSZPn8nomocWA/exec";
const $=id=>document.getElementById(id),state={eintraege:[],taetigkeiten:[],kalenderDatum:new Date(),ausgewaehlt:null,originalDatum:null,soll:6,saldo:0,monatSoll:0,monatHaben:0,monatSaldo:0,jahresSaldo:0,saldoJahr:new Date().getFullYear(),tooltipBlockDatum:null};
let ladeSequenz=0;
let jsonpSequenz=0;
const form=$("entryForm"),datum=$("datum"),taetigkeitenDropdown=$("taetigkeitenDropdown"),taetigkeitenButton=$("taetigkeitenButton"),taetigkeitenListe=$("taetigkeitenListe"),freieBox=$("freieBox"),freieTaetigkeit=$("freieTaetigkeit"),beginn=$("beginn"),ende=$("ende"),abwesenheit=$("abwesenheit"),notiz=$("notiz"),meldung=$("meldung");
const save=$("saveButton"),update=$("updateButton"),del=$("deleteButton"),cancel=$("cancelButton"),buttonRow=$("buttonRow");

window.onload=init;
form.onsubmit=speichern;
taetigkeitenButton.onclick=()=>taetigkeitenDropdown.classList.toggle("open");
document.addEventListener("click",e=>{
  if(!taetigkeitenDropdown.contains(e.target)){
    taetigkeitenDropdown.classList.remove("open");
  }
});
update.onclick=aktualisieren;
del.onclick=loeschen;
cancel.onclick=()=>resetForm();
beginn.oninput=stundenBerechnen;
ende.oninput=stundenBerechnen;
beginn.addEventListener("blur",()=>zeitFormatieren(beginn));
ende.addEventListener("blur",()=>zeitFormatieren(ende));
abwesenheit.onchange=handleAbwesenheit;
$("prevMonth").onclick=()=>monatWechseln(-1);
$("nextMonth").onclick=()=>monatWechseln(1);
datum.onchange=datumGeaendert;

async function init(){
  datum.value=iso(new Date());
  beginn.value="";
  ende.value="";
  state.ausgewaehlt=datum.value;
  state.kalenderDatum=ausIso(datum.value);
  stundenBerechnen();
  await ladeMonat();
}

function zeitFormatieren(feld){
  let v=String(feld.value||"").trim();

  if(!v){
    feld.value="";
    stundenBerechnen();
    return;
  }

  if(/^\d{1,2}:\d{2}$/.test(v)){
    const[h,m]=v.split(":").map(Number);
    if(h>=0&&h<=23&&m>=0&&m<=59){
      feld.value=String(h).padStart(2,"0")+":"+String(m).padStart(2,"0");
      stundenBerechnen();
      return;
    }
  }

  const nurZahlen=v.replace(/\D/g,"");
  if(nurZahlen.length===3||nurZahlen.length===4){
    const z=nurZahlen.padStart(4,"0");
    const h=Number(z.slice(0,2)),m=Number(z.slice(2,4));
    if(h>=0&&h<=23&&m>=0&&m<=59){
      feld.value=String(h).padStart(2,"0")+":"+String(m).padStart(2,"0");
      stundenBerechnen();
      return;
    }
  }

  stundenBerechnen();
}

function minuten(t){
  if(!t)return null;
  if(!/^\d{2}:\d{2}$/.test(t))return null;
  const[a,b]=t.split(":").map(Number);
  if(a<0||a>23||b<0||b>59)return null;
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
  aktualisiereTaetigkeitenAnzeige();
}

function aktualisiereTaetigkeitenAnzeige(){
  const werte=ausgewaehlteTaetigkeiten();
  taetigkeitenButton.textContent=werte.length?werte.join(", "):"Bitte wählen";
}

function handleAbwesenheit(){
  const x=!!abwesenheit.value;

  taetigkeitenListe.classList.toggle("disabled",x);
  taetigkeitenButton.disabled=x;
  if(x)taetigkeitenDropdown.classList.remove("open");
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
  aktualisiereTaetigkeitenAnzeige();
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

async function laden(jahr,monat){
  const r=await jsonp({
    action:"init",
    jahr,
    monat
  });
  if(!r.ok)throw new Error(r.message);
  return r;
}

function serverDatenUebernehmen(r,jahr){
  state.eintraege=r.eintraege||[];
  state.taetigkeiten=r.taetigkeiten||[];
  state.soll=Number(r.sollstunden)||6;
  state.saldo=Number(r.gesamtSaldo)||0;
  state.monatSoll=Number(r.monatSoll)||0;
  state.monatHaben=Number(r.monatHaben)||0;
  state.monatSaldo=Number(r.monatSaldo)||0;
  state.jahresSaldo=Number(r.jahresSaldo)||0;
  state.saldoJahr=Number(r.saldoJahr)||jahr;

  renderListe();
  renderKalender();
  renderWoche();
  renderMonat();
  renderStatistik();
}

async function ladeMonat(){
  const meineSequenz=++ladeSequenz;
  const jahr=state.kalenderDatum.getFullYear();
  const monat=state.kalenderDatum.getMonth()+1;

  setMonatsNavigationGesperrt(true);

  try{
    zeige("Lade Daten ...","");
    const r=await laden(jahr,monat);

    if(meineSequenz!==ladeSequenz)return;

    serverDatenUebernehmen(r,jahr);
    zeige("","");
  }catch(e){
    if(meineSequenz===ladeSequenz){
      zeige("Fehler: "+e.message,"error");
    }
  }finally{
    if(meineSequenz===ladeSequenz){
      setMonatsNavigationGesperrt(false);
    }
  }
}

function setMonatsNavigationGesperrt(gesperrt){
  $("prevMonth").disabled=gesperrt;
  $("nextMonth").disabled=gesperrt;
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

    const jahr=state.kalenderDatum.getFullYear();
    const monat=state.kalenderDatum.getMonth()+1;

    const r=await jsonp({
      action,
      payload:JSON.stringify(payload),
      jahr,
      monat
    });

    if(!r.ok)throw new Error(r.message);

    resetForm(false);
    serverDatenUebernehmen(r,jahr);
    zeige(r.message,"success");
  }catch(e){
    zeige("Fehler: "+e.message,"error");
  }
}

function eintragLaden(e){
  state.originalDatum=e.datum;
  datum.value=e.datum;
  taetigkeitenSetzen(e.taetigkeit);
  beginn.value=e.beginn||"";
  ende.value=e.ende||"";
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
  beginn.value="";
  ende.value="";
  abwesenheit.value="";
  notiz.value="";

  if(heute){
    datum.value=iso(new Date());
    state.ausgewaehlt=datum.value;
  }

  taetigkeitenDropdown.classList.remove("open");
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
    b.dataset.datum=i;
    b.className="day-cell "+(e?(e.abwesenheit?"status-abwesenheit":"status-arbeit"):"")+(i===iso(new Date())?" today":"")+(i===state.ausgewaehlt?" selected":"");
    b.innerHTML=`<span class="day-number">${t}</span><span class="status-label">${e?(e.abwesenheit||format(e.stunden)+" h"):""}</span>`;
    if(e){
      const tooltipText=tooltipFuerEintrag(e);
      b.title=tooltipText.replace(/\n/g," | ");
      b.addEventListener("mouseenter",event=>{
        if(state.tooltipBlockDatum===i)return;
        tooltipZeigen(event.currentTarget,tooltipText);
      });
      b.addEventListener("mousemove",event=>{
        if(state.tooltipBlockDatum===i)return;
        tooltipPositionieren(event.clientX,event.clientY);
      });
      b.addEventListener("mouseleave",()=>{
        if(state.tooltipBlockDatum===i)state.tooltipBlockDatum=null;
        tooltipAusblenden();
      });
    }
    b.onclick=()=>{
      state.tooltipBlockDatum=i;
      tooltipAusblenden();
      b.blur();
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

function tooltipFuerEintrag(e){
  const zeilen=[];
  const datumText=ausIso(e.datum).toLocaleDateString("de-DE",{weekday:"long",day:"2-digit",month:"2-digit",year:"numeric"});
  zeilen.push(datumText);

  if(e.abwesenheit){
    zeilen.push(e.abwesenheit+": "+format(e.stunden||state.soll)+" Stunden");
  }else{
    if(e.taetigkeit)zeilen.push("Tätigkeit: "+e.taetigkeit);
    if(e.beginn||e.ende)zeilen.push("Zeit: "+(e.beginn||"–")+" bis "+(e.ende||"–")+" Uhr");
    zeilen.push("Stunden: "+format(e.stunden)+" h");
  }

  if(e.notiz)zeilen.push("Notiz: "+e.notiz);
  return zeilen.join("\n");
}

function tooltipZeigen(element,text){
  const tooltip=$("calendarTooltip");
  if(!tooltip)return;
  tooltip.textContent=text;
  tooltip.classList.add("visible");
  const r=element.getBoundingClientRect();
  tooltipPositionieren(r.left+r.width/2,r.top);
}

function tooltipPositionieren(x,y){
  const tooltip=$("calendarTooltip");
  if(!tooltip||!tooltip.classList.contains("visible"))return;
  const abstand=12;
  const breite=tooltip.offsetWidth;
  const hoehe=tooltip.offsetHeight;
  let links=x-breite/2;
  let oben=y-hoehe-abstand;

  links=Math.max(8,Math.min(links,window.innerWidth-breite-8));
  if(oben<8)oben=y+abstand;

  tooltip.style.left=links+"px";
  tooltip.style.top=oben+"px";
}

function tooltipAusblenden(){
  const tooltip=$("calendarTooltip");
  if(tooltip)tooltip.classList.remove("visible");
}

document.addEventListener("mousemove",event=>{
  if(!state.tooltipBlockDatum)return;
  const tag=event.target.closest?.(".day-cell");
  const datumTag=tag?.dataset?.datum;
  if(datumTag!==state.tooltipBlockDatum){
    state.tooltipBlockDatum=null;
  }
});

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

function renderMonat(){
  $("monatSoll").textContent=format(state.monatSoll)+" h";
  $("monatHaben").textContent=format(state.monatHaben)+" h";
  const el=$("monatSaldo");
  el.textContent=vorzeichen(state.monatSaldo)+" h";
  el.className=state.monatSaldo>0?"plus":state.monatSaldo<0?"minus":"";
}

function renderStatistik(){
  $("statStunden").textContent=format(
    state.eintraege.reduce((s,e)=>s+Number(e.stunden||0),0)
  );

  const jahr=$("statJahr");
  jahr.textContent=vorzeichen(state.jahresSaldo);
  jahr.className=state.jahresSaldo>0?"plus":state.jahresSaldo<0?"minus":"";
  $("statJahrLabel").textContent="Jahressaldo "+state.saldoJahr;

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
  if($("prevMonth").disabled||$("nextMonth").disabled)return;

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
    const cb="nebenjobCallback_"+Date.now()+"_"+(++jsonpSequenz);
    const s=document.createElement("script");

    const t=setTimeout(()=>{
      clean();
      rej(new Error("Zeitüberschreitung"));
    },15000);

    function clean(){
      clearTimeout(t);
      try{delete window[cb]}catch(_){window[cb]=undefined}
      s.remove();
    }

    window[cb]=d=>{
      clean();
      res(d);
    };

    s.src=SCRIPT_URL+"?"+new URLSearchParams({
      ...p,
      callback:cb,
      zeit:Date.now()
    });

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
