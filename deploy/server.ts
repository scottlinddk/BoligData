import { createApplication } from "./http.mjs";
import { resolve } from "node:path";
import handler0 from "../apps/web/api/account.js";
import handler1 from "../apps/web/api/admin.js";
import handler2 from "../apps/web/api/advisor/[...path].js";
import handler3 from "../apps/web/api/favorites.js";
import handler4 from "../apps/web/api/listings/[id]/[action].js";
import handler5 from "../apps/web/api/notifications.js";
import handler6 from "../apps/web/api/notify.js";
import handler7 from "../apps/web/api/properties.js";
import handler8 from "../apps/web/api/property-lookup.js";
import handler9 from "../apps/web/api/recommendations.js";
import handler10 from "../apps/web/api/searches.js";
const server = createApplication({dist:resolve("apps/web/dist"),routes:[
{pattern:new RegExp("^/api/account/?$"),handler:handler0},
{pattern:new RegExp("^/api/admin/?$"),handler:handler1},
{pattern:/^\/api\/advisor\/(.+?)\/?$/,params:m=>({path:m[1].split("/")}),handler:handler2},
{pattern:new RegExp("^/api/favorites/?$"),handler:handler3},
{pattern:/^\/api\/listings\/([^/]+)\/([^/]+)\/?$/,params:m=>({id:m[1],action:m[2]}),handler:handler4},
{pattern:new RegExp("^/api/notifications/?$"),handler:handler5},
{pattern:new RegExp("^/api/notify/?$"),handler:handler6},
{pattern:new RegExp("^/api/properties/?$"),handler:handler7},
{pattern:new RegExp("^/api/property-lookup/?$"),handler:handler8},
{pattern:new RegExp("^/api/recommendations/?$"),handler:handler9},
{pattern:new RegExp("^/api/searches/?$"),handler:handler10}
]});
const port=Number(process.env.PORT || 3000);
server.listen(port,"0.0.0.0",()=>console.log("BoligData listening on "+port));
for (const signal of ["SIGINT","SIGTERM"]) process.on(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();});
