function schoolToday() { return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
function addSchoolDays(date,days){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function schoolMonday(date){return addSchoolDays(date,-((new Date(date+'T12:00:00Z').getUTCDay()+6)%7));}
function schoolDay(date){return ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'][new Date(date+'T12:00:00Z').getUTCDay()];}
function dateForSchoolDay(date,day){const index=['Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira'].indexOf(day);return addSchoolDays(schoolMonday(date),Math.max(index,0));}
function formatSchoolDate(date){return /^\d{4}-\d{2}-\d{2}$/.test(date||'')?date.split('-').reverse().join('/'):'Sem data';}
const cloneRecords=value=>JSON.parse(JSON.stringify(value));
let persistenceBase=null;
function occurrenceFields(slot){return {status:slot.status,substituteTeacher:slot.substituteTeacher||null,substituteSelectedBy:slot.substituteSelectedBy||null};}
function buildRecordOperations(base,snapshot){
 const operations=[],catalog=new Map();
 for(const row of base.teacherRecords||[])catalog.set(row.data.type+':'+row.data.name.trim().toLowerCase(),row);
 const desired=[];for(const name of snapshot.teachers.titulares)desired.push({type:'titular',name,phone:''});for(const teacher of snapshot.teachers.substitutos)desired.push({type:'substituto',name:getSubName(teacher),phone:getSubPhone(teacher)});
 const seen=new Set();
 for(const teacher of desired){const key=teacher.type+':'+teacher.name.trim().toLowerCase(),old=catalog.get(key);seen.add(key);if(!old)operations.push({kind:'teacher',action:'save',id:'teacher:'+crypto.randomUUID(),version:0,data:teacher});else if(old.data.name!==teacher.name||(old.data.phone||'')!==teacher.phone||old.data.type!==teacher.type)operations.push({kind:'teacher',action:'save',id:old.id,version:old.version,data:teacher});}
 for(const [key,row]of catalog)if(!seen.has(key))operations.push({kind:'teacher',action:'delete',id:row.id,version:row.version,data:row.data});
 for(const [id,current]of Object.entries(snapshot.slots)){const previous=base.slots[id];if(!previous)continue;
  if(current.regularTeacher!==previous.regularTeacher)operations.push({kind:'lesson',id,version:previous.lessonVersion||0,data:{regularTeacher:current.regularTeacher}});
  if(JSON.stringify(occurrenceFields(current))!==JSON.stringify(occurrenceFields(previous)))operations.push({kind:'occurrence',id,date:current.date,version:previous.occurrenceVersion||0,data:occurrenceFields(current)});
 }
 return operations;
}
function mergeSavedRecords(snapshot,records){
 const next=cloneRecords(snapshot);next.teacherRecords=cloneRecords(persistenceBase.teacherRecords||[]);
 for(const row of records){
  if(row.kind==='teacher'){next.teacherRecords=next.teacherRecords.filter(old=>old.id!==row.id);if(!row.deleted)next.teacherRecords.push(row);}
  if(row.kind==='lesson'){const id=row.data.id;if(next.slots[id]){next.slots[id].lessonVersion=row.version;next.slots[id].templateTeacher=row.data.regularTeacher;if(state.slots[id]){state.slots[id].lessonVersion=row.version;state.slots[id].templateTeacher=row.data.regularTeacher;}}}
  if(row.kind==='occurrence'){const id=row.data.lessonId,slot=next.slots[id];if(!slot)continue;slot.occurrenceVersion=row.version;slot.substitutionRecordedBy=row.data.substitutionRecordedBy;slot.substitutionRecordedAt=row.data.substitutionRecordedAt;slot.source=row.data.source;
   const current=state.slots[id];if(current&&current.date===slot.date){current.occurrenceVersion=row.version;if(JSON.stringify(occurrenceFields(current))===JSON.stringify(occurrenceFields(slot))){current.substitutionRecordedBy=slot.substitutionRecordedBy;current.substitutionRecordedAt=slot.substitutionRecordedAt;current.source=slot.source;if(slot.status==='regular'){slot.regularTeacher=slot.templateTeacher??slot.regularTeacher;current.regularTeacher=slot.regularTeacher;}}}
  }
 }
 persistenceBase=next;
}
async function changeSchoolDate(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
 await saveQueue;if(persistenceError){showToast('Salve ou baixe uma cópia local antes de mudar a data.');renderApp();return;}
 state.selectedDate=date;state.selectedDay=schoolDay(date);state.reportDay=state.selectedDay;state.activeBottomSheetSlotId=null;state.assignTitularPageSlotId=null;state.conflictAlert=null;
 await initializeApp();
}
async function selectSchoolDay(day){await changeSchoolDate(dateForSchoolDay(state.selectedDate,day));}
