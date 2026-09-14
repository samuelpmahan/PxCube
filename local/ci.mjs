// Uses exactly the local packaging program; only the final artifact location differs.
import fs from 'node:fs';
import path from 'node:path';
import { build, root } from './run.mjs';
const result = await build(root);
fs.rmSync(path.join(root,'dist'), {recursive:true,force:true});
fs.cpSync(result.site, path.join(root,'dist'), {recursive:true});
const failures=result.report.results.filter(app=>!app.ok);
if(process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`PxCube attempt: ${result.report.runId}\n\n${result.report.results.map(app=>`- ${app.id}: ${app.ok?'packaged':'FAILED'}${app.drift?' · registration drift':''}`).join('\n')}\n`);
if(failures.length) process.exitCode=1; // Keep the run red while publishing healthy siblings.
