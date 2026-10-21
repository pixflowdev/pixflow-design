/** Keep complete tool data available without repeatedly copying it into model history. */
export class SiteResultStore {
  private readonly values = new Map<string, unknown>();
  constructor(private readonly pageSize = 12000) {}
  snapshot(): Array<[string, unknown]> { return [...this.values]; }
  restore(values: Array<[string, unknown]>): void { this.values.clear(); for(const [key,value] of values)this.values.set(key,value); }

  private readPaths(resultId: string, value: unknown) {
    return value && typeof value === 'object'
      ? Object.keys(value).slice(0, 80).map(key => ({resultId, path:[Array.isArray(value) ? Number(key) : key]})) : [];
  }

  private structure(value: unknown, depth = 0): unknown {
    if (Array.isArray(value)) return {type:'array',length:value.length,...(value.length && depth < 2 ? {item:this.structure(value[0],depth+1)} : {})};
    if (value && typeof value === 'object') return depth < 2
      ? Object.fromEntries(Object.entries(value).slice(0,80).map(([key,item])=>[key,this.structure(item,depth+1)]))
      : {type:'object',keys:Object.keys(value).slice(0,80)};
    return {type:value===null?'null':typeof value,...(typeof value==='string'?{characters:value.length}:{})};
  }

  present(value: unknown): unknown {
    const text = JSON.stringify(value) ?? 'null';
    if (text.length <= this.pageSize) return value;
    const id = `result-${this.values.size + 1}`;
    this.values.set(id, value);
    return {
      resultId: id, characters: text.length,
      keys: value && typeof value === 'object' ? Object.keys(value).slice(0, 80) : [],
      // Requests are relative to this stored value, not the message wrapper
      // where its receipt happens to appear (for example initial context).
      readPaths: this.readPaths(id, value),
      structure: this.structure(value),
      preview: text.slice(0, this.pageSize),
      read: 'Complete data is retained. Call result.read with a readPaths request or resultId and optional path/offset. Paths start at this stored value: do not prepend the surrounding message field (such as context). Follow the actual keys/structure; nextOffset pages the selected value.',
    };
  }

  /** A receipt ledger already has recent excerpts in the continuation note.
   * Retain its full data without copying a second preview into working context.
   */
  reference(value: unknown): unknown {
    const id = `result-${this.values.size + 1}`;
    this.values.set(id, value);
    return {resultId:id, characters:(JSON.stringify(value) ?? 'null').length, structure:this.structure(value), readPaths:this.readPaths(id,value),
      read:'Complete execution receipts are retained. Use a readPaths request to inspect one item. A path traverses nested keys: [0,1] means key 1 inside item 0, never items 0 through 1.'};
  }

  read(args: Record<string, unknown>): unknown {
    const id = String(args.resultId || '');
    if (!this.values.has(id)) throw new Error('Result not found in this run.');
    let value = this.values.get(id);
    if (args.path !== undefined && !Array.isArray(args.path)) throw new Error('path must be an array of keys or indexes.');
    for (const key of (args.path || []) as Array<string | number>) {
      if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, key)) throw new Error(`Result path not found: ${JSON.stringify(key)}. Available keys at this level: ${JSON.stringify(value && typeof value==='object'?Object.keys(value).slice(0,80):[])}.`);
      value = (value as Record<string, unknown>)[key];
    }
    const text = JSON.stringify(value) ?? 'null';
    const offset = Number(args.offset || 0);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('offset must be a nonnegative integer.');
    return {resultId:id,path:args.path || [],structure:this.structure(value),offset,text:text.slice(offset,offset+this.pageSize),nextOffset:offset+this.pageSize<text.length?offset+this.pageSize:null,characters:text.length};
  }
}
