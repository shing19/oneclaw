#!/usr/bin/env node

import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command, Option } from "commander";

export type CliLocale = "zh-CN" | "en";

export interface CliGlobalOptions {
  json: boolean;
  quiet: boolean;
  locale: CliLocale;
}

const DEFAULT_CLI_LOCALE: CliLocale = "zh-CN";

export function createCliProgram(): Command {
  const program = new Command();

  program
    .name("oneclaw")
    .description("OneClaw CLI / OneClaw 命令行工具")
    .version("0.1.0")
    .showHelpAfterError(
      `Run "${basename(process.argv[1] ?? "oneclaw")} --help" for usage / 使用 --help 查看帮助`,
    );

  program.addOption(
    new Option("--json", "Output machine-readable JSON / 输出机器可读 JSON").default(false),
  );
  program.addOption(
    new Option(
      "--quiet",
      "Suppress non-essential output / 仅输出必要信息",
    ).default(false),
  );
  program.addOption(
    new Option("--locale <locale>", "CLI language: zh-CN|en / CLI 语言: zh-CN|en")
      .choices(["zh-CN", "en"])
      .default(DEFAULT_CLI_LOCALE),
  );

  return program;
}

export function resolveCliGlobalOptions(command: Command): CliGlobalOptions {
  const options = command.opts<{ json?: boolean; quiet?: boolean; locale?: CliLocale }>();

  return {
    json: options.json ?? false,
    quiet: options.quiet ?? false,
    locale: options.locale ?? DEFAULT_CLI_LOCALE,
  };
}

export async function runCli(argv: readonly string[] = process.argv): Promise<void> {
  const program = createCliProgram();
  await program.parseAsync(argv);
}

function isDirectExecution(argv: readonly string[] = process.argv): boolean {
  const entryPath = argv[1];
  if (typeof entryPath !== "string" || entryPath.length === 0) {
    return false;
  }

  const currentFilePath = fileURLToPath(import.meta.url);
  return resolve(entryPath) === resolve(currentFilePath);
}

if (isDirectExecution()) {
  await runCli();
}
