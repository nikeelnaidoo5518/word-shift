import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// Firebase CLI/Node SDK currently ignore NO_PROXY. Guard loopback only; remote URLs
// still use the configured proxy. This changes ignored development dependencies only.
if(process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
  const cli=path.join(root,'online/node_modules/firebase-tools/lib/apiv2.js');
  let text=await readFile(cli,'utf8');
  text=text.replace('if (proxyURI) {\n            fetchOptions.dispatcher','if (proxyURI && !["localhost","127.0.0.1","[::1]"].includes(new URL(fetchURL).hostname)) {\n            fetchOptions.dispatcher');
  await writeFile(cli,text);
  for(const name of ['index.cjs.js','index.node.cjs.js','node-esm/index.node.esm.js']) {
    const file=path.join(root,'online/node_modules/@firebase/database/dist',name);
    text=await readFile(file,'utf8');
    text=text.replace("if (proxy) {\n                    options['proxy']","if (proxy && !['localhost','127.0.0.1','[::1]'].includes(new URL(this.connURL).hostname)) {\n                    options['proxy']");
    await writeFile(file,text);
  }
}
const built=spawnSync(process.execPath,['online/build.mjs'],{cwd:root,stdio:'inherit',env:{...process.env,WORDSHIFT_EMULATORS:'1'}});
if(built.status!==0)process.exit(built.status || 1);
const cli=path.join(root,'online/node_modules/firebase-tools/lib/bin/firebase.js');
const result=spawnSync(process.execPath,[cli,'emulators:exec','--project','demo-word-shift','--config','firebase.emulator.json','--only','auth,database',"'"+process.execPath.replaceAll("'", "'\\''")+"' online/check-all.mjs"],{cwd:root,stdio:'inherit',env:process.env});
process.exit(result.status ?? 1);
