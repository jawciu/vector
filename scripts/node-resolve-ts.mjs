// node-resolve-ts.mjs — lets plain node import the generated Prisma client
// through its extensionless specifier ("../lib/generated/prisma/client") by
// retrying with ".ts". Used by demo-pair-dryrun.mjs. Load with `--import`.
import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, next) {
    try { return next(specifier, context); }
    catch (e) {
      if (e?.code === "ERR_MODULE_NOT_FOUND" && (specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-z]+$/.test(specifier)) {
        return next(`${specifier}.ts`, context);
      }
      throw e;
    }
  },
});
