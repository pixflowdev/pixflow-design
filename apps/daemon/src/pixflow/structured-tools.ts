import { createHash } from 'node:crypto';
import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PIXFLOW_MCP_NAME = 'pixflow_builtin';
export const supportsPixflowMcp = (agent: string, streamFormat?: string) =>
  streamFormat === 'acp-json-rpc' ||
  ['codex', 'claude', 'opencode', 'mimo', 'grok-build', 'antigravity', 'cursor-agent', 'qwen', 'qoder', 'copilot'].includes(agent);
export type PixflowMcpCommand = { command: string; args: string[] };
export const pixflowMcpInstructions = 'Use the connected pixflow_builtin MCP server for Pixflow operations. Its site tools are pixflow_tools (pass up to 12 exact schema names in tools) and pixflow_call (dispatch by tool name and arguments). Resolve slash-delimited names with pixflow_tools before invoking them as native WordPress abilities. In Workspace use the dedicated builder destinations, handoff and handoff status tools. Reuse tool schemas and skill references already read in this run. Native command helpers remain a compatibility fallback if structured tools are unavailable before dispatch. Never replay a failed or interrupted write through another transport; inspect the operation receipt, builder result or handoff status first. A tool session-ended error means use the current run tools, not saved credentials.';

/** Run-local stdio compatibility output. Tool implementation stays in the helper
 * module; importing it performs no operation and exposes no credentials. */
