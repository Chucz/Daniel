export const WEEK_DAYS = ['Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira'];
export function todayInSchool() { return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
export function validDate(value: unknown): value is string { return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value>='2020-01-01' && value<='2100-12-31' && !Number.isNaN(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value; }
export function addDays(date: string, days: number) { const result=new Date(date+'T12:00:00Z');result.setUTCDate(result.getUTCDate()+days);return result.toISOString().slice(0,10); }
export function monday(date: string) { return addDays(date,-((new Date(date+'T12:00:00Z').getUTCDay()+6)%7)); }
export function dateForDay(reference: string, day: string) { const index=WEEK_DAYS.indexOf(day);if(index<0)throw new Error('Invalid weekday');return addDays(monday(reference),index); }
