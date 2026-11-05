import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from './http.mjs';

test('container serves SPA, preserves API parameters and bodies, and blocks invalid requests', async () => {
  const dist = await mkdtemp(join(tmpdir(),'boligdata-'));
  await writeFile(join(dist,'index.html'),'<html>BoligData</html>');
  const server = createApplication({dist,routes:[{pattern:/^\/api\/listings\/([^/]+)\/([^/]+)$/,params:m=>({id:m[1],action:m[2]}),handler:(req,res)=>res.status(201).json({query:req.query,body:req.body})}]});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url = 'http://127.0.0.1:'+server.address().port;
  try {
    assert.equal((await fetch(url+'/healthz')).status,200);
    assert.match(await (await fetch(url+'/account/profile')).text(),/BoligData/);
    assert.equal((await fetch(url+'/missing.js')).status,404);
    assert.equal((await fetch(url+'/.env')).status,404);
    assert.equal((await fetch(url+'/api/unknown')).status,404);
    const response = await fetch(url+'/api/listings/real/approve?id=forged&x=1&x=2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({note:'test'})});
    assert.equal(response.status,201);
    assert.deepEqual(await response.json(),{query:{id:'real',action:'approve',x:['1','2']},body:{note:'test'}});
    assert.equal((await fetch(url+'/api/listings/real/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:'{bad'})).status,400);
    assert.equal((await fetch(url+'/api/listings/real/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(4*1024*1024+1)})).status,413);
  } finally { await new Promise(resolve=>server.close(resolve)); await rm(dist,{recursive:true,force:true}); }
});
