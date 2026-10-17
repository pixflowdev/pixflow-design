import {describe, expect, it} from 'vitest';
import {readLockedSkills} from '../src/pixflow/locked-skills';
import {mergeWpAdminSkillCatalogues} from '../src/pixflow/wp-admin-gutenberg-skill-router';

describe('Pro skill discovery', () => {
  it('keeps locked instructions out of the executable catalogue and menu metadata', () => {
    const payload = {skills: [{id: 'wordpress-content', name: 'WordPress'}], lockedSkills: [{id: 'gsap-core', name: 'GSAP Core', description: 'Motion', requiresPro: true, body: 'secret', instruction: 'secret'}]};
    expect(readLockedSkills(payload)).toEqual([{id:'gsap-core',name:'GSAP Core',description:'Motion',requiresPro:true}]);
    expect(mergeWpAdminSkillCatalogues({},payload).skills.map(s=>s.id)).toEqual(['wordpress-content']);
  });
  it('rejects malformed rows and duplicates without inventing access', () => {
    expect(readLockedSkills({lockedSkills:[null,{id:'../x',requiresPro:true},{id:'free'},{id:'motion',requiresPro:true},{id:'motion',requiresPro:true}]})).toEqual([{id:'motion',name:'motion',description:'',requiresPro:true}]);
    expect(readLockedSkills(null)).toEqual([]);
  });
});
