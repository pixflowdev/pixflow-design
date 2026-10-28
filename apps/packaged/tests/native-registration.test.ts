import {describe,it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({access:vi.fn(),execFile:vi.fn()}));
vi.mock('node:fs/promises',()=>({access:mocks.access}));vi.mock('node:child_process',()=>({execFile:mocks.execFile}));
import {registerPackagedNativeHost} from '../src/native-registration.js';
beforeEach(()=>{vi.resetAllMocks();mocks.access.mockResolvedValue(undefined);mocks.execFile.mockImplementation((_exe,_args,_options,callback)=>callback(null));});
describe('optional native registration',()=>{
 it('registers macOS/Linux installed payload with bounded runtime and no shell',async()=>{for(const platform of ['darwin','linux'] as const){expect(await registerPackagedNativeHost({resourceRoot:'/installed/resources',platform,executable:'/installed/Bridge',electron:true,env:{APPIMAGE:'/home/user/Bridge.AppImage'}})).toBe('registered');expect(mocks.execFile).toHaveBeenLastCalledWith('/installed/Bridge',[expect.stringContaining('install.mjs'),'install'],expect.objectContaining({timeout:10000,env:{APPIMAGE:'/home/user/Bridge.AppImage',ELECTRON_RUN_AS_NODE:'1'}}),expect.any(Function));}});
 it('does not register Windows or packages without optional payload',async()=>{expect(await registerPackagedNativeHost({resourceRoot:'/r',platform:'win32'})).toBe('skipped');mocks.access.mockRejectedValue({code:'ENOENT'});expect(await registerPackagedNativeHost({resourceRoot:'/r',platform:'linux'})).toBe('skipped');expect(mocks.execFile).not.toHaveBeenCalled();});
 it('registration failure leaves direct startup available',async()=>{mocks.execFile.mockImplementation((_a,_b,_c,cb)=>cb(new Error('failed')));expect(await registerPackagedNativeHost({resourceRoot:'/r',platform:'darwin'})).toBe('unavailable');});
 it('headless Node does not inherit Electron Node mode',async()=>{await registerPackagedNativeHost({resourceRoot:'/r',platform:'linux',electron:false,env:{ELECTRON_RUN_AS_NODE:'1'}});expect(mocks.execFile.mock.calls[0][2].env).toEqual({});});
});
