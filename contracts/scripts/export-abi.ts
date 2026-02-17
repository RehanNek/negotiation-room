import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const artifactPath = path.join(root, 'artifacts', 'contracts', 'EscrowVault.sol', 'EscrowVault.json');
const outPath = path.join(root, 'abi', 'EscrowVault.json');

function main() {
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found: ${artifactPath}. Run \"npm run build\" first.`);
  }

  const artifactRaw = fs.readFileSync(artifactPath, 'utf8');
  const artifact = JSON.parse(artifactRaw) as { abi: unknown };
  if (!artifact.abi) {
    throw new Error('ABI missing in artifact.');
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(artifact.abi, null, 2)}\n`);
  console.log(`Exported ABI to ${outPath}`);
}

main();
