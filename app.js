const SCRIPT_URL="https://script.google.com/macros/s/AKfycbzKK0n1cfQnNY_VQ-G6vSFveHqMiXaZ3sL2dZWVDUKx2XMw2ZtjliDurWSZPn8nomocWA/exec";
const $=id=>document.getElementById(id),state={eintraege:[],taetigkeiten:[],kalenderDatum:new Date(),ausgewaehlt:null,originalDatum:null,soll:6,saldo:0,monatSoll:0,monatHaben:0,monatSaldo:0,jahresSaldo:0,saldoJahr:new Date().getFullYear(),startDatum:"2026-01-01",startSaldo:null,cacheJahr:null,jahresEintraege:[],tooltipBlockDatum:null};
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
$("exportExcel").onclick=exportExcel;
$("exportPdf").onclick=exportPdf;

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
  if(!d.beginn||!d.ende)return"Bitte Beginn und Ende eintragen.";
  if(!(d.stunden>0))return"Die Arbeitszeit muss größer als 0 sein.";
  return"";
}

async function laden(jahr,monat){
  let letzterFehler=null;

  for(let versuch=1;versuch<=2;versuch++){
    try{
      const r=await jsonp({
        action:"init",
        jahr,
        monat
      });

      if(!r.ok)throw new Error(r.message);
      return r;
    }catch(e){
      letzterFehler=e;

      if(versuch<2){
        await new Promise(resolve=>setTimeout(resolve,1000));
      }
    }
  }

  throw letzterFehler;
}

function serverDatenUebernehmen(r,jahr){
  state.taetigkeiten=r.taetigkeiten||[];
  state.soll=Number(r.sollstunden)||6;
  state.saldo=Number(r.gesamtSaldo)||0;
  state.jahresSaldo=Number(r.jahresSaldo)||0;
  state.saldoJahr=Number(r.saldoJahr)||jahr;
  state.startDatum=String(r.startDatum||state.startDatum||"2026-01-01");

  const startJahr=ausIso(state.startDatum).getFullYear();
  if(state.startSaldo===null && state.saldoJahr===startJahr){
    state.startSaldo=state.saldo-state.jahresSaldo;
  }

  if(Array.isArray(r.eintraegeJahr)){
    state.cacheJahr=jahr;
    state.jahresEintraege=r.eintraegeJahr;
    monatLokalSetzen(
      jahr,
      state.kalenderDatum.getMonth()+1,
      false
    );
  }else{
    state.cacheJahr=null;
    state.jahresEintraege=[];
    state.eintraege=r.eintraege||[];
    state.monatSoll=Number(r.monatSoll)||0;
    state.monatHaben=Number(r.monatHaben)||0;
    state.monatSaldo=Number(r.monatSaldo)||0;
  }

  renderListe();
  renderKalender();
  renderWoche();
  renderMonat();
  renderStatistik();
}

function mittwocheImMonat(jahr,monat){
  let anzahl=0;
  const ende=new Date(jahr,monat,0).getDate();

  for(let tag=1;tag<=ende;tag++){
    if(new Date(jahr,monat-1,tag).getDay()===3)anzahl++;
  }

  return anzahl;
}