export const PIXFLOW_MCP_SOURCE = `import { createInterface } from 'node:readline';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { invokePixflowTool } from HELPER_URL;
const binding = BINDING;
const workspace = WORKSPACE;
const pending = new Map();
const stopped = new AbortController();
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const schema = properties => ({type:'object',properties,additionalProperties:false});
const tools = workspace ? [
 {name:'pixflow_builder_destinations',description:'Find pages and available editors in the connected WordPress site.',inputSchema:schema({builder:{type:'string'},search:{type:'string'}})},
 {name:'pixflow_builder_handoff',description:'Open an existing page or create a draft in a builder. If interrupted, check handoff status before retrying.',inputSchema:{...schema({action:{type:'string',enum:['open','create']},builder:{type:'string'},postId:{type:'integer'},title:{type:'string'},brief:{type:'string'},assets:{type:'array',items:{type:'object'}}}),required:['action','builder']}},
 {name:'pixflow_builder_handoff_status',description:'Read the current request handoff receipt without repeating the write.',inputSchema:schema({})}
] : [
 {name:'pixflow_tools',description:'Discover the connected site tools. Use tools to get several named schemas in one request, or tool for just one. Discovery never executes a named tool.',inputSchema:schema({tool:{type:'string'},tools:{type:'array',items:{type:'string'},minItems:1,maxItems:12}})},
 {name:'pixflow_call',description:'Call an existing Pixflow site tool. For large inputs write a run-local JSON argument file or, for a script tool, a run-local code file. Current WordPress permissions apply. Inspect uncertain results before retrying writes.',inputSchema:{...schema({tool:{type:'string'},arguments:{type:'object'},argumentFile:{type:'string',description:'JSON filename or absolute path inside this run instead of inline arguments'},codeFile:{type:'string',description:'JS or PHP filename or absolute path inside this run for a script tool'}}),required:['tool']}}
];
function reply(id,result,error) {
 if(stopped.signal.aborted)return;
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,...(error?{error}:{result})})+'\\n');
}
function failed(text) {return {isError:true,content:[{type:'text',text}]};}
async function readRunFile(filename, extensions) {
 const name=typeof filename==='string'?path.basename(filename):'';
 if (!/^[a-z0-9][a-z0-9_.-]{0,160}$/i.test(name)
     || !extensions.includes(path.extname(name).toLowerCase())
     || ['site-connection.json','connection.json','external-mcp.json','pixflow-mcp-config.json'].includes(name.toLowerCase())) {
  throw new Error('Provide a run-local filename with the expected extension.');
 }
 const runDirectory=path.dirname(fileURLToPath(import.meta.url));
 const directory=await realpath(runDirectory);
 if(filename!==name && (!path.isAbsolute(filename) ||
   (path.relative(runDirectory,filename)!==name && path.relative(directory,filename)!==name))) throw new Error('The file is outside this run.');
 const file = await realpath(path.join(directory, name));
 if (path.dirname(file) !== directory) throw new Error('The file is outside this run.');
 const info = await stat(file);
 if (!info.isFile() || info.size > 1_048_576) throw new Error('The run input must be a regular file of at most 1 MiB.');
 return readFile(file, 'utf8');
}
async function siteArguments(args) {
 if (args.argumentFile !== undefined && args.arguments !== undefined) throw new Error('Provide either arguments or argumentFile.');
 const inputs = args.argumentFile !== undefined
  ? JSON.parse(await readRunFile(args.argumentFile, ['.json']))
  : args.arguments ?? {};
 if (!object(inputs)) throw new Error('Arguments must be a JSON object.');
 const scriptExtension = args.tool==='wordpress.run' ? '.php' :
  ['bricks.run','etch.run','elementor.run'].includes(args.tool) ? '.js' : undefined;
 if (args.codeFile === undefined && (!scriptExtension || !Object.hasOwn(inputs, 'codeFile'))) return inputs;
 const {codeFile, ...nativeArguments} = inputs;
 if (!scriptExtension || Object.hasOwn(inputs, 'code') || args.codeFile!==undefined && codeFile!==undefined) throw new Error('Provide one codeFile for a script tool without inline code.');
 return {...nativeArguments,code:await readRunFile(args.codeFile ?? codeFile,scriptExtension==='.js'?['.js','.mjs']:['.php'])};
}
const isToolName = value => typeof value==='string' && /^[a-z][a-z0-9_.-]{0,127}$/i.test(value);
const isAbilityName = value => typeof value==='string' && value.length<=128 && /^[a-z][a-z0-9_-]*[/][a-z][a-z0-9_-]*$/i.test(value);
const abilityHint = 'Only invoke names returned under abilities. Use pixflow_call with tool: "ability.call" and name and input inside arguments. An unavailable name may belong to a different MCP server. For native Bricks operations and guidance use the bricks.* tools and skills.read.';
function selectSchemas(catalogue,names,single) {
 if(!names || catalogue?.ok===false) return catalogue;
 const schemas={...catalogue.tools,...catalogue.localTools};
 if(single && Object.hasOwn(schemas,single))return {ok:true,tool:single,arguments:schemas[single]};
 const available=names.filter(name=>Object.hasOwn(schemas,name));
 return {ok:true,tools:Object.fromEntries(available.map(name=>[name,schemas[name]])),unavailable:names.filter(name=>!Object.hasOwn(schemas,name))};
}
async function handle(q) {
 if(q.method==='notifications/cancelled'){pending.get(q.params?.requestId)?.abort();return;}
 if(q.id===undefined)return;
 if(q.method==='initialize')return reply(q.id,{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'pixflow-site-tools',version:'1.0.0'}});
 if(q.method==='ping')return reply(q.id,{});
 if(q.method==='tools/list')return reply(q.id,{tools});
 if(q.method!=='tools/call')return reply(q.id,undefined,{code:-32601,message:'Unknown method'});
 if(pending.has(q.id))return reply(q.id,undefined,{code:-32600,message:'Duplicate active request ID'});
 let name=q.params?.name, args=q.params?.arguments ?? {};
 if(!workspace && name==='pixflow_call' && object(args) && args.tool==='pixflow_tools') {
  if(Object.keys(args).some(key=>key!=='tool'&&key!=='arguments'))return reply(q.id,failed('Use discovery arguments to look up schemas. No operation was dispatched.'));
  name='pixflow_tools';
  args=args.arguments===undefined?{}:args.arguments;
 }
 const definition=tools.find(tool=>tool.name===name);
 if(!definition || !object(args) || Object.keys(args).some(key=>!Object.hasOwn(definition.inputSchema.properties,key)))return reply(q.id,failed('Unknown tool or invalid arguments. No operation was dispatched.'));
 if(!workspace && name==='pixflow_call' && isAbilityName(args.tool)) {
  if(args.tool.startsWith('bricks/'))return reply(q.id,failed('Call pixflow_call with tool "bricks.native" and arguments {name: "'+args.tool+'", input: {...}}. Live writes also require the canvas ID and revision. No operation was dispatched.'));
  return reply(q.id,failed('Look up this name with pixflow_tools first. '+abilityHint+' No operation was dispatched.'));
 }
 if(!workspace && (name==='pixflow_call' && args.arguments!==undefined && !object(args.arguments) || args.tool!==undefined && !isToolName(args.tool) && !isAbilityName(args.tool) || name==='pixflow_call' && !args.tool))return reply(q.id,failed('Provide a tool name and an arguments object. No operation was dispatched.'));
 if(!workspace && name==='pixflow_call' && args.tool==='bricks.native'
     && args.argumentFile===undefined && args.codeFile===undefined
     && args.arguments?.tool===args.tool && object(args.arguments.arguments)
     && Object.keys(args.arguments).every(key=>key==='tool'||key==='arguments')) {
  // Providers may repeat the same call envelope. Forward only the inner ability arguments.
  args={...args,arguments:args.arguments.arguments};
 }
 if(args.tools!==undefined && (args.tool!==undefined || !Array.isArray(args.tools) || args.tools.length<1 || args.tools.length>12 || !args.tools.every(name=>isToolName(name)||isAbilityName(name))))return reply(q.id,failed('Provide one tool name or an array of 1–12 names. No operation was dispatched.'));
 const names=args.tools ? [...new Set(args.tools)] : args.tool ? [args.tool] : undefined;
 const abilityNames=names?.filter(isAbilityName)??[];
 const catalogueNames=names?.filter(isToolName);
 const controller=new AbortController();pending.set(q.id,controller);
 try {
  let argv;
  try {
   argv=workspace ? [name.replace('pixflow_builder_','builder.').replace('handoff_status','handoff.status'),JSON.stringify(args)]
    : name==='pixflow_tools' ? ['help'] : [args.tool,JSON.stringify(await siteArguments(args))];
  } catch (error) {
   const detail=error?.code==='ENOENT'
    ? 'The run input file does not exist. Write the file and wait for the write to finish before calling the tool.'
    : 'Could not read the run input. Check its filename, format and size.';
   return reply(q.id,failed(detail+' No operation was dispatched.'));
  }
  const signal=AbortSignal.any([stopped.signal,controller.signal]);
  const invoke=argv=>invokePixflowTool(argv,signal,binding);
  let result;
  if(name==='pixflow_tools') {
   const [catalogue, native] = await Promise.all([
    !names || catalogueNames.length ? invoke(argv) : {ok:true},
    abilityNames.length ? invoke(['abilities.list',JSON.stringify({names:abilityNames})]) : null,
   ]);
   result=selectSchemas(catalogue,catalogueNames,args.tool);
   if(native?.ok===false)result=native;
   else if(native && result?.ok!==false) {
    const abilities=(native.abilities??[]).filter(ability=>abilityNames.includes(ability.name));
    const unavailableAbilities=abilityNames.filter(name=>!abilities.some(ability=>ability.name===name));
    result={...result,abilities,unavailableAbilities,hint:abilityHint};
   }
  } else {
   result=await invoke(argv);
  }
  // Keep the actual reference bytes available to the provider through file
  // reads; large duplicate inline Markdown can hide the later tool receipt.
  if (!workspace && name==='pixflow_call' && args.tool==='skills.read' &&
      Array.isArray(result?.references) && Array.isArray(result?.skillFiles)) {
   const paths = new Map(result.skillFiles.map(file => [file.path, file.localPath]));
    // Allow room for the provider's outer tool receipt within a 10 KiB display limit.
    if (Buffer.byteLength(JSON.stringify(result)) > 8_000) {
    result.references = result.references.map(reference => {
     const localPath = paths.get(reference?.path);
     if (!localPath) return reference;
     const { content, ...info } = reference;
     return { ...info, localPath };
    });
    result.hint = 'Read each localPath for the complete Markdown. The reference path is a site catalogue identifier, not a local path. Reuse these files for this run.';
   }
  }
  const text=JSON.stringify(result);
  reply(q.id,text.length>3000000?failed('The result is too large to display. The operation was dispatched: inspect its status and request a narrower read; do not repeat the write.'): {isError:result?.ok===false,content:[{type:'text',text}]});
 } catch {
  reply(q.id,failed('The tool session ended or the operation could not be confirmed. Inspect the latest site state and operation receipt before retrying; do not replay the write through the helper.'));
 } finally {pending.delete(q.id);}
}
let bytes=0;
const input=createInterface({input:process.stdin,crlfDelay:Infinity});
process.stdin.on('data',chunk=>{bytes+=chunk.length;if(bytes>4000000){stopped.abort();input.close();process.stdin.destroy();}});
input.on('line',line=>{bytes=0;if(Buffer.byteLength(line)>3000000)return reply(null,undefined,{code:-32600,message:'Request too large'});try{const q=JSON.parse(line);if(object(q))void handle(q).catch(()=>reply(q.id,undefined,{code:-32603,message:'Tool request failed'}));}catch{reply(null,undefined,{code:-32700,message:'Invalid JSON'});}});
input.on('close',()=>{stopped.abort();for(const controller of pending.values())controller.abort();});
`;

/** The immutable fingerprint prevents a surviving MCP child from borrowing the
 * next turn's credentials when a retained workspace renews its connection. */
export async function stagePixflowMcp(helper: string, scope: 'workspace' | 'site') {
  const connection = path.join(path.dirname(helper), scope === 'site' ? 'site-connection.json' : 'connection.json');
  const value = JSON.parse(await readFile(connection, 'utf8'));
  const binding = createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const file = path.join(path.dirname(helper), 'pixflow-tools-' + binding.slice(0,16) + '.mjs');
  const source = PIXFLOW_MCP_SOURCE.replace('HELPER_URL',JSON.stringify(pathToFileURL(helper).href))
    .replace('BINDING',JSON.stringify(binding)).replace('WORKSPACE',JSON.stringify(scope==='workspace'));
  await writeFile(file,source,{mode:0o600});
  return {server:{command:process.execPath,args:[file]} satisfies PixflowMcpCommand,cleanup:()=>rm(file,{force:true})};
}
