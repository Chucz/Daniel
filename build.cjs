const fs=require('fs'),p=require('path'),cp=require('child_process');
const root=__dirname,from=p.join(root,'dist');fs.mkdirSync(from,{recursive:true});
const resolveModule=(file)=>file.startsWith('jspdf-autotable/') ? p.join(p.dirname(require.resolve('jspdf-autotable')),p.basename(file)) : require.resolve(file);
const copy=(src,dest)=>{fs.mkdirSync(p.dirname(dest),{recursive:true});fs.copyFileSync(src,dest)};
for(const name of ['index.html','auth.js','auth.css','app.js','app.css','account.js','access.js','users.js','records.js','operations.js','sw.js','manifest.json','_headers','icon.png','icon-192.png','icon-512.png','apple-touch-icon.png'])copy(p.join(root,name),p.join(from,name));
for(const [module,dest] of [['lucide/dist/umd/lucide.min.js','lucide.min.js'],['jspdf/dist/jspdf.umd.min.js','jspdf.umd.min.js'],['jspdf-autotable/dist/jspdf.plugin.autotable.min.js','jspdf.plugin.autotable.min.js']])copy(resolveModule(module),p.join(from,'vendor',dest));
cp.execFileSync(process.execPath,[resolveModule('tailwindcss/lib/cli.js'),'-c',p.join(root,'tailwind.config.cjs'),'-i',p.join(root,'tailwind.css'),'-o',p.join(from,'styles.css'),'--minify'],{cwd:root,stdio:'inherit'});
console.log('Built public files only in dist/.');
