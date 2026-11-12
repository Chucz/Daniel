import type {Config} from '@netlify/functions';
import {desc,sql} from 'drizzle-orm';
import {database} from '../lib/database.mjs';
import {operationalEvents} from '../../db/schema.js';
import {getSessionUser,sameOrigin} from '../lib/auth.mjs';
import {canManageUsers} from '../lib/access.mjs';
const codes=['SAVE_NETWORK','SAVE_REJECTED','CLIENT_ERROR','CLIENT_UNHANDLED'];
export default async(request:Request)=>{
 const headers=new Headers({'Cache-Control':'no-store',Vary:'Cookie'}),respond=(data:unknown,status=200)=>Response.json(data,{status,headers});
 try{const user=await getSessionUser(request);if(!user)return respond({error:'Entre para continuar.'},401);if(user.mustChangePassword)return respond({error:'Defina sua senha.'},403);
  if(request.method==='GET'){
   await database().execute(sql`select 1`);
   if(new URL(request.url).pathname==='/api/operations'){
    if(!canManageUsers(user))return respond({error:'Acesso restrito ao administrador.'},403);
    const events=await database().select().from(operationalEvents).orderBy(desc(operationalEvents.createdAt)).limit(100);
    return respond({ok:true,checkedAt:new Date().toISOString(),events,scope:'Verificação de disponibilidade neste momento e últimos eventos registrados. Não substitui monitoramento externo contínuo.'});
   }
   return respond({ok:true,checkedAt:new Date().toISOString()});
  }
  if(request.method!=='POST')return respond({error:'Método inválido.'},405);
  if(!sameOrigin(request))return respond({error:'Origem inválida.'},403);
  if(!request.headers.get('content-type')?.includes('application/json'))return respond({error:'Formato inválido.'},415);
  const raw=await request.text();if(raw.length>1024)return respond({error:'Evento inválido.'},400);let input;try{input=JSON.parse(raw);}catch{return respond({error:'Evento inválido.'},400);}
  if(!codes.includes(input?.code)||!['schedule','interface'].includes(input?.area)||Object.keys(input).some(k=>!['code','area','status'].includes(k))||(input.status!=null&&(!Number.isInteger(input.status)||input.status<100||input.status>599)))return respond({error:'Evento inválido.'},400);
  await database().insert(operationalEvents).values({code:input.code,area:input.area,status:input.status??null});return respond({recorded:true});
 }catch{console.error(JSON.stringify({event:'operational_error',code:'HEALTH_FAILURE',area:'monitoring',status:503}));return respond({ok:false,error:'Serviço indisponível neste momento.',checkedAt:new Date().toISOString()},503);}
};
export const config:Config={path:['/api/health','/api/operations','/api/telemetry'],rateLimit:{windowLimit:60,windowSize:60,aggregateBy:['ip','domain']}};
