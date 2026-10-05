#13 DONE 0.0s
#14 exporting cache to registry
#14 sending cache export
#14 ...
#15 exporting to image
#15 exporting layers done
#15 pushing layers 0.6s done
#15 DONE 0.7s
#14 exporting cache to registry
#14 sending cache export 1.1s done
#14 DONE 1.2s
==> Deploying...
==> Setting WEB_CONCURRENCY=1 by default, based on available CPUs in the instance
> downly@2.1.0 start
> node server/index.js
file:///app/server/index.js:1
const $ = s => document.querySelector(s);
                        ^
ReferenceError: document is not defined
    at $ (file:///app/server/index.js:1:25)
    at file:///app/server/index.js:2:16
    at ModuleJob.run (node:internal/modules/esm/module_job:343:25)
    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:681:26)
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:117:5)
Node.js v22.23.3
==> Exited with status 1
==> Common ways to troubleshoot your deploy: https://render.com/docs/troubleshooting-deploys
> downly@2.1.0 start
> node server/index.js
file:///app/server/index.js:1
const $ = s => document.querySelector(s);
                        ^
ReferenceError: document is not defined
    at $ (file:///app/server/index.js:1:25)
    at file:///app/server/index.js:2:16
    at ModuleJob.run (node:internal/modules/esm/module_job:343:25)
    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:681:26)
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:117:5)
Node.js v22.23.3
