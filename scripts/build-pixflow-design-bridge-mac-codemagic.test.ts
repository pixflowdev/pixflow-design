import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
test('retired cloud entry point fails without starting a build',()=>{
  const result=spawnSync('php',['scripts/build-pixflow-design-bridge-mac-codemagic.php'],{encoding:'utf8',windowsHide:true});
  assert.equal(result.status,1);
  assert.match(result.stderr,/Codemagic builds are retired/);
});
test('Windows Mac wrapper requires explicit local artifacts', {skip:process.platform!=='win32'},()=>{
  const env={...process.env}; delete env.PIXFLOW_DESIGN_MAC_ARM64_DMG; delete env.PIXFLOW_DESIGN_MAC_X64_DMG;
  const result=spawnSync('php',['build-bridge-mac.php'],{encoding:'utf8',env,windowsHide:true});
  assert.equal(result.status,1);
  assert.match(result.stderr,/pass --arm64/);
});
