import { database } from '../lib/database.mjs';
import { eq, sql } from 'drizzle-orm';
import { schedules, scheduleAudit } from '../../db/schema.js';
import { canEditSchedule } from '../lib/access.mjs';
import { getSessionUser, digest } from '../lib/auth.mjs';
const SHARED_SCHEDULE_ID = '00000000-0000-4000-8000-000000000001';
const emptySchedule = () => ({teachers:{titulares:[],substitutos:[]},slots:{}});
// JSONB may reorder object keys; a revision must depend on content, not property order.
function canonicalJson(value: any): string {
  if (Array.isArray(value)) return '['+value.map(canonicalJson).join(',')+']';
  if (value && typeof value==='object') return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalJson(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
const revision = (data: unknown) => '\"'+digest(canonicalJson(data))+'\"';
const roles = ['Diretor(a)','Vice-diretor(a)','Coordenador(a)'];
const legacyClasses: Record<string,string> = {'9º Ano A':'9º Ano EF','6º Ano A':'6º Ano EF','7º Ano A':'7º Ano EF','8º Ano A':'8º Ano EF','1º EM A':'1º Ano EM','2º EM A':'2º Ano EM','3º EM A':'3º Ano EM','1º EM D':'1º Ano EM','2º EM D':'2º Ano EM','3º EM D':'3º Ano EM','2º Técnico':'2º Ano EM Técnico','3º Técnico':'3º Ano EM Técnico'};
export default async (request: Request) => {
  const headers=new Headers({'Cache-Control':'no-store',Vary:'Cookie'});
  const respond=(data:unknown,status=200)=>Response.json(data,{status,headers});
  let user;
  try { user=await getSessionUser(request); if(!user) return respond({error:'Sessão encerrada. Entre novamente.'},401); }
  catch { return respond({error:'Não foi possível verificar a sessão'},503); }
  if(user.mustChangePassword) return respond({error:'Atualize sua senha para continuar.',code:'PASSWORD_CHANGE_REQUIRED'},403);
  if(!['GET','PUT'].includes(request.method)) return respond({error:'Método inválido'},405);
  if(request.method==='PUT' && !canEditSchedule(user)) return respond({error:'Seu perfil permite apenas consulta.',code:'FORBIDDEN'},403);
  if(request.method==='PUT' && request.headers.get('origin')!==new URL(request.url).origin) return respond({error:'Origem inválida'},403);
  const id=SHARED_SCHEDULE_ID;
  try {
    const db=database();
    if(request.method==='GET') { const [row]=await db.select().from(schedules).where(eq(schedules.id,id));const data=row?.data||emptySchedule();headers.set('ETag',revision(data));headers.set('X-Schedule-Revision',revision(data));return respond(data); }
    if(!request.headers.get('content-type')?.includes('application/json'))return respond({error:'Formato inválido'},415);
    const expected=(request.headers.get('x-schedule-revision') || request.headers.get('if-match'))?.replace(/^W\//,'');if(!expected || !/^"[a-f0-9]{64}"$/.test(expected))return respond({error:'Atualize a página antes de salvar.',code:'REVISION_REQUIRED'},428);
    const raw=await request.text();if(raw.length>1000000)return respond({error:'Grade muito grande'},413);
    let data;try{data=JSON.parse(raw);}catch{return respond({error:'JSON inválido'},400);}
    const text=(v:unknown):v is string=>typeof v==='string'&&v.length<=200&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
    if(!data || !Array.isArray(data.teachers?.titulares)||!Array.isArray(data.teachers?.substitutos)||data.teachers.titulares.length>3000||data.teachers.substitutos.length>3000||
      !data.teachers.titulares.every(text)||!data.teachers.substitutos.every((s:any)=>s&&text(s.name)&&text(s.phone))||
      !data.slots||typeof data.slots!=='object'||Array.isArray(data.slots)||Object.keys(data.slots).length<1||Object.keys(data.slots).length>3000||
      !Object.entries(data.slots).every(([key,s]:[string,any])=>s&&key===s.id&&text(s.id)&&text(s.day)&&text(s.shift)&&text(s.className)&&text(s.slotId)&&text(s.slotLabel)&&text(s.timeRange)&&text(s.regularTeacher)&&['regular','falta','substituido'].includes(s.status)&&(s.substituteTeacher===null||text(s.substituteTeacher))&&(s.substituteSelectedBy==null||roles.includes(s.substituteSelectedBy))))return respond({error:'Dados inválidos'},400);
    // Lock and compare inside one transaction: concurrent writers cannot both succeed.
    return await db.transaction(async(tx:any)=>{
      // An advisory transaction lock also serializes initial creation of the shared row.
      await tx.execute(sql`select pg_advisory_xact_lock(182736451)`);
      const [row]=await tx.select().from(schedules).where(eq(schedules.id,id)).for('update');
      const previous:any=row?.data||emptySchedule();
      if(expected!==revision(previous))return respond({error:'Outra pessoa atualizou a grade. Baixe uma cópia local das suas alterações e carregue a versão atual antes de continuar.',code:'REVISION_CONFLICT'},409);
      if(Object.keys(data.slots).length<Object.keys(previous.slots||{}).length)return respond({error:'A gravação removeria horários existentes. Atualize a grade antes de continuar.'},400);
      // Ignore client-supplied identity metadata; derive it from the verified session.
      for(const slot of Object.values(data.slots) as any[]){
        const legacyClass=legacyClasses[slot.className];
        const old=previous.slots?.[slot.id] || (legacyClass ? previous.slots?.[`${slot.day}__${slot.shift}__${legacyClass}__${slot.slotId}`] : undefined);
        const changed=slot.status==='substituido'&&(old?.status!=='substituido'||old?.substituteTeacher!==slot.substituteTeacher||(old?.substituteSelectedBy||null)!==(slot.substituteSelectedBy||null));
        if(changed&&!roles.includes(slot.substituteSelectedBy))return respond({error:'Selecione o responsável pela escolha do substituto.'},400);
        slot.substitutionRecordedBy=changed?user.email:(old?.substitutionRecordedBy||null);
        slot.substitutionRecordedAt=changed?new Date().toISOString():(old?.substitutionRecordedAt||null);
        if(slot.status!=='substituido'){slot.substitutionRecordedBy=null;slot.substitutionRecordedAt=null;slot.substituteSelectedBy=null;}
      }
      await tx.insert(scheduleAudit).values({scheduleId:id,actorId:user.id,actorEmail:user.email,beforeData:row?.data||null,afterData:data});
      await tx.insert(schedules).values({id,data}).onConflictDoUpdate({target:schedules.id,set:{data}});
      headers.set('ETag',revision(data));headers.set('X-Schedule-Revision',revision(data));return respond({saved:true,slots:data.slots});
    });
  }catch{return respond({error:'Não foi possível acessar a grade'},503);}
};
