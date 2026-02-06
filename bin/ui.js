const chalk = require('chalk');
const gradient = require('gradient-string');
const boxen = require('boxen');

const BANNER = `    _                    _      ____                            _
   / \\   __ _  ___ _ __ | |_   / ___|___  _ __  _ __   ___  ___| |_
  / _ \\ / _\` |/ _ \\ '_ \\| __| | |   / _ \\| '_ \\| '_ \\ / _ \\/ __| __|
 / ___ \\ (_| |  __/ | | | |_  | |__| (_) | | | | | | |  __/ (__| |_
/_/   \\_\\__, |\\___|_| |_|\\__|  \\____\\___/|_| |_|_| |_|\\___|\\___|\\___|
        |___/`;

const acGradient = gradient(['#00d2ff', '#7b2ff7']);

function printBanner() {
  const pkg = require('../package.json');
  console.log();
  console.log(acGradient(BANNER));
  console.log(chalk.dim(`        ${' '.repeat(52)}v${pkg.version}`));
  console.log();
}

function printStatus(label, detail, ok = true) {
  const icon = ok ? chalk.green('✓') : chalk.red('✗');
  const styledLabel = chalk.bold.cyan(label);
  const styledDetail = detail ? chalk.dim(` ${detail}`) : '';
  console.log(`  ${icon} ${styledLabel}${styledDetail}`);
}

function printWarning(label, detail) {
  const icon = chalk.yellow('!');
  const styledLabel = chalk.bold.yellow(label);
  const styledDetail = detail ? chalk.dim(` ${detail}`) : '';
  console.log(`  ${icon} ${styledLabel}${styledDetail}`);
}

function printSection(title) {
  console.log();
  console.log(`  ${chalk.bold.cyan(title)}`);
}

function printError(msg) {
  console.log(`  ${chalk.red('✗')} ${chalk.red(msg)}`);
}

function printUrls(frontendUrl, apiUrl, internalInfo) {
  let content = chalk.bold.cyan(frontendUrl);
  if (internalInfo?.frontend) {
    content += chalk.dim(`\n  internal: localhost:${internalInfo.frontend}`);
  }
  content += '\n';
  content += chalk.dim(`API  `) + chalk.white(apiUrl);
  if (internalInfo?.api) {
    content += chalk.dim(`\n  internal: localhost:${internalInfo.api}`);
  }

  const box = boxen(content, {
    padding: { top: 0, bottom: 0, left: 2, right: 2 },
    margin: { top: 0, bottom: 0, left: 1, right: 0 },
    borderColor: 'cyan',
    borderStyle: 'round',
  });

  console.log(box);
}

function printReady() {
  console.log();
  console.log(`  ${chalk.bold.green('Ready!')}`);
  console.log();
}

function printShutdown(signal) {
  console.log();
  console.log(`  ${chalk.yellow('↓')} ${chalk.bold.yellow('Shutting down')} ${chalk.dim(`(${signal})`)}`);
}

module.exports = {
  printBanner,
  printStatus,
  printWarning,
  printSection,
  printError,
  printUrls,
  printReady,
  printShutdown,
};
