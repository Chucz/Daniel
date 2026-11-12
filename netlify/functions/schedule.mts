import { and,asc,eq,inArray,or,ne,sql } from 'drizzle-orm';
import { database } from '../lib/database.mjs';
import { schoolRecords,recordAudit,appUsers } from '../../db/schema.js';
import { getSessionUser,sameOrigin } from '../lib/auth.mjs';
import { canEditSchedule,canManageUsers } from '../lib/access.mjs';
import { hasRecentReauthentication } from '../lib/reauth.mjs';
import { validDate,todayInSchool,dateForDay,monday,addDays } from '../lib/school-dates.mjs';
import { reportServerFailure } from '../lib/telemetry.mjs';
const roles=['Diretor(a)','Vice-diretor(a)','Coordenador(a)'];
const text=(value:any)=>typeof value==='string'&&value.length<=200&&!/[\u0000-\u001f\u007f]/.test(value);
class Failure extends Error { constructor(public status:number,message:string,public code:string){super(message);} }
const conflict=()=>new Failure(409,'Este registro foi alterado por outra pessoa. Baixe sua cópia local e atualize os dados.','RECORD_CONFLICT');
export default async(request:Request)=>{
 const headers=new Headers({'Cache-Control':'no-store',Vary:'Cookie'}),respond=(body:unknown,status=200)=>Response.json(body,{status,headers});
 try {
  const user=await getSessionUser(request);if(!user)return respond({error:'Sessão encerrada. Entre novamente.'},401);
  if(user.mustChangePassword)return respond({error:'Troque sua senha antes de continuar.'},403);
  const db=database(),url=new URL(request.url);
  if(request.method==='GET'){
   const date=url.searchParams.get('date')||todayInSchool();if(!validDate(date))return respond({error:'Data inválida.'},400);
   const legacyView=url.searchParams.get('view')==='legacy';
   const rows=await db.select().from(schoolRecords).where(and(eq(schoolRecords.deleted,false),legacyView?eq(schoolRecords.kind,'legacy'):or(inArray(schoolRecords.kind,['teacher','lesson']),and(eq(schoolRecords.kind,'occurrence'),sql`${schoolRecords.data}->>'date' between ${monday(date)} and ${addDays(monday(date),4)}`))));
   if(url.searchParams.get('view')==='legacy')return respond({records:rows.filter(r=>r.kind==='legacy'),referenceDate:todayInSchool()});
   const teachers={titulares:[] as string[],substitutos:[] as any[]},slots:any={},teacherRecords=rows.filter(r=>r.kind==='teacher');
   for(const row of teacherRecords){const data:any=row.data;if(data.type==='titular')teachers.titulares.push(data.name);else teachers.substitutos.push({name:data.name,phone:data.phone||''});}
   const byId=new Map(rows.map(r=>[r.id,r]));
   for(const row of rows.filter(r=>r.kind==='lesson')){const lesson:any=row.data,lessonDate=dateForDay(date,lesson.day),occ=byId.get('occurrence:'+lessonDate+':'+lesson.id),data:any=occ?.data;
    slots[lesson.id]={...lesson,date:lessonDate,status:data?.status||'regular',substituteTeacher:data?.substituteTeacher||null,substituteSelectedBy:data?.substituteSelectedBy||null,regularTeacher:data?.status&&data.status!=='regular'?(data.regularTeacherSnapshot??lesson.regularTeacher):lesson.regularTeacher,substitutionRecordedBy:data?.substitutionRecordedBy||null,substitutionRecordedAt:data?.substitutionRecordedAt||null,source:data?.source||null,lessonVersion:row.version,occurrenceVersion:occ?.version||0,templateTeacher:lesson.regularTeacher};}
   return respond({teachers,slots,teacherRecords,date,weekStart:monday(date),weekEnd:addDays(monday(date),4),protocol:2});
  }
  if(request.method==='PUT')return respond({error:'Atualize a página para usar a gravação por registro.',code:'CLIENT_UPDATE_REQUIRED'},428);
  if(request.method!=='PATCH')return respond({error:'Método inválido.'},405);
  if(!canEditSchedule(user))return respond({error:'Seu perfil permite apenas consulta.'},403);
  if(!sameOrigin(request))return respond({error:'Origem inválida.'},403);
  if(!request.headers.get('content-type')?.includes('application/json'))return respond({error:'Formato inválido.'},415);
  const raw=await request.text();if(raw.length>100000)return respond({error:'Operação muito grande.'},413);
  let input;try{input=JSON.parse(raw);}catch{return respond({error:'Dados inválidos.'},400);}
  if(!Array.isArray(input?.operations)||input.operations.length<1||input.operations.length>100)return respond({error:'Operações inválidas.'},400);
  const operations=input.operations;
  for(const op of operations){if(!op||!['teacher','lesson','occurrence','legacy_import'].includes(op.kind)||!text(op.id)||!Number.isSafeInteger(op.version)||op.version<0||!op.data||typeof op.data!=='object'||Array.isArray(op.data))return respond({error:'Registro inválido.'},400);
   if(op.kind==='teacher'&&(!/^teacher:[a-f0-9-]{36}$/i.test(op.id)||!['titular','substituto'].includes(op.data.type)||!text(op.data.name)||!op.data.name.trim()||!text(op.data.phone||'')||!['save','delete'].includes(op.action)))return respond({error:'Professor inválido.'},400);
   if(op.kind==='lesson'&&!text(op.data.regularTeacher))return respond({error:'Professor titular inválido.'},400);
   if(op.kind==='occurrence'&&(!validDate(op.date)||!['regular','falta','substituido'].includes(op.data.status)||(op.data.status==='substituido'&&(!text(op.data.substituteTeacher)||!op.data.substituteTeacher.trim()||!roles.includes(op.data.substituteSelectedBy)))))return respond({error:'Informe a data, o substituto e o responsável corretamente.'},400);
   if(op.kind==='legacy_import'&&(!canManageUsers(user)||!validDate(op.date)||!Number.isSafeInteger(op.targetVersion)||op.targetVersion!==0))return respond({error:'Revisão de legado inválida.'},400);
  }
  if(operations.some((op:any)=>op.kind==='legacy_import')&&!await hasRecentReauthentication(request))return respond({error:'Confirme sua senha para associar os testes antigos a datas.',code:'REAUTH_REQUIRED'},403);
  return await db.transaction(async(tx:any)=>{
   const [currentUser]=await tx.select().from(appUsers).where(eq(appUsers.id,user.id)).for('share');
   if(!currentUser||!currentUser.active||currentUser.passwordHash!==user.passwordHash||currentUser.mustChangePassword||!canEditSchedule(currentUser)||(operations.some((op:any)=>op.kind==='legacy_import')&&!canManageUsers(currentUser)))throw new Failure(403,'Seu acesso mudou. Entre novamente.','FORBIDDEN');
   const changed:any[]=[];
   const keys=operations.map((op:any)=>op.kind==='teacher'?op.id:op.kind==='lesson'?'lesson:'+op.id:op.kind==='legacy_import'?op.id:'occurrence:'+op.date+':'+op.id);
   if(new Set(keys).size!==keys.length)throw new Failure(400,'Operações duplicadas.','INVALID_OPERATIONS');
   // Lock only touched existing records, in a deterministic order. Unrelated records never share a global revision.
   await tx.select().from(schoolRecords).where(inArray(schoolRecords.id,keys)).orderBy(asc(schoolRecords.id)).for('update');
   const ordered=operations.map((op:any,i:number)=>({...op,key:keys[i]})).sort((a:any,b:any)=>a.key.localeCompare(b.key));
   for(const op of ordered){const [old]=await tx.select().from(schoolRecords).where(eq(schoolRecords.id,op.key));
    if((old?.version||0)!==op.version||old?.deleted)throw conflict();
    let data:any,kind=op.kind,deleted=false;
    if(kind==='teacher'){data={type:op.data.type,name:op.data.name.trim(),phone:op.data.phone||''};deleted=op.action==='delete';if(deleted&&!old)throw conflict();}
    if(kind==='lesson'){if(!old||old.kind!=='lesson')throw new Failure(400,'Aula não encontrada.','INVALID_LESSON');data={...old.data,regularTeacher:op.data.regularTeacher.trim()};}
    if(kind==='occurrence'){
     const [lesson]=await tx.select().from(schoolRecords).where(eq(schoolRecords.id,'lesson:'+op.id));if(!lesson||lesson.kind!=='lesson'||dateForDay(op.date,(lesson.data as any).day)!==op.date)throw new Failure(400,'A data não corresponde ao dia desta aula.','INVALID_DATE');
     const item:any=lesson.data;data={date:op.date,lessonId:op.id,day:item.day,shift:item.shift,className:item.className,slotId:item.slotId,slotLabel:item.slotLabel,timeRange:item.timeRange,regularTeacherSnapshot:(old?.data as any)?.status&&((old.data as any).status!=='regular')?((old.data as any).regularTeacherSnapshot??item.regularTeacher):item.regularTeacher,status:op.data.status,substituteTeacher:op.data.status==='substituido'?op.data.substituteTeacher.trim():null,substituteSelectedBy:op.data.status==='substituido'?op.data.substituteSelectedBy:null,substitutionRecordedBy:user.email,substitutionRecordedAt:new Date().toISOString(),source:(old?.data as any)?.source||'operational'};
    }
    if(kind==='legacy_import'){
     if(!old||old.kind!=='legacy'||(old.data as any).reviewedDate)throw conflict();const source:any=(old.data as any).slot;
     if(dateForDay(todayInSchool(),source.day)!==op.date)throw new Failure(400,'Revise uma data da semana atual correspondente ao dia da aula.','INVALID_DATE');
     const target='occurrence:'+op.date+':'+source.id;const [inserted]=await tx.insert(schoolRecords).values({id:target,kind:'occurrence',data:{...source,date:op.date,lessonId:source.id,regularTeacherSnapshot:source.regularTeacher,source:'test_legacy_reviewed',substitutionRecordedBy:user.email,substitutionRecordedAt:new Date().toISOString()}}).onConflictDoNothing().returning();if(!inserted)throw conflict();changed.push(inserted);await tx.insert(recordAudit).values({recordId:target,actorId:user.id,action:'legacy_import',beforeData:null,afterData:inserted.data});
     kind='legacy';data={...old.data,reviewedDate:op.date};
    }
    let saved;if(old){[saved]=await tx.update(schoolRecords).set({data,deleted,version:old.version+1,updatedAt:new Date()}).where(and(eq(schoolRecords.id,op.key),eq(schoolRecords.version,op.version))).returning();}else{[saved]=await tx.insert(schoolRecords).values({id:op.key,kind,data,deleted}).onConflictDoNothing().returning();}if(!saved)throw conflict();
    await tx.insert(recordAudit).values({recordId:saved.id,actorId:user.id,action:op.kind==='legacy_import'?'legacy_review':deleted?'delete':old?'update':'create',beforeData:old?.data||null,afterData:saved.data});changed.push(saved);
   }
   return respond({saved:true,records:changed});
  });
 }catch(error:any){if(error instanceof Failure)return respond({error:error.message,code:error.code},error.status);if(error?.code==='23505'||error?.cause?.code==='23505')return respond({error:'Já existe um registro equivalente. Atualize os dados.',code:'RECORD_CONFLICT'},409);const requestId=await reportServerFailure('SCHEDULE_FAILURE','schedule');return respond({error:'Não foi possível acessar ou salvar os dados. Tente novamente.',requestId},503);}
};
