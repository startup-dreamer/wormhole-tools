import type { Command } from 'commander';
import { printError } from '../output.js';

export function registerCompletionCommand(program: Command): void {
  program
    .command('completion')
    .description('Print shell completion setup instructions')
    .option('--shell <shell>', 'Shell type: bash, zsh, fish', 'bash')
    .action((opts: { shell: string }) => {
      const name = 'wormcraft';
      switch (opts.shell) {
        case 'bash':
          console.log(`# Add to ~/.bashrc:\n# eval "$(${name} completion --shell bash)"\n_${name}_completions() { COMPREPLY=($(compgen -W "$(${name} --help 2>/dev/null | grep -oP '^  \\K\\S+')" -- "\${COMP_WORDS[COMP_CWORD]}")); }\ncomplete -F _${name}_completions ${name}`);
          break;
        case 'zsh':
          console.log(`# Add to ~/.zshrc:\n# eval "$(${name} completion --shell zsh)"\ncompdef _${name} ${name}\n_${name}() { local -a cmds; cmds=(parse info generate status latency deploy transfer tokens submit redeem evm solana aptos near sui completion); _describe 'command' cmds }`);
          break;
        case 'fish':
          console.log(`# Add to ~/.config/fish/config.fish:\n# ${name} completion --shell fish | source\ncomplete -c ${name} -f -a "(${name} --help 2>/dev/null | grep -oP '^  \\K\\S+')"`);
          break;
        default:
          printError(`Unknown shell: ${opts.shell}. Supported: bash, zsh, fish`);
          process.exit(1);
      }
    });
}
