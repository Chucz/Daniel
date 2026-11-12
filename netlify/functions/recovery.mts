import type { Config } from '@netlify/functions';
import { randomBytes } from 'node:crypto';
import { and,eq,isNull,sql } from 'drizzle-orm';
import { database } from '../lib/database.mjs';
import { appUsers,authSessions,recoveryCodes } from '../../db/schema.js';
import { getSessionUser,verifyPassword,hashPassword,digest,readToken,sameOrigin } from '../lib/auth.mjs';
export default async(request:Request)=>{
 const headers=new Headers({'Cache-Control':'no-store',Vary:'Cookie'}),respond=(data:unknown,status=200)=>Response.json(data,{status,headers});
 try{
  const url=new URL(request.url),user=await getSessionUser(request);
  if(request.method==='GET'){if(!user)return respond({error:'Entre para continuar.'},401);const rows=await database().select({id:recoveryCodes.id}).from(recoveryCodes).where(and(eq(recoveryCodes.userId,user.id),isNull(recoveryCodes.usedAt)));return respond({remainingCodes:rows.length});}
  if(request.method!=='POST')return respond({error:'Método inválido.'},405);
  if(!sameOrigin(request))return respond({error:'Origem inválida.'},403);
  if(!request.headers.get('content-type')?.includes('application/json'))return respond({error:'Formato inválido.'},415);
  const raw=await request.text();if(raw.length>4096)return respond({error:'Requisição muito grande.'},413);let input;try{input=JSON.parse(raw);}catch{return respond({error:'Dados inválidos.'},400);}
  if(url.pathname==='/api/reauth'){
   if(!user)return respond({error:'Entre para continuar.'},401);
   if(typeof input?.password!=='string'||input.password.length>128||!await verifyPassword(input.password,user.passwordHash))return respond({error:'Senha incorreta.'},403);
   await database().update(authSessions).set({reauthenticatedAt:new Date()}).where(eq(authSessions.tokenHash,digest(readToken(request)!)));return respond({confirmed:true});
  }
  if(input?.action==='generate'){
   if(!user||user.mustChangePassword)return respond({error:'Entre e defina sua senha antes de continuar.'},403);
   if(typeof input.password!=='string'||input.password.length>128||!await verifyPassword(input.password,user.passwordHash))return respond({error:'Senha incorreta.'},403);
   const codes=Array.from({length:10},()=>randomBytes(20).toString('hex').toUpperCase().match(/.{1,4}/g)!.join('-'));
   await database().transaction(async(tx:any)=>{const [current]=await tx.select().from(appUsers).where(eq(appUsers.id,user.id)).for('update');if(!current||!current.active||current.passwordHash!==user.passwordHash||current.mustChangePassword)throw new Error('Access changed');await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId,user.id));await tx.insert(recoveryCodes).values(codes.map(code=>({userId:user.id,codeHash:digest(code.replace(/-/g,''))})));});return respond({codes});
  }
  if(input?.action!=='recover'||typeof input.email!=='string'||input.email.length>200||typeof input.code!=='string'||input.code.length>80||typeof input.newPassword!=='string'||input.newPassword.length<12||input.newPassword.length>128)return respond({error:'Informe e-mail, código de recuperação e uma senha nova de 12 a 128 caracteres.'},400);
  const normalized=input.code.replace(/-/g,'').trim().toUpperCase();if(!/^[A-F0-9]{40}$/.test(normalized))return respond({error:'Não foi possível recuperar o acesso com estes dados.'},400);
  const newHash=await hashPassword(input.newPassword);
  const ok=await database().transaction(async(tx:any)=>{
   const [target]=await tx.select().from(appUsers).where(eq(appUsers.email,input.email.trim().toLowerCase())).for('update');if(!target||!target.active)return false;
   const [code]=await tx.select().from(recoveryCodes).where(and(eq(recoveryCodes.userId,target.id),eq(recoveryCodes.codeHash,digest(normalized)),isNull(recoveryCodes.usedAt))).for('update');if(!code)return false;
   await tx.update(appUsers).set({passwordHash:newHash,mustChangePassword:false,version:sql`${appUsers.version}+1`}).where(eq(appUsers.id,target.id));await tx.update(recoveryCodes).set({usedAt:new Date()}).where(eq(recoveryCodes.id,code.id));await tx.delete(authSessions).where(eq(authSessions.userId,target.id));return true;
  });return ok?respond({recovered:true}):respond({error:'Não foi possível recuperar o acesso com estes dados.'},400);
 }catch{return respond({error:'Não foi possível concluir. Tente novamente.'},503);}
};
export const config:Config={path:['/api/account-recovery','/api/reauth'],rateLimit:{windowLimit:20,windowSize:60,aggregateBy:['ip','domain']}};
