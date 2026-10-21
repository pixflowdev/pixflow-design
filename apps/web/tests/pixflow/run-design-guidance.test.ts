import { expect, it } from 'vitest';
import { withRunDesignGuidance } from '../../src/pixflow/run-design-guidance';
it('replaces stale defaults without leaking optional engine instructions into the context', () => {
 const context={siteDesignGuidance:{old:true}, selectedSkills:['personal-example'], liveBuilderContext:{keep:true}};
 const session={designGuidance:{revision:2,source:'custom',product:'Keep facts',design:'Keep styles',instructions:'Selected source',extension:{instructions:'OPTIONAL ENGINE',commands:{}}}} as any;
 const result=withRunDesignGuidance(context,session);
 expect(result).toEqual({...context,siteDesignGuidance:{revision:2,source:'custom',product:'Keep facts',design:'Keep styles',instructions:'Selected source'}});
 expect(JSON.stringify(result)).not.toContain('OPTIONAL ENGINE');
 expect(withRunDesignGuidance(context,{} as any)).toEqual({selectedSkills:['personal-example'],liveBuilderContext:{keep:true}});
 expect(session.designGuidance.extension.instructions).toBe('OPTIONAL ENGINE');
});
