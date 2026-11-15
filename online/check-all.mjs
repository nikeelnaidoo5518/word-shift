import {spawnSync} from 'node:child_process';
const node=process.execPath;
for(const file of ['online/rules-tests.mjs','online/browser-tests.mjs','online/modes-tests.mjs','online/display-tests.mjs']) {
  const result=spawnSync(node,[file],{stdio:'inherit',env:process.env});
  if(result.status!==0)process.exit(result.status || 1);
}
