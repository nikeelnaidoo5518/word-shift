import {spawn} from 'node:child_process';import {createRequire} from 'node:module';import {serve} from './static-server.mjs';
const require=createRequire(import.meta.url),server=await serve(new URL('../dist',import.meta.url).pathname);
try{
 for(const script of ['scripts/tv-layout.cjs','scripts/phone-layout.cjs']){
  const child=spawn(process.execPath,[script],{stdio:'inherit',env:{...process.env,BASE_URL:`http://127.0.0.1:${server.address().port}/word-shift`,PLAYWRIGHT_MODULE:process.env.PLAYWRIGHT_MODULE || require.resolve('playwright')}});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});if(code!==0){process.exitCode=code??1;break;}
 }
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
