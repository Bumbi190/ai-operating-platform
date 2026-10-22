export default {
 root:'/workspace/repo/apps/web',
 cacheDir:'/tmp/omnira-vite-cache',
 resolve:{alias:{'@':'/workspace/repo/apps/web','server-only':'/workspace/repo/apps/web/lib/qa/__stubs__/server-only.ts'}},
 css:{postcss:{}},
 test:{environment:'node',include:['lib/qa/sdf1a-code-work-contracts.test.ts'],pool:'forks',maxWorkers:1,minWorkers:1,cache:false,watch:false,passWithNoTests:false}
}
