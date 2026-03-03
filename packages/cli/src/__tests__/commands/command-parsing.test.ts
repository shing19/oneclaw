import assert from "node:assert/strict";

import type { Command } from "commander";
import { describe, it } from "vitest";

import { createCliProgram, resolveCliGlobalOptions } from "../../index.js";

describe("cli command parsing", () => {
  it("registers global options and top-level commands", () => {
    const program = createCliProgram();

    assert.deepEqual(getOptionLongFlags(program), ["--json", "--quiet", "--locale"]);

    const names = program.commands.map((command) => command.name());
    assert.ok(names.includes("init"));
    assert.ok(names.includes("start"));
    assert.ok(names.includes("stop"));
    assert.ok(names.includes("status"));
    assert.ok(names.includes("config"));
    assert.ok(names.includes("model"));
    assert.ok(names.includes("cost"));
    assert.ok(names.includes("doctor"));
    assert.ok(names.includes("__run-agent-daemon"));
  });

  it("resolves default global options", () => {
    const program = createCliProgram();
    program.parse(["node", "oneclaw"]);

    assert.deepEqual(resolveCliGlobalOptions(program), {
      json: false,
      quiet: false,
      locale: "zh-CN",
    });
  });

  it("parses explicit global options", () => {
    const program = createCliProgram();
    program.parse(["node", "oneclaw", "--json", "--quiet", "--locale", "en"]);

    assert.deepEqual(resolveCliGlobalOptions(program), {
      json: true,
      quiet: true,
      locale: "en",
    });
  });

  it("rejects unsupported locale values", () => {
    const program = createCliProgram();
    program.exitOverride();

    assert.throws(() => {
      program.parse(["node", "oneclaw", "--locale", "fr"]);
    });
  });

  it("registers expected subcommands and command options", () => {
    const program = createCliProgram();

    const config = mustFindCommand(program, "config");
    assert.deepEqual(
      config.commands.map((command) => command.name()),
      ["show", "set", "validate", "backup", "rollback"],
    );

    const model = mustFindCommand(program, "model");
    assert.deepEqual(
      model.commands.map((command) => command.name()),
      ["list", "test", "priority"],
    );

    const cost = mustFindCommand(program, "cost");
    assert.deepEqual(
      cost.commands.map((command) => command.name()),
      ["history", "export"],
    );

    const start = mustFindCommand(program, "start");
    assert.deepEqual(getOptionLongFlags(start), ["--daemon", "--openclaw-bin"]);

    const stop = mustFindCommand(program, "stop");
    assert.deepEqual(getOptionLongFlags(stop), ["--force"]);

    const doctor = mustFindCommand(program, "doctor");
    assert.deepEqual(getOptionLongFlags(doctor), ["--skip-network", "--timeout-ms"]);
  });
});

function mustFindCommand(program: Command, name: string): Command {
  const found = program.commands.find((command) => command.name() === name);
  assert.ok(found, `Expected command \"${name}\" to be registered.`);
  return found;
}

function getOptionLongFlags(command: Command): string[] {
  return command.options.map((option) => option.long);
}
