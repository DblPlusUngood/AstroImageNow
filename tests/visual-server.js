"use strict";

const http=require("node:http");
const fs=require("node:fs");
const path=require("node:path");

const root=path.resolve(__dirname,"..");
const port=Number(process.env.PORT||4173);
const mime={
  ".html":"text/html; charset=utf-8",
  ".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8",
  ".json":"application/json; charset=utf-8",
  ".webmanifest":"application/manifest+json",
  ".svg":"image/svg+xml",
  ".png":"image/png"
};

http.createServer((request,response)=>{
  const url=new URL(request.url,"http://127.0.0.1");
  if(url.pathname==="/visual-test"){
    const html=fs.readFileSync(path.join(root,"index.html"),"utf8")
      .replace('<script src="app.js"></script>','<script src="tests/mock-fetch.js"></script>\n<script src="app.js"></script>');
    response.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});
    response.end(html);
    return;
  }

  const requestPath=url.pathname==="/"?"index.html":decodeURIComponent(url.pathname.slice(1));
  if(requestPath.split("/").some(part=>part.startsWith("."))){response.writeHead(403);response.end("Forbidden");return}
  const filePath=path.resolve(root,requestPath);
  if(!filePath.startsWith(`${root}${path.sep}`)&&filePath!==path.join(root,"index.html")){
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  fs.readFile(filePath,(error,data)=>{
    if(error){response.writeHead(404);response.end("Not found");return}
    response.writeHead(200,{"Content-Type":mime[path.extname(filePath)]||"application/octet-stream","Cache-Control":"no-store"});
    response.end(data);
  });
}).listen(port,"127.0.0.1",()=>{
  console.log(`Visual test server: http://127.0.0.1:${port}/visual-test`);
});
