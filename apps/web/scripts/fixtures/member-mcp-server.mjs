import readline from 'node:readline';
const member=process.argv[2];
if(!member)throw Error('Member test service required');
const reply=(id,result)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\n');
readline.createInterface({input:process.stdin}).on('line',line=>{
 let request;try{request=JSON.parse(line);}catch{return;}
 if(request.id===undefined)return;
 const {id,method}=request;
 if(method==='initialize')return reply(id,{protocolVersion:request.params?.protocolVersion??'2025-06-18',capabilities:{tools:{},resources:{}},serverInfo:{name:'member-test',version:'1.0.0'}});
 if(method==='ping')return reply(id,{});
 if(method==='tools/list')return reply(id,{tools:[{name:'private',description:'Read service member marker',inputSchema:{type:'object',properties:{},additionalProperties:false}}]});
 if(method==='tools/call')return reply(id,{content:[{type:'text',text:member}],structuredContent:{member}});
 if(method==='resources/list')return reply(id,{resources:[{uri:'member://report',name:'Private report',mimeType:'text/plain'}]});
 if(method==='resources/templates/list')return reply(id,{resourceTemplates:[]});
 if(method==='resources/read')return reply(id,{contents:[{uri:'member://report',mimeType:'text/plain',text:`REPORT_${member}`}]});
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,error:{code:-32601,message:'Unknown method'}})+'\n');
});
