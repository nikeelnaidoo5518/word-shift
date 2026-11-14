import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
export async function serve(directory,port=0) {
  const root=path.resolve(directory);
  const server=http.createServer(async(req,res)=>{
    try {
      let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if(pathname.startsWith('/word-shift/'))pathname=pathname.slice('/word-shift'.length);
      if(pathname==='/' || pathname.endsWith('/'))pathname+='index.html';
      const filename=path.resolve(root,'.'+pathname);
      if(!filename.startsWith(root+path.sep))throw Error('Not found');
      const data=await fs.readFile(filename);
      const contentType=filename.endsWith('.html')?'text/html':filename.endsWith('.js')?'text/javascript':filename.endsWith('.json')?'application/json':'application/octet-stream';
      res.writeHead(200,{'content-type':contentType,'cache-control':'no-store'});res.end(data);
    }catch{res.writeHead(404);res.end('Not found');}
  });
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
  return server;
}
