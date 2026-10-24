import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${d}/${e.name}`):[`${d}/${e.name}`]);
export function frontendSourceHash() {
  const hash=createHash('sha256');
  // Line endings are normalised so a CRLF checkout (Windows) hashes like the LF one CI and Docker see.
  for(const file of [...['app','components','lib'].flatMap(walk).filter(f=>/\.(ts|tsx)$/.test(f)), 'prisma/schema.prisma'].sort()) hash.update(file).update(readFileSync(file,'utf8').replace(/\r\n/g,'\n'));
  return hash.digest('hex');
}
