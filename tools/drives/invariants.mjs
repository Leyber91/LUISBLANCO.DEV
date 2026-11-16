/* tools/drives/invariants.mjs: the rules moved to tools/invariants.mjs, where tools/mutate.mjs can break them in a
   copy (it copies only the files of tools/). This re-export keeps a drive written against the old path working, as
   tools/drives/air.mjs on the branch of pull request 41 is. New drives import from '../invariants.mjs'. */
export * from '../invariants.mjs';