function monatLokalSetzen(jahr,monat,rendern=true){
  if(state.cacheJahr!==jahr)return false;

  state.eintraege=state.jahresEintraege
    .filter(e=>{
      const d=ausIso(e.datum);
      return d.getFullYear()===jahr&&d.getMonth()===monat-1;
    })
    .sort((a,b)=>a.datum.localeCompare(b.datum));

  state.monatSoll=mittwocheImMonat(jahr,monat)*state.soll;
  state.monatHaben=state.eintraege.reduce(
    (sum,e)=>sum+Number(e.anrechenbar||0),
    0
  );
  state.monatSaldo=state.monatHaben-state.monatSoll;

  if(rendern){
    renderKalender();
    renderWoche();
    renderMonat();
    renderStatistik();
    zeige("","");
  }

  return true;
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

function beitragFuerSaldo(e){
  if(!e||!e.datum)return 0;

  const d=ausIso(e.datum);
  const heute=new Date();
  const monatsEnde=new Date(
    heute.getFullYear(),
    heute.getMonth()+1,
    0
  );

  if(d>monatsEnde)return 0;

  return Number(e.anrechenbar||0);
}

function lokalerEintragAusPayload(payload){
  const abw=String(payload.abwesenheit||"");

  return{
    datum:String(payload.datum||""),
    taetigkeit:abw?"":String(payload.taetigkeit||""),
    beginn:abw?"":String(payload.beginn||""),
    ende:abw?"":String(payload.ende||""),
    stunden:abw?0:(Number(payload.stunden)||0),
    abwesenheit:abw,
    anrechenbar:abw?state.soll:(Number(payload.stunden)||0),
    notiz:String(payload.notiz||"")
  };
}

function monatswerteLokalNeu(){
  state.monatHaben=state.eintraege.reduce(
    (sum,e)=>sum+Number(e.anrechenbar||0),
    0
  );
  state.monatSaldo=state.monatHaben-state.monatSoll;
}

function lokalerStandNachAktion(action,payload,alt){
  const jahr=state.kalenderDatum.getFullYear();
  const monat=state.kalenderDatum.getMonth();

  if(action==="delete"){
    state.eintraege=state.eintraege.filter(
      e=>e.datum!==payload.datum
    );

    if(
      alt &&
      state.cacheJahr===ausIso(alt.datum).getFullYear()
    ){
      state.jahresEintraege=state.jahresEintraege.filter(
        e=>e.datum!==alt.datum
      );
    }

    const altBeitrag=beitragFuerSaldo(alt);

    if(alt&&ausIso(alt.datum).getFullYear()===state.saldoJahr){
      state.jahresSaldo-=altBeitrag;
    }
    state.saldo-=altBeitrag;
  }else{
    const neu=lokalerEintragAusPayload(payload);

    if(action==="update"&&alt){
      state.eintraege=state.eintraege.filter(
        e=>e.datum!==alt.datum
      );

      if(state.cacheJahr===ausIso(alt.datum).getFullYear()){
        state.jahresEintraege=state.jahresEintraege.filter(
          e=>e.datum!==alt.datum
        );
      }

      if(state.cacheJahr===ausIso(neu.datum).getFullYear()){
        state.jahresEintraege.push(neu);
        state.jahresEintraege.sort((a,b)=>a.datum.localeCompare(b.datum));
      }

      const altBeitrag=beitragFuerSaldo(alt);
      const neuBeitrag=beitragFuerSaldo(neu);

      if(ausIso(alt.datum).getFullYear()===state.saldoJahr){
        state.jahresSaldo-=altBeitrag;
      }
      if(ausIso(neu.datum).getFullYear()===state.saldoJahr){
        state.jahresSaldo+=neuBeitrag;
      }

      state.saldo+=neuBeitrag-altBeitrag;
    }else{
      if(state.cacheJahr===ausIso(neu.datum).getFullYear()){
        state.jahresEintraege.push(neu);
        state.jahresEintraege.sort((a,b)=>a.datum.localeCompare(b.datum));
      }

      const neuBeitrag=beitragFuerSaldo(neu);

      if(ausIso(neu.datum).getFullYear()===state.saldoJahr){
        state.jahresSaldo+=neuBeitrag;
      }
      state.saldo+=neuBeitrag;
    }

    const nd=ausIso(neu.datum);
    if(nd.getFullYear()===jahr&&nd.getMonth()===monat){
      state.eintraege.push(neu);
      state.eintraege.sort((a,b)=>a.datum.localeCompare(b.datum));
    }
  }

  monatswerteLokalNeu();
  renderKalender();
  renderWoche();
  renderMonat();
  renderStatistik();
}

async function schreibenPerPost(action,payload){
  const body=new URLSearchParams({
    action:action,
    payload:JSON.stringify(payload),
    zeit:String(Date.now())
  });

  await fetch(SCRIPT_URL,{
    method:"POST",
    mode:"no-cors",
    body:body,
    cache:"no-store"
  });
}

async function aktion(action,payload){
  const alt=action==="update"
    ? state.eintraege.find(e=>e.datum===payload.originalDatum)
    : action==="delete"
      ? state.eintraege.find(e=>e.datum===payload.datum)
      : null;

  try{
    zeige(
      action==="delete" ? "Lösche Eintrag ..." : "Speichere Eintrag ...",
      ""
    );

    await schreibenPerPost(action,payload);

    lokalerStandNachAktion(action,payload,alt);
    resetForm(false);

    const text=
      action==="delete"
        ? "Eintrag gelöscht ✅"
        : action==="update"
          ? "Änderung gespeichert ✅"
          : "Gespeichert ✅";

    zeige(text,"success");
  }catch(e){
    zeige("Fehler beim Senden: "+e.message,"error");
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
  const d=ausIso(state.ausgewaehlt||datum.value);
  const kw=isoWoche(d);
  const jahr=isoJahr(d);

  const quelle=
    state.cacheJahr!==null && state.jahresEintraege.length
      ? state.jahresEintraege
      : state.eintraege;

  const ist=quelle
    .filter(e=>{
      const x=ausIso(e.datum);
      return isoWoche(x)===kw&&isoJahr(x)===jahr;
    })
    .reduce((s,e)=>s+Number(e.anrechenbar||0),0);

  const tag=d.getDay()||7;
  const montag=new Date(d);
  montag.setDate(d.getDate()-(tag-1));

  const mittwoch=new Date(montag);
  mittwoch.setDate(montag.getDate()+2);

  const start=ausIso(state.startDatum||"2026-01-01");
  const wochenSoll=mittwoch>=start ? state.soll : 0;

  $("weekBox").innerHTML=`<strong>Diese Woche: ${format(ist)} von ${format(wochenSoll)} Stunden</strong><br>Wochensaldo: ${vorzeichen(ist-wochenSoll)} Stunden`;
}

function renderMonat(){
  $("monatSoll").textContent=format(state.monatSoll)+" h";
  $("monatHaben").textContent=format(state.monatHaben)+" h";
  const el=$("monatSaldo");
  el.textContent=vorzeichen(state.monatSaldo)+" h";
  el.className=state.monatSaldo>0?"plus":state.monatSaldo<0?"minus":"";
}

function jahresZeitkonto(jahr){
  const heute=new Date();
  const start=ausIso(state.startDatum||"2026-01-01");
  const jahresStart=new Date(jahr,0,1);
  const startImJahr=start>jahresStart?start:jahresStart;

  let ende;
  if(jahr<heute.getFullYear()){
    ende=new Date(jahr,11,31);
  }else if(jahr===heute.getFullYear()){
    ende=new Date(jahr,heute.getMonth()+1,0);
  }else{
    return {soll:0,haben:0,saldo:0};
  }

  if(startImJahr>ende)return {soll:0,haben:0,saldo:0};

  let mittwoche=0;
  for(let d=new Date(startImJahr);d<=ende;d.setDate(d.getDate()+1)){
    if(d.getDay()===3)mittwoche++;
  }

  const haben=state.jahresEintraege
    .filter(e=>{
      const d=ausIso(e.datum);
      return d>=startImJahr&&d<=ende;
    })
    .reduce((sum,e)=>sum+Number(e.anrechenbar||0),0);

  const soll=mittwoche*state.soll;
  return {soll,haben,saldo:haben-soll};
}

function monatsSaldoFuerUebersicht(jahr,monat){
  const heute=new Date();
  const start=ausIso(state.startDatum||"2026-01-01");
  const monatsStart=new Date(jahr,monat-1,1);
  const monatsEnde=new Date(jahr,monat,0);

  if(monatsEnde<start)return null;
  if(jahr>heute.getFullYear())return null;
  if(jahr===heute.getFullYear()&&monat>heute.getMonth()+1)return null;

  const wirksamerStart=start>monatsStart?start:monatsStart;

  let mittwoche=0;
  for(let d=new Date(wirksamerStart);d<=monatsEnde;d.setDate(d.getDate()+1)){
    if(d.getDay()===3)mittwoche++;
  }

  const haben=state.jahresEintraege
    .filter(e=>{
      const d=ausIso(e.datum);
      return d>=wirksamerStart&&d<=monatsEnde;
    })
    .reduce((sum,e)=>sum+Number(e.anrechenbar||0),0);

  return haben-(mittwoche*state.soll);
}

function wertSetzen(id,wert,mitVorzeichen=false){
  const el=$(id);
  if(!el)return;
  el.textContent=(mitVorzeichen?vorzeichen(wert):format(wert))+" h";
  el.className=wert>0?"plus":wert<0?"minus":"";
}

function renderStatistik(){
  const jahr=state.kalenderDatum.getFullYear();
  const jahrWerte=jahresZeitkonto(jahr);

  $("zeitkontoMonatTitel").textContent=
    state.kalenderDatum.toLocaleString("de-DE",{month:"long",year:"numeric"});
  wertSetzen("zkMonatSoll",state.monatSoll);
  wertSetzen("zkMonatHaben",state.monatHaben);
  wertSetzen("zkMonatSaldo",state.monatSaldo,true);

  $("zeitkontoJahrTitel").textContent="Jahr "+jahr;
  wertSetzen("zkJahrSoll",jahrWerte.soll);
  wertSetzen("zkJahrHaben",jahrWerte.haben);
  wertSetzen("zkJahrSaldo",jahrWerte.saldo,true);

  const startSaldo=state.startSaldo===null
    ? state.saldo-state.jahresSaldo
    : state.startSaldo;
  const veraenderung=state.saldo-startSaldo;

  wertSetzen("zkStartsaldo",startSaldo,true);
  wertSetzen("zkVeraenderung",veraenderung,true);
  wertSetzen("zkGesamtsaldo",state.saldo,true);

  const namen=["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
  const grid=$("monatsSaldoGrid");
  if(!grid)return;

  grid.innerHTML="";
  namen.forEach((name,index)=>{
    const saldo=monatsSaldoFuerUebersicht(jahr,index+1);
    const box=document.createElement("div");
    box.className="year-month";

    const label=document.createElement("span");
    label.textContent=name;

    const wert=document.createElement("strong");
    if(saldo===null){
      wert.textContent="—";
    }else{
      wert.textContent=vorzeichen(saldo)+" h";
      wert.className=saldo>0?"plus":saldo<0?"minus":"";
    }

    box.append(label,wert);
    grid.appendChild(box);
  });
}

async function datumGeaendert(){
  const d=ausIso(datum.value);
  const wechsel=d.getMonth()!==state.kalenderDatum.getMonth()||d.getFullYear()!==state.kalenderDatum.getFullYear();
  state.ausgewaehlt=datum.value;
  state.kalenderDatum=new Date(d.getFullYear(),d.getMonth(),1);

  if(!wechsel){
    renderKalender();
    renderWoche();
    return;
  }

  if(monatLokalSetzen(d.getFullYear(),d.getMonth()+1))return;
  await ladeMonat();
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

  const jahr=state.kalenderDatum.getFullYear();
  const monat=state.kalenderDatum.getMonth()+1;

  if(monatLokalSetzen(jahr,monat))return;
  await ladeMonat();
}


function exportQuelle(jahr){
  if(state.cacheJahr===jahr && Array.isArray(state.jahresEintraege)){
    return state.jahresEintraege;
  }
  return state.eintraege.filter(e=>ausIso(e.datum).getFullYear()===jahr);
}

function monatsWerteFuerExport(jahr,monat){
  const start=ausIso(state.startDatum||"2026-01-01");
  const monatsStart=new Date(jahr,monat-1,1);
  const monatsEnde=new Date(jahr,monat,0);

  if(monatsEnde<start){
    return {soll:0,haben:0,saldo:0,daten:[]};
  }

  const wirksamerStart=start>monatsStart?start:monatsStart;
  let mittwoche=0;

  for(let d=new Date(wirksamerStart);d<=monatsEnde;d.setDate(d.getDate()+1)){
    if(d.getDay()===3)mittwoche++;
  }

  const daten=exportQuelle(jahr)
    .filter(e=>{
      const d=ausIso(e.datum);
      return d>=wirksamerStart&&d<=monatsEnde;
    })
    .sort((a,b)=>a.datum.localeCompare(b.datum));

  const haben=daten.reduce((sum,e)=>sum+Number(e.anrechenbar||0),0);
  const soll=mittwoche*state.soll;

  return {soll,haben,saldo:haben-soll,daten};
}

function exportStartsaldo(){
  return state.startSaldo===null
    ? state.saldo-state.jahresSaldo
    : state.startSaldo;
}

function kontostandBisMonat(jahr,monat){
  const start=ausIso(state.startDatum||"2026-01-01");
  const startJahr=start.getFullYear();
  if(jahr!==startJahr)return null;

  let stand=exportStartsaldo();
  for(let m=start.getMonth()+1;m<=monat;m++){
    stand+=monatsWerteFuerExport(jahr,m).saldo;
  }
  return stand;
}

function exportKontext(){
  const art=$("exportZeitraum").value;
  const jahr=state.kalenderDatum.getFullYear();
  const monat=state.kalenderDatum.getMonth()+1;

  if(art==="jahr" && state.cacheJahr!==jahr){
    throw new Error("Jahresdaten sind noch nicht vollständig geladen. Bitte einmal neu laden.");
  }

  const startSaldo=exportStartsaldo();

  if(art==="monat"){
    const mw=monatsWerteFuerExport(jahr,monat);
    const standEnde=kontostandBisMonat(jahr,monat);
    const standAnfang=monat>1
      ? kontostandBisMonat(jahr,monat-1)
      : startSaldo;

    return{
      art,
      jahr,
      monat,
      titel:state.kalenderDatum.toLocaleString("de-DE",{month:"long",year:"numeric"}),
      soll:mw.soll,
      haben:mw.haben,
      saldo:mw.saldo,
      startSaldo,
      standAnfang,
      standEnde,
      gesamtSaldo:standEnde,
      daten:mw.daten
    };
  }

  const jw=jahresZeitkonto(jahr);
  const heute=new Date();
  const bisMonat=jahr===heute.getFullYear()?heute.getMonth()+1:12;
  const standEnde=kontostandBisMonat(jahr,bisMonat);
  const start=ausIso(state.startDatum||"2026-01-01");

  const daten=exportQuelle(jahr)
    .filter(e=>{
      const d=ausIso(e.datum);
      const ende=new Date(jahr,bisMonat,0);
      return d.getFullYear()===jahr && d>=start && d<=ende;
    })
    .sort((a,b)=>a.datum.localeCompare(b.datum));

  return{
    art,
    jahr,
    monat,
    titel:"Jahr "+jahr,
    soll:jw.soll,
    haben:jw.haben,
    saldo:jw.saldo,
    startSaldo,
    standAnfang:startSaldo,
    standEnde,
    gesamtSaldo:standEnde,
    daten
  };
}

function exportZeile(e){
  const d=ausIso(e.datum);
  return{
    datum:d,
    datumText:d.toLocaleDateString("de-DE"),
    wochentag:d.toLocaleDateString("de-DE",{weekday:"short"}),
    beginn:e.abwesenheit?"":String(e.beginn||""),
    ende:e.abwesenheit?"":String(e.ende||""),
    stunden:Number(e.anrechenbar||e.stunden||0),
    art:String(e.abwesenheit||"Arbeit")
  };
}

function farbeFuerSaldo(v){
  return v<0?"C00000":v>0?"548235":"222222";
}

async function exportExcel(){
  try{
    if(typeof ExcelJS==="undefined"){
      throw new Error("Excel-Modul konnte nicht geladen werden. Bitte Internetverbindung prüfen.");
    }

    const x=exportKontext();
    const zeilen=x.daten.map(exportZeile);
    const wb=new ExcelJS.Workbook();
    wb.creator="Arbeitszeit Nebenjob";
    wb.created=new Date();

    const ws=wb.addWorksheet("Arbeitszeit");
    ws.mergeCells("A1:F1");
    ws.getCell("A1").value="Arbeitszeitnachweis - "+x.titel;
    ws.getCell("A1").font={bold:true,size:16};
    ws.getCell("A2").value="Export ohne Tätigkeiten";
    ws.getCell("A2").font={italic:true,color:{argb:"666666"}};

    const summary=x.art==="monat"
      ?[
        ["Kontostand Monatsanfang",x.standAnfang],
        ["Soll",x.soll],
        ["Haben",x.haben],
        ["Monatssaldo",x.saldo],
        ["Kontostand Monatsende",x.standEnde]
      ]
      :[
        ["Startsaldo Zeitkonto",x.startSaldo],
        ["Soll",x.soll],
        ["Haben",x.haben],
        ["Jahressaldo",x.saldo],
        ["Gesamtsaldo inkl. Startsaldo",x.standEnde]
      ];

    summary.forEach((r,i)=>{
      const row=4+i;
      ws.mergeCells(row,1,row,3);
      ws.getCell(row,1).value=r[0];
      ws.getCell(row,1).font={bold:true};
      ws.getCell(row,4).value=Number(r[1]||0);
      ws.getCell(row,4).numFmt='0.00 "h"';
      ws.getCell(row,4).font={bold:true,color:{argb:farbeFuerSaldo(Number(r[1]||0))}};
    });

    const headerRow=11;
    const headers=["Datum","Wochentag","Beginn","Ende","Stunden","Art"];
    headers.forEach((h,i)=>{
      const c=ws.getCell(headerRow,i+1);
      c.value=h;
      c.font={bold:true,color:{argb:"FFFFFF"}};
      c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"70AD47"}};
      c.alignment={vertical:"middle"};
    });

    zeilen.forEach((z,idx)=>{
      const row=headerRow+1+idx;
      const excelDatum=Date.UTC(
        z.datum.getFullYear(),
        z.datum.getMonth(),
        z.datum.getDate()
      )/86400000+25569;
      ws.getCell(row,1).value=excelDatum;
      ws.getCell(row,1).numFmt="dd.mm.yyyy";
      ws.getCell(row,2).value=z.wochentag;
      ws.getCell(row,3).value=z.beginn;
      ws.getCell(row,4).value=z.ende;
      ws.getCell(row,5).value=z.stunden;
      ws.getCell(row,5).numFmt='0.00';
      ws.getCell(row,6).value=z.art;
    });

    const excelBreiten=[
      Math.max(12,...zeilen.map(z=>z.datumText.length+2)),
      Math.max(12,...zeilen.map(z=>z.wochentag.length+2)),
      Math.max(8,...zeilen.map(z=>z.beginn.length+2)),
      Math.max(8,...zeilen.map(z=>z.ende.length+2)),
      Math.max(9,...zeilen.map(z=>format(z.stunden).length+2)),
      Math.max(8,...zeilen.map(z=>z.art.length+2))
    ];
    ws.columns=excelBreiten.map(width=>({width}));
    ws.views=[{state:"frozen",ySplit:headerRow}];
    ws.autoFilter={from:{row:headerRow,column:1},to:{row:headerRow,column:6}};

    if(x.art==="jahr"){
      const ms=wb.addWorksheet("Monatssalden");
      const monate=["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];

      ms.addRow(["Monat","Soll","Haben","Saldo","Kontostand"]);
      const hr=ms.getRow(1);
      hr.font={bold:true,color:{argb:"FFFFFF"}};
      hr.fill={type:"pattern",pattern:"solid",fgColor:{argb:"70AD47"}};

      let stand=x.startSaldo;
      const heute=new Date();
      const maxMonat=x.jahr===heute.getFullYear()?heute.getMonth()+1:12;

      for(let m=1;m<=12;m++){
        if(m>maxMonat){
          ms.addRow([monate[m-1],"","","",""]);
          continue;
        }
        const mw=monatsWerteFuerExport(x.jahr,m);
        stand+=mw.saldo;
        const r=ms.addRow([monate[m-1],mw.soll,mw.haben,mw.saldo,stand]);
        [2,3,4,5].forEach(c=>r.getCell(c).numFmt='0.00 "h"');
        r.getCell(4).font={color:{argb:farbeFuerSaldo(mw.saldo)}};
        r.getCell(5).font={bold:true,color:{argb:farbeFuerSaldo(stand)}};
      }

      ms.columns=[{width:16},{width:12},{width:12},{width:12},{width:16}];
      ms.views=[{state:"frozen",ySplit:1}];
    }

    const buffer=await wb.xlsx.writeBuffer();
    const blob=new Blob([buffer],{
      type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=x.art==="monat"
      ?"Arbeitszeit_"+x.jahr+"-"+String(x.monat).padStart(2,"0")+".xlsx"
      :"Arbeitszeit_"+x.jahr+".xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){
    zeige("Excel-Export: "+e.message,"error");
  }
}

function htmlSicher(v){
  return String(v??"")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function exportPdf(){
  try{
    const x=exportKontext();
    const zeilen=x.daten.map(exportZeile);
    const fenster=window.open("","_blank");

    if(!fenster){
      throw new Error("PDF-Fenster konnte nicht geöffnet werden.");
    }

    const summary=x.art==="monat"
      ?[
        ["Kontostand Monatsanfang",x.standAnfang],
        ["Soll",x.soll],
        ["Haben",x.haben],
        ["Monatssaldo",x.saldo],
        ["Kontostand Monatsende",x.standEnde]
      ]
      :[
        ["Startsaldo Zeitkonto",x.startSaldo],
        ["Soll",x.soll],
        ["Haben",x.haben],
        ["Jahressaldo",x.saldo],
        ["Gesamtsaldo inkl. Startsaldo",x.standEnde]
      ];

    const summaryHtml=summary.map(r=>{
      const cls=Number(r[1])<0?"minus":Number(r[1])>0?"plus":"";
      return '<div><span>'+htmlSicher(r[0])+'</span><strong class="'+cls+'">'+
        htmlSicher(vorzeichen(Number(r[1]||0)))+' h</strong></div>';
    }).join("");

    const body=zeilen.map(z=>
      '<tr>'+
      '<td>'+htmlSicher(z.datumText)+'</td>'+
      '<td>'+htmlSicher(z.wochentag)+'</td>'+
      '<td>'+htmlSicher(z.beginn)+'</td>'+
      '<td>'+htmlSicher(z.ende)+'</td>'+
      '<td class="num">'+htmlSicher(format(z.stunden))+'</td>'+
      '<td>'+htmlSicher(z.art)+'</td>'+
      '</tr>'
    ).join("");

    const erstellt=new Date().toLocaleDateString("de-DE");

    fenster.document.open();
    fenster.document.write(`<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>Arbeitszeitnachweis</title>
<style>
@page{size:A4 portrait;margin:12mm}
body{font-family:Arial,sans-serif;color:#222;margin:0}
h1{font-size:20px;margin:0 0 4px}
.meta{font-size:11px;color:#666;margin-bottom:14px}
.summary{display:flex;flex-wrap:wrap;gap:9px;margin:0 0 16px}
.summary div{border:1px solid #ccd3d9;border-radius:8px;padding:7px 10px;min-width:135px}
.summary span{display:block;font-size:10px;color:#666;margin-bottom:2px}
.summary strong{font-size:14px}
.plus{color:#337a19}.minus{color:#b42318}
table{width:100%;border-collapse:collapse;font-size:10px;table-layout:fixed}
thead{display:table-header-group}
tr{page-break-inside:avoid}
th,td{border-bottom:1px solid #d6d6d6;padding:5px 6px;vertical-align:top}
th{background:#eef3f7;text-align:left;font-weight:700}
th:nth-child(1),td:nth-child(1){width:22%}
th:nth-child(2),td:nth-child(2){width:10%}
th:nth-child(3),td:nth-child(3){width:17%}
th:nth-child(4),td:nth-child(4){width:17%}
th:nth-child(5),td:nth-child(5){width:14%}
th:nth-child(6),td:nth-child(6){width:20%}
.num{text-align:right;white-space:nowrap}
.footer{margin-top:10px;font-size:9px;color:#777}
</style>
</head>
<body>
<h1>Arbeitszeitnachweis - ${htmlSicher(x.titel)}</h1>
<div class="meta">Erstellt am ${htmlSicher(erstellt)} - ohne Tätigkeiten</div>
<div class="summary">${summaryHtml}</div>
<table>
<thead>
<tr>
<th>Datum</th><th>Tag</th><th>Beginn</th><th>Ende</th><th>Stunden</th><th>Art</th>
</tr>
</thead>
<tbody>${body}</tbody>
</table>
<div class="footer">Arbeitszeit Nebenjob</div>
<script>
window.addEventListener("load",()=>setTimeout(()=>window.print(),250));
<\/script>
</body>
</html>`);
    fenster.document.close();
  }catch(e){
    zeige("PDF-Export: "+e.message,"error");
  }
}

function jsonp(p){
  return new Promise((res,rej)=>{
    const cb="nebenjobCallback_"+Date.now()+"_"+(++jsonpSequenz);
    const s=document.createElement("script");

    const t=setTimeout(()=>{
      clean();
      rej(new Error("Zeitüberschreitung"));
    },45000);

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
