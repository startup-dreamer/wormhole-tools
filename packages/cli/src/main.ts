import { Command } from 'commander';
import { registerParseCommand } from './commands/parse.js';
import { registerInfoCommand } from './commands/info.js';
import { registerGenerateCommand } from './commands/generate.js';
import { registerStatusCommand } from './commands/status.js';
import { registerLatencyCommand } from './commands/latency.js';
import { registerDeployCommand } from './commands/deploy.js';
import { registerTransferCommand } from './commands/transfer.js';
import { registerTokensCommand } from './commands/tokens.js';
import { registerSubmitCommand } from './commands/submit.js';
import { registerRedeemCommand } from './commands/redeem.js';
import { registerEvmCommand } from './commands/evm.js';
import { registerSolanaCommand } from './commands/solana.js';
import { registerAptosCommand } from './commands/aptos.js';
import { registerNearCommand } from './commands/near.js';
import { registerSuiCommand } from './commands/sui.js';
import { registerCompletionCommand } from './commands/completion.js';
import { registerContractsCommand } from './commands/contracts.js';
import { registerDoctorCommand } from './commands/doctor.js';
import { printError } from './output.js';

const program = new Command();

program
  .name('wormcraft')
  .description('CLI for Wormhole cross-chain protocol interactions')
  .version('0.0.1');

registerParseCommand(program);
registerInfoCommand(program);
registerGenerateCommand(program);
registerStatusCommand(program);
registerLatencyCommand(program);
registerDeployCommand(program);
registerTransferCommand(program);
registerTokensCommand(program);
registerSubmitCommand(program);
registerRedeemCommand(program);
registerEvmCommand(program);
registerSolanaCommand(program);
registerAptosCommand(program);
registerNearCommand(program);
registerSuiCommand(program);
registerCompletionCommand(program);
registerContractsCommand(program);
registerDoctorCommand(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  printError('Unexpected error', err);
  process.exit(1);
});
