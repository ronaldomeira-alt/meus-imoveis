import * as fs from 'fs';
import { getAllMatches } from '../src/lib/match/service';

function loadEnvFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const k = trimmed.slice(0, idx).trim();
        const v = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
}

loadEnvFile('.env');

async function main() {
  const matches = await getAllMatches({ status: 'novo', minScore: 50 });
  const t1 = matches.filter((m) => m.lead?.name === 'TESTE 1');
  const t2 = matches.filter((m) => m.lead?.name === 'TESTE 2');

  console.log('Total matches returned:', matches.length);
  console.log('TESTE 1 count:', t1.length);
  console.log('TESTE 1 max score:', Math.max(...t1.map((m) => m.matchScore)));
  const t1BestProp = t1.find((m) => m.matchScore === 100);
  console.log('TESTE 1 100% property:', t1BestProp?.property?.title);

  console.log('TESTE 2 count:', t2.length);
  console.log('TESTE 2 max score:', Math.max(...t2.map((m) => m.matchScore)));
  const t2BestProp = t2.find((m) => m.matchScore === 69);
  console.log('TESTE 2 69% property sample:', t2BestProp?.property?.title);
}

main().catch((err) => {
  console.error('Error running test:', err);
});
