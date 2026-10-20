import readline from 'node:readline';
import { callTool, tools } from './core.js';

const protocolVersion = '2024-11-05';
function reply(message) { process.stdout.write(`${JSON.stringify(message)}\n`); }
async function handle(message) {
  if (!message || typeof message !== 'object' || !message.method) return;
  if (message.method === 'notifications/initialized' || message.method === 'notifications/cancelled') return;
  if (message.method === 'initialize') return reply({ jsonrpc:'2.0', id:message.id, result:{ protocolVersion, capabilities:{tools:{listChanged:false}}, serverInfo:{name:'homehandoff-local-mcp',version:'1.0.0'} } });
  if (message.method === 'ping') return reply({jsonrpc:'2.0',id:message.id,result:{}});
  if (message.method === 'tools/list') return reply({jsonrpc:'2.0',id:message.id,result:{tools:tools.map(({name,description,inputSchema})=>({name,description,inputSchema}))}});
  if (message.method === 'tools/call') {
    try { const result=await callTool(message.params?.name,message.params?.arguments||{});const text=typeof result==='string'?result:JSON.stringify(result,null,2);return reply({jsonrpc:'2.0',id:message.id,result:{content:[{type:'text',text}],isError:false}}); }
    catch(error){return reply({jsonrpc:'2.0',id:message.id,result:{content:[{type:'text',text:error.message}],isError:true}});}
  }
  if (message.id!==undefined) reply({jsonrpc:'2.0',id:message.id,error:{code:-32601,message:`Method not found: ${message.method}`}});
}
const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
lines.on('line',(line)=>{try{void handle(JSON.parse(line));}catch(error){console.error('Invalid MCP JSON-RPC line:',error.message);}});
process.stderr.write('HomeHandoff MCP stdio server ready.\n');
